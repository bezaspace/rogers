"""Runtime ADK compatibility patch for Gemini 3.1 Flash Live."""

from __future__ import annotations

from typing import TYPE_CHECKING

from google.genai import live
from google.genai import types

if TYPE_CHECKING:
    from google.adk.models.gemini_llm_connection import GeminiLlmConnection


def _is_gemini_3_1_model(model_version: str | None) -> bool:
    return bool(model_version and "3.1" in model_version)


async def _patched_send_content(
    self: "GeminiLlmConnection", content: types.Content
) -> None:
    """Route Gemini 3.1 text turns through the realtime text channel."""
    assert content.parts
    if content.parts[0].function_response:
        function_responses = [part.function_response for part in content.parts]        
        await self._gemini_session.send(
            input=types.LiveClientToolResponse(
                function_responses=function_responses
            ),
        )
        return

    if _is_gemini_3_1_model(getattr(self, "_model_version", None)):
        text_parts = [part.text for part in content.parts if part.text]
        if text_parts:
            await self._gemini_session.send_realtime_input(
                text="".join(text_parts)
            )
        return

    await self._gemini_session.send(
        input=types.LiveClientContent(
            turns=[content],
            turn_complete=True,
        )
    )


async def _patched_send_realtime(
    self: "GeminiLlmConnection", input
) -> None:
    """Force audio blobs onto the new live API audio field."""
    if isinstance(input, types.Blob):
        if input.mime_type and input.mime_type.startswith("audio/"):
            await self._gemini_session.send_realtime_input(audio=input)
            return
        await self._gemini_session.send_realtime_input(media=input)
        return

    if isinstance(input, types.ActivityStart):
        await self._gemini_session.send_realtime_input(activity_start=input)
        return

    if isinstance(input, types.ActivityEnd):
        await self._gemini_session.send_realtime_input(activity_end=input)
        return

    raise ValueError(f"Unsupported input type: {type(input)}")


def _build_patched_send_realtime_input(original_send_realtime_input):
    async def patched_send_realtime_input(
        self,
        *,
        media: types.Blob | dict | None = None,
        audio: types.Blob | dict | None = None,
        audio_stream_end: bool | None = None,
        video=None,
        text: str | None = None,
        activity_start=None,
        activity_end=None,
    ) -> None:
        # Some ADK builds still route audio via media=, which Gemini 3.1 rejects.
        if audio is None and isinstance(media, types.Blob):
            mime_type = media.mime_type or ""
            if mime_type.startswith("audio/"):
                audio = media
                media = None

        await original_send_realtime_input(
            self,
            media=media,
            audio=audio,
            audio_stream_end=audio_stream_end,
            video=video,
            text=text,
            activity_start=activity_start,
            activity_end=activity_end,
        )

    return patched_send_realtime_input


def patch_gemini_3_1_support() -> None:
    from google.adk.models import gemini_llm_connection

    gemini_llm_connection.GeminiLlmConnection.send_content = _patched_send_content
    gemini_llm_connection.GeminiLlmConnection.send_realtime = _patched_send_realtime
    live.AsyncSession.send_realtime_input = _build_patched_send_realtime_input(
        live.AsyncSession.send_realtime_input
    )
