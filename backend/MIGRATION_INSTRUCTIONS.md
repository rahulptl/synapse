# Database Migration Instructions for Map-Reduce RAG

## Overview
This migration adds support for asynchronous processing jobs with map-reduce capabilities.

## Changes Made

### New Model: ProcessingJob
- Tracks background processing jobs for long-running queries
- Includes progress tracking, results storage, and error handling
- Related to conversations and messages

### Updated Model: Message
- Added optional `job_id` field to link messages to processing jobs

## Migration Steps

### Option 1: Using Alembic (Recommended)

If Alembic is set up:

```bash
cd backend

# Create migration
alembic revision --autogenerate -m "Add processing_jobs table and job_id to messages"

# Review the generated migration file in alembic/versions/

# Apply migration
alembic upgrade head
```

### Option 2: Direct SQL (if using Supabase or direct PostgreSQL)

Run this SQL in your database:

```sql
-- Create processing_jobs table
CREATE TABLE processing_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(user_id),
    conversation_id UUID NOT NULL REFERENCES conversations(id),
    message_id UUID REFERENCES messages(id),

    -- Job details
    job_type TEXT NOT NULL,
    status TEXT DEFAULT 'queued',
    user_query TEXT NOT NULL,
    intent_data JSONB,

    -- Progress tracking
    progress FLOAT DEFAULT 0.0,
    total_items INTEGER DEFAULT 0,
    total_batches INTEGER DEFAULT 0,
    processed_items INTEGER DEFAULT 0,
    processed_batches INTEGER DEFAULT 0,
    failed_batches INTEGER DEFAULT 0,
    current_phase TEXT DEFAULT 'queued',

    -- Results
    result JSONB,
    aggregation_details JSONB,
    intermediate_results JSONB,
    error_message TEXT,
    error_details JSONB,

    -- Timing
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    estimated_completion_seconds INTEGER,
    actual_duration_seconds FLOAT,

    -- Metadata
    processing_metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_processing_jobs_user_status ON processing_jobs(user_id, status);
CREATE INDEX idx_processing_jobs_conversation ON processing_jobs(conversation_id);
CREATE INDEX idx_processing_jobs_status ON processing_jobs(status);
CREATE INDEX idx_processing_jobs_created_at ON processing_jobs(created_at);

-- Add job_id to messages table
ALTER TABLE messages ADD COLUMN job_id UUID REFERENCES processing_jobs(id);

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_processing_jobs_updated_at BEFORE UPDATE ON processing_jobs
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

## Rollback

If you need to rollback:

```sql
-- Drop trigger
DROP TRIGGER IF EXISTS update_processing_jobs_updated_at ON processing_jobs;

-- Remove job_id from messages
ALTER TABLE messages DROP COLUMN IF EXISTS job_id;

-- Drop processing_jobs table
DROP TABLE IF EXISTS processing_jobs;
```

## Testing

After migration, test with:

```python
from app.models.database import ProcessingJob
from app.core.database import async_session_maker

async def test_migration():
    async with async_session_maker() as db:
        # Create a test job
        job = ProcessingJob(
            user_id=<test_user_id>,
            conversation_id=<test_conversation_id>,
            job_type="aggregation",
            user_query="Test query",
            intent_data={}
        )
        db.add(job)
        await db.commit()
        print(f"Created job: {job.id}")
```

## Notes

- The migration is backward compatible
- Existing messages will have `job_id = NULL`
- Processing jobs are optional and only created for long-running queries
- Make sure to backup your database before running the migration
