"""
Authentication service for user management and JWT tokens.
"""
import base64
import binascii
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import jwt, JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import logging

from app.models.auth import User, RefreshToken
from app.models.database import Profile
from app.models.auth_schemas import UserSignUp, UserLogin, UserResponse, TokenResponse
from app.config import settings

logger = logging.getLogger(__name__)

# Password hashing configuration (PBKDF2-HMAC-SHA256)
PBKDF2_HASH_NAME = "sha256"
PBKDF2_ITERATIONS = 200_000
PBKDF2_SALT_BYTES = 16

# JWT settings
ACCESS_TOKEN_EXPIRE_MINUTES = 30
REFRESH_TOKEN_EXPIRE_DAYS = 7
ALGORITHM = "HS256"


class AuthService:
    """Service for authentication and user management."""

    @staticmethod
    def hash_password(password: str) -> str:
        """Hash a password using PBKDF2-HMAC-SHA256."""
        if not isinstance(password, str):
            raise ValueError("Password must be a string")

        password_bytes = password.encode("utf-8")
        salt = secrets.token_bytes(PBKDF2_SALT_BYTES)
        derived_key = hashlib.pbkdf2_hmac(
            PBKDF2_HASH_NAME,
            password_bytes,
            salt,
            PBKDF2_ITERATIONS
        )

        encoded_salt = base64.b64encode(salt).decode("ascii")
        encoded_key = base64.b64encode(derived_key).decode("ascii")

        return f"pbkdf2_{PBKDF2_HASH_NAME}${PBKDF2_ITERATIONS}${encoded_salt}${encoded_key}"

    @staticmethod
    def verify_password(plain_password: str, hashed_password: str) -> bool:
        """Verify a password against a PBKDF2 hash."""
        if not isinstance(plain_password, str) or not isinstance(hashed_password, str):
            return False

        try:
            scheme, iterations_str, salt_b64, hash_b64 = hashed_password.split("$")
            if scheme != f"pbkdf2_{PBKDF2_HASH_NAME}":
                logger.warning("Unsupported password hash scheme: %s", scheme)
                return False

            iterations = int(iterations_str)
            salt = base64.b64decode(salt_b64)
            expected_hash = base64.b64decode(hash_b64)
        except (ValueError, TypeError, binascii.Error) as exc:
            logger.warning("Invalid stored password hash format: %s", exc)
            return False

        derived_key = hashlib.pbkdf2_hmac(
            PBKDF2_HASH_NAME,
            plain_password.encode("utf-8"),
            salt,
            iterations
        )

        return hmac.compare_digest(derived_key, expected_hash)

    @staticmethod
    def create_access_token(user_id: str, email: str) -> str:
        """Create JWT access token."""
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        to_encode = {
            "sub": user_id,
            "email": email,
            "exp": expire,
            "type": "access"
        }
        encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=ALGORITHM)
        return encoded_jwt

    @staticmethod
    def create_refresh_token() -> str:
        """Create a random refresh token."""
        return secrets.token_urlsafe(32)

    @staticmethod
    def hash_token(token: str) -> str:
        """Hash a token for storage."""
        return hashlib.sha256(token.encode()).hexdigest()

    @staticmethod
    async def verify_access_token(token: str) -> Optional[dict]:
        """Verify and decode JWT access token."""
        try:
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
            if payload.get("type") != "access":
                return None
            return payload
        except JWTError as e:
            logger.debug(f"JWT verification failed: {e}")
            return None

    @staticmethod
    async def create_user(db: AsyncSession, signup_data: UserSignUp) -> User:
        """Create a new user."""
        # Check if user already exists
        stmt = select(User).where(User.email == signup_data.email.lower())
        result = await db.execute(stmt)
        existing_user = result.scalars().first()

        if existing_user:
            raise ValueError("User with this email already exists")

        # Create verification token
        verification_token = secrets.token_urlsafe(32)

        # Create new user
        user = User(
            email=signup_data.email.lower(),
            password_hash=AuthService.hash_password(signup_data.password),
            full_name=signup_data.full_name,
            is_active=True,
            is_verified=False,  # Require email verification
            verification_token=verification_token,
            created_at=datetime.now(timezone.utc).replace(tzinfo=None),
            updated_at=datetime.now(timezone.utc).replace(tzinfo=None)
        )

        db.add(user)
        await db.flush()

        # Ensure the application profile exists for this user so downstream
        # features (folders, chat, etc.) can rely on the FK relationship.
        profile = Profile(
            user_id=user.id,
            email=user.email,
            full_name=user.full_name
        )
        db.add(profile)

        await db.commit()
        await db.refresh(user)

        logger.info(f"Created new user: {user.email}")
        return user

    @staticmethod
    async def authenticate_user(db: AsyncSession, login_data: UserLogin) -> Optional[User]:
        """Authenticate user with email and password."""
        stmt = select(User).where(User.email == login_data.email.lower())
        result = await db.execute(stmt)
        user = result.scalars().first()

        if not user:
            logger.debug(f"User not found: {login_data.email}")
            return None

        if not AuthService.verify_password(login_data.password, user.password_hash):
            logger.debug(f"Invalid password for user: {login_data.email}")
            return None

        if not user.is_active:
            logger.debug(f"Inactive user attempted login: {login_data.email}")
            return None

        # Ensure profile exists for users created before Cloud SQL auth
        profile_stmt = select(Profile).where(Profile.user_id == user.id)
        profile_result = await db.execute(profile_stmt)
        profile = profile_result.scalars().first()
        if not profile:
            profile = Profile(
                user_id=user.id,
                email=user.email,
                full_name=user.full_name
            )
            db.add(profile)

        # Update last login
        user.last_login = datetime.now(timezone.utc).replace(tzinfo=None)
        await db.commit()

        logger.info(f"User authenticated: {user.email}")
        return user

    @staticmethod
    async def create_tokens(
        db: AsyncSession,
        user: User,
        user_agent: Optional[str] = None,
        ip_address: Optional[str] = None
    ) -> TokenResponse:
        """Create access and refresh tokens for user."""
        # Create access token
        access_token = AuthService.create_access_token(str(user.id), user.email)

        # Create refresh token
        refresh_token_plain = AuthService.create_refresh_token()
        refresh_token_hash = AuthService.hash_token(refresh_token_plain)

        # Store refresh token in database
        refresh_token_obj = RefreshToken(
            user_id=user.id,
            token_hash=refresh_token_hash,
            expires_at=(datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)).replace(tzinfo=None),
            is_revoked=False,
            user_agent=user_agent,
            ip_address=ip_address,
            created_at=datetime.now(timezone.utc).replace(tzinfo=None)
        )

        db.add(refresh_token_obj)
        await db.commit()

        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token_plain,
            token_type="bearer",
            expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            user=UserResponse.model_validate(user)
        )

    @staticmethod
    async def refresh_access_token(db: AsyncSession, refresh_token: str) -> Optional[TokenResponse]:
        """Refresh access token using refresh token."""
        token_hash = AuthService.hash_token(refresh_token)

        # Find refresh token
        stmt = select(RefreshToken).where(RefreshToken.token_hash == token_hash)
        result = await db.execute(stmt)
        refresh_token_obj = result.scalars().first()

        if not refresh_token_obj:
            logger.debug("Refresh token not found")
            return None

        if refresh_token_obj.is_revoked:
            logger.debug("Refresh token is revoked")
            return None

        if refresh_token_obj.expires_at < datetime.now(timezone.utc).replace(tzinfo=None):
            logger.debug("Refresh token has expired")
            return None

        # Get user
        user_stmt = select(User).where(User.id == refresh_token_obj.user_id)
        user_result = await db.execute(user_stmt)
        user = user_result.scalars().first()

        if not user or not user.is_active:
            logger.debug("User not found or inactive")
            return None

        # Create new tokens
        return await AuthService.create_tokens(db, user)

    @staticmethod
    async def revoke_refresh_token(db: AsyncSession, refresh_token: str) -> bool:
        """Revoke a refresh token."""
        token_hash = AuthService.hash_token(refresh_token)

        stmt = select(RefreshToken).where(RefreshToken.token_hash == token_hash)
        result = await db.execute(stmt)
        refresh_token_obj = result.scalars().first()

        if not refresh_token_obj:
            return False

        refresh_token_obj.is_revoked = True
        await db.commit()

        logger.info(f"Revoked refresh token for user: {refresh_token_obj.user_id}")
        return True

    @staticmethod
    async def revoke_all_user_tokens(db: AsyncSession, user_id: str) -> int:
        """Revoke all refresh tokens for a user."""
        stmt = select(RefreshToken).where(
            RefreshToken.user_id == user_id,
            RefreshToken.is_revoked == False
        )
        result = await db.execute(stmt)
        tokens = result.scalars().all()

        count = 0
        for token in tokens:
            token.is_revoked = True
            count += 1

        await db.commit()
        logger.info(f"Revoked {count} tokens for user: {user_id}")
        return count

    @staticmethod
    async def verify_email(db: AsyncSession, token: str) -> bool:
        """Verify user email with verification token."""
        stmt = select(User).where(User.verification_token == token)
        result = await db.execute(stmt)
        user = result.scalars().first()

        if not user:
            return False

        user.is_verified = True
        user.verification_token = None
        await db.commit()

        logger.info(f"Email verified for user: {user.email}")
        return True

    @staticmethod
    async def create_password_reset_token(db: AsyncSession, email: str) -> Optional[str]:
        """Create a password reset token."""
        stmt = select(User).where(User.email == email.lower())
        result = await db.execute(stmt)
        user = result.scalars().first()

        if not user:
            # Don't reveal if user exists
            return None

        # Create reset token
        reset_token = secrets.token_urlsafe(32)
        user.reset_token = reset_token
        user.reset_token_expires = (datetime.now(timezone.utc) + timedelta(hours=1)).replace(tzinfo=None)

        await db.commit()
        logger.info(f"Password reset token created for: {user.email}")
        return reset_token

    @staticmethod
    async def reset_password(db: AsyncSession, token: str, new_password: str) -> bool:
        """Reset password using reset token."""
        stmt = select(User).where(User.reset_token == token)
        result = await db.execute(stmt)
        user = result.scalars().first()

        if not user:
            return False

        if not user.reset_token_expires or user.reset_token_expires < datetime.now(timezone.utc).replace(tzinfo=None):
            return False

        # Update password
        user.password_hash = AuthService.hash_password(new_password)
        user.reset_token = None
        user.reset_token_expires = None
        user.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)

        await db.commit()

        # Revoke all refresh tokens
        await AuthService.revoke_all_user_tokens(db, str(user.id))

        logger.info(f"Password reset for user: {user.email}")
        return True

    @staticmethod
    async def change_password(db: AsyncSession, user_id: str, current_password: str, new_password: str) -> bool:
        """Change user password."""
        stmt = select(User).where(User.id == user_id)
        result = await db.execute(stmt)
        user = result.scalars().first()

        if not user:
            return False

        if not AuthService.verify_password(current_password, user.password_hash):
            return False

        # Update password
        user.password_hash = AuthService.hash_password(new_password)
        user.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)

        await db.commit()

        # Revoke all refresh tokens
        await AuthService.revoke_all_user_tokens(db, str(user.id))

        logger.info(f"Password changed for user: {user.email}")
        return True


# Service instance
auth_service = AuthService()
