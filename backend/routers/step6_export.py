"""Step 6: antifraud post-process + download."""
from __future__ import annotations

import io
import time
import zipfile
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from db import Project, Variant
from deps import get_project, get_session
from services.antifraud import antifraud_process

router = APIRouter(prefix="/api/projects/{project_id}", tags=["step6"])


def _safe_dir(kind: str, project_id: int) -> Path:
    p = settings.storage_dir / kind / str(project_id)
    p.mkdir(parents=True, exist_ok=True)
    return p


def _to_static_url(p: str) -> str:
    rel = Path(p).resolve().relative_to(settings.storage_dir)
    return "/storage/" + rel.as_posix()


@router.post("/step6/finalize")
async def finalize(
    project_id: int,
    payload: dict,
    project: Project = Depends(get_project),
    session: AsyncSession = Depends(get_session),
):
    variant_ids: list[int] = payload.get("variant_ids") or []
    strength = float(payload.get("strength") or 1.0)
    if not variant_ids:
        raise HTTPException(400, "variant_ids required")

    finals: list[dict] = []
    for vid in variant_ids:
        v = await session.get(Variant, vid)
        if v is None or v.project_id != project_id:
            continue
        raw = Path(v.path).read_bytes()
        processed = antifraud_process(raw, strength=strength)
        out_path = _safe_dir("final", project_id) / f"v{v.id}_{int(time.time())}_final.png"
        out_path.write_bytes(processed)
        v.is_final = True
        v.final_path = str(out_path)
        finals.append(
            {
                "id": v.id,
                "url": _to_static_url(str(out_path)),
            }
        )
    project.status = "completed"
    await session.commit()
    return {"finals": finals}


@router.get("/download/{variant_id}")
async def download_variant(
    project_id: int,
    variant_id: int,
    project: Project = Depends(get_project),
    session: AsyncSession = Depends(get_session),
):
    v = await session.get(Variant, variant_id)
    if v is None or v.project_id != project_id:
        raise HTTPException(404, "variant not found")
    path = v.final_path or v.path
    return FileResponse(path, media_type="image/png", filename=Path(path).name)


@router.get("/download_all")
async def download_all_finals(
    project_id: int,
    project: Project = Depends(get_project),
    session: AsyncSession = Depends(get_session),
):
    from sqlalchemy import select

    rows = (
        await session.execute(
            select(Variant).where(
                Variant.project_id == project_id, Variant.is_final.is_(True)
            )
        )
    ).scalars().all()
    if not rows:
        raise HTTPException(404, "no finalized variants")

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for v in rows:
            p = Path(v.final_path or v.path)
            if p.exists():
                zf.write(p, arcname=p.name)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="project_{project_id}_finals.zip"'
        },
    )
