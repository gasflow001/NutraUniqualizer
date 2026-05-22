"""Реальный endpoint загрузки фото товара / промежуточных вариантов в Flow.

Реверс выполнен на bundle JS + смоук-тестах (см. CLAUDE.md, пункт 11).

POST https://aisandbox-pa.googleapis.com/v1/flow/uploadImage
Body:
    {
      "clientContext": {
        "projectId": "<flow_project_id>",
        "tool": "PINHOLE",
        "sessionId": ";<epoch_ms>",
        "recaptchaContext": {"token": "...", "applicationType": "RECAPTCHA_APPLICATION_TYPE_WEB"}
      },
      "imageBytes": "<base64>"
    }
Response → {"media": {"name": "<UUID>", ...}}
"""
from __future__ import annotations

import base64
import json
import time

import aiohttp

from config import settings


def _flow_proxy() -> str | None:
    """Опциональный прокси для Flow API. Обычно None (Flow ходит без прокси)."""
    return settings.FLOW_PROXY or None


def _build_client_context(project_id: str, recaptcha_token: str) -> dict:
    return {
        "projectId": project_id,
        "tool": "PINHOLE",
        "sessionId": f";{int(time.time() * 1000)}",
        "recaptchaContext": {
            "token": recaptcha_token,
            "applicationType": "RECAPTCHA_APPLICATION_TYPE_WEB",
        },
    }


async def upload_image_to_flow(
    image_bytes: bytes,
    bearer: str,
    recaptcha_token: str,
    project_id: str,
) -> str:
    """Upload bytes → return media UUID (response.media.name).

    Raises aiohttp / ValueError on failure.
    """
    url = "https://aisandbox-pa.googleapis.com/v1/flow/uploadImage"
    headers = {
        "Authorization": f"Bearer {bearer}",
        "Content-Type": "application/json",
        "Origin": "https://labs.google",
        "Referer": "https://labs.google/",
    }
    body = {
        "clientContext": _build_client_context(project_id, recaptcha_token),
        "imageBytes": base64.b64encode(image_bytes).decode("ascii"),
    }
    async with aiohttp.ClientSession() as session:
        async with session.post(
            url, headers=headers, json=body, timeout=60, proxy=_flow_proxy()
        ) as r:
            text = await r.text()
            if r.status != 200:
                raise RuntimeError(f"uploadImage {r.status}: {text[:400]}")
            try:
                data = json.loads(text)
            except Exception as e:
                raise RuntimeError(f"uploadImage non-JSON response: {e}: {text[:200]}")
    media = data.get("media") or {}
    name = media.get("name")
    if not name:
        raise RuntimeError(f"uploadImage: no media.name in response: {text[:300]}")
    return name
