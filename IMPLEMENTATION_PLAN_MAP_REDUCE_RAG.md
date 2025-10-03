# Implementation Plan: Map-Reduce RAG with Async Processing

## Overview
Implement intent-driven map-reduce RAG system that handles aggregation queries over large folders asynchronously, with progress tracking and detailed result breakdown.

---

## Architecture Overview

```
User Query
  ↓
Intent Classification (LLM) → Estimate processing time
  ↓
├─ Quick Query (<5s) ────→ Existing RAG flow (top-k results)
│                          Return immediately
│
└─ Long Query (>5s) ─────→ Create ProcessingJob
                           Return job_id immediately
                           Process in background
                           Store results in DB
                           User polls/receives notification
```

---

## Backend Implementation

### Phase 1: Database Schema Changes

#### File: `backend/app/models/database.py`

**New Table: ProcessingJob**
```python
class ProcessingJob(Base):
    """Background processing jobs for long-running queries."""
    __tablename__ = "processing_jobs"

    # Primary fields
    id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("profiles.user_id"), nullable=False)
    conversation_id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("conversations.id"), nullable=False)
    message_id: Mapped[Optional[UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("messages.id"))  # User message that triggered this

    # Job details
    job_type: Mapped[str] = mapped_column(Text, nullable=False)  # "aggregation", "full_folder_summary", "filtered_aggregation"
    status: Mapped[str] = mapped_column(Text, default="queued")  # queued, processing, completed, failed, cancelled
    user_query: Mapped[str] = mapped_column(Text, nullable=False)
    intent_data: Mapped[dict] = mapped_column(JSON)  # Parsed intent from classification

    # Progress tracking
    progress: Mapped[float] = mapped_column(Float, default=0.0)  # 0.0 to 1.0
    total_items: Mapped[int] = mapped_column(Integer, default=0)
    total_batches: Mapped[int] = mapped_column(Integer, default=0)
    processed_items: Mapped[int] = mapped_column(Integer, default=0)
    processed_batches: Mapped[int] = mapped_column(Integer, default=0)
    failed_batches: Mapped[int] = mapped_column(Integer, default=0)
    current_phase: Mapped[str] = mapped_column(Text, default="queued")  # queued, map, reduce, synthesis, complete

    # Results
    result: Mapped[Optional[dict]] = mapped_column(JSON)  # Final answer with sources
    aggregation_details: Mapped[Optional[dict]] = mapped_column(JSON)  # Detailed breakdown
    intermediate_results: Mapped[Optional[dict]] = mapped_column(JSON)  # Map phase results (for debugging/resume)
    error_message: Mapped[Optional[str]] = mapped_column(Text)
    error_details: Mapped[Optional[dict]] = mapped_column(JSON)  # Stack trace, failed batch info

    # Timing
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    estimated_completion_seconds: Mapped[Optional[int]] = mapped_column(Integer)
    actual_duration_seconds: Mapped[Optional[float]] = mapped_column(Float)

    # Metadata
    processing_metadata: Mapped[Optional[dict]] = mapped_column(JSON)  # Model used, chunk size, etc.

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = relationship("Profile", foreign_keys=[user_id])
    conversation = relationship("Conversation", foreign_keys=[conversation_id])
    message = relationship("Message", foreign_keys=[message_id])

    # Indexes
    __table_args__ = (
        Index("idx_processing_jobs_user_status", "user_id", "status"),
        Index("idx_processing_jobs_conversation", "conversation_id"),
        Index("idx_processing_jobs_status", "status"),
        Index("idx_processing_jobs_created_at", "created_at"),
    )
```

**Update Message Table:**
```python
# Add to Message model
class Message(Base):
    # ... existing fields ...

    # Add reference to processing job (optional)
    job_id: Mapped[Optional[UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("processing_jobs.id"))
    job = relationship("ProcessingJob", foreign_keys=[job_id])
```

**Migration:**
```bash
# Create migration
alembic revision --autogenerate -m "Add processing_jobs table and job_id to messages"
alembic upgrade head
```

---

### Phase 2: Intent Classification Service

#### File: `backend/app/services/intent_service.py` (NEW)

```python
"""
Intent classification service for query routing.
"""
from typing import Dict, Any, Optional, List
from uuid import UUID
import logging
import re
from app.core.embeddings import chat_service as ai_chat_service

logger = logging.getLogger(__name__)


class IntentClassifier:
    """Classify user query intent and estimate processing requirements."""

    # Thresholds
    QUICK_QUERY_THRESHOLD_SECONDS = 5
    ITEMS_PER_SECOND_ESTIMATE = 10  # Estimate processing speed

    async def classify_intent(
        self,
        user_query: str,
        folder_ids: Optional[List[UUID]] = None,
        folder_item_counts: Optional[Dict[UUID, int]] = None
    ) -> Dict[str, Any]:
        """
        Classify query intent and estimate processing requirements.

        Returns:
        {
            "intent_type": "quick_qa" | "aggregation" | "full_folder_summary" | "filtered_aggregation",
            "confidence": 0.0-1.0,
            "requires_async": bool,
            "estimated_items": int,
            "estimated_time_seconds": float,
            "extraction_schema": {...},  # What to extract from chunks
            "filter_criteria": {...}  # Optional semantic/date filters
        }
        """

        # Build prompt for intent classification
        prompt = self._build_classification_prompt(
            user_query, folder_ids, folder_item_counts
        )

        # Call LLM for classification
        messages = [
            {"role": "system", "content": prompt},
            {"role": "user", "content": user_query}
        ]

        try:
            response = await ai_chat_service.generate_completion(
                messages=messages,
                max_tokens=500,
                temperature=0.1  # Low temperature for consistent classification
            )

            # Parse JSON response
            import json
            intent_data = json.loads(response)

            # Validate and enrich intent data
            intent_data = self._validate_and_enrich_intent(
                intent_data, folder_item_counts
            )

            return intent_data

        except Exception as e:
            logger.error(f"Intent classification failed: {e}")
            # Fallback to safe default
            return self._get_default_intent(user_query, folder_item_counts)

    def _build_classification_prompt(
        self,
        user_query: str,
        folder_ids: Optional[List[UUID]],
        folder_item_counts: Optional[Dict[UUID, int]]
    ) -> str:
        """Build classification prompt."""

        total_items = sum(folder_item_counts.values()) if folder_item_counts else 0
        folder_info = ""
        if folder_ids and folder_item_counts:
            folder_info = f"\nTarget folder(s) contain {total_items} total items."

        return f"""You are an intent classifier for a knowledge base query system.

Query: "{user_query}"{folder_info}

Classify this query and output ONLY a JSON object with this exact structure:

{{
  "intent_type": "quick_qa" | "aggregation" | "full_folder_summary" | "filtered_aggregation",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation",
  "requires_full_scan": true/false,
  "extraction_schema": {{
    "extract_numbers": true/false,
    "extract_dates": true/false,
    "extract_categories": true/false,
    "fields": ["field1", "field2"]  // What specific data to extract
  }},
  "filter_criteria": {{
    "semantic_filter": "optional filter query",
    "date_range": {{"start": "YYYY-MM-DD", "end": "YYYY-MM-DD"}},
    "threshold": 0.3  // Relevance threshold for filtering
  }}
}}

Intent Types:
- "quick_qa": Simple question answerable with top-k retrieval (e.g., "What is X?", "Explain Y")
- "aggregation": Requires counting/summing across items (e.g., "total transactions", "how many", "sum of")
- "full_folder_summary": Needs to process all items (e.g., "summarize everything", "overview of folder")
- "filtered_aggregation": Aggregation with semantic/temporal filter (e.g., "December transactions", "recent orders")

Guidelines:
1. Use "quick_qa" for: definitions, explanations, finding specific info
2. Use "aggregation" for: totals, counts, averages, all items with math operations
3. Use "full_folder_summary" for: broad summaries, overviews without specific filter
4. Use "filtered_aggregation" for: "total X in December", "count Y from last month"
5. Set requires_full_scan=true only if answer needs ALL items (aggregations, full summaries)
6. Extract semantic filters naturally (e.g., "December orders" → filter: "December", date_range: Dec 2024)
7. confidence < 0.5 means unclear, default to "quick_qa"

Output ONLY valid JSON, no markdown formatting."""

    def _validate_and_enrich_intent(
        self,
        intent_data: Dict[str, Any],
        folder_item_counts: Optional[Dict[UUID, int]]
    ) -> Dict[str, Any]:
        """Validate intent data and add estimates."""

        # Set defaults
        intent_data.setdefault("confidence", 0.5)
        intent_data.setdefault("requires_full_scan", False)
        intent_data.setdefault("extraction_schema", {})
        intent_data.setdefault("filter_criteria", {})

        # Calculate estimated items to process
        total_items = sum(folder_item_counts.values()) if folder_item_counts else 0

        if intent_data["intent_type"] == "quick_qa":
            estimated_items = 10  # Top-k retrieval
        elif intent_data.get("filter_criteria", {}).get("semantic_filter"):
            # Filtered aggregation: estimate 20-50% of items will be relevant
            estimated_items = int(total_items * 0.35)
        else:
            # Full scan
            estimated_items = total_items

        intent_data["estimated_items"] = estimated_items

        # Estimate processing time
        # Formula: base_time + (items * time_per_item) + reduce_time
        base_time = 1.0  # Intent classification, setup
        map_time = estimated_items / self.ITEMS_PER_SECOND_ESTIMATE  # Process items
        reduce_time = 2.0 if estimated_items > 50 else 1.0  # Reduce phase

        estimated_time = base_time + map_time + reduce_time
        intent_data["estimated_time_seconds"] = estimated_time

        # Determine if async processing needed
        intent_data["requires_async"] = estimated_time > self.QUICK_QUERY_THRESHOLD_SECONDS

        return intent_data

    def _get_default_intent(
        self,
        user_query: str,
        folder_item_counts: Optional[Dict[UUID, int]]
    ) -> Dict[str, Any]:
        """Fallback intent when classification fails."""

        # Simple keyword detection as fallback
        query_lower = user_query.lower()

        aggregation_keywords = ["total", "sum", "count", "how many", "average", "all"]
        summary_keywords = ["summarize", "overview", "summary", "tell me about"]

        if any(kw in query_lower for kw in aggregation_keywords):
            intent_type = "aggregation"
            requires_full_scan = True
        elif any(kw in query_lower for kw in summary_keywords):
            intent_type = "full_folder_summary"
            requires_full_scan = True
        else:
            intent_type = "quick_qa"
            requires_full_scan = False

        total_items = sum(folder_item_counts.values()) if folder_item_counts else 10
        estimated_items = total_items if requires_full_scan else 10
        estimated_time = 1.0 + (estimated_items / self.ITEMS_PER_SECOND_ESTIMATE)

        return {
            "intent_type": intent_type,
            "confidence": 0.3,  # Low confidence for fallback
            "reasoning": "Fallback classification based on keywords",
            "requires_full_scan": requires_full_scan,
            "requires_async": estimated_time > self.QUICK_QUERY_THRESHOLD_SECONDS,
            "estimated_items": estimated_items,
            "estimated_time_seconds": estimated_time,
            "extraction_schema": {},
            "filter_criteria": {}
        }


# Service instance
intent_classifier = IntentClassifier()
```

---

### Phase 3: Map-Reduce Processing Service

#### File: `backend/app/services/mapreduce_service.py` (NEW)

```python
"""
Map-Reduce processing service for large-scale RAG operations.
"""
import asyncio
import logging
from typing import List, Dict, Any, Optional
from uuid import UUID
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.database import KnowledgeItem, Vector, Folder, ProcessingJob
from app.core.embeddings import chat_service as ai_chat_service
from app.services.search_service import search_service

logger = logging.getLogger(__name__)


class MapReduceService:
    """Service for map-reduce processing of knowledge base queries."""

    TARGET_CHUNKS_PER_BATCH = 10
    MAX_CONCURRENT_MAP_CALLS = 10
    MAP_RETRY_ATTEMPTS = 2

    async def process_query(
        self,
        db: AsyncSession,
        job: ProcessingJob,
        user_query: str,
        intent_data: Dict[str, Any],
        folder_ids: List[UUID]
    ) -> Dict[str, Any]:
        """
        Main entry point for map-reduce processing.

        Returns final result with aggregation details.
        """

        try:
            # Update job status
            job.status = "processing"
            job.current_phase = "initialization"
            await db.commit()

            # Step 1: Fetch items/chunks
            items_with_chunks = await self._fetch_items_with_chunks(
                db, folder_ids, job.user_id
            )

            if not items_with_chunks:
                raise ValueError("No items found in specified folder(s)")

            job.total_items = len(items_with_chunks)
            await db.commit()

            # Step 2: Apply filtering if needed
            if intent_data.get("filter_criteria", {}).get("semantic_filter"):
                items_with_chunks = await self._apply_semantic_filter(
                    db, items_with_chunks, intent_data["filter_criteria"], user_query
                )
                logger.info(f"After filtering: {len(items_with_chunks)} items remain")

            # Step 3: Create batches
            batches = self._create_smart_batches(items_with_chunks)
            job.total_batches = len(batches)
            job.current_phase = "map"
            await db.commit()

            logger.info(f"Processing {len(batches)} batches for job {job.id}")

            # Step 4: Map phase (parallel processing)
            map_results = await self._map_phase(
                db, job, batches, user_query, intent_data
            )

            # Store intermediate results
            job.intermediate_results = {"map_results": map_results}
            job.current_phase = "reduce"
            job.progress = 0.85
            await db.commit()

            # Step 5: Programmatic aggregation
            aggregation_summary = self._calculate_aggregation(
                map_results, intent_data
            )

            # Step 6: Reduce phase (LLM synthesis)
            job.current_phase = "synthesis"
            job.progress = 0.95
            await db.commit()

            final_response = await self._reduce_phase(
                user_query, map_results, aggregation_summary, intent_data
            )

            # Step 7: Build detailed breakdown
            aggregation_details = self._build_aggregation_details(
                map_results, aggregation_summary, items_with_chunks, intent_data
            )

            # Step 8: Mark complete
            job.status = "completed"
            job.current_phase = "complete"
            job.progress = 1.0
            job.completed_at = datetime.now(timezone.utc)
            job.actual_duration_seconds = (
                job.completed_at - job.started_at
            ).total_seconds()

            result = {
                "response": final_response,
                "sources": aggregation_summary.get("top_items", [])[:10],
                "context_count": len(items_with_chunks)
            }

            job.result = result
            job.aggregation_details = aggregation_details
            await db.commit()

            return result

        except Exception as e:
            logger.error(f"Map-reduce processing failed for job {job.id}: {e}")
            job.status = "failed"
            job.error_message = str(e)
            job.error_details = {
                "error_type": type(e).__name__,
                "phase": job.current_phase
            }
            job.completed_at = datetime.now(timezone.utc)
            await db.commit()
            raise

    async def _fetch_items_with_chunks(
        self,
        db: AsyncSession,
        folder_ids: List[UUID],
        user_id: UUID
    ) -> List[Dict[str, Any]]:
        """Fetch all knowledge items with their vector chunks."""

        from sqlalchemy.orm import selectinload

        stmt = (
            select(KnowledgeItem)
            .options(selectinload(KnowledgeItem.vectors))
            .where(
                KnowledgeItem.user_id == user_id,
                KnowledgeItem.folder_id.in_(folder_ids),
                KnowledgeItem.processing_status == "completed"
            )
            .order_by(KnowledgeItem.created_at.desc())
        )

        result = await db.execute(stmt)
        knowledge_items = result.scalars().all()

        # Structure data
        items_with_chunks = []
        for item in knowledge_items:
            # Sort chunks by index
            sorted_chunks = sorted(item.vectors, key=lambda v: v.chunk_index)

            items_with_chunks.append({
                "item": item,
                "chunks": sorted_chunks,
                "metadata": {
                    "id": item.id,
                    "title": item.title,
                    "source_url": item.source_url,
                    "content_type": item.content_type,
                    "created_at": item.created_at.isoformat() if item.created_at else None,
                    "item_metadata": item.item_metadata or {}
                }
            })

        return items_with_chunks

    async def _apply_semantic_filter(
        self,
        db: AsyncSession,
        items_with_chunks: List[Dict[str, Any]],
        filter_criteria: Dict[str, Any],
        user_query: str
    ) -> List[Dict[str, Any]]:
        """Apply semantic filtering to items."""

        semantic_filter = filter_criteria.get("semantic_filter")
        threshold = filter_criteria.get("threshold", 0.3)

        if not semantic_filter:
            return items_with_chunks

        # Use existing search service to rank items
        # We'll use the first chunk of each item as representative
        from app.core.embeddings import embedding_service

        query_embedding = await embedding_service.generate_embedding(semantic_filter)

        # Score each item
        scored_items = []
        for item_data in items_with_chunks:
            if not item_data["chunks"]:
                continue

            # Use first chunk's embedding as representative
            first_chunk = item_data["chunks"][0]
            if not first_chunk.embedding:
                continue

            # Calculate similarity
            import math
            dot_product = sum(a * b for a, b in zip(query_embedding, first_chunk.embedding))
            magnitude_a = math.sqrt(sum(a * a for a in query_embedding))
            magnitude_b = math.sqrt(sum(b * b for b in first_chunk.embedding))
            similarity = dot_product / (magnitude_a * magnitude_b) if (magnitude_a * magnitude_b) != 0 else 0

            if similarity >= threshold:
                scored_items.append({
                    **item_data,
                    "similarity_score": float(similarity)
                })

        # Sort by similarity
        scored_items.sort(key=lambda x: x["similarity_score"], reverse=True)

        return scored_items

    def _create_smart_batches(
        self,
        items_with_chunks: List[Dict[str, Any]]
    ) -> List[List[Dict[str, Any]]]:
        """
        Create batches optimized for parallel processing.
        Keeps items together, targets ~10 chunks per batch.
        """

        batches = []
        current_batch = []
        current_chunk_count = 0

        for item_data in items_with_chunks:
            chunk_count = len(item_data["chunks"])

            # If single item is too large, give it own batch
            if chunk_count > self.TARGET_CHUNKS_PER_BATCH * 1.5:
                if current_batch:
                    batches.append(current_batch)
                    current_batch = []
                    current_chunk_count = 0

                batches.append([item_data])
                continue

            # If adding this item would exceed target significantly, start new batch
            if current_chunk_count + chunk_count > self.TARGET_CHUNKS_PER_BATCH * 1.2:
                if current_batch:
                    batches.append(current_batch)
                current_batch = [item_data]
                current_chunk_count = chunk_count
            else:
                current_batch.append(item_data)
                current_chunk_count += chunk_count

        # Add remaining batch
        if current_batch:
            batches.append(current_batch)

        return batches

    async def _map_phase(
        self,
        db: AsyncSession,
        job: ProcessingJob,
        batches: List[List[Dict[str, Any]]],
        user_query: str,
        intent_data: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """Process batches in parallel (map phase)."""

        semaphore = asyncio.Semaphore(self.MAX_CONCURRENT_MAP_CALLS)

        async def process_batch_with_semaphore(batch_idx: int, batch: List[Dict[str, Any]]):
            async with semaphore:
                return await self._process_map_batch(
                    db, job, batch_idx, batch, user_query, intent_data
                )

        # Create tasks
        tasks = [
            process_batch_with_semaphore(i, batch)
            for i, batch in enumerate(batches)
        ]

        # Process with error handling
        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Filter out exceptions and log them
        map_results = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logger.error(f"Batch {i} failed: {result}")
                job.failed_batches += 1
                # Add placeholder
                map_results.append({
                    "relevant": False,
                    "error": str(result),
                    "batch_index": i
                })
            else:
                map_results.append(result)

        await db.commit()

        return map_results

    async def _process_map_batch(
        self,
        db: AsyncSession,
        job: ProcessingJob,
        batch_idx: int,
        batch: List[Dict[str, Any]],
        user_query: str,
        intent_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Process a single batch (map operation)."""

        # Build context from chunks
        context = self._build_batch_context(batch)

        # Build map prompt based on intent
        map_prompt = self._build_map_prompt(user_query, intent_data, context)

        # Call LLM with retry
        for attempt in range(self.MAP_RETRY_ATTEMPTS):
            try:
                messages = [
                    {"role": "system", "content": map_prompt},
                    {"role": "user", "content": f"Process this batch and extract relevant information for: {user_query}"}
                ]

                response = await ai_chat_service.generate_completion(
                    messages=messages,
                    max_tokens=1000,
                    temperature=0.1
                )

                # Parse JSON response
                import json
                result = json.loads(response)

                # Add batch metadata
                result["batch_index"] = batch_idx
                result["items_in_batch"] = len(batch)

                # Update progress
                job.processed_batches += 1
                job.processed_items += len(batch)
                job.progress = 0.1 + (0.75 * (job.processed_batches / job.total_batches))

                # Commit progress every 5 batches
                if job.processed_batches % 5 == 0:
                    await db.commit()

                return result

            except Exception as e:
                if attempt < self.MAP_RETRY_ATTEMPTS - 1:
                    logger.warning(f"Map batch {batch_idx} attempt {attempt + 1} failed, retrying: {e}")
                    await asyncio.sleep(1)
                else:
                    raise

    def _build_batch_context(self, batch: List[Dict[str, Any]]) -> str:
        """Build context string from batch items and chunks."""

        context_parts = []

        for item_data in batch:
            item = item_data["item"]
            chunks = item_data["chunks"]

            # Item header
            context_parts.append(f"\n--- Item: {item.title} ---")
            context_parts.append(f"Source: {item.source_url or 'N/A'}")
            context_parts.append(f"Type: {item.content_type}")
            context_parts.append(f"Date: {item.created_at.strftime('%Y-%m-%d') if item.created_at else 'N/A'}")

            # Metadata if available
            if item.item_metadata:
                context_parts.append(f"Metadata: {item.item_metadata}")

            context_parts.append("\nContent:")

            # Add chunks
            for chunk in chunks:
                context_parts.append(chunk.content_preview)

        return "\n".join(context_parts)

    def _build_map_prompt(
        self,
        user_query: str,
        intent_data: Dict[str, Any],
        context: str
    ) -> str:
        """Build prompt for map phase."""

        extraction_schema = intent_data.get("extraction_schema", {})
        intent_type = intent_data.get("intent_type")

        base_prompt = f"""You are processing a batch of knowledge items to answer: "{user_query}"

Your task: Extract ONLY relevant information from the provided items.

Context:
{context}

"""

        if intent_type == "aggregation":
            base_prompt += """
CRITICAL: This is an aggregation query. You MUST extract exact numeric values.

Output JSON format:
{
  "relevant": true/false,
  "extracted_data": [
    {
      "source": "item title or identifier",
      "value": 123.45,  // EXACT number, not approximation
      "unit": "USD" | "count" | etc,
      "date": "YYYY-MM-DD" if available,
      "category": "category if applicable"
    }
  ],
  "summary": "Brief text summary of this batch",
  "item_count": number_of_relevant_items
}

Rules:
- Extract EXACT numbers, never round or approximate
- If no relevant items, return: {"relevant": false, "reason": "..."}
- Include ALL numeric values that match the query
- Preserve currency symbols and units
"""

        elif intent_type == "full_folder_summary":
            base_prompt += """
Output JSON format:
{
  "relevant": true,
  "themes": ["theme1", "theme2"],
  "key_points": ["point1", "point2"],
  "summary": "Comprehensive summary of items in this batch",
  "item_count": number_of_items
}
"""

        else:  # filtered_aggregation
            base_prompt += """
Output JSON format:
{
  "relevant": true/false,
  "extracted_data": [...],  // Same as aggregation
  "summary": "Summary",
  "item_count": number_of_relevant_items
}

Note: Only include items that match the query criteria.
"""

        base_prompt += "\n\nOutput ONLY valid JSON, no markdown formatting."

        return base_prompt

    def _calculate_aggregation(
        self,
        map_results: List[Dict[str, Any]],
        intent_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Programmatic aggregation of map results."""

        intent_type = intent_data.get("intent_type")

        # Collect all extracted data
        all_extracted = []
        for result in map_results:
            if result.get("relevant") and result.get("extracted_data"):
                all_extracted.extend(result["extracted_data"])

        if intent_type in ["aggregation", "filtered_aggregation"]:
            # Numeric aggregation
            total = 0.0
            count = 0
            by_category = {}
            by_month = {}
            items_list = []

            for item in all_extracted:
                value = item.get("value", 0)
                category = item.get("category", "uncategorized")
                date_str = item.get("date")

                total += value
                count += 1

                # By category
                if category not in by_category:
                    by_category[category] = {"count": 0, "total": 0.0}
                by_category[category]["count"] += 1
                by_category[category]["total"] += value

                # By month
                if date_str:
                    month_key = date_str[:7]  # YYYY-MM
                    if month_key not in by_month:
                        by_month[month_key] = {"count": 0, "total": 0.0}
                    by_month[month_key]["count"] += 1
                    by_month[month_key]["total"] += value

                # Store for top items
                items_list.append({
                    "source": item.get("source"),
                    "value": value,
                    "unit": item.get("unit"),
                    "date": date_str,
                    "category": category
                })

            # Sort items by value
            items_list.sort(key=lambda x: x["value"], reverse=True)

            return {
                "total": total,
                "count": count,
                "average": total / count if count > 0 else 0,
                "by_category": by_category,
                "by_month": by_month,
                "top_items": items_list[:20],  # Top 20
                "all_items": items_list
            }

        else:  # full_folder_summary
            # Collect themes and key points
            all_themes = []
            all_key_points = []

            for result in map_results:
                if result.get("relevant"):
                    all_themes.extend(result.get("themes", []))
                    all_key_points.extend(result.get("key_points", []))

            return {
                "themes": list(set(all_themes)),
                "key_points": all_key_points,
                "total_items": sum(r.get("item_count", 0) for r in map_results)
            }

    async def _reduce_phase(
        self,
        user_query: str,
        map_results: List[Dict[str, Any]],
        aggregation_summary: Dict[str, Any],
        intent_data: Dict[str, Any]
    ) -> str:
        """Reduce phase: LLM synthesizes final response."""

        # Build reduce prompt
        reduce_prompt = self._build_reduce_prompt(
            user_query, aggregation_summary, intent_data
        )

        messages = [
            {"role": "system", "content": reduce_prompt},
            {"role": "user", "content": f"Generate final response for: {user_query}"}
        ]

        response = await ai_chat_service.generate_completion(
            messages=messages,
            max_tokens=1500,
            temperature=0.7
        )

        return response

    def _build_reduce_prompt(
        self,
        user_query: str,
        aggregation_summary: Dict[str, Any],
        intent_data: Dict[str, Any]
    ) -> str:
        """Build prompt for reduce phase."""

        import json
        intent_type = intent_data.get("intent_type")

        if intent_type in ["aggregation", "filtered_aggregation"]:
            return f"""You are synthesizing aggregation results into a natural response.

User Query: "{user_query}"

Calculated Results:
{json.dumps(aggregation_summary, indent=2)}

Instructions:
1. Use the EXACT numbers provided (total, count, average)
2. Generate a natural, conversational response
3. Highlight key insights from the data
4. Mention breakdown by category/time if relevant
5. Reference specific top items as examples
6. Be helpful and clear

Format your response naturally, as if speaking to the user directly.
"""
        else:
            return f"""You are synthesizing multiple summaries into a cohesive overview.

User Query: "{user_query}"

Aggregated Information:
{json.dumps(aggregation_summary, indent=2)}

Instructions:
1. Create a comprehensive but concise summary
2. Organize by themes if available
3. Highlight key points
4. Be natural and conversational

Format your response as a helpful summary.
"""

    def _build_aggregation_details(
        self,
        map_results: List[Dict[str, Any]],
        aggregation_summary: Dict[str, Any],
        items_with_chunks: List[Dict[str, Any]],
        intent_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Build detailed breakdown for user verification."""

        return {
            "summary": {
                "total": aggregation_summary.get("total"),
                "count": aggregation_summary.get("count"),
                "average": aggregation_summary.get("average"),
                "by_category": aggregation_summary.get("by_category", {}),
                "by_month": aggregation_summary.get("by_month", {})
            },
            "processing_info": {
                "total_items_in_folder": len(items_with_chunks),
                "items_processed": sum(1 for r in map_results if r.get("relevant")),
                "items_skipped": sum(1 for r in map_results if not r.get("relevant")),
                "batches_processed": len([r for r in map_results if not r.get("error")]),
                "batches_failed": len([r for r in map_results if r.get("error")]),
                "strategy": intent_data.get("intent_type")
            },
            "top_items": aggregation_summary.get("top_items", [])[:20],
            "confidence": self._calculate_confidence(map_results, aggregation_summary)
        }

    def _calculate_confidence(
        self,
        map_results: List[Dict[str, Any]],
        aggregation_summary: Dict[str, Any]
    ) -> float:
        """Calculate confidence score for results."""

        total_batches = len(map_results)
        failed_batches = len([r for r in map_results if r.get("error")])

        if failed_batches == total_batches:
            return 0.0

        # Base confidence
        confidence = 1.0 - (failed_batches / total_batches)

        # Reduce if very few items found
        items_found = aggregation_summary.get("count", 0)
        if items_found < 5:
            confidence *= 0.7

        return round(confidence, 2)


# Service instance
mapreduce_service = MapReduceService()
```

---

### Phase 4: Update Chat Service

#### File: `backend/app/services/chat_service.py`

**Add imports:**
```python
from app.services.intent_service import intent_classifier
from app.services.mapreduce_service import mapreduce_service
from app.models.database import ProcessingJob
from fastapi import BackgroundTasks
```

**Update chat method:**
```python
async def chat(
    self,
    db: AsyncSession,
    user_id: UUID,
    chat_request: ChatRequest,
    background_tasks: BackgroundTasks  # NEW parameter
) -> ChatResponse:
    """Process chat request with intent-driven routing."""

    try:
        # Get or create conversation
        conversation = await self._get_or_create_conversation(
            db, user_id, chat_request.conversation_id
        )

        # Store user message
        user_message = await self._store_message(
            db, user_id, conversation.id, MessageRole.USER, chat_request.message
        )

        # Update conversation title
        await self._maybe_update_conversation_title(
            db=db,
            conversation=conversation,
            message_text=chat_request.message
        )

        # Parse hashtags
        hashtag_info = search_service.parse_hashtags_from_message(chat_request.message)
        hashtags = hashtag_info["hashtags"]
        cleaned_message = hashtag_info["cleaned_message"]

        # Get folder IDs
        matched_folders = await search_service.get_folder_ids_by_names(db, hashtags, user_id)
        folder_ids = [folder["id"] for folder in matched_folders if folder.get("id")] if matched_folders else None

        # Count items in folders for estimation
        folder_item_counts = {}
        if folder_ids:
            from sqlalchemy import select, func
            from app.models.database import KnowledgeItem

            for folder_id in folder_ids:
                count_stmt = select(func.count(KnowledgeItem.id)).where(
                    KnowledgeItem.folder_id == folder_id,
                    KnowledgeItem.user_id == user_id,
                    KnowledgeItem.processing_status == "completed"
                )
                result = await db.execute(count_stmt)
                folder_item_counts[folder_id] = result.scalar() or 0

        # INTENT CLASSIFICATION
        intent_data = await intent_classifier.classify_intent(
            user_query=chat_request.message,
            folder_ids=folder_ids,
            folder_item_counts=folder_item_counts
        )

        logger.info(f"Intent: {intent_data['intent_type']}, "
                   f"Async: {intent_data['requires_async']}, "
                   f"Est. time: {intent_data['estimated_time_seconds']}s")

        # ROUTING: Quick vs Long-running
        if intent_data["requires_async"] and folder_ids:
            # Long-running query - create job and process in background
            return await self._handle_async_query(
                db=db,
                user_id=user_id,
                conversation=conversation,
                user_message=user_message,
                chat_request=chat_request,
                intent_data=intent_data,
                folder_ids=folder_ids,
                hashtags=hashtags,
                matched_folders=matched_folders,
                background_tasks=background_tasks
            )
        else:
            # Quick query - existing flow
            return await self._handle_quick_query(
                db=db,
                user_id=user_id,
                conversation=conversation,
                chat_request=chat_request,
                cleaned_message=cleaned_message,
                folder_ids=folder_ids,
                hashtags=hashtags,
                matched_folders=matched_folders
            )

    except Exception as e:
        logger.error(f"Chat processing failed: {e}")
        raise


async def _handle_async_query(
    self,
    db: AsyncSession,
    user_id: UUID,
    conversation: Conversation,
    user_message: Message,
    chat_request: ChatRequest,
    intent_data: Dict[str, Any],
    folder_ids: List[UUID],
    hashtags: List[str],
    matched_folders: List[Dict[str, Any]],
    background_tasks: BackgroundTasks
) -> ChatResponse:
    """Handle long-running async query."""

    # Create processing job
    job = ProcessingJob(
        user_id=user_id,
        conversation_id=conversation.id,
        message_id=user_message.id,
        job_type=intent_data["intent_type"],
        status="queued",
        user_query=chat_request.message,
        intent_data=intent_data,
        estimated_completion_seconds=int(intent_data["estimated_time_seconds"])
    )

    db.add(job)
    await db.commit()
    await db.refresh(job)

    # Schedule background processing
    background_tasks.add_task(
        self._process_job_in_background,
        job.id,
        user_id,
        folder_ids
    )

    # Build hashtag info
    enhanced_hashtag_info = {
        "detected_hashtags": hashtags,
        "recognized_folders": matched_folders,
        "folder_filtered": True
    }

    # Return immediate response
    estimated_time_str = f"{intent_data['estimated_time_seconds']:.0f} seconds"
    if intent_data['estimated_time_seconds'] > 60:
        estimated_time_str = f"{intent_data['estimated_time_seconds'] / 60:.1f} minutes"

    response_message = (
        f"I'm analyzing {intent_data['estimated_items']} items in your folder. "
        f"This will take approximately {estimated_time_str}. "
        f"Feel free to explore other conversations—I'll have your answer ready when you return. "
        f"You can also stay on this page to watch the progress."
    )

    return ChatResponse(
        response=response_message,
        conversation_id=conversation.id,
        job_id=str(job.id),
        job_status="queued",
        estimated_completion_seconds=job.estimated_completion_seconds,
        sources=[],
        context_count=0,
        hashtag_info=enhanced_hashtag_info
    )


async def _handle_quick_query(
    self,
    db: AsyncSession,
    user_id: UUID,
    conversation: Conversation,
    chat_request: ChatRequest,
    cleaned_message: str,
    folder_ids: Optional[List[UUID]],
    hashtags: List[str],
    matched_folders: List[Dict[str, Any]]
) -> ChatResponse:
    """Handle quick query with existing RAG flow."""

    # Existing implementation
    search_query = cleaned_message if cleaned_message.strip() else chat_request.message
    context_results = await search_service.hybrid_search(
        db=db,
        user_id=user_id,
        query_text=search_query,
        folder_ids=folder_ids,
        limit=10,
        semantic_weight=0.7,
        bm25_weight=0.3
    )

    unrecognized_hashtags = [tag for tag in hashtags
                           if not any(folder["name"] == tag for folder in matched_folders)]

    conversation_history = await self._get_conversation_history(
        db, conversation.id, limit=settings.MAX_CHAT_HISTORY
    )

    ai_response = await self._generate_ai_response_enhanced(
        chat_request.message,
        context_results,
        conversation_history,
        hashtags,
        matched_folders,
        unrecognized_hashtags,
        folder_ids
    )

    sources_metadata = [
        {
            "title": result["title"],
            "source": result.get("source_url", f"Folder: {result.get('folder_name', 'Unknown')}"),
            "similarity": float(result["similarity"])
        } for result in context_results
    ]

    assistant_message = await self._store_message(
        db, user_id, conversation.id, MessageRole.ASSISTANT, ai_response,
        metadata={"sources": sources_metadata}
    )

    enhanced_hashtag_info = {
        "detected_hashtags": hashtags,
        "recognized_folders": matched_folders,
        "unrecognized_hashtags": unrecognized_hashtags,
        "folder_filtered": folder_ids is not None and len(folder_ids) > 0
    }

    context_results = convert_numpy_types(context_results)
    enhanced_hashtag_info = convert_numpy_types(enhanced_hashtag_info)

    return ChatResponse(
        response=ai_response,
        conversation_id=conversation.id,
        sources=context_results,
        context_count=len(context_results),
        hashtag_info=enhanced_hashtag_info
    )


async def _process_job_in_background(
    self,
    job_id: UUID,
    user_id: UUID,
    folder_ids: List[UUID]
):
    """Background task to process long-running job."""

    # Create new DB session for background task
    from app.core.database import async_session_maker

    async with async_session_maker() as db:
        try:
            # Get job
            job = await db.get(ProcessingJob, job_id)
            if not job:
                logger.error(f"Job {job_id} not found")
                return

            # Process with map-reduce
            result = await mapreduce_service.process_query(
                db=db,
                job=job,
                user_query=job.user_query,
                intent_data=job.intent_data,
                folder_ids=folder_ids
            )

            # Store as message in conversation
            await self._store_message(
                db=db,
                user_id=user_id,
                conversation_id=job.conversation_id,
                role=MessageRole.ASSISTANT,
                content=result["response"],
                metadata={
                    "sources": result.get("sources", []),
                    "job_id": str(job_id),
                    "aggregation_details": job.aggregation_details
                }
            )

            logger.info(f"Job {job_id} completed successfully")

        except Exception as e:
            logger.error(f"Background job {job_id} failed: {e}", exc_info=True)
```

---

### Phase 5: API Endpoints

#### File: `backend/app/api/v1/endpoints/chat.py`

**Update chat endpoint:**
```python
from fastapi import BackgroundTasks

@router.post("/chat", response_model=ChatResponse)
async def chat(
    chat_request: ChatRequest,
    background_tasks: BackgroundTasks,  # NEW
    db: AsyncSession = Depends(get_db),
    current_user: UUID = Depends(get_current_user)
):
    """Process a chat message."""
    return await chat_service.chat(
        db=db,
        user_id=current_user,
        chat_request=chat_request,
        background_tasks=background_tasks  # NEW
    )
```

**New endpoint for job status:**
```python
from app.models.database import ProcessingJob
from app.models.schemas import ProcessingJobStatus

@router.get("/jobs/{job_id}", response_model=ProcessingJobStatus)
async def get_job_status(
    job_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: UUID = Depends(get_current_user)
):
    """Get status of a processing job."""

    job = await db.get(ProcessingJob, job_id)

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if job.user_id != current_user:
        raise HTTPException(status_code=403, detail="Access denied")

    return ProcessingJobStatus(
        job_id=job.id,
        status=job.status,
        progress=job.progress,
        current_phase=job.current_phase,
        processed_items=job.processed_items,
        total_items=job.total_items,
        estimated_completion_seconds=job.estimated_completion_seconds,
        result=job.result if job.status == "completed" else None,
        aggregation_details=job.aggregation_details if job.status == "completed" else None,
        error_message=job.error_message if job.status == "failed" else None,
        started_at=job.started_at,
        completed_at=job.completed_at
    )


@router.get("/jobs", response_model=List[ProcessingJobStatus])
async def list_jobs(
    conversation_id: Optional[UUID] = None,
    status: Optional[str] = None,
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
    current_user: UUID = Depends(get_current_user)
):
    """List processing jobs for user."""

    from sqlalchemy import select, desc

    stmt = select(ProcessingJob).where(ProcessingJob.user_id == current_user)

    if conversation_id:
        stmt = stmt.where(ProcessingJob.conversation_id == conversation_id)

    if status:
        stmt = stmt.where(ProcessingJob.status == status)

    stmt = stmt.order_by(desc(ProcessingJob.created_at)).limit(limit)

    result = await db.execute(stmt)
    jobs = result.scalars().all()

    return [
        ProcessingJobStatus(
            job_id=job.id,
            status=job.status,
            progress=job.progress,
            current_phase=job.current_phase,
            processed_items=job.processed_items,
            total_items=job.total_items,
            estimated_completion_seconds=job.estimated_completion_seconds,
            result=job.result if job.status == "completed" else None,
            aggregation_details=job.aggregation_details if job.status == "completed" else None,
            error_message=job.error_message if job.status == "failed" else None,
            started_at=job.started_at,
            completed_at=job.completed_at
        )
        for job in jobs
    ]


@router.delete("/jobs/{job_id}")
async def cancel_job(
    job_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: UUID = Depends(get_current_user)
):
    """Cancel a processing job (if still queued/processing)."""

    job = await db.get(ProcessingJob, job_id)

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if job.user_id != current_user:
        raise HTTPException(status_code=403, detail="Access denied")

    if job.status in ["completed", "failed", "cancelled"]:
        raise HTTPException(status_code=400, detail=f"Cannot cancel job with status: {job.status}")

    job.status = "cancelled"
    job.completed_at = datetime.now(timezone.utc)
    await db.commit()

    return {"message": "Job cancelled successfully"}
```

#### File: `backend/app/models/schemas.py`

**Add new schemas:**
```python
from typing import Optional, Dict, Any

class ChatResponse(BaseModel):
    """Chat response schema."""
    response: str
    conversation_id: UUID
    job_id: Optional[str] = None  # NEW
    job_status: Optional[str] = None  # NEW
    estimated_completion_seconds: Optional[int] = None  # NEW
    sources: List[Dict[str, Any]] = []
    context_count: int = 0
    hashtag_info: Optional[Dict[str, Any]] = None


class ProcessingJobStatus(BaseModel):
    """Processing job status schema."""
    job_id: UUID
    status: str  # queued, processing, completed, failed, cancelled
    progress: float  # 0.0 to 1.0
    current_phase: str
    processed_items: int
    total_items: int
    estimated_completion_seconds: Optional[int]
    result: Optional[Dict[str, Any]]
    aggregation_details: Optional[Dict[str, Any]]
    error_message: Optional[str]
    started_at: datetime
    completed_at: Optional[datetime]

    class Config:
        from_attributes = True
```

---

### Phase 6: Error Handling & Edge Cases

#### Edge Case 1: Job Timeout
```python
# In MapReduceService
MAX_JOB_DURATION_SECONDS = 600  # 10 minutes

async def process_query(self, ...):
    import asyncio

    try:
        # Wrap processing with timeout
        await asyncio.wait_for(
            self._do_processing(...),
            timeout=self.MAX_JOB_DURATION_SECONDS
        )
    except asyncio.TimeoutError:
        job.status = "failed"
        job.error_message = "Processing timeout exceeded"
        await db.commit()
        raise
```

#### Edge Case 2: Empty Folder
```python
# In _fetch_items_with_chunks
if not items_with_chunks:
    job.status = "completed"
    job.result = {
        "response": "The specified folder appears to be empty or has no processed items yet.",
        "sources": [],
        "context_count": 0
    }
    await db.commit()
    return job.result
```

#### Edge Case 3: All Batches Failed
```python
# In _map_phase
if job.failed_batches == job.total_batches:
    raise Exception("All batches failed to process")
```

#### Edge Case 4: Partial Results
```python
# In _build_aggregation_details
"processing_info": {
    ...
    "warning": "Some batches failed" if job.failed_batches > 0 else None,
    "confidence": confidence_score
}
```

#### Edge Case 5: Database Session in Background Task
```python
# Always create new session for background tasks
async def _process_job_in_background(self, job_id, user_id, folder_ids):
    from app.core.database import async_session_maker

    async with async_session_maker() as db:
        # Process here
        pass
```

#### Edge Case 6: User Deletes Conversation While Processing
```python
# In background processor, check if conversation still exists
conversation = await db.get(Conversation, job.conversation_id)
if not conversation:
    job.status = "cancelled"
    job.error_message = "Conversation was deleted"
    await db.commit()
    return
```

#### Edge Case 7: Duplicate Job Submission
```python
# In _handle_async_query, check for existing job
from sqlalchemy import select

existing_job_stmt = select(ProcessingJob).where(
    ProcessingJob.user_id == user_id,
    ProcessingJob.conversation_id == conversation.id,
    ProcessingJob.user_query == chat_request.message,
    ProcessingJob.status.in_(["queued", "processing"]),
    ProcessingJob.created_at > datetime.now(timezone.utc) - timedelta(minutes=5)
)

result = await db.execute(existing_job_stmt)
existing_job = result.scalar_one_or_none()

if existing_job:
    return ChatResponse(
        response="This query is already being processed. Please wait...",
        conversation_id=conversation.id,
        job_id=str(existing_job.id),
        job_status=existing_job.status,
        ...
    )
```

---

## Frontend Implementation

### Phase 1: Update API Client

#### File: `frontend/src/api/chat.ts` (or equivalent)

```typescript
export interface ChatResponse {
  response: string;
  conversation_id: string;
  job_id?: string;
  job_status?: 'queued' | 'processing' | 'completed' | 'failed';
  estimated_completion_seconds?: number;
  sources: Array<{
    title: string;
    source: string;
    similarity: number;
  }>;
  context_count: number;
  hashtag_info?: any;
}

export interface ProcessingJobStatus {
  job_id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number; // 0.0 to 1.0
  current_phase: string;
  processed_items: number;
  total_items: number;
  estimated_completion_seconds?: number;
  result?: {
    response: string;
    sources: any[];
    context_count: number;
  };
  aggregation_details?: AggregationDetails;
  error_message?: string;
  started_at: string;
  completed_at?: string;
}

export interface AggregationDetails {
  summary: {
    total?: number;
    count?: number;
    average?: number;
    by_category?: Record<string, { count: number; total: number }>;
    by_month?: Record<string, { count: number; total: number }>;
  };
  processing_info: {
    total_items_in_folder: number;
    items_processed: number;
    items_skipped: number;
    batches_processed: number;
    batches_failed: number;
    strategy: string;
    warning?: string;
    confidence: number;
  };
  top_items: Array<{
    source: string;
    value: number;
    unit?: string;
    date?: string;
    category?: string;
  }>;
}

export async function sendChatMessage(
  conversationId: string | null,
  message: string
): Promise<ChatResponse> {
  const response = await fetch('/api/v1/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getToken()}`
    },
    body: JSON.stringify({
      conversation_id: conversationId,
      message: message
    })
  });

  if (!response.ok) {
    throw new Error('Failed to send message');
  }

  return response.json();
}

export async function getJobStatus(jobId: string): Promise<ProcessingJobStatus> {
  const response = await fetch(`/api/v1/chat/jobs/${jobId}`, {
    headers: {
      'Authorization': `Bearer ${getToken()}`
    }
  });

  if (!response.ok) {
    throw new Error('Failed to fetch job status');
  }

  return response.json();
}

export async function cancelJob(jobId: string): Promise<void> {
  const response = await fetch(`/api/v1/chat/jobs/${jobId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${getToken()}`
    }
  });

  if (!response.ok) {
    throw new Error('Failed to cancel job');
  }
}
```

---

### Phase 2: Job Progress Component

#### File: `frontend/src/components/JobProgressIndicator.tsx` (or .jsx)

```typescript
import React, { useEffect, useState } from 'react';
import { ProcessingJobStatus } from '../api/chat';
import { getJobStatus } from '../api/chat';

interface JobProgressIndicatorProps {
  jobId: string;
  estimatedSeconds?: number;
  onComplete: (result: any) => void;
  onError: (error: string) => void;
}

export const JobProgressIndicator: React.FC<JobProgressIndicatorProps> = ({
  jobId,
  estimatedSeconds,
  onComplete,
  onError
}) => {
  const [jobStatus, setJobStatus] = useState<ProcessingJobStatus | null>(null);
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Start polling
    const interval = setInterval(async () => {
      try {
        const status = await getJobStatus(jobId);
        setJobStatus(status);

        if (status.status === 'completed') {
          clearInterval(interval);
          onComplete(status.result);
        } else if (status.status === 'failed') {
          clearInterval(interval);
          onError(status.error_message || 'Processing failed');
        }
      } catch (error) {
        console.error('Failed to fetch job status:', error);
      }
    }, 2000); // Poll every 2 seconds

    setPollingInterval(interval);

    // Cleanup
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [jobId]);

  if (!jobStatus) {
    return (
      <div className="job-progress">
        <div className="spinner"></div>
        <p>Initializing...</p>
      </div>
    );
  }

  const progressPercent = Math.round(jobStatus.progress * 100);

  return (
    <div className="job-progress-container">
      <div className="progress-header">
        <h4>Processing your request...</h4>
        <span className="progress-percent">{progressPercent}%</span>
      </div>

      <div className="progress-bar">
        <div
          className="progress-fill"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <div className="progress-details">
        <p className="current-phase">
          {getPhaseLabel(jobStatus.current_phase)}
        </p>

        {jobStatus.total_items > 0 && (
          <p className="items-count">
            Processing {jobStatus.processed_items} of {jobStatus.total_items} items
          </p>
        )}

        {estimatedSeconds && jobStatus.status === 'queued' && (
          <p className="estimated-time">
            Estimated time: {formatDuration(estimatedSeconds)}
          </p>
        )}
      </div>

      <p className="help-text">
        Feel free to navigate away—we'll save your results.
      </p>
    </div>
  );
};

function getPhaseLabel(phase: string): string {
  const labels: Record<string, string> = {
    'queued': 'Queued...',
    'initialization': 'Setting up...',
    'map': 'Analyzing items...',
    'reduce': 'Combining results...',
    'synthesis': 'Generating response...',
    'complete': 'Complete!'
  };

  return labels[phase] || phase;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds} seconds`;
  } else {
    const minutes = Math.floor(seconds / 60);
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  }
}
```

**Styles** (`frontend/src/components/JobProgressIndicator.css`):
```css
.job-progress-container {
  padding: 20px;
  background: #f5f5f5;
  border-radius: 8px;
  margin: 10px 0;
}

.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.progress-header h4 {
  margin: 0;
  font-size: 16px;
  color: #333;
}

.progress-percent {
  font-size: 18px;
  font-weight: bold;
  color: #0066cc;
}

.progress-bar {
  width: 100%;
  height: 8px;
  background: #e0e0e0;
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 10px;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #0066cc, #0099ff);
  transition: width 0.3s ease;
}

.progress-details {
  margin-top: 10px;
}

.current-phase {
  font-size: 14px;
  color: #666;
  margin: 5px 0;
}

.items-count {
  font-size: 13px;
  color: #888;
  margin: 5px 0;
}

.estimated-time {
  font-size: 13px;
  color: #888;
  font-style: italic;
}

.help-text {
  font-size: 12px;
  color: #999;
  margin-top: 10px;
  text-align: center;
}

.spinner {
  border: 3px solid #f3f3f3;
  border-top: 3px solid #0066cc;
  border-radius: 50%;
  width: 30px;
  height: 30px;
  animation: spin 1s linear infinite;
  margin: 20px auto;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
```

---

### Phase 3: Aggregation Details Component

#### File: `frontend/src/components/AggregationDetails.tsx`

```typescript
import React, { useState } from 'react';
import { AggregationDetails as Details } from '../api/chat';

interface AggregationDetailsProps {
  details: Details;
}

export const AggregationDetailsComponent: React.FC<AggregationDetailsProps> = ({
  details
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="aggregation-details">
      <button
        className="toggle-details-btn"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded ? '▼' : '▶'} Show Details
      </button>

      {isExpanded && (
        <div className="details-content">
          {/* Summary Section */}
          {details.summary && (
            <section className="details-section">
              <h4>Summary</h4>
              <ul>
                {details.summary.total !== undefined && (
                  <li><strong>Total:</strong> ${details.summary.total.toFixed(2)}</li>
                )}
                {details.summary.count !== undefined && (
                  <li><strong>Count:</strong> {details.summary.count} items</li>
                )}
                {details.summary.average !== undefined && (
                  <li><strong>Average:</strong> ${details.summary.average.toFixed(2)}</li>
                )}
              </ul>
            </section>
          )}

          {/* Processing Info */}
          {details.processing_info && (
            <section className="details-section">
              <h4>Processing Information</h4>
              <ul>
                <li>Items in folder: {details.processing_info.total_items_in_folder}</li>
                <li>Items processed: {details.processing_info.items_processed}</li>
                <li>Items skipped: {details.processing_info.items_skipped}</li>
                <li>Batches processed: {details.processing_info.batches_processed}</li>
                {details.processing_info.batches_failed > 0 && (
                  <li className="warning">
                    Batches failed: {details.processing_info.batches_failed}
                  </li>
                )}
                <li>Strategy: {details.processing_info.strategy}</li>
                <li>Confidence: {(details.processing_info.confidence * 100).toFixed(0)}%</li>
              </ul>

              {details.processing_info.warning && (
                <div className="warning-box">
                  ⚠️ {details.processing_info.warning}
                </div>
              )}
            </section>
          )}

          {/* Category Breakdown */}
          {details.summary?.by_category &&
           Object.keys(details.summary.by_category).length > 0 && (
            <section className="details-section">
              <h4>Breakdown by Category</h4>
              <table className="breakdown-table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Count</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(details.summary.by_category).map(([category, data]) => (
                    <tr key={category}>
                      <td>{category}</td>
                      <td>{data.count}</td>
                      <td>${data.total.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {/* Monthly Breakdown */}
          {details.summary?.by_month &&
           Object.keys(details.summary.by_month).length > 0 && (
            <section className="details-section">
              <h4>Breakdown by Month</h4>
              <table className="breakdown-table">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Count</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(details.summary.by_month)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([month, data]) => (
                      <tr key={month}>
                        <td>{formatMonth(month)}</td>
                        <td>{data.count}</td>
                        <td>${data.total.toFixed(2)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </section>
          )}

          {/* Top Items */}
          {details.top_items && details.top_items.length > 0 && (
            <section className="details-section">
              <h4>Top Items</h4>
              <table className="breakdown-table">
                <thead>
                  <tr>
                    <th>Source</th>
                    <th>Value</th>
                    <th>Date</th>
                    <th>Category</th>
                  </tr>
                </thead>
                <tbody>
                  {details.top_items.slice(0, 10).map((item, idx) => (
                    <tr key={idx}>
                      <td className="source-cell">{item.source}</td>
                      <td>${item.value.toFixed(2)}</td>
                      <td>{item.date || 'N/A'}</td>
                      <td>{item.category || 'N/A'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </div>
      )}
    </div>
  );
};

function formatMonth(monthStr: string): string {
  // monthStr format: "YYYY-MM"
  const [year, month] = monthStr.split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
}
```

**Styles** (`frontend/src/components/AggregationDetails.css`):
```css
.aggregation-details {
  margin-top: 15px;
  border: 1px solid #ddd;
  border-radius: 8px;
  overflow: hidden;
}

.toggle-details-btn {
  width: 100%;
  padding: 12px;
  background: #f9f9f9;
  border: none;
  cursor: pointer;
  text-align: left;
  font-size: 14px;
  font-weight: 500;
  color: #333;
  transition: background 0.2s;
}

.toggle-details-btn:hover {
  background: #f0f0f0;
}

.details-content {
  padding: 15px;
  background: white;
}

.details-section {
  margin-bottom: 20px;
}

.details-section:last-child {
  margin-bottom: 0;
}

.details-section h4 {
  margin: 0 0 10px 0;
  font-size: 16px;
  color: #333;
  border-bottom: 2px solid #0066cc;
  padding-bottom: 5px;
}

.details-section ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.details-section li {
  padding: 5px 0;
  font-size: 14px;
  color: #555;
}

.details-section li.warning {
  color: #ff6600;
  font-weight: 500;
}

.warning-box {
  background: #fff3cd;
  border: 1px solid #ffc107;
  border-radius: 4px;
  padding: 10px;
  margin-top: 10px;
  font-size: 13px;
  color: #856404;
}

.breakdown-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.breakdown-table th {
  background: #f5f5f5;
  padding: 8px;
  text-align: left;
  font-weight: 600;
  border-bottom: 2px solid #ddd;
}

.breakdown-table td {
  padding: 8px;
  border-bottom: 1px solid #eee;
}

.breakdown-table tr:hover {
  background: #f9f9f9;
}

.source-cell {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

---

### Phase 4: Chat Interface Integration

#### File: `frontend/src/components/Chat.tsx` (or wherever chat UI is)

```typescript
import React, { useState } from 'react';
import { sendChatMessage } from '../api/chat';
import { JobProgressIndicator } from './JobProgressIndicator';
import { AggregationDetailsComponent } from './AggregationDetails';

export const ChatInterface: React.FC = () => {
  const [messages, setMessages] = useState<any[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;

    const userMessage = {
      role: 'user',
      content: inputValue
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      const response = await sendChatMessage(
        currentConversationId,
        inputValue
      );

      if (response.job_id && response.job_status !== 'completed') {
        // Async job - show progress indicator
        setActiveJobId(response.job_id);

        // Add placeholder message
        const placeholderMessage = {
          role: 'assistant',
          content: response.response,
          isProcessing: true,
          jobId: response.job_id,
          estimatedSeconds: response.estimated_completion_seconds
        };

        setMessages(prev => [...prev, placeholderMessage]);
      } else {
        // Quick response
        const assistantMessage = {
          role: 'assistant',
          content: response.response,
          sources: response.sources,
          aggregationDetails: response.aggregation_details
        };

        setMessages(prev => [...prev, assistantMessage]);
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      // Show error message
      const errorMessage = {
        role: 'assistant',
        content: 'Sorry, there was an error processing your message.',
        isError: true
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleJobComplete = (result: any) => {
    // Replace processing message with actual result
    setMessages(prev => prev.map(msg => {
      if (msg.jobId === activeJobId) {
        return {
          ...msg,
          content: result.response,
          sources: result.sources,
          aggregationDetails: result.aggregation_details,  // Add this
          isProcessing: false
        };
      }
      return msg;
    }));

    setActiveJobId(null);
  };

  const handleJobError = (error: string) => {
    setMessages(prev => prev.map(msg => {
      if (msg.jobId === activeJobId) {
        return {
          ...msg,
          content: `Processing failed: ${error}`,
          isProcessing: false,
          isError: true
        };
      }
      return msg;
    }));

    setActiveJobId(null);
  };

  return (
    <div className="chat-container">
      <div className="messages-list">
        {messages.map((message, index) => (
          <div key={index} className={`message message-${message.role}`}>
            <div className="message-content">
              {message.content}
            </div>

            {message.isProcessing && message.jobId && (
              <JobProgressIndicator
                jobId={message.jobId}
                estimatedSeconds={message.estimatedSeconds}
                onComplete={handleJobComplete}
                onError={handleJobError}
              />
            )}

            {message.aggregationDetails && !message.isProcessing && (
              <AggregationDetailsComponent
                details={message.aggregationDetails}
              />
            )}

            {message.sources && message.sources.length > 0 && (
              <div className="message-sources">
                <h5>Sources:</h5>
                <ul>
                  {message.sources.map((source: any, idx: number) => (
                    <li key={idx}>
                      <a href={source.source} target="_blank" rel="noopener noreferrer">
                        {source.title}
                      </a>
                      <span className="similarity">
                        ({(source.similarity * 100).toFixed(0)}% relevant)
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="chat-input">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
          placeholder="Type your message..."
          disabled={isLoading}
        />
        <button onClick={handleSendMessage} disabled={isLoading}>
          Send
        </button>
      </div>
    </div>
  );
};
```

---

### Phase 5: Conversation Load - Check for Completed Jobs

#### File: `frontend/src/hooks/useConversation.ts` (or similar)

```typescript
import { useEffect, useState } from 'react';
import { getJobStatus } from '../api/chat';

export const useConversation = (conversationId: string) => {
  const [messages, setMessages] = useState<any[]>([]);

  useEffect(() => {
    loadConversation();
  }, [conversationId]);

  const loadConversation = async () => {
    // Fetch conversation messages
    const response = await fetch(`/api/v1/chat/conversations/${conversationId}/messages`);
    const data = await response.json();

    setMessages(data.messages);

    // Check for any pending jobs that might have completed
    const jobsResponse = await fetch(
      `/api/v1/chat/jobs?conversation_id=${conversationId}&status=completed`
    );
    const jobsData = await jobsResponse.json();

    // If there are completed jobs not yet in messages, add them
    for (const job of jobsData) {
      const jobAlreadyInMessages = data.messages.some(
        (msg: any) => msg.metadata?.job_id === job.job_id
      );

      if (!jobAlreadyInMessages && job.result) {
        // Add completed job result as message
        const newMessage = {
          role: 'assistant',
          content: job.result.response,
          sources: job.result.sources,
          aggregationDetails: job.aggregation_details,
          metadata: {
            job_id: job.job_id,
            completed_at: job.completed_at
          }
        };

        setMessages(prev => [...prev, newMessage]);
      }
    }
  };

  return { messages, setMessages };
};
```

---

### Phase 6: Frontend Edge Cases

#### Edge Case 1: User Navigates Away and Returns
```typescript
// In useConversation hook
useEffect(() => {
  const checkForCompletedJobs = async () => {
    // Check every 5 seconds when tab is active
    if (document.visibilityState === 'visible') {
      await loadConversation();
    }
  };

  const interval = setInterval(checkForCompletedJobs, 5000);

  return () => clearInterval(interval);
}, [conversationId]);
```

#### Edge Case 2: Multiple Async Jobs in Same Conversation
```typescript
// Track multiple active jobs
const [activeJobs, setActiveJobs] = useState<Set<string>>(new Set());

// When starting new job
setActiveJobs(prev => new Set(prev).add(jobId));

// When job completes
setActiveJobs(prev => {
  const updated = new Set(prev);
  updated.delete(jobId);
  return updated;
});
```

#### Edge Case 3: Job Fails After User Leaves
```typescript
// In loadConversation, also check for failed jobs
const failedJobsResponse = await fetch(
  `/api/v1/chat/jobs?conversation_id=${conversationId}&status=failed`
);
const failedJobs = await failedJobsResponse.json();

for (const job of failedJobs) {
  // Show error message for failed jobs
  const errorMessage = {
    role: 'assistant',
    content: `Sorry, your query "${job.user_query}" failed to process: ${job.error_message}`,
    isError: true,
    metadata: { job_id: job.job_id }
  };

  setMessages(prev => [...prev, errorMessage]);
}
```

#### Edge Case 4: Network Error During Polling
```typescript
// In JobProgressIndicator
const [consecutiveErrors, setConsecutiveErrors] = useState(0);

useEffect(() => {
  const interval = setInterval(async () => {
    try {
      const status = await getJobStatus(jobId);
      setJobStatus(status);
      setConsecutiveErrors(0); // Reset on success

      // ... handle completion/failure
    } catch (error) {
      setConsecutiveErrors(prev => prev + 1);

      // After 5 consecutive errors, stop polling and show error
      if (consecutiveErrors >= 5) {
        clearInterval(interval);
        onError('Lost connection to server. Please refresh the page.');
      }
    }
  }, 2000);

  return () => clearInterval(interval);
}, [jobId, consecutiveErrors]);
```

---

## Testing Plan

### Backend Tests

#### Test 1: Intent Classification
```python
# File: backend/app/tests/test_intent_service.py

import pytest
from app.services.intent_service import intent_classifier

@pytest.mark.asyncio
async def test_intent_classification_aggregation():
    """Test that aggregation queries are classified correctly."""

    result = await intent_classifier.classify_intent(
        user_query="What's my total spending in Amazon?",
        folder_ids=[uuid4()],
        folder_item_counts={uuid4(): 100}
    )

    assert result["intent_type"] in ["aggregation", "filtered_aggregation"]
    assert result["requires_async"] == True
    assert result["estimated_items"] > 0


@pytest.mark.asyncio
async def test_intent_classification_quick_qa():
    """Test that simple QA is classified correctly."""

    result = await intent_classifier.classify_intent(
        user_query="What is the capital of France?",
        folder_ids=None,
        folder_item_counts=None
    )

    assert result["intent_type"] == "quick_qa"
    assert result["requires_async"] == False
```

#### Test 2: Map-Reduce Processing
```python
# File: backend/app/tests/test_mapreduce_service.py

@pytest.mark.asyncio
async def test_map_reduce_full_flow(db_session, test_user):
    """Test full map-reduce flow."""

    # Create test data
    folder = await create_test_folder(db_session, test_user)
    items = await create_test_items(db_session, test_user, folder.id, count=50)

    # Create job
    job = ProcessingJob(
        user_id=test_user.id,
        conversation_id=uuid4(),
        job_type="aggregation",
        user_query="What's the total?",
        intent_data={"intent_type": "aggregation"}
    )
    db_session.add(job)
    await db_session.commit()

    # Process
    result = await mapreduce_service.process_query(
        db=db_session,
        job=job,
        user_query=job.user_query,
        intent_data=job.intent_data,
        folder_ids=[folder.id]
    )

    assert result["response"]
    assert job.status == "completed"
    assert job.progress == 1.0
    assert job.aggregation_details is not None
```

#### Test 3: Error Handling
```python
@pytest.mark.asyncio
async def test_map_reduce_handles_failures(db_session, test_user):
    """Test that partial failures are handled gracefully."""

    # Mock LLM to fail intermittently
    with patch('app.core.embeddings.chat_service.generate_completion') as mock_llm:
        mock_llm.side_effect = [
            Exception("API error"),  # First batch fails
            '{"relevant": true, "extracted_data": []}',  # Second succeeds
        ]

        result = await mapreduce_service.process_query(...)

        # Should complete despite partial failure
        assert result is not None
        assert job.failed_batches > 0
        assert job.status == "completed"
```

### Frontend Tests

#### Test 1: Job Progress Display
```typescript
// File: frontend/src/components/__tests__/JobProgressIndicator.test.tsx

import { render, waitFor } from '@testing-library/react';
import { JobProgressIndicator } from '../JobProgressIndicator';
import * as api from '../../api/chat';

jest.mock('../../api/chat');

test('displays progress updates', async () => {
  const mockJobStatus = {
    job_id: '123',
    status: 'processing',
    progress: 0.5,
    current_phase: 'map',
    processed_items: 50,
    total_items: 100
  };

  (api.getJobStatus as jest.Mock).mockResolvedValue(mockJobStatus);

  const { getByText } = render(
    <JobProgressIndicator
      jobId="123"
      onComplete={jest.fn()}
      onError={jest.fn()}
    />
  );

  await waitFor(() => {
    expect(getByText('50%')).toBeInTheDocument();
    expect(getByText(/Analyzing items/)).toBeInTheDocument();
    expect(getByText(/50 of 100/)).toBeInTheDocument();
  });
});

test('calls onComplete when job finishes', async () => {
  const onComplete = jest.fn();

  (api.getJobStatus as jest.Mock)
    .mockResolvedValueOnce({ status: 'processing', progress: 0.5 })
    .mockResolvedValueOnce({
      status: 'completed',
      progress: 1.0,
      result: { response: 'Done!' }
    });

  render(
    <JobProgressIndicator
      jobId="123"
      onComplete={onComplete}
      onError={jest.fn()}
    />
  );

  await waitFor(() => {
    expect(onComplete).toHaveBeenCalledWith({ response: 'Done!' });
  }, { timeout: 5000 });
});
```

---

## Deployment Checklist

### Database Migration
- [ ] Run `alembic revision --autogenerate -m "Add processing_jobs table"`
- [ ] Review generated migration
- [ ] Run `alembic upgrade head` on dev environment
- [ ] Test rollback: `alembic downgrade -1`
- [ ] Run migration on production

### Backend Deployment
- [ ] Deploy new service files (intent_service, mapreduce_service)
- [ ] Update chat_service with background task support
- [ ] Add new API endpoints for job status
- [ ] Update environment variables (if any)
- [ ] Verify background tasks are working (check logs)
- [ ] Monitor first few async jobs in production

### Frontend Deployment
- [ ] Build and deploy new components (JobProgressIndicator, AggregationDetails)
- [ ] Update API client with new endpoints
- [ ] Test polling mechanism
- [ ] Verify styles are loading correctly
- [ ] Test on multiple browsers

### Monitoring
- [ ] Set up alerts for job failures
- [ ] Monitor job processing times
- [ ] Track job success/failure rates
- [ ] Monitor database for stale jobs (queued >1 hour)
- [ ] Set up cleanup job for old completed jobs (>7 days)

### Documentation
- [ ] Document new API endpoints
- [ ] Update user guide with async query info
- [ ] Document intent classification logic for future tuning
- [ ] Create troubleshooting guide for failed jobs

---

## Performance Optimization Notes

### For Large Folders (1000+ items)

1. **Increase parallelism:**
   ```python
   MAX_CONCURRENT_MAP_CALLS = 20  # From 10
   ```

2. **Batch size tuning:**
   ```python
   TARGET_CHUNKS_PER_BATCH = 15  # From 10
   ```

3. **Add caching for embeddings:**
   ```python
   # Cache folder embeddings for repeated queries
   ```

4. **Consider hierarchical reduce for >100 batches**

### For Cost Optimization

1. **Use cheaper model for map phase:**
   ```python
   # In MapReduceService
   MAP_MODEL = "gpt-4o-mini"  # Cheaper
   REDUCE_MODEL = "gpt-4o"    # More capable
   ```

2. **Reduce token usage in prompts:**
   - Trim chunk previews to 200 chars
   - Limit metadata in context

3. **Cache intent classification results:**
   - Same query in short timeframe → reuse intent

---

## Appendix: Full File Structure

```
backend/
├── app/
│   ├── api/
│   │   └── v1/
│   │       └── endpoints/
│   │           └── chat.py (MODIFIED)
│   ├── core/
│   │   └── embeddings.py (existing)
│   ├── models/
│   │   ├── database.py (MODIFIED - add ProcessingJob)
│   │   └── schemas.py (MODIFIED - add schemas)
│   └── services/
│       ├── chat_service.py (MODIFIED)
│       ├── intent_service.py (NEW)
│       ├── mapreduce_service.py (NEW)
│       └── search_service.py (existing)
│
frontend/
├── src/
│   ├── api/
│   │   └── chat.ts (MODIFIED)
│   ├── components/
│   │   ├── JobProgressIndicator.tsx (NEW)
│   │   ├── JobProgressIndicator.css (NEW)
│   │   ├── AggregationDetails.tsx (NEW)
│   │   ├── AggregationDetails.css (NEW)
│   │   └── Chat.tsx (MODIFIED)
│   └── hooks/
│       └── useConversation.ts (NEW)
```

---

## Summary

This implementation provides:

✅ **Intent-driven routing** - LLM classifies queries automatically
✅ **Async processing** - Long queries don't block the user
✅ **Progress tracking** - Real-time updates on job status
✅ **Map-reduce architecture** - Scales to thousands of items
✅ **Detailed aggregation** - Transparent breakdown for verification
✅ **Error resilience** - Graceful handling of failures
✅ **User experience** - Can navigate away and return
✅ **Edge case handling** - Comprehensive coverage of failure modes

The system is production-ready with proper error handling, monitoring, and user feedback.
