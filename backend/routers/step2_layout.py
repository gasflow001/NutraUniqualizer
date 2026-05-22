"""Step 2: composition analysis — Auto (no-op) or Manual (Gemini Vision)."""
from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from db import Asset, Layout, Project
from deps import get_project, get_session
from services import gemini_vision

router = APIRouter(prefix="/api/projects/{project_id}/step2", tags=["step2"])


@router.post("/analyze")
async def analyze_step2(
    project_id: int,
    payload: dict,
    project: Project = Depends(get_project),
    session: AsyncSession = Depends(get_session),
):
    mode = (payload.get("mode") or "auto").lower()
    if mode not in {"auto", "manual"}:
        raise HTTPException(400, "mode must be 'auto' or 'manual'")

    project.layout_mode = mode

    if mode == "auto":
        session.add(Layout(project_id=project_id, mode="auto", json_data=None))
        await session.commit()
        return {"mode": "auto", "ok": True}

    src = (
        await session.execute(
            select(Asset).where(Asset.project_id == project_id, Asset.kind == "source").order_by(desc(Asset.id))
        )
    ).scalars().first()
    if src is None:
        raise HTTPException(400, "source image not uploaded (step1) yet")

    image_bytes = Path(src.path).read_bytes()
    mime = src.mime or "image/jpeg"
    layout = await gemini_vision.analyze_layout(image_bytes, mime)

    session.add(
        Layout(
            project_id=project_id,
            mode="manual",
            json_data=json.dumps(layout, ensure_ascii=False),
        )
    )
    await session.commit()
    return {"mode": "manual", "layout": layout}


@router.post("/save")
async def save_step2(
    project_id: int,
    payload: dict,
    project: Project = Depends(get_project),
    session: AsyncSession = Depends(get_session),
):
    mode = (payload.get("mode") or project.layout_mode or "auto").lower()
    layout = payload.get("layout")
    project.layout_mode = mode
    session.add(
        Layout(
            project_id=project_id,
            mode=mode,
            json_data=json.dumps(layout, ensure_ascii=False) if layout else None,
        )
    )
    await session.commit()
    return {"ok": True}
