# Database Schema Reference

**Project:** Synapse Knowledge Base
**Date:** October 5, 2025
**Database:** PostgreSQL with pgvector extension
**Status:** Production Ready ✅

---

## Overview

The enhanced RAG system requires **7 core tables**, all of which **already exist** in your database. No migrations are needed for the new features.

### Tables Summary

| Table | Purpose | Records (typical) | Size Impact |
|-------|---------|-------------------|-------------|
| `profiles` | User accounts | Low | Minimal |
| `api_keys` | Authentication | Low | Minimal |
| `folders` | Knowledge organization | Medium | Minimal |
| `knowledge_items` | Documents/content | High | Medium |
| `vectors` | Embeddings (chunks) | Very High | **Large** |
| `conversations` | Chat threads | Medium | Minimal |
| `messages` | Chat history | High | Medium |
| `processing_jobs` | Background tasks | Medium | Minimal |

**Storage Estimate:**
- 1,000 documents = ~10,000 vectors = ~60MB (embeddings only)
- Plus text content, metadata, etc. = ~200-500MB total

---

## Table Definitions

### 1. profiles

**Purpose:** User accounts and profiles

```sql
CREATE TABLE profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE,
    email TEXT NOT NULL,
    full_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes (auto-created)
CREATE INDEX idx_profiles_user_id ON profiles(user_id);
```

**Fields:**
- `id`: Internal primary key
- `user_id`: External user identifier (from auth system)
- `email`: User email address
- `full_name`: Display name
- `avatar_url`: Profile picture URL
- `created_at`, `updated_at`: Timestamps

**Relationships:**
- One-to-Many: `api_keys`, `folders`, `knowledge_items`, `conversations`

**Used By Enhanced RAG:**
- ✅ User identification in all queries
- ✅ Permissions and data isolation

---

### 2. api_keys

**Purpose:** API key authentication

```sql
CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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

-- Indexes
CREATE INDEX idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);
```

**Fields:**
- `key_hash`: Hashed API key (bcrypt)
- `key_prefix`: First 8 chars (for UI display)
- `is_active`: Enable/disable without deletion
- `expires_at`: Optional expiration
- `last_used_at`: Track usage

**Used By Enhanced RAG:**
- ✅ API authentication for programmatic access

---

### 3. folders

**Purpose:** Hierarchical organization of knowledge items

```sql
CREATE TABLE folders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    parent_id UUID REFERENCES folders(id) ON DELETE CASCADE,
    path TEXT NOT NULL,
    depth INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_folders_user_id ON folders(user_id);
CREATE INDEX idx_folders_parent_id ON folders(parent_id);
CREATE INDEX idx_folders_path ON folders(path);
```

**Fields:**
- `parent_id`: Hierarchical structure (NULL = root)
- `path`: Materialized path (e.g., "/sales/2024/q4")
- `depth`: Nesting level (0 = root)

**Used By Enhanced RAG:**
- ✅ **Hashtag resolution** (#sales → folder_id)
- ✅ **Retrieval scoping** (queries limited to specific folders)
- ✅ **Item counting** for intent classification

**Example Data:**
```sql
INSERT INTO folders (user_id, name, path, depth) VALUES
    ('user-123', 'sales', '/sales', 0),
    ('user-123', 'receipts', '/sales/receipts', 1),
    ('user-123', 'invoices', '/sales/invoices', 1);
```

---

### 4. knowledge_items ⭐ **CORE TABLE**

**Purpose:** Documents, files, and content uploaded by users

```sql
CREATE TABLE knowledge_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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

-- Indexes
CREATE INDEX idx_knowledge_items_user_id ON knowledge_items(user_id);
CREATE INDEX idx_knowledge_items_folder_id ON knowledge_items(folder_id);
CREATE INDEX idx_knowledge_items_processing_status ON knowledge_items(processing_status);
CREATE INDEX idx_knowledge_items_user_processing ON knowledge_items(user_id, processing_status);
```

**Fields:**

| Field | Type | Description | Enhanced RAG Usage |
|-------|------|-------------|-------------------|
| `id` | UUID | Primary key | Item identification |
| `user_id` | UUID | Owner | Permissions |
| `folder_id` | UUID | Organization | **Hashtag filtering** |
| `title` | TEXT | Display name | Search context |
| `content` | TEXT | Full text or reference | **RAG context** |
| `content_type` | TEXT | pdf, text, image, etc. | Format handling |
| `source_url` | TEXT | Original URL if web | Citations |
| `processing_status` | TEXT | pending/processing/completed/failed | **Filter processed items** |
| `is_chunked` | BOOLEAN | Whether split into chunks | **Map-reduce routing** |
| `total_chunks` | INTEGER | Number of chunks | Batch sizing |
| `metadata` | JSONB | Custom fields | Extensibility |

**Processing Status Values:**
- `pending`: Uploaded, not yet processed
- `processing`: Currently being chunked/embedded
- `completed`: Ready for search
- `failed`: Processing error
- `partial`: Some chunks failed

**Content Type Values:**
- `text`, `pdf`, `document`, `image`, `presentation`, `spreadsheet`, `file`

**Used By Enhanced RAG:**
- ✅ **Folder filtering** (hashtag queries)
- ✅ **Item fetching** for map-reduce
- ✅ **Status filtering** (only search completed items)
- ✅ **Chunk counting** for batch sizing

**Example Data:**
```sql
INSERT INTO knowledge_items (user_id, folder_id, title, content, content_type, processing_status, is_chunked, total_chunks) VALUES
    ('user-123', 'folder-sales', 'Q4 Report', 'Full report text...', 'pdf', 'completed', true, 15),
    ('user-123', 'folder-receipts', 'Receipt #12345', 'Amount: $1,299.00...', 'text', 'completed', true, 1);
```

---

### 5. vectors ⭐ **MOST CRITICAL TABLE**

**Purpose:** Embedding vectors for semantic search

```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE vectors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    knowledge_item_id UUID NOT NULL REFERENCES knowledge_items(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL DEFAULT 0,
    embedding vector(1536),  -- pgvector type
    content_preview TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_vectors_knowledge_item_id ON vectors(knowledge_item_id);
CREATE INDEX idx_vectors_chunk_index ON vectors(chunk_index);

-- ⭐ CRITICAL: HNSW index for fast vector search
CREATE INDEX idx_vectors_embedding ON vectors
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
```

**Fields:**

| Field | Type | Description | Enhanced RAG Usage |
|-------|------|-------------|-------------------|
| `knowledge_item_id` | UUID | Parent document | Group chunks |
| `chunk_index` | INTEGER | Order in document | Reconstruct context |
| `embedding` | vector(1536) | 1536-dim embedding | **Semantic search** |
| `content_preview` | TEXT | Chunk text | **RAG context** |

**Vector Dimensions:**
- OpenAI text-embedding-3-large (current default): 1536 dimensions requested (supports 3072 with schema update)
- OpenAI text-embedding-3-small: 1536 (default) or 512

**HNSW Index Parameters:**
- `m = 16`: Max connections per layer (higher = more accurate, slower builds)
- `ef_construction = 64`: Build-time search depth (higher = better index quality)
- `vector_cosine_ops`: Use cosine similarity (1 - cosine distance)

**Used By Enhanced RAG:**
- ✅ **Semantic search** (core retrieval mechanism)
- ✅ **Hybrid search** (combined with BM25)
- ✅ **Multi-query search** (query variations)
- ✅ **Full-folder retrieval** (retrieve ALL vectors)

**Query Performance:**
```sql
-- Typical semantic search query (< 50ms for 100K vectors)
SELECT
    v.id,
    v.content_preview,
    ki.title,
    1 - (v.embedding <=> '[query_embedding]'::vector) AS similarity
FROM vectors v
JOIN knowledge_items ki ON v.knowledge_item_id = ki.id
WHERE ki.user_id = 'user-123'
  AND ki.processing_status = 'completed'
ORDER BY v.embedding <=> '[query_embedding]'::vector
LIMIT 10;
```

---

### 6. conversations

**Purpose:** Chat threads/sessions

```sql
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_conversations_user_id ON conversations(user_id);
```

**Fields:**
- `title`: Auto-generated or user-set conversation name
- Examples: "Q4 Sales Analysis", "Product Questions"

**Used By Enhanced RAG:**
- ✅ Thread organization for chat history
- ✅ Context retention across messages

---

### 7. messages

**Purpose:** Individual chat messages in conversations

```sql
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL,  -- 'user' or 'assistant'
    content TEXT NOT NULL,
    metadata JSONB,
    job_id UUID REFERENCES processing_jobs(id),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_user_id ON messages(user_id);
CREATE INDEX idx_messages_created_at ON messages(created_at);
```

**Fields:**

| Field | Type | Description | Enhanced RAG Usage |
|-------|------|-------------|-------------------|
| `role` | VARCHAR(20) | 'user' or 'assistant' | Message sender |
| `content` | TEXT | Message text | **Context for LLM** |
| `metadata` | JSONB | Sources, job info | **Citations, debugging** |
| `job_id` | UUID | Link to async job | Track background processing |

**Metadata Structure (Assistant Messages):**
```json
{
  "sources": [
    {
      "id": "item-uuid",
      "title": "Order #12345",
      "similarity": 0.89,
      "excerpt": "Amount: $1,299.00..."
    }
  ],
  "job_id": "job-uuid",
  "processing_mode": "iterative",
  "aggregation_details": {
    "total": 3847.50,
    "count": 52,
    "by_category": {...}
  }
}
```

**Used By Enhanced RAG:**
- ✅ **Conversation history** (multi-turn context)
- ✅ **Source tracking** (what documents were used)
- ✅ **Job linking** (connect async results to messages)

---

### 8. processing_jobs ⭐ **ASYNC PROCESSING**

**Purpose:** Background jobs for long-running queries (map-reduce)

```sql
CREATE TABLE processing_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,

    -- Job details
    job_type TEXT NOT NULL,
    status TEXT DEFAULT 'queued',
    user_query TEXT NOT NULL,
    intent_data JSONB NOT NULL,

    -- Progress tracking
    progress REAL DEFAULT 0.0,
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
    actual_duration_seconds REAL,

    processing_metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_processing_jobs_user_status ON processing_jobs(user_id, status);
CREATE INDEX idx_processing_jobs_conversation ON processing_jobs(conversation_id);
CREATE INDEX idx_processing_jobs_status ON processing_jobs(status);
CREATE INDEX idx_processing_jobs_created_at ON processing_jobs(created_at);
```

**Job Types:**
- `aggregation`: "total amount of all orders"
- `full_folder_summary`: "summarize #folder"
- `filtered_aggregation`: "total in december"

**Status Values:**
- `queued`: Created, waiting to start
- `processing`: Currently running
- `completed`: Successfully finished
- `failed`: Error occurred
- `cancelled`: User cancelled

**Current Phase Values:**
- `queued` → `initialization` → `map` → `reduce` → `synthesis` → `complete`

**Intent Data Structure:**
```json
{
  "intent_type": "filtered_aggregation",
  "confidence": 0.9,
  "retrieval_strategy": "filtered_full",
  "requires_full_scan": true,
  "extraction_schema": {
    "extract_numbers": true,
    "extract_dates": true,
    "fields": ["amount", "date"]
  },
  "filter_criteria": {
    "semantic_filter": "december",
    "date_range": {"start": "2024-12-01", "end": "2024-12-31"}
  }
}
```

**Result Structure:**
```json
{
  "response": "I found 52 orders from December...",
  "sources": [
    {"id": "item-1", "title": "Order #12345", ...}
  ],
  "context_count": 52
}
```

**Aggregation Details Structure:**
```json
{
  "summary": {
    "total": 3847.50,
    "count": 52,
    "average": 73.99,
    "by_category": {...},
    "by_month": {...}
  },
  "processing_info": {
    "total_items_in_folder": 150,
    "items_processed": 52,
    "items_skipped": 98,
    "batches_processed": 8,
    "strategy": "filtered_aggregation",
    "processing_mode": "iterative"
  },
  "confidence": 0.98
}
```

**Intermediate Results (for debugging/resume):**
```json
{
  "map_results": [
    {
      "batch_index": 0,
      "relevant": true,
      "extracted_data": [...],
      "summary": "Batch contains 10 orders..."
    },
    ...
  ]
}
```

**Used By Enhanced RAG:**
- ✅ **Async query tracking** (jobs > 5 seconds)
- ✅ **Progress updates** for UI
- ✅ **Result storage** for completed jobs
- ✅ **Error tracking** for failed jobs
- ✅ **Processing mode** (parallel vs iterative)

**Monitoring Query:**
```sql
-- Active jobs
SELECT
    id,
    user_query,
    status,
    current_phase,
    progress,
    processed_batches || '/' || total_batches AS batches,
    EXTRACT(EPOCH FROM (NOW() - started_at)) AS duration_seconds
FROM processing_jobs
WHERE status IN ('queued', 'processing')
ORDER BY started_at DESC;
```

---

## Required PostgreSQL Extensions

### pgvector

**Purpose:** Vector similarity search

```sql
-- Install extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Verify installation
SELECT * FROM pg_extension WHERE extname = 'vector';

-- Check version
SELECT vector_version();
```

**Installation (if not present):**

```bash
# Ubuntu/Debian
sudo apt-get install postgresql-15-pgvector

# macOS (Homebrew)
brew install pgvector

# From source
git clone https://github.com/pgvector/pgvector.git
cd pgvector
make
sudo make install
```

**Cloud Providers:**
- ✅ **Supabase**: Pre-installed
- ✅ **Google Cloud SQL**: Available as extension
- ✅ **AWS RDS**: Available in PostgreSQL 15+
- ✅ **Azure**: Available in Flexible Server

---

## Index Strategy

### Performance-Critical Indexes

**Already Created (✅):**
```sql
-- Vectors table (MOST CRITICAL)
CREATE INDEX idx_vectors_embedding ON vectors
USING hnsw (embedding vector_cosine_ops);

-- Knowledge items
CREATE INDEX idx_knowledge_items_user_processing
ON knowledge_items(user_id, processing_status);

CREATE INDEX idx_knowledge_items_folder_id
ON knowledge_items(folder_id);

-- Messages
CREATE INDEX idx_messages_conversation_id
ON messages(conversation_id);

-- Processing jobs
CREATE INDEX idx_processing_jobs_user_status
ON processing_jobs(user_id, status);
```

### Optional Performance Indexes

**Consider adding if dataset grows >100K items:**

```sql
-- Full-text search on titles (GIN index)
CREATE INDEX idx_knowledge_items_title_fts
ON knowledge_items
USING gin(to_tsvector('english', title));

-- Content preview search
CREATE INDEX idx_vectors_content_fts
ON vectors
USING gin(to_tsvector('english', content_preview));

-- Date range queries
CREATE INDEX idx_knowledge_items_created_at
ON knowledge_items(created_at DESC);

-- Folder path queries (for hierarchical searches)
CREATE INDEX idx_folders_path_trgm
ON folders
USING gin(path gin_trgm_ops);
```

---

## Database Verification

### Check All Tables Exist

```sql
SELECT
    table_name,
    table_type
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'profiles',
    'api_keys',
    'folders',
    'knowledge_items',
    'vectors',
    'conversations',
    'messages',
    'processing_jobs'
  )
ORDER BY table_name;
```

**Expected Output:**
```
table_name         | table_type
-------------------+------------
api_keys           | BASE TABLE
conversations      | BASE TABLE
folders            | BASE TABLE
knowledge_items    | BASE TABLE
messages           | BASE TABLE
processing_jobs    | BASE TABLE
profiles           | BASE TABLE
vectors            | BASE TABLE
```

### Check pgvector Extension

```sql
SELECT * FROM pg_extension WHERE extname = 'vector';
```

**Expected Output:**
```
extname | extversion | extrelocatable | extnamespace
--------+------------+----------------+-------------
vector  | 0.5.1      | t              | 2200
```

### Verify Vector Index

```sql
SELECT
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'vectors'
  AND indexname = 'idx_vectors_embedding';
```

**Expected Output:**
```
indexname              | indexdef
-----------------------+--------------------------------------------------
idx_vectors_embedding  | CREATE INDEX idx_vectors_embedding ON vectors...
```

### Check Table Sizes

```sql
SELECT
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
    pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) AS table_size,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) AS index_size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

**Typical Output (1K documents):**
```
tablename          | size     | table_size | index_size
-------------------+----------+------------+-----------
vectors            | 120 MB   | 60 MB      | 60 MB
knowledge_items    | 25 MB    | 20 MB      | 5 MB
messages           | 10 MB    | 8 MB       | 2 MB
processing_jobs    | 5 MB     | 4 MB       | 1 MB
folders            | 1 MB     | 800 KB     | 200 KB
conversations      | 500 KB   | 400 KB     | 100 KB
profiles           | 200 KB   | 150 KB     | 50 KB
api_keys           | 100 KB   | 80 KB      | 20 KB
```

---

## Migration Status

### ✅ No Migrations Required

All tables needed for the enhanced RAG system **already exist** in your database schema. The following features work with the existing schema:

- ✅ Dynamic retrieval strategies (top_k, full_folder, filtered_full)
- ✅ Query enhancement (in-memory cache, no DB)
- ✅ Multi-query search with RRF (uses existing vectors table)
- ✅ Iterative map-reduce (uses existing processing_jobs table)
- ✅ Context passing between batches (stored in processing_jobs.intermediate_results)

### Fields That Support New Features

**processing_jobs.intent_data (JSONB):**
- Now stores `retrieval_strategy` field
- Already flexible, no schema change needed

**processing_jobs.intermediate_results (JSONB):**
- Now stores map phase results for iterative processing
- Already flexible, no schema change needed

**processing_jobs.aggregation_details (JSONB):**
- Now includes `processing_mode` field
- Already flexible, no schema change needed

---

## Optional Future Enhancements

### Query Cache Table (Optional)

For persistent query enhancement caching (currently in-memory):

```sql
CREATE TABLE query_cache (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(user_id) ON DELETE CASCADE,
    original_query TEXT NOT NULL,
    enhanced_query TEXT NOT NULL,
    variations JSONB NOT NULL,
    extracted_dates JSONB,
    extracted_numbers JSONB,
    keywords JSONB,
    cache_hits INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    last_accessed_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP
);

CREATE INDEX idx_query_cache_user_query ON query_cache(user_id, MD5(original_query));
CREATE INDEX idx_query_cache_expires ON query_cache(expires_at);

-- Auto-cleanup expired entries
CREATE OR REPLACE FUNCTION cleanup_expired_query_cache()
RETURNS void AS $$
BEGIN
    DELETE FROM query_cache WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;
```

### Analytics Table (Optional)

For tracking query patterns and performance:

```sql
CREATE TABLE query_analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(user_id),
    query_text TEXT NOT NULL,
    intent_type TEXT,
    retrieval_strategy TEXT,
    processing_mode TEXT,
    items_processed INTEGER,
    duration_ms INTEGER,
    result_count INTEGER,
    cache_hit BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_query_analytics_user_created ON query_analytics(user_id, created_at);
CREATE INDEX idx_query_analytics_intent ON query_analytics(intent_type, retrieval_strategy);
```

---

## Backup & Maintenance

### Recommended Backup Strategy

```bash
# Full database backup
pg_dump -h localhost -U postgres synapse > synapse_backup_$(date +%Y%m%d).sql

# Backup critical tables only
pg_dump -h localhost -U postgres synapse \
  -t profiles \
  -t knowledge_items \
  -t vectors \
  -t folders \
  > synapse_critical_$(date +%Y%m%d).sql

# Backup with compression
pg_dump -h localhost -U postgres synapse | gzip > synapse_backup_$(date +%Y%m%d).sql.gz
```

### Vacuum & Analyze

```sql
-- Analyze for query optimization (run weekly)
ANALYZE VERBOSE;

-- Vacuum to reclaim space (run monthly)
VACUUM (VERBOSE, ANALYZE);

-- Specific high-churn tables
VACUUM ANALYZE vectors;
VACUUM ANALYZE messages;
VACUUM ANALYZE processing_jobs;
```

### Rebuild Vector Index (if degraded)

```sql
-- Drop and recreate HNSW index
DROP INDEX IF EXISTS idx_vectors_embedding;

CREATE INDEX idx_vectors_embedding ON vectors
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Monitor build progress
SELECT
    phase,
    blocks_done,
    blocks_total,
    tuples_done,
    tuples_total
FROM pg_stat_progress_create_index
WHERE relid = 'vectors'::regclass;
```

---

## Troubleshooting

### Vector Search is Slow

```sql
-- Check if HNSW index exists
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'vectors' AND indexname LIKE '%embedding%';

-- If missing, create it
CREATE INDEX idx_vectors_embedding ON vectors
USING hnsw (embedding vector_cosine_ops);

-- Check index usage
SELECT
    schemaname,
    tablename,
    indexname,
    idx_scan,
    idx_tup_read,
    idx_tup_fetch
FROM pg_stat_user_indexes
WHERE tablename = 'vectors';
```

### Disk Space Issues

```sql
-- Find largest tables
SELECT
    tablename,
    pg_size_pretty(pg_total_relation_size('public.'||tablename)) AS total_size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size('public.'||tablename) DESC
LIMIT 10;

-- Clean up old processing jobs
DELETE FROM processing_jobs
WHERE status IN ('completed', 'failed')
  AND completed_at < NOW() - INTERVAL '30 days';

-- Clean up orphaned vectors (if any)
DELETE FROM vectors v
WHERE NOT EXISTS (
    SELECT 1 FROM knowledge_items ki WHERE ki.id = v.knowledge_item_id
);
```

### Connection Pooling

```python
# config.py
DATABASE_POOL_SIZE = 20  # Max connections
DATABASE_POOL_OVERFLOW = 10  # Extra connections when needed
DATABASE_POOL_TIMEOUT = 30  # Seconds to wait for connection
```

---

## Summary

### ✅ Tables Required: **8 (All Exist)**
1. profiles
2. api_keys
3. folders
4. knowledge_items
5. vectors ⭐
6. conversations
7. messages
8. processing_jobs ⭐

### ✅ Extensions Required: **1 (pgvector)**

### ✅ Migrations Required: **0 (None)**

### ✅ New Features Supported:
- Dynamic retrieval strategies
- Query enhancement
- Multi-query search
- Iterative map-reduce
- Context accumulation

### 📊 Storage Planning:
- 1,000 docs ≈ 200-500 MB
- 10,000 docs ≈ 2-5 GB
- 100,000 docs ≈ 20-50 GB

**Your database is ready for the enhanced RAG system!** 🎉

---

**Last Updated:** October 5, 2025
**Schema Version:** 2.0
**Status:** Production Ready ✅
