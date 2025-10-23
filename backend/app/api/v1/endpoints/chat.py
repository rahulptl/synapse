"""
Chat endpoints with OpenAI Responses API integration.
"""
from typing import Optional, List
from uuid import UUID
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
import logging

from app.core.database import get_db
from app.core.security import validate_any_auth
from app.services.chat_service import chat_service
from app.models.database import ProcessingJob
from app.models.schemas import (
    ChatRequest, ChatResponse, Conversation, ConversationCreate,
    Message, MessageCreate, ProcessingJobStatus
)

router = APIRouter()

logger = logging.getLogger(__name__)


@router.post("", response_model=ChatResponse)
async def chat(
    chat_request: ChatRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    auth_data: dict = Depends(validate_any_auth)
):
    """
    Process chat using OpenAI Responses API.

    Uses the ChatService which integrates with OpenAI's Responses API
    and vector stores for efficient knowledge base retrieval.
    """
    user_id = UUID(auth_data["user_id"])

    # Override user_id from auth if different in request
    if chat_request.user_id != user_id:
        chat_request.user_id = user_id

    try:
        response = await chat_service.chat(
            db=db,
            user_id=user_id,
            chat_request=chat_request,
            background_tasks=background_tasks
        )
        return response
    except Exception as e:
        logger = logging.getLogger(__name__)
        logger.error(f"Chat processing failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Chat processing failed")


@router.get("/conversations", response_model=List[Conversation])
async def get_conversations(
    skip: int = 0,
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
    auth_data: dict = Depends(validate_any_auth)
):
    """
    Get user's conversations.
    """
    user_id = UUID(auth_data["user_id"])

    try:
        conversations = await chat_service.list_conversations(
            db=db,
            user_id=user_id,
            limit=limit
        )
        return conversations
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to fetch conversations")


@router.post("/conversations", response_model=Conversation)
async def create_conversation(
    conversation_data: ConversationCreate,
    db: AsyncSession = Depends(get_db),
    auth_data: dict = Depends(validate_any_auth)
):
    """
    Create a new conversation.
    """
    user_id = UUID(auth_data["user_id"])

    try:
        conversation = await chat_service.create_conversation(
            db=db,
            user_id=user_id,
            title=conversation_data.title
        )
        return conversation
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to create conversation")


@router.get("/conversations/{conversation_id}/messages", response_model=List[Message])
async def get_conversation_messages(
    conversation_id: UUID,
    skip: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    auth_data: dict = Depends(validate_any_auth)
):
    """
    Get messages for a specific conversation.
    """
    user_id = UUID(auth_data["user_id"])

    try:
        messages = await chat_service.get_conversation_messages(
            db=db,
            user_id=user_id,
            conversation_id=conversation_id,
            limit=limit
        )

        # Log the raw messages before schema conversion
        logger.info(f"[API_MESSAGES] Raw messages from service: {len(messages)} messages")
        for msg in messages:
            logger.info(f"[API_MESSAGES] Message {msg.id} metadata type: {type(msg.message_metadata)}, content: {msg.message_metadata}")

        # Convert database Message objects to MessageSchema
        schema_messages = []
        for msg in messages:
            schema_msg = Message(
                id=msg.id,
                conversation_id=msg.conversation_id,
                user_id=msg.user_id,
                role=msg.role,
                content=msg.content,
                created_at=msg.created_at,
                metadata=msg.message_metadata  # This should now be a dict due to our validator
            )
            schema_messages.append(schema_msg)
            logger.info(f"[API_MESSAGES] Schema message {msg.id} metadata: {schema_msg.metadata}")

        return schema_messages
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to fetch messages")


@router.delete("/conversations/{conversation_id}")
async def delete_conversation(
    conversation_id: UUID,
    db: AsyncSession = Depends(get_db),
    auth_data: dict = Depends(validate_any_auth)
):
    """
    Delete a conversation and all its messages.
    """
    user_id = UUID(auth_data["user_id"])

    try:
        success = await chat_service.delete_conversation(
            db=db,
            user_id=user_id,
            conversation_id=conversation_id
        )

        if not success:
            raise HTTPException(status_code=404, detail="Conversation not found")

        return {"success": True, "message": "Conversation deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to delete conversation")


@router.get("/jobs/{job_id}", response_model=ProcessingJobStatus)
async def get_job_status(
    job_id: UUID,
    db: AsyncSession = Depends(get_db),
    auth_data: dict = Depends(validate_any_auth)
):
    """Get status of a processing job."""
    user_id = UUID(auth_data["user_id"])

    job = await db.get(ProcessingJob, job_id)

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if job.user_id != user_id:
        raise HTTPException(status_code=403, detail="Access denied")

    return ProcessingJobStatus(
        job_id=job.id,
        status=job.status,
        progress=job.progress,
        current_phase=job.current_phase,
        processed_items=job.processed_items,
        total_items=job.total_items,
        estimated_completion_seconds=job.estimated_completion_seconds,
        result=job.result if job.status == "completed" else None,
        aggregation_details=job.aggregation_details if job.status == "completed" else None,
        error_message=job.error_message if job.status == "failed" else None,
        started_at=job.started_at,
        completed_at=job.completed_at
    )


@router.get("/jobs", response_model=List[ProcessingJobStatus])
async def list_jobs(
    conversation_id: Optional[UUID] = None,
    status: Optional[str] = None,
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
    auth_data: dict = Depends(validate_any_auth)
):
    """List processing jobs for user."""
    user_id = UUID(auth_data["user_id"])

    stmt = select(ProcessingJob).where(ProcessingJob.user_id == user_id)

    if conversation_id:
        stmt = stmt.where(ProcessingJob.conversation_id == conversation_id)

    if status:
        stmt = stmt.where(ProcessingJob.status == status)

    stmt = stmt.order_by(desc(ProcessingJob.created_at)).limit(limit)

    result = await db.execute(stmt)
    jobs = result.scalars().all()

    return [
        ProcessingJobStatus(
            job_id=job.id,
            status=job.status,
            progress=job.progress,
            current_phase=job.current_phase,
            processed_items=job.processed_items,
            total_items=job.total_items,
            estimated_completion_seconds=job.estimated_completion_seconds,
            result=job.result if job.status == "completed" else None,
            aggregation_details=job.aggregation_details if job.status == "completed" else None,
            error_message=job.error_message if job.status == "failed" else None,
            started_at=job.started_at,
            completed_at=job.completed_at
        )
        for job in jobs
    ]


@router.post("/messages/{message_id}/save-to-knowledge-base")
async def save_message_to_knowledge_base(
    message_id: UUID,
    folder_id: UUID,
    title: Optional[str] = None,
    add_context: bool = True,
    background_tasks: BackgroundTasks = BackgroundTasks(),
    db: AsyncSession = Depends(get_db),
    auth_data: dict = Depends(validate_any_auth)
):
    """
    Save a chat response to the knowledge base.

    Creates a new knowledge item from the message content.
    Optionally includes the user query for better context.
    """
    user_id = UUID(auth_data["user_id"])

    try:
        # Import here to avoid circular dependencies
        from app.models.database import Message as DBMessage, Conversation as DBConversation
        from app.services.content_service import content_service
        from app.models.schemas import KnowledgeItemCreate, ContentType

        # Get the message
        result = await db.execute(
            select(DBMessage)
            .join(DBConversation)
            .where(
                DBMessage.id == message_id,
                DBConversation.user_id == user_id
            )
        )
        message = result.scalar_one_or_none()

        if not message:
            raise HTTPException(status_code=404, detail="Message not found")

        if message.role != 'assistant':
            raise HTTPException(status_code=400, detail="Can only save assistant messages")

        # Get conversation for context
        conv_result = await db.execute(
            select(DBConversation).where(DBConversation.id == message.conversation_id)
        )
        conversation = conv_result.scalar_one_or_none()

        # Build content
        content_parts = []

        if add_context:
            # Get the preceding user message for context
            prev_result = await db.execute(
                select(DBMessage)
                .where(
                    DBMessage.conversation_id == message.conversation_id,
                    DBMessage.role == 'user',
                    DBMessage.created_at < message.created_at
                )
                .order_by(desc(DBMessage.created_at))
                .limit(1)
            )
            previous_message = prev_result.scalar_one_or_none()

            if previous_message:
                content_parts.append(f"**Query:** {previous_message.content}\n")

        content_parts.append(f"**Response:**\n{message.content}")

        # Generate title if not provided
        if not title:
            # Use first line or truncated content
            first_line = message.content.split('\n')[0][:100]
            title = f"Chat Response: {first_line}"

        # Create knowledge item
        item_data = KnowledgeItemCreate(
            folder_id=folder_id,
            title=title,
            content='\n\n'.join(content_parts),
            content_type=ContentType.TEXT,
            source_url=None,
            metadata={
                "source": "chat_response",
                "conversation_id": str(message.conversation_id),
                "message_id": str(message_id),
                "conversation_title": conversation.title if conversation else None,
                "saved_at": datetime.now(timezone.utc).isoformat()
            }
        )

        knowledge_item = await content_service.create_knowledge_item(
            db=db,
            user_id=user_id,
            item_data=item_data
        )

        # Queue for processing
        from app.services.processing_service import processing_service
        background_tasks.add_task(processing_service.process_knowledge_item, knowledge_item.id)

        return {
            "success": True,
            "knowledge_item_id": str(knowledge_item.id),
            "title": knowledge_item.title,
            "message": "Response added to knowledge base"
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save message: {str(e)}")


@router.delete("/jobs/{job_id}")
async def cancel_job(
    job_id: UUID,
    db: AsyncSession = Depends(get_db),
    auth_data: dict = Depends(validate_any_auth)
):
    """Cancel a processing job (if still queued/processing)."""
    user_id = UUID(auth_data["user_id"])

    job = await db.get(ProcessingJob, job_id)

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if job.user_id != user_id:
        raise HTTPException(status_code=403, detail="Access denied")

    if job.status in ["completed", "failed", "cancelled"]:
        raise HTTPException(status_code=400, detail=f"Cannot cancel job with status: {job.status}")

    job.status = "cancelled"
    job.completed_at = datetime.now(timezone.utc)
    await db.commit()

    return {"message": "Job cancelled successfully"}