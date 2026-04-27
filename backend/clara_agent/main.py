import asyncio
import json
import os
import re
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi import HTTPException
from fastapi import WebSocket
from fastapi import WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from google.adk.agents import LiveRequestQueue
from google.adk.agents.run_config import RunConfig
from google.adk.agents.run_config import StreamingMode
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.adk.sessions import Session
from google.genai import types
from pydantic import BaseModel
from pydantic import ValidationError

from clara_agent.api import router as api_router
from clara_agent.api import IMAGE_DUMP_DIR
from clara_agent.api import IMAGES_DIR
from clara_agent.db import initialize_database
from clara_agent.monkey_patch import patch_gemini_3_1_support

patch_gemini_3_1_support()

from clara_agent.agent import clara_agent

# Load environment variables
env_path = Path(__file__).parent / ".env"
load_dotenv(env_path)
if os.environ.get("GOOGLE_API_KEY") and not os.environ.get("GEMINI_API_KEY"):
    os.environ["GEMINI_API_KEY"] = os.environ["GOOGLE_API_KEY"]

from clara_agent.text_agent import DEFAULT_TEXT_MODEL_MODE
from clara_agent.text_agent import create_text_assistant_agent
from clara_agent.text_agent import get_text_assistant_modes

APP_NAME = "clara"
TEXT_APP_NAME = "clara_text_assistant"
USER_ID = "anonymous"
session_service = InMemorySessionService()
text_session_services: dict[str, InMemorySessionService] = {}
runner: Runner | None = None
text_runners: dict[str, Runner] = {}
session_resumption_handles: dict[str, str] = {}


class SessionInitMessage(BaseModel):
    type: Literal["session_init"]
    session_id: str | None = None


class ActivityStartMessage(BaseModel):
    type: Literal["activity_start"]


class ActivityEndMessage(BaseModel):
    type: Literal["activity_end"]


class DisconnectMessage(BaseModel):
    type: Literal["disconnect"]


class PttStartMessage(BaseModel):
    type: Literal["ptt_start"]


class PttEndMessage(BaseModel):
    type: Literal["ptt_end"]


class StopSessionMessage(BaseModel):
    type: Literal["stop_session"]


class TextAssistantRequest(BaseModel):
    message: str
    session_id: str | None = None
    mode: str | None = None


ClientMessage = (
    SessionInitMessage
    | ActivityStartMessage
    | ActivityEndMessage
    | DisconnectMessage
    | PttStartMessage
    | PttEndMessage
    | StopSessionMessage
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global runner, text_runners, text_session_services
    initialize_database()
    runner = Runner(
        agent=clara_agent,
        app_name=APP_NAME,
        session_service=session_service,
    )
    text_runners = {}
    text_session_services = {}
    for mode in get_text_assistant_modes():
        if not mode["enabled"]:
            continue
        mode_id = mode["id"]
        mode_session_service = InMemorySessionService()
        text_session_services[mode_id] = mode_session_service
        text_runners[mode_id] = Runner(
            agent=create_text_assistant_agent(mode_id),
            app_name=_text_app_name(mode_id),
            session_service=mode_session_service,
        )
    yield


app = FastAPI(title="Clara API", lifespan=lifespan)
app.include_router(api_router)
IMAGES_DIR.mkdir(parents=True, exist_ok=True)
IMAGE_DUMP_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/media/images", StaticFiles(directory=IMAGES_DIR), name="images")
app.mount(
    "/media/image-dump",
    StaticFiles(directory=IMAGE_DUMP_DIR),
    name="image-dump",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok"}


def _split_thinking_from_text(text: str) -> tuple[str, str]:
    thinking_parts = []

    def collect_thinking(match: re.Match[str]) -> str:
        thinking_parts.append(match.group(1).strip())
        return ""

    final_text = re.sub(
        r"<\|channel\>thought\s*(.*?)<channel\|>",
        collect_thinking,
        text,
        flags=re.IGNORECASE | re.DOTALL,
    )
    final_text = re.sub(
        r"<think(?:ing)?>(.*?)</think(?:ing)?>",
        collect_thinking,
        final_text,
        flags=re.IGNORECASE | re.DOTALL,
    )
    return final_text.strip(), "\n\n".join(part for part in thinking_parts if part)


def _split_streaming_thought_buffer(
    buffer: str,
    flush: bool = False,
) -> tuple[list[tuple[str, str]], str]:
    events: list[tuple[str, str]] = []
    start_tokens = ("<think>", "<thinking>", "<|channel>thought")

    while buffer:
        lower_buffer = buffer.lower()
        starts = [
            index
            for token in start_tokens
            if (index := lower_buffer.find(token)) >= 0
        ]
        if not starts:
            if flush:
                if buffer:
                    events.append(("answer_delta", buffer))
                return events, ""

            keep = min(64, len(buffer))
            emit_length = len(buffer) - keep
            if emit_length > 0:
                events.append(("answer_delta", buffer[:emit_length]))
                buffer = buffer[emit_length:]
            return events, buffer

        start = min(starts)
        if start > 0:
            events.append(("answer_delta", buffer[:start]))
            buffer = buffer[start:]
            lower_buffer = buffer.lower()

        if lower_buffer.startswith("<|channel>thought"):
            open_end = buffer.find("\n")
            if open_end < 0:
                return events, buffer
            close_start = lower_buffer.find("<channel|>", open_end)
            if close_start < 0:
                return events, buffer
            thought = buffer[open_end + 1 : close_start].strip()
            if thought:
                events.append(("thinking_delta", thought))
            buffer = buffer[close_start + len("<channel|>") :]
            continue

        if lower_buffer.startswith("<thinking>"):
            close_token = "</thinking>"
            open_length = len("<thinking>")
        else:
            close_token = "</think>"
            open_length = len("<think>")

        close_start = lower_buffer.find(close_token, open_length)
        if close_start < 0:
            return events, buffer

        thought = buffer[open_length:close_start].strip()
        if thought:
            events.append(("thinking_delta", thought))
        buffer = buffer[close_start + len(close_token) :]

    return events, buffer


def _sse_event(event_type: str, payload: dict[str, object]) -> str:
    return f"event: {event_type}\ndata: {json.dumps(payload)}\n\n"


def _text_app_name(mode: str) -> str:
    return f"{TEXT_APP_NAME}_{mode}"


def _normalize_text_mode(mode: str | None) -> str:
    return mode or DEFAULT_TEXT_MODEL_MODE


def _text_mode_error(mode: str) -> str:
    for candidate in get_text_assistant_modes():
        if candidate["id"] == mode:
            return candidate["reason"] or "Mode is not initialized. Restart the backend."
    return f"Unsupported text assistant mode: {mode}"


def _text_runner_for_mode(mode: str) -> Runner:
    text_runner = text_runners.get(mode)
    if text_runner is None:
        raise HTTPException(status_code=400, detail=_text_mode_error(mode))
    return text_runner


@app.get("/api/text-assistant/modes")
async def get_text_modes() -> dict[str, object]:
    modes = []
    for mode in get_text_assistant_modes():
        mode_id = mode["id"]
        modes.append(
            {
                **mode,
                "enabled": bool(mode["enabled"] and mode_id in text_runners),
                "reason": mode["reason"]
                or ("" if mode_id in text_runners else "Mode is not initialized. Restart the backend."),
            }
        )

    return {
        "defaultMode": DEFAULT_TEXT_MODEL_MODE,
        "modes": modes,
    }


@app.post("/api/text-assistant")
async def post_text_assistant(payload: TextAssistantRequest) -> dict[str, str]:
    mode = _normalize_text_mode(payload.mode)
    text_runner = _text_runner_for_mode(mode)

    message = payload.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="Message is required")

    session_id = payload.session_id or str(uuid.uuid4())
    await _get_or_create_text_session(session_id, mode)

    final_parts: list[str] = []
    thinking_parts: list[str] = []
    async for event in text_runner.run_async(
        user_id=USER_ID,
        session_id=session_id,
        new_message=types.Content(
            role="user",
            parts=[types.Part.from_text(text=message)],
        ),
    ):
        if not event.is_final_response():
            continue
        if not event.content or not event.content.parts:
            continue
        for part in event.content.parts:
            if part.text:
                if getattr(part, "thought", False):
                    thinking_parts.append(part.text)
                else:
                    final_parts.append(part.text)

    answer, tagged_thinking = _split_thinking_from_text("\n".join(final_parts))
    if tagged_thinking:
        thinking_parts.append(tagged_thinking)

    return {
        "sessionId": session_id,
        "mode": mode,
        "answer": answer,
        "thinking": "\n\n".join(part.strip() for part in thinking_parts if part.strip()),
    }


@app.post("/api/text-assistant/stream")
async def stream_text_assistant(payload: TextAssistantRequest) -> StreamingResponse:
    mode = _normalize_text_mode(payload.mode)
    text_runner = _text_runner_for_mode(mode)

    message = payload.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="Message is required")

    session_id = payload.session_id or str(uuid.uuid4())
    await _get_or_create_text_session(session_id, mode)

    async def stream_events():
        yield _sse_event("session", {"sessionId": session_id, "mode": mode})
        visible_text_buffer = ""

        try:
            async for event in text_runner.run_async(
                user_id=USER_ID,
                session_id=session_id,
                new_message=types.Content(
                    role="user",
                    parts=[types.Part.from_text(text=message)],
                ),
                run_config=RunConfig(streaming_mode=StreamingMode.SSE),
            ):
                if not event.content or not event.content.parts:
                    continue

                for part in event.content.parts:
                    if not part.text:
                        continue

                    if getattr(part, "thought", False):
                        yield _sse_event("thinking_delta", {"text": part.text})
                        continue

                    visible_text_buffer += part.text
                    stream_parts, visible_text_buffer = _split_streaming_thought_buffer(
                        visible_text_buffer
                    )
                    for event_type, text in stream_parts:
                        yield _sse_event(event_type, {"text": text})

            stream_parts, visible_text_buffer = _split_streaming_thought_buffer(
                visible_text_buffer,
                flush=True,
            )
            for event_type, text in stream_parts:
                yield _sse_event(event_type, {"text": text})
            yield _sse_event("done", {"sessionId": session_id})
        except Exception as exc:
            error_message = str(exc)
            if mode == "llama31_hf" and ("402" in error_message or "Payment Required" in error_message):
                error_message = "Hugging Face free inference credits appear to be exhausted for this account."
            yield _sse_event("error", {"message": error_message, "mode": mode})

    return StreamingResponse(
        stream_events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


def _parse_client_message(raw_message: str) -> ClientMessage:
    payload = json.loads(raw_message)
    message_type = payload.get("type")

    if message_type == "session_init":
        return SessionInitMessage.model_validate(payload)
    if message_type == "activity_start":
        return ActivityStartMessage.model_validate(payload)
    if message_type == "activity_end":
        return ActivityEndMessage.model_validate(payload)
    if message_type == "disconnect":
        return DisconnectMessage.model_validate(payload)
    if message_type == "ptt_start":
        return PttStartMessage.model_validate(payload)
    if message_type == "ptt_end":
        return PttEndMessage.model_validate(payload)
    if message_type == "stop_session":
        return StopSessionMessage.model_validate(payload)

    raise ValueError(f"Unsupported message type: {message_type!r}")


async def _get_or_create_session(session_id: str) -> Session:
    session = await session_service.get_session(
        app_name=APP_NAME,
        user_id=USER_ID,
        session_id=session_id,
    )
    if session:
        return session

    return await session_service.create_session(
        app_name=APP_NAME,
        user_id=USER_ID,
        session_id=session_id,
    )


async def _get_or_create_text_session(session_id: str, mode: str) -> Session:
    text_session_service = text_session_services.get(mode)
    if text_session_service is None:
        raise HTTPException(status_code=400, detail=_text_mode_error(mode))

    session = await text_session_service.get_session(
        app_name=_text_app_name(mode),
        user_id=USER_ID,
        session_id=session_id,
    )
    if session:
        return session

    return await text_session_service.create_session(
        app_name=_text_app_name(mode),
        user_id=USER_ID,
        session_id=session_id,
    )


def _build_run_config(session_id: str) -> RunConfig:
    return RunConfig(
        response_modalities=[types.Modality.AUDIO],
        input_audio_transcription=types.AudioTranscriptionConfig(),
        output_audio_transcription=types.AudioTranscriptionConfig(),
        realtime_input_config=types.RealtimeInputConfig(
            activity_handling=types.ActivityHandling.START_OF_ACTIVITY_INTERRUPTS,
            automatic_activity_detection=types.AutomaticActivityDetection(
                disabled=True,
                start_of_speech_sensitivity=types.StartSensitivity.START_SENSITIVITY_HIGH,
                end_of_speech_sensitivity=types.EndSensitivity.END_SENSITIVITY_LOW,
                prefix_padding_ms=80,
                silence_duration_ms=300,
            ),
        ),
        context_window_compression=types.ContextWindowCompressionConfig(
            sliding_window=types.SlidingWindow()
        ),
        session_resumption=(
            types.SessionResumptionConfig(
                handle=session_resumption_handles.get(session_id),
            )
            if session_resumption_handles.get(session_id)
            else None
        ),
    )


def _server_message(message_type: str, **payload: object) -> dict[str, object]:
    return {"type": message_type, **payload}


@app.websocket("/live")
async def live(websocket: WebSocket):
    if runner is None:
        await websocket.close(code=1011, reason="Runner is not initialized")
        return

    await websocket.accept()
    send_lock = asyncio.Lock()
    live_request_queue = LiveRequestQueue()

    async def send_json(message: dict[str, object]) -> None:
        async with send_lock:
            await websocket.send_json(message)

    try:
        init_raw = await websocket.receive_text()
        init_message = _parse_client_message(init_raw)
        if not isinstance(init_message, SessionInitMessage):
            raise ValueError("The first websocket message must be session_init.")

        session_id = init_message.session_id or str(uuid.uuid4())
        session = await _get_or_create_session(session_id)

        await send_json(
            _server_message("session_started", session_id=session_id)
        )
        await send_json(_server_message("state", state="idle"))

        async def forward_events() -> None:
            run_config = _build_run_config(session_id)

            async for event in runner.run_live(
                session=session,
                live_request_queue=live_request_queue,
                run_config=run_config,
            ):
                if event.live_session_resumption_update:
                    update = event.live_session_resumption_update
                    if update.resumable and update.new_handle:
                        session_resumption_handles[session_id] = update.new_handle

                if event.interrupted:
                    await send_json(_server_message("interrupted"))

                if event.input_transcription and event.input_transcription.text:
                    await send_json(
                        _server_message(
                            "transcript",
                            speaker="user",
                            text=event.input_transcription.text,
                            partial=bool(event.partial),
                        )
                    )

                if event.output_transcription and event.output_transcription.text:
                    await send_json(
                        _server_message(
                            "transcript",
                            speaker="assistant",
                            text=event.output_transcription.text,
                            partial=bool(event.partial),
                        )
                    )
                    await send_json(_server_message("state", state="speaking"))

                if event.content and event.content.parts:
                    for part in event.content.parts:
                        inline_data = part.inline_data
                        if not inline_data or not inline_data.data:
                            continue

                        mime_type = inline_data.mime_type or ""
                        if not mime_type.startswith("audio/"):
                            continue

                        sample_rate = 24000
                        for token in mime_type.split(";"):
                            token = token.strip().lower()
                            if token.startswith("rate="):
                                value = token.split("=", 1)[1].strip()
                                if value.isdigit():
                                    sample_rate = int(value)

                        await send_json(
                            _server_message(
                                "assistant_audio_format",
                                sampleRate=sample_rate,
                            )
                        )
                        await websocket.send_bytes(inline_data.data)
                        await send_json(_server_message("state", state="speaking"))

                if event.turn_complete:
                    await send_json(_server_message("state", state="idle"))

        async def process_messages() -> None:
            while True:
                incoming = await websocket.receive()

                if incoming.get("bytes") is not None:
                    live_request_queue.send_realtime(
                        types.Blob(
                            data=incoming["bytes"],
                            mime_type="audio/pcm;rate=16000",
                        )
                    )
                    continue

                raw_message = incoming.get("text")
                if not raw_message:
                    continue

                message = _parse_client_message(raw_message)

                if isinstance(message, (ActivityStartMessage, PttStartMessage)):
                    live_request_queue.send_activity_start()
                    await send_json(_server_message("state", state="listening"))
                    continue

                if isinstance(message, (ActivityEndMessage, PttEndMessage)):
                    live_request_queue.send_activity_end()
                    await send_json(_server_message("state", state="thinking"))
                    continue

                if isinstance(message, (DisconnectMessage, StopSessionMessage)):
                    break

                if isinstance(message, SessionInitMessage):
                    # Duplicate session_init messages are harmless; ignore them.
                    continue

        tasks = [
            asyncio.create_task(forward_events()),
            asyncio.create_task(process_messages()),
        ]
        done, pending = await asyncio.wait(
            tasks,
            return_when=asyncio.FIRST_EXCEPTION,
        )

        for task in done:
            task.result()

    except WebSocketDisconnect:
        pass
    except (ValidationError, ValueError, json.JSONDecodeError) as exc:
        await send_json(_server_message("error", message=str(exc)))
        await websocket.close(code=1003, reason="Invalid websocket message")
    except Exception as exc:
        await send_json(_server_message("error", message=str(exc)))
        await websocket.close(code=1011, reason="Internal websocket error")
    finally:
        live_request_queue.close()
        for task in [task for task in locals().get("pending", []) if not task.done()]:
            task.cancel()
