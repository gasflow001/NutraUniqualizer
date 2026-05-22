"""Step 5: generate N variants via Flow + per-variant regenerate + edit chat."""
from __future__ import annotations

import asyncio
import json
import logging
import time
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from db import Asset, Layout, Project, Segment, SessionLocal, Variant
from deps import get_flow_client, get_project, get_session
from services import prompt_builder
from services.flow_client import FlowBannedError, FlowError
from services.flow_upload import upload_image_to_flow

logger = logging.getLogger("nutra.step4")

router = APIRouter(prefix="/api/projects/{project_id}/step5", tags=["step5"])


# project_id -> list[WebSocket] for progress streaming
_progress_sockets: dict[int, list[WebSocket]] = {}


async def _broadcast(project_id: int, msg: dict) -> None:
    for ws in list(_progress_sockets.get(project_id, [])):
        try:
            await ws.send_json(msg)
        except Exception:
            try:
                _progress_sockets[project_id].remove(ws)
            except ValueError:
                pass


def _safe_dir(kind: str, project_id: int) -> Path:
    p = settings.storage_dir / kind / str(project_id)
    p.mkdir(parents=True, exist_ok=True)
    return p


def _to_static_url(p: str) -> str:
    rel = Path(p).resolve().relative_to(settings.storage_dir)
    return "/storage/" + rel.as_posix()


async def _load_state(session: AsyncSession, project_id: int):
    seg = (
        await session.execute(
            select(Segment).where(Segment.project_id == project_id).order_by(desc(Segment.id))
        )
    ).scalars().first()
    if seg is None:
        raise HTTPException(400, "no segments — finish step 1 first")
    segments = json.loads(seg.json_data)

    layout_row = (
        await session.execute(
            select(Layout).where(Layout.project_id == project_id).order_by(desc(Layout.id))
        )
    ).scalars().first()
    layout = None
    mode = "auto"
    if layout_row:
        mode = layout_row.mode
        if layout_row.json_data:
            layout = json.loads(layout_row.json_data)

    product = (
        await session.execute(
            select(Asset).where(Asset.project_id == project_id, Asset.kind == "product")
        )
    ).scalars().first()
    if product is None:
        raise HTTPException(400, "no product photo — finish step 3 first")

    product_meta = json.loads(product.meta_json) if product.meta_json else {}

    # Step 4: design reference (optional but expected)
    design_ref = (
        await session.execute(
            select(Asset).where(Asset.project_id == project_id, Asset.kind == "design_ref").order_by(desc(Asset.id))
        )
    ).scalars().first()
    design_analysis = None
    design_ref_path = None
    if design_ref:
        design_analysis = json.loads(design_ref.meta_json) if design_ref.meta_json else None
        design_ref_path = Path(design_ref.path)

    # Certificate (optional)
    cert = (
        await session.execute(
            select(Asset).where(Asset.project_id == project_id, Asset.kind == "certificate").order_by(desc(Asset.id))
        )
    ).scalars().first()
    cert_path = Path(cert.path) if cert else None

    # Doctor photo (optional)
    doctor = (
        await session.execute(
            select(Asset).where(Asset.project_id == project_id, Asset.kind == "doctor").order_by(desc(Asset.id))
        )
    ).scalars().first()
    doctor_path = Path(doctor.path) if doctor else None

    return segments, layout, mode, product_meta, Path(product.path), product.mime or "image/jpeg", design_analysis, design_ref_path, cert_path, doctor_path


async def _ensure_product_uuid(project: Project, product_path: Path, client, session: AsyncSession) -> str:
    """Загружает фото товара в Flow и кэширует UUID в Project.product_media_uuid."""
    if project.product_media_uuid:
        return project.product_media_uuid

    bearer, recaptcha = await client._get_tokens()
    uuid = await upload_image_to_flow(
        product_path.read_bytes(), bearer, recaptcha, settings.FLOW_PROJECT_ID
    )
    project.product_media_uuid = uuid
    await session.commit()
    return uuid


@router.websocket("/progress")
async def step4_progress(ws: WebSocket, project_id: int):
    await ws.accept()
    _progress_sockets.setdefault(project_id, []).append(ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        return
    finally:
        try:
            _progress_sockets[project_id].remove(ws)
        except (KeyError, ValueError):
            pass


@router.post("/generate")
async def generate_variants(
    project_id: int,
    payload: dict,
    project: Project = Depends(get_project),
    session: AsyncSession = Depends(get_session),
):
    if not settings.FLOW_PROJECT_ID:
        raise HTTPException(400, "FLOW_PROJECT_ID not configured in .env")

    n = max(1, min(10, int(payload.get("n_variants") or 3)))
    requested_model = payload.get("model") or "auto"
    aspect_ratio = payload.get("aspect_ratio") or "IMAGE_ASPECT_RATIO_SQUARE"

    segments, layout, mode, product_meta, product_path, _, design_analysis, design_ref_path, cert_path, doctor_path = await _load_state(session, project_id)
    aspect_short = {
        "IMAGE_ASPECT_RATIO_SQUARE": "1:1",
        "IMAGE_ASPECT_RATIO_PORTRAIT": "4:5",
    }.get(aspect_ratio, "1:1")
    prompt = prompt_builder.build(
        segments=segments,
        layout=layout,
        layout_mode=mode,
        product_meta=product_meta,
        aspect_ratio=aspect_short,
        design_analysis=design_analysis,
        has_certificate=cert_path is not None and cert_path.exists(),
        has_doctor=doctor_path is not None and doctor_path.exists(),
    )

    source_lang = (segments or {}).get("source_lang")
    model, warning = prompt_builder.select_model(source_lang, requested_model)

    client = await get_flow_client()
    try:
        product_uuid = await _ensure_product_uuid(project, product_path, client, session)
    except Exception as e:
        logger.exception("product upload failed")
        cls = e.__class__.__name__
        msg = str(e) or repr(e) or cls
        raise HTTPException(502, f"product upload to Flow failed: {cls}: {msg}")

    # Upload design reference to Flow (if present) for visual context
    design_ref_uuid = None
    if design_ref_path and design_ref_path.exists():
        try:
            bearer, recaptcha = await client._get_tokens()
            design_ref_uuid = await upload_image_to_flow(
                design_ref_path.read_bytes(), bearer, recaptcha, settings.FLOW_PROJECT_ID
            )
        except Exception as e:
            logger.warning("design ref upload failed (non-fatal): %s", e)

    # Upload certificate to Flow (if present)
    cert_uuid = None
    if cert_path and cert_path.exists():
        try:
            bearer_c, recaptcha_c = await client._get_tokens()
            cert_uuid = await upload_image_to_flow(
                cert_path.read_bytes(), bearer_c, recaptcha_c, settings.FLOW_PROJECT_ID
            )
        except Exception as e:
            logger.warning("certificate upload failed (non-fatal): %s", e)

    # Upload doctor photo to Flow (if present)
    doctor_uuid = None
    if doctor_path and doctor_path.exists():
        try:
            bearer_d, recaptcha_d = await client._get_tokens()
            doctor_uuid = await upload_image_to_flow(
                doctor_path.read_bytes(), bearer_d, recaptcha_d, settings.FLOW_PROJECT_ID
            )
        except Exception as e:
            logger.warning("doctor upload failed (non-fatal): %s", e)

    await _broadcast(project_id, {"type": "start", "n": n, "model": model, "warning": warning})

    results: list[dict] = []
    errors: list[str] = []

    async def one(i: int):
        await _broadcast(project_id, {"type": "request", "index": i, "stage": "send"})
        try:
            ref_ids = [product_uuid]
            if design_ref_uuid:
                ref_ids.append(design_ref_uuid)
            if cert_uuid:
                ref_ids.append(cert_uuid)
            if doctor_uuid:
                ref_ids.append(doctor_uuid)
            img = await client.generate(
                prompt=prompt,
                reference_media_ids=ref_ids,
                model=model,
                aspect_ratio=aspect_ratio,
            )
        except FlowBannedError as e:
            msg = f"banned: {e}"
            errors.append(msg)
            logger.error("variant %d banned: %s", i, e)
            await _broadcast(project_id, {"type": "error", "index": i, "message": msg, "fatal": True})
            return
        except Exception as e:
            cls = e.__class__.__name__
            msg = f"{cls}: {e}" if str(e) else cls
            errors.append(msg)
            logger.exception("variant %d failed", i)
            await _broadcast(project_id, {"type": "error", "index": i, "message": msg})
            return

        await _broadcast(project_id, {"type": "image", "index": i, "stage": "save"})
        path = _safe_dir("outputs", project_id) / f"v{i}_{int(time.time())}.png"
        path.write_bytes(img)

        async with SessionLocal() as s2:
            v = Variant(
                project_id=project_id,
                revision=0,
                path=str(path),
                prompt=prompt,
                model=model,
                aspect_ratio=aspect_ratio,
            )
            s2.add(v)
            await s2.commit()
            await s2.refresh(v)
            results.append({"id": v.id, "url": _to_static_url(str(path)), "revision": 0})

        await _broadcast(project_id, {"type": "done", "index": i, "url": _to_static_url(str(path))})

    await asyncio.gather(*(one(i) for i in range(1, n + 1)), return_exceptions=True)
    await _broadcast(project_id, {"type": "complete", "count": len(results), "errors": errors})

    if not results:
        msg = "; ".join(errors[:3]) if errors else "no variants produced"
        logger.error("step4/generate produced no variants: %s", msg)
        raise HTTPException(502, msg)

    return {"variants": results, "model": model, "warning": warning, "errors": errors}


@router.post("/regenerate/{variant_id}")
async def regenerate_one(
    project_id: int,
    variant_id: int,
    project: Project = Depends(get_project),
    session: AsyncSession = Depends(get_session),
):
    parent = await session.get(Variant, variant_id)
    if parent is None or parent.project_id != project_id:
        raise HTTPException(404, "variant not found")

    segments, layout, mode, product_meta, product_path, _, design_analysis, _, cert_path, doctor_path = await _load_state(session, project_id)
    prompt = prompt_builder.build(
        segments=segments, layout=layout, layout_mode=mode, product_meta=product_meta,
        design_analysis=design_analysis,
        has_certificate=cert_path is not None and cert_path.exists(),
        has_doctor=doctor_path is not None and doctor_path.exists(),
    )
    source_lang = (segments or {}).get("source_lang")
    model, _ = prompt_builder.select_model(source_lang, "auto")

    client = await get_flow_client()
    product_uuid = await _ensure_product_uuid(project, product_path, client, session)

    img = await client.generate(
        prompt=prompt,
        reference_media_ids=[product_uuid],
        model=model,
        aspect_ratio=parent.aspect_ratio,
    )
    out = _safe_dir("outputs", project_id) / f"v{variant_id}_re_{int(time.time())}.png"
    out.write_bytes(img)
    new = Variant(
        project_id=project_id,
        revision=parent.revision + 1,
        parent_variant_id=parent.id,
        path=str(out),
        prompt=prompt,
        model=model,
        aspect_ratio=parent.aspect_ratio,
    )
    session.add(new)
    await session.commit()
    await session.refresh(new)
    return {
        "id": new.id,
        "url": _to_static_url(str(out)),
        "revision": new.revision,
        "parent_variant_id": new.parent_variant_id,
    }


@router.post("/edit/{variant_id}")
async def edit_one(
    project_id: int,
    variant_id: int,
    payload: dict,
    project: Project = Depends(get_project),
    session: AsyncSession = Depends(get_session),
):
    instruction = (payload.get("instruction") or "").strip()
    if not instruction:
        raise HTTPException(400, "instruction required")

    parent = await session.get(Variant, variant_id)
    if parent is None or parent.project_id != project_id:
        raise HTTPException(404, "variant not found")

    segments, layout, mode, product_meta, product_path, _, design_analysis, _, cert_path, doctor_path = await _load_state(session, project_id)
    base_prompt = prompt_builder.build(
        segments=segments, layout=layout, layout_mode=mode, product_meta=product_meta,
        design_analysis=design_analysis,
        has_certificate=cert_path is not None and cert_path.exists(),
        has_doctor=doctor_path is not None and doctor_path.exists(),
    )
    prompt = prompt_builder.build_edit_prompt(base_prompt, instruction)
    source_lang = (segments or {}).get("source_lang")
    model, _ = prompt_builder.select_model(source_lang, "auto")

    client = await get_flow_client()
    product_uuid = await _ensure_product_uuid(project, product_path, client, session)

    # Загружаем текущий вариант в Flow → получаем второй UUID для imageInputs.
    bearer, recaptcha = await client._get_tokens()
    parent_uuid = await upload_image_to_flow(
        Path(parent.path).read_bytes(), bearer, recaptcha, settings.FLOW_PROJECT_ID
    )

    img = await client.generate(
        prompt=prompt,
        reference_media_ids=[product_uuid, parent_uuid],
        model=model,
        aspect_ratio=parent.aspect_ratio,
    )
    out = _safe_dir("outputs", project_id) / f"v{variant_id}.{parent.revision + 1}.png"
    out.write_bytes(img)
    new = Variant(
        project_id=project_id,
        revision=parent.revision + 1,
        parent_variant_id=parent.id,
        path=str(out),
        prompt=prompt,
        model=model,
        aspect_ratio=parent.aspect_ratio,
    )
    session.add(new)
    await session.commit()
    await session.refresh(new)
    return {
        "id": new.id,
        "url": _to_static_url(str(out)),
        "revision": new.revision,
        "parent_variant_id": new.parent_variant_id,
    }
