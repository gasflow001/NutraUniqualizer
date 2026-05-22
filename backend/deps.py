"""Shared singletons and dependency providers."""
from __future__ import annotations

import asyncio
from typing import AsyncGenerator

from fastapi import Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from db import Project, SessionLocal


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with SessionLocal() as s:
        yield s


async def get_project(project_id: int, session: AsyncSession = Depends(get_session)) -> Project:
    p = await session.get(Project, project_id)
    if p is None:
        raise HTTPException(status_code=404, detail=f"project {project_id} not found")
    return p


_flow_chrome = None
_flow_auth = None
_flow_client = None
_flow_lock = asyncio.Lock()


async def get_flow_client():
    """Lazy singleton for FlowClient (Chrome + auth + generator)."""
    global _flow_chrome, _flow_auth, _flow_client
    async with _flow_lock:
        if _flow_client is None:
            from config import settings
            from services.flow_chrome import FlowChrome
            from services.flow_auth import FlowAuth
            from services.flow_client import FlowClient

            _flow_chrome = FlowChrome(settings)
            _flow_auth = FlowAuth(_flow_chrome, settings)
            _flow_client = FlowClient(_flow_chrome, _flow_auth, settings)
    return _flow_client


async def get_flow_chrome():
    await get_flow_client()
    return _flow_chrome
