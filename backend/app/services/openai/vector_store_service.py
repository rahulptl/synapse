"""
OpenAI Vector Store Service.

This module provides methods for managing vector stores and their associated files:
- Creating and managing vector stores
- Adding files to vector stores with attributes
- Searching within vector stores
- Managing vector store file lifecycle
"""
from typing import Optional, Dict, Any, List, Union
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import logging

from .base import OpenAIBaseService
from app.models.database import Profile
from openai.types.vector_store import VectorStore
from openai.types.vector_stores.vector_store_file import VectorStoreFile
from openai.pagination import AsyncPage

logger = logging.getLogger(__name__)


class VectorStoreService(OpenAIBaseService):
    """Client for managing OpenAI Vector Stores and their files.

    This service combines vector store management and vector store file
    management into a single cohesive interface.
    """

    # ========================================================================
    # Vector Store Operations
    # ========================================================================

    async def create(
        self,
        name: Optional[str] = None,
        file_ids: Optional[List[str]] = None,
        chunking_strategy: Optional[Dict[str, Any]] = None,
        expires_after: Optional[Dict[str, Any]] = None,
        metadata: Optional[Dict[str, str]] = None
    ) -> VectorStore:
        """Create a new vector store.

        Args:
            name: The name of the vector store
            file_ids: List of File IDs that the vector store should use
            chunking_strategy: The chunking strategy used to chunk the file(s)
            expires_after: The expiration policy for the vector store
            metadata: Set of up to 16 key-value pairs
                     (max 64 chars for keys, 512 for values)

        Returns:
            The created vector store object

        Raises:
            OpenAIError: If creation fails
        """
        self.validate_configuration()

        kwargs = {}
        if name is not None:
            kwargs['name'] = name
        if file_ids is not None:
            kwargs['file_ids'] = file_ids
        if chunking_strategy is not None:
            kwargs['chunking_strategy'] = chunking_strategy
        if expires_after is not None:
            kwargs['expires_after'] = expires_after
        if metadata is not None:
            kwargs['metadata'] = metadata

        try:
            vector_store = await self.client.vector_stores.create(**kwargs)
            logger.info(
                f"Successfully created vector store {vector_store.id} "
                f"with name '{name}'"
            )
            return vector_store
        except Exception as e:
            logger.error(f"Failed to create vector store: {e}")
            raise

    async def list(
        self,
        limit: int = 20,
        order: str = "desc",
        after: Optional[str] = None,
        before: Optional[str] = None
    ) -> AsyncPage[VectorStore]:
        """List vector stores.

        Args:
            limit: Number of objects to return (1-100, default 20)
            order: Sort order by created_at timestamp
                  ('asc' or 'desc', default 'desc')
            after: Cursor for pagination (object ID to start after)
            before: Cursor for pagination (object ID to start before)

        Returns:
            A list of vector store objects

        Raises:
            OpenAIError: If listing fails
        """
        self.validate_configuration()

        kwargs = {'limit': limit, 'order': order}
        if after is not None:
            kwargs['after'] = after
        if before is not None:
            kwargs['before'] = before

        try:
            vector_stores = await self.client.vector_stores.list(**kwargs)
            logger.info(f"Retrieved {len(vector_stores.data)} vector stores")
            return vector_stores
        except Exception as e:
            logger.error(f"Failed to list vector stores: {e}")
            raise

    async def retrieve(self, vector_store_id: str) -> VectorStore:
        """Retrieve a specific vector store by ID.

        Args:
            vector_store_id: The ID of the vector store to retrieve

        Returns:
            The vector store object

        Raises:
            OpenAIError: If vector store not found or retrieval fails
        """
        self.validate_configuration()

        try:
            vector_store = await self.client.vector_stores.retrieve(
                vector_store_id=vector_store_id
            )
            logger.info(f"Retrieved vector store {vector_store_id}")
            return vector_store
        except Exception as e:
            logger.error(f"Failed to retrieve vector store {vector_store_id}: {e}")
            raise

    async def update(
        self,
        vector_store_id: str,
        name: Optional[str] = None,
        expires_after: Optional[Dict[str, Any]] = None,
        metadata: Optional[Dict[str, str]] = None
    ) -> VectorStore:
        """Update/modify a vector store.

        Args:
            vector_store_id: The ID of the vector store to modify
            name: The new name for the vector store
            expires_after: The expiration policy for the vector store
            metadata: Set of up to 16 key-value pairs

        Returns:
            The modified vector store object

        Raises:
            OpenAIError: If update fails
        """
        self.validate_configuration()

        kwargs = {'vector_store_id': vector_store_id}
        if name is not None:
            kwargs['name'] = name
        if expires_after is not None:
            kwargs['expires_after'] = expires_after
        if metadata is not None:
            kwargs['metadata'] = metadata

        try:
            vector_store = await self.client.vector_stores.update(**kwargs)
            logger.info(f"Successfully updated vector store {vector_store_id}")
            return vector_store
        except Exception as e:
            logger.error(f"Failed to update vector store {vector_store_id}: {e}")
            raise

    async def delete(self, vector_store_id: str) -> Dict[str, Any]:
        """Delete a vector store.

        Args:
            vector_store_id: The ID of the vector store to delete

        Returns:
            Deletion status object

        Raises:
            OpenAIError: If deletion fails
        """
        self.validate_configuration()

        try:
            deleted_vector_store = await self.client.vector_stores.delete(
                vector_store_id=vector_store_id
            )
            logger.info(f"Successfully deleted vector store {vector_store_id}")
            return deleted_vector_store
        except Exception as e:
            logger.error(f"Failed to delete vector store {vector_store_id}: {e}")
            raise

    # ========================================================================
    # Vector Store File Operations
    # ========================================================================

    async def upload_file_and_poll(
        self,
        vector_store_id: str,
        content: Union[bytes, str],
        filename: str,
        attributes: Optional[Dict[str, Any]] = None,
        chunking_strategy: Optional[Dict[str, Any]] = None
    ) -> VectorStoreFile:
        """Upload a file directly to a vector store and poll until processing completes.

        This is a more efficient method that combines file upload and vector store
        file creation in one operation, with automatic polling until the file is
        ready for use.

        Args:
            vector_store_id: The ID of the vector store
            content: The file content as bytes or string
            filename: The name for the file (e.g., "document.txt")
            attributes: Set of up to 16 key-value pairs for filtering
                       (max 64 chars for keys, 512 for values/booleans/numbers)
            chunking_strategy: The chunking strategy used to chunk the file

        Returns:
            The created vector store file object (in 'completed' status)

        Raises:
            OpenAIError: If upload or processing fails
        """
        self.validate_configuration()

        # Convert string content to bytes if needed
        if isinstance(content, str):
            content_bytes = content.encode('utf-8')
        else:
            content_bytes = content

        # Create a file-like object from bytes
        from io import BytesIO
        file_obj = BytesIO(content_bytes)
        file_obj.name = filename

        kwargs = {
            'vector_store_id': vector_store_id,
            'file': file_obj
        }
        if attributes is not None:
            kwargs['attributes'] = attributes
        if chunking_strategy is not None:
            kwargs['chunking_strategy'] = chunking_strategy

        try:
            # Upload and poll until processing completes
            vector_store_file = await self.client.vector_stores.files.upload_and_poll(**kwargs)
            logger.info(
                f"Successfully uploaded and processed file '{filename}' "
                f"in vector store {vector_store_id} with attributes {attributes}"
            )
            return vector_store_file
        except Exception as e:
            logger.error(
                f"Failed to upload file '{filename}' to vector store {vector_store_id}: {e}"
            )
            raise

    async def add_file_to_vector_store(
        self,
        vector_store_id: str,
        file_id: str,
        attributes: Optional[Dict[str, Any]] = None,
        chunking_strategy: Optional[Dict[str, Any]] = None
    ) -> VectorStoreFile:
        """Create a vector store file by attaching a File to a vector store.

        Args:
            vector_store_id: The ID of the vector store
            file_id: A File ID that the vector store should use
            attributes: Set of up to 16 key-value pairs for filtering
                       (max 64 chars for keys, 512 for values/booleans/numbers)
            chunking_strategy: The chunking strategy used to chunk the file(s)

        Returns:
            The created vector store file object

        Raises:
            OpenAIError: If file attachment fails
        """
        self.validate_configuration()

        kwargs = {
            'vector_store_id': vector_store_id,
            'file_id': file_id
        }
        if attributes is not None:
            kwargs['attributes'] = attributes
        if chunking_strategy is not None:
            kwargs['chunking_strategy'] = chunking_strategy

        try:
            vector_store_file = await self.client.vector_stores.files.create(**kwargs)
            logger.info(
                f"Successfully added file {file_id} to vector store {vector_store_id} "
                f"with attributes {attributes}"
            )
            return vector_store_file
        except Exception as e:
            logger.error(
                f"Failed to add file {file_id} to vector store {vector_store_id}: {e}"
            )
            raise

    async def list_files(
        self,
        vector_store_id: str,
        limit: int = 20,
        order: str = "desc",
        after: Optional[str] = None,
        before: Optional[str] = None,
        filter: Optional[str] = None
    ) -> AsyncPage[VectorStoreFile]:
        """List vector store files.

        Args:
            vector_store_id: The ID of the vector store that the files belong to
            limit: Number of objects to return (1-100, default 20)
            order: Sort order by created_at timestamp
                  ('asc' or 'desc', default 'desc')
            after: Cursor for pagination (object ID to start after)
            before: Cursor for pagination (object ID to start before)
            filter: Filter by file status
                   (in_progress, completed, failed, cancelled)

        Returns:
            A list of vector store file objects

        Raises:
            OpenAIError: If listing fails
        """
        self.validate_configuration()

        kwargs = {
            'vector_store_id': vector_store_id,
            'limit': limit,
            'order': order
        }
        if after is not None:
            kwargs['after'] = after
        if before is not None:
            kwargs['before'] = before
        if filter is not None:
            kwargs['filter'] = filter

        try:
            vector_store_files = await self.client.vector_stores.files.list(**kwargs)
            logger.info(
                f"Retrieved {len(vector_store_files.data)} files from "
                f"vector store {vector_store_id}"
            )
            return vector_store_files
        except Exception as e:
            logger.error(
                f"Failed to list files for vector store {vector_store_id}: {e}"
            )
            raise

    async def retrieve_file(
        self,
        vector_store_id: str,
        file_id: str
    ) -> VectorStoreFile:
        """Retrieve a vector store file.

        Args:
            vector_store_id: The ID of the vector store that the file belongs to
            file_id: The ID of the file being retrieved

        Returns:
            The vector store file object

        Raises:
            OpenAIError: If file not found or retrieval fails
        """
        self.validate_configuration()

        try:
            vector_store_file = await self.client.vector_stores.files.retrieve(
                vector_store_id=vector_store_id,
                file_id=file_id
            )
            logger.info(
                f"Retrieved file {file_id} from vector store {vector_store_id}"
            )
            return vector_store_file
        except Exception as e:
            logger.error(
                f"Failed to retrieve file {file_id} from vector store "
                f"{vector_store_id}: {e}"
            )
            raise

    async def delete_file(
        self,
        vector_store_id: str,
        file_id: str
    ) -> Dict[str, Any]:
        """Delete a vector store file.

        Note: This removes the file from the vector store but the file itself
        is not deleted. To delete the file, use the delete file endpoint.

        Args:
            vector_store_id: The ID of the vector store that the file belongs to
            file_id: The ID of the file to delete

        Returns:
            Deletion status object

        Raises:
            OpenAIError: If deletion fails
        """
        self.validate_configuration()

        try:
            deleted_file = await self.client.vector_stores.files.delete(
                vector_store_id=vector_store_id,
                file_id=file_id
            )
            logger.info(
                f"Successfully deleted file {file_id} from vector store "
                f"{vector_store_id}"
            )
            return deleted_file
        except Exception as e:
            logger.error(
                f"Failed to delete file {file_id} from vector store "
                f"{vector_store_id}: {e}"
            )
            raise

    # ========================================================================
    # High-Level Utility Methods
    # ========================================================================

    async def get_or_create_user_vector_store(
        self,
        user_id: UUID,
        user_name: str,
        db: AsyncSession
    ) -> VectorStore:
        """Get or create a vector store for a user.

        This is a convenience method that checks if a user already has a
        vector store, and creates one if they don't.

        Args:
            user_id: The user's ID
            user_name: The user's name (for vector store naming)
            db: Database session

        Returns:
            The user's vector store object

        Raises:
            OpenAIError: If vector store operations fail
        """
        # Get user profile
        stmt = select(Profile).where(Profile.user_id == user_id)
        result = await db.execute(stmt)
        profile = result.scalar_one_or_none()

        if not profile:
            raise ValueError(f"Profile not found for user {user_id}")

        # Check if user already has a vector store
        if profile.openai_vector_store_id:
            try:
                # Try to retrieve existing vector store
                vector_store = await self.retrieve(profile.openai_vector_store_id)
                logger.info(
                    f"Retrieved existing vector store {vector_store.id} "
                    f"for user {user_id}"
                )
                return vector_store
            except Exception as e:
                logger.warning(
                    f"Failed to retrieve vector store {profile.openai_vector_store_id} "
                    f"for user {user_id}: {e}. Creating new vector store."
                )

        # Create new vector store
        vector_store = await self.create(
            name=f"{user_name}_knowledge_base",
            metadata={"user_id": str(user_id)},
            expires_after={'anchor': 'last_active_at', 'days': 365}
        )

        # Update profile with new vector store ID
        profile.openai_vector_store_id = vector_store.id
        profile.openai_vector_store_status = "active"
        await db.commit()

        logger.info(
            f"Created new vector store {vector_store.id} for user {user_id}"
        )
        return vector_store
