"""Gemini text/vision client: OCR + translation + chat-edit + product metadata.

Uses the google-genai SDK in async mode (client.aio.models.generate_content).
"""
from __future__ import annotations

import asyncio
import json
import logging
from pathlib import Path
from typing import Any

from google import genai
from google.genai import types

from config import settings

logger = logging.getLogger("nutra.gemini")

PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"

_client: genai.Client | None = None

MAX_RETRIES = 3
RETRY_CODES = ("503", "429", "UNAVAILABLE", "RESOURCE_EXHAUSTED", "high demand")


async def _with_retry(coro_factory, retries: int = MAX_RETRIES):
    """Call coro_factory() up to `retries` times on transient Gemini errors."""
    last_err = None
    for attempt in range(retries):
        try:
            return await coro_factory()
        except Exception as e:
            err_str = str(e)
            is_transient = any(code in err_str for code in RETRY_CODES)
            if not is_transient or attempt == retries - 1:
                raise
            last_err = e
            wait = 3 * (2 ** attempt)  # 3s, 6s, 12s
            logger.warning(
                "Gemini transient error (attempt %d/%d), retrying in %ds: %s",
                attempt + 1, retries, wait, err_str[:200],
            )
            await asyncio.sleep(wait)
    raise last_err  # type: ignore


def _get_client() -> genai.Client:
    global _client
    if _client is None:
        if not settings.GEMINI_API_KEY:
            raise RuntimeError(
                "GEMINI_API_KEY is empty — fill backend/.env before calling Gemini."
            )
        http_options = None
        if settings.GEMINI_PROXY:
            # Прокси для httpx (sync + async) под капотом google-genai.
            # httpx 0.28+ принимает proxy="http(s)://user:pass@host:port".
            http_options = types.HttpOptions(
                client_args={"proxy": settings.GEMINI_PROXY},
                async_client_args={"proxy": settings.GEMINI_PROXY},
            )
        _client = genai.Client(
            api_key=settings.GEMINI_API_KEY,
            http_options=http_options,
        )
    return _client


def reset_client() -> None:
    """Сбросить кэш Client'а — позвать после изменения GEMINI_PROXY/API_KEY на лету."""
    global _client
    _client = None


def load_prompt(name: str) -> str:
    return (PROMPTS_DIR / name).read_text(encoding="utf-8")


def _strip_json_fence(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        # Drop optional leading "json\n"
        if text.lower().startswith("json"):
            text = text[4:].lstrip("\n")
    return text.strip()


def _parse_json(text: str) -> Any:
    return json.loads(_strip_json_fence(text))


async def parse_creative(image_bytes: bytes, mime: str = "image/jpeg") -> dict:
    """OCR + translation + segmentation of a creative image."""
    prompt = load_prompt("ocr_translate.txt")
    client = _get_client()

    async def _call():
        resp = await client.aio.models.generate_content(
            model=settings.GEMINI_TEXT_MODEL,
            contents=[
                types.Part.from_bytes(data=image_bytes, mime_type=mime),
                prompt,
            ],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.2,
            ),
        )
        return _parse_json(resp.text)

    return await _with_retry(_call)


async def chat_edit_segments(current: dict, instruction: str) -> dict:
    """Apply a free-form instruction to current segment JSON."""
    prompt = load_prompt("chat_edit_text.txt")
    payload = (
        prompt
        + "\n\nCURRENT JSON:\n"
        + json.dumps(current, ensure_ascii=False, indent=2)
        + "\n\nUSER INSTRUCTION:\n"
        + instruction.strip()
    )
    client = _get_client()

    async def _call():
        resp = await client.aio.models.generate_content(
            model=settings.GEMINI_TEXT_MODEL,
            contents=[payload],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.5,
            ),
        )
        return _parse_json(resp.text)

    return await _with_retry(_call)


async def extract_product_meta(image_bytes: bytes, mime: str = "image/jpeg") -> dict:
    """Extract brand_name, package_type, color_dominant from a product photo."""
    prompt = (
        "Look at this product packaging photo. Extract:\n"
        "- brand_name: the brand text printed on the package (empty string if unreadable)\n"
        '- package_type: one of {"bottle", "box", "blister", "sachet", "tube", "jar", "pouch"}\n'
        "- color_dominant: a single hex code (e.g. #1A4BA0) for the most dominant package color\n\n"
        'Return strict JSON: {"brand_name": "...", "package_type": "...", "color_dominant": "#......"}'
    )
    client = _get_client()

    async def _call():
        resp = await client.aio.models.generate_content(
            model=settings.GEMINI_TEXT_MODEL,
            contents=[
                types.Part.from_bytes(data=image_bytes, mime_type=mime),
                prompt,
            ],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.1,
            ),
        )
        return _parse_json(resp.text)

    return await _with_retry(_call)


async def translate_to_lang(text: str, from_lang: str, to_lang: str) -> str:
    """Translate text from one language to another, preserving advertising tone and style."""
    prompt = (
        f"Translate the following advertising text from {from_lang} to {to_lang}.\n"
        f"Requirements:\n"
        f"- Preserve the advertising tone, urgency, and emotional impact\n"
        f"- Use grammatically and syntactically correct {to_lang}\n"
        f"- Adapt cultural references if needed for the target market\n"
        f"- Keep it concise and punchy like ad copy\n"
        f"- Return ONLY the translated text, nothing else\n\n"
        f"Text to translate:\n{text}"
    )
    client = _get_client()

    async def _call():
        resp = await client.aio.models.generate_content(
            model=settings.GEMINI_TEXT_MODEL,
            contents=[prompt],
            config=types.GenerateContentConfig(
                temperature=0.3,
                max_output_tokens=500,
            ),
        )
        return (resp.text or "").strip()

    return await _with_retry(_call)


async def gemini_alive() -> bool:
    if not settings.GEMINI_API_KEY:
        return False
    try:
        client = _get_client()
        resp = await client.aio.models.generate_content(
            model=settings.GEMINI_TEXT_MODEL,
            contents=["ping"],
            config=types.GenerateContentConfig(max_output_tokens=4),
        )
        return bool(resp.text)
    except Exception:
        return False

