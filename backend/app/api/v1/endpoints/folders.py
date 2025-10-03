"""
Folder management endpoints.
"""
from typing import Dict, Any
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Path
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import validate_any_auth
from app.services.folder_service import folder_service
from app.services.content_service import content_service
from app.models.schemas import (
    FolderCreate, FolderUpdate
)

router = APIRouter()


@router.get("")
async def get_folders(
    db: AsyncSession = Depends(get_db),
    auth_data: dict = Depends(validate_any_auth)
):
    """
    Get all folders for the authenticated user in hierarchical structure.

    Equivalent to: folders edge function (GET)
    """
    user_id = UUID(auth_data["user_id"])

    folders = await folder_service.get_folder_hierarchy(
        db=db,
        user_id=user_id
    )

    # Return in exact edge function format
    return {"folders": folders}


@router.post("")
async def create_folder(
    folder_data: FolderCreate,
    db: AsyncSession = Depends(get_db),
    auth_data: dict = Depends(validate_any_auth)
):
    """
    Create a new folder.

    Equivalent to: folders edge function (POST)
    """
    user_id = UUID(auth_data["user_id"])

    try:
        folder = await folder_service.create_folder(
            db=db,
            user_id=user_id,
            folder_data=folder_data
        )
        # Return safe format
        return {
            "id": str(folder.id),
            "user_id": str(folder.user_id),
            "name": folder.name,
            "description": folder.description,
            "parent_id": str(folder.parent_id) if folder.parent_id else None,
            "path": folder.path,
            "depth": folder.depth,
            "created_at": folder.created_at.isoformat() if folder.created_at else None,
            "updated_at": folder.updated_at.isoformat() if folder.updated_at else None
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to create folder")


@router.get("/{folder_id}")
async def get_folder(
    folder_id: UUID = Path(...),
    db: AsyncSession = Depends(get_db),
    auth_data: dict = Depends(validate_any_auth)
):
    """
    Get a specific folder by ID.
    """
    user_id = UUID(auth_data["user_id"])

    folder = await folder_service.get_folder(
        db=db,
        user_id=user_id,
        folder_id=folder_id
    )

    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found or access denied")

    # Return safe format
    return {
        "id": str(folder.id),
        "user_id": str(folder.user_id),
        "name": folder.name,
        "description": folder.description,
        "parent_id": str(folder.parent_id) if folder.parent_id else None,
        "path": folder.path,
        "depth": folder.depth,
        "created_at": folder.created_at.isoformat() if folder.created_at else None,
        "updated_at": folder.updated_at.isoformat() if folder.updated_at else None
    }


@router.put("/{folder_id}")
async def update_folder(
    update_data: FolderUpdate,
    folder_id: UUID = Path(...),
    db: AsyncSession = Depends(get_db),
    auth_data: dict = Depends(validate_any_auth)
):
    """
    Update a folder.
    """
    user_id = UUID(auth_data["user_id"])

    try:
        folder = await folder_service.update_folder(
            db=db,
            user_id=user_id,
            folder_id=folder_id,
            update_data=update_data
        )

        if not folder:
            raise HTTPException(status_code=404, detail="Folder not found or access denied")

        # Return safe format
        return {
            "id": str(folder.id),
            "user_id": str(folder.user_id),
            "name": folder.name,
            "description": folder.description,
            "parent_id": str(folder.parent_id) if folder.parent_id else None,
            "path": folder.path,
            "depth": folder.depth,
            "created_at": folder.created_at.isoformat() if folder.created_at else None,
            "updated_at": folder.updated_at.isoformat() if folder.updated_at else None
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to update folder")


@router.delete("/{folder_id}")
async def delete_folder(
    folder_id: UUID = Path(...),
    db: AsyncSession = Depends(get_db),
    auth_data: dict = Depends(validate_any_auth)
):
    """
    Delete a folder.

    Equivalent to: delete-item edge function (folder part)
    """
    user_id = UUID(auth_data["user_id"])

    try:
        success = await folder_service.delete_folder(
            db=db,
            user_id=user_id,
            folder_id=folder_id
        )

        if not success:
            raise HTTPException(status_code=404, detail="Folder not found or access denied")

        return {
            "success": True,
            "message": "Folder deleted successfully",
            "deleted_id": str(folder_id)
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to delete folder")


@router.get("/{folder_id}/content")
async def get_folder_content(
    folder_id: UUID = Path(...),
    db: AsyncSession = Depends(get_db),
    auth_data: dict = Depends(validate_any_auth)
) -> Dict[str, Any]:
    """
    Get content for a specific folder.

    Equivalent to: folder-content edge function
    """
    user_id = UUID(auth_data["user_id"])

    try:
        # The content_service.get_folder_content already returns the correct format
        content_data = await content_service.get_folder_content(
            db=db,
            user_id=user_id,
            folder_id=folder_id
        )
        return content_data
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to fetch folder content")