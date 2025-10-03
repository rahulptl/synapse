"""
Storage service for handling file uploads and downloads.
"""
import logging
from typing import Optional
from abc import ABC, abstractmethod
import boto3
from supabase import create_client, Client
from google.cloud import storage
from google.oauth2 import service_account
import os
import tempfile

from app.config import settings

logger = logging.getLogger(__name__)


class StorageBackend(ABC):
    """Abstract base class for storage backends."""

    @abstractmethod
    async def upload_content(self, path: str, content: bytes, content_type: str) -> str:
        """Upload content to storage and return URL."""
        pass

    @abstractmethod
    async def download_content(self, path: str) -> bytes:
        """Download content from storage."""
        pass

    @abstractmethod
    async def delete_content(self, path: str) -> bool:
        """Delete content from storage."""
        pass


class LocalStorageBackend(StorageBackend):
    """Local file system storage backend."""

    def __init__(self, base_path: str = "/tmp/synapse-storage"):
        self.base_path = base_path
        os.makedirs(base_path, exist_ok=True)

    async def upload_content(self, path: str, content: bytes, content_type: str) -> str:
        """Upload content to local storage."""
        file_path = os.path.join(self.base_path, path)
        os.makedirs(os.path.dirname(file_path), exist_ok=True)

        with open(file_path, 'wb') as f:
            f.write(content)

        return f"file://{file_path}"

    async def download_content(self, path: str) -> bytes:
        """Download content from local storage."""
        file_path = os.path.join(self.base_path, path)
        with open(file_path, 'rb') as f:
            return f.read()

    async def delete_content(self, path: str) -> bool:
        """Delete content from local storage."""
        try:
            file_path = os.path.join(self.base_path, path)
            os.remove(file_path)
            return True
        except FileNotFoundError:
            return False


class SupabaseStorageBackend(StorageBackend):
    """Supabase storage backend."""

    def __init__(self):
        if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY or \
           settings.SUPABASE_URL == "your-supabase-url" or \
           settings.SUPABASE_SERVICE_ROLE_KEY == "your-supabase-service-role-key":
            raise ValueError("Supabase configuration missing or using placeholder values")

        self.client: Client = create_client(
            settings.SUPABASE_URL,
            settings.SUPABASE_SERVICE_ROLE_KEY
        )
        self.bucket = settings.SUPABASE_STORAGE_BUCKET

    async def upload_content(self, path: str, content: bytes, content_type: str) -> str:
        """Upload content to Supabase storage."""
        try:
            result = self.client.storage.from_(self.bucket).upload(
                path,
                content,
                file_options={"content-type": content_type}
            )

            # Get public URL
            url_result = self.client.storage.from_(self.bucket).get_public_url(path)
            return url_result

        except Exception as e:
            logger.error(f"Supabase upload failed: {e}")
            raise

    async def download_content(self, path: str) -> bytes:
        """Download content from Supabase storage."""
        try:
            result = self.client.storage.from_(self.bucket).download(path)
            return result
        except Exception as e:
            logger.error(f"Supabase download failed: {e}")
            raise

    async def delete_content(self, path: str) -> bool:
        """Delete content from Supabase storage."""
        try:
            result = self.client.storage.from_(self.bucket).remove([path])
            return True
        except Exception as e:
            logger.error(f"Supabase delete failed: {e}")
            return False


class S3StorageBackend(StorageBackend):
    """AWS S3 storage backend."""

    def __init__(self):
        if not all([settings.AWS_ACCESS_KEY_ID, settings.AWS_SECRET_ACCESS_KEY, settings.AWS_S3_BUCKET]):
            raise ValueError("AWS S3 configuration missing")

        # Configure S3 client with optional endpoint URL for S3-compatible services
        client_config = {
            'aws_access_key_id': settings.AWS_ACCESS_KEY_ID,
            'aws_secret_access_key': settings.AWS_SECRET_ACCESS_KEY,
            'region_name': settings.AWS_S3_REGION or 'us-west-2'
        }

        # Add endpoint URL if specified (for S3-compatible services like Supabase)
        if settings.AWS_S3_ENDPOINT_URL:
            client_config['endpoint_url'] = settings.AWS_S3_ENDPOINT_URL

        self.s3_client = boto3.client('s3', **client_config)
        self.bucket = settings.AWS_S3_BUCKET

    async def upload_content(self, path: str, content: bytes, content_type: str) -> str:
        """Upload content to S3."""
        try:
            self.s3_client.put_object(
                Bucket=self.bucket,
                Key=path,
                Body=content,
                ContentType=content_type
            )

            # Generate URL based on endpoint
            if settings.AWS_S3_ENDPOINT_URL:
                # For S3-compatible services like Supabase
                base_url = settings.AWS_S3_ENDPOINT_URL.replace('/storage/v1/s3', '')
                url = f"{base_url}/storage/v1/object/public/{self.bucket}/{path}"
            else:
                # Standard AWS S3
                url = f"https://{self.bucket}.s3.amazonaws.com/{path}"
            return url

        except Exception as e:
            logger.error(f"S3 upload failed: {e}")
            raise

    async def download_content(self, path: str) -> bytes:
        """Download content from S3."""
        try:
            response = self.s3_client.get_object(Bucket=self.bucket, Key=path)
            return response['Body'].read()
        except Exception as e:
            logger.error(f"S3 download failed: {e}")
            raise

    async def delete_content(self, path: str) -> bool:
        """Delete content from S3."""
        try:
            self.s3_client.delete_object(Bucket=self.bucket, Key=path)
            return True
        except Exception as e:
            logger.error(f"S3 delete failed: {e}")
            return False


class GCSStorageBackend(StorageBackend):
    """Google Cloud Storage backend."""

    def __init__(self):
        if not settings.GCS_BUCKET_NAME:
            raise ValueError("GCS_BUCKET_NAME must be configured")

        # Initialize GCS client
        if settings.GOOGLE_APPLICATION_CREDENTIALS:
            # Local development with service account key file
            credentials = service_account.Credentials.from_service_account_file(
                settings.GOOGLE_APPLICATION_CREDENTIALS
            )
            self.client = storage.Client(
                credentials=credentials,
                project=settings.GCS_PROJECT_ID
            )
        else:
            # Cloud Run uses Application Default Credentials (no key file needed)
            self.client = storage.Client(project=settings.GCS_PROJECT_ID)

        # Extract bucket name and folder prefix if present
        # Format: "bucket_name/folder" or just "bucket_name"
        bucket_parts = settings.GCS_BUCKET_NAME.split('/', 1)
        bucket_name = bucket_parts[0]
        self.folder_prefix = bucket_parts[1] + '/' if len(bucket_parts) > 1 else ''

        # Get environment-based folder if no explicit folder in bucket name
        if not self.folder_prefix:
            env = settings.ENVIRONMENT.lower()
            if env in ['local', 'development', 'production']:
                env_folder = 'dev' if env == 'development' else env
                self.folder_prefix = f'{env_folder}/'

        self.bucket = self.client.bucket(bucket_name)

    def _get_full_path(self, path: str) -> str:
        """Get full path including folder prefix."""
        return f"{self.folder_prefix}{path}" if self.folder_prefix else path

    async def upload_content(self, path: str, content: bytes, content_type: str) -> str:
        """Upload content to GCS."""
        try:
            full_path = self._get_full_path(path)
            blob = self.bucket.blob(full_path)
            blob.upload_from_string(content, content_type=content_type)

            # Return public URL
            return blob.public_url
        except Exception as e:
            logger.error(f"GCS upload failed: {e}")
            raise

    async def download_content(self, path: str) -> bytes:
        """Download content from GCS."""
        try:
            full_path = self._get_full_path(path)
            blob = self.bucket.blob(full_path)
            return blob.download_as_bytes()
        except Exception as e:
            logger.error(f"GCS download failed: {e}")
            raise

    async def delete_content(self, path: str) -> bool:
        """Delete content from GCS."""
        try:
            full_path = self._get_full_path(path)
            blob = self.bucket.blob(full_path)
            blob.delete()
            return True
        except Exception as e:
            logger.error(f"GCS delete failed: {e}")
            return False


class StorageService:
    """Main storage service that delegates to the configured backend."""

    def __init__(self):
        self.backend = self._create_backend()

    def _create_backend(self) -> StorageBackend:
        """Create the appropriate storage backend based on configuration."""
        backend_type = settings.STORAGE_BACKEND.lower()

        if backend_type == "gcs":
            return GCSStorageBackend()
        elif backend_type == "supabase":
            return SupabaseStorageBackend()
        elif backend_type == "s3":
            return S3StorageBackend()
        elif backend_type == "local":
            return LocalStorageBackend()
        else:
            logger.warning(f"Unknown storage backend: {backend_type}, falling back to local")
            return LocalStorageBackend()

    async def upload_content(self, path: str, content: bytes, content_type: str) -> str:
        """Upload content to the configured storage backend."""
        return await self.backend.upload_content(path, content, content_type)

    async def download_content(self, path: str) -> bytes:
        """Download content from the configured storage backend."""
        return await self.backend.download_content(path)

    async def delete_content(self, path: str) -> bool:
        """Delete content from the configured storage backend."""
        return await self.backend.delete_content(path)


# Service instance
storage_service = StorageService()