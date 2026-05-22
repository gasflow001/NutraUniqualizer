"""Gemini Vision: structural layout analysis (used in Step 2 Manual mode)."""
from __future__ import annotations

from google.genai import types

from config import settings
from services.gemini_text import _get_client, _parse_json, _with_retry, load_prompt


async def analyze_layout(image_bytes: bytes, mime: str = "image/jpeg") -> dict:
    """Return zone bounding boxes + palette + style + mood for a creative image."""
    prompt = load_prompt("structure_vision.txt")
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
                temperature=0.25,
            ),
        )
        return _parse_json(resp.text)

    return await _with_retry(_call)


async def analyze_design_reference(image_bytes: bytes, mime: str = "image/jpeg") -> dict:
    """Analyze a design reference creative: scene, composition, mood, visual metaphors, UI elements, props."""
    prompt = load_prompt("design_reference_analysis.txt")
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
                temperature=0.3,
            ),
        )
        return _parse_json(resp.text)

    return await _with_retry(_call)

