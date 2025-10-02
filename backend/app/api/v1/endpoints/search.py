"""
Search endpoints.
"""
from typing import List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import validate_dual_auth
from app.services.search_service import search_service
from app.models.schemas import (
    SearchQuery, ContentType
)

router = APIRouter()


@router.post("/vector")
async def vector_search(
    search_query: SearchQuery,
    db: AsyncSession = Depends(get_db),
    auth_data: dict = Depends(validate_dual_auth)
):
    """
    Perform semantic vector search.

    Equivalent to: vector-search edge function
    """
    user_id = UUID(auth_data["user_id"])

    try:
        results = await search_service.vector_search(
            db=db,
            user_id=user_id,
            query=search_query.query,
            folder_id=search_query.folder_id,
            content_types=search_query.content_types,
            limit=search_query.limit,
            similarity_threshold=search_query.similarity_threshold
        )

        return {
            "results": results,
            "query": search_query.query,
            "total_results": len(results),
            "filters": {
                "folder_id": str(search_query.folder_id) if search_query.folder_id else None,
                "content_types": [ct.value if hasattr(ct, 'value') else ct for ct in search_query.content_types] if search_query.content_types else None,
                "similarity_threshold": search_query.similarity_threshold
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail="Search failed")


@router.post("/text")
async def text_search(
    search_query: SearchQuery,
    db: AsyncSession = Depends(get_db),
    auth_data: dict = Depends(validate_dual_auth)
):
    """
    Perform text-based search.

    Equivalent to: query edge function
    """
    user_id = UUID(auth_data["user_id"])

    try:
        # Use the query_content method that returns edge function compatible format
        result = await search_service.query_content(
            db=db,
            user_id=user_id,
            query=search_query.query,
            folder_id=search_query.folder_id,
            content_types=[ct.value if hasattr(ct, 'value') else ct for ct in search_query.content_types] if search_query.content_types else None,
            limit=search_query.limit
        )

        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail="Text search failed")


@router.get("/")
async def search(
    q: str,
    search_type: str = "vector",  # "vector" or "text"
    folder_id: Optional[UUID] = None,
    content_types: Optional[List[ContentType]] = None,
    limit: int = 5,
    similarity_threshold: float = 0.7,
    db: AsyncSession = Depends(get_db),
    auth_data: dict = Depends(validate_dual_auth)
):
    """
    Unified search endpoint with query parameters.
    """
    user_id = UUID(auth_data["user_id"])

    if search_type not in ["vector", "text"]:
        raise HTTPException(status_code=400, detail="search_type must be 'vector' or 'text'")

    try:
        if search_type == "vector":
            results = await search_service.vector_search(
                db=db,
                user_id=user_id,
                query=q,
                folder_id=folder_id,
                content_types=content_types,
                limit=limit,
                similarity_threshold=similarity_threshold
            )
        else:
            results = await search_service.text_search(
                db=db,
                user_id=user_id,
                query=q,
                folder_id=folder_id,
                content_types=content_types,
                limit=limit
            )

        return SearchResponse(
            results=results,
            query=q,
            total_results=len(results),
            filters={
                "search_type": search_type,
                "folder_id": folder_id,
                "content_types": content_types,
                **({"similarity_threshold": similarity_threshold} if search_type == "vector" else {})
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"{search_type.title()} search failed")