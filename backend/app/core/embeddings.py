"""
Embeddings and AI service integrations.
"""
import asyncio
import httpx
from typing import List, Optional
import logging

from app.config import settings

logger = logging.getLogger(__name__)


class EmbeddingService:
    """Service for generating embeddings using OpenAI API."""

    def __init__(self):
        self.api_key = settings.OPENAI_API_KEY
        self.model = settings.EMBEDDING_MODEL
        self.timeout = 30.0

    async def generate_embedding(self, text: str) -> List[float]:
        """
        Generate embedding for a single text.

        Args:
            text: Text to embed

        Returns:
            List[float]: Embedding vector

        Raises:
            Exception: If embedding generation fails
        """
        if not self.api_key:
            raise ValueError("OpenAI API key not configured")

        # Estimate token count and validate
        estimated_tokens = len(text) / 2.5
        if estimated_tokens > 7000:
            raise ValueError(f"Text too large: {estimated_tokens} estimated tokens (max 7000)")

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                response = await client.post(
                    "https://api.openai.com/v1/embeddings",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": self.model,
                        "input": text,
                    }
                )

                if response.status_code != 200:
                    error_detail = response.text
                    logger.error(f"OpenAI API error: {response.status_code} - {error_detail}")
                    raise Exception(f"OpenAI API error: {response.status_code}")

                data = response.json()
                return data["data"][0]["embedding"]

            except httpx.TimeoutException:
                logger.error("OpenAI API timeout")
                raise Exception("Embedding generation timed out")
            except Exception as e:
                logger.error(f"Embedding generation failed: {e}")
                raise

    async def generate_embeddings_batch(
        self,
        texts: List[str],
        batch_size: int = 5
    ) -> List[List[float]]:
        """
        Generate embeddings for multiple texts in batches.

        Args:
            texts: List of texts to embed
            batch_size: Number of texts to process in parallel

        Returns:
            List[List[float]]: List of embedding vectors

        Raises:
            Exception: If any embedding generation fails
        """
        results = []

        for i in range(0, len(texts), batch_size):
            batch = texts[i:i + batch_size]
            logger.debug(f"Processing embedding batch {i//batch_size + 1}/{(len(texts) + batch_size - 1)//batch_size}")

            # Process batch in parallel
            batch_tasks = [self.generate_embedding(text) for text in batch]
            try:
                batch_results = await asyncio.gather(*batch_tasks)
                results.extend(batch_results)

                # Small delay between batches to avoid rate limits
                if i + batch_size < len(texts):
                    await asyncio.sleep(0.1)

            except Exception as e:
                logger.error(f"Batch embedding failed: {e}")
                # Fallback to sequential processing for this batch
                logger.debug("Falling back to sequential processing for failed batch")
                for text in batch:
                    try:
                        embedding = await self.generate_embedding(text)
                        results.append(embedding)
                    except Exception as individual_error:
                        logger.error(f"Individual embedding failed: {individual_error}")
                        # Skip this text but continue with others
                        continue

        return results


class ChatService:
    """Service for chat completions using OpenAI API."""

    def __init__(self):
        self.api_key = settings.OPENAI_API_KEY
        self.model = "gpt-4o-mini"  # Use OpenAI's efficient model
        self.timeout = settings.CHAT_TIMEOUT_SECONDS

    async def generate_completion(
        self,
        messages: List[dict],
        max_tokens: int = 2000,
        temperature: float = 0.7
    ) -> str:
        """
        Generate chat completion using OpenAI API.

        Args:
            messages: List of message dictionaries
            max_tokens: Maximum tokens to generate
            temperature: Sampling temperature

        Returns:
            str: Generated response

        Raises:
            Exception: If completion generation fails
        """
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
                        "model": self.model,
                        "messages": messages,
                        "max_tokens": max_tokens,
                        "temperature": temperature,
                    }
                )

                if response.status_code != 200:
                    error_detail = response.text
                    logger.error(f"OpenAI API error: {response.status_code} - {error_detail}")
                    raise Exception(f"Chat completion API error: {response.status_code}")

                data = response.json()
                return data["choices"][0]["message"]["content"]

            except httpx.TimeoutException:
                logger.error("OpenAI chat completion API timeout")
                raise Exception("Chat completion timed out")
            except Exception as e:
                logger.error(f"OpenAI chat completion failed: {e}")
                raise


# Service instances
embedding_service = EmbeddingService()
chat_service = ChatService()