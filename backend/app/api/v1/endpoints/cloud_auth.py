"""
Cloud SQL-based authentication endpoints.
"""
from fastapi import APIRouter, Depends, HTTPException, status, Header, Request, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
import logging
from uuid import UUID

from app.core.database import get_db
from app.services.auth_service import auth_service
from app.models.auth_schemas import (
    UserSignUp,
    UserLogin,
    TokenResponse,
    RefreshTokenRequest,
    PasswordResetRequest,
    PasswordResetConfirm,
    PasswordChange,
    EmailVerification,
    UserResponse,
    UserProfileUpdate,
    UserProfileResponse
)
from app.core.security import validate_jwt_token

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def signup(
    signup_data: UserSignUp,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """
    Register a new user.

    - Creates user account
    - Sends verification email (if email service configured)
    - Returns access and refresh tokens
    """
    try:
        # Create user
        user = await auth_service.create_user(db, signup_data)

        # Get request metadata
        user_agent = request.headers.get("user-agent")
        ip_address = request.client.host if request.client else None

        # Create tokens
        tokens = await auth_service.create_tokens(db, user, user_agent, ip_address)

        logger.info(f"New user registered: {user.email}")
        return tokens

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Signup error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create user"
        )


@router.post("/login", response_model=TokenResponse)
async def login(
    login_data: UserLogin,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """
    Login with email and password.

    Returns:
    - access_token: Short-lived JWT token (30 minutes)
    - refresh_token: Long-lived token for refreshing access token (7 days)
    """
    user = await auth_service.authenticate_user(db, login_data)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Get request metadata
    user_agent = request.headers.get("user-agent")
    ip_address = request.client.host if request.client else None

    # Create tokens
    tokens = await auth_service.create_tokens(db, user, user_agent, ip_address)

    logger.info(f"User logged in: {user.email}")
    return tokens


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    token_data: RefreshTokenRequest,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """
    Refresh access token using refresh token.

    The old refresh token is revoked and new tokens are issued.
    """
    tokens = await auth_service.refresh_access_token(db, token_data.refresh_token)

    if not tokens:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Revoke old refresh token
    await auth_service.revoke_refresh_token(db, token_data.refresh_token)

    logger.info("Access token refreshed")
    return tokens


@router.post("/logout")
async def logout(
    token_data: RefreshTokenRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Logout user by revoking refresh token.

    The access token will remain valid until it expires (30 minutes).
    """
    success = await auth_service.revoke_refresh_token(db, token_data.refresh_token)

    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid refresh token"
        )

    logger.info("User logged out")
    return {"message": "Logged out successfully"}


@router.post("/logout-all")
async def logout_all(
    auth_data: dict = Depends(validate_jwt_token),
    db: AsyncSession = Depends(get_db)
):
    """
    Logout from all devices by revoking all refresh tokens.

    Requires valid access token.
    """
    user_id = auth_data["user_id"]
    count = await auth_service.revoke_all_user_tokens(db, user_id)

    logger.info(f"User logged out from all devices: {user_id}")
    return {"message": f"Logged out from {count} devices"}


@router.post("/verify-email")
async def verify_email(
    verification_data: EmailVerification,
    db: AsyncSession = Depends(get_db)
):
    """
    Verify user email with verification token.

    Sent via email after signup.
    """
    success = await auth_service.verify_email(db, verification_data.token)

    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification token"
        )

    return {"message": "Email verified successfully"}


@router.post("/password-reset/request")
async def request_password_reset(
    reset_request: PasswordResetRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Request password reset.

    Sends reset token via email (if email service configured).
    Always returns success to avoid email enumeration.
    """
    token = await auth_service.create_password_reset_token(db, reset_request.email)

    # TODO: Send email with reset token
    # For now, log it (DO NOT do this in production)
    if token:
        logger.info(f"Password reset token: {token}")

    # Always return success (don't reveal if email exists)
    return {"message": "If the email exists, a password reset link has been sent"}


@router.post("/password-reset/confirm")
async def confirm_password_reset(
    reset_data: PasswordResetConfirm,
    db: AsyncSession = Depends(get_db)
):
    """
    Reset password using reset token.
    """
    success = await auth_service.reset_password(db, reset_data.token, reset_data.new_password)

    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token"
        )

    return {"message": "Password reset successfully"}


@router.post("/password/change")
async def change_password(
    password_data: PasswordChange,
    auth_data: dict = Depends(validate_jwt_token),
    db: AsyncSession = Depends(get_db)
):
    """
    Change password for authenticated user.

    Requires current password for security.
    Revokes all refresh tokens after password change.
    """
    user_id = auth_data["user_id"]

    success = await auth_service.change_password(
        db,
        user_id,
        password_data.current_password,
        password_data.new_password
    )

    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect"
        )

    return {"message": "Password changed successfully. Please login again."}


@router.get("/me", response_model=UserResponse)
async def get_current_user(
    auth_data: dict = Depends(validate_jwt_token),
    db: AsyncSession = Depends(get_db)
):
    """
    Get current authenticated user information.
    """
    from app.models.auth import User
    from app.models.database import Profile
    from sqlalchemy import select

    user_id = auth_data["user_id"]

    # Get user from auth table
    stmt = select(User).where(User.id == user_id)
    result = await db.execute(stmt)
    user = result.scalars().first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    # Get avatar_url and updated_at from profile table
    profile_stmt = select(Profile).where(Profile.user_id == user_id)
    profile_result = await db.execute(profile_stmt)
    profile = profile_result.scalars().first()

    # Convert avatar_url to proxy URL if needed
    avatar_url = None
    if profile and profile.avatar_url:
        if profile.avatar_url.startswith('data:'):
            # Base64 data URL - use as-is (local dev)
            avatar_url = profile.avatar_url
        else:
            # GCS path or old GCS URL - return proxy URL
            avatar_url = f"/api/v1/cloud-auth/profile/avatar/{user_id}"

    # Create response with avatar_url and profile_updated_at for cache busting
    user_dict = {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "avatar_url": avatar_url,
        "profile_updated_at": profile.updated_at if profile else None,
        "is_active": user.is_active,
        "is_verified": user.is_verified,
        "created_at": user.created_at,
        "last_login": user.last_login
    }

    return UserResponse.model_validate(user_dict)


@router.get("/profile", response_model=UserProfileResponse)
async def get_profile(
    auth_data: dict = Depends(validate_jwt_token),
    db: AsyncSession = Depends(get_db)
):
    """
    Get user profile information.
    """
    from app.models.database import Profile
    from sqlalchemy import select

    user_id = auth_data["user_id"]

    stmt = select(Profile).where(Profile.user_id == user_id)
    result = await db.execute(stmt)
    profile = result.scalars().first()

    if not profile:
        # Create profile if it doesn't exist
        profile = Profile(
            user_id=user_id,
            email=auth_data.get("email", ""),
            full_name=None
        )
        db.add(profile)
        await db.commit()
        await db.refresh(profile)

    # Convert profile to dict and update avatar_url to proxy URL if needed
    profile_dict = {
        "id": profile.id,
        "email": profile.email,
        "full_name": profile.full_name,
        "job_title": profile.job_title,
        "company": profile.company,
        "industry": profile.industry,
        "interests": profile.interests,
        "communication_style": profile.communication_style,
        "timezone": profile.timezone,
        "primary_goals": profile.primary_goals,
        "use_cases": profile.use_cases,
        "preferred_response_length": profile.preferred_response_length,
        "topics_of_interest": profile.topics_of_interest,
        "profile_completed": profile.profile_completed,
        "profile_completed_at": profile.profile_completed_at,
        "created_at": profile.created_at,
        "updated_at": profile.updated_at,
    }

    # Convert avatar_url to proxy URL if needed
    if profile.avatar_url:
        if profile.avatar_url.startswith('data:'):
            # Base64 data URL - use as-is (local dev)
            profile_dict["avatar_url"] = profile.avatar_url
        else:
            # GCS path or old GCS URL - return proxy URL
            profile_dict["avatar_url"] = f"/api/v1/cloud-auth/profile/avatar/{user_id}"
    else:
        profile_dict["avatar_url"] = None

    return UserProfileResponse.model_validate(profile_dict)


@router.put("/profile", response_model=dict)
async def update_profile(
    profile_data: UserProfileUpdate,
    auth_data: dict = Depends(validate_jwt_token),
    db: AsyncSession = Depends(get_db)
):
    """
    Update user profile information.
    """
    from app.models.database import Profile
    from sqlalchemy import select
    from datetime import datetime, timezone

    logger.info(f"🔵 Profile update request for user {auth_data.get('user_id')}")
    logger.info(f"📝 Profile data received: {profile_data.model_dump(exclude_unset=True)}")

    user_id = auth_data["user_id"]

    stmt = select(Profile).where(Profile.user_id == user_id)
    result = await db.execute(stmt)
    profile = result.scalars().first()

    if not profile:
        logger.info(f"📋 Creating new profile for user {user_id}")
        # Create profile if it doesn't exist
        profile = Profile(
            user_id=user_id,
            email=auth_data.get("email", "")
        )
        db.add(profile)

    # Update profile fields
    update_data = profile_data.model_dump(exclude_unset=True)
    logger.info(f"🔄 Updating profile fields: {list(update_data.keys())}")

    for field, value in update_data.items():
        setattr(profile, field, value)

    # Mark profile as completed if it wasn't already
    if not profile.profile_completed:
        logger.info("✅ Marking profile as completed")
        profile.profile_completed = True
        profile.profile_completed_at = datetime.utcnow()

    profile.updated_at = datetime.utcnow()

    try:
        await db.commit()
        await db.refresh(profile)
        logger.info(f"✅ Profile updated successfully for user {user_id}")
    except Exception as e:
        logger.error(f"❌ Failed to commit profile changes: {e}")
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save profile changes"
        )

    return {
        "success": True,
        "message": "Profile updated successfully",
        "profile": UserProfileResponse.model_validate(profile)
    }


@router.post("/profile/avatar", response_model=dict)
async def upload_avatar(
    file: UploadFile = File(...),
    auth_data: dict = Depends(validate_jwt_token),
    db: AsyncSession = Depends(get_db),
    request: Request = None
):
    """Upload profile avatar image."""
    user_id = auth_data["user_id"]

    # Validate file type
    allowed_types = ["image/jpeg", "image/png", "image/webp", "image/gif"]
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Only image files allowed (JPEG, PNG, WebP, GIF)")

    # Validate file size (max 5MB)
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image must be smaller than 5MB")
    await file.seek(0)

    # Upload to GCS in avatars/ folder
    from app.core.storage import storage_service
    from app.config import settings
    gcs_path = f"avatars/{user_id}/{file.filename}"

    # Read file content
    content = await file.read()
    await file.seek(0)  # Reset file pointer for potential later use

    # Upload to storage backend (GCS/local)
    storage_url = await storage_service.upload_content(
        gcs_path,
        content,
        file.content_type or "application/octet-stream"
    )

    logger.info(f"Avatar uploaded to storage: {storage_url}")

    # For local development with base64 data URLs, use as-is
    # For cloud with GCS, return proxy URL instead of direct GCS URL
    if storage_url.startswith('data:'):
        # Local development - use base64 data URL directly
        avatar_url = storage_url
        logger.info(f"Using base64 data URL for local development")
    else:
        # Cloud deployment - use backend proxy URL to serve from GCS
        # Store the GCS path in the database for the proxy to use
        avatar_url = gcs_path
        logger.info(f"Stored GCS path for proxy access: {avatar_url}")

    # Update profile with avatar URL/path
    from sqlalchemy import select, update
    from app.models.database import Profile
    await db.execute(
        update(Profile).where(Profile.user_id == user_id).values(avatar_url=avatar_url)
    )
    await db.commit()

    # Return the proxy URL to the client
    if avatar_url.startswith('data:'):
        # Return base64 URL as-is for local dev
        return {"avatar_url": avatar_url}
    else:
        # Return backend proxy URL for cloud deployment
        proxy_url = f"/api/v1/cloud-auth/profile/avatar/{user_id}"
        logger.info(f"Returning proxy URL to client: {proxy_url}")
        return {"avatar_url": proxy_url}


@router.get("/profile/avatar/{user_id}")
async def get_avatar(
    user_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """
    Serve user avatar image via backend proxy.
    This endpoint fetches the avatar from GCS and serves it to the client.
    Works with private GCS buckets that don't allow public access.
    """
    from fastapi.responses import Response
    from sqlalchemy import select
    from app.models.database import Profile
    from app.core.storage import storage_service
    from app.config import settings

    # Get user profile
    result = await db.execute(select(Profile).where(Profile.user_id == user_id))
    profile = result.scalar_one_or_none()

    if not profile or not profile.avatar_url:
        raise HTTPException(status_code=404, detail="Avatar not found")

    try:
        # For local development with base64 data URLs
        if profile.avatar_url.startswith('data:'):
            # Extract the base64 data and content type
            import re
            match = re.match(r'data:([^;]+);base64,(.+)', profile.avatar_url)
            if match:
                content_type = match.group(1)
                import base64
                image_data = base64.b64decode(match.group(2))
                return Response(
                    content=image_data,
                    media_type=content_type,
                    headers={
                        "Cache-Control": "public, max-age=3600",
                        "ETag": f'"{user_id}-{int(profile.updated_at.timestamp())}"'
                    }
                )

        # For GCS storage - extract the storage path from the URL
        # Profile avatar_url might be a GCS URL or just the path
        if profile.avatar_url.startswith('http'):
            # Extract path from full URL
            from urllib.parse import urlparse
            parsed_url = urlparse(profile.avatar_url)
            gcs_path = parsed_url.path.lstrip('/')
            # Remove bucket name if present in path
            if gcs_path.startswith(f"{settings.GCS_BUCKET_NAME}/"):
                gcs_path = gcs_path[len(f"{settings.GCS_BUCKET_NAME}/"):]
        else:
            # Already a path
            gcs_path = profile.avatar_url.lstrip('/')

        # Download from GCS
        content = await storage_service.download_content(gcs_path)

        # Determine content type from filename
        import mimetypes
        content_type = mimetypes.guess_type(gcs_path)[0] or 'image/jpeg'

        return Response(
            content=content,
            media_type=content_type,
            headers={
                "Cache-Control": "public, max-age=3600",  # Cache for 1 hour
                "ETag": f'"{user_id}-{int(profile.updated_at.timestamp())}"'
            }
        )

    except Exception as e:
        logger.error(f"Failed to fetch avatar from storage: {e}")
        raise HTTPException(status_code=404, detail="Avatar not found")


@router.delete("/profile/avatar", response_model=dict)
async def delete_avatar(
    auth_data: dict = Depends(validate_jwt_token),
    db: AsyncSession = Depends(get_db)
):
    """Delete profile avatar."""
    user_id = auth_data["user_id"]

    # Get current avatar URL
    from sqlalchemy import select, update
    from app.models.database import Profile
    result = await db.execute(select(Profile).where(Profile.user_id == user_id))
    profile = result.scalar_one_or_none()

    # Delete from GCS if exists
    if profile and profile.avatar_url:
        from app.core.storage import storage_service
        from app.config import settings
        from urllib.parse import urlparse

        # Extract GCS path safely from full URL or path
        try:
            # Skip deletion for base64 data URLs (local dev)
            if profile.avatar_url.startswith('data:'):
                logger.info("Skipping GCS deletion for base64 data URL")
            else:
                # Extract path from URL or use as-is if already a path
                if profile.avatar_url.startswith('http'):
                    parsed_url = urlparse(profile.avatar_url)
                    gcs_path = parsed_url.path.lstrip('/')
                    # Remove bucket name if present
                    if gcs_path.startswith(f"{settings.GCS_BUCKET_NAME}/"):
                        gcs_path = gcs_path[len(f"{settings.GCS_BUCKET_NAME}/"):]
                else:
                    # Already a path (from proxy URL format)
                    gcs_path = profile.avatar_url.lstrip('/')

                if gcs_path:
                    await storage_service.delete_content(gcs_path)
                    logger.info(f"Deleted avatar from GCS: {gcs_path}")
                else:
                    logger.warning(f"Could not extract GCS path from avatar URL: {profile.avatar_url}")

        except Exception as e:
            logger.error(f"Failed to delete avatar from storage: {e}")
            # Don't block the operation - just log the error

    # Clear avatar_url
    await db.execute(
        update(Profile).where(Profile.user_id == user_id).values(avatar_url=None)
    )
    await db.commit()

    return {"message": "Avatar deleted"}
