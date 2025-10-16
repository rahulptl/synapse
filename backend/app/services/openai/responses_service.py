"""
OpenAI Responses Service - Simplified.

This module provides a simple method for creating conversational responses using
OpenAI's Responses API with both file_search and web_search enabled.
"""
from typing import Optional, Dict, Any, List
from openai.types.responses import Response
from openai.types.responses.response_output_message import ResponseOutputMessage
import logging

from .base import OpenAIBaseService

logger = logging.getLogger(__name__)

# Default system instructions - same as main.ipynb
DEFAULT_INSTRUCTIONS = """
You are an intelligent knowledge retrieval assistant with access to multiple information sources.

## Query Classification & Response Strategy:

1. **Knowledge Base Queries**: If the query relates to information that could be in the user's knowledge base (documents, personal data, organizational content), FIRST search the provided sources.

2. **Real-time Information**: If the query requires current data (weather, news, stock prices, today's events), use web search tools.

3. **Hybrid Queries**: If the query combines personal context with creative/general tasks:
   - First, search the knowledge base for relevant personal information
   - Then, use that context combined with general knowledge to generate a personalized response

4. **General Knowledge**: If the query is educational or creative without personal context, use your general knowledge directly.

## Contextual Intelligence:
- **Apply knowledge to retrieved data**: When you have specific information from the knowledge base and the user asks about it, analyze THAT specific data using your general knowledge
- **Recognize follow-up questions**: References like "my", "those", "this", "that" indicate the user wants you to explain or work with previously retrieved information
- **Don't just describe - analyze**: If the user asks about specific data you've already retrieved, provide insights about THAT data, not just generic explanations of what such data could mean
- **Use the actual values**: When explaining concepts related to retrieved data, reference and work with the actual values, formats, and patterns present in the user's specific information

## Response Guidelines:
- Be precise and concise in your answers
- Clearly cite sources when using knowledge base information
- When combining KB data with general knowledge, explicitly show how the general knowledge applies to their specific data
- **Always ground your explanations in the actual data retrieved** - don't give abstract possibilities when you have concrete information
- State your reasoning when making inferences (e.g., "Looking at your specific [data], this indicates...")
- If information is not available in expected sources, explain this and use the most appropriate alternative source

## Priority Order:
Knowledge Base (if relevant) → Apply General Knowledge to Retrieved Data → Web Search (if real-time) → General Knowledge
"""


class ResponsesService(OpenAIBaseService):
    """Simple client for OpenAI Responses API with hybrid search enabled."""

    async def chat(
        self,
        query: str,
        vector_store_ids: List[str],
        model: str = "gpt-5",
        instructions: Optional[str] = None,
        previous_response_id: Optional[str] = None,
        max_num_results: int = 20,
        temperature: float = 0.7,
        attribute_filter: Optional[Dict[str, Any]] = None,
    ) -> Response:
        """Create a response with both file search and web search enabled.

        This is the main method - simple and powerful like the notebook approach.

        Args:
            query: The user's query
            vector_store_ids: List of vector store IDs to search
            model: The model to use (default: "gpt-5")
            instructions: System instructions (uses DEFAULT_INSTRUCTIONS if not provided)
            previous_response_id: Previous response ID for conversation continuity
            max_num_results: Maximum number of file search results (1-50)
            temperature: Sampling temperature (0.0 to 2.0, default 0.7). Note: Ignored for reasoning models (o1, gpt-5)
            attribute_filter: OpenAI attribute filter for narrowing search results

        Returns:
            The Response object with both search capabilities
        """
        self.validate_configuration()

        # Use default instructions if none provided
        if instructions is None:
            instructions = DEFAULT_INSTRUCTIONS

        # Build tools - both file_search and web_search enabled
        file_search_tool = {
            "type": "file_search",
            "vector_store_ids": vector_store_ids,
            "max_num_results": max_num_results
        }

        # Add attribute filter if provided
        if attribute_filter:
            file_search_tool["attribute_filter"] = attribute_filter

        tools = [
            file_search_tool,
            {
                "type": "web_search_preview"
            }
        ]

        kwargs = {
            'model': model,
            'input': query,
            'tools': tools,
            'instructions': instructions,
        }

        # Only add temperature for non-reasoning models (o1 series doesn't support it)
        # GPT-5 and o1 models don't support temperature parameter
        if not (model.startswith('o1') or model.startswith('gpt-5')):
            kwargs['temperature'] = temperature

        if previous_response_id is not None:
            kwargs['previous_response_id'] = previous_response_id

        try:
            response = await self.client.responses.create(**kwargs)
            logger.info(
                f"Successfully created response {response.id} "
                f"(tokens: {response.usage.total_tokens if response.usage else 'N/A'})"
            )
            return response
        except Exception as e:
            logger.error(f"Failed to create response: {e}")
            raise

    def extract_text_output(self, response: Response) -> str:
        """Extract text content from a Response object.

        Uses the same logic as main.ipynb for consistency.

        Args:
            response: The Response object

        Returns:
            The extracted text content

        Raises:
            ValueError: If no text content found in response
        """
        try:
            # Same logic as notebook: find ResponseOutputMessage and extract text
            response_output_text = [
                item for item in response.output
                if isinstance(item, ResponseOutputMessage)
            ][0].content[0].text

            return response_output_text
        except (IndexError, AttributeError) as e:
            logger.error(f"Failed to extract text from response: {e}")
            raise ValueError(f"No text content found in response: {e}")

    def extract_file_citations(self, response: Response) -> List[Dict[str, Any]]:
        """Extract file citations from a Response object.

        Utility method to get all file citations that were used in
        generating the response.

        Args:
            response: The Response object

        Returns:
            List of file citation dictionaries with file_id, filename, index
        """
        try:
            citations = []

            # Get the message output (same pattern as text extraction)
            message_outputs = [
                item for item in response.output
                if isinstance(item, ResponseOutputMessage)
            ]

            if not message_outputs:
                return citations

            # Extract citations from annotations
            for content_item in message_outputs[0].content:
                if hasattr(content_item, 'annotations'):
                    for annotation in content_item.annotations:
                        if annotation.type == 'file_citation':
                            citations.append({
                                'file_id': annotation.file_id,
                                'filename': getattr(annotation, 'filename', None),
                                'index': annotation.index
                            })

            return citations
        except Exception as e:
            logger.warning(f"Failed to extract citations from response: {e}")
            return []  # Return empty list rather than raising
