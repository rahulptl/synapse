"""
Chat service for conversational AI interactions.
"""
from typing import List, Optional, Dict, Any
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, desc
from sqlalchemy.orm import defer
import logging
import re

from app.models.database import Conversation, Message, KnowledgeItem
from app.models.schemas import (
    ChatRequest, ChatResponse, MessageRole, ConversationCreate,
    Conversation as ConversationSchema, Message as MessageSchema
)
from app.services.search_service import search_service, convert_numpy_types
from app.core.embeddings import chat_service as ai_chat_service
from app.config import settings

logger = logging.getLogger(__name__)


class ChatService:
    """Service for managing conversations and chat interactions."""

    async def chat(
        self,
        db: AsyncSession,
        user_id: UUID,
        chat_request: ChatRequest
    ) -> ChatResponse:
        """
        Process a chat request and generate a response.

        Args:
            db: Database session
            user_id: User ID
            chat_request: Chat request with message and context

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

            # Ensure conversation has a meaningful title after the first user message
            await self._maybe_update_conversation_title(
                db=db,
                conversation=conversation,
                message_text=chat_request.message
            )

            # Parse hashtags from the message
            hashtag_info = search_service.parse_hashtags_from_message(chat_request.message)
            hashtags = hashtag_info["hashtags"]
            cleaned_message = hashtag_info["cleaned_message"]

            # Look up folder IDs for the hashtags
            matched_folders = await search_service.get_folder_ids_by_names(db, hashtags, user_id)
            folder_ids = [folder["id"] for folder in matched_folders if folder.get("id")] if matched_folders else None
            recognized_folders = matched_folders if matched_folders else []

            # Log hashtag processing
            if hashtags:
                logger.info(f"Found {len(matched_folders)}/{len(hashtags)} matching folders for hashtags")

            # Use cleaned message for hybrid search (BM25 + semantic), with folder filtering if applicable
            search_query = cleaned_message if cleaned_message.strip() else chat_request.message
            context_results = await search_service.hybrid_search(
                db=db,
                user_id=user_id,
                query_text=search_query,
                folder_ids=folder_ids,
                limit=10,  # Get more results with hybrid ranking
                semantic_weight=0.7,  # 70% semantic similarity
                bm25_weight=0.3       # 30% keyword matching
            )

            # Check if hashtags were used but no folders matched
            unrecognized_hashtags = [tag for tag in hashtags
                                   if not any(folder["name"] == tag for folder in matched_folders)]

            # Build conversation history
            conversation_history = await self._get_conversation_history(
                db, conversation.id, limit=settings.MAX_CHAT_HISTORY
            )

            # Generate AI response with enhanced context
            ai_response = await self._generate_ai_response_enhanced(
                chat_request.message,
                context_results,
                conversation_history,
                hashtags,
                recognized_folders,
                unrecognized_hashtags,
                folder_ids
            )

            # Store assistant message with metadata
            sources_metadata = [
                {
                    "title": result["title"],
                    "source": result.get("source_url", f"Folder: {result.get('folder_name', 'Unknown')}"),
                    "similarity": float(result["similarity"])  # Convert to native Python float for JSON serialization
                } for result in context_results
            ]

            assistant_message = await self._store_message(
                db, user_id, conversation.id, MessageRole.ASSISTANT, ai_response,
                metadata={"sources": sources_metadata}
            )

            # Build enhanced hashtag info
            enhanced_hashtag_info = {
                "detected_hashtags": hashtags,
                "recognized_folders": recognized_folders,
                "unrecognized_hashtags": unrecognized_hashtags,
                "folder_filtered": folder_ids is not None and len(folder_ids) > 0
            }

            # Defensive conversion to ensure no numpy types in response
            context_results = convert_numpy_types(context_results)
            enhanced_hashtag_info = convert_numpy_types(enhanced_hashtag_info)

            return ChatResponse(
                response=ai_response,
                conversation_id=conversation.id,
                sources=context_results,
                context_count=len(context_results),
                hashtag_info=enhanced_hashtag_info
            )

        except Exception as e:
            logger.error(f"Chat processing failed: {e}")
            raise

    async def get_conversation(
        self,
        db: AsyncSession,
        user_id: UUID,
        conversation_id: UUID
    ) -> Optional[ConversationSchema]:
        """
        Get a conversation by ID.

        Args:
            db: Database session
            user_id: User ID
            conversation_id: Conversation ID

        Returns:
            Conversation if found
        """
        stmt = select(Conversation).where(
            and_(
                Conversation.id == conversation_id,
                Conversation.user_id == user_id
            )
        )

        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_conversations(
        self,
        db: AsyncSession,
        user_id: UUID,
        limit: int = 50
    ) -> List[ConversationSchema]:
        """
        List conversations for a user.

        Args:
            db: Database session
            user_id: User ID
            limit: Maximum conversations to return

        Returns:
            List of conversations
        """
        stmt = (
            select(Conversation)
            .where(Conversation.user_id == user_id)
            .order_by(desc(Conversation.updated_at))
            .limit(limit)
        )

        result = await db.execute(stmt)
        conversations = result.scalars().all()

        # Backfill titles for legacy conversations that still use the default name
        conversations_to_refresh: List[Conversation] = []
        for conversation in conversations:
            if not self._needs_title_update(conversation):
                continue

            fallback_title = await self._generate_title_from_existing_messages(db, conversation.id)
            if fallback_title:
                conversation.title = fallback_title
                conversations_to_refresh.append(conversation)

        if conversations_to_refresh:
            await db.commit()
            for conversation in conversations_to_refresh:
                await db.refresh(conversation)

        return conversations

    async def create_conversation(
        self,
        db: AsyncSession,
        user_id: UUID,
        title: str
    ) -> ConversationSchema:
        """
        Create a new conversation.

        Args:
            db: Database session
            user_id: User ID
            title: Conversation title

        Returns:
            Created conversation
        """
        conversation = Conversation(
            user_id=user_id,
            title=title
        )

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
        """
        Get messages for a conversation.

        Args:
            db: Database session
            user_id: User ID
            conversation_id: Conversation ID
            limit: Maximum messages to return

        Returns:
            List of messages
        """
        # Verify conversation belongs to user
        conversation = await self.get_conversation(db, user_id, conversation_id)
        if not conversation:
            return []

        stmt = (
            select(Message)
            .options(defer(Message.message_metadata))
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
        """
        Delete a conversation and all its messages.

        Args:
            db: Database session
            user_id: User ID
            conversation_id: Conversation ID

        Returns:
            True if deleted successfully
        """
        conversation = await self.get_conversation(db, user_id, conversation_id)
        if not conversation:
            return False

        await db.delete(conversation)
        await db.commit()
        return True

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
        conversation = Conversation(
            user_id=user_id,
            title="New Conversation"
        )

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
        """Set a conversation title based on the first user message when needed."""
        if not self._needs_title_update(conversation):
            return

        generated_title = self._create_title_from_message(message_text)
        if not generated_title:
            return

        conversation.title = generated_title
        await db.commit()
        await db.refresh(conversation)

    def _needs_title_update(self, conversation: Conversation) -> bool:
        """Determine if the conversation still uses the default placeholder title."""
        title = (conversation.title or "").strip()
        if not title:
            return True

        normalized = title.lower()
        return normalized == "new conversation"

    def _create_title_from_message(self, message_text: str) -> Optional[str]:
        """Generate a short title from the provided message text."""
        if not message_text:
            return None

        cleaned = re.sub(r"\s+", " ", message_text).strip()
        if not cleaned:
            return None

        max_length = 80
        if len(cleaned) <= max_length:
            return cleaned

        truncated = cleaned[:max_length].rstrip()
        # Try to avoid cutting off mid-word when possible
        last_space = truncated.rfind(" ")
        if last_space > 40:  # give ourselves enough characters before fallback
            truncated = truncated[:last_space]
        return f"{truncated}..."

    async def _generate_title_from_existing_messages(
        self,
        db: AsyncSession,
        conversation_id: UUID
    ) -> Optional[str]:
        """Create a conversation title based on the earliest user message."""
        stmt = (
            select(Message)
            .where(
                and_(
                    Message.conversation_id == conversation_id,
                    Message.role == MessageRole.USER.value
                )
            )
            .order_by(Message.created_at)
            .limit(1)
        )

        result = await db.execute(stmt)
        first_user_message = result.scalar_one_or_none()
        if not first_user_message:
            return None

        return self._create_title_from_message(first_user_message.content)

    async def _get_conversation_history(
        self,
        db: AsyncSession,
        conversation_id: UUID,
        limit: int = 10
    ) -> List[Dict[str, str]]:
        """Get recent conversation history."""
        stmt = (
            select(Message)
            .where(Message.conversation_id == conversation_id)
            .order_by(desc(Message.created_at))
            .limit(limit)
        )

        result = await db.execute(stmt)
        messages = result.scalars().all()

        # Reverse to get chronological order
        messages = list(reversed(messages))

        # Convert to chat format
        history = []
        for message in messages:
            history.append({
                "role": message.role,
                "content": message.content
            })

        return history

    async def _generate_ai_response_enhanced(
        self,
        user_message: str,
        context_results: List[Dict[str, Any]],
        conversation_history: List[Dict[str, str]],
        hashtags: List[str],
        recognized_folders: List[Dict[str, Any]],
        unrecognized_hashtags: List[str],
        folder_ids: Optional[List[UUID]]
    ) -> str:
        """Generate enhanced AI response using context and conversation history."""
        try:
            # Prepare context documents
            context_documents = []
            for result in context_results:
                context_documents.append({
                    "title": result["title"],
                    "content": result["content"],
                    "source": result.get("source_url", f"Folder: {result.get('folder_name', 'Unknown')}"),
                    "similarity": result["similarity"]
                })

            # Build folder filtering information
            folder_filter_info = ""
            if folder_ids and len(folder_ids) > 0:
                hashtag_names = [f"#{tag}" for tag in hashtags]
                recognized_names = [folder["name"] for folder in recognized_folders]
                folder_filter_info = f"\n\nFOLDER FILTERING: The user specified hashtags ({', '.join(hashtag_names)}), so this search was filtered to specific folders: {', '.join(recognized_names)}."

                if unrecognized_hashtags:
                    unrecognized_names = [f"#{tag}" for tag in unrecognized_hashtags]
                    folder_filter_info += f" Note: Some hashtags were not recognized as folder names: {', '.join(unrecognized_names)}."

            # Build system prompt with context (matching edge function format)
            context_text = ""
            if context_documents:
                context_text = f"\n\nCONTEXT DOCUMENTS:\n"
                for idx, doc in enumerate(context_documents, 1):
                    context_text += f"[{idx}] Title: {doc['title']}\n"
                    context_text += f"Source: {doc['source']}\n"
                    context_text += f"Content: {doc['content']}\n"
                    context_text += f"Relevance: {(doc['similarity'] * 100):.1f}%\n\n"

            system_message = f"""You are a knowledgeable assistant with access to the user's personal knowledge base. Answer questions based on the provided context documents and conversation history.{folder_filter_info}
{context_text}
INSTRUCTIONS:
- Answer based primarily on the provided context documents
- If the context is insufficient, clearly state your limitations
- Cite sources using [Source: title] format when referencing specific information
- Be conversational and helpful
- If no relevant context is found, politely explain that you don't have information on that topic in the knowledge base{' - Remember that this search was filtered to specific folders based on the hashtags provided' if folder_ids and len(folder_ids) > 0 else ''}"""

            # Build messages for chat completion
            messages = [{"role": "system", "content": system_message}]

            # Add conversation history (limit to avoid token limits)
            recent_history = conversation_history[-8:]  # Include recent conversation history
            messages.extend(recent_history)

            # Add current user message
            messages.append({"role": "user", "content": user_message})

            # Generate response using AI service
            response = await ai_chat_service.generate_completion(
                messages=messages,
                max_tokens=2000,
                temperature=0.7
            )

            return response

        except Exception as e:
            logger.error(f"Enhanced AI response generation failed: {e}")
            return "I apologize, but I'm having trouble generating a response right now. Please try again."

    async def _generate_ai_response(
        self,
        user_message: str,
        context_results: List[Dict[str, Any]],
        conversation_history: List[Dict[str, str]]
    ) -> str:
        """Generate AI response using context and conversation history (legacy method)."""
        return await self._generate_ai_response_enhanced(
            user_message, context_results, conversation_history, [], [], [], None
        )


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
        message_count_stmt = select(Message).where(Message.conversation_id == conversation_id)
        message_result = await db.execute(message_count_stmt)
        message_count = len(message_result.scalars().all())

        # Get latest message
        latest_message_stmt = (
            select(Message)
            .where(Message.conversation_id == conversation_id)
            .order_by(desc(Message.created_at))
            .limit(1)
        )
        latest_result = await db.execute(latest_message_stmt)
        latest_message = latest_result.scalar_one_or_none()

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


# Service instance
chat_service = ChatService()
