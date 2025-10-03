"""
Cloud SQL-based authentication endpoints.
"""
from fastapi import APIRouter, Depends, HTTPException, status, Header, Request
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
import logging

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
    UserResponse
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
    from sqlalchemy import select

    user_id = auth_data["user_id"]

    stmt = select(User).where(User.id == user_id)
    result = await db.execute(stmt)
    user = result.scalars().first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    return UserResponse.model_validate(user)
