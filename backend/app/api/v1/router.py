"""
Main API router for v1 endpoints.
"""
from fastapi import APIRouter

from app.api.v1.endpoints import (
    auth,
    content,
    folders,
    search,
    chat,
    files
)

api_router = APIRouter()

# Include all endpoint routers
api_router.include_router(auth.router, prefix="/auth", tags=["authentication"])
api_router.include_router(content.router, prefix="/content", tags=["content"])
api_router.include_router(folders.router, prefix="/folders", tags=["folders"])
api_router.include_router(search.router, prefix="/search", tags=["search"])
api_router.include_router(chat.router, prefix="/chat", tags=["chat"])
api_router.include_router(files.router, prefix="/files", tags=["files"])