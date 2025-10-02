"""
Authentication endpoints.
"""
from fastapi import APIRouter, Depends, HTTPException, Header
from typing import Optional, List
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import validate_api_key_dependency, validate_supabase_token, validate_dual_auth
from app.core.database import get_db
from app.services.api_key_service import api_key_service
from app.models.schemas import ApiKeyValidation, ApiKeyCreate, ApiKeyResponse
from app.config import settings

router = APIRouter()


@router.post("/validate-api-key", response_model=ApiKeyValidation)
async def validate_api_key(
    x_api_key: Optional[str] = Header(None),
    x_user_id: Optional[str] = Header(None),
    auth_data: dict = Depends(validate_api_key_dependency)
):
    """
    Validate API key and return user information.

    Equivalent to: validate-api-key edge function
    """
    return ApiKeyValidation(**auth_data)


@router.post("/api-keys", response_model=ApiKeyResponse)
async def create_api_key(
    api_key_data: ApiKeyCreate,
    db: AsyncSession = Depends(get_db),
    auth_data: dict = Depends(validate_supabase_token)
):
    """
    Create a new API key for the authenticated user.
    Only accessible via Supabase JWT (web app).
    """
    user_id = UUID(auth_data["user_id"])

    try:
        api_key_response = await api_key_service.create_api_key(
            db=db,
            user_id=user_id,
            name=api_key_data.name,
            expires_in_days=api_key_data.expires_in_days
        )
        return api_key_response
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to create API key")


@router.get("/api-keys", response_model=List[ApiKeyResponse])
async def list_api_keys(
    db: AsyncSession = Depends(get_db),
    auth_data: dict = Depends(validate_supabase_token)
):
    """
    List all API keys for the authenticated user.
    Only accessible via Supabase JWT (web app).
    """
    user_id = UUID(auth_data["user_id"])

    try:
        api_keys = await api_key_service.get_user_api_keys(db=db, user_id=user_id)
        return api_keys
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to fetch API keys")


@router.delete("/api-keys/{api_key_id}")
async def delete_api_key(
    api_key_id: UUID,
    db: AsyncSession = Depends(get_db),
    auth_data: dict = Depends(validate_supabase_token)
):
    """
    Delete an API key.
    Only accessible via Supabase JWT (web app).
    """
    user_id = UUID(auth_data["user_id"])

    try:
        success = await api_key_service.delete_api_key(
            db=db,
            user_id=user_id,
            api_key_id=api_key_id
        )

        if not success:
            raise HTTPException(status_code=404, detail="API key not found")

        return {"success": True, "message": "API key deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to delete API key")


@router.post("/dev/create-temp-api-key", response_model=ApiKeyResponse)
async def create_temp_api_key_dev(
    db: AsyncSession = Depends(get_db)
):
    """
    Development-only endpoint to create a temp API key.
    Only available in development environment.
    """
    if settings.ENVIRONMENT != "development":
        raise HTTPException(status_code=404, detail="Not found")

    # Use the development user ID
    dev_user_id = UUID("00000000-0000-0000-0000-000000000001")

    try:
        # Create the temp API key that the frontend expects
        api_key_response = await api_key_service.create_api_key(
            db=db,
            user_id=dev_user_id,
            name="Development Temp Key",
            expires_in_days=30
        )
        return api_key_response
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create temp API key: {str(e)}")