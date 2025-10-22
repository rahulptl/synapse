"""
Pydantic schemas for authentication.
"""
from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional, List
from datetime import datetime
from uuid import UUID
import re


class UserSignUp(BaseModel):
    """User signup request."""
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=100)
    full_name: str = Field(..., min_length=1, max_length=255)

    @field_validator('password')
    @classmethod
    def validate_password(cls, v):
        """Validate password strength."""
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters long')
        if not re.search(r'[A-Z]', v):
            raise ValueError('Password must contain at least one uppercase letter')
        if not re.search(r'[a-z]', v):
            raise ValueError('Password must contain at least one lowercase letter')
        if not re.search(r'[0-9]', v):
            raise ValueError('Password must contain at least one digit')
        return v


class UserLogin(BaseModel):
    """User login request."""
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    """User response (without sensitive data)."""
    id: UUID
    email: str
    full_name: Optional[str]
    is_active: bool
    is_verified: bool
    created_at: datetime
    last_login: Optional[datetime]

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    """Token response."""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds
    user: UserResponse


class RefreshTokenRequest(BaseModel):
    """Refresh token request."""
    refresh_token: str


class PasswordResetRequest(BaseModel):
    """Password reset request."""
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    """Password reset confirmation."""
    token: str
    new_password: str = Field(..., min_length=8, max_length=100)

    @field_validator('new_password')
    @classmethod
    def validate_password(cls, v):
        """Validate password strength."""
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters long')
        if not re.search(r'[A-Z]', v):
            raise ValueError('Password must contain at least one uppercase letter')
        if not re.search(r'[a-z]', v):
            raise ValueError('Password must contain at least one lowercase letter')
        if not re.search(r'[0-9]', v):
            raise ValueError('Password must contain at least one digit')
        return v


class PasswordChange(BaseModel):
    """Password change request."""
    current_password: str
    new_password: str = Field(..., min_length=8, max_length=100)

    @field_validator('new_password')
    @classmethod
    def validate_password(cls, v):
        """Validate password strength."""
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters long')
        if not re.search(r'[A-Z]', v):
            raise ValueError('Password must contain at least one uppercase letter')
        if not re.search(r'[a-z]', v):
            raise ValueError('Password must contain at least one lowercase letter')
        if not re.search(r'[0-9]', v):
            raise ValueError('Password must contain at least one digit')
        return v


class EmailVerification(BaseModel):
    """Email verification request."""
    token: str


class UserProfileUpdate(BaseModel):
    """Profile update request."""
    full_name: Optional[str] = None
    job_title: Optional[str] = None
    company: Optional[str] = None
    industry: Optional[str] = None
    interests: Optional[List[str]] = None
    communication_style: Optional[str] = None
    timezone: Optional[str] = None
    primary_goals: Optional[List[str]] = None
    use_cases: Optional[List[str]] = None
    preferred_response_length: Optional[str] = None
    topics_of_interest: Optional[List[str]] = None

    @field_validator('communication_style')
    @classmethod
    def validate_communication_style(cls, v):
        if v and v not in ['formal', 'casual', 'technical']:
            raise ValueError('Communication style must be one of: formal, casual, technical')
        return v

    @field_validator('preferred_response_length')
    @classmethod
    def validate_preferred_response_length(cls, v):
        if v and v not in ['brief', 'medium', 'detailed']:
            raise ValueError('Preferred response length must be one of: brief, medium, detailed')
        return v


class UserProfileResponse(BaseModel):
    """Profile response."""
    id: UUID
    email: str
    full_name: Optional[str]
    job_title: Optional[str]
    company: Optional[str]
    industry: Optional[str]
    interests: Optional[List[str]]
    communication_style: Optional[str]
    timezone: Optional[str]
    primary_goals: Optional[List[str]]
    use_cases: Optional[List[str]]
    preferred_response_length: Optional[str]
    topics_of_interest: Optional[List[str]]
    profile_completed: bool
    profile_completed_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
