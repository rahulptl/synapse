#!/usr/bin/env python3
"""
Knowledge Base Migration CLI Tool.

This command-line tool provides a complete interface for migrating
the existing knowledge base from legacy pgvector to OpenAI Vector Stores.

Usage:
    python -m backend.cli.migrate_knowledge_base [--options]

Examples:
    # Analyze current state
    python -m backend.cli.migrate_knowledge_base --analyze

    # Dry run migration (show what would be migrated)
    python -m backend.cli.migrate_knowledge_base --dry-run --batch-size 50

    # Run actual migration
    python -m backend.cli.migrate_knowledge_base --execute --batch-size 100

    # Migrate specific user
    python -m backend.cli.migrate_knowledge_base --execute --user-id <uuid>

    # Check migration progress
    python -m backend.cli.migrate_knowledge_base --progress

    # Verify migration completeness
    python -m backend.cli.migrate_knowledge_base --verify
"""
import asyncio
import sys
import os
from pathlib import Path
from uuid import UUID
from typing import Optional
import argparse
from datetime import datetime

# Add backend to Python path
backend_path = Path(__file__).parent.parent
sys.path.insert(0, str(backend_path))

# Load environment variables
env_file = backend_path / ".env"
if env_file.exists():
    with open(env_file, 'r') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                key, value = line.split('=', 1)
                os.environ[key] = value

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from app.services.migration_service import migration_service, MigrationAnalysis
from app.config import settings


class MigrationCLI:
    """Command-line interface for knowledge base migration."""

    def __init__(self):
        self.engine = None

    async def init_database(self):
        """Initialize database connection."""
        if not self.engine:
            self.engine = create_async_engine(settings.DATABASE_URL)

    async def close_database(self):
        """Close database connection."""
        if self.engine:
            await self.engine.dispose()

    async def analyze(self, user_id: Optional[UUID] = None, folder_id: Optional[UUID] = None):
        """Analyze current knowledge base state."""
        print("🔍 Analyzing knowledge base for migration...")
        print("=" * 60)

        async with AsyncSession(self.engine) as db:
            try:
                analysis = await migration_service.analyze_legacy_content(
                    db=db,
                    user_id=user_id,
                    folder_id=folder_id
                )

                if analysis.total_items == 0:
                    print("📊 No knowledge items found.")
                    return

                print(f"📊 Analysis Results:")
                print(f"  Total Items: {analysis.total_items:,}")
                print(f"  Legacy Items: {analysis.legacy_items:,}")
                print(f"  New Items: {analysis.new_items:,}")
                print(f"  Migration Progress: {((analysis.new_items / analysis.total_items) * 100):.1f}%")
                print()

                print(f"📏 Content Statistics:")
                print(f"  Total Size: {analysis.total_size_bytes / (1024**2):.1f} MB")
                print(f"  Content Types:")
                for content_type, count in analysis.content_types.items():
                    print(f"    {content_type}: {count:,} items")
                print()

                print(f"⏱️  Time & Cost Estimates:")
                print(f"  Estimated Time: {analysis.estimated_time_hours:.1f} hours")
                print(f"  Estimated Cost: ${analysis.estimated_cost_usd:.2f}")
                print(f"  Processing Rate: ~100 items/hour")
                print()

                print(f"👥 Scope:")
                print(f"  Users Affected: {len(analysis.users_affected):,}")
                print(f"  Folders Affected: {len(analysis.folders_affected):,}")
                print()

                if analysis.legacy_items == 0:
                    print("✅ All items already migrated!")
                else:
                    print(f"🚀 Ready to migrate {analysis.legacy_items:,} legacy items")

            except Exception as e:
                print(f"❌ Analysis failed: {e}")
                raise

    async def dry_run(
        self,
        batch_size: int = 50,
        user_id: Optional[UUID] = None,
        folder_id: Optional[UUID] = None
    ):
        """Perform a dry run migration without actually migrating."""
        print("🔍 Performing dry run migration...")
        print("=" * 60)

        async with AsyncSession(self.engine) as db:
            try:
                # Get sample items that would be migrated
                sample_items = await migration_service.get_unmigrated_items(
                    db=db,
                    limit=batch_size,
                    user_id=user_id,
                    folder_id=folder_id
                )

                if not sample_items:
                    print("📊 No legacy items found to migrate.")
                    return

                print(f"📋 Found {len(sample_items)} items that would be migrated:")
                print()

                for i, item in enumerate(sample_items[:10], 1):  # Show first 10
                    content = item.content or item.extracted_data or ""
                    content_preview = content[:100] + "..." if len(content) > 100 else content

                    print(f"{i:2d}. {item.title}")
                    print(f"    ID: {item.id}")
                    print(f"    Type: {item.content_type}")
                    print(f"    Size: {len(content.encode('utf-8'))} bytes")
                    print(f"    Preview: {content_preview}")
                    print()

                if len(sample_items) > 10:
                    print(f"... and {len(sample_items) - 10} more items")

                print()
                print("🚀 This is a DRY RUN - no actual migration performed.")
                print("   Use --execute to perform actual migration.")

            except Exception as e:
                print(f"❌ Dry run failed: {e}")
                raise

    async def execute(
        self,
        batch_size: int = 100,
        user_id: Optional[UUID] = None,
        folder_id: Optional[UUID] = None,
        max_batches: Optional[int] = None
    ):
        """Execute the actual migration."""
        print("🚀 Starting knowledge base migration...")
        print("=" * 60)

        async with AsyncSession(self.engine) as db:
            try:
                # First analyze
                analysis = await migration_service.analyze_legacy_content(
                    db=db,
                    user_id=user_id,
                    folder_id=folder_id
                )

                if analysis.legacy_items == 0:
                    print("✅ All items already migrated!")
                    return

                print(f"📊 Migration Plan:")
                print(f"  Items to migrate: {analysis.legacy_items:,}")
                print(f"  Batch size: {batch_size}")
                print(f"  Estimated time: {analysis.estimated_time_hours:.1f} hours")
                print(f"  Estimated cost: ${analysis.estimated_cost_usd:.2f}")
                print()

                # Confirm migration
                if not self._confirm_migration(analysis):
                    print("❌ Migration cancelled by user.")
                    return

                # Execute migration
                start_time = datetime.utcnow()
                total_migrated = 0
                total_failed = 0
                batch_count = 0

                while True:
                    print(f"🔄 Processing batch {batch_count + 1}...")

                    batch_result = await migration_service.migrate_batch(
                        db=db,
                        batch_size=batch_size,
                        user_id=user_id,
                        folder_id=folder_id
                    )

                    total_migrated += batch_result.successful_items
                    total_failed += batch_result.failed_items
                    batch_count += 1

                    print(f"  ✅ Batch {batch_count} complete: "
                          f"{batch_result.successful_items}/{batch_result.total_items} successful "
                          f"({batch_result.success_rate:.1%})")

                    # Show recent failures
                    if batch_result.failed_items > 0:
                        failed_results = [r for r in batch_result.results if not r.success]
                        print(f"  ❌ Failed items:")
                        for failed in failed_results[:3]:  # Show first 3 failures
                            print(f"    {failed.item_id}: {failed.error}")

                    # Check if we're done
                    if batch_result.total_items < batch_size:
                        break

                    # Check max_batches limit
                    if max_batches and batch_count >= max_batches:
                        print(f"🛑 Reached maximum batch limit ({max_batches})")
                        break

                    # Small delay between batches
                    await asyncio.sleep(1)

                # Final statistics
                end_time = datetime.utcnow()
                duration = (end_time - start_time).total_seconds()

                print()
                print("🎉 Migration Complete!")
                print(f"  Total time: {duration:.1f} seconds")
                print(f"  Items migrated: {total_migrated:,}")
                print(f"  Items failed: {total_failed:,}")
                print(f"  Success rate: {(total_migrated / (total_migrated + total_failed) * 100):.1f}%")
                print(f"  Processing rate: {(total_migrated / duration * 3600):.0f} items/hour")

            except Exception as e:
                print(f"❌ Migration failed: {e}")
                raise

    async def progress(self, user_id: Optional[UUID] = None):
        """Show current migration progress."""
        print("📊 Migration Progress Report")
        print("=" * 60)

        async with AsyncSession(self.engine) as db:
            try:
                progress = await migration_service.get_migration_progress(db=db, user_id=user_id)

                print(f"📈 Overall Progress:")
                print(f"  Total Items: {progress['total_items']:,}")
                print(f"  Migrated Items: {progress['migrated_items']:,}")
                print(f"  Legacy Items: {progress['legacy_items']:,}")
                print(f"  Progress: {progress['progress_percentage']:.1f}%")
                print(f"  Status: {progress['status']}")
                print()

                if progress['recent_migrations']:
                    print(f"🕐 Recent Migrations:")
                    for migration in progress['recent_migrations'][:5]:
                        print(f"  • {migration['title']}")
                        print(f"    ID: {migration['id']}")
                        if migration['migrated_at']:
                            print(f"    Migrated: {migration['migrated_at']}")
                        print()

                if progress['status'] == 'completed':
                    print("✅ Migration is complete!")
                elif progress['status'] == 'in_progress':
                    print("🔄 Migration is in progress...")
                else:
                    print("⚠️  Migration status unknown")

            except Exception as e:
                print(f"❌ Failed to get progress: {e}")
                raise

    async def verify(self, sample_size: int = 100):
        """Verify migration completeness and integrity."""
        print("🔍 Verifying Migration Integrity...")
        print("=" * 60)

        async with AsyncSession(self.engine) as db:
            try:
                verification = await migration_service.verify_migration(
                    db=db,
                    sample_size=sample_size
                )

                print(f"📊 Verification Results:")
                print(f"  Items Checked: {verification['total_items_checked']}")
                print(f"  Verified Items: {verification['verified_items']}")
                print(f"  Failed Verifications: {verification['failed_verifications']}")
                print(f"  Success Rate: {verification['success_rate']:.1%}")
                print()

                if verification.get('integrity_checks'):
                    print(f"🔍 Integrity Checks:")
                    for check_name, result in verification['integrity_checks'].items():
                        status = "✅" if result == 0 else "❌"
                        print(f"  {status} {check_name}: {result}")
                    print()

                if verification['issues_found']:
                    print(f"⚠️  Issues Found:")
                    for issue in verification['issues_found'][:10]:  # Show first 10
                        print(f"  • {issue}")
                    if len(verification['issues_found']) > 10:
                        print(f"  ... and {len(verification['issues_found']) - 10} more issues")
                else:
                    print("✅ No issues found!")

                if verification['success_rate'] >= 0.95:
                    print("🎉 Migration verification passed!")
                else:
                    print("⚠️  Migration verification indicates issues that need attention.")

            except Exception as e:
                print(f"❌ Verification failed: {e}")
                raise

    def _confirm_migration(self, analysis: MigrationAnalysis) -> bool:
        """Confirm migration with user."""
        print(f"⚠️  About to migrate {analysis.legacy_items:,} items.")
        print(f"   Estimated time: {analysis.estimated_time_hours:.1f} hours")
        print(f"   Estimated cost: ${analysis.estimated_cost_usd:.2f}")
        print()

        response = input("Do you want to proceed? (y/N): ").strip().lower()
        return response in ['y', 'yes']

    async def run(self):
        """Run the CLI with parsed arguments."""
        parser = argparse.ArgumentParser(
            description="Knowledge Base Migration Tool",
            formatter_class=argparse.RawDescriptionHelpFormatter,
            epilog="""
Examples:
  %(prog)s --analyze                                    # Analyze current state
  %(prog)s --dry-run --batch-size 50                   # Preview migration
  %(prog)s --execute --batch-size 100                  # Run migration
  %(prog)s --execute --user-id <uuid>                  # Migrate specific user
  %(prog)s --progress                                   # Check progress
  %(prog)s --verify                                     # Verify completeness
            """
        )

        parser.add_argument(
            '--analyze',
            action='store_true',
            help='Analyze current knowledge base state'
        )

        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Perform a dry run without actual migration'
        )

        parser.add_argument(
            '--execute',
            action='store_true',
            help='Execute the actual migration'
        )

        parser.add_argument(
            '--progress',
            action='store_true',
            help='Show current migration progress'
        )

        parser.add_argument(
            '--verify',
            action='store_true',
            help='Verify migration completeness and integrity'
        )

        parser.add_argument(
            '--batch-size',
            type=int,
            default=100,
            help='Batch size for migration (default: 100)'
        )

        parser.add_argument(
            '--user-id',
            type=str,
            help='Specific user ID to migrate (UUID)'
        )

        parser.add_argument(
            '--folder-id',
            type=str,
            help='Specific folder ID to migrate (UUID)'
        )

        parser.add_argument(
            '--max-batches',
            type=int,
            help='Maximum number of batches to process'
        )

        parser.add_argument(
            '--sample-size',
            type=int,
            default=100,
            help='Sample size for verification (default: 100)'
        )

        args = parser.parse_args()

        # Validate arguments
        if sum([args.analyze, args.dry_run, args.execute, args.progress, args.verify]) == 0:
            parser.error("Must specify one action: --analyze, --dry-run, --execute, --progress, or --verify")

        if sum([args.analyze, args.dry_run, args.execute, args.progress, args.verify]) > 1:
            parser.error("Cannot specify multiple actions")

        # Parse UUID arguments
        user_id = None
        if args.user_id:
            try:
                user_id = UUID(args.user_id)
            except ValueError:
                parser.error("Invalid user ID format. Must be a valid UUID.")

        folder_id = None
        if args.folder_id:
            try:
                folder_id = UUID(args.folder_id)
            except ValueError:
                parser.error("Invalid folder ID format. Must be a valid UUID.")

        # Initialize database
        await self.init_database()

        try:
            # Execute requested action
            if args.analyze:
                await self.analyze(user_id=user_id, folder_id=folder_id)
            elif args.dry_run:
                await self.dry_run(
                    batch_size=args.batch_size,
                    user_id=user_id,
                    folder_id=folder_id
                )
            elif args.execute:
                await self.execute(
                    batch_size=args.batch_size,
                    user_id=user_id,
                    folder_id=folder_id,
                    max_batches=args.max_batches
                )
            elif args.progress:
                await self.progress(user_id=user_id)
            elif args.verify:
                await self.verify(sample_size=args.sample_size)

        finally:
            await self.close_database()


async def main():
    """Main CLI entry point."""
    cli = MigrationCLI()
    await cli.run()


if __name__ == "__main__":
    asyncio.run(main())