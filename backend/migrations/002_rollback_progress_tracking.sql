-- Rollback Migration: Remove progress tracking columns from knowledge_items table
-- Purpose: Rollback progress tracking feature
-- Date: 2025-10-06

-- Drop index
DROP INDEX IF EXISTS idx_knowledge_items_progress;

-- Remove progress tracking columns
ALTER TABLE knowledge_items
DROP COLUMN IF EXISTS chunks_processed,
DROP COLUMN IF EXISTS processing_progress,
DROP COLUMN IF EXISTS estimated_completion;
