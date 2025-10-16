#!/usr/bin/env python3
"""
Script to recreate database tables with simplified schema.
"""
import asyncio
import sys
import os

# Add the current directory to Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import text, create_engine
from sqlalchemy.orm import sessionmaker
from app.config import settings

async def recreate_database():
    """Drop and recreate all tables with simplified schema."""
    try:
        # Create a synchronous engine for table operations
        sync_engine = create_engine(settings.DATABASE_URL)

        with sync_engine.begin() as conn:
            # Drop all tables first
            conn.execute(text("DROP TABLE IF EXISTS processing_jobs CASCADE"))
            conn.execute(text("DROP TABLE IF EXISTS messages CASCADE"))
            conn.execute(text("DROP TABLE IF EXISTS conversations CASCADE"))
            conn.execute(text("DROP TABLE IF EXISTS openai_files CASCADE"))
            conn.execute(text("DROP TABLE IF EXISTS gcs_files CASCADE"))
            conn.execute(text("DROP TABLE IF EXISTS knowledge_items CASCADE"))
            conn.execute(text("DROP TABLE IF EXISTS folders CASCADE"))
            conn.execute(text("DROP TABLE IF EXISTS api_keys CASCADE"))
            conn.execute(text("DROP TABLE IF EXISTS profiles CASCADE"))

            print("✅ All existing tables dropped")

        # Import models after dropping tables to avoid circular import
        from app.models.database import Base
        Base.metadata.create_all(sync_engine)

        print("✅ Database tables recreated with simplified schema")

    except Exception as e:
        print(f"❌ Error recreating database: {e}")
        raise

if __name__ == "__main__":
    asyncio.run(recreate_database())