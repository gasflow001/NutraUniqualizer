"""Step 3: upload product photo + extract brand/package metadata."""
from __future__ import annotations

import json
from io import BytesIO
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from PIL import Image
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from db import Asset, Project
from deps import get_project, get_session
from services import gemini_text

router = APIRouter(prefix="/api/projects/{project_id}/step3", tags=["step3"])

ALLOWED_MIME = {"image/jpeg", "image/png", "image/webp"}
MAX_BYTES = 10 * 1024 * 1024


def _safe_dir(kind: str, project_id: int) -> Path:
    p = settings.storage_dir / kind / str(project_id)
    p.mkdir(parents=True, exist_ok=True)
    return p


def _to_static_url(p: str) -> str:
    rel = Path(p).resolve().relative_to(settings.storage_dir)
    return "/storage/" + rel.as_posix()


@router.post("/product")
async def upload_product(
    project_id: int,
    file: UploadFile = File(...),
    crop: str | None = Form(default=None),
    project: Project = Depends(get_project),
    session: AsyncSession = Depends(get_session),
):
    if file.content_type not in ALLOWED_MIME:
        raise HTTPException(415, f"unsupported mime: {file.content_type}")
    raw = await file.read()
    if len(raw) > MAX_BYTES:
        raise HTTPException(413, "file too large (>10MB)")

    if crop:
        try:
            box = json.loads(crop)  # {x,y,w,h} in pixels
            img = Image.open(BytesIO(raw)).convert("RGB")
            x, y, w, h = int(box["x"]), int(box["y"]), int(box["w"]), int(box["h"])
            img = img.crop((x, y, x + w, y + h))
            out = BytesIO()
            img.save(out, format="JPEG", quality=95)
            raw = out.getvalue()
            file.content_type = "image/jpeg"
        except Exception as e:
            raise HTTPException(400, f"invalid crop: {e}")

    ext = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}.get(
        file.content_type, "jpg"
    )
    path = _safe_dir("products", project_id) / f"product.{ext}"
    path.write_bytes(raw)

    meta = await gemini_text.extract_product_meta(raw, file.content_type or "image/jpeg")

    session.add(
        Asset(
            project_id=project_id,
            kind="product",
            path=str(path),
            mime=file.content_type,
            meta_json=json.dumps(meta, ensure_ascii=False),
        )
    )
    await session.commit()

    return {
        "preview_url": _to_static_url(str(path)),
        "brand_name": meta.get("brand_name", ""),
        "package_type": meta.get("package_type", "bottle"),
        "color_dominant": meta.get("color_dominant", "#FFFFFF"),
    }
