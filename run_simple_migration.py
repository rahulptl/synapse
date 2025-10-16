#!/usr/bin/env python3
"""
Simple migration runner that reads environment variables directly.
"""
import os
import asyncio
import sys
from pathlib import Path

# Add backend to Python path
backend_path = Path(__file__).parent / "backend"
sys.path.insert(0, str(backend_path))

# Load environment variables from .env file
env_file = backend_path / ".env"
if env_file.exists():
    with open(env_file, 'r') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                key, value = line.split('=', 1)
                os.environ[key] = value
    print(f"📋 Loaded environment variables from {env_file}")
else:
    print(f"⚠️  No .env file found at {env_file}")


def check_environment():
    """Check if required environment variables are set."""
    required_vars = ['DATABASE_URL']
    missing_vars = []

    for var in required_vars:
        if not os.getenv(var):
            missing_vars.append(var)

    if missing_vars:
        print(f"❌ Missing required environment variables: {', '.join(missing_vars)}")
        print("\nPlease set these environment variables:")
        for var in missing_vars:
            print(f"  export {var}=<your_value>")
        return False

    return True


async def run_simple_migration():
    """Run migration using direct database connection."""

    if not check_environment():
        return False

    try:
        from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
        from sqlalchemy import text

        # Get database URL from environment
        database_url = os.getenv('DATABASE_URL')
        print(f"🔗 Connecting to database...")

        # Create engine
        engine = create_async_engine(database_url, echo=False)

        # Read migration file
        migration_file = Path(__file__).parent / "backend" / "migrations" / "openai_vector_stores_migration.sql"

        if not migration_file.exists():
            print(f"❌ Migration file not found: {migration_file}")
            return False

        with open(migration_file, 'r') as f:
            migration_sql = f.read()

        print("🚀 Running OpenAI Vector Stores migration...")

        # Check if tables already exist
        check_sql = text("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_schema = 'public'
                AND table_name = 'files'
            ) as files_exists;
        """)

        async with AsyncSession(engine) as session:
            result = await session.execute(check_sql)
            files_exists = result.fetchone()[0]

            if files_exists:
                print("⚠️  Migration may have already been run (files table exists)")

                # Check all tables
                check_all_sql = text("""
                    SELECT table_name
                    FROM information_schema.tables
                    WHERE table_schema = 'public'
                    AND table_name IN ('files', 'gcs_files', 'openai_files')
                    ORDER BY table_name;
                """)

                result = await session.execute(check_all_sql)
                tables = [row[0] for row in result.fetchall()]

                print(f"📋 Found tables: {', '.join(tables)}")

                if len(tables) >= 3:
                    print("✅ All required tables exist - migration complete!")
                    return True
                else:
                    print("⚠️  Some tables missing - proceeding with migration...")

        # Run the migration
        async with engine.begin() as conn:
            await conn.execute(text(migration_sql))

        print("✅ Migration completed successfully!")

        # Verify tables were created
        async with AsyncSession(engine) as session:
            result = await session.execute(check_all_sql)
            tables = [row[0] for row in result.fetchall()]

        print(f"📊 Created tables: {', '.join(tables)}")

        await engine.dispose()
        return True

    except Exception as e:
        print(f"❌ Migration failed: {e}")
        return False


async def main():
    """Main migration runner."""
    print("=" * 60)
    print("🔧 OpenAI Vector Stores Migration (Simple)")
    print("=" * 60)

    # Check environment first
    if not check_environment():
        print("\n💡 To set up environment variables:")
        print("  # Option 1: Direct export")
        print("  export DATABASE_URL='postgresql+asyncpg://user:password@localhost/dbname'")
        print("  # Option 2: .env file")
        print("  echo 'DATABASE_URL=postgresql+asyncpg://user:password@localhost/dbname' > .env")
        print("  # Option 3: Run with existing environment")
        print("  DATABASE_URL=... python run_simple_migration.py")
        return

    # Run migration
    success = await run_simple_migration()

    if success:
        print("\n🎉 Migration completed successfully!")
        print("\nNext steps:")
        print("1. Set OPENAI_API_KEY environment variable")
        print("2. Set ENABLE_OPENAI_VECTOR_STORES=true (optional, defaults to true)")
        print("3. Start your FastAPI application")
        print("4. Test with: POST /api/v1/files/upload-optimized")
    else:
        print("\n⚠️ Migration failed. Check the error above.")


if __name__ == "__main__":
    asyncio.run(main())