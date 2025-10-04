-- =============================================================================
-- Synapse Local Development Database Initialization
-- =============================================================================
-- Description: Complete database schema for local development
-- Based on: init_cloud_sql.sql
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

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_verification_token ON users(verification_token) WHERE verification_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_reset_token ON users(reset_token) WHERE reset_token IS NOT NULL;

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

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);

-- =============================================================================
-- User Profile and Application Tables
-- =============================================================================

-- Profiles table
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL,
    email TEXT NOT NULL,
    full_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id);

-- API Keys table
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

CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);

-- =============================================================================
-- Knowledge Management Tables
-- =============================================================================

-- Folders table
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

CREATE INDEX IF NOT EXISTS idx_folders_user_id ON folders(user_id);
CREATE INDEX IF NOT EXISTS idx_folders_parent_id ON folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_folders_path ON folders(path);

-- Knowledge items table
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

CREATE INDEX IF NOT EXISTS idx_knowledge_items_user_id ON knowledge_items(user_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_items_folder_id ON knowledge_items(folder_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_items_processing_status ON knowledge_items(processing_status);
CREATE INDEX IF NOT EXISTS idx_knowledge_items_user_processing ON knowledge_items(user_id, processing_status);

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

CREATE INDEX IF NOT EXISTS idx_vectors_knowledge_item_id ON vectors(knowledge_item_id);
CREATE INDEX IF NOT EXISTS idx_vectors_chunk_index ON vectors(chunk_index);

-- HNSW index for fast similarity search (cosine distance)
CREATE INDEX IF NOT EXISTS idx_vectors_embedding ON vectors
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- =============================================================================
-- Chat and Conversation Tables
-- =============================================================================

-- Conversations table
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);

-- Messages table
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

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);

-- =============================================================================
-- Background Processing Tables
-- =============================================================================

-- Processing jobs table
CREATE TABLE IF NOT EXISTS processing_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
    job_type TEXT NOT NULL,
    status TEXT DEFAULT 'queued',
    user_query TEXT NOT NULL,
    intent_data JSONB,
    progress FLOAT DEFAULT 0.0,
    total_items INTEGER DEFAULT 0,
    total_batches INTEGER DEFAULT 0,
    processed_items INTEGER DEFAULT 0,
    processed_batches INTEGER DEFAULT 0,
    failed_batches INTEGER DEFAULT 0,
    current_phase TEXT DEFAULT 'queued',
    result JSONB,
    aggregation_details JSONB,
    intermediate_results JSONB,
    error_message TEXT,
    error_details JSONB,
    started_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    estimated_completion_seconds INTEGER,
    actual_duration_seconds FLOAT,
    processing_metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT chk_processing_jobs_status CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'cancelled')),
    CONSTRAINT chk_processing_jobs_phase CHECK (current_phase IN ('queued', 'map', 'reduce', 'synthesis', 'complete')),
    CONSTRAINT chk_processing_jobs_progress CHECK (progress >= 0.0 AND progress <= 1.0)
);

CREATE INDEX IF NOT EXISTS idx_processing_jobs_user_status ON processing_jobs(user_id, status);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_conversation ON processing_jobs(conversation_id);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_status ON processing_jobs(status);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_created_at ON processing_jobs(created_at);

-- Add foreign key for messages.job_id
ALTER TABLE messages ADD CONSTRAINT fk_messages_job_id
    FOREIGN KEY (job_id) REFERENCES processing_jobs(id) ON DELETE SET NULL;

-- =============================================================================
-- Functions and Triggers
-- =============================================================================

-- Update timestamp functions
CREATE OR REPLACE FUNCTION update_users_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_profiles_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_api_keys_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_folders_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_knowledge_items_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_vectors_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_conversations_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_processing_jobs_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

-- Create triggers
CREATE TRIGGER trigger_update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_users_updated_at();

CREATE TRIGGER trigger_update_profiles_updated_at BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_profiles_updated_at();

CREATE TRIGGER trigger_update_api_keys_updated_at BEFORE UPDATE ON api_keys
    FOR EACH ROW EXECUTE FUNCTION update_api_keys_updated_at();

CREATE TRIGGER trigger_update_folders_updated_at BEFORE UPDATE ON folders
    FOR EACH ROW EXECUTE FUNCTION update_folders_updated_at();

CREATE TRIGGER trigger_update_knowledge_items_updated_at BEFORE UPDATE ON knowledge_items
    FOR EACH ROW EXECUTE FUNCTION update_knowledge_items_updated_at();

CREATE TRIGGER trigger_update_vectors_updated_at BEFORE UPDATE ON vectors
    FOR EACH ROW EXECUTE FUNCTION update_vectors_updated_at();

CREATE TRIGGER trigger_update_conversations_updated_at BEFORE UPDATE ON conversations
    FOR EACH ROW EXECUTE FUNCTION update_conversations_updated_at();

CREATE TRIGGER trigger_update_processing_jobs_updated_at BEFORE UPDATE ON processing_jobs
    FOR EACH ROW EXECUTE FUNCTION update_processing_jobs_updated_at();

-- =============================================================================
-- Utility Functions
-- =============================================================================

-- Vector similarity search function
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

-- Cleanup expired tokens
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

-- =============================================================================
-- Views
-- =============================================================================

-- User statistics view
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

-- =============================================================================
-- Test Data for Local Development
-- =============================================================================

-- Create test user
-- Password hash for "test123" using bcrypt
INSERT INTO users (id, email, password_hash, full_name, is_active, is_verified)
VALUES (
    '00000000-0000-0000-0000-000000000001'::uuid,
    'test@synapse.local',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/L3.VHWqEJwFuQ1K9e', -- test123
    'Test User',
    TRUE,
    TRUE
) ON CONFLICT (email) DO NOTHING;

-- Create profile for test user
INSERT INTO profiles (user_id, email, full_name)
VALUES (
    '00000000-0000-0000-0000-000000000001'::uuid,
    'test@synapse.local',
    'Test User'
) ON CONFLICT (user_id) DO NOTHING;

-- =============================================================================
-- Verification
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
