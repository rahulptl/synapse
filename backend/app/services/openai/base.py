"""
Base service for OpenAI API clients.

This module provides the base configuration and client initialization
for all OpenAI service classes.
"""
from typing import Optional
from openai import AsyncOpenAI
from app.config import settings
import logging

logger = logging.getLogger(__name__)


class OpenAIBaseService:
    """Base service for OpenAI API clients with shared configuration.

    All OpenAI service classes should inherit from this base class to
    ensure consistent client initialization and configuration validation.

    Attributes:
        client: AsyncOpenAI client instance for making API calls
    """

    def __init__(self, api_key: Optional[str] = None):
        """Initialize OpenAI client with API key.

        Args:
            api_key: Optional OpenAI API key. If not provided, will use
                    OPENAI_API_KEY from settings.
        """
        effective_api_key = api_key or settings.OPENAI_API_KEY
        self.client = AsyncOpenAI(api_key=effective_api_key)

    def is_configured(self) -> bool:
        """Check if OpenAI API is properly configured.

        Returns:
            True if API key is valid, False otherwise
        """
        api_key = settings.OPENAI_API_KEY
        return bool(
            api_key and
            api_key != "your-openai-api-key" and
            len(api_key) > 20
        )

    def validate_configuration(self) -> None:
        """Raise error if not properly configured.

        Raises:
            ValueError: If OpenAI API key is not properly configured
        """
        if not self.is_configured():
            raise ValueError(
                "OpenAI API is not properly configured. "
                "Please set OPENAI_API_KEY in environment variables."
            )
