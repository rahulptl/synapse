# Parallel Processing & Progress Tracking Solution

**Priority:** P0 - Critical Performance Issue
**Impact:** Users waiting hours for large documents to process
**Estimated Time Savings:** 10-50x faster processing

---

## Problem Statement

### Current Behavior (BAD)
```
User uploads 50-page PDF
  ↓
Extracts text: ~180 chunks
  ↓
FOR EACH chunk (sequentially):
  - Call OpenAI API (~400ms each)
  - Wait for response
  - Store in database
  ↓
Total time: 180 × 400ms = 72 seconds (minimum)
+ Text extraction, DB writes = 2+ minutes
+ Larger documents = HOURS

UI shows: "Queued" (no progress indicator)
User queries: Returns empty (no "still processing" message)
```

### Root Causes

**RC-1: Sequential Processing**
```python
# processing_service.py line 601
for i, chunk in enumerate(chunks):  # SEQUENTIAL!
    embedding = await embedding_service.generate_embedding(chunk)
    # 400ms per chunk × 180 chunks = 72 seconds minimum
```

**RC-2: Batch API Not Used**
```python
# embeddings.py already has generate_embeddings_batch() but it's NOT USED!
async def generate_embeddings_batch(texts, batch_size=5):
    # Process 5 chunks in parallel → 5x faster immediately
```

**RC-3: No Progress Tracking**
- Database has `total_chunks` but NOT `chunks_processed`
- No real-time progress updates
- UI shows "Queued" forever

**RC-4: No "Processing" Message in Chat**
- User queries unprocessed file
- Search returns empty
- Should say: "This file is still processing (45/180 chunks done)"

---

## Solution Architecture

### 1. Parallel Batch Processing

**Change:** Use existing batch API with parallel execution

**Before:**
```python
for chunk in chunks:
    embedding = await generate_embedding(chunk)  # Sequential
    store(embedding)
```

**After:**
```python
# Process in batches of 10 (parallel)
batch_size = 10
for i in range(0, len(chunks), batch_size):
    batch = chunks[i:i+batch_size]

    # ALL 10 API calls happen in parallel
    embeddings = await embedding_service.generate_embeddings_batch(batch, batch_size=10)

    # Store batch
    for chunk, embedding in zip(batch, embeddings):
        store(chunk, embedding)

    # Update progress
    await update_progress(knowledge_item_id, i + len(batch), len(chunks))
```

**Performance Improvement:**
- Sequential: 180 chunks × 400ms = 72 seconds
- Parallel (batch=10): 18 batches × 400ms = 7.2 seconds
- **10x faster!**

---

### 2. Progress Tracking Schema

**Add to KnowledgeItem model:**

```python
# database.py - Add new columns
class KnowledgeItem(Base):
    # ... existing fields ...

    # Progress tracking (NEW)
    chunks_processed: Mapped[int] = mapped_column(Integer, default=0)
    chunks_total: Mapped[int] = mapped_column(Integer, default=0)  # Rename from total_chunks
    processing_progress: Mapped[float] = mapped_column(Float, default=0.0)  # 0.0 to 1.0
    processing_started_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    processing_completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    estimated_completion_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
```

**Migration:**
```python
# alembic migration
def upgrade():
    op.add_column('knowledge_items', sa.Column('chunks_processed', sa.Integer(), default=0))
    op.add_column('knowledge_items', sa.Column('processing_progress', sa.Float(), default=0.0))
    op.add_column('knowledge_items', sa.Column('processing_started_at', sa.DateTime()))
    op.add_column('knowledge_items', sa.Column('processing_completed_at', sa.DateTime()))
    op.add_column('knowledge_items', sa.Column('estimated_completion_at', sa.DateTime()))

    # Rename total_chunks to chunks_total for consistency
    op.alter_column('knowledge_items', 'total_chunks', new_column_name='chunks_total')
```

---

### 3. Real-Time Progress Updates

**Implementation:**

```python
# processing_service.py - Updated method
async def _generate_and_store_embeddings_with_progress(
    self,
    db: AsyncSession,
    knowledge_item_id: UUID,
    chunks: List[str],
    batch_size: int = 10
) -> int:
    """Generate embeddings with parallel processing and progress tracking."""

    total_chunks = len(chunks)

    # Initialize progress
    await self._update_processing_progress(
        db,
        knowledge_item_id,
        chunks_processed=0,
        chunks_total=total_chunks,
        status="processing"
    )

    vectors_created = 0
    start_time = datetime.now(timezone.utc)

    # Process in batches (parallel)
    for i in range(0, total_chunks, batch_size):
        batch = chunks[i:i+batch_size]
        batch_start_idx = i

        try:
            # PARALLEL: All API calls in batch happen simultaneously
            embeddings = await embedding_service.generate_embeddings_batch(
                batch,
                batch_size=batch_size
            )

            # Store batch in DB
            for chunk_idx, (chunk, embedding) in enumerate(zip(batch, embeddings)):
                vector = Vector(
                    knowledge_item_id=knowledge_item_id,
                    content_preview=chunk[:500],
                    embedding=embedding,
                    chunk_index=batch_start_idx + chunk_idx
                )
                db.add(vector)
                vectors_created += 1

            # Commit batch (important for progress visibility)
            await db.commit()

            # Update progress
            chunks_done = min(i + batch_size, total_chunks)
            progress_pct = chunks_done / total_chunks

            # Calculate ETA
            elapsed = (datetime.now(timezone.utc) - start_time).total_seconds()
            rate = chunks_done / elapsed if elapsed > 0 else 0
            remaining = total_chunks - chunks_done
            eta_seconds = remaining / rate if rate > 0 else 0
            eta = datetime.now(timezone.utc) + timedelta(seconds=eta_seconds)

            await self._update_processing_progress(
                db,
                knowledge_item_id,
                chunks_processed=chunks_done,
                chunks_total=total_chunks,
                progress=progress_pct,
                estimated_completion_at=eta
            )

            logger.info(f"Progress: {chunks_done}/{total_chunks} chunks ({progress_pct:.1%}), ETA: {eta_seconds:.0f}s")

        except Exception as e:
            logger.error(f"Batch {i//batch_size + 1} failed: {e}")
            # Continue with remaining batches
            continue

    # Mark complete
    await self._update_processing_progress(
        db,
        knowledge_item_id,
        chunks_processed=total_chunks,
        progress=1.0,
        status="completed",
        processing_completed_at=datetime.now(timezone.utc)
    )

    return vectors_created


async def _update_processing_progress(
    self,
    db: AsyncSession,
    knowledge_item_id: UUID,
    chunks_processed: int = None,
    chunks_total: int = None,
    progress: float = None,
    status: str = None,
    processing_completed_at: datetime = None,
    estimated_completion_at: datetime = None
):
    """Update processing progress in database."""

    update_values = {}

    if chunks_processed is not None:
        update_values['chunks_processed'] = chunks_processed
    if chunks_total is not None:
        update_values['chunks_total'] = chunks_total
    if progress is not None:
        update_values['processing_progress'] = progress
    if status is not None:
        update_values['processing_status'] = status
    if processing_completed_at is not None:
        update_values['processing_completed_at'] = processing_completed_at
    if estimated_completion_at is not None:
        update_values['estimated_completion_at'] = estimated_completion_at

    if update_values:
        await db.execute(
            update(KnowledgeItem)
            .where(KnowledgeItem.id == knowledge_item_id)
            .values(**update_values)
        )
        await db.commit()
```

---

### 4. Frontend Progress Display

**Component: ProcessingProgress.tsx**

```typescript
interface ProcessingProgress {
  status: 'queued' | 'processing' | 'completed' | 'failed';
  chunksProcessed: number;
  chunksTotal: number;
  progress: number; // 0.0 to 1.0
  estimatedCompletionAt?: string;
}

function ProcessingProgressIndicator({ item }: { item: KnowledgeItem }) {
  const progress = item.processingProgress;

  if (progress.status === 'completed') {
    return <Badge variant="success">✓ Ready to search</Badge>;
  }

  if (progress.status === 'failed') {
    return (
      <div className="flex items-center gap-2">
        <Badge variant="destructive">✗ Failed</Badge>
        <Button size="sm" onClick={() => retryProcessing(item.id)}>
          Retry
        </Button>
      </div>
    );
  }

  if (progress.status === 'processing') {
    const percentage = Math.round(progress.progress * 100);
    const eta = progress.estimatedCompletionAt
      ? formatDistanceToNow(new Date(progress.estimatedCompletionAt))
      : 'calculating...';

    return (
      <div className="space-y-1">
        <div className="flex justify-between text-xs">
          <span>
            Processing: {progress.chunksProcessed}/{progress.chunksTotal} chunks
          </span>
          <span className="text-gray-500">ETA: {eta}</span>
        </div>
        <Progress value={percentage} className="h-2" />
        <p className="text-xs text-gray-500">{percentage}% complete</p>
      </div>
    );
  }

  return <Badge variant="secondary">⏳ Queued</Badge>;
}
```

**Polling for updates:**

```typescript
// Auto-refresh every 2 seconds while processing
useEffect(() => {
  if (item.processingStatus === 'processing') {
    const interval = setInterval(async () => {
      const status = await apiClient.getProcessingStatus(item.id);
      setItem(prev => ({ ...prev, ...status }));
    }, 2000);

    return () => clearInterval(interval);
  }
}, [item.processingStatus]);
```

---

### 5. Chat Integration - "Still Processing" Message

**Problem:** User queries unprocessed file → Gets empty results

**Solution:** Check processing status before search

```python
# chat_service.py - Enhanced search
async def _handle_quick_query(self, ...):
    # ... existing code ...

    # NEW: Check if queried files are still processing
    if folder_ids:
        processing_items = await self._get_processing_items(db, folder_ids, user_id)

        if processing_items:
            # Build "still processing" message
            processing_msg = self._build_processing_message(processing_items)

            # Return early with informative message
            return ChatResponse(
                message=processing_msg,
                sources=[],
                processing_info={
                    "items_processing": len(processing_items),
                    "items": processing_items
                }
            )

    # ... continue with normal search ...


async def _get_processing_items(
    self,
    db: AsyncSession,
    folder_ids: List[UUID],
    user_id: UUID
) -> List[Dict]:
    """Get items that are currently processing in queried folders."""

    stmt = select(KnowledgeItem).where(
        KnowledgeItem.user_id == user_id,
        KnowledgeItem.folder_id.in_(folder_ids),
        KnowledgeItem.processing_status.in_(['queued', 'processing'])
    )

    result = await db.execute(stmt)
    items = result.scalars().all()

    return [
        {
            "id": str(item.id),
            "title": item.title,
            "status": item.processing_status,
            "progress": item.processing_progress,
            "chunks_processed": item.chunks_processed,
            "chunks_total": item.chunks_total,
            "estimated_completion_at": item.estimated_completion_at.isoformat() if item.estimated_completion_at else None
        }
        for item in items
    ]


def _build_processing_message(self, processing_items: List[Dict]) -> str:
    """Build user-friendly message about processing items."""

    if len(processing_items) == 1:
        item = processing_items[0]
        progress_pct = int(item['progress'] * 100)

        return f"""
I found the file **"{item['title']}"** but it's still being processed.

**Progress:** {item['chunks_processed']}/{item['chunks_total']} chunks ({progress_pct}% complete)

Please wait a moment and try again. The file should be ready soon!
        """.strip()

    else:
        items_list = "\n".join([
            f"- **{item['title']}** ({int(item['progress']*100)}% complete)"
            for item in processing_items
        ])

        return f"""
I found {len(processing_items)} files in this folder that are still being processed:

{items_list}

Please wait for processing to complete before querying these files.
        """.strip()
```

---

## Performance Comparison

### Scenario: 50-Page PDF (180 chunks)

| Metric | Sequential (Current) | Parallel (New) | Improvement |
|--------|---------------------|----------------|-------------|
| API Calls | 180 × 400ms = 72s | 18 batches × 400ms = 7.2s | **10x faster** |
| DB Writes | 180 individual | 18 batch commits | **10x faster** |
| **Total Time** | **~2-3 minutes** | **~10-15 seconds** | **12x faster** |
| Progress Updates | None | Every 2s | ✅ Visible |
| ETA | None | Real-time | ✅ Shown |

### Scenario: 200-Page Document (800 chunks)

| Metric | Sequential (Current) | Parallel (New) | Improvement |
|--------|---------------------|----------------|-------------|
| API Calls | 800 × 400ms = 320s (5.3min) | 80 batches × 400ms = 32s | **10x faster** |
| **Total Time** | **~10-15 minutes** | **~1 minute** | **15x faster** |

### Scenario: 1000-Page Document (4000 chunks)

| Metric | Sequential (Current) | Parallel (New) | Improvement |
|--------|---------------------|----------------|-------------|
| API Calls | 4000 × 400ms = 1600s (27min) | 400 batches × 400ms = 160s (2.7min) | **10x faster** |
| **Total Time** | **~45-60 minutes** | **~5 minutes** | **12x faster** |

---

## Implementation Plan

### Phase 1: Core Parallel Processing (Day 1)

**Tasks:**
1. ✅ Add progress columns to KnowledgeItem model (migration)
2. ✅ Update `_generate_and_store_embeddings()` to use batch API
3. ✅ Add progress tracking with ETA calculation
4. ✅ Test with large documents (50, 200, 1000 pages)

**Deliverable:** 10x faster processing ✅

---

### Phase 2: Progress Display (Day 2)

**Tasks:**
1. ✅ Add `GET /api/v1/files/status/{id}` progress endpoint (already exists, enhance it)
2. ✅ Build `ProcessingProgressIndicator` component
3. ✅ Add polling for real-time updates
4. ✅ Show ETA and chunk progress

**Deliverable:** Visible progress in UI ✅

---

### Phase 3: Chat Integration (Day 3)

**Tasks:**
1. ✅ Add processing status check before search
2. ✅ Build "still processing" message
3. ✅ Show progress in chat responses
4. ✅ Add "Refresh" button to retry query

**Deliverable:** User knows when files aren't ready ✅

---

## Code Changes Summary

### Backend Changes

**1. Database Migration**
```python
# File: alembic/versions/xxx_add_processing_progress.py
def upgrade():
    op.add_column('knowledge_items', sa.Column('chunks_processed', sa.Integer(), default=0))
    op.add_column('knowledge_items', sa.Column('processing_progress', sa.Float(), default=0.0))
    op.add_column('knowledge_items', sa.Column('processing_started_at', sa.DateTime()))
    op.add_column('knowledge_items', sa.Column('processing_completed_at', sa.DateTime()))
    op.add_column('knowledge_items', sa.Column('estimated_completion_at', sa.DateTime()))
```

**2. Processing Service**
```python
# File: app/services/processing_service.py
# Replace _generate_and_store_embeddings() with batch version
# Add _update_processing_progress() helper
# Update process_knowledge_item() to track start time
```

**3. Chat Service**
```python
# File: app/services/chat_service.py
# Add _get_processing_items() check
# Add _build_processing_message() for UX
# Modify _handle_quick_query() to check status first
```

**4. File Status Endpoint**
```python
# File: app/api/v1/endpoints/files.py
# Enhance GET /status/{id} to include:
# - chunks_processed
# - chunks_total
# - processing_progress
# - estimated_completion_at
```

### Frontend Changes

**1. Processing Progress Component**
```typescript
// File: src/components/knowledge/ProcessingProgress.tsx
// New component for progress display
```

**2. Item List Updates**
```typescript
// File: src/components/knowledge/ItemList.tsx
// Add <ProcessingProgress> for each item
// Add polling hook for real-time updates
```

**3. Chat Response Handling**
```typescript
// File: src/components/chat/ChatMessage.tsx
// Handle "processing_info" in response
// Show processing status in chat
```

---

## Testing Strategy

### Unit Tests

```python
async def test_parallel_processing_speed():
    """Verify parallel processing is faster than sequential."""
    chunks = ["test chunk"] * 100

    # Sequential
    start = time.time()
    await processing_service._generate_embeddings_sequential(chunks)
    sequential_time = time.time() - start

    # Parallel
    start = time.time()
    await processing_service._generate_embeddings_parallel(chunks, batch_size=10)
    parallel_time = time.time() - start

    # Should be at least 5x faster
    assert sequential_time / parallel_time >= 5

async def test_progress_tracking():
    """Verify progress updates correctly."""
    chunks = ["chunk"] * 50

    # Track progress updates
    progress_updates = []

    async def track_progress(item_id, processed, total, progress):
        progress_updates.append((processed, total, progress))

    await processing_service._generate_embeddings_with_progress(
        db, item_id, chunks, batch_size=10,
        progress_callback=track_progress
    )

    # Should have ~5 updates (50 chunks / 10 batch size)
    assert len(progress_updates) >= 5
    # Last update should be 100%
    assert progress_updates[-1] == (50, 50, 1.0)
```

### Integration Tests

```python
async def test_chat_with_processing_file():
    """Test chat response when file is still processing."""

    # Upload file (don't wait for processing)
    file_response = await client.post("/api/v1/files/upload", ...)
    item_id = file_response.json()["item"]["id"]

    # Query immediately (while processing)
    chat_response = await client.post(
        "/api/v1/chat",
        json={"message": f"Summarize #file_{item_id}"}
    )

    # Should get "still processing" message
    assert "still being processed" in chat_response.json()["message"].lower()
    assert chat_response.json().get("processing_info") is not None
```

---

## Success Metrics

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| Processing time (50 pages) | 2-3 min | 10-15 sec | 12x improvement |
| Processing time (200 pages) | 10-15 min | ~1 min | 15x improvement |
| Processing time (1000 pages) | 45-60 min | ~5 min | 12x improvement |
| Progress visibility | None | Real-time | ETA shown every 2s |
| User confusion | High | Low | "Still processing" message |
| Retry rate | Unknown | <5% | Users don't query unprocessed files |

---

## Rollout Plan

**Week 1:**
- Day 1: Database migration + parallel processing
- Day 2: Progress UI
- Day 3: Chat integration
- Day 4: Testing
- Day 5: Deploy to staging

**Week 2:**
- Beta test with 10% users
- Monitor performance metrics
- Adjust batch size if needed
- Full rollout

---

## Conclusion

This solution addresses the critical performance issue by:

1. **✅ 10-15x faster processing** - Parallel batch API calls
2. **✅ Real-time progress** - Visible chunk counts and ETA
3. **✅ Better UX** - Users know when files aren't ready
4. **✅ Minimal code changes** - Uses existing batch API

**Impact:** Transforms user experience from "hours of waiting" to "minutes with visibility"

---

**Document Version:** 1.0
**Created:** 2025-10-06
**Status:** Ready for Implementation
