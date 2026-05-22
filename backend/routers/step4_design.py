"""Step 4: upload design reference creative + Gemini Vision analysis."""
from __future__ import annotations

import json
from io import BytesIO
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from PIL import Image
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from db import Asset, Project
from deps import get_project, get_session
from services import gemini_vision

router = APIRouter(prefix="/api/projects/{project_id}/step4", tags=["step4"])

ALLOWED_MIME = {"image/jpeg", "image/png", "image/webp"}
MAX_BYTES = 10 * 1024 * 1024


def _safe_dir(kind: str, project_id: int) -> Path:
    p = settings.storage_dir / kind / str(project_id)
    p.mkdir(parents=True, exist_ok=True)
    return p


def _to_static_url(p: str) -> str:
    rel = Path(p).resolve().relative_to(settings.storage_dir)
    return "/storage/" + rel.as_posix()


def _resize_for_vision(image_bytes: bytes, max_side: int = 2048) -> tuple[bytes, str]:
    img = Image.open(BytesIO(image_bytes)).convert("RGB")
    if max(img.size) > max_side:
        img.thumbnail((max_side, max_side), Image.LANCZOS)
    out = BytesIO()
    img.save(out, format="JPEG", quality=92)
    return out.getvalue(), "image/jpeg"


@router.post("/upload")
async def upload_design_ref(
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

    ext = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}.get(
        file.content_type, "jpg"
    )
    path = _safe_dir("design_refs", project_id) / f"design_ref.{ext}"
    path.write_bytes(raw)

    # Gemini Vision analysis
    resized, mime = _resize_for_vision(raw)
    analysis = await gemini_vision.analyze_design_reference(resized, mime)

    session.add(
        Asset(
            project_id=project_id,
            kind="design_ref",
            path=str(path),
            mime=file.content_type,
            meta_json=json.dumps(analysis, ensure_ascii=False),
        )
    )
    await session.commit()

    return {
        "preview_url": _to_static_url(str(path)),
        "analysis": analysis,
    }


@router.post("/save")
async def save_design_ref(
    project_id: int,
    payload: dict,
    project: Project = Depends(get_project),
    session: AsyncSession = Depends(get_session),
):
    """Save user-edited design reference analysis back to the latest asset."""
    from sqlalchemy import desc, select

    asset = (
        await session.execute(
            select(Asset).where(
                Asset.project_id == project_id, Asset.kind == "design_ref"
            ).order_by(desc(Asset.id))
        )
    ).scalars().first()
    if asset is None:
        raise HTTPException(400, "no design reference uploaded yet")

    analysis = payload.get("analysis")
    if analysis:
        asset.meta_json = json.dumps(analysis, ensure_ascii=False)
    await session.commit()
    return {"ok": True}


@router.post("/certificate")
async def upload_certificate(
    project_id: int,
    file: UploadFile = File(...),
    project: Project = Depends(get_project),
    session: AsyncSession = Depends(get_session),
):
    """Upload a certificate image to overlay on the final creative."""
    if file.content_type not in ALLOWED_MIME:
        raise HTTPException(415, f"unsupported mime: {file.content_type}")
    raw = await file.read()
    if len(raw) > MAX_BYTES:
        raise HTTPException(413, "file too large (>10MB)")

    ext = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}.get(
        file.content_type, "jpg"
    )
    path = _safe_dir("design_refs", project_id) / f"certificate.{ext}"
    path.write_bytes(raw)

    session.add(
        Asset(
            project_id=project_id,
            kind="certificate",
            path=str(path),
            mime=file.content_type,
        )
    )
    await session.commit()

    return {"preview_url": _to_static_url(str(path))}


@router.delete("/certificate")
async def delete_certificate(
    project_id: int,
    project: Project = Depends(get_project),
    session: AsyncSession = Depends(get_session),
):
    """Remove certificate from the project."""
    from sqlalchemy import select, desc

    cert = (
        await session.execute(
            select(Asset).where(
                Asset.project_id == project_id, Asset.kind == "certificate"
            ).order_by(desc(Asset.id))
        )
    ).scalars().first()
    if cert:
        Path(cert.path).unlink(missing_ok=True)
        await session.delete(cert)
        await session.commit()
    return {"ok": True}


@router.post("/doctor")
async def upload_doctor(
    project_id: int,
    file: UploadFile = File(...),
    project: Project = Depends(get_project),
    session: AsyncSession = Depends(get_session),
):
    """Upload a doctor photo to include in the creative background."""
    if file.content_type not in ALLOWED_MIME:
        raise HTTPException(415, f"unsupported mime: {file.content_type}")
    raw = await file.read()
    if len(raw) > MAX_BYTES:
        raise HTTPException(413, "file too large (>10MB)")

    ext = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}.get(
        file.content_type, "jpg"
    )
    path = _safe_dir("design_refs", project_id) / f"doctor.{ext}"
    path.write_bytes(raw)

    session.add(
        Asset(
            project_id=project_id,
            kind="doctor",
            path=str(path),
            mime=file.content_type,
        )
    )
    await session.commit()

    return {"preview_url": _to_static_url(str(path))}


@router.delete("/doctor")
async def delete_doctor(
    project_id: int,
    project: Project = Depends(get_project),
    session: AsyncSession = Depends(get_session),
):
    """Remove doctor photo from the project."""
    from sqlalchemy import select, desc

    doc = (
        await session.execute(
            select(Asset).where(
                Asset.project_id == project_id, Asset.kind == "doctor"
            ).order_by(desc(Asset.id))
        )
    ).scalars().first()
    if doc:
        Path(doc.path).unlink(missing_ok=True)
        await session.delete(doc)
        await session.commit()
    return {"ok": True}
