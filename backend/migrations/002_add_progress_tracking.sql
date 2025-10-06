-- Migration: Add progress tracking columns to knowledge_items table
-- Purpose: Enable real-time progress tracking for chunk processing
-- Date: 2025-10-06

-- Add progress tracking columns
ALTER TABLE knowledge_items
ADD COLUMN chunks_processed INTEGER DEFAULT 0,
ADD COLUMN processing_progress FLOAT DEFAULT 0.0,
ADD COLUMN estimated_completion TIMESTAMP WITH TIME ZONE;

-- Add index for efficient status queries
CREATE INDEX IF NOT EXISTS idx_knowledge_items_progress
ON knowledge_items(processing_status, chunks_processed, total_chunks);

-- Add comment for documentation
COMMENT ON COLUMN knowledge_items.chunks_processed IS 'Number of chunks that have been processed and stored';
COMMENT ON COLUMN knowledge_items.processing_progress IS 'Processing progress as percentage (0.0 to 100.0)';
COMMENT ON COLUMN knowledge_items.estimated_completion IS 'Estimated timestamp when processing will complete';
