"""
RAG chat endpoints.
"""
from typing import Optional, List
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import validate_dual_auth
from app.services.chat_service import chat_service
from app.models.schemas import (
    ChatRequest, ChatResponse, Conversation, ConversationCreate,
    Message, MessageCreate
)

router = APIRouter()


@router.post("/", response_model=ChatResponse)
async def chat(
    chat_request: ChatRequest,
    db: AsyncSession = Depends(get_db),
    auth_data: dict = Depends(validate_dual_auth)
):
    """
    Process RAG chat with context retrieval.

    Equivalent to: rag-chat edge function
    """
    user_id = UUID(auth_data["user_id"])

    # Override user_id from auth if different in request
    if chat_request.user_id != user_id:
        chat_request.user_id = user_id

    try:
        response = await chat_service.chat(
            db=db,
            user_id=user_id,
            chat_request=chat_request
        )
        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail="Chat processing failed")


@router.get("/conversations", response_model=List[Conversation])
async def get_conversations(
    skip: int = 0,
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
    auth_data: dict = Depends(validate_dual_auth)
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
    auth_data: dict = Depends(validate_dual_auth)
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
    auth_data: dict = Depends(validate_dual_auth)
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
        return messages
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to fetch messages")


@router.delete("/conversations/{conversation_id}")
async def delete_conversation(
    conversation_id: UUID,
    db: AsyncSession = Depends(get_db),
    auth_data: dict = Depends(validate_dual_auth)
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