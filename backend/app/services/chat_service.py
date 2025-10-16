"""
Simple Chat Service using OpenAI Responses API.

This service provides conversational AI interactions using OpenAI's Responses API
with vector stores for the simplified 3-table architecture.
"""
from typing import List, Optional, Dict, Any
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func
import logging

from app.models.database import Conversation, Message, KnowledgeItem, Profile, Folder, OpenAIFile
from app.models.schemas import (
    ChatRequest, ChatResponse, MessageRole,
    Conversation as ConversationSchema, Message as MessageSchema
)
from app.services.search_service import search_service
from app.services.openai import ResponsesService, VectorStoreService
from app.config import settings
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


class ChatService:
    """Simple chat service using OpenAI Responses API with Vector Stores."""

    def __init__(self):
        self.responses_service = ResponsesService()
        self.vector_store_service = VectorStoreService()

    async def chat(
        self,
        db: AsyncSession,
        user_id: UUID,
        chat_request: ChatRequest,
        background_tasks: Any = None
    ) -> ChatResponse:
        """
        Process a chat request using OpenAI Responses API.

        Args:
            db: Database session
            user_id: User ID
            chat_request: Chat request with message and context
            background_tasks: FastAPI BackgroundTasks (unused)

        Returns:
            ChatResponse: Generated response with sources and context
        """
        try:
            # Get or create conversation
            conversation = await self._get_or_create_conversation(
                db, user_id, chat_request.conversation_id
            )

            # Store user message
            await self._store_message(
                db, user_id, conversation.id, MessageRole.USER, chat_request.message
            )

            # Update conversation title if needed
            await self._maybe_update_conversation_title(
                db, conversation, chat_request.message
            )

            # Parse references from message
            ref_info = search_service.parse_all_references_from_message(chat_request.message)
            hashtags = ref_info["hashtags"]
            file_refs = ref_info["file_refs"]
            cleaned_message = ref_info["cleaned_message"]

            # Get folder mappings
            matched_folders = await search_service.get_folder_ids_by_names(db, hashtags, user_id)
            folder_ids = [folder["id"] for folder in matched_folders if folder.get("id")]

            # Calculate unrecognized hashtags
            recognized_folder_names = {f["name"].lower() for f in matched_folders}
            unrecognized_hashtags = [tag for tag in hashtags if tag.lower() not in recognized_folder_names]

            # Get user's vector store
            vector_store_id = await self._get_user_vector_store(db, user_id)
            if not vector_store_id:
                return self._create_simple_response(conversation.id, "No vector store found. Please upload some content first.")

            # Build OpenAI attribute filter for folder filtering
            attribute_filter = self._build_attribute_filter(folder_ids) if folder_ids else None

            # Build system instructions
            instructions = self._build_instructions(hashtags, matched_folders)

            # Get previous response ID for conversation continuity
            previous_response_id = conversation.last_response_id if conversation else None

            # Create response with OpenAI (with both file_search and web_search enabled)
            response = await self.responses_service.chat(
                query=cleaned_message if cleaned_message.strip() else chat_request.message,
                vector_store_ids=[vector_store_id],
                instructions=instructions,
                previous_response_id=previous_response_id,  # Enable conversation continuity
                max_num_results=20,
                temperature=0.7,
                attribute_filter=attribute_filter  # Apply folder filtering via OpenAI metadata
            )

            # Extract response content and citations
            ai_response = self.responses_service.extract_text_output(response)
            citations = self.responses_service.extract_file_citations(response)

            # Build sources from citations
            sources = await self._build_sources_from_citations(db, citations, user_id)

            # Store assistant message WITH sources in metadata
            await self._store_message(
                db, user_id, conversation.id, MessageRole.ASSISTANT, ai_response,
                metadata={
                    "openai_response_id": response.id,
                    "citations": citations,
                    "sources": sources  # Store sources so they're available when reloading messages
                }
            )

            # Update conversation with last_response_id for continuity
            conversation.last_response_id = response.id
            await db.commit()
            await db.refresh(conversation)

            return ChatResponse(
                response=ai_response,
                conversation_id=conversation.id,
                sources=sources,
                context_count=len(sources),
                hashtag_info={
                    "detected_hashtags": hashtags,
                    "recognized_folders": matched_folders,
                    "unrecognized_hashtags": unrecognized_hashtags,
                    "folder_filtered": folder_ids is not None,
                    "processing_strategy": "openai_responses"
                }
            )

        except Exception as e:
            logger.error(f"Chat processing failed: {e}", exc_info=True)
            raise

    # Simple helper methods

    async def _get_user_vector_store(self, db: AsyncSession, user_id: UUID) -> Optional[str]:
        """Get user's OpenAI vector store ID."""
        stmt = select(Profile.openai_vector_store_id).where(Profile.user_id == user_id)
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    def _build_attribute_filter(self, folder_ids: List[UUID]) -> Dict[str, Any]:
        """Build OpenAI attribute filter for folder-based filtering.

        Args:
            folder_ids: List of folder UUIDs to filter by

        Returns:
            OpenAI attribute filter dictionary
        """
        # If single folder, use simple equality filter
        if len(folder_ids) == 1:
            return {
                "type": "eq",
                "key": "folder_id",
                "value": str(folder_ids[0])
            }

        # If multiple folders, use 'in' filter
        return {
            "type": "in",
            "key": "folder_id",
            "value": [str(fid) for fid in folder_ids]
        }

    def _build_instructions(self, hashtags: List[str], matched_folders: List[Dict[str, Any]]) -> str:
        """Build system instructions for OpenAI Responses API."""
        instructions = "You are a helpful assistant with access to the user's personal knowledge base."

        if hashtags and matched_folders:
            folder_names = [f["name"] for f in matched_folders]
            instructions += (
                f" The user specified hashtags ({', '.join(['#' + tag for tag in hashtags])}) "
                f"which filtered this search to folders: {', '.join(folder_names)}. "
                "Focus your answer on content from these specific folders."
            )

        instructions += (
            " Answer based primarily on the provided context documents. "
            "Cite sources naturally in your response. Be conversational and helpful. "
            "If the context is insufficient, clearly state your limitations."
        )

        return instructions

    def _create_simple_response(self, conversation_id: UUID, message: str) -> ChatResponse:
        """Create a simple chat response without sources."""
        return ChatResponse(
            response=message,
            conversation_id=conversation_id,
            sources=[],
            context_count=0,
            hashtag_info={"processing_strategy": "simple"}
        )

    async def _build_sources_from_citations(
        self,
        db: AsyncSession,
        citations: List[Dict[str, Any]],
        user_id: UUID
    ) -> List[Dict[str, Any]]:
        """Build source list from OpenAI response citations."""
        if not citations:
            return []

        sources = []
        for citation in citations:
            try:
                # Look up OpenAI file and get knowledge item
                stmt = select(OpenAIFile).join(
                    KnowledgeItem, OpenAIFile.knowledge_item_id == KnowledgeItem.id
                ).where(
                    OpenAIFile.openai_file_id == citation["file_id"],
                    KnowledgeItem.user_id == user_id
                )

                result = await db.execute(stmt)
                openai_file = result.scalar_one_or_none()

                if openai_file:
                    knowledge_item = openai_file.knowledge_item
                    sources.append({
                        "id": str(knowledge_item.id),
                        "title": knowledge_item.title,
                        "source": "Knowledge Base",
                        "similarity": 1.0,
                        "content_type": knowledge_item.content_type,
                        "openai_file_id": citation["file_id"],
                        "citation_index": citation.get("index", 0)
                    })

            except Exception as e:
                logger.warning(f"Failed to resolve citation {citation}: {e}")
                continue

        return sources

    # Conversation management methods
    async def get_conversation(
        self,
        db: AsyncSession,
        user_id: UUID,
        conversation_id: UUID
    ) -> Optional[ConversationSchema]:
        """Get a conversation by ID."""
        stmt = select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.user_id == user_id
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_conversations(
        self,
        db: AsyncSession,
        user_id: UUID,
        limit: int = 50
    ) -> List[ConversationSchema]:
        """List conversations for a user."""
        stmt = (
            select(Conversation)
            .where(Conversation.user_id == user_id)
            .order_by(desc(Conversation.updated_at))
            .limit(limit)
        )
        result = await db.execute(stmt)
        return result.scalars().all()

    async def create_conversation(
        self,
        db: AsyncSession,
        user_id: UUID,
        title: str
    ) -> ConversationSchema:
        """Create a new conversation."""
        conversation = Conversation(user_id=user_id, title=title)
        db.add(conversation)
        await db.commit()
        await db.refresh(conversation)
        return conversation

    async def get_conversation_messages(
        self,
        db: AsyncSession,
        user_id: UUID,
        conversation_id: UUID,
        limit: int = 100
    ) -> List[MessageSchema]:
        """Get messages for a conversation."""
        # Verify conversation belongs to user
        conversation = await self.get_conversation(db, user_id, conversation_id)
        if not conversation:
            return []

        stmt = (
            select(Message)
            .where(Message.conversation_id == conversation_id)
            .order_by(Message.created_at)
            .limit(limit)
        )
        result = await db.execute(stmt)
        return result.scalars().all()

    async def delete_conversation(
        self,
        db: AsyncSession,
        user_id: UUID,
        conversation_id: UUID
    ) -> bool:
        """Delete a conversation and all its messages."""
        conversation = await self.get_conversation(db, user_id, conversation_id)
        if not conversation:
            return False

        await db.delete(conversation)
        await db.commit()
        return True

    async def update_conversation_title(
        self,
        db: AsyncSession,
        user_id: UUID,
        conversation_id: UUID,
        title: str
    ) -> Optional[Conversation]:
        """Update conversation title."""
        conversation = await self.get_conversation(db, user_id, conversation_id)
        if not conversation:
            return None

        conversation.title = title
        await db.commit()
        await db.refresh(conversation)
        return conversation

    async def get_conversation_summary(
        self,
        db: AsyncSession,
        user_id: UUID,
        conversation_id: UUID
    ) -> Dict[str, Any]:
        """Get conversation summary with message count and latest activity."""
        conversation = await self.get_conversation(db, user_id, conversation_id)
        if not conversation:
            return {}

        # Get message count
        message_count_stmt = select(func.count(Message.id)).where(
            Message.conversation_id == conversation_id
        )
        message_count = await db.scalar(message_count_stmt) or 0

        # Get latest message
        latest_message_stmt = (
            select(Message)
            .where(Message.conversation_id == conversation_id)
            .order_by(desc(Message.created_at))
            .limit(1)
        )
        result = await db.execute(latest_message_stmt)
        latest_message = result.scalar_one_or_none()

        return {
            "conversation_id": conversation.id,
            "title": conversation.title,
            "message_count": message_count,
            "created_at": conversation.created_at,
            "updated_at": conversation.updated_at,
            "latest_message": {
                "content": latest_message.content[:100] + "..." if latest_message and len(latest_message.content) > 100 else latest_message.content if latest_message else None,
                "role": latest_message.role if latest_message else None,
                "created_at": latest_message.created_at if latest_message else None
            } if latest_message else None
        }

    # Helper methods
    async def _get_or_create_conversation(
        self,
        db: AsyncSession,
        user_id: UUID,
        conversation_id: Optional[UUID]
    ) -> Conversation:
        """Get existing conversation or create a new one."""
        if conversation_id:
            conversation = await self.get_conversation(db, user_id, conversation_id)
            if conversation:
                return conversation

        # Create new conversation
        conversation = Conversation(user_id=user_id, title="New Conversation")
        db.add(conversation)
        await db.commit()
        await db.refresh(conversation)
        return conversation

    async def _store_message(
        self,
        db: AsyncSession,
        user_id: UUID,
        conversation_id: UUID,
        role: MessageRole,
        content: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Message:
        """Store a message in the conversation."""
        message = Message(
            conversation_id=conversation_id,
            user_id=user_id,
            role=role.value,
            content=content,
            message_metadata=metadata or {}
        )
        db.add(message)
        await db.commit()
        await db.refresh(message)
        return message

    async def _maybe_update_conversation_title(
        self,
        db: AsyncSession,
        conversation: Conversation,
        message_text: str
    ) -> None:
        """Update conversation title if it's still the default."""
        if conversation.title and conversation.title.strip().lower() != "new conversation":
            return

        # Generate title from first user message
        title = message_text[:80].strip()
        if len(message_text) > 80:
            title = title.rsplit(' ', 1)[0] + "..."

        conversation.title = title
        await db.commit()


# Service instance
chat_service = ChatService()