"""Chrome bootstrap via CDP — pattern Picaso.

Connects (or spawns) a persistent Chrome profile that the user keeps logged-in
to labs.google. All Flow API calls reuse this single context to keep the
recaptcha + bearer token freshly minted.
"""
from __future__ import annotations

import asyncio
import os
import subprocess
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from playwright.async_api import Browser, BrowserContext, Page, Playwright


class FlowChrome:
    def __init__(self, settings):
        self.s = settings
        self.pw: "Playwright | None" = None
        self.browser: "Browser | None" = None
        self.context: "BrowserContext | None" = None
        self.page: "Page | None" = None
        # Single in-flight evaluate at a time on the Chrome page.
        self.chrome_sem = asyncio.Semaphore(1)
        self._lock = asyncio.Lock()

    async def ensure_ready(self) -> "Page":
        from playwright.async_api import async_playwright

        async with self._lock:
            if self.page and not self.page.is_closed():
                return self.page

            if self.pw is None:
                self.pw = await async_playwright().start()

            for attempt in range(15):
                try:
                    self.browser = await self.pw.chromium.connect_over_cdp(
                        f"http://127.0.0.1:{self.s.CHROME_CDP_PORT}"
                    )
                    break
                except Exception:
                    if attempt == 0:
                        self._spawn_chrome()
                    await asyncio.sleep(1)
            else:
                raise RuntimeError(
                    f"Chrome CDP at port {self.s.CHROME_CDP_PORT} not reachable after 15s. "
                    "Open Chrome manually with --remote-debugging-port or check CHROME_PATH."
                )

            if not self.browser.contexts:
                self.context = await self.browser.new_context()
            else:
                self.context = self.browser.contexts[0]

            target_url = (
                f"https://labs.google/fx/tools/flow/project/{self.s.FLOW_PROJECT_ID}"
                if self.s.FLOW_PROJECT_ID
                else "https://labs.google/fx/tools/flow"
            )

            self.page = None
            for p in self.context.pages:
                if "labs.google/fx/tools/flow" in p.url:
                    self.page = p
                    break
            if self.page is None:
                self.page = await self.context.new_page()
                await self.page.goto(target_url, wait_until="domcontentloaded")
            else:
                try:
                    await self.page.bring_to_front()
                except Exception:
                    pass

            return self.page

    def _spawn_chrome(self) -> None:
        profile = os.path.expanduser(self.s.CHROME_FLOW_PROFILE_DIR)
        os.makedirs(profile, exist_ok=True)
        subprocess.Popen(
            [
                self.s.CHROME_PATH,
                f"--user-data-dir={profile}",
                f"--remote-debugging-port={self.s.CHROME_CDP_PORT}",
                "--no-first-run",
                "--no-default-browser-check",
                "--disable-features=DisableLoadExtensionCommandLineSwitch",
            ]
        )

    async def alive(self) -> bool:
        try:
            return self.page is not None and not self.page.is_closed()
        except Exception:
            return False

    async def close(self) -> None:
        try:
            if self.browser:
                await self.browser.close()
            if self.pw:
                await self.pw.stop()
        except Exception:
            pass
        self.page = None
        self.context = None
        self.browser = None
        self.pw = None
