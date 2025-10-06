# User Feedback Implementation Plan

**Date:** 2025-10-06
**Priority:** Critical - User Experience Issues
**Source:** issues.txt user feedback analysis

---

## Executive Summary

This plan addresses **10 critical user experience issues** reported in the feedback. Analysis reveals four main problem areas:
1. **Broken functionality** (text notes, folder access)
2. **Performance bottlenecks** (sequential chunk processing, no progress tracking)
3. **Missing features** (file moving, conversation context, smart references)
4. **Poor RAG quality** (search accuracy, response relevance, folder isolation)

**Estimated Timeline:** 2-3 weeks
**Impact:** High - These issues are blocking core user workflows

**Related Documents:**
- [PARALLEL_PROCESSING_SOLUTION.md](./PARALLEL_PROCESSING_SOLUTION.md) - Detailed parallel processing implementation

---

## Table of Contents

1. [Issue Analysis](#1-issue-analysis)
2. [Technical Root Causes](#2-technical-root-causes)
3. [Implementation Plan by Priority](#3-implementation-plan-by-priority)
4. [Detailed Solutions](#4-detailed-solutions)
5. [Testing Strategy](#5-testing-strategy)
6. [Success Metrics](#6-success-metrics)

---

## 1. Issue Analysis

### Issue Categorization

| # | Issue (Original) | Issue (Translated) | Category | Priority | Severity |
|---|------------------|-------------------|----------|----------|----------|
| 1 | Store context from conversations option to be given | Need conversation history/context storage | Feature Request | P1 | High |
| 2 | Text note not working | Text note creation failing | Bug | P0 | Critical |
| 3 | Moving files from one folder to another should be possible | No file move functionality | Feature Request | P1 | High |
| 4 | Easily picking up file names from folders even though entire file name is not mentioned | Fuzzy file name matching needed | Enhancement | P2 | Medium |
| 5 | File picking also to be made easy through # or any other function similar to folder picking | Need #filename references (like @folder) | Feature Request | P1 | High |
| 6 | Every response the tool goes and searches, is it required? It should smartly choose for search or else respond using LLM | Over-searching, need smarter routing | Performance | P0 | Critical |
| 7 | Responses are not satisfactory | Poor answer quality | Quality Issue | P0 | Critical |
| 8 | kahi pdfs hotayt access kahi nahi hotet (Marathi) | "Some PDFs accessible, some not" | Bug | P0 | Critical |
| 9 | ata khup subpar responses ahet ani access karatach naie te folders madhli info (Marathi) | "Very subpar responses and can't access folder info" | Bug/Quality | P0 | Critical |
| 10 | Large documents take hours to process; no progress tracking; no "still processing" message in chat | Sequential chunk processing bottleneck + missing progress UI | Performance/UX | P0 | Critical |

### Priority Breakdown

**P0 - Critical (Fix Immediately):** 6 issues
- Text notes broken
- Inconsistent PDF access
- Poor response quality
- Folder info not accessible
- Over-searching on every query
- Sequential chunk processing (hours for large files) + no progress tracking

**P1 - High (This Week):** 3 issues
- Conversation context storage
- File moving
- #filename references

**P2 - Medium (Next Week):** 1 issue
- Fuzzy filename matching

---

## 2. Technical Root Causes

### Root Cause Analysis

#### **RC-1: Text Note Creation Failure**
**Symptoms:** Issue #2 - Users can't create text notes

**Investigation:**
- Endpoint exists: `POST /api/v1/content/`
- Frontend calls `apiClient.createContent()`
- Backend creates item successfully
- **Suspected Issue:** Background processing may be failing silently

**Hypothesis:**
```python
# Line 44-50 in content.py
try:
    from app.api.v1.endpoints.files import process_knowledge_item_background
    background_tasks.add_task(process_knowledge_item_background, knowledge_item.id)
except Exception as e:
    logger.error(f"Failed to add background task: {e}")
    # Continues without background processing
```
The error is swallowed! User gets success response but processing fails.

---

#### **RC-2: Inconsistent PDF/Folder Access**
**Symptoms:** Issues #8, #9 - Some PDFs work, some don't; folder info not accessible

**Investigation:**
```python
# Current flow:
1. User uploads PDF → stored in GCS
2. Processing extracts text → creates embeddings
3. Search queries folder → returns results

# Failure points:
- Processing status = "failed" → item not searchable
- Embedding generation fails → no vectors
- Folder ID mismatch → wrong scope
```

**Root Cause:**
1. **Processing failures are silent** - Items show as "uploaded" but aren't searchable
2. **No retry logic** - Failed processing stays failed forever
3. **Folder isolation bug** - Search may not respect folder boundaries correctly

---

#### **RC-3: Over-Searching & Poor Quality**
**Symptoms:** Issues #6, #7, #9 - Always searches, poor responses, can't access context

**Investigation:**
```python
# chat_service.py lines 96-133
intent_data = await intent_classifier.classify_intent(...)

if intent_data["requires_async"]:
    # Map-reduce for large queries
else:
    # Quick query with RAG
```

**Root Causes:**
1. **Intent classifier may be over-triggering search** - Even simple questions trigger RAG
2. **Search results may be poor quality** - Irrelevant chunks returned
3. **No fallback to LLM-only mode** - Should answer from general knowledge when appropriate
4. **Folder context not passed correctly** - "Can't access folder info" suggests scoping issue

---

#### **RC-4: Sequential Chunk Processing Bottleneck**
**Symptoms:** Issue #10 - Large documents take hours to process, no progress visibility, chat doesn't show processing status

**Investigation:**
```python
# Current implementation in processing_service.py (lines 601-611)
async def _generate_and_store_embeddings(self, item: KnowledgeItem, chunks, db):
    for i, chunk in enumerate(chunks):
        # SEQUENTIAL: Each chunk waits for previous one
        embedding = await embedding_service.generate_embedding(chunk)
        # 400ms per chunk × 180 chunks = 72+ seconds

# Problem: 180 chunks × 400ms each = 1.2 minutes minimum
# Reality: Network variability → 2-5 minutes for medium documents
# Large documents (50+ pages) → 10-30 minutes
```

**Root Causes:**
1. **No parallelization** - Chunks processed one at a time
2. **Batch API exists but unused** - `generate_embeddings_batch()` is available but not used
3. **No progress tracking** - Database has no columns for chunks_processed/chunks_total
4. **No UI feedback** - Users don't know processing is happening
5. **Chat doesn't check status** - Queries unprocessed files without warning

**Performance Impact:**
- **Current:** 50-page PDF = 180 chunks × 400ms = 72+ seconds (sequential)
- **With Batching:** 180 chunks ÷ 10 per batch × 400ms = 7.2 seconds (10x faster)
- **Real-world improvement:** 2-3 minutes → 10-15 seconds for typical documents

**User Experience Impact:**
- Users upload files and wait indefinitely with no feedback
- No way to know if processing succeeded or failed
- Chat queries fail silently on unprocessed files
- Large documents become unusable (hours to process)

---

#### **RC-5: Missing Core Features**
**Symptoms:** Issues #1, #3, #5 - No conversation context, can't move files, no #file references

**Current State:**
```python
# Conversation exists but not used:
- Messages stored in DB ✅
- Conversation history NOT passed to LLM ❌
- No context window management ❌

# File operations limited:
- Upload ✅
- Download ✅
- Delete ✅
- Move ❌
- Copy ❌

# References:
- @folder (hashtags) works ✅
- #filename references DON'T exist ❌
```

---

## 3. Implementation Plan by Priority

### Phase 1: Critical Fixes (Week 1 - Days 1-3)

#### **P0-1: Fix Text Note Processing**
**Issue:** #2 - Text notes not working
**Time:** 4 hours

**Tasks:**
1. Add proper error handling to background task creation
2. Return processing errors to user (don't swallow exceptions)
3. Add retry logic for failed processing
4. Show processing status in UI

**Implementation:**
```python
# content.py - Better error handling
try:
    background_tasks.add_task(process_knowledge_item_background, knowledge_item.id)
    logger.info(f"Added background processing task for {knowledge_item.id}")
except Exception as e:
    logger.error(f"Failed to add background task: {e}", exc_info=True)
    # Mark item as failed
    knowledge_item.processing_status = "failed"
    await db.commit()
    raise HTTPException(
        status_code=500,
        detail=f"Item created but processing failed: {str(e)}"
    )
```

---

#### **P0-2: Fix PDF/Folder Access Issues**
**Issues:** #8, #9 - Inconsistent access, folder info not available
**Time:** 8 hours

**Tasks:**
1. **Debug folder scoping in search:**
   - Verify folder_ids are passed correctly
   - Check SQL query WHERE clauses
   - Test folder isolation

2. **Add processing diagnostics:**
   - Show processing errors to user
   - Add "Reprocess" button for failed items
   - Log extraction failures clearly

3. **Implement retry logic:**
   - Auto-retry failed processing (3 attempts)
   - Exponential backoff
   - Clear error messages

**Implementation:**
```python
# search_service.py - Better folder filtering
async def search_in_folders(
    self,
    query: str,
    folder_ids: List[UUID],
    user_id: UUID,
    top_k: int = 10
) -> List[Dict]:
    # CRITICAL: Ensure folder filter is applied
    filters = {
        "user_id": user_id,
        "folder_id": {"$in": folder_ids}  # Must be enforced!
    }

    # Add debug logging
    logger.info(f"Searching in folders: {folder_ids} for user: {user_id}")

    results = await self._vector_search(query, filters, top_k)

    # Verify results are from correct folders
    for result in results:
        if result["folder_id"] not in folder_ids:
            logger.error(f"FOLDER LEAK: Got result from {result['folder_id']}, expected {folder_ids}")

    return results
```

---

#### **P0-3: Smart Search vs LLM Routing**
**Issues:** #6, #7 - Over-searching, poor quality
**Time:** 12 hours

**Current Problem:**
```python
# ALWAYS searches, even for:
- "Hello" → Searches (unnecessary)
- "What is Python?" → Searches (should use LLM knowledge)
- "Tell me about the Q3 report in #finance" → Searches (correct)
```

**Solution: Intent-Based Routing**

**Tasks:**
1. Enhance intent classifier with "NO_SEARCH_NEEDED" intent
2. Add confidence scoring
3. Fallback to LLM when search returns poor results
4. Add user preference: "Search my knowledge" vs "Use general knowledge"

**Implementation:**
```python
# intent_service.py - Enhanced classification
class IntentType(Enum):
    GENERAL_KNOWLEDGE = "general_knowledge"  # NEW: Don't search
    SIMPLE_QUESTION = "simple_question"       # NEW: LLM only
    KNOWLEDGE_LOOKUP = "knowledge_lookup"     # Search required
    ANALYTICAL = "analytical"                  # Map-reduce

async def classify_intent(self, user_query: str, folder_ids: List[UUID] = None):
    # Check for indicators
    no_search_indicators = [
        "hello", "hi", "thanks", "what is", "who is", "define",
        "how to" (without context), "explain" (general topic)
    ]

    search_required_indicators = [
        "@folder", "#", "in my", "from the", "according to",
        "summarize", "find", "show me", specific names/dates
    ]

    # If NO folders specified AND query is general → NO_SEARCH_NEEDED
    if not folder_ids and any(phrase in user_query.lower() for phrase in no_search_indicators):
        return {
            "intent_type": IntentType.GENERAL_KNOWLEDGE,
            "requires_search": False,
            "confidence": 0.9
        }

    # If folders specified → ALWAYS search (user explicitly scoped)
    if folder_ids:
        return {
            "intent_type": IntentType.KNOWLEDGE_LOOKUP,
            "requires_search": True,
            "folder_ids": folder_ids,
            "confidence": 0.95
        }

    # Default: search if contains keywords
    return await self._llm_based_classification(user_query)
```

---

#### **P0-4: Parallel Chunk Processing + Progress Tracking**
**Issue:** #10 - Large documents take hours to process with no feedback
**Time:** 10 hours
**Reference:** See [PARALLEL_PROCESSING_SOLUTION.md](./PARALLEL_PROCESSING_SOLUTION.md) for complete implementation details

**Tasks:**
1. **Enable parallel batch processing (4 hours)**
   - Refactor `_generate_and_store_embeddings()` to use batch API
   - Process chunks in parallel batches of 10
   - Implement error handling for batch failures

2. **Add progress tracking (3 hours)**
   - Add database columns: `chunks_processed`, `chunks_total`, `processing_progress`, `estimated_completion`
   - Update progress after each batch
   - Calculate ETA based on processing speed

3. **Build progress UI (2 hours)**
   - Create `ProcessingProgressIndicator` component
   - Show progress bar with percentage
   - Display ETA and chunks processed/total
   - Add real-time polling for updates

4. **Add chat status checking (1 hour)**
   - Check if referenced files are still processing
   - Return "still processing" message instead of empty results
   - Show progress in chat response

**Implementation (Core Change):**
```python
# processing_service.py - Updated method
async def _generate_and_store_embeddings(
    self,
    item: KnowledgeItem,
    chunks: List[str],
    db: AsyncSession
) -> int:
    """Generate embeddings for chunks in PARALLEL batches."""

    batch_size = 10  # Process 10 chunks simultaneously
    total_chunks = len(chunks)
    processed_count = 0

    # Initialize progress tracking
    item.chunks_total = total_chunks
    item.chunks_processed = 0
    item.processing_progress = 0.0
    await db.commit()

    start_time = time.time()

    # Process in parallel batches
    for i in range(0, len(chunks), batch_size):
        batch = chunks[i:i + batch_size]

        try:
            # PARALLEL: Use batch API (10x faster)
            embeddings = await self.embedding_service.generate_embeddings_batch(
                texts=batch,
                batch_size=batch_size
            )

            # Store all embeddings in this batch
            for j, embedding in enumerate(embeddings):
                chunk_index = i + j
                chunk_vector = ChunkVector(
                    knowledge_item_id=item.id,
                    chunk_index=chunk_index,
                    chunk_text=chunks[chunk_index],
                    embedding=embedding,
                    user_id=item.user_id,
                    folder_id=item.folder_id
                )
                db.add(chunk_vector)

            # Update progress
            processed_count += len(batch)
            progress = (processed_count / total_chunks) * 100

            # Calculate ETA
            elapsed = time.time() - start_time
            avg_time_per_chunk = elapsed / processed_count
            remaining_chunks = total_chunks - processed_count
            eta_seconds = avg_time_per_chunk * remaining_chunks

            item.chunks_processed = processed_count
            item.processing_progress = progress
            item.estimated_completion = datetime.utcnow() + timedelta(seconds=eta_seconds)

            await db.commit()

            logger.info(
                f"Batch {i//batch_size + 1}/{(total_chunks + batch_size - 1)//batch_size} "
                f"processed: {processed_count}/{total_chunks} chunks ({progress:.1f}%)"
            )

        except Exception as e:
            logger.error(f"Batch processing failed at chunk {i}: {e}")
            # Continue with next batch instead of failing completely
            continue

    return processed_count
```

**Database Migration:**
```sql
-- Add progress tracking columns
ALTER TABLE knowledge_items
ADD COLUMN chunks_processed INTEGER DEFAULT 0,
ADD COLUMN chunks_total INTEGER DEFAULT 0,
ADD COLUMN processing_progress FLOAT DEFAULT 0.0,
ADD COLUMN estimated_completion TIMESTAMP;

-- Create index for quick status lookups
CREATE INDEX idx_knowledge_items_processing
ON knowledge_items(processing_status, chunks_processed, chunks_total);
```

**Chat Integration:**
```python
# chat_service.py - Check processing status before search
async def _check_item_processing_status(
    self,
    db: AsyncSession,
    item_ids: List[UUID]
) -> Dict[UUID, Dict]:
    """Check if items are still processing."""

    stmt = select(KnowledgeItem).where(KnowledgeItem.id.in_(item_ids))
    result = await db.execute(stmt)
    items = result.scalars().all()

    status_map = {}
    for item in items:
        if item.processing_status in ["queued", "processing"]:
            status_map[item.id] = {
                "is_processing": True,
                "progress": item.processing_progress,
                "chunks_processed": item.chunks_processed,
                "chunks_total": item.chunks_total,
                "eta": item.estimated_completion
            }

    return status_map

# In chat() method:
if folder_ids:
    # Get items in these folders
    items = await self._get_items_in_folders(db, folder_ids, user_id)

    # Check if any are still processing
    processing_status = await self._check_item_processing_status(db, [i.id for i in items])

    if processing_status:
        # Build helpful message
        processing_items = [
            f"- {item.title}: {status['progress']:.1f}% complete "
            f"({status['chunks_processed']}/{status['chunks_total']} chunks)"
            for item_id, status in processing_status.items()
            for item in items if item.id == item_id
        ]

        return {
            "response": (
                "Some files are still being processed:\n\n" +
                "\n".join(processing_items) +
                "\n\nI'll search the files that are ready, but results may be incomplete."
            ),
            "processing_warning": True
        }
```

**Expected Results:**
- ✅ **10-15x faster processing** - 50-page PDF: 2-3 min → 10-15 sec
- ✅ **Real-time progress** - Users see "Processing: 45/180 chunks (25%)"
- ✅ **Accurate ETAs** - "Estimated completion: 2 minutes"
- ✅ **Better UX in chat** - "Document still processing (80% complete)"

---

### Phase 2: High-Priority Features (Week 1 - Days 4-5)

#### **P1-1: Conversation Context Storage**
**Issue:** #1 - Need to store/retrieve conversation history
**Time:** 6 hours

**Current State:**
- Conversations stored ✅
- Messages stored ✅
- Context NOT passed to LLM ❌

**Tasks:**
1. Retrieve last N messages from conversation
2. Format as context for LLM
3. Add context window management (token limits)
4. Add "New Chat" button to start fresh context

**Implementation:**
```python
# chat_service.py - Add context retrieval
async def _get_conversation_context(
    self,
    db: AsyncSession,
    conversation_id: UUID,
    max_messages: int = 10,
    max_tokens: int = 3000
) -> List[Dict[str, str]]:
    """Get recent conversation history for context."""

    stmt = select(Message).where(
        Message.conversation_id == conversation_id
    ).order_by(desc(Message.created_at)).limit(max_messages * 2)  # Get extra for token trimming

    result = await db.execute(stmt)
    messages = result.scalars().all()

    # Reverse to chronological order
    messages = list(reversed(messages))

    # Format for LLM
    context = []
    token_count = 0

    for msg in messages:
        msg_tokens = len(msg.content.split()) * 1.3  # Rough estimate
        if token_count + msg_tokens > max_tokens:
            break

        context.append({
            "role": msg.role,
            "content": msg.content
        })
        token_count += msg_tokens

    return context

# Usage in chat():
context_messages = await self._get_conversation_context(db, conversation.id)

llm_response = await ai_chat_service.chat(
    messages=[
        {"role": "system", "content": "You are a helpful assistant..."},
        *context_messages,  # Add conversation history
        {"role": "user", "content": chat_request.message}
    ],
    context=retrieved_docs
)
```

---

#### **P1-2: File Moving Between Folders**
**Issue:** #3 - Can't move files
**Time:** 4 hours

**Tasks:**
1. Add `PATCH /api/v1/content/{id}/move` endpoint
2. Update folder_id in database
3. Update UI with drag-and-drop
4. Add "Move to..." context menu

**Implementation:**
```python
# content.py - New endpoint
@router.patch("/{content_id}/move")
async def move_content(
    content_id: UUID,
    target_folder_id: UUID,
    db: AsyncSession = Depends(get_db),
    auth_data: dict = Depends(validate_any_auth)
):
    """Move knowledge item to different folder."""
    user_id = UUID(auth_data["user_id"])

    # Verify user owns both item and target folder
    item = await content_service.get_knowledge_item(db, user_id, content_id)
    if not item:
        raise HTTPException(404, "Item not found")

    # Verify target folder exists and is owned by user
    folder_stmt = select(Folder).where(
        Folder.id == target_folder_id,
        Folder.user_id == user_id
    )
    folder = await db.execute(folder_stmt)
    if not folder.scalar_one_or_none():
        raise HTTPException(404, "Target folder not found")

    # Update folder_id
    item.folder_id = target_folder_id
    await db.commit()

    return {"success": True, "new_folder_id": str(target_folder_id)}
```

---

#### **P1-3: #filename References**
**Issue:** #5 - Need #file references like @folder
**Time:** 6 hours

**Tasks:**
1. Extend hashtag parser to support #filename
2. Fuzzy match filenames in specified folders
3. Scope search to matched files only
4. Show autocomplete for filenames

**Implementation:**
```python
# search_service.py - Enhanced parsing
def parse_references_from_message(self, message: str) -> Dict:
    """
    Parse @folder and #file references.

    Examples:
        "@finance #Q3_report" → folder: finance, file: Q3_report
        "#budget show me" → file: budget
    """

    folder_pattern = r'@(\w+)'
    file_pattern = r'#([\w\-\.]+)'

    folders = re.findall(folder_pattern, message)
    files = re.findall(file_pattern, message)

    # Clean message
    cleaned = re.sub(folder_pattern, '', message)
    cleaned = re.sub(file_pattern, '', cleaned).strip()

    return {
        "folders": folders,
        "files": files,
        "cleaned_message": cleaned
    }

async def match_filenames(
    self,
    db: AsyncSession,
    file_references: List[str],
    folder_ids: List[UUID],
    user_id: UUID
) -> List[Dict]:
    """Fuzzy match file references to actual filenames."""

    matched_items = []

    for file_ref in file_references:
        # Search for files with similar names
        stmt = select(KnowledgeItem).where(
            KnowledgeItem.user_id == user_id,
            KnowledgeItem.folder_id.in_(folder_ids) if folder_ids else True,
            or_(
                KnowledgeItem.title.ilike(f"%{file_ref}%"),
                KnowledgeItem.item_metadata['original_filename'].astext.ilike(f"%{file_ref}%")
            )
        ).limit(5)

        result = await db.execute(stmt)
        items = result.scalars().all()

        for item in items:
            matched_items.append({
                "id": item.id,
                "title": item.title,
                "reference": file_ref,
                "match_score": self._calculate_similarity(file_ref, item.title)
            })

    # Sort by match score
    matched_items.sort(key=lambda x: x["match_score"], reverse=True)

    return matched_items
```

---

### Phase 3: Enhancements (Week 2)

#### **P2-1: Fuzzy Filename Matching**
**Issue:** #4 - Partial filename matching
**Time:** 4 hours

**Implementation:**
- Use `fuzzywuzzy` or `rapidfuzz` library
- Levenshtein distance for typo tolerance
- Partial ratio for substring matching

```python
from rapidfuzz import fuzz

def fuzzy_match_filename(query: str, filename: str) -> float:
    """
    Return match score 0-100.

    Examples:
        fuzzy_match("q3 report", "Q3_Financial_Report.pdf") → 85
        fuzzy_match("budget", "2024_Budget_Final.xlsx") → 75
    """
    # Normalize
    query = query.lower().replace('_', ' ').replace('-', ' ')
    filename = filename.lower().replace('_', ' ').replace('-', ' ')

    # Multiple matching strategies
    scores = [
        fuzz.ratio(query, filename),           # Exact similarity
        fuzz.partial_ratio(query, filename),   # Substring match
        fuzz.token_sort_ratio(query, filename) # Word order invariant
    ]

    return max(scores)
```

---

## 4. Detailed Solutions

### Solution 1: Processing Status Dashboard

**Problem:** Users don't know if their files are processed

**Solution:** Add processing status UI

```typescript
// Frontend: ProcessingStatusIndicator.tsx
interface ProcessingStatus {
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress?: number;
  error?: string;
}

function ProcessingStatusBadge({ item }: { item: KnowledgeItem }) {
  const { status, error } = item.processing_status;

  if (status === 'completed') {
    return <Badge variant="success">✓ Ready</Badge>;
  }

  if (status === 'failed') {
    return (
      <Tooltip content={error}>
        <Badge variant="destructive">
          ✗ Failed - Click to retry
        </Badge>
      </Tooltip>
    );
  }

  if (status === 'processing') {
    return <Badge variant="info">⟳ Processing...</Badge>;
  }

  return <Badge variant="secondary">⏳ Queued</Badge>;
}
```

---

### Solution 2: Smart Routing Flow

```
User Query
     ↓
Parse References (@folder, #file)
     ↓
Intent Classification
     ↓
     ├─→ GENERAL_KNOWLEDGE → Direct to LLM (no search)
     ├─→ SIMPLE_QUESTION → LLM with light context
     ├─→ KNOWLEDGE_LOOKUP → Search + RAG
     └─→ ANALYTICAL → Map-Reduce
     ↓
Generate Response
     ↓
Quality Check (is response relevant?)
     ↓
     ├─→ High quality → Return
     └─→ Low quality → Fallback to LLM-only
```

---

### Solution 3: Conversation Context Window

**Strategy:** Sliding window with token management

```python
MAX_CONTEXT_TOKENS = 3000
MAX_CONTEXT_MESSAGES = 10

def build_context_window(messages: List[Message]) -> List[Dict]:
    """
    Smart context window:
    1. Always include last message (user query)
    2. Include previous messages up to token limit
    3. Prioritize recent messages
    4. Summarize old messages if needed
    """

    context = []
    token_count = 0

    # Reverse chronological (newest first)
    for msg in reversed(messages[:-1]):  # Exclude current message
        msg_tokens = estimate_tokens(msg.content)

        if token_count + msg_tokens > MAX_CONTEXT_TOKENS:
            # Summarize remaining old messages
            if len(messages) - len(context) > 3:
                old_messages = messages[:-(len(context)+1)]
                summary = await summarize_messages(old_messages)
                context.insert(0, {
                    "role": "system",
                    "content": f"Previous conversation summary: {summary}"
                })
            break

        context.insert(0, {"role": msg.role, "content": msg.content})
        token_count += msg_tokens

    return context
```

---

## 5. Testing Strategy

### 5.1 Unit Tests

**Text Note Processing:**
```python
async def test_text_note_creation_success():
    """Test successful text note creation and processing."""
    response = await client.post(
        "/api/v1/content/",
        json={
            "folder_id": str(test_folder_id),
            "title": "Test Note",
            "content": "This is a test note.",
            "content_type": "text"
        },
        headers=auth_headers
    )
    assert response.status_code == 200

    item_id = response.json()["item"]["id"]

    # Wait for processing
    await asyncio.sleep(2)

    # Check status
    status = await client.get(f"/api/v1/files/status/{item_id}", headers=auth_headers)
    assert status.json()["processing_status"] == "completed"
    assert status.json()["is_searchable"] == True

async def test_text_note_processing_failure_handling():
    """Test that processing failures are reported to user."""
    # Inject failure in processing
    with mock.patch('processing_service.process_knowledge_item', side_effect=Exception("Test failure")):
        response = await client.post("/api/v1/content/", ...)

        # Should get error, not success
        assert response.status_code == 500
        assert "processing failed" in response.json()["detail"].lower()
```

**Parallel Processing:**
```python
async def test_parallel_batch_processing():
    """Test that chunks are processed in parallel batches."""
    # Upload document with 100 chunks
    upload_response = await client.post(
        "/api/v1/files/upload",
        files={"file": large_pdf_file},
        data={"folder_id": str(test_folder_id), "title": "Large Document"},
        headers=auth_headers
    )
    item_id = upload_response.json()["item"]["id"]

    # Wait for processing to start
    await asyncio.sleep(0.5)

    # Check progress is being tracked
    status = await client.get(f"/api/v1/files/status/{item_id}", headers=auth_headers)
    assert status.json()["chunks_total"] > 0
    assert status.json()["chunks_processed"] >= 0
    assert status.json()["processing_progress"] >= 0

    # Verify processing completes quickly (not sequential)
    start_time = time.time()
    while True:
        status = await client.get(f"/api/v1/files/status/{item_id}", headers=auth_headers)
        if status.json()["processing_status"] == "completed":
            break
        await asyncio.sleep(0.5)

    elapsed = time.time() - start_time

    # Should be significantly faster than sequential (100 chunks × 400ms = 40s sequential)
    # With batching: 10 batches × 400ms = 4s (10x speedup)
    assert elapsed < 10  # Allow some margin, but should be way under 40s

async def test_progress_tracking_accuracy():
    """Test that progress tracking is accurate."""
    upload_response = await client.post(
        "/api/v1/files/upload",
        files={"file": test_pdf_file},
        data={"folder_id": str(test_folder_id), "title": "Progress Test"},
        headers=auth_headers
    )
    item_id = upload_response.json()["item"]["id"]

    # Poll for progress updates
    progress_updates = []
    while len(progress_updates) < 5:  # Collect 5 progress updates
        await asyncio.sleep(0.5)
        status = await client.get(f"/api/v1/files/status/{item_id}", headers=auth_headers)
        if status.json()["processing_status"] == "processing":
            progress_updates.append({
                "chunks_processed": status.json()["chunks_processed"],
                "chunks_total": status.json()["chunks_total"],
                "progress": status.json()["processing_progress"]
            })

    # Verify progress is monotonically increasing
    for i in range(1, len(progress_updates)):
        assert progress_updates[i]["chunks_processed"] >= progress_updates[i-1]["chunks_processed"]
        assert progress_updates[i]["progress"] >= progress_updates[i-1]["progress"]

    # Verify final state
    final_status = await client.get(f"/api/v1/files/status/{item_id}", headers=auth_headers)
    assert final_status.json()["chunks_processed"] == final_status.json()["chunks_total"]
    assert final_status.json()["processing_progress"] == 100.0
```

---

### 5.2 Integration Tests

**Folder Access:**
```python
async def test_folder_isolation():
    """Ensure search respects folder boundaries."""

    # Create two folders with different content
    folder1 = await create_folder("Finance")
    folder2 = await create_folder("Engineering")

    await upload_file(folder1.id, "Q3_Report.pdf", "Finance data...")
    await upload_file(folder2.id, "Architecture.pdf", "System design...")

    # Search in Finance folder only
    response = await client.post(
        "/api/v1/chat",
        json={
            "message": "Tell me about Q3 @finance",
            "conversation_id": conv_id
        }
    )

    # Should only return Finance results
    sources = response.json()["sources"]
    assert all(s["folder_id"] == str(folder1.id) for s in sources)
    assert len([s for s in sources if "engineering" in s["title"].lower()]) == 0
```

---

### 5.3 User Acceptance Tests

**Test Cases:**

1. **Text Note Creation**
   - ✅ Create text note → Shows "Processing..." → Changes to "Ready"
   - ✅ Failed processing → Shows "Failed" with error → Retry button works

2. **File Moving**
   - ✅ Drag file to new folder → File moves
   - ✅ "Move to..." menu → File moves
   - ✅ Can't move to folder user doesn't own → Error shown

3. **Smart Search**
   - ✅ "Hello" → No search, direct LLM response
   - ✅ "What is Python?" → No search, LLM knowledge
   - ✅ "Summarize Q3 report @finance" → Searches finance folder
   - ✅ "Find #budget" → Searches for budget file

4. **Conversation Context**
   - ✅ Ask "What's in the report?" → Get answer
   - ✅ Ask "What was the main finding?" → Uses previous context
   - ✅ "New Chat" button → Clears context

5. **Parallel Processing & Progress Tracking**
   - ✅ Upload 50-page PDF → Progress bar appears showing 0%
   - ✅ Progress updates in real-time → "45/180 chunks (25%)"
   - ✅ ETA shown → "Estimated: 2 minutes remaining"
   - ✅ Processing completes in <15 seconds (not 2-3 minutes)
   - ✅ Query file during processing → "Still processing (80% complete)" message
   - ✅ Large 100-page document → Completes in <2 minutes (not hours)

---

## 6. Success Metrics

### Quantitative Metrics

| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| Text note success rate | Unknown | >95% | % of text notes that process successfully |
| PDF access consistency | ~60% (guessed) | >99% | % of uploaded PDFs that are searchable |
| Search precision | Unknown | >80% | % of search results that are relevant |
| Unnecessary searches | ~80% (guessed) | <20% | % of queries that trigger search unnecessarily |
| User satisfaction | Low | >4.0/5.0 | User feedback survey |
| Processing failure rate | Unknown | <2% | % of items that fail processing |
| Folder isolation accuracy | Unknown | 100% | % of searches that don't leak across folders |
| **Processing speed (50-page PDF)** | **2-3 min** | **<15 sec** | **Time from upload to searchable** |
| **Progress visibility** | **None** | **100%** | **% of users who see progress indicators** |
| **Large file processing time** | **Hours** | **<2 min** | **Time for 100+ page documents** |

### Qualitative Metrics

- [ ] Users report text notes "just work"
- [ ] No more "can't access folder info" complaints
- [ ] Responses perceived as "more intelligent" (doesn't search when unnecessary)
- [ ] File organization is easy (moving works)
- [ ] Conversation feels natural (context maintained)
- [ ] **Users report "fast processing" instead of "takes forever"**
- [ ] **No more complaints about waiting with no feedback**
- [ ] **Large documents are now usable (not abandoned due to processing time)**

---

## 7. Implementation Timeline

### Week 1: Critical Fixes

**Days 1-2:** P0 Fixes - Core Functionality
- Mon AM: Fix text note processing errors
- Mon PM: Add processing status UI
- Tue AM: Fix folder access/isolation bugs
- Tue PM: Add retry logic and diagnostics

**Days 3-4:** P0 Fixes - Performance & Intelligence
- Wed AM: Implement parallel batch processing (10x speedup)
- Wed PM: Add progress tracking (database + ETA calculation)
- Thu AM: Build progress UI + chat status checking
- Thu PM: Implement smart routing (search vs LLM) + tune intent classifier

**Day 5:** High-Priority Features
- Fri AM: Conversation context storage
- Fri PM: File moving functionality

### Week 2: Enhancements & Polish

**Days 1-2:** Reference System
- Mon: Implement #filename references
- Tue: Add fuzzy matching, autocomplete

**Days 3-4:** Testing & Bug Fixes
- Wed: Integration testing
- Thu: User acceptance testing

**Day 5:** Deployment
- Fri: Deploy to production, monitor

---

## 8. Risk Mitigation

### High-Risk Areas

**Risk 1: Breaking existing functionality**
- **Mitigation:** Comprehensive testing, feature flags, gradual rollout

**Risk 2: Performance degradation from context retrieval**
- **Mitigation:** Implement caching, limit context window, optimize queries

**Risk 3: Users confused by new features**
- **Mitigation:** In-app tutorial, clear UI indicators, documentation

---

## 9. Rollout Plan

### Phase 1: Internal Testing (Day 1-2)
- Deploy to staging
- Team testing
- Fix critical bugs

### Phase 2: Beta Users (Day 3-4)
- 10% of users
- Gather feedback
- Monitor metrics

### Phase 3: General Availability (Day 5+)
- Gradual rollout (25% → 50% → 100%)
- Monitor error rates
- Be ready to rollback

---

## Conclusion

This plan addresses all **10 user feedback issues** through a **systematic, prioritized approach**:

1. **Week 1 (Days 1-2):** Fix critical bugs (text notes, folder access)
2. **Week 1 (Days 3-4):** Fix performance bottlenecks (parallel processing, 10x speedup) + smart routing
3. **Week 1 (Day 5):** Add high-priority features (context, file moving)
4. **Week 2:** Add references + polish (fuzzy matching, UX improvements)

**Expected Outcomes:**
- ✅ Text notes work reliably
- ✅ Folder access is consistent
- ✅ **Processing 10-15x faster (hours → minutes)**
- ✅ **Real-time progress tracking with ETAs**
- ✅ **Chat shows "still processing" warnings**
- ✅ Responses are higher quality (smart routing)
- ✅ Users can move files easily
- ✅ Conversation context is maintained
- ✅ File/folder references work intuitively

**Success will be measured by:**
- Technical metrics (>95% success rates, <15 sec processing)
- Performance metrics (10x speedup achieved)
- User feedback (>4.0/5.0 satisfaction)
- Reduction in support tickets

---

**Next Steps:**
1. Review and approve this plan
2. Begin P0 fixes immediately
3. Set up monitoring dashboards
4. Schedule user feedback sessions

**Document Version:** 1.0
**Last Updated:** 2025-10-06
**Author:** Claude Code
**Status:** Ready for Review & Implementation
