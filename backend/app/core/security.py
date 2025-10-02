"""
Security utilities for authentication and authorization.
"""
import hashlib
import base64
from typing import Optional
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import HTTPException, status, Header, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
import logging

from app.models.database import ApiKey, Profile
from app.core.database import AsyncSessionLocal
from app.config import settings

logger = logging.getLogger(__name__)


class SecurityService:
    """Security service for API key validation and user authentication."""

    @staticmethod
    def hash_api_key(api_key: str) -> tuple[str, str]:
        """
        Generate both legacy and current hash formats for API key.

        Returns:
            tuple: (legacy_hash, current_hash)
        """
        # Legacy format: Base64 of raw key
        legacy_hash = base64.b64encode(api_key.encode()).decode()

        # Current format: Base64 of SHA-256 digest
        sha256_hash = hashlib.sha256(api_key.encode()).digest()
        current_hash = base64.b64encode(sha256_hash).decode()

        return legacy_hash, current_hash

    @staticmethod
    async def validate_api_key(
        api_key: str,
        requested_user_id: Optional[str] = None
    ) -> dict:
        """
        Validate API key and return user information.

        Args:
            api_key: The API key to validate
            requested_user_id: Optional user ID to verify against

        Returns:
            dict: User information if valid

        Raises:
            HTTPException: If API key is invalid or expired
        """
        if not api_key:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="API key is required"
            )

        legacy_hash, current_hash = SecurityService.hash_api_key(api_key)

        async with AsyncSessionLocal() as session:
            # Step 1: Find the API key first
            key_stmt = select(ApiKey).where(ApiKey.key_hash.in_([legacy_hash, current_hash]))
            key_result = await session.execute(key_stmt)
            api_key_obj = key_result.scalars().first()

            if not api_key_obj:
                logger.warning(f"API key validation failed: Key with hash not found.")
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid API key"
                )

            logger.debug(f"API key found: ID={api_key_obj.user_id}, Active={api_key_obj.is_active}")

            # Step 2: Check if the key is active
            if not api_key_obj.is_active:
                logger.warning(f"API key validation failed: Key {api_key_obj.user_id} is not active.")
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="API key is not active"
                )

            # Step 3: Check if key is expired
            if api_key_obj.expires_at:
                expires_at_to_compare = api_key_obj.expires_at
                if expires_at_to_compare.tzinfo:
                    expires_at_to_compare = expires_at_to_compare.replace(tzinfo=None)
                
                if expires_at_to_compare < datetime.now(timezone.utc).replace(tzinfo=None):
                    logger.warning(f"API key validation failed: Key {api_key_obj.user_id} has expired.")
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="API key has expired"
                    )

            # Step 4: Find the associated user
            user_stmt = select(Profile).where(Profile.user_id == api_key_obj.user_id)
            user_result = await session.execute(user_stmt)
            user_obj = user_result.scalars().first()

            if not user_obj:
                logger.warning(f"API key validation failed: User with ID {api_key_obj.user_id} not found for key {api_key_obj.id}.")
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid user associated with API key"
                )
            
            logger.debug(f"User found for API key: User ID={user_obj.user_id}")

            # Step 5: Check if requested user ID matches
            if requested_user_id and str(user_obj.user_id) != requested_user_id:
                logger.warning(f"API key validation failed: Key belongs to user {user_obj.user_id}, but request was for user {requested_user_id}.")
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="API key does not belong to the specified user"
                )

            # Update last used timestamp
            api_key_obj.last_used_at = datetime.now(timezone.utc).replace(tzinfo=None)
            await session.commit()

            return {
                "user_id": str(user_obj.user_id),
                "user": {
                    "id": str(user_obj.user_id),
                    "email": user_obj.email,
                    "full_name": user_obj.full_name
                },
                "key_name": api_key_obj.name,
                "valid": True
            }

    @staticmethod
    async def get_user_from_api_key(api_key: str) -> Optional[str]:
        """
        Get user ID from API key (simplified version).

        Args:
            api_key: The API key

        Returns:
            str: User ID if valid, None otherwise
        """
        try:
            result = await SecurityService.validate_api_key(api_key)
            return result["user_id"]
        except HTTPException:
            return None


# Dependency for API key validation
async def validate_api_key_dependency(
    x_api_key: Optional[str] = Header(None, alias="x-api-key"),
    x_user_id: Optional[str] = Header(None, alias="x-user-id")
) -> dict:
    """
    FastAPI dependency for API key validation.

    Args:
        x_api_key: API key from header
        x_user_id: Optional user ID from header

    Returns:
        dict: Validated user information
    """
    if not x_api_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="API key required in x-api-key header"
        )

    return await SecurityService.validate_api_key(x_api_key, x_user_id)


# Bearer token security scheme
security = HTTPBearer()


async def validate_supabase_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    """
    FastAPI dependency for Supabase JWT token validation.

    Args:
        credentials: Bearer token credentials

    Returns:
        dict: Validated user information
    """
    try:
        # Get the JWT secret for validation
        jwt_secret = settings.SUPABASE_JWT_SECRET
        if not jwt_secret:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="JWT secret not configured"
            )

        # Decode and validate the JWT token
        payload = jwt.decode(
            credentials.credentials,
            jwt_secret,
            algorithms=["HS256"],
            audience="authenticated"
        )

        # Extract user information
        user_id = payload.get("sub")
        email = payload.get("email")

        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token: missing user ID"
            )

        # Check if user exists in our database
        async with AsyncSessionLocal() as session:
            user_stmt = select(Profile).where(Profile.user_id == user_id)
            user_result = await session.execute(user_stmt)
            user_obj = user_result.scalars().first()

            # If user doesn't exist, create a profile
            if not user_obj:
                user_obj = Profile(
                    user_id=user_id,
                    email=email,
                    full_name=payload.get("user_metadata", {}).get("full_name", ""),
                    created_at=datetime.now(timezone.utc).replace(tzinfo=None),
                    updated_at=datetime.now(timezone.utc).replace(tzinfo=None)
                )
                session.add(user_obj)
                await session.commit()
                await session.refresh(user_obj)
                logger.debug(f"Created new user profile for: {user_id}")

        return {
            "user_id": user_id,
            "user": {
                "id": user_id,
                "email": email,
                "full_name": user_obj.full_name if user_obj else ""
            },
            "valid": True
        }

    except JWTError as e:
        logger.debug(f"JWT validation failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token"
        )
    except Exception as e:
        logger.error(f"Token validation error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Token validation failed"
        )


async def validate_dual_auth(
    x_api_key: Optional[str] = Header(None, alias="x-api-key"),
    x_user_id: Optional[str] = Header(None, alias="x-user-id"),
    authorization: Optional[str] = Header(None)
) -> dict:
    """
    FastAPI dependency that supports both API key and Supabase JWT authentication.

    Priority:
    1. If x-api-key header is present, use API key authentication (for extension)
    2. If Authorization header is present, use Supabase JWT authentication (for web app)
    3. Otherwise, raise authentication error

    Args:
        x_api_key: API key from header (extension)
        x_user_id: Optional user ID from header (extension)
        authorization: Bearer token (web app)

    Returns:
        dict: Validated user information
    """
    # Try API key authentication first (for browser extension)
    if x_api_key:
        try:
            return await SecurityService.validate_api_key(x_api_key, x_user_id)
        except HTTPException:
            # If API key validation fails, don't try other methods
            raise

    # Try Supabase JWT authentication (for web app)
    if authorization and authorization.startswith("Bearer "):
        try:
            token = authorization.split(" ")[1]

            # For development, allow testing without proper JWT secret
            if settings.ENVIRONMENT == "development" and not settings.SUPABASE_JWT_SECRET:
                logger.debug("JWT secret not configured - using development mode")
                # Create a mock user for development with proper UUID format
                dev_user_id = "00000000-0000-0000-0000-000000000001"
                return {
                    "user_id": dev_user_id,
                    "user": {
                        "id": dev_user_id,
                        "email": "dev@example.com",
                        "full_name": "Development User"
                    },
                    "valid": True,
                    "auth_method": "development_mode"
                }

            # Get the JWT secret for validation
            jwt_secret = settings.SUPABASE_JWT_SECRET
            if not jwt_secret:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="JWT secret not configured"
                )

            # Decode and validate the JWT token
            payload = jwt.decode(
                token,
                jwt_secret,
                algorithms=["HS256"],
                audience="authenticated"
            )

            # Extract user information
            user_id = payload.get("sub")
            email = payload.get("email")

            if not user_id:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid token: missing user ID"
                )

            # Check if user exists in our database
            async with AsyncSessionLocal() as session:
                user_stmt = select(Profile).where(Profile.user_id == user_id)
                user_result = await session.execute(user_stmt)
                user_obj = user_result.scalars().first()

                # If user doesn't exist, create a profile
                if not user_obj:
                    user_obj = Profile(
                        user_id=user_id,
                        email=email,
                        full_name=payload.get("user_metadata", {}).get("full_name", ""),
                        created_at=datetime.now(timezone.utc).replace(tzinfo=None),
                        updated_at=datetime.now(timezone.utc).replace(tzinfo=None)
                    )
                    session.add(user_obj)
                    await session.commit()
                    await session.refresh(user_obj)
                    logger.debug(f"Created new user profile for: {user_id}")

            return {
                "user_id": user_id,
                "user": {
                    "id": user_id,
                    "email": email,
                    "full_name": user_obj.full_name if user_obj else ""
                },
                "valid": True,
                "auth_method": "supabase_jwt"
            }

        except JWTError as e:
            logger.debug(f"JWT validation failed: {e}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token"
            )
        except Exception as e:
            logger.error(f"Token validation error: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Token validation failed"
            )

    # No valid authentication provided
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication required. Provide either x-api-key header or Authorization bearer token."
    )


# Create security service instance
security_service = SecurityService()