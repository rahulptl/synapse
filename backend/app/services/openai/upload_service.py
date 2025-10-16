"""
OpenAI Upload Service.

This module provides methods for managing large file uploads in parts.
Uploads allow you to upload large files in multiple parts (up to 8 GB total),
with each part being at most 64 MB.
"""
from typing import Optional, Dict, Any, List, BinaryIO
from openai.types import FileObject
import logging

from .base import OpenAIBaseService

logger = logging.getLogger(__name__)


class UploadService(OpenAIBaseService):
    """Client for managing large file uploads in parts.

    This service provides methods for:
    - Creating uploads (for files up to 8 GB)
    - Adding parts to uploads
    - Completing uploads
    - Canceling uploads

    Parts can be uploaded in parallel for better performance.
    Each part can be at most 64 MB.
    """

    async def create(
        self,
        filename: str,
        purpose: str,
        bytes: int,
        mime_type: str,
        expires_after: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Create an intermediate Upload object that you can add Parts to.

        Currently, an Upload can accept at most 8 GB in total and expires
        after an hour.

        Args:
            filename: The name of the file to upload
            purpose: The intended purpose of the uploaded file
                    (e.g., 'fine-tune', 'assistants', 'user_data')
            bytes: The number of bytes in the file you are uploading
            mime_type: The MIME type of the file
                      (must match supported types for your purpose)
            expires_after: The expiration policy for the upload

        Returns:
            The Upload object with status pending

        Raises:
            OpenAIError: If upload creation fails
        """
        self.validate_configuration()

        kwargs = {
            'filename': filename,
            'purpose': purpose,
            'bytes': bytes,
            'mime_type': mime_type
        }
        if expires_after is not None:
            kwargs['expires_after'] = expires_after

        try:
            upload = await self.client.uploads.create(**kwargs)
            logger.info(
                f"Successfully created upload {upload.id} for file '{filename}' "
                f"({bytes} bytes)"
            )
            return upload
        except Exception as e:
            logger.error(f"Failed to create upload for file '{filename}': {e}")
            raise

    async def add_part(
        self,
        upload_id: str,
        data: BinaryIO
    ) -> Dict[str, Any]:
        """Add a Part to an Upload object.

        Each Part can be at most 64 MB, and you can add Parts until you hit
        the Upload maximum of 8 GB. Multiple Parts can be added in parallel.

        Args:
            upload_id: The ID of the Upload
            data: The chunk of bytes for this Part
                 (file-like object opened in binary mode)

        Returns:
            The upload Part object

        Raises:
            OpenAIError: If part addition fails
        """
        self.validate_configuration()

        try:
            part = await self.client.uploads.parts.create(
                upload_id=upload_id,
                data=data
            )
            logger.info(
                f"Successfully added part {part.id} to upload {upload_id}"
            )
            return part
        except Exception as e:
            logger.error(f"Failed to add part to upload {upload_id}: {e}")
            raise

    async def complete(
        self,
        upload_id: str,
        part_ids: List[str],
        md5: Optional[str] = None
    ) -> FileObject:
        """Complete the Upload.

        The returned Upload object contains a nested File object that is
        ready to use. The number of bytes uploaded must match the number
        initially specified.

        Args:
            upload_id: The ID of the Upload
            part_ids: The ordered list of Part IDs
            md5: Optional md5 checksum for the file contents to verify
                upload integrity

        Returns:
            The Upload object with status completed and a file property
            containing the created File

        Raises:
            OpenAIError: If upload completion fails
        """
        self.validate_configuration()

        kwargs = {
            'upload_id': upload_id,
            'part_ids': part_ids
        }
        if md5 is not None:
            kwargs['md5'] = md5

        try:
            completed_upload = await self.client.uploads.complete(**kwargs)
            logger.info(
                f"Successfully completed upload {upload_id} "
                f"with {len(part_ids)} parts"
            )
            return completed_upload
        except Exception as e:
            logger.error(f"Failed to complete upload {upload_id}: {e}")
            raise

    async def cancel(self, upload_id: str) -> Dict[str, Any]:
        """Cancel the Upload.

        No Parts may be added after an Upload is cancelled.

        Args:
            upload_id: The ID of the Upload

        Returns:
            The Upload object with status cancelled

        Raises:
            OpenAIError: If cancellation fails
        """
        self.validate_configuration()

        try:
            cancelled_upload = await self.client.uploads.cancel(upload_id=upload_id)
            logger.info(f"Successfully cancelled upload {upload_id}")
            return cancelled_upload
        except Exception as e:
            logger.error(f"Failed to cancel upload {upload_id}: {e}")
            raise

    async def upload_large_file(
        self,
        file_path: str,
        purpose: str,
        chunk_size: int = 64 * 1024 * 1024,  # 64 MB
        mime_type: str = "application/octet-stream",
        expires_after: Optional[Dict[str, Any]] = None
    ) -> FileObject:
        """Upload a large file using multipart upload.

        This is a convenience method that handles the entire multipart
        upload process: creating the upload, splitting the file into parts,
        uploading each part, and completing the upload.

        Args:
            file_path: Path to the file to upload
            purpose: The intended purpose of the uploaded file
            chunk_size: Size of each part in bytes (default 64 MB, max 64 MB)
            mime_type: The MIME type of the file
            expires_after: The expiration policy for the upload

        Returns:
            The completed File object

        Raises:
            OpenAIError: If upload fails
            FileNotFoundError: If file doesn't exist
        """
        import os

        if not os.path.exists(file_path):
            raise FileNotFoundError(f"File not found: {file_path}")

        file_size = os.path.getsize(file_path)
        filename = os.path.basename(file_path)

        # Create upload
        upload = await self.create(
            filename=filename,
            purpose=purpose,
            bytes=file_size,
            mime_type=mime_type,
            expires_after=expires_after
        )

        part_ids = []

        try:
            # Upload file in parts
            with open(file_path, 'rb') as f:
                while True:
                    chunk = f.read(chunk_size)
                    if not chunk:
                        break

                    # Upload this part
                    part = await self.add_part(upload.id, chunk)
                    part_ids.append(part.id)

            # Complete the upload
            completed = await self.complete(upload.id, part_ids)
            logger.info(
                f"Successfully uploaded large file '{filename}' "
                f"({file_size} bytes) in {len(part_ids)} parts"
            )
            return completed.file

        except Exception as e:
            # Try to cancel the upload on error
            logger.error(f"Error during multipart upload, attempting to cancel: {e}")
            try:
                await self.cancel(upload.id)
            except:
                pass  # Ignore cancellation errors
            raise
