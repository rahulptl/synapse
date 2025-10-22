"""
WebSocket chat endpoint with streaming support.
"""
import json
import logging
from typing import Optional
from uuid import UUID
from datetime import datetime, timezone
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.services.chat_service import chat_service
from app.models.schemas import ChatRequest

router = APIRouter()
logger = logging.getLogger(__name__)


async def decode_token(token: str) -> dict:
    """
    Decode JWT token for WebSocket authentication.

    This follows the same logic as validate_any_auth but for WebSocket use.
    Supports both Cloud SQL auth and Supabase JWT.
    """
    try:
        from app.core.security import SecurityService
        from app.config import settings
        from jose import jwt, JWTError
        from sqlalchemy import select
        from app.models.database import Profile
        from app.core.database import AsyncSessionLocal

        # First, try Cloud SQL authentication (our primary auth system)
        # Cloud SQL uses Profile model, not a separate User model
        try:
            # Decode the token without verification first to check issuer
            unverified = jwt.get_unverified_claims(token)

            # Cloud SQL tokens have a specific format with user_id in sub
            if settings.SECRET_KEY:
                try:
                    payload = jwt.decode(
                        token,
                        settings.SECRET_KEY,
                        algorithms=["HS256"]
                    )

                    user_id = payload.get("sub")
                    if not user_id:
                        raise ValueError("No user_id in token")

                    # Verify user exists in Profile table (Cloud SQL auth)
                    async with AsyncSessionLocal() as session:
                        # Profile uses user_id field, not id
                        user_stmt = select(Profile).where(Profile.user_id == user_id)
                        user_result = await session.execute(user_stmt)
                        user_obj = user_result.scalar_one_or_none()

                        if user_obj:
                            logger.info(f"Cloud SQL auth successful for user {user_id}")
                            return {
                                "user_id": str(user_id),
                                "user": {
                                    "id": str(user_id),
                                    "email": user_obj.email,
                                    "full_name": user_obj.full_name
                                },
                                "valid": True,
                                "auth_method": "cloud_sql"
                            }
                except JWTError as e:
                    logger.debug(f"Not a Cloud SQL token: {e}")
        except Exception as e:
            logger.debug(f"Cloud SQL auth attempt failed: {e}")

        # Fall back to Supabase JWT authentication
        if settings.SUPABASE_JWT_SECRET:
            try:
                # Decode and validate the JWT token
                payload = jwt.decode(
                    token,
                    settings.SUPABASE_JWT_SECRET,
                    algorithms=["HS256"],
                    audience="authenticated"
                )

                # Extract user information
                user_id = payload.get("sub")
                email = payload.get("email")

                if not user_id:
                    raise HTTPException(
                        status_code=401,
                        detail="Invalid token: missing user ID"
                    )

                # Check if user exists in our database
                async with AsyncSessionLocal() as session:
                    user_stmt = select(Profile).where(Profile.user_id == user_id)
                    user_result = await session.execute(user_stmt)
                    user_obj = user_result.scalars().first()

                    # If user doesn't exist, create a profile
                    if not user_obj:
                        user_obj = Profile(
                            user_id=user_id,
                            email=email,
                            full_name=payload.get("user_metadata", {}).get("full_name", ""),
                            created_at=datetime.now(timezone.utc).replace(tzinfo=None),
                            updated_at=datetime.now(timezone.utc).replace(tzinfo=None)
                        )
                        session.add(user_obj)
                        await session.commit()
                        await session.refresh(user_obj)

                logger.info(f"Supabase auth successful for user {user_id}")
                return {
                    "user_id": user_id,
                    "user": {
                        "id": user_id,
                        "email": email,
                        "full_name": user_obj.full_name if user_obj else ""
                    },
                    "valid": True,
                    "auth_method": "supabase_jwt"
                }
            except JWTError as e:
                logger.debug(f"Not a Supabase token: {e}")

        # For development, allow testing without proper JWT secret
        if settings.ENVIRONMENT == "development":
            logger.warning("Using development mode authentication - NOT FOR PRODUCTION")
            dev_user_id = "00000000-0000-0000-0000-000000000001"
            return {
                "user_id": dev_user_id,
                "user": {
                    "id": dev_user_id,
                    "email": "dev@example.com",
                    "full_name": "Development User"
                },
                "valid": True,
                "auth_method": "development_mode"
            }

        raise HTTPException(status_code=401, detail="Invalid authentication token")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Token decode error: {e}", exc_info=True)
        raise HTTPException(status_code=401, detail="Invalid token")


@router.websocket("/ws")
async def websocket_chat_endpoint(
    websocket: WebSocket,
    db: AsyncSession = Depends(get_db)
):
    """
    WebSocket endpoint for real-time chat with streaming.

    Protocol:
    1. Client connects
    2. Client sends authentication message: {"type": "auth", "token": "Bearer ..."}
    3. Server validates and responds: {"type": "auth_success"} or {"type": "auth_error", "message": "..."}
    4. Client sends chat messages: {"type": "chat", "message": "...", "conversation_id": "...", ...}
    5. Server streams responses as events
    """
    await websocket.accept()
    user_id: Optional[UUID] = None

    try:
        # Wait for authentication message
        auth_message = await websocket.receive_json()

        if auth_message.get("type") != "auth":
            await websocket.send_json({
                "type": "error",
                "message": "First message must be authentication"
            })
            await websocket.close()
            return

        # Validate token
        token = auth_message.get("token", "").replace("Bearer ", "")
        if not token:
            await websocket.send_json({
                "type": "auth_error",
                "message": "No token provided"
            })
            await websocket.close()
            return

        # Validate the token using existing auth
        try:
            payload = await decode_token(token)
            user_id = UUID(payload.get("user_id"))

            await websocket.send_json({
                "type": "auth_success",
                "user_id": str(user_id)
            })
        except Exception as e:
            await websocket.send_json({
                "type": "auth_error",
                "message": str(e)
            })
            await websocket.close()
            return

        # Main message loop
        while True:
            try:
                message_data = await websocket.receive_json()

                if message_data.get("type") == "ping":
                    await websocket.send_json({"type": "pong"})
                    continue

                if message_data.get("type") != "chat":
                    await websocket.send_json({
                        "type": "error",
                        "message": f"Unknown message type: {message_data.get('type')}"
                    })
                    continue

                # Process chat message with streaming
                chat_request = ChatRequest(
                    message=message_data.get("message"),
                    conversation_id=UUID(message_data["conversation_id"]) if message_data.get("conversation_id") else None,
                    user_id=user_id,
                    context_items=message_data.get("context_items", [])
                )

                # Stream the response
                async for event in chat_service.chat_stream(
                    db=db,
                    user_id=user_id,
                    chat_request=chat_request
                ):
                    await websocket.send_json(event)

            except WebSocketDisconnect:
                logger.info(f"WebSocket disconnected for user {user_id}")
                break
            except Exception as e:
                logger.error(f"Error processing message: {e}", exc_info=True)
                await websocket.send_json({
                    "type": "error",
                    "message": str(e)
                })

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected during auth")
    except Exception as e:
        logger.error(f"WebSocket error: {e}", exc_info=True)
        try:
            await websocket.send_json({
                "type": "error",
                "message": "Internal server error"
            })
        except:
            pass
    finally:
        try:
            await websocket.close()
        except:
            pass