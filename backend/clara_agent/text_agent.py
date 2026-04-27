import importlib.util
import os
from typing import Any

from google.adk.agents import Agent
from google.adk.models.google_llm import Gemini

from clara_agent.project_knowledge import inspect_project_knowledge


DEFAULT_TEXT_MODEL_MODE = "gemma31_stable"

TEXT_MODEL_MODE_LABELS = {
    "gemma31_stable": "Gemma 31B stable",
    "gemma26_thinking": "Gemma 26B thinking",
    "llama31_hf": "Llama 3.1 8B HF",
}

TEXT_AGENT_INSTRUCTION = """<|think|>
You are the Rogers text assistant, a precise app-control agent in early read-only mode.

You can currently inspect the user's projects, markdown files, wiki links, image metadata, tasks, and mind-dump entries.

Rules:
- Always use inspect_project_knowledge before answering questions about projects, files, notes, images, tasks, schedules, or mind dumps.
- Base app-state answers only on the tool result. Do not invent projects, files, links, metadata, or tasks.
- If the user asks you to change, create, delete, or reschedule something, explain that this v1 text assistant is read-only and only has the project knowledge tool right now.
- Be concise, direct, and useful. Mention relevant project/file names when they help the user orient.
- If the tool data does not contain the requested information, say that clearly and suggest where the user might add it.
"""


def _litellm_available() -> bool:
    return importlib.util.find_spec("litellm") is not None


def _make_agent(name: str, model: Any, description: str) -> Agent:
    return Agent(
        name=name,
        model=model,
        description=description,
        instruction=TEXT_AGENT_INSTRUCTION,
        tools=[inspect_project_knowledge],
    )


def create_text_assistant_agent(mode: str) -> Agent:
    if mode == "gemma31_stable":
        return _make_agent(
            name="rogers_text_assistant_gemma31",
            model=Gemini(model="gemma-4-31b-it"),
            description="Stable Gemma 31B text assistant for Rogers app data.",
        )

    if mode == "gemma26_thinking":
        missing = [
            name
            for name in (
                "GEMMA26_LITELLM_MODEL",
                "GEMMA26_LITELLM_API_BASE",
                "GEMMA26_LITELLM_API_KEY",
            )
            if not os.environ.get(name)
        ]
        if missing:
            raise RuntimeError(f"Missing Gemma 26 LiteLLM env: {', '.join(missing)}")
        if not _litellm_available():
            raise RuntimeError("LiteLLM is not installed. Run uv sync after installing google-adk[extensions].")

        from google.adk.models.lite_llm import LiteLlm

        return _make_agent(
            name="rogers_text_assistant_gemma26",
            model=LiteLlm(
                model=os.environ["GEMMA26_LITELLM_MODEL"],
                api_base=os.environ["GEMMA26_LITELLM_API_BASE"],
                api_key=os.environ["GEMMA26_LITELLM_API_KEY"],
                extra_body={"chat_template_kwargs": {"enable_thinking": True}},
                drop_params=True,
            ),
            description="Gemma 26B LiteLLM thinking-mode text assistant for Rogers app data.",
        )

    if mode == "llama31_hf":
        if not os.environ.get("HF_TOKEN"):
            raise RuntimeError("Missing HF_TOKEN for Hugging Face Llama mode.")
        if not _litellm_available():
            raise RuntimeError("LiteLLM is not installed. Run uv sync after installing google-adk[extensions].")

        from google.adk.models.lite_llm import LiteLlm

        return _make_agent(
            name="rogers_text_assistant_llama31",
            model=LiteLlm(
                model=os.environ.get("LLAMA31_LITELLM_MODEL", "openai/meta-llama/Llama-3.1-8B-Instruct"),
                api_base=os.environ.get("LLAMA31_API_BASE", "https://router.huggingface.co/v1"),
                api_key=os.environ["HF_TOKEN"],
                drop_params=True,
            ),
            description="Llama 3.1 8B Hugging Face text assistant for Rogers app data.",
        )

    raise ValueError(f"Unsupported text assistant mode: {mode}")


def get_text_assistant_modes() -> list[dict[str, Any]]:
    litellm_ready = _litellm_available()
    gemma26_missing = [
        name
        for name in (
            "GEMMA26_LITELLM_MODEL",
            "GEMMA26_LITELLM_API_BASE",
            "GEMMA26_LITELLM_API_KEY",
        )
        if not os.environ.get(name)
    ]

    return [
        {
            "id": "gemma31_stable",
            "label": TEXT_MODEL_MODE_LABELS["gemma31_stable"],
            "enabled": True,
            "reason": "",
        },
        {
            "id": "gemma26_thinking",
            "label": TEXT_MODEL_MODE_LABELS["gemma26_thinking"],
            "enabled": litellm_ready and not gemma26_missing,
            "reason": (
                "LiteLLM missing"
                if not litellm_ready
                else f"Missing {', '.join(gemma26_missing)}"
                if gemma26_missing
                else ""
            ),
        },
        {
            "id": "llama31_hf",
            "label": TEXT_MODEL_MODE_LABELS["llama31_hf"],
            "enabled": litellm_ready and bool(os.environ.get("HF_TOKEN")),
            "reason": (
                "LiteLLM missing"
                if not litellm_ready
                else "HF_TOKEN missing"
                if not os.environ.get("HF_TOKEN")
                else ""
            ),
        },
    ]
