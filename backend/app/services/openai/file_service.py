"""
OpenAI File Service.

This module provides methods for managing files in OpenAI, including:
- Uploading files
- Listing files
- Retrieving file metadata
- Deleting files
- Retrieving file content
"""
from typing import Optional, Dict, Any, BinaryIO
from openai.types import FileObject
from openai.pagination import AsyncPage
import io
import logging

from .base import OpenAIBaseService

logger = logging.getLogger(__name__)


class FileService(OpenAIBaseService):
    """Client for managing OpenAI Files.

    This service provides methods for uploading, listing, retrieving,
    and deleting files in OpenAI's storage.
    """

    async def create(
        self,
        file: BinaryIO,
        purpose: str,
        expires_after: Optional[Dict[str, Any]] = None
    ) -> FileObject:
        """Upload a file that can be used across various endpoints.

        Individual files can be up to 512 MB, and the size of all files
        uploaded by one organization can be up to 1 TB.

        Args:
            file: The File object (not file name) to be uploaded
                 (e.g., open("mydata.jsonl", "rb"))
            purpose: The intended purpose of the uploaded file. One of:
                - assistants: Used in the Assistants API
                - batch: Used in the Batch API
                - fine-tune: Used for fine-tuning
                - vision: Images used for vision fine-tuning
                - user_data: Flexible file type for any purpose
                - evals: Used for eval data sets
            expires_after: The expiration policy for a file
                (default: batch files expire after 30 days)

        Returns:
            The uploaded File object

        Raises:
            OpenAIError: If upload fails
        """
        self.validate_configuration()

        kwargs = {
            'file': file,
            'purpose': purpose
        }
        if expires_after is not None:
            kwargs['expires_after'] = expires_after

        try:
            uploaded_file = await self.client.files.create(**kwargs)
            logger.info(
                f"Successfully uploaded file {uploaded_file.id} "
                f"with purpose '{purpose}'"
            )
            return uploaded_file
        except Exception as e:
            logger.error(f"Failed to upload file: {e}")
            raise

    async def upload_text_file(
        self,
        content: str,
        filename: str,
        purpose: str = "user_data",
        expires_after: Optional[Dict[str, Any]] = None
    ) -> FileObject:
        """Upload text content as a file to OpenAI.

        Convenience method for uploading text content without creating
        a temporary file.

        Args:
            content: The text content to upload
            filename: The name for the file
            purpose: The intended purpose (default: "user_data")
            expires_after: The expiration policy for the file

        Returns:
            The uploaded File object

        Raises:
            OpenAIError: If upload fails
        """
        # Create a file-like object from the text content
        text_bytes = content.encode('utf-8')
        file_obj = io.BytesIO(text_bytes)
        file_obj.name = filename

        return await self.create(
            file=file_obj,
            purpose=purpose,
            expires_after=expires_after
        )

    async def list(
        self,
        purpose: Optional[str] = None,
        limit: int = 10000,
        order: str = "desc",
        after: Optional[str] = None
    ) -> AsyncPage[FileObject]:
        """List files.

        Args:
            purpose: Only return files with the given purpose
            limit: Number of objects to return (1-10000, default 10000)
            order: Sort order by created_at timestamp
                  ('asc' or 'desc', default 'desc')
            after: Cursor for pagination (object ID to start after)

        Returns:
            A list of File objects

        Raises:
            OpenAIError: If listing fails
        """
        self.validate_configuration()

        kwargs = {'limit': limit, 'order': order}
        if purpose is not None:
            kwargs['purpose'] = purpose
        if after is not None:
            kwargs['after'] = after

        try:
            files = await self.client.files.list(**kwargs)
            logger.info(f"Retrieved {len(files.data)} files")
            return files
        except Exception as e:
            logger.error(f"Failed to list files: {e}")
            raise

    async def retrieve(self, file_id: str) -> FileObject:
        """Retrieve information about a specific file.

        Args:
            file_id: The ID of the file to retrieve

        Returns:
            The File object matching the specified ID

        Raises:
            OpenAIError: If file not found or retrieval fails
        """
        self.validate_configuration()

        try:
            file = await self.client.files.retrieve(file_id)
            logger.info(f"Retrieved file {file_id}: {file.filename}")
            return file
        except Exception as e:
            logger.error(f"Failed to retrieve file {file_id}: {e}")
            raise

    async def delete(self, file_id: str) -> Dict[str, Any]:
        """Delete a file and remove it from all vector stores.

        Args:
            file_id: The ID of the file to delete

        Returns:
            Deletion status

        Raises:
            OpenAIError: If deletion fails
        """
        self.validate_configuration()

        try:
            deleted_file = await self.client.files.delete(file_id)
            logger.info(f"Successfully deleted file {file_id}")
            return deleted_file
        except Exception as e:
            logger.error(f"Failed to delete file {file_id}: {e}")
            raise

    async def retrieve_content(self, file_id: str) -> bytes:
        """Retrieve the contents of the specified file.

        Args:
            file_id: The ID of the file to retrieve content from

        Returns:
            The file content as bytes

        Raises:
            OpenAIError: If content retrieval fails
        """
        self.validate_configuration()

        try:
            content = await self.client.files.content(file_id)
            logger.info(f"Retrieved content for file {file_id}")
            return content.read()
        except Exception as e:
            logger.error(f"Failed to retrieve content for file {file_id}: {e}")
            raise
