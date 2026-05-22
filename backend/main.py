"""FastAPI entrypoint for Nutra Creative Uniqualizer."""
from __future__ import annotations

# ВАЖНО: на Windows uvicorn по умолчанию выбирает SelectorEventLoop, на котором
# Playwright не может запустить свой node-driver (loop.subprocess_exec → NotImplementedError).
# Форсим ProactorEventLoop *до* всех асинхронных импортов и до создания loop.
import asyncio
import sys

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

import logging
import traceback
from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from config import settings
from db import init_db
from deps import get_flow_chrome
from routers import (
    projects as projects_router,
    step1_text,
    step2_layout,
    step3_product,
    step4_design,
    step5_generate,
    step6_export,
)
from services.gemini_text import gemini_alive

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s :: %(message)s",
)
logger = logging.getLogger("nutra")


@asynccontextmanager
async def lifespan(_: FastAPI):
    await init_db()
    yield


app = FastAPI(
    title="Nutra Creative Uniqualizer",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

storage_dir: Path = settings.storage_dir
app.mount("/storage", StaticFiles(directory=str(storage_dir)), name="storage")

app.include_router(projects_router.router)
app.include_router(step1_text.router)
app.include_router(step2_layout.router)
app.include_router(step3_product.router)
app.include_router(step4_design.router)
app.include_router(step5_generate.router)
app.include_router(step6_export.router)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """Покажи в response тип и сообщение исключения (для отладки)."""
    cls = exc.__class__.__name__
    msg = str(exc) or cls
    logger.error("Unhandled %s on %s %s: %s\n%s", cls, request.method, request.url.path, msg, traceback.format_exc())
    return JSONResponse(status_code=500, content={"detail": f"{cls}: {msg}"})


@app.get("/api/health")
async def health() -> dict:
    chrome_alive = False
    try:
        fc = await get_flow_chrome()
        chrome_alive = await fc.alive()
    except Exception:
        chrome_alive = False

    return {
        "ok": True,
        "chrome_alive": chrome_alive,
        "gemini_alive": bool(settings.GEMINI_API_KEY),
        "gemini_configured": bool(settings.GEMINI_API_KEY),
        "flow_configured": bool(settings.FLOW_PROJECT_ID),
        "gemini_proxy": bool(settings.GEMINI_PROXY),
        "flow_proxy": bool(settings.FLOW_PROXY),
    }


@app.post("/api/health/ping_gemini")
async def ping_gemini() -> dict:
    return {"alive": await gemini_alive()}


if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    # ВАЖНО: reload=False. С reload=True на Windows uvicorn спавнит
    # worker-процесс через subprocess + StatReload, и worker почему-то
    # оказывается на SelectorEventLoop — это валит Playwright на пустом
    # NotImplementedError. Без reload всё работает.
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=False,
        loop="asyncio",
        log_level="info",
    )
