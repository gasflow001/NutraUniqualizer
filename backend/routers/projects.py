"""Project CRUD + history listing."""
from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from db import Asset, Layout, Project, Segment, Variant
from deps import get_session, get_project

router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.post("")
async def create_project(session: AsyncSession = Depends(get_session)):
    p = Project(name=f"Project {datetime.utcnow():%Y-%m-%d %H:%M}")
    session.add(p)
    await session.commit()
    await session.refresh(p)
    return {"project_id": p.id}


@router.get("")
async def list_projects(session: AsyncSession = Depends(get_session)):
    rows = (
        await session.execute(select(Project).order_by(desc(Project.updated_at)))
    ).scalars().all()
    items = []
    for p in rows:
        thumb = None
        src = (
            await session.execute(
                select(Asset).where(Asset.project_id == p.id, Asset.kind == "source").order_by(desc(Asset.id))
            )
        ).scalars().first()
        if src:
            thumb = _to_static_url(src.path)
        items.append(
            {
                "id": p.id,
                "name": p.name,
                "status": p.status,
                "source_lang": p.source_lang,
                "created_at": p.created_at.isoformat(),
                "updated_at": p.updated_at.isoformat(),
                "thumbnail": thumb,
            }
        )
    return {"projects": items}


@router.get("/history")
async def list_history(session: AsyncSession = Depends(get_session)):
    """Return completed projects (with finals) and all context used for generation."""
    # Get all projects that have at least one final variant
    all_projects = (
        await session.execute(select(Project).order_by(desc(Project.updated_at)))
    ).scalars().all()

    history = []
    for p in all_projects:
        # Get final variants
        finals = (
            await session.execute(
                select(Variant)
                .where(Variant.project_id == p.id, Variant.is_final == True)
                .order_by(Variant.id)
            )
        ).scalars().all()
        if not finals:
            continue

        # Source creative (step 1 upload)
        source_asset = (
            await session.execute(
                select(Asset)
                .where(Asset.project_id == p.id, Asset.kind == "source")
                .order_by(desc(Asset.id))
            )
        ).scalars().first()

        # Product photo (step 3)
        product_asset = (
            await session.execute(
                select(Asset)
                .where(Asset.project_id == p.id, Asset.kind == "product")
                .order_by(desc(Asset.id))
            )
        ).scalars().first()

        # Design reference (step 4)
        design_ref_asset = (
            await session.execute(
                select(Asset)
                .where(Asset.project_id == p.id, Asset.kind == "design_ref")
                .order_by(desc(Asset.id))
            )
        ).scalars().first()

        # Text segments (step 1)
        seg = (
            await session.execute(
                select(Segment)
                .where(Segment.project_id == p.id)
                .order_by(desc(Segment.id))
            )
        ).scalars().first()

        history.append({
            "id": p.id,
            "name": p.name,
            "source_lang": p.source_lang,
            "created_at": p.created_at.isoformat(),
            "updated_at": p.updated_at.isoformat(),
            "source_url": _to_static_url(source_asset.path) if source_asset else None,
            "product_url": _to_static_url(product_asset.path) if product_asset else None,
            "design_ref_url": _to_static_url(design_ref_asset.path) if design_ref_asset else None,
            "segments": _maybe_json(seg.json_data) if seg else None,
            "finals": [
                {
                    "id": v.id,
                    "url": _to_static_url(v.final_path) if v.final_path else _to_static_url(v.path),
                    "prompt": (v.prompt or "")[:500],
                }
                for v in finals
            ],
        })

    return {"history": history}


@router.get("/{project_id}")
async def get_full_state(
    project_id: int,
    session: AsyncSession = Depends(get_session),
    project: Project = Depends(get_project),
):
    assets = (
        await session.execute(select(Asset).where(Asset.project_id == project_id))
    ).scalars().all()
    seg = (
        await session.execute(
            select(Segment)
            .where(Segment.project_id == project_id)
            .order_by(desc(Segment.id))
        )
    ).scalars().first()
    layout = (
        await session.execute(
            select(Layout)
            .where(Layout.project_id == project_id)
            .order_by(desc(Layout.id))
        )
    ).scalars().first()
    variants = (
        await session.execute(
            select(Variant)
            .where(Variant.project_id == project_id)
            .order_by(Variant.id)
        )
    ).scalars().all()

    return {
        "id": project.id,
        "name": project.name,
        "status": project.status,
        "source_lang": project.source_lang,
        "layout_mode": project.layout_mode,
        "product_media_uuid": project.product_media_uuid,
        "assets": [
            {"id": a.id, "kind": a.kind, "url": _to_static_url(a.path), "meta": _maybe_json(a.meta_json)}
            for a in assets
        ],
        "segments": _maybe_json(seg.json_data) if seg else None,
        "layout": {"mode": layout.mode, "data": _maybe_json(layout.json_data)} if layout else None,
        "variants": [
            {
                "id": v.id,
                "revision": v.revision,
                "url": _to_static_url(v.path),
                "model": v.model,
                "aspect_ratio": v.aspect_ratio,
                "is_final": v.is_final,
                "final_url": _to_static_url(v.final_path) if v.final_path else None,
            }
            for v in variants
        ],
    }


def _to_static_url(p: str | None) -> str | None:
    if not p:
        return None
    abs_path = Path(p)
    try:
        rel = abs_path.resolve().relative_to(settings.storage_dir)
        return "/storage/" + rel.as_posix()
    except ValueError:
        return None


def _maybe_json(s: str | None):
    if not s:
        return None
    try:
        return json.loads(s)
    except Exception:
        return s
