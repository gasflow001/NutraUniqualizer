"""Direct API to aisandbox-pa.googleapis.com — реверсенуто под Flow.

Pipeline per variant:
  1. Acquire fresh recaptcha + bearer (chrome_sem-protected).
  2. POST /v1/projects/{flow_project}/flowMedia:batchGenerateImages
     с imageInputs:[{imageInputType, name}] (где name = uuid из uploadImage).
  3. Извлечь fifeUrl и mediaId из media[0].image.generatedImage.
  4. Download bytes по fifeUrl.
  5. Optional: upsample → 2K через flow/upsampleImage.
  6. Retry 1 раз на 403 со свежими токенами; второй 403 = banned.
"""
from __future__ import annotations

import asyncio
import base64
import json
import random
import time
from typing import Any

import aiohttp


class FlowError(RuntimeError):
    pass


class FlowBannedError(FlowError):
    """Два 403 подряд — сессия живая, но запросы режутся (бан/throttle)."""


class FlowClient:
    def __init__(self, flow_chrome, flow_auth, settings):
        self.fc = flow_chrome
        self.auth = flow_auth
        self.s = settings
        self.api_sem = asyncio.Semaphore(int(settings.FLOW_API_SEMAPHORE))
        # Token cache (bearer + recaptcha expire quickly, cache for 90s)
        self._cached_bearer: str | None = None
        self._cached_recaptcha: str | None = None
        self._token_ts: float = 0
        self._TOKEN_TTL = 90  # seconds
        self._human_simulated = False

    def _proxy(self) -> str | None:
        return self.s.FLOW_PROXY or None

    # ---------- token management ----------

    async def _get_tokens(self) -> tuple[str, str]:
        """Return (bearer, recaptcha), using cache if fresh enough."""
        now = time.time()
        if (
            self._cached_bearer
            and self._cached_recaptcha
            and (now - self._token_ts) < self._TOKEN_TTL
        ):
            return self._cached_bearer, self._cached_recaptcha

        page = await self.fc.ensure_ready()
        async with self.fc.chrome_sem:
            # Simulate human only once per session, not on every token refresh
            if not self._human_simulated:
                await self.auth.simulate_human_behavior(page)
                self._human_simulated = True
            recaptcha = await self.auth.get_recaptcha_token(page)
            bearer = await self.auth.get_bearer_token(page)

        self._cached_bearer = bearer
        self._cached_recaptcha = recaptcha
        self._token_ts = now
        return bearer, recaptcha

    async def _refresh_tokens(self) -> tuple[str, str]:
        """Force-refresh tokens (e.g. after 403)."""
        self._token_ts = 0
        return await self._get_tokens()

    # ---------- public API ----------

    async def generate(
        self,
        prompt: str,
        reference_media_ids: list[str],
        *,
        model: str = "GEM_PIX_2",
        aspect_ratio: str = "IMAGE_ASPECT_RATIO_SQUARE",
        seed: int | None = None,
        upsample: bool = True,
    ) -> bytes:
        """Сгенерировать один креатив.

        `reference_media_ids` — список UUID, полученных от `upload_image_to_flow`.
        Первый обычно = фото товара. На шаге 4.9 (chat edit) добавляется второй
        UUID — загруженная PNG текущего варианта.
        """
        bearer, recaptcha = await self._get_tokens()

        body = self._build_body(
            prompt=prompt,
            reference_media_ids=reference_media_ids,
            model=model,
            aspect=aspect_ratio,
            seed=seed if seed is not None else random.randint(100_000, 999_999),
            recaptcha=recaptcha,
        )
        url = (
            f"https://aisandbox-pa.googleapis.com/v1/projects/"
            f"{self.s.FLOW_PROJECT_ID}/flowMedia:batchGenerateImages"
        )
        headers = self._headers(bearer)

        data: dict | None = None
        last_status = 0
        last_body = ""
        for attempt in range(2):
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    url, headers=headers, json=body, timeout=180, proxy=self._proxy()
                ) as r:
                    last_status = r.status
                    last_body = await r.text()
                    if r.status == 200:
                        data = json.loads(last_body)
                        break
                    if r.status == 403 and attempt == 0:
                        bearer, recaptcha = await self._refresh_tokens()
                        self._patch_recaptcha(body, recaptcha)
                        headers["Authorization"] = f"Bearer {bearer}"
                        continue
                    raise FlowError(f"flowMedia:batchGenerateImages {r.status}: {last_body[:500]}")

        if data is None:
            if last_status == 403:
                raise FlowBannedError(
                    f"two consecutive 403 — likely account/IP throttle: {last_body[:300]}"
                )
            raise FlowError(f"empty response after retries (status={last_status})")

        image_url, image_media_id = self._extract_image(data)
        image_bytes = await self._download(image_url)

        # Upsample to 2K
        if upsample:
            try:
                _, recaptcha_up = await self._get_tokens()
                up = await self._upsample(image_media_id, recaptcha_up, bearer)
                if up:
                    image_bytes = up
            except Exception:
                pass

        return image_bytes

    # ---------- internals ----------

    def _headers(self, bearer: str) -> dict:
        return {
            "Authorization": f"Bearer {bearer}",
            "Content-Type": "application/json",
            "Origin": "https://labs.google",
            "Referer": "https://labs.google/",
        }

    def _build_body(
        self,
        *,
        prompt: str,
        reference_media_ids: list[str],
        model: str,
        aspect: str,
        seed: int,
        recaptcha: str,
    ) -> dict:
        ctx = {
            "recaptchaContext": {
                "token": recaptcha,
                "applicationType": "RECAPTCHA_APPLICATION_TYPE_WEB",
            },
            "sessionId": f";{int(time.time() * 1000)}",
            "projectId": self.s.FLOW_PROJECT_ID,
            "tool": "PINHOLE",
        }
        image_inputs = [
            {"imageInputType": "IMAGE_INPUT_TYPE_REFERENCE", "name": mid}
            for mid in reference_media_ids
            if mid
        ]
        request: dict[str, Any] = {
            "clientContext": ctx,
            "seed": seed,
            "imageModelName": model,
            "imageAspectRatio": aspect,
            "prompt": prompt,
        }
        if image_inputs:
            request["imageInputs"] = image_inputs
        return {"clientContext": ctx, "requests": [request]}

    def _patch_recaptcha(self, body: dict, token: str) -> None:
        for key in ("clientContext",):
            if key in body and "recaptchaContext" in body[key]:
                body[key]["recaptchaContext"]["token"] = token
        for req in body.get("requests", []):
            if "clientContext" in req and "recaptchaContext" in req["clientContext"]:
                req["clientContext"]["recaptchaContext"]["token"] = token

    def _extract_image(self, data: Any) -> tuple[str, str]:
        """Return (image_download_url, media_id) from the batchGenerateImages response."""
        media_list = data.get("media") if isinstance(data, dict) else None
        if isinstance(media_list, list):
            for item in media_list:
                gen = ((item or {}).get("image") or {}).get("generatedImage") or {}
                fife = gen.get("fifeUrl") or gen.get("imageUrl") or gen.get("uri")
                mid = gen.get("mediaId") or item.get("name")
                if fife and mid:
                    return fife, mid

        # Backup: walk anywhere for a fifeUrl / signed URL + nearby mediaId.
        found_url: str | None = None
        found_mid: str | None = None

        def walk(obj):
            nonlocal found_url, found_mid
            if isinstance(obj, dict):
                for k, v in obj.items():
                    if isinstance(v, str):
                        lv = v.lower()
                        if not found_url and k in ("fifeUrl", "imageUrl", "uri", "url", "signedUri") and (
                            "flow-content" in lv
                            or "storage.googleapis.com" in lv
                            or "googleusercontent" in lv
                            or "lh3.google" in lv
                        ):
                            found_url = v
                        if not found_mid and k in ("mediaId", "name") and len(v) > 20:
                            found_mid = v
                    walk(v)
            elif isinstance(obj, list):
                for it in obj:
                    walk(it)

        walk(data)
        if found_url and found_mid:
            return found_url, found_mid
        raise FlowError(f"no image URL / mediaId in response: {json.dumps(data)[:500]}")

    async def _download(self, url: str) -> bytes:
        async with aiohttp.ClientSession() as session:
            async with session.get(url, timeout=60, proxy=self._proxy()) as r:
                if r.status != 200:
                    raise FlowError(f"image download {r.status}: {url[:120]}")
                return await r.read()

    async def _upsample(self, media_id: str, recaptcha: str, bearer: str) -> bytes | None:
        url = "https://aisandbox-pa.googleapis.com/v1/flow/upsampleImage"
        body = {
            "mediaId": media_id,
            "targetResolution": "UPSAMPLE_IMAGE_RESOLUTION_2K",
            "clientContext": {
                "recaptchaContext": {
                    "token": recaptcha,
                    "applicationType": "RECAPTCHA_APPLICATION_TYPE_WEB",
                },
                "projectId": self.s.FLOW_PROJECT_ID,
                "tool": "PINHOLE",
                "sessionId": f";{int(time.time()*1000)}",
            },
        }
        headers = self._headers(bearer)
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    url, headers=headers, json=body, timeout=60, proxy=self._proxy()
                ) as r:
                    if r.status != 200:
                        return None
                    data = await r.json(content_type=None)
        except Exception:
            return None

        # Response shape varies: encodedImage(base64) | fifeUrl | url
        b64 = data.get("encodedImage") or data.get("imageBytes")
        if b64:
            try:
                return base64.b64decode(b64)
            except Exception:
                pass

        def find_url(obj):
            if isinstance(obj, dict):
                for k, v in obj.items():
                    if isinstance(v, str) and k in ("fifeUrl", "url", "uri") and "http" in v:
                        return v
                    r = find_url(v)
                    if r:
                        return r
            elif isinstance(obj, list):
                for it in obj:
                    r = find_url(it)
                    if r:
                        return r
            return None

        u = find_url(data)
        if u:
            try:
                return await self._download(u)
            except Exception:
                return None
        return None
