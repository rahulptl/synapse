"""
LLM provider abstraction for multiple AI services.
"""
import asyncio
import httpx
import json
import re
from typing import List, Optional, Dict, Any, Union
from abc import ABC, abstractmethod
import logging

from app.config import settings

logger = logging.getLogger(__name__)


def _parse_json_response(response_text: str) -> Optional[Union[Dict[str, Any], List[Any]]]:
    """
    Try to extract JSON from a model response that may include extra prose or code fences.
    Returns the parsed JSON object on success, otherwise None.
    """

    def _attempt_parse(candidate: str) -> Optional[Union[Dict[str, Any], List[Any]]]:
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            return None

    if not response_text:
        return None

    stripped = response_text.strip()

    parsed = _attempt_parse(stripped)
    if parsed is not None:
        return parsed

    # Look for JSON inside code fences
    for match in re.finditer(r"```(?:json)?\s*(.*?)```", response_text, flags=re.IGNORECASE | re.DOTALL):
        candidate = match.group(1).strip()
        parsed = _attempt_parse(candidate)
        if parsed is not None:
            return parsed

    # Walk the string to find the first balanced JSON object/array
    stack = []
    start_idx = None
    in_string = False
    escape_next = False
    for idx, char in enumerate(response_text):
        if in_string:
            if escape_next:
                escape_next = False
            elif char == "\\":
                escape_next = True
            elif char == '"':
                in_string = False
            continue

        if char == '"':
            in_string = True
            continue

        if char in "{[":
            if not stack:
                start_idx = idx
            stack.append(char)
        elif char in "}]":
            if not stack:
                continue
            expected = "{" if char == "}" else "["
            if stack[-1] == expected:
                stack.pop()
                if not stack and start_idx is not None:
                    candidate = response_text[start_idx:idx + 1]
                    parsed = _attempt_parse(candidate.strip())
                    if parsed is not None:
                        return parsed
            else:
                # Reset if braces are unbalanced
                stack.clear()
                start_idx = None

    return None


def _default_structured_response(response_text: str) -> Dict[str, Any]:
    """Construct a minimal structured fallback when parsing fails."""
    return {
        "summary": response_text.strip() if response_text else "",
        "key_entities": [],
        "financials": [],
        "open_questions": []
    }


class LLMProvider(ABC):
    """Abstract base class for LLM providers."""

    @abstractmethod
    async def generate_completion(
        self,
        messages: List[dict],
        max_tokens: int = 2000,
        temperature: float = 0.7,
        **kwargs
    ) -> str:
        """Generate chat completion."""
        pass

    @abstractmethod
    async def generate_structured_completion(
        self,
        messages: List[dict],
        schema: Optional[Dict[str, Any]] = None,
        max_tokens: int = 2000,
        temperature: float = 0.3,
        **kwargs
    ) -> Dict[str, Any]:
        """Generate structured completion with JSON output."""
        pass

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Get provider name."""
        pass


class OpenAIProvider(LLMProvider):
    """OpenAI API provider."""

    def __init__(self):
        self.api_key = settings.OPENAI_API_KEY
        self.timeout = settings.SUMMARY_TIMEOUT_SECONDS

    @property
    def provider_name(self) -> str:
        return "openai"

    async def generate_completion(
        self,
        messages: List[dict],
        max_tokens: int = 2000,
        temperature: float = 0.7,
        **kwargs
    ) -> str:
        """Generate completion using OpenAI chat completions API."""
        if not self.api_key:
            raise ValueError("OpenAI API key not configured")

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                response = await client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": kwargs.get("model", settings.CHAT_MODEL),
                        "messages": messages,
                        "reasoning_effort": "low",
                    }
                )

                if response.status_code != 200:
                    error_detail = response.text
                    logger.error(f"OpenAI API error: {response.status_code} - {error_detail}")
                    raise Exception(f"OpenAI API error: {response.status_code}")

                data = response.json()
                return data["choices"][0]["message"]["content"]

            except httpx.TimeoutException:
                logger.error("OpenAI chat completion API timeout")
                raise Exception("Chat completion timed out")
            except Exception as e:
                logger.error(f"OpenAI chat completion failed: {e}")
                raise

    async def generate_structured_completion(
        self,
        messages: List[dict],
        schema: Optional[Dict[str, Any]] = None,
        max_tokens: int = 2000,
        temperature: float = 0.3,
        **kwargs
    ) -> Dict[str, Any]:
        """Generate structured completion using OpenAI JSON mode."""
        response_text = await self.generate_completion(
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
            **kwargs
        )

        parsed = _parse_json_response(response_text)
        if parsed is not None:
            return parsed

        logger.error("Failed to parse JSON response from OpenAI provider")
        logger.debug("OpenAI raw response: %s", response_text)
        return _default_structured_response(response_text)


class AzureOpenAIProvider(LLMProvider):
    """Azure OpenAI API provider."""

    def __init__(self):
        self.api_key = settings.AZURE_OPENAI_API_KEY
        self.endpoint = settings.AZURE_OPENAI_ENDPOINT
        self.api_version = settings.AZURE_OPENAI_API_VERSION
        self.deployment_name = settings.AZURE_DEPLOYMENT_NAME
        self.timeout = settings.SUMMARY_TIMEOUT_SECONDS

    @property
    def provider_name(self) -> str:
        return "azure_openai"

    async def generate_completion(
        self,
        messages: List[dict],
        max_tokens: int = 2000,
        temperature: float = 0.7,
        **kwargs
    ) -> str:
        """Generate completion using Azure OpenAI API."""
        if not self.api_key or not self.endpoint:
            raise ValueError("Azure OpenAI configuration incomplete")

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                url = f"{self.endpoint.rstrip('/')}/openai/deployments/{self.deployment_name}/chat/completions?api-version={self.api_version}"

                response = await client.post(
                    url,
                    headers={
                        "api-key": self.api_key,
                        "Content-Type": "application/json",
                    },
                    json={
                        "messages": messages,
                        "max_tokens": max_tokens,
                        "temperature": temperature,
                    }
                )

                if response.status_code != 200:
                    error_detail = response.text
                    logger.error(f"Azure OpenAI API error: {response.status_code} - {error_detail}")
                    raise Exception(f"Azure OpenAI API error: {response.status_code}")

                data = response.json()
                return data["choices"][0]["message"]["content"]

            except httpx.TimeoutException:
                logger.error("Azure OpenAI chat completion API timeout")
                raise Exception("Chat completion timed out")
            except Exception as e:
                logger.error(f"Azure OpenAI chat completion failed: {e}")
                raise

    async def generate_structured_completion(
        self,
        messages: List[dict],
        schema: Optional[Dict[str, Any]] = None,
        max_tokens: int = 2000,
        temperature: float = 0.3,
        **kwargs
    ) -> Dict[str, Any]:
        """Generate structured completion using Azure OpenAI."""
        response_text = await self.generate_completion(
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
            **kwargs
        )

        parsed = _parse_json_response(response_text)
        if parsed is not None:
            return parsed

        logger.error("Failed to parse JSON response from Azure OpenAI provider")
        logger.debug("Azure OpenAI raw response: %s", response_text)
        return _default_structured_response(response_text)


class AnthropicProvider(LLMProvider):
    """Anthropic Claude API provider."""

    def __init__(self):
        self.api_key = settings.ANTHROPIC_API_KEY
        self.timeout = settings.SUMMARY_TIMEOUT_SECONDS

    @property
    def provider_name(self) -> str:
        return "anthropic"

    async def generate_completion(
        self,
        messages: List[dict],
        max_tokens: int = 2000,
        temperature: float = 0.7,
        **kwargs
    ) -> str:
        """Generate completion using Anthropic Claude API."""
        if not self.api_key:
            raise ValueError("Anthropic API key not configured")

        # Convert OpenAI message format to Anthropic format
        system_message = ""
        user_messages = []

        for msg in messages:
            if msg["role"] == "system":
                system_message = msg["content"]
            elif msg["role"] == "user":
                user_messages.append({"role": "user", "content": msg["content"]})
            elif msg["role"] == "assistant":
                user_messages.append({"role": "assistant", "content": msg["content"]})

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                payload = {
                    "model": kwargs.get("model", "claude-3-5-sonnet-20241022"),
                    "max_tokens": max_tokens,
                    "temperature": temperature,
                    "messages": user_messages,
                }

                if system_message:
                    payload["system"] = system_message

                response = await client.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={
                        "x-api-key": self.api_key,
                        "Content-Type": "application/json",
                        "anthropic-version": "2023-06-01",
                    },
                    json=payload
                )

                if response.status_code != 200:
                    error_detail = response.text
                    logger.error(f"Anthropic API error: {response.status_code} - {error_detail}")
                    raise Exception(f"Anthropic API error: {response.status_code}")

                data = response.json()
                return data["content"][0]["text"]

            except httpx.TimeoutException:
                logger.error("Anthropic API timeout")
                raise Exception("Chat completion timed out")
            except Exception as e:
                logger.error(f"Anthropic chat completion failed: {e}")
                raise

    async def generate_structured_completion(
        self,
        messages: List[dict],
        schema: Optional[Dict[str, Any]] = None,
        max_tokens: int = 2000,
        temperature: float = 0.3,
        **kwargs
    ) -> Dict[str, Any]:
        """Generate structured completion using Anthropic Claude."""
        # Add instructions to the system message about JSON output
        enhanced_messages = messages.copy()
        for i, msg in enumerate(enhanced_messages):
            if msg["role"] == "system":
                enhanced_messages[i]["content"] += "\n\nYou must respond with valid JSON only, no other text."
                break
        else:
            # No system message found, add one at the beginning
            enhanced_messages.insert(0, {
                "role": "system",
                "content": "You must respond with valid JSON only, no other text."
            })

        response_text = await self.generate_completion(
            messages=enhanced_messages,
            max_tokens=max_tokens,
            temperature=temperature,
            **kwargs
        )

        parsed = _parse_json_response(response_text)
        if parsed is not None:
            return parsed

        logger.error("Failed to parse JSON response from Anthropic provider")
        logger.debug("Anthropic raw response: %s", response_text)
        return _default_structured_response(response_text)


class GeminiProvider(LLMProvider):
    """Google Gemini API provider."""

    def __init__(self):
        self.api_key = settings.GOOGLE_API_KEY
        self.timeout = settings.SUMMARY_TIMEOUT_SECONDS

    @property
    def provider_name(self) -> str:
        return "gemini"

    async def generate_completion(
        self,
        messages: List[dict],
        max_tokens: int = 2000,
        temperature: float = 0.7,
        **kwargs
    ) -> str:
        """Generate completion using Google Gemini API."""
        if not self.api_key:
            raise ValueError("Google API key not configured")

        # Convert OpenAI message format to Gemini format
        contents = []
        for msg in messages:
            if msg["role"] != "system":  # Gemini doesn't have system messages
                role = "user" if msg["role"] == "user" else "model"
                contents.append({
                    "role": role,
                    "parts": [{"text": msg["content"]}]
                })

        # Add system message as first user message
        system_message = ""
        for msg in messages:
            if msg["role"] == "system":
                system_message = msg["content"]
                break

        if system_message:
            contents.insert(0, {
                "role": "user",
                "parts": [{"text": f"System instructions: {system_message}"}]
            })

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{kwargs.get('model', settings.GEMINI_MODEL)}:generateContent?key={self.api_key}"

                response = await client.post(
                    url,
                    json={
                        "contents": contents,
                        "generationConfig": {
                            "maxOutputTokens": max_tokens,
                            "temperature": temperature,
                        }
                    }
                )

                if response.status_code != 200:
                    error_detail = response.text
                    logger.error(f"Gemini API error: {response.status_code} - {error_detail}")
                    raise Exception(f"Gemini API error: {response.status_code}")

                data = response.json()
                return data["candidates"][0]["content"]["parts"][0]["text"]

            except httpx.TimeoutException:
                logger.error("Gemini API timeout")
                raise Exception("Chat completion timed out")
            except Exception as e:
                logger.error(f"Gemini chat completion failed: {e}")
                raise

    async def generate_structured_completion(
        self,
        messages: List[dict],
        schema: Optional[Dict[str, Any]] = None,
        max_tokens: int = 2000,
        temperature: float = 0.3,
        **kwargs
    ) -> Dict[str, Any]:
        """Generate structured completion using Gemini."""
        # Add JSON output instruction
        enhanced_messages = messages.copy()
        for i, msg in enumerate(enhanced_messages):
            if msg["role"] == "system":
                enhanced_messages[i]["content"] += "\n\nYou must respond with valid JSON only, no other text."
                break
        else:
            enhanced_messages.insert(0, {
                "role": "system",
                "content": "You must respond with valid JSON only, no other text."
            })

        response_text = await self.generate_completion(
            messages=enhanced_messages,
            max_tokens=max_tokens,
            temperature=temperature,
            **kwargs
        )

        parsed = _parse_json_response(response_text)
        if parsed is not None:
            return parsed

        logger.error("Failed to parse JSON response from Gemini provider")
        logger.debug("Gemini raw response: %s", response_text)
        return _default_structured_response(response_text)


class LLMService:
    """Service for managing multiple LLM providers."""

    def __init__(self):
        self._providers = {}
        self._initialize_providers()

    def _initialize_providers(self):
        """Initialize available LLM providers."""
        # Initialize OpenAI
        if settings.OPENAI_API_KEY:
            self._providers["openai"] = OpenAIProvider()
            logger.info("Initialized OpenAI provider")

        # Initialize Azure OpenAI
        if settings.AZURE_OPENAI_API_KEY and settings.AZURE_OPENAI_ENDPOINT:
            self._providers["azure"] = AzureOpenAIProvider()
            logger.info("Initialized Azure OpenAI provider")

        # Initialize Anthropic
        if settings.ANTHROPIC_API_KEY:
            self._providers["anthropic"] = AnthropicProvider()
            logger.info("Initialized Anthropic provider")

        # Initialize Gemini
        if settings.GOOGLE_API_KEY:
            self._providers["gemini"] = GeminiProvider()
            logger.info("Initialized Gemini provider")

        if not self._providers:
            raise ValueError("No LLM providers configured. Please configure at least one provider.")

        logger.info(f"Initialized {len(self._providers)} LLM providers: {list(self._providers.keys())}")

    def get_provider(self, provider_name: Optional[str] = None) -> LLMProvider:
        """Get LLM provider by name."""
        if not provider_name:
            provider_name = settings.SUMMARY_PROVIDER.lower()

        if provider_name not in self._providers:
            # Fallback to first available provider
            fallback_provider = next(iter(self._providers))
            logger.warning(f"Provider '{provider_name}' not available, using fallback '{fallback_provider}'")
            provider_name = fallback_provider

        return self._providers[provider_name]

    async def generate_completion(
        self,
        messages: List[dict],
        provider_name: Optional[str] = None,
        model: Optional[str] = None,
        max_tokens: int = 2000,
        temperature: float = 0.7,
        **kwargs
    ) -> str:
        """Generate completion using specified or default provider."""
        provider = self.get_provider(provider_name)

        # Override model if specified
        if model:
            kwargs["model"] = model

        return await provider.generate_completion(
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
            **kwargs
        )

    async def generate_structured_completion(
        self,
        messages: List[dict],
        provider_name: Optional[str] = None,
        model: Optional[str] = None,
        schema: Optional[Dict[str, Any]] = None,
        max_tokens: int = 2000,
        temperature: float = 0.3,
        **kwargs
    ) -> Dict[str, Any]:
        """Generate structured completion using specified or default provider."""
        provider = self.get_provider(provider_name)

        # Override model if specified
        if model:
            kwargs["model"] = model

        return await provider.generate_structured_completion(
            messages=messages,
            schema=schema,
            max_tokens=max_tokens,
            temperature=temperature,
            **kwargs
        )

    def get_available_providers(self) -> List[str]:
        """Get list of available provider names."""
        return list(self._providers.keys())


# Global service instance
llm_service = LLMService()
