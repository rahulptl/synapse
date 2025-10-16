#!/usr/bin/env python3
"""
Run OpenAI vector stores migration using the app's database connection.
"""
import asyncio
import sys
from pathlib import Path

# Add backend to Python path
backend_path = Path(__file__).parent / "backend"
sys.path.insert(0, str(backend_path))

from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import async_session_maker, engine


async def run_migration():
    """Run the OpenAI vector stores migration."""

    # Read the migration SQL file
    migration_file = Path(__file__).parent / "backend" / "migrations" / "openai_vector_stores_migration.sql"

    if not migration_file.exists():
        print(f"❌ Migration file not found: {migration_file}")
        return False

    with open(migration_file, 'r') as f:
        migration_sql = f.read()

    print("🚀 Starting OpenAI vector stores migration...")

    try:
        # Run the migration
        async with engine.begin() as conn:
            await conn.execute(migration_sql)

        print("✅ Migration completed successfully!")
        return True

    except Exception as e:
        print(f"❌ Migration failed: {e}")
        print(f"Check if tables already exist - this might be normal if already migrated")
        return False


async def check_migration_status():
    """Check if migration has already been applied by checking for new tables."""

    check_sql = """
    SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'files'
    ) as files_exists,
    EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'gcs_files'
    ) as gcs_files_exists,
    EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'openai_files'
    ) as openai_files_exists;
    """

    try:
        async with engine.begin() as conn:
            result = await conn.execute(check_sql)
            row = result.fetchone()

        files_exists, gcs_files_exists, openai_files_exists = row

        if files_exists and gcs_files_exists and openai_files_exists:
            print("✅ Migration appears to be already applied (all tables exist)")
            return True
        else:
            print(f"📊 Table status: files={files_exists}, gcs_files={gcs_files_exists}, openai_files={openai_files_exists}")
            return False

    except Exception as e:
        print(f"❌ Failed to check migration status: {e}")
        return False


async def main():
    """Main migration runner."""
    print("=" * 60)
    print("🔧 OpenAI Vector Stores Migration Runner")
    print("=" * 60)

    # Check if migration already exists
    print("\n🔍 Checking migration status...")
    already_applied = await check_migration_status()

    if already_applied:
        print("\n✅ Migration already exists! No action needed.")
        return

    # Run migration
    print("\n📋 Running migration...")
    success = await run_migration()

    if success:
        print("\n🎉 Migration completed! You can now use OpenAI vector stores.")
        print("\nNext steps:")
        print("1. Set OPENAI_API_KEY environment variable")
        print("2. Set ENABLE_OPENAI_VECTOR_STORES=true")
        print("3. Test with: POST /api/v1/files/upload-optimized")
    else:
        print("\n⚠️ Migration failed. Check the error above.")
        print("You may need to run it manually or check database connectivity.")


if __name__ == "__main__":
    asyncio.run(main())