"""
Folder management service.
"""
from typing import List, Optional, Dict, Any
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, and_
from sqlalchemy.orm import selectinload
import logging

from app.models.database import Folder, KnowledgeItem
from app.models.schemas import FolderCreate, FolderUpdate

logger = logging.getLogger(__name__)


class FolderService:
    """Service for managing folders."""

    async def create_folder(
        self,
        db: AsyncSession,
        user_id: UUID,
        folder_data: FolderCreate
    ) -> Folder:
        """
        Create a new folder.

        Args:
            db: Database session
            user_id: User ID
            folder_data: Folder creation data

        Returns:
            Folder: Created folder

        Raises:
            ValueError: If parent folder doesn't exist or belong to user
        """
        # Validate parent folder if specified
        parent_folder = None
        if folder_data.parent_id:
            parent_stmt = select(Folder).where(
                Folder.id == folder_data.parent_id,
                Folder.user_id == user_id
            )
            parent_result = await db.execute(parent_stmt)
            parent_folder = parent_result.scalar_one_or_none()

            if not parent_folder:
                raise ValueError("Parent folder not found or insufficient permissions")

        # Calculate path and depth - match edge function format
        name_slug = folder_data.name.lower().replace(' ', '-')
        if parent_folder:
            path = f"{parent_folder.path}/{name_slug}"
            depth = parent_folder.depth + 1
        else:
            path = f"/{name_slug}"
            depth = 0

        # Create folder
        folder = Folder(
            user_id=user_id,
            name=folder_data.name,
            description=folder_data.description,
            parent_id=folder_data.parent_id,
            path=path,
            depth=depth
        )

        db.add(folder)
        await db.commit()
        await db.refresh(folder)

        return folder

    async def get_folder(
        self,
        db: AsyncSession,
        user_id: UUID,
        folder_id: UUID
    ) -> Optional[Folder]:
        """
        Get a folder by ID.

        Args:
            db: Database session
            user_id: User ID
            folder_id: Folder ID

        Returns:
            Folder: Folder if found
        """
        stmt = select(Folder).where(
            Folder.id == folder_id,
            Folder.user_id == user_id
        )

        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    async def update_folder(
        self,
        db: AsyncSession,
        user_id: UUID,
        folder_id: UUID,
        update_data: FolderUpdate
    ) -> Optional[Folder]:
        """
        Update a folder.

        Args:
            db: Database session
            user_id: User ID
            folder_id: Folder ID
            update_data: Update data

        Returns:
            Folder: Updated folder
        """
        folder = await self.get_folder(db, user_id, folder_id)
        if not folder:
            return None

        # Update fields
        update_dict = update_data.dict(exclude_unset=True)

        # Handle name change which affects path
        if "name" in update_dict:
            old_path = folder.path

            # Calculate new path - match edge function format
            name_slug = update_dict['name'].lower().replace(' ', '-')
            if folder.parent_id:
                parent_stmt = select(Folder).where(Folder.id == folder.parent_id)
                parent_result = await db.execute(parent_stmt)
                parent_folder = parent_result.scalar_one()
                new_path = f"{parent_folder.path}/{name_slug}"
            else:
                new_path = f"/{name_slug}"

            folder.name = update_dict["name"]
            folder.path = new_path

            # Update paths of all descendant folders
            await self._update_descendant_paths(db, folder.id, old_path, new_path)

        # Update other fields
        for field, value in update_dict.items():
            if field != "name":  # Already handled above
                setattr(folder, field, value)

        await db.commit()
        await db.refresh(folder)
        return folder

    async def delete_folder(
        self,
        db: AsyncSession,
        user_id: UUID,
        folder_id: UUID,
        force: bool = False
    ) -> bool:
        """
        Delete a folder.

        Args:
            db: Database session
            user_id: User ID
            folder_id: Folder ID
            force: Force delete even if folder has content

        Returns:
            bool: True if deleted successfully

        Raises:
            ValueError: If folder has content and force is False
        """
        folder = await self.get_folder(db, user_id, folder_id)
        if not folder:
            return False

        # Check for content if not forcing
        if not force:
            # Check for child folders
            child_stmt = select(Folder).where(Folder.parent_id == folder_id)
            child_result = await db.execute(child_stmt)
            if child_result.first():
                raise ValueError("Folder contains subfolders. Use force=True to delete.")

            # Check for knowledge items
            content_stmt = select(KnowledgeItem).where(KnowledgeItem.folder_id == folder_id)
            content_result = await db.execute(content_stmt)
            if content_result.first():
                raise ValueError("Folder contains content. Use force=True to delete.")

        # Delete folder (cascading will handle children and content)
        await db.execute(
            delete(Folder).where(
                Folder.id == folder_id,
                Folder.user_id == user_id
            )
        )

        await db.commit()
        return True

    async def list_folders(
        self,
        db: AsyncSession,
        user_id: UUID,
        parent_id: Optional[UUID] = None
    ) -> List[Folder]:
        """
        List folders for a user.

        Args:
            db: Database session
            user_id: User ID
            parent_id: Optional parent folder filter

        Returns:
            List[Folder]: List of folders
        """
        stmt = select(Folder).where(Folder.user_id == user_id)

        if parent_id is not None:
            stmt = stmt.where(Folder.parent_id == parent_id)

        stmt = stmt.order_by(Folder.name)

        result = await db.execute(stmt)
        return result.scalars().all()

    async def get_folder_hierarchy(
        self,
        db: AsyncSession,
        user_id: UUID
    ) -> List[Folder]:
        """
        Get complete folder hierarchy for a user.

        Args:
            db: Database session
            user_id: User ID

        Returns:
            List[Folder]: Root folders organized by hierarchy
        """
        # Get all folders for the user
        stmt = select(Folder).where(
            Folder.user_id == user_id
        ).order_by(Folder.path)

        result = await db.execute(stmt)
        all_folders = result.scalars().all()

        # Build hierarchy manually to match edge function format
        folder_map = {}
        root_folders = []

        # First pass: create all folder objects and map them
        for folder in all_folders:
            folder_dict = {
                "id": folder.id,
                "user_id": folder.user_id,
                "name": folder.name,
                "description": folder.description,
                "parent_id": folder.parent_id,
                "path": folder.path,
                "depth": folder.depth,
                "created_at": folder.created_at,
                "updated_at": folder.updated_at,
                "children": []
            }
            folder_map[folder.id] = folder_dict

        # Second pass: build hierarchy
        for folder in all_folders:
            folder_obj = folder_map[folder.id]
            if folder.parent_id and folder.parent_id in folder_map:
                parent = folder_map[folder.parent_id]
                parent["children"].append(folder_obj)
            else:
                root_folders.append(folder_obj)

        return root_folders

    async def move_folder(
        self,
        db: AsyncSession,
        user_id: UUID,
        folder_id: UUID,
        new_parent_id: Optional[UUID]
    ) -> Optional[Folder]:
        """
        Move a folder to a new parent.

        Args:
            db: Database session
            user_id: User ID
            folder_id: Folder ID to move
            new_parent_id: New parent folder ID (None for root)

        Returns:
            Folder: Updated folder

        Raises:
            ValueError: If operation would create a cycle
        """
        folder = await self.get_folder(db, user_id, folder_id)
        if not folder:
            return None

        # Validate new parent if specified
        new_parent = None
        if new_parent_id:
            new_parent = await self.get_folder(db, user_id, new_parent_id)
            if not new_parent:
                raise ValueError("New parent folder not found")

            # Check for cycles - new parent cannot be a descendant of current folder
            if await self._is_descendant(db, new_parent_id, folder_id):
                raise ValueError("Cannot move folder into its own descendant")

        old_path = folder.path

        # Calculate new path and depth - match edge function format
        name_slug = folder.name.lower().replace(' ', '-')
        if new_parent:
            new_path = f"{new_parent.path}/{name_slug}"
            new_depth = new_parent.depth + 1
        else:
            new_path = f"/{name_slug}"
            new_depth = 0

        # Update folder
        folder.parent_id = new_parent_id
        folder.path = new_path
        folder.depth = new_depth

        # Update paths of all descendant folders
        await self._update_descendant_paths(db, folder_id, old_path, new_path)

        await db.commit()
        await db.refresh(folder)
        return folder

    async def _update_descendant_paths(
        self,
        db: AsyncSession,
        folder_id: UUID,
        old_path: str,
        new_path: str
    ):
        """Update paths of all descendant folders."""
        # Get all descendant folders
        stmt = select(Folder).where(
            Folder.path.like(f"{old_path}/%")
        )
        result = await db.execute(stmt)
        descendants = result.scalars().all()

        # Update each descendant's path
        for descendant in descendants:
            descendant.path = descendant.path.replace(old_path, new_path, 1)
            # Recalculate depth
            descendant.depth = len(descendant.path.split("/")) - 1

    async def _is_descendant(
        self,
        db: AsyncSession,
        potential_descendant_id: UUID,
        ancestor_id: UUID
    ) -> bool:
        """Check if one folder is a descendant of another."""
        stmt = select(Folder).where(Folder.id == potential_descendant_id)
        result = await db.execute(stmt)
        folder = result.scalar_one_or_none()

        if not folder:
            return False

        # Check if ancestor path is a prefix of descendant path
        ancestor_stmt = select(Folder).where(Folder.id == ancestor_id)
        ancestor_result = await db.execute(ancestor_stmt)
        ancestor = ancestor_result.scalar_one_or_none()

        if not ancestor:
            return False

        return folder.path.startswith(f"{ancestor.path}/")


# Service instance
folder_service = FolderService()