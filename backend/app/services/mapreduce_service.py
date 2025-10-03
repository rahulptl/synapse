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
    MAX_JOB_DURATION_SECONDS = 600  # 10 minutes

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
                job.status = "completed"
                job.result = {
                    "response": "The specified folder appears to be empty or has no processed items yet.",
                    "sources": [],
                    "context_count": 0
                }
                job.completed_at = datetime.now(timezone.utc)
                await db.commit()
                return job.result

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

        # Check if all batches failed
        if job.failed_batches == job.total_batches:
            raise Exception("All batches failed to process")

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
