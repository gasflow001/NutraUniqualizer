"""reCAPTCHA + bearer for Flow API.

Принципы:
- Cookies живут в persistent Chrome-профиле (CHROME_FLOW_PROFILE_DIR). Софт
  ничего из .env не парсит и не делает backup на диск — юзер прогрел сессию
  один раз руками, всё.
- reCAPTCHA Enterprise v3 site_key извлекается со страницы автоматически
  (тэг `<script src=".../recaptcha/enterprise.js?render=KEY">` или
  `window.___grecaptcha_cfg.clients`). Кэшируется в инстансе.
- simulate_human_behavior — обязательный mouse-jitter перед grecaptcha.execute,
  иначе score = 0.1 → 403.
"""
from __future__ import annotations

import asyncio
import random


class FlowAuth:
    def __init__(self, flow_chrome, settings):
        self.fc = flow_chrome
        self.s = settings
        self._site_key: str | None = None

    async def simulate_human_behavior(self, page) -> None:
        vw, vh = 1280, 800
        for _ in range(random.randint(3, 5)):
            await page.mouse.move(
                random.randint(50, vw - 50),
                random.randint(50, vh - 50),
                steps=random.randint(8, 15),
            )
        await page.mouse.wheel(0, random.randint(100, 400))
        await asyncio.sleep(random.uniform(0.2, 0.4))
        await page.mouse.wheel(0, -random.randint(50, 200))
        for _ in range(random.randint(2, 3)):
            await page.mouse.move(
                random.randint(50, vw - 50),
                random.randint(50, vh - 50),
                steps=random.randint(8, 12),
            )
        await asyncio.sleep(random.uniform(0.3, 0.6))

    async def get_recaptcha_site_key(self, page) -> str:
        if self._site_key:
            return self._site_key

        key = await page.evaluate(
            """
            async () => {
                // 1. <script src="...recaptcha/enterprise.js?render=KEY">
                for (const s of document.querySelectorAll('script[src]')) {
                    const src = s.getAttribute('src') || '';
                    const m = src.match(/recaptcha\\/(?:enterprise|api)\\.js\\?render=([A-Za-z0-9_-]+)/);
                    if (m) return m[1];
                }
                // 2. window.___grecaptcha_cfg.clients[*].*.sitekey
                try {
                    const clients = window.___grecaptcha_cfg && window.___grecaptcha_cfg.clients;
                    if (clients) {
                        const stack = [];
                        for (const id in clients) stack.push(clients[id]);
                        const seen = new WeakSet();
                        while (stack.length) {
                            const obj = stack.pop();
                            if (!obj || typeof obj !== 'object' || seen.has(obj)) continue;
                            seen.add(obj);
                            if (typeof obj.sitekey === 'string' && obj.sitekey.length > 20) {
                                return obj.sitekey;
                            }
                            for (const k in obj) {
                                try { stack.push(obj[k]); } catch (e) {}
                            }
                        }
                    }
                } catch (e) {}
                // 3. Regex over inline scripts for a plausible 6L... reCAPTCHA key
                for (const s of document.scripts) {
                    const t = s.textContent || '';
                    const m = t.match(/['"]([6L][A-Za-z0-9_-]{30,})['"]/);
                    if (m) return m[1];
                }
                return null;
            }
            """
        )
        if not key:
            raise RuntimeError(
                "recaptcha site_key not found on labs.google page — "
                "is the Flow tab really open and the page fully loaded?"
            )
        self._site_key = key
        return key

    async def get_recaptcha_token(self, page) -> str:
        site_key = await self.get_recaptcha_site_key(page)
        for attempt in range(3):
            try:
                token = await page.evaluate(
                    f"""
                    async () => {{
                        if (!window.grecaptcha || !window.grecaptcha.enterprise) {{
                            throw new Error('grecaptcha not loaded');
                        }}
                        return await window.grecaptcha.enterprise.execute(
                            '{site_key}',
                            {{ action: 'IMAGE_GENERATION' }}
                        );
                    }}
                """
                )
                if token and len(token) > 100:
                    return token
            except Exception:
                if attempt < 2:
                    try:
                        await page.reload(wait_until="domcontentloaded")
                    except Exception:
                        pass
                    await asyncio.sleep(2)
                    # Site_key мог поменяться после reload — пересчитаем.
                    self._site_key = None
                    site_key = await self.get_recaptcha_site_key(page)
        raise RuntimeError("recaptcha token unavailable — tab might be discarded or profile not warmed up")

    async def get_bearer_token(self, page) -> str:
        for attempt in range(2):
            data = await page.evaluate(
                """
                async () => {
                    const r = await fetch('/fx/api/auth/session', {credentials: 'include'});
                    return await r.json();
                }
                """
            )
            token = (
                (data or {}).get("access_token")
                or (data or {}).get("accessToken")
                or (data or {}).get("token")
            )
            if token:
                return token
            if attempt == 0:
                try:
                    await page.reload(wait_until="domcontentloaded")
                except Exception:
                    pass
                await asyncio.sleep(2)
        raise RuntimeError(
            "bearer token unavailable — Chrome-профиль не залогинен в labs.google. "
            "Открой вкладку https://labs.google/fx/tools/flow и войди в Google AI Pro/Ultra аккаунт."
        )
