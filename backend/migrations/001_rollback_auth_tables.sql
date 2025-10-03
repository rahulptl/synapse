-- Rollback: Remove Cloud SQL Authentication Tables
-- Description: Drops users and refresh_tokens tables
-- Date: 2025-01-XX

-- Drop trigger
DROP TRIGGER IF EXISTS trigger_update_users_updated_at ON users;

-- Drop function
DROP FUNCTION IF EXISTS update_users_updated_at();

-- Drop tables (order matters due to potential foreign keys)
DROP TABLE IF EXISTS refresh_tokens;
DROP TABLE IF EXISTS users;

-- Note: This rollback will permanently delete all user accounts and sessions
-- Make sure to backup data before running this rollback script
