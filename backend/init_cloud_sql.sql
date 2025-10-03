-- =============================================================================
-- Synapse Cloud SQL Database Initialization Script
-- =============================================================================
-- Description: Complete database schema for Synapse knowledge management system
-- Author: Generated for GCP Cloud SQL (PostgreSQL)
-- Date: 2025-01-03
-- =============================================================================

-- Enable required PostgreSQL extensions
-- =============================================================================

-- UUID generation support
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Vector embeddings support (pgvector)
CREATE EXTENSION IF NOT EXISTS "vector";

-- =============================================================================
-- Authentication Tables
-- =============================================================================

-- Users table for authentication
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    is_verified BOOLEAN DEFAULT FALSE NOT NULL,
    verification_token VARCHAR(255),
    reset_token VARCHAR(255),
    reset_token_expires TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    last_login TIMESTAMP
);

-- Create indexes for users table
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_verification_token ON users(verification_token) WHERE verification_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_reset_token ON users(reset_token) WHERE reset_token IS NOT NULL;

-- Comments for users table
COMMENT ON TABLE users IS 'User accounts for Cloud SQL authentication system';
COMMENT ON COLUMN users.email IS 'User email address (unique)';
COMMENT ON COLUMN users.password_hash IS 'Bcrypt hashed password';
COMMENT ON COLUMN users.is_active IS 'Whether user account is active';
COMMENT ON COLUMN users.is_verified IS 'Whether email has been verified';
COMMENT ON COLUMN users.verification_token IS 'Token sent via email for verification';
COMMENT ON COLUMN users.reset_token IS 'Token for password reset';
COMMENT ON COLUMN users.reset_token_expires IS 'Expiry time for password reset token';

-- Refresh tokens table for JWT token management
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    token_hash VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    is_revoked BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    user_agent TEXT,
    ip_address VARCHAR(45)
);

-- Create indexes for refresh_tokens table
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);

-- Comments for refresh_tokens table
COMMENT ON TABLE refresh_tokens IS 'JWT refresh tokens for session management';
COMMENT ON COLUMN refresh_tokens.token_hash IS 'SHA-256 hash of refresh token';
COMMENT ON COLUMN refresh_tokens.expires_at IS 'Token expiration timestamp';
COMMENT ON COLUMN refresh_tokens.is_revoked IS 'Whether token has been revoked';
COMMENT ON COLUMN refresh_tokens.user_agent IS 'Browser/device user agent string';
COMMENT ON COLUMN refresh_tokens.ip_address IS 'IP address where token was created';

-- =============================================================================
-- User Profile and Application Tables
-- =============================================================================

-- Profiles table (links to users and stores additional user information)
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL,
    email TEXT NOT NULL,
    full_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for profiles table
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id);

-- Comments for profiles table
COMMENT ON TABLE profiles IS 'User profiles with extended information';
COMMENT ON COLUMN profiles.user_id IS 'Reference to user authentication record';

-- API Keys table for programmatic access
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    key_hash TEXT NOT NULL UNIQUE,
    key_prefix TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    expires_at TIMESTAMP,
    last_used_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for api_keys table
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);

-- Comments for api_keys table
COMMENT ON TABLE api_keys IS 'API keys for programmatic access to the system';
COMMENT ON COLUMN api_keys.key_hash IS 'SHA-256 hash of the API key';
COMMENT ON COLUMN api_keys.key_prefix IS 'First 8 characters of key for identification';

-- =============================================================================
-- Knowledge Management Tables
-- =============================================================================

-- Folders table for organizing knowledge items
CREATE TABLE IF NOT EXISTS folders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    parent_id UUID REFERENCES folders(id) ON DELETE CASCADE,
    path TEXT NOT NULL,
    depth INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for folders table
CREATE INDEX IF NOT EXISTS idx_folders_user_id ON folders(user_id);
CREATE INDEX IF NOT EXISTS idx_folders_parent_id ON folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_folders_path ON folders(path);

-- Comments for folders table
COMMENT ON TABLE folders IS 'Hierarchical folder structure for organizing knowledge items';
COMMENT ON COLUMN folders.path IS 'Full path from root to this folder (e.g., /parent/child)';
COMMENT ON COLUMN folders.depth IS 'Depth level in folder hierarchy (0 = root level)';

-- Knowledge items table (main content storage)
CREATE TABLE IF NOT EXISTS knowledge_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
    folder_id UUID NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    content_type TEXT NOT NULL DEFAULT 'text',
    source_url TEXT,
    processing_status TEXT DEFAULT 'pending',
    is_chunked BOOLEAN DEFAULT FALSE,
    total_chunks INTEGER DEFAULT 1,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for knowledge_items table
CREATE INDEX IF NOT EXISTS idx_knowledge_items_user_id ON knowledge_items(user_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_items_folder_id ON knowledge_items(folder_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_items_processing_status ON knowledge_items(processing_status);
CREATE INDEX IF NOT EXISTS idx_knowledge_items_user_processing ON knowledge_items(user_id, processing_status);

-- Comments for knowledge_items table
COMMENT ON TABLE knowledge_items IS 'Main content storage for knowledge base items';
COMMENT ON COLUMN knowledge_items.content_type IS 'Type of content (text, pdf, doc, html, etc.)';
COMMENT ON COLUMN knowledge_items.processing_status IS 'Processing status (pending, processing, completed, failed, partial)';
COMMENT ON COLUMN knowledge_items.is_chunked IS 'Whether content has been split into chunks';
COMMENT ON COLUMN knowledge_items.total_chunks IS 'Total number of chunks created from this item';
COMMENT ON COLUMN knowledge_items.metadata IS 'Additional metadata (file size, parsed data, etc.)';

-- =============================================================================
-- Vector Embeddings Tables
-- =============================================================================

-- Vectors table for storing embeddings
CREATE TABLE IF NOT EXISTS vectors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    knowledge_item_id UUID NOT NULL REFERENCES knowledge_items(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL DEFAULT 0,
    embedding vector(1536),
    content_preview TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for vectors table
CREATE INDEX IF NOT EXISTS idx_vectors_knowledge_item_id ON vectors(knowledge_item_id);
CREATE INDEX IF NOT EXISTS idx_vectors_chunk_index ON vectors(chunk_index);

-- HNSW index for fast similarity search (cosine distance)
CREATE INDEX IF NOT EXISTS idx_vectors_embedding ON vectors
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- Comments for vectors table
COMMENT ON TABLE vectors IS 'Vector embeddings for semantic search';
COMMENT ON COLUMN vectors.embedding IS 'OpenAI text-embedding-3-small embedding (1536 dimensions)';
COMMENT ON COLUMN vectors.chunk_index IS 'Index of chunk within parent knowledge item';
COMMENT ON COLUMN vectors.content_preview IS 'Text preview of the chunk for display';

-- =============================================================================
-- Chat and Conversation Tables
-- =============================================================================

-- Conversations table for chat sessions
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for conversations table
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);

-- Comments for conversations table
COMMENT ON TABLE conversations IS 'Chat conversation sessions';
COMMENT ON COLUMN conversations.title IS 'Title/summary of the conversation';

-- Messages table for conversation history
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    metadata JSONB,
    job_id UUID,
    created_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT chk_messages_role CHECK (role IN ('user', 'assistant'))
);

-- Create indexes for messages table
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);

-- Comments for messages table
COMMENT ON TABLE messages IS 'Individual messages within conversations';
COMMENT ON COLUMN messages.role IS 'Message role: user or assistant';
COMMENT ON COLUMN messages.metadata IS 'Additional message metadata (tokens, model, etc.)';
COMMENT ON COLUMN messages.job_id IS 'Reference to processing job if applicable';

-- =============================================================================
-- Background Processing Tables
-- =============================================================================

-- Processing jobs table for long-running operations
CREATE TABLE IF NOT EXISTS processing_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    message_id UUID REFERENCES messages(id) ON DELETE SET NULL,

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
    started_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    estimated_completion_seconds INTEGER,
    actual_duration_seconds FLOAT,

    -- Metadata
    processing_metadata JSONB,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    CONSTRAINT chk_processing_jobs_status CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'cancelled')),
    CONSTRAINT chk_processing_jobs_phase CHECK (current_phase IN ('queued', 'map', 'reduce', 'synthesis', 'complete')),
    CONSTRAINT chk_processing_jobs_progress CHECK (progress >= 0.0 AND progress <= 1.0)
);

-- Create indexes for processing_jobs table
CREATE INDEX IF NOT EXISTS idx_processing_jobs_user_status ON processing_jobs(user_id, status);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_conversation ON processing_jobs(conversation_id);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_status ON processing_jobs(status);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_created_at ON processing_jobs(created_at);

-- Add foreign key for messages.job_id after processing_jobs table creation
ALTER TABLE messages ADD CONSTRAINT fk_messages_job_id
    FOREIGN KEY (job_id) REFERENCES processing_jobs(id) ON DELETE SET NULL;

-- Comments for processing_jobs table
COMMENT ON TABLE processing_jobs IS 'Background processing jobs for long-running queries';
COMMENT ON COLUMN processing_jobs.job_type IS 'Type of job (aggregation, full_folder_summary, filtered_aggregation)';
COMMENT ON COLUMN processing_jobs.status IS 'Job status (queued, processing, completed, failed, cancelled)';
COMMENT ON COLUMN processing_jobs.current_phase IS 'Current processing phase (queued, map, reduce, synthesis, complete)';
COMMENT ON COLUMN processing_jobs.progress IS 'Progress percentage (0.0 to 1.0)';
COMMENT ON COLUMN processing_jobs.result IS 'Final answer with sources';
COMMENT ON COLUMN processing_jobs.aggregation_details IS 'Detailed breakdown of aggregation';
COMMENT ON COLUMN processing_jobs.intermediate_results IS 'Map phase results for debugging/resume';

-- =============================================================================
-- Functions and Triggers
-- =============================================================================

-- Function to update updated_at timestamp for users
CREATE OR REPLACE FUNCTION update_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for users table
CREATE TRIGGER trigger_update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_users_updated_at();

-- Function to update updated_at timestamp for profiles
CREATE OR REPLACE FUNCTION update_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for profiles table
CREATE TRIGGER trigger_update_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_profiles_updated_at();

-- Function to update updated_at timestamp for api_keys
CREATE OR REPLACE FUNCTION update_api_keys_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for api_keys table
CREATE TRIGGER trigger_update_api_keys_updated_at
    BEFORE UPDATE ON api_keys
    FOR EACH ROW
    EXECUTE FUNCTION update_api_keys_updated_at();

-- Function to update updated_at timestamp for folders
CREATE OR REPLACE FUNCTION update_folders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for folders table
CREATE TRIGGER trigger_update_folders_updated_at
    BEFORE UPDATE ON folders
    FOR EACH ROW
    EXECUTE FUNCTION update_folders_updated_at();

-- Function to update updated_at timestamp for knowledge_items
CREATE OR REPLACE FUNCTION update_knowledge_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for knowledge_items table
CREATE TRIGGER trigger_update_knowledge_items_updated_at
    BEFORE UPDATE ON knowledge_items
    FOR EACH ROW
    EXECUTE FUNCTION update_knowledge_items_updated_at();

-- Function to update updated_at timestamp for vectors
CREATE OR REPLACE FUNCTION update_vectors_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for vectors table
CREATE TRIGGER trigger_update_vectors_updated_at
    BEFORE UPDATE ON vectors
    FOR EACH ROW
    EXECUTE FUNCTION update_vectors_updated_at();

-- Function to update updated_at timestamp for conversations
CREATE OR REPLACE FUNCTION update_conversations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for conversations table
CREATE TRIGGER trigger_update_conversations_updated_at
    BEFORE UPDATE ON conversations
    FOR EACH ROW
    EXECUTE FUNCTION update_conversations_updated_at();

-- Function to update updated_at timestamp for processing_jobs
CREATE OR REPLACE FUNCTION update_processing_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for processing_jobs table
CREATE TRIGGER trigger_update_processing_jobs_updated_at
    BEFORE UPDATE ON processing_jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_processing_jobs_updated_at();

-- =============================================================================
-- Utility Functions
-- =============================================================================

-- Function to search vectors by similarity
CREATE OR REPLACE FUNCTION match_vectors(
    query_embedding vector(1536),
    match_threshold float DEFAULT 0.7,
    match_count int DEFAULT 5,
    filter_user_id uuid DEFAULT NULL,
    filter_folder_id uuid DEFAULT NULL
)
RETURNS TABLE (
    id uuid,
    knowledge_item_id uuid,
    chunk_index int,
    content_preview text,
    similarity float
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        v.id,
        v.knowledge_item_id,
        v.chunk_index,
        v.content_preview,
        1 - (v.embedding <=> query_embedding) AS similarity
    FROM vectors v
    INNER JOIN knowledge_items ki ON v.knowledge_item_id = ki.id
    WHERE
        (filter_user_id IS NULL OR ki.user_id = filter_user_id)
        AND (filter_folder_id IS NULL OR ki.folder_id = filter_folder_id)
        AND ki.processing_status = 'completed'
        AND (1 - (v.embedding <=> query_embedding)) >= match_threshold
    ORDER BY v.embedding <=> query_embedding
    LIMIT match_count;
END;
$$ LANGUAGE plpgsql;

-- Comments for match_vectors function
COMMENT ON FUNCTION match_vectors IS 'Search for similar vectors using cosine similarity';

-- Function to clean up expired refresh tokens
CREATE OR REPLACE FUNCTION cleanup_expired_tokens()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM refresh_tokens
    WHERE expires_at < NOW() OR is_revoked = TRUE;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Comments for cleanup_expired_tokens function
COMMENT ON FUNCTION cleanup_expired_tokens IS 'Delete expired and revoked refresh tokens';

-- =============================================================================
-- Database Statistics and Monitoring Views
-- =============================================================================

-- View for user statistics
CREATE OR REPLACE VIEW user_statistics AS
SELECT
    p.user_id,
    p.email,
    p.full_name,
    COUNT(DISTINCT f.id) AS folder_count,
    COUNT(DISTINCT ki.id) AS knowledge_item_count,
    COUNT(DISTINCT v.id) AS vector_count,
    COUNT(DISTINCT c.id) AS conversation_count,
    p.created_at AS user_created_at
FROM profiles p
LEFT JOIN folders f ON p.user_id = f.user_id
LEFT JOIN knowledge_items ki ON p.user_id = ki.user_id
LEFT JOIN vectors v ON ki.id = v.knowledge_item_id
LEFT JOIN conversations c ON p.user_id = c.user_id
GROUP BY p.user_id, p.email, p.full_name, p.created_at;

-- Comments for user_statistics view
COMMENT ON VIEW user_statistics IS 'Summary statistics for each user';

-- =============================================================================
-- Initial Data and Setup
-- =============================================================================

-- Create a default system user profile (optional - remove if not needed)
-- INSERT INTO profiles (user_id, email, full_name)
-- VALUES (
--     '00000000-0000-0000-0000-000000000000'::uuid,
--     'system@synapse.local',
--     'System User'
-- ) ON CONFLICT (user_id) DO NOTHING;

-- =============================================================================
-- Database Initialization Complete
-- =============================================================================

-- Verify extensions
SELECT extname, extversion FROM pg_extension WHERE extname IN ('uuid-ossp', 'vector');

-- Display table count
SELECT COUNT(*) AS table_count
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';

-- Display all tables
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER BY table_name;

COMMENT ON DATABASE CURRENT_DATABASE() IS 'Synapse Knowledge Management System - Cloud SQL Database';
