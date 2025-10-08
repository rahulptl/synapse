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

from app.models.database import Conversation, Message, KnowledgeItem, ProcessingJob, Profile
from app.models.auth import User
from app.models.schemas import (
    ChatRequest, ChatResponse, MessageRole, ConversationCreate,
    Conversation as ConversationSchema, Message as MessageSchema
)
from app.services.search_service import search_service, convert_numpy_types
from app.services.intent_service import intent_classifier
from app.services.mapreduce_service import mapreduce_service
from app.core.embeddings import chat_service as ai_chat_service
from app.config import settings
from datetime import datetime, timezone
from sqlalchemy import func

logger = logging.getLogger(__name__)

# Token counting (lazy import to avoid dependency issues)
_tiktoken_encoder = None

def _get_token_encoder():
    """Get or initialize tiktoken encoder."""
    global _tiktoken_encoder
    if _tiktoken_encoder is None:
        try:
            import tiktoken
            _tiktoken_encoder = tiktoken.get_encoding("cl100k_base")  # GPT-4 tokenizer
        except ImportError:
            logger.warning("tiktoken not available, using character-based estimation")
            _tiktoken_encoder = False
    return _tiktoken_encoder

def estimate_tokens(text: str) -> int:
    """
    Estimate token count for text.

    Uses tiktoken if available, otherwise falls back to character-based estimation.
    """
    encoder = _get_token_encoder()
    if encoder and encoder is not False:
        return len(encoder.encode(text))
    else:
        # Fallback: rough estimation (1 token ≈ 4 characters)
        return len(text) // 4

def count_message_tokens(messages: List[Dict[str, str]]) -> int:
    """
    Count total tokens in message list (for chat completion).

    Includes overhead for message formatting.
    """
    total = 0
    for message in messages:
        # Each message has ~4 tokens overhead for role/formatting
        total += 4
        total += estimate_tokens(message.get("content", ""))

    # Additional overhead for chat completion
    total += 3  # for reply priming

    return total


class ChatService:
    """Service for managing conversations and chat interactions."""

    async def chat(
        self,
        db: AsyncSession,
        user_id: UUID,
        chat_request: ChatRequest,
        background_tasks: Any = None
    ) -> ChatResponse:
        """
        Process a chat request and generate a response with intent-driven routing.

        Args:
            db: Database session
            user_id: User ID
            chat_request: Chat request with message and context
            background_tasks: FastAPI BackgroundTasks for async processing

        Returns:
            ChatResponse: Generated response with sources and context
        """
        try:
            # Get or create conversation
            conversation = await self._get_or_create_conversation(
                db, user_id, chat_request.conversation_id
            )

            # Store user message
            user_message = await self._store_message(
                db, user_id, conversation.id, MessageRole.USER, chat_request.message
            )

            # Ensure conversation has a meaningful title after the first user message
            await self._maybe_update_conversation_title(
                db=db,
                conversation=conversation,
                message_text=chat_request.message
            )

            # Parse both # (folders) and @ (files) from the message
            ref_info = search_service.parse_all_references_from_message(chat_request.message)
            hashtags = ref_info["hashtags"]
            file_refs = ref_info["file_refs"]
            cleaned_message = ref_info["cleaned_message"]

            # Look up folder IDs for the # hashtags
            matched_folders = await search_service.get_folder_ids_by_names(db, hashtags, user_id)
            folder_ids = [folder["id"] for folder in matched_folders if folder.get("id")] if matched_folders else None
            recognized_folders = matched_folders if matched_folders else []

            # Look up file IDs for @ references
            matched_files = []
            if file_refs:
                matched_files = await search_service.match_filenames(
                    db=db,
                    file_references=file_refs,
                    folder_ids=folder_ids,  # Search within specified folders if any
                    user_id=user_id,
                    min_similarity=70.0
                )
                if matched_files:
                    logger.info(f"Matched {len(matched_files)} files for @ references: {file_refs}")

            # Also check for unmatched hashtags - they might be filename references (backward compatibility)
            recognized_folder_names = [f["name"] for f in matched_folders]
            unmatched_hashtags = [tag for tag in hashtags if tag not in recognized_folder_names]

            # Try to match unmatched hashtags as filenames (for backward compatibility with # as file refs)
            if unmatched_hashtags:
                additional_files = await search_service.match_filenames(
                    db=db,
                    file_references=unmatched_hashtags,
                    folder_ids=folder_ids,  # Search within specified folders if any
                    user_id=user_id,
                    min_similarity=70.0
                )
                if additional_files:
                    logger.info(f"Matched {len(additional_files)} files for unmatched hashtags: {unmatched_hashtags}")
                    matched_files.extend(additional_files)

            # Log reference processing
            if hashtags:
                logger.info(f"Found {len(matched_folders)}/{len(hashtags)} matching folders for #hashtags")
            if file_refs:
                logger.info(f"Processing {len(file_refs)} @file references")

            # Count items in folders for estimation
            folder_item_counts = {}
            if folder_ids:
                for folder_id in folder_ids:
                    count_stmt = select(func.count(KnowledgeItem.id)).where(
                        KnowledgeItem.folder_id == folder_id,
                        KnowledgeItem.user_id == user_id,
                        KnowledgeItem.processing_status == "completed"
                    )
                    result = await db.execute(count_stmt)
                    folder_item_counts[folder_id] = result.scalar() or 0

            # Extract file IDs from matched files
            file_ids = None
            if matched_files:
                file_ids = [file["id"] for file in matched_files]
                logger.info(f"Filtering to {len(file_ids)} matched files")

            # ADAPTIVE RAG ROUTING (3-Tier System)
            # Estimate relevant chunks to determine processing tier
            from app.services.search_service import estimate_relevant_chunks

            estimated_chunks = await estimate_relevant_chunks(
                db=db,
                user_id=user_id,
                query_text=cleaned_message if cleaned_message else chat_request.message,
                folder_ids=folder_ids,
                item_ids=file_ids
            )

            logger.info(f"📊 Estimated {estimated_chunks} relevant chunks for query")

            # Determine tier and create intent_data
            if estimated_chunks <= settings.PROGRESSIVE_MAPREDUCE_THRESHOLD:
                # TIER 1: Quick RAG (0-20 chunks)
                tier = 1
                intent_data = {
                    "intent_type": "quick_qa",
                    "retrieval_strategy": "top_k",
                    "requires_async": False,
                    "estimated_items": estimated_chunks,
                    "tier": 1
                }
                logger.info(f"🚀 Tier 1: Quick RAG with up to {settings.QUICK_RAG_CHUNK_LIMIT} chunks")

            elif estimated_chunks <= settings.FULL_MAPREDUCE_THRESHOLD:
                # TIER 2: Progressive Map-Reduce (21-100 chunks)
                tier = 2
                intent_data = {
                    "intent_type": "progressive_analysis",
                    "retrieval_strategy": "filtered_full",
                    "requires_async": True,
                    "requires_progressive_reduce": True,
                    "estimated_items": estimated_chunks,
                    "tier": 2
                }
                logger.info(f"⚡ Tier 2: Progressive Map-Reduce for {estimated_chunks} chunks")

            else:
                # TIER 3: Full Map-Reduce (100+ chunks)
                tier = 3
                intent_data = {
                    "intent_type": "comprehensive_analysis",
                    "retrieval_strategy": "full_folder",
                    "requires_async": True,
                    "requires_progressive_reduce": True,
                    "estimated_items": estimated_chunks,
                    "tier": 3
                }
                logger.info(f"🔥 Tier 3: Full Map-Reduce for {estimated_chunks} chunks")

            # ROUTING DECISION
            if intent_data.get("requires_async") and folder_ids and background_tasks:
                # Tier 2 or 3: Use async processing with map-reduce
                return await self._handle_async_query(
                    db=db,
                    user_id=user_id,
                    conversation=conversation,
                    user_message=user_message,
                    chat_request=chat_request,
                    intent_data=intent_data,
                    folder_ids=folder_ids,
                    hashtags=hashtags,
                    matched_folders=matched_folders,
                    background_tasks=background_tasks
                )
            else:
                # Tier 1: Quick query with enhanced context
                return await self._handle_quick_query(
                    db=db,
                    user_id=user_id,
                    conversation=conversation,
                    chat_request=chat_request,
                    cleaned_message=cleaned_message,
                    folder_ids=folder_ids,
                    hashtags=hashtags,
                    matched_folders=matched_folders,
                    matched_files=matched_files,
                    intent_data=intent_data
                )

        except Exception as e:
            logger.error(f"Chat processing failed: {e}")
            raise

    async def _handle_async_query(
        self,
        db: AsyncSession,
        user_id: UUID,
        conversation: Conversation,
        user_message: Message,
        chat_request: ChatRequest,
        intent_data: Dict[str, Any],
        folder_ids: List[UUID],
        hashtags: List[str],
        matched_folders: List[Dict[str, Any]],
        background_tasks: Any
    ) -> ChatResponse:
        """Handle long-running async query."""

        # Create processing job
        job = ProcessingJob(
            user_id=user_id,
            conversation_id=conversation.id,
            message_id=user_message.id,
            job_type=intent_data["intent_type"],
            status="queued",
            user_query=chat_request.message,
            intent_data=intent_data,
            estimated_completion_seconds=int(intent_data["estimated_time_seconds"])
        )

        db.add(job)
        await db.commit()
        await db.refresh(job)

        # Schedule background processing
        background_tasks.add_task(
            self._process_job_in_background,
            job.id,
            user_id,
            folder_ids
        )

        # Build hashtag info
        enhanced_hashtag_info = {
            "detected_hashtags": hashtags,
            "recognized_folders": matched_folders,
            "folder_filtered": True
        }

        # Return immediate response
        estimated_time_str = f"{intent_data['estimated_time_seconds']:.0f} seconds"
        if intent_data['estimated_time_seconds'] > 60:
            estimated_time_str = f"{intent_data['estimated_time_seconds'] / 60:.1f} minutes"

        response_message = (
            f"I'm analyzing {intent_data['estimated_items']} items in your folder. "
            f"This will take approximately {estimated_time_str}. "
            f"Feel free to explore other conversations—I'll have your answer ready when you return. "
            f"You can also stay on this page to watch the progress."
        )

        return ChatResponse(
            response=response_message,
            conversation_id=conversation.id,
            job_id=str(job.id),
            job_status="queued",
            estimated_completion_seconds=job.estimated_completion_seconds,
            sources=[],
            context_count=0,
            hashtag_info=enhanced_hashtag_info
        )

    async def _check_items_processing_status(
        self,
        db: AsyncSession,
        folder_ids: Optional[List[UUID]],
        user_id: UUID
    ) -> Optional[Dict[str, Any]]:
        """
        Check if any items in the specified folders are still processing.

        Args:
            db: Database session
            folder_ids: List of folder IDs to check
            user_id: User ID

        Returns:
            Dict with processing items info if any are processing, None otherwise
        """
        if not folder_ids:
            return None

        # Get items in these folders that are still processing
        stmt = select(KnowledgeItem).where(
            KnowledgeItem.user_id == user_id,
            KnowledgeItem.folder_id.in_(folder_ids),
            KnowledgeItem.processing_status.in_(["queued", "processing"])
        )
        result = await db.execute(stmt)
        processing_items = result.scalars().all()

        if not processing_items:
            return None

        # Build status info
        processing_details = []
        for item in processing_items:
            progress_pct = item.processing_progress if item.processing_progress else 0.0
            chunks_info = f"{item.chunks_processed}/{item.total_chunks}" if item.total_chunks > 0 else "calculating..."

            processing_details.append({
                "title": item.title,
                "status": item.processing_status,
                "progress": progress_pct,
                "chunks_info": chunks_info,
                "estimated_completion": item.estimated_completion.isoformat() if item.estimated_completion else None
            })

        return {
            "has_processing_items": True,
            "processing_count": len(processing_items),
            "items": processing_details
        }

    async def _handle_quick_query(
        self,
        db: AsyncSession,
        user_id: UUID,
        conversation: Conversation,
        chat_request: ChatRequest,
        cleaned_message: str,
        folder_ids: Optional[List[UUID]],
        hashtags: List[str],
        matched_folders: List[Dict[str, Any]],
        matched_files: List[Dict[str, Any]] = [],
        intent_data: Optional[Dict[str, Any]] = None
    ) -> ChatResponse:
        """Handle quick query with existing RAG flow."""

        # Check if any items are still processing
        processing_status = await self._check_items_processing_status(db, folder_ids, user_id)

        # If specific files were matched, filter search to those files
        file_ids = None
        if matched_files:
            file_ids = [file["id"] for file in matched_files]
            logger.info(f"Filtering search to {len(file_ids)} matched files")

        # Get retrieval strategy from intent data if available
        retrieval_strategy = "top_k"  # default
        if intent_data and "retrieval_strategy" in intent_data:
            retrieval_strategy = intent_data["retrieval_strategy"]
            logger.info(f"Using retrieval strategy: {retrieval_strategy}")

        # OPTIMIZATION: For @file references, try to use full file content if small enough
        context_results = []
        used_full_files = False

        if file_ids and len(file_ids) <= 3:  # Only for up to 3 files to avoid context explosion
            full_file_results = await self._try_full_file_context(db, file_ids, user_id)

            if full_file_results:
                # Successfully using full file content
                context_results = full_file_results
                used_full_files = True
                logger.info(f"📄 Using full content from {len(file_ids)} file(s) ({sum(r.get('token_count', 0) for r in full_file_results)} tokens)")

        # Skip search if intent is "no_search_needed" (greetings, chitchat, general knowledge)
        if not used_full_files and retrieval_strategy != "none":
            # Use cleaned message for hybrid search (BM25 + semantic), with folder and/or file filtering
            search_query = cleaned_message if cleaned_message.strip() else chat_request.message
            context_results = await search_service.hybrid_search(
                db=db,
                user_id=user_id,
                query_text=search_query,
                folder_ids=folder_ids,
                item_ids=file_ids,  # Filter to specific files if #filename references were matched
                limit=10,
                semantic_weight=0.7,
                bm25_weight=0.3,
                retrieval_strategy=retrieval_strategy
            )
        elif retrieval_strategy == "none":
            logger.info(f"⚡ Skipping search - intent: {intent_data.get('intent_type', 'unknown')} (no knowledge base search needed)")

        # Check if hashtags were used but no folders OR files matched
        recognized_folder_names = [f["name"] for f in matched_folders]
        recognized_file_refs = [f["reference"] for f in matched_files]
        unrecognized_hashtags = [
            tag for tag in hashtags
            if tag not in recognized_folder_names and tag not in recognized_file_refs
        ]

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
            matched_folders,
            unrecognized_hashtags,
            folder_ids
        )

        # Add processing warning if applicable
        if processing_status:
            warning_lines = ["\n\n⚠️ **Processing Status Alert:**"]
            warning_lines.append(f"{processing_status['processing_count']} file(s) are still being processed:\n")

            for item in processing_status['items']:
                status_icon = "🔄" if item['status'] == 'processing' else "⏳"
                warning_lines.append(
                    f"{status_icon} **{item['title']}**: {item['progress']:.1f}% complete "
                    f"({item['chunks_info']} chunks)"
                )

            warning_lines.append("\nResults may be incomplete until processing finishes.")
            ai_response += "\n".join(warning_lines)
            logger.info(f"Added processing warning for {processing_status['processing_count']} items")

        # Store assistant message with metadata
        sources_metadata = [
            {
                "title": result["title"],
                "source": result.get("source_url", f"Folder: {result.get('folder_name', 'Unknown')}"),
                "similarity": float(result["similarity"])
            } for result in context_results
        ]

        assistant_message = await self._store_message(
            db, user_id, conversation.id, MessageRole.ASSISTANT, ai_response,
            metadata={"sources": sources_metadata}
        )

        # Build enhanced hashtag info
        enhanced_hashtag_info = {
            "detected_hashtags": hashtags,
            "recognized_folders": matched_folders,
            "matched_files": matched_files,
            "unrecognized_hashtags": unrecognized_hashtags,
            "folder_filtered": folder_ids is not None and len(folder_ids) > 0,
            "file_filtered": file_ids is not None and len(file_ids) > 0
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

    async def _process_job_in_background(
        self,
        job_id: UUID,
        user_id: UUID,
        folder_ids: List[UUID]
    ):
        """Background task to process long-running job."""

        # Create new DB session for background task
        from app.core.database import async_session_maker

        async with async_session_maker() as db:
            try:
                # Get job
                job = await db.get(ProcessingJob, job_id)
                if not job:
                    logger.error(f"Job {job_id} not found")
                    return

                # Process with map-reduce
                result = await mapreduce_service.process_query(
                    db=db,
                    job=job,
                    user_query=job.user_query,
                    intent_data=job.intent_data,
                    folder_ids=folder_ids
                )

                # Store as message in conversation
                await self._store_message(
                    db=db,
                    user_id=user_id,
                    conversation_id=job.conversation_id,
                    role=MessageRole.ASSISTANT,
                    content=result["response"],
                    metadata={
                        "sources": result.get("sources", []),
                        "job_id": str(job_id),
                        "aggregation_details": job.aggregation_details
                    }
                )

                logger.info(f"Job {job_id} completed successfully")

            except Exception as e:
                logger.error(f"Background job {job_id} failed: {e}", exc_info=True)

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

        await self._ensure_profile_exists(db, user_id)

        # Create new conversation
        conversation = Conversation(
            user_id=user_id,
            title="New Conversation"
        )

        db.add(conversation)
        await db.commit()
        await db.refresh(conversation)
        return conversation

    async def _ensure_profile_exists(self, db: AsyncSession, user_id: UUID) -> Profile:
        """Ensure a profile row exists for the given user."""
        stmt = select(Profile).where(Profile.user_id == user_id)
        result = await db.execute(stmt)
        profile = result.scalars().first()
        if profile:
            return profile

        user_stmt = select(User).where(User.id == user_id)
        user_result = await db.execute(user_stmt)
        user = user_result.scalars().first()
        if not user:
            raise ValueError("User not found for profile creation")

        profile = Profile(
            user_id=user.id,
            email=user.email,
            full_name=user.full_name
        )

        db.add(profile)
        await db.flush()
        return profile

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

    def _estimate_tokens(self, text: str) -> int:
        """
        Estimate token count for a given text.

        Uses a simple heuristic: ~1.3 tokens per word for English text.
        This is more conservative than the actual ~0.75 ratio to avoid exceeding limits.
        """
        if not text:
            return 0
        word_count = len(text.split())
        return int(word_count * 1.3)

    async def _get_conversation_history(
        self,
        db: AsyncSession,
        conversation_id: UUID,
        limit: int = 10,
        max_tokens: int = 3000
    ) -> List[Dict[str, str]]:
        """
        Get recent conversation history with smart token management.

        Args:
            db: Database session
            conversation_id: Conversation ID
            limit: Maximum number of messages to retrieve
            max_tokens: Maximum tokens for conversation history

        Returns:
            List of message dicts with role and content, limited by tokens
        """
        # Get more messages than limit to allow for token-based trimming
        stmt = (
            select(Message)
            .where(Message.conversation_id == conversation_id)
            .order_by(desc(Message.created_at))
            .limit(limit * 2)  # Get extra messages for token trimming
        )

        result = await db.execute(stmt)
        messages = result.scalars().all()

        # Reverse to get chronological order (oldest first)
        messages = list(reversed(messages))

        # Build context with token management
        history = []
        total_tokens = 0

        # Process messages in chronological order
        for message in messages:
            msg_tokens = self._estimate_tokens(message.content)

            # Check if adding this message would exceed token limit
            if total_tokens + msg_tokens > max_tokens:
                # If we have room for at least half the message, truncate it
                if total_tokens < max_tokens * 0.8 and len(history) > 0:
                    remaining_tokens = max_tokens - total_tokens
                    # Rough truncation based on character count
                    chars_per_token = len(message.content) / msg_tokens if msg_tokens > 0 else 1
                    max_chars = int(remaining_tokens * chars_per_token)
                    truncated_content = message.content[:max_chars] + "..."

                    history.append({
                        "role": message.role,
                        "content": truncated_content
                    })
                break

            history.append({
                "role": message.role,
                "content": message.content
            })
            total_tokens += msg_tokens

            # Stop if we've reached the message limit
            if len(history) >= limit:
                break

        logger.debug(f"Conversation history: {len(history)} messages, ~{total_tokens} tokens")
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

            # Add conversation history (already token-managed by _get_conversation_history)
            messages.extend(conversation_history)

            # Add current user message
            messages.append({"role": "user", "content": user_message})

            # Count tokens to check if we exceed the model's context limit
            total_tokens = count_message_tokens(messages)

            logger.info(f"Chat context size: {total_tokens} tokens ({len(context_documents)} documents)")

            # If context exceeds safe threshold, use map-reduce approach
            if total_tokens > settings.AUTO_MAPREDUCE_THRESHOLD:
                logger.warning(
                    f"Context size ({total_tokens} tokens) exceeds threshold ({settings.AUTO_MAPREDUCE_THRESHOLD}). "
                    f"Routing to map-reduce processing for summarization."
                )

                # Use map-reduce to process large context
                response = await self._generate_mapreduce_response(
                    user_message=user_message,
                    context_documents=context_documents,
                    conversation_summary=self._summarize_conversation_history(conversation_history)
                )

                return response

            # Normal path: generate response directly
            response = await ai_chat_service.generate_completion(
                messages=messages,
                max_tokens=2000,
                temperature=0.7
            )

            return response

        except Exception as e:
            logger.error(f"Enhanced AI response generation failed: {e}")
            return "I apologize, but I'm having trouble generating a response right now. Please try again."

    async def _generate_mapreduce_response(
        self,
        user_message: str,
        context_documents: List[Dict[str, Any]],
        conversation_summary: str
    ) -> str:
        """
        Generate response using map-reduce when context is too large.

        This breaks down the large context into batches, processes each batch,
        and then aggregates the results into a final response.
        """
        try:
            logger.info(f"Starting map-reduce processing for {len(context_documents)} documents")

            # Create batches of documents (10 documents per batch)
            batch_size = 10
            batches = []
            for i in range(0, len(context_documents), batch_size):
                batch = context_documents[i:i + batch_size]
                batches.append(batch)

            logger.info(f"Created {len(batches)} batches for map-reduce processing")

            # Map phase: Process each batch
            batch_summaries = []
            for batch_idx, batch in enumerate(batches):
                try:
                    # Build context for this batch
                    batch_context = "DOCUMENTS:\n"
                    for idx, doc in enumerate(batch, 1):
                        batch_context += f"[{idx}] {doc['title']}: {doc['content'][:1000]}...\n\n"

                    # Process batch with focused prompt
                    batch_prompt = f"""Based on the following documents, extract information relevant to: "{user_message}"

{batch_context}

Extract only the most relevant information that helps answer the user's question.
Be concise but comprehensive."""

                    batch_response = await ai_chat_service.generate_completion(
                        messages=[
                            {"role": "system", "content": "You are a helpful assistant that extracts relevant information from documents."},
                            {"role": "user", "content": batch_prompt}
                        ],
                        max_tokens=500,
                        temperature=0.3
                    )

                    if batch_response and batch_response.strip():
                        batch_summaries.append({
                            "batch_idx": batch_idx,
                            "summary": batch_response,
                            "doc_count": len(batch)
                        })

                    logger.debug(f"Processed batch {batch_idx + 1}/{len(batches)}")

                except Exception as batch_error:
                    logger.error(f"Batch {batch_idx} processing failed: {batch_error}")
                    continue

            # Reduce phase: Aggregate batch summaries
            if not batch_summaries:
                return "I processed the documents but couldn't extract relevant information. Please try refining your question."

            # Combine batch summaries
            combined_summaries = "\n\n".join([
                f"Document Group {s['batch_idx'] + 1} ({s['doc_count']} documents):\n{s['summary']}"
                for s in batch_summaries
            ])

            # Generate final response
            final_prompt = f"""Based on the following extracted information from multiple documents, provide a comprehensive answer to: "{user_message}"

EXTRACTED INFORMATION:
{combined_summaries}

{conversation_summary}

Provide a well-organized, helpful response that synthesizes the information above. Do NOT mention document groups, sections, or the internal processing structure in your response - just provide a clear, direct answer to the user's question."""

            final_response = await ai_chat_service.generate_completion(
                messages=[
                    {"role": "system", "content": "You are a knowledgeable assistant that synthesizes information from multiple sources."},
                    {"role": "user", "content": final_prompt}
                ],
                max_tokens=2000,
                temperature=0.7
            )

            logger.info(f"Map-reduce processing complete: {len(batches)} batches processed")

            return final_response

        except Exception as e:
            logger.error(f"Map-reduce response generation failed: {e}", exc_info=True)
            return "I encountered an issue processing the large amount of context. Please try narrowing your search or being more specific."

    def _summarize_conversation_history(self, conversation_history: List[Dict[str, str]]) -> str:
        """Create a brief summary of conversation history for context."""
        if not conversation_history:
            return ""

        if len(conversation_history) <= 2:
            return "\nPREVIOUS CONVERSATION:\n" + "\n".join([
                f"{msg['role'].upper()}: {msg['content'][:200]}"
                for msg in conversation_history
            ])

        return f"\nCONVERSATION CONTEXT: This is part of an ongoing conversation with {len(conversation_history)} previous messages."

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
