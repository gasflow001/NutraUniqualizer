"""Step 1: parse text from creative + edit segments via WS chat."""
from __future__ import annotations

import json
from io import BytesIO
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from PIL import Image
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from db import Asset, Project, Segment, SessionLocal
from deps import get_project, get_session
from services import gemini_text

router = APIRouter(prefix="/api/projects/{project_id}/step1", tags=["step1"])

ALLOWED_MIME = {"image/jpeg", "image/png", "image/webp"}
MAX_BYTES = 10 * 1024 * 1024


def _safe_dir(kind: str, project_id: int) -> Path:
    p = settings.storage_dir / kind / str(project_id)
    p.mkdir(parents=True, exist_ok=True)
    return p


def _resize_for_ocr(image_bytes: bytes) -> tuple[bytes, str]:
    img = Image.open(BytesIO(image_bytes))
    mime = "image/jpeg"
    img = img.convert("RGB")
    max_side = 2048
    if max(img.size) > max_side:
        img.thumbnail((max_side, max_side), Image.LANCZOS)
    out = BytesIO()
    img.save(out, format="JPEG", quality=92)
    return out.getvalue(), mime


@router.post("/parse")
async def parse_step1(
    project_id: int,
    file: UploadFile = File(...),
    project: Project = Depends(get_project),
    session: AsyncSession = Depends(get_session),
):
    if file.content_type not in ALLOWED_MIME:
        raise HTTPException(415, f"unsupported mime: {file.content_type}")
    raw = await file.read()
    if len(raw) > MAX_BYTES:
        raise HTTPException(413, "file too large (>10MB)")

    ext = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}[file.content_type]
    src_path = _safe_dir("uploads", project_id) / f"source.{ext}"
    src_path.write_bytes(raw)

    session.add(
        Asset(
            project_id=project_id,
            kind="source",
            path=str(src_path),
            mime=file.content_type,
        )
    )

    resized, _ = _resize_for_ocr(raw)
    parsed = await gemini_text.parse_creative(resized, "image/jpeg")

    project.source_lang = parsed.get("source_lang")
    session.add(
        Segment(project_id=project_id, json_data=json.dumps(parsed, ensure_ascii=False))
    )
    await session.commit()
    return parsed


@router.post("/save")
async def save_step1(
    project_id: int,
    payload: dict,
    project: Project = Depends(get_project),
    session: AsyncSession = Depends(get_session),
):
    if "source_lang" in payload:
        project.source_lang = payload["source_lang"]
    session.add(
        Segment(project_id=project_id, json_data=json.dumps(payload, ensure_ascii=False))
    )
    await session.commit()
    return {"ok": True}


@router.websocket("/chat")
async def step1_chat(ws: WebSocket, project_id: int):
    await ws.accept()
    try:
        while True:
            msg = await ws.receive_json()
            instruction = (msg.get("instruction") or "").strip()
            if not instruction:
                await ws.send_json({"type": "error", "message": "empty instruction"})
                continue

            async with SessionLocal() as session:
                seg = (
                    await session.execute(
                        select(Segment)
                        .where(Segment.project_id == project_id)
                        .order_by(desc(Segment.id))
                    )
                ).scalars().first()
                if seg is None:
                    await ws.send_json({"type": "error", "message": "no segments yet — run /parse first"})
                    continue
                current = json.loads(seg.json_data)

            await ws.send_json({"type": "thinking"})
            try:
                updated = await gemini_text.chat_edit_segments(current, instruction)
            except Exception as e:
                await ws.send_json({"type": "error", "message": str(e)})
                continue

            async with SessionLocal() as session:
                session.add(
                    Segment(
                        project_id=project_id,
                        json_data=json.dumps(updated, ensure_ascii=False),
                    )
                )
                await session.commit()

            await ws.send_json({"type": "segments", "data": updated})
    except WebSocketDisconnect:
        return


@router.post("/translate")
async def translate_text(
    project_id: int,
    payload: dict,
    project: Project = Depends(get_project),
    session: AsyncSession = Depends(get_session),
):
    """Translate text from Russian to the project's source language."""
    text = (payload.get("text") or "").strip()
    if not text:
        raise HTTPException(400, "text required")
    target_lang = payload.get("target_lang") or project.source_lang or "en"

    translated = await gemini_text.translate_to_lang(text, "ru", target_lang)
    return {"translated": translated, "target_lang": target_lang}

