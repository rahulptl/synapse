"""
API Key management service.
"""
import secrets
import string
import base64
from datetime import datetime, timedelta, timezone
from typing import List, Optional
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from app.models.database import ApiKey
from app.models.schemas import ApiKeyResponse


class ApiKeyService:
    """Service for managing API keys."""

    @staticmethod
    def generate_api_key() -> str:
        """
        Generate a new API key with zyph_ prefix (matching frontend pattern).

        Returns:
            str: Generated API key
        """
        prefix = 'zyph_'
        chars = string.ascii_letters + string.digits
        key_length = 32

        # Generate secure random string
        random_part = ''.join(secrets.choice(chars) for _ in range(key_length))
        return prefix + random_part

    @staticmethod
    def hash_api_key(api_key: str) -> str:
        """
        Hash API key using base64 encoding (matching frontend pattern).

        Args:
            api_key: The plain text API key

        Returns:
            str: Base64 encoded hash
        """
        return base64.b64encode(api_key.encode()).decode()

    @staticmethod
    def get_key_prefix(api_key: str) -> str:
        """
        Get display prefix for API key (matching frontend pattern).

        Args:
            api_key: The plain text API key

        Returns:
            str: Key prefix for display
        """
        return api_key[:12] + '...'

    async def create_api_key(
        self,
        db: AsyncSession,
        user_id: UUID,
        name: str,
        expires_in_days: Optional[int] = None
    ) -> ApiKeyResponse:
        """
        Create a new API key for a user.

        Args:
            db: Database session
            user_id: User UUID
            name: Name/description for the API key
            expires_in_days: Optional expiration in days

        Returns:
            ApiKeyResponse: Created API key information
        """
        # Generate the API key
        api_key = self.generate_api_key()
        key_hash = self.hash_api_key(api_key)
        key_prefix = self.get_key_prefix(api_key)

        # Calculate expiration date if provided
        expires_at = None
        if expires_in_days:
            expires_at = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=expires_in_days)

        # Create database record
        db_api_key = ApiKey(
            user_id=user_id,
            name=name,
            key_hash=key_hash,
            key_prefix=key_prefix,
            expires_at=expires_at,
            is_active=True,
            created_at=datetime.now(timezone.utc).replace(tzinfo=None),
            updated_at=datetime.now(timezone.utc).replace(tzinfo=None)
        )

        db.add(db_api_key)
        await db.commit()
        await db.refresh(db_api_key)

        # Return response with the actual API key (only time it's shown)
        return ApiKeyResponse(
            id=db_api_key.id,
            name=db_api_key.name,
            key_prefix=db_api_key.key_prefix,
            api_key=api_key,  # Only returned on creation
            expires_at=db_api_key.expires_at,
            last_used_at=db_api_key.last_used_at,
            is_active=db_api_key.is_active,
            created_at=db_api_key.created_at
        )

    async def get_user_api_keys(
        self,
        db: AsyncSession,
        user_id: UUID
    ) -> List[ApiKeyResponse]:
        """
        Get all API keys for a user.

        Args:
            db: Database session
            user_id: User UUID

        Returns:
            List[ApiKeyResponse]: List of user's API keys
        """
        stmt = select(ApiKey).where(ApiKey.user_id == user_id).order_by(ApiKey.created_at.desc())
        result = await db.execute(stmt)
        api_keys = result.scalars().all()

        return [
            ApiKeyResponse(
                id=key.id,
                name=key.name,
                key_prefix=key.key_prefix,
                api_key=None,  # Never return the actual key after creation
                expires_at=key.expires_at,
                last_used_at=key.last_used_at,
                is_active=key.is_active,
                created_at=key.created_at
            )
            for key in api_keys
        ]

    async def delete_api_key(
        self,
        db: AsyncSession,
        user_id: UUID,
        api_key_id: UUID
    ) -> bool:
        """
        Delete an API key for a user.

        Args:
            db: Database session
            user_id: User UUID
            api_key_id: API key UUID to delete

        Returns:
            bool: True if deleted, False if not found
        """
        stmt = select(ApiKey).where(
            and_(
                ApiKey.id == api_key_id,
                ApiKey.user_id == user_id
            )
        )
        result = await db.execute(stmt)
        api_key = result.scalars().first()

        if not api_key:
            return False

        await db.delete(api_key)
        await db.commit()
        return True

    async def update_last_used(
        self,
        db: AsyncSession,
        api_key_hash: str
    ) -> None:
        """
        Update the last used timestamp for an API key.

        Args:
            db: Database session
            api_key_hash: Hashed API key
        """
        stmt = select(ApiKey).where(ApiKey.key_hash == api_key_hash)
        result = await db.execute(stmt)
        api_key = result.scalars().first()

        if api_key:
            api_key.last_used_at = datetime.now(timezone.utc).replace(tzinfo=None)
            api_key.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
            await db.commit()


# Create service instance
api_key_service = ApiKeyService()