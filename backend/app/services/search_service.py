"""
Search service for text-based content search.
"""
import re
import math
import numpy as np
from collections import Counter
from typing import List, Optional, Dict, Any, Union
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, func
from sqlalchemy.orm import selectinload
import logging

from app.models.database import KnowledgeItem, Folder, Vector
from app.models.schemas import ContentType
from app.core.embeddings import embedding_service

logger = logging.getLogger(__name__)


def reciprocal_rank_fusion(
    ranked_lists: List[List[Dict[str, Any]]],
    k: int = 60
) -> List[Dict[str, Any]]:
    """
    Merge multiple ranked lists using Reciprocal Rank Fusion (RRF).

    RRF formula: score(d) = sum over all rankings r: 1 / (k + rank_r(d))
    where k is a constant (default 60) and rank_r(d) is the rank of document d in ranking r.

    Args:
        ranked_lists: List of ranked result lists
        k: Constant for RRF (default 60, commonly used value)

    Returns:
        Merged and re-ranked results
    """
    # Collect all unique documents with their RRF scores
    doc_scores: Dict[str, Dict[str, Any]] = {}

    for ranked_list in ranked_lists:
        for rank, doc in enumerate(ranked_list, start=1):
            doc_id = doc['id']
            rrf_score = 1 / (k + rank)

            if doc_id not in doc_scores:
                doc_scores[doc_id] = {
                    **doc,  # Keep original document data
                    'rrf_score': 0.0,
                    'appearances': 0
                }

            doc_scores[doc_id]['rrf_score'] += rrf_score
            doc_scores[doc_id]['appearances'] += 1

    # Sort by RRF score
    merged_results = sorted(
        doc_scores.values(),
        key=lambda x: x['rrf_score'],
        reverse=True
    )

    return merged_results


def convert_numpy_types(obj: Any) -> Any:
    """
    Recursively convert numpy types to native Python types for JSON serialization.

    Args:
        obj: Object that may contain numpy types

    Returns:
        Object with numpy types converted to Python types
    """
    if isinstance(obj, np.floating):
        logger.debug(f"Converting numpy.floating {type(obj)} to float: {obj}")
        return float(obj)
    elif isinstance(obj, np.integer):
        logger.debug(f"Converting numpy.integer {type(obj)} to int: {obj}")
        return int(obj)
    elif isinstance(obj, np.ndarray):
        logger.debug(f"Converting numpy.ndarray to list: shape={obj.shape}")
        return obj.tolist()
    elif isinstance(obj, dict):
        return {key: convert_numpy_types(value) for key, value in obj.items()}
    elif isinstance(obj, list):
        return [convert_numpy_types(item) for item in obj]
    elif isinstance(obj, tuple):
        return tuple(convert_numpy_types(item) for item in obj)
    else:
        return obj


class SearchService:
    """Service for text-based search functionality."""

    def __init__(self):
        # BM25 parameters
        self.k1 = 1.2  # Term frequency saturation parameter
        self.b = 0.75  # Length normalization parameter

    def _tokenize(self, text: str) -> List[str]:
        """Tokenize text into terms for BM25."""
        # Simple tokenization - can be enhanced with proper NLP tokenizer
        text = text.lower()
        # Remove punctuation and split on whitespace
        text = re.sub(r'[^\w\s]', ' ', text)
        tokens = text.split()
        return [token for token in tokens if len(token) > 2]  # Filter short tokens

    def _calculate_bm25_score(
        self,
        query_terms: List[str],
        document_terms: List[str],
        document_length: int,
        avg_document_length: float,
        corpus_size: int,
        term_document_frequencies: Dict[str, int]
    ) -> float:
        """Calculate BM25 score for a document."""
        score = 0.0

        for term in query_terms:
            if term in document_terms:
                # Term frequency in document
                tf = document_terms.count(term)

                # Document frequency (number of documents containing the term)
                df = term_document_frequencies.get(term, 1)

                # Inverse document frequency
                idf = math.log((corpus_size - df + 0.5) / (df + 0.5))

                # BM25 formula
                numerator = tf * (self.k1 + 1)
                denominator = tf + self.k1 * (1 - self.b + self.b * (document_length / avg_document_length))

                score += idf * (numerator / denominator)

        return score

    def _calculate_corpus_stats(self, documents: List[Dict[str, Any]]) -> tuple[float, Dict[str, int]]:
        """Calculate average document length and term document frequencies."""
        total_length = 0
        term_doc_freq = Counter()

        for doc in documents:
            # Combine title and content for BM25 calculation
            doc_text = f"{doc['title']} {doc['content']}"
            doc_tokens = self._tokenize(doc_text)
            total_length += len(doc_tokens)

            # Count unique terms in this document
            unique_terms = set(doc_tokens)
            for term in unique_terms:
                term_doc_freq[term] += 1

        avg_length = total_length / len(documents) if documents else 0
        return avg_length, dict(term_doc_freq)

    def parse_hashtags_from_message(self, message: str) -> Dict[str, Any]:
        """
        Parse hashtags/references from message.

        Supports # for both folder and file references. The chat service
        will determine whether each reference is a folder or filename.

        Returns:
            Dict with:
            - hashtags: List of # references (could be folders or files)
            - cleaned_message: Message with # references removed
            - original_message: Original message
        """
        hashtag_regex = re.compile(r'#([\w\-_\.]+)')  # Added \. to support filenames with extensions
        hashtags = hashtag_regex.findall(message)

        cleaned_message = hashtag_regex.sub('', message).strip()
        cleaned_message = re.sub(r'\s+', ' ', cleaned_message)

        return {
            "hashtags": hashtags,
            "cleaned_message": cleaned_message,
            "original_message": message
        }

    def parse_file_references_from_message(self, message: str) -> Dict[str, Any]:
        """
        Parse @ file references from message.

        Supports @ for explicit file references (e.g., @budget_2024.pdf).

        Returns:
            Dict with:
            - file_refs: List of @ file references
            - cleaned_message: Message with @ references removed
            - original_message: Original message
        """
        file_ref_regex = re.compile(r'@([\w\-_\.]+)')  # Matches @filename patterns
        file_refs = file_ref_regex.findall(message)

        cleaned_message = file_ref_regex.sub('', message).strip()
        cleaned_message = re.sub(r'\s+', ' ', cleaned_message)

        return {
            "file_refs": file_refs,
            "cleaned_message": cleaned_message,
            "original_message": message
        }

    def parse_all_references_from_message(self, message: str) -> Dict[str, Any]:
        """
        Parse both # (folders) and @ (files) references from message.

        Returns:
            Dict with:
            - hashtags: List of # references (folders)
            - file_refs: List of @ references (files)
            - cleaned_message: Message with both types removed
            - original_message: Original message
        """
        hashtag_regex = re.compile(r'#([\w\-_\.]+)')
        file_ref_regex = re.compile(r'@([\w\-_\.]+)')

        hashtags = hashtag_regex.findall(message)
        file_refs = file_ref_regex.findall(message)

        # Remove both types of references
        cleaned_message = hashtag_regex.sub('', message)
        cleaned_message = file_ref_regex.sub('', cleaned_message).strip()
        cleaned_message = re.sub(r'\s+', ' ', cleaned_message)

        return {
            "hashtags": hashtags,
            "file_refs": file_refs,
            "cleaned_message": cleaned_message,
            "original_message": message
        }

    async def get_folder_ids_by_names(
        self,
        db: AsyncSession,
        folder_names: List[str],
        user_id: UUID
    ) -> List[Dict[str, Any]]:
        """
        Look up folder IDs by names for a specific user.
        Matches the logic from the rag-chat edge function.
        """
        if not folder_names:
            return []

        stmt = (
            select(Folder.id, Folder.name)
            .where(
                and_(
                    Folder.user_id == user_id,
                    Folder.name.in_(folder_names)
                )
            )
        )

        result = await db.execute(stmt)
        folders = [{"id": row.id, "name": row.name} for row in result.all()]

        return folders

    def _calculate_fuzzy_similarity(self, query: str, text: str) -> float:
        """
        Calculate fuzzy similarity score between query and text.

        Uses multiple strategies:
        1. Exact substring match (highest score)
        2. Case-insensitive match
        3. Word-level matching
        4. Character-level similarity

        Returns: Similarity score from 0.0 to 100.0
        """
        query_lower = query.lower()
        text_lower = text.lower()

        # Normalize by removing special characters
        query_norm = re.sub(r'[^a-z0-9]+', '', query_lower)
        text_norm = re.sub(r'[^a-z0-9]+', '', text_lower)

        # Strategy 1: Exact substring match
        if query_lower in text_lower:
            return 95.0

        # Strategy 2: Exact normalized match
        if query_norm in text_norm:
            return 90.0

        # Strategy 3: All query words present
        query_words = query_lower.split()
        text_words = text_lower.split()
        if all(any(qw in tw for tw in text_words) for qw in query_words):
            return 85.0

        # Strategy 4: Partial word matching
        matched_words = sum(1 for qw in query_words if any(qw in tw for tw in text_words))
        if matched_words > 0:
            word_score = (matched_words / len(query_words)) * 80.0
            return word_score

        # Strategy 5: Character-level similarity (basic Levenshtein-like)
        # Count common characters
        query_chars = set(query_norm)
        text_chars = set(text_norm)
        common = query_chars & text_chars
        if common:
            char_score = (len(common) / max(len(query_chars), len(text_chars))) * 60.0
            return char_score

        return 0.0

    async def match_filenames(
        self,
        db: AsyncSession,
        file_references: List[str],
        folder_ids: Optional[List[UUID]],
        user_id: UUID,
        min_similarity: float = 70.0
    ) -> List[Dict[str, Any]]:
        """
        Fuzzy match file references to actual filenames.

        Args:
            db: Database session
            file_references: List of #filename references from message
            folder_ids: Optional list of folder IDs to search within
            user_id: User ID
            min_similarity: Minimum similarity score to include (0-100)

        Returns:
            List of matched items with similarity scores
        """
        if not file_references:
            return []

        matched_items = []

        for file_ref in file_references:
            # Build query for potential matches
            stmt = select(KnowledgeItem).where(
                KnowledgeItem.user_id == user_id
            )

            # Filter by folders if specified
            if folder_ids:
                stmt = stmt.where(KnowledgeItem.folder_id.in_(folder_ids))

            # Use database LIKE for initial filtering (more efficient)
            stmt = stmt.where(
                or_(
                    KnowledgeItem.title.ilike(f"%{file_ref}%"),
                    func.jsonb_extract_path_text(
                        KnowledgeItem.item_metadata, 'original_filename'
                    ).ilike(f"%{file_ref}%")
                )
            ).limit(10)  # Limit to top candidates

            result = await db.execute(stmt)
            items = result.scalars().all()

            # Calculate fuzzy similarity for each candidate
            for item in items:
                # Check similarity against title
                title_score = self._calculate_fuzzy_similarity(file_ref, item.title)

                # Check similarity against original filename if available
                filename_score = 0.0
                if item.item_metadata and 'original_filename' in item.item_metadata:
                    filename_score = self._calculate_fuzzy_similarity(
                        file_ref, item.item_metadata['original_filename']
                    )

                # Use the higher score
                best_score = max(title_score, filename_score)

                if best_score >= min_similarity:
                    matched_items.append({
                        "id": item.id,
                        "title": item.title,
                        "folder_id": item.folder_id,
                        "reference": file_ref,
                        "match_score": best_score,
                        "matched_field": "title" if title_score >= filename_score else "filename"
                    })

        # Sort by match score (highest first)
        matched_items.sort(key=lambda x: x["match_score"], reverse=True)

        logger.debug(f"Matched {len(matched_items)} files for references: {file_references}")
        return matched_items

    async def semantic_search(
        self,
        db: AsyncSession,
        user_id: UUID,
        query_text: str,
        folder_ids: Optional[List[UUID]] = None,
        item_ids: Optional[List[UUID]] = None,
        limit: int = 10,
        use_hybrid_ranking: bool = True,
        semantic_weight: float = 0.7,
        bm25_weight: float = 0.3,
        retrieval_strategy: str = "top_k"
    ) -> List[Dict[str, Any]]:
        """
        Perform semantic search using vector embeddings with optional BM25 hybrid ranking.

        Args:
            item_ids: Optional list of specific knowledge item IDs to search within
        """
        try:
            # Generate embedding for the search query
            query_embedding = await embedding_service.generate_embedding(query_text)
            logger.debug('Generated query embedding for semantic search')

            # Build the search query
            stmt = (
                select(Vector, KnowledgeItem, Folder.name.label('folder_name'))
                .join(KnowledgeItem, Vector.knowledge_item_id == KnowledgeItem.id)
                .join(Folder, KnowledgeItem.folder_id == Folder.id)
                .where(KnowledgeItem.user_id == user_id)
            )

            # Apply folder filter if specified
            if folder_ids and len(folder_ids) > 0:
                # Ensure folder_ids is a list and contains valid UUIDs
                valid_folder_ids = [fid for fid in folder_ids if fid is not None]
                if valid_folder_ids:
                    stmt = stmt.where(KnowledgeItem.folder_id.in_(valid_folder_ids))
                    logger.info(f'🔍 Folder filter applied: searching within {len(valid_folder_ids)} folders: {[str(fid) for fid in valid_folder_ids]}')

            # Apply item filter if specified (for #filename references)
            if item_ids and len(item_ids) > 0:
                valid_item_ids = [iid for iid in item_ids if iid is not None]
                if valid_item_ids:
                    stmt = stmt.where(KnowledgeItem.id.in_(valid_item_ids))
                    logger.debug(f'Filtering search to {len(valid_item_ids)} specific items')

            # Execute the search query
            result = await db.execute(stmt)
            vector_results = result.all()

            if not vector_results:
                logger.debug('No vector results found')
                return []

            # Calculate semantic similarities for all results
            results_with_scores = []
            for row in vector_results:
                vector, knowledge_item, folder_name = row

                if vector.embedding is None or len(vector.embedding) == 0:
                    continue

                # Calculate cosine similarity
                dot_product = sum(a * b for a, b in zip(query_embedding, vector.embedding))
                magnitude_a = math.sqrt(sum(a * a for a in query_embedding))
                magnitude_b = math.sqrt(sum(b * b for b in vector.embedding))
                semantic_score = dot_product / (magnitude_a * magnitude_b) if (magnitude_a * magnitude_b) != 0 else 0

                # Convert to native Python float to avoid numpy serialization issues
                semantic_score = float(semantic_score)

                # Use full content from knowledge_item instead of just the preview
                # This ensures the LLM has complete context to answer questions
                full_content = knowledge_item.content if knowledge_item.content else vector.content_preview

                result_item = {
                    'id': knowledge_item.id,
                    'title': knowledge_item.title,
                    'content': full_content,
                    'content_type': knowledge_item.content_type,
                    'source_url': knowledge_item.source_url,
                    'folder_name': folder_name,
                    'similarity': semantic_score,
                    'semantic_score': semantic_score,
                    'created_at': knowledge_item.created_at.isoformat() if knowledge_item.created_at else None
                }

                results_with_scores.append(result_item)

            # Apply BM25 hybrid ranking if enabled
            if use_hybrid_ranking and results_with_scores:
                results_with_scores = self._apply_hybrid_ranking(
                    query_text, results_with_scores, semantic_weight, bm25_weight
                )

                # Sort by hybrid score
                results_with_scores.sort(key=lambda x: x.get('hybrid_score', x['similarity']), reverse=True)
            else:
                # Sort by semantic similarity only
                results_with_scores.sort(key=lambda x: x['similarity'], reverse=True)

            # Convert any remaining numpy types to Python types
            results_with_scores = convert_numpy_types(results_with_scores)

            # Determine result limit based on retrieval strategy
            if retrieval_strategy == "top_k":
                # Top-k retrieval: return top 5-10 results after ranking
                result_limit = 5 if use_hybrid_ranking else min(limit, 10)
            elif retrieval_strategy == "full_folder":
                # Full folder: return ALL results, no limit
                result_limit = len(results_with_scores)
            elif retrieval_strategy == "filtered_full":
                # Filtered full: return all matching results (could be large)
                result_limit = len(results_with_scores)
            else:
                # Default to top_k behavior
                result_limit = 5 if use_hybrid_ranking else limit

            final_results = results_with_scores[:result_limit]

            if final_results:
                strategy_info = f" (strategy: {retrieval_strategy}, limit: {result_limit})"
                logger.info(f"Retrieved {len(final_results)} documents for query: '{query_text[:50]}{'...' if len(query_text) > 50 else ''}'{strategy_info}")
                # Log first 5 for brevity
                for i, result in enumerate(final_results[:5], 1):
                    similarity_score = result.get('hybrid_score', result.get('similarity', 0))
                    logger.info(f"  [{i}] {result['title'][:60]}{'...' if len(result['title']) > 60 else ''} "
                              f"(similarity: {similarity_score:.3f}, folder: {result.get('folder_name', 'Unknown')})")
                if len(final_results) > 5:
                    logger.info(f"  ... and {len(final_results) - 5} more results")
            else:
                logger.info(f"No documents found for query: '{query_text}'")

            return final_results

        except Exception as e:
            logger.error(f"Semantic search failed: {e}")
            logger.error(f"Query text: {query_text}")
            logger.error(f"Folder IDs: {folder_ids}")
            logger.error(f"User ID: {user_id}")
            return []

    def _apply_hybrid_ranking(
        self,
        query_text: str,
        results: List[Dict[str, Any]],
        semantic_weight: float = 0.7,
        bm25_weight: float = 0.3
    ) -> List[Dict[str, Any]]:
        """Apply BM25 + semantic similarity hybrid ranking."""
        try:
            # Tokenize query
            query_terms = self._tokenize(query_text)

            if not query_terms:
                # If no valid query terms, return results as-is
                return results

            # Calculate corpus statistics
            avg_doc_length, term_doc_freq = self._calculate_corpus_stats(results)
            corpus_size = len(results)

            # Calculate BM25 scores
            max_bm25_score = 0.0
            max_semantic_score = 0.0

            for result in results:
                # Combine title and content for BM25
                doc_text = f"{result['title']} {result['content']}"
                doc_terms = self._tokenize(doc_text)
                doc_length = len(doc_terms)

                # Calculate BM25 score
                bm25_score = self._calculate_bm25_score(
                    query_terms, doc_terms, doc_length, avg_doc_length,
                    corpus_size, term_doc_freq
                )

                # Convert to native Python float
                result['bm25_score'] = float(bm25_score)
                max_bm25_score = max(max_bm25_score, float(bm25_score))
                max_semantic_score = max(max_semantic_score, float(result['semantic_score']))

            # Normalize and combine scores
            for result in results:
                # Normalize scores to 0-1 range
                normalized_semantic = result['semantic_score'] / max_semantic_score if max_semantic_score > 0 else 0
                normalized_bm25 = result['bm25_score'] / max_bm25_score if max_bm25_score > 0 else 0

                # Calculate hybrid score and convert to native Python float
                hybrid_score = (semantic_weight * normalized_semantic) + (bm25_weight * normalized_bm25)
                result['hybrid_score'] = float(hybrid_score)

            logger.debug(f'Applied hybrid ranking with semantic_weight={semantic_weight}, bm25_weight={bm25_weight}')
            return results

        except Exception as e:
            logger.error(f"Hybrid ranking failed: {e}")
            # Return original results if hybrid ranking fails
            return results

    async def hybrid_search(
        self,
        db: AsyncSession,
        user_id: UUID,
        query_text: str,
        folder_ids: Optional[List[UUID]] = None,
        item_ids: Optional[List[UUID]] = None,
        limit: int = 10,
        semantic_weight: float = 0.7,
        bm25_weight: float = 0.3,
        retrieval_strategy: str = "top_k"
    ) -> List[Dict[str, Any]]:
        """
        Perform hybrid search combining semantic similarity and BM25 ranking.

        Args:
            folder_ids: Optional list of folder IDs to search within
            item_ids: Optional list of specific knowledge item IDs to search within
            semantic_weight: Weight for semantic similarity (0.0-1.0)
            bm25_weight: Weight for BM25 score (0.0-1.0)
            retrieval_strategy: "top_k", "full_folder", or "filtered_full"

        Note: Weights should sum to 1.0 for best results
        """
        return await self.semantic_search(
            db=db,
            user_id=user_id,
            query_text=query_text,
            folder_ids=folder_ids,
            item_ids=item_ids,
            limit=limit,
            use_hybrid_ranking=True,
            semantic_weight=semantic_weight,
            bm25_weight=bm25_weight,
            retrieval_strategy=retrieval_strategy
        )

    async def vector_search(
        self,
        db: AsyncSession,
        user_id: UUID,
        query: str,
        folder_id: Optional[UUID] = None,
        content_types: Optional[List[ContentType]] = None,
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """
        Perform vector search with optional folder and content type filtering.
        """
        folder_ids = [folder_id] if folder_id else None
        return await self.semantic_search(
            db=db,
            user_id=user_id,
            query_text=query,
            folder_ids=folder_ids,
            limit=limit,
            use_hybrid_ranking=True  # Enable hybrid ranking by default
        )

    async def text_search(
        self,
        db: AsyncSession,
        user_id: UUID,
        query: str,
        folder_id: Optional[UUID] = None,
        content_types: Optional[List[ContentType]] = None,
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """
        Perform text-based search on user's content (match query edge function).

        Args:
            db: Database session
            user_id: User ID
            query: Search query text
            folder_id: Optional folder filter
            content_types: Optional content type filter
            limit: Maximum results to return

        Returns:
            List of search results
        """
        try:
            # Build search query to match edge function logic
            stmt = select(KnowledgeItem).where(
                KnowledgeItem.user_id == user_id
            )

            # Add folder filter if specified
            if folder_id:
                stmt = stmt.where(KnowledgeItem.folder_id == folder_id)

            # Add content type filter if specified
            if content_types and isinstance(content_types, list):
                content_type_values = [ct.value if hasattr(ct, 'value') else ct for ct in content_types]
                stmt = stmt.where(KnowledgeItem.content_type.in_(content_type_values))

            # Simple text search (like edge function)
            search_condition = or_(
                func.lower(KnowledgeItem.title).like(f'%{query.lower()}%'),
                func.lower(KnowledgeItem.content).like(f'%{query.lower()}%')
            )
            stmt = stmt.where(search_condition)

            # Order and limit
            stmt = stmt.order_by(KnowledgeItem.created_at.desc()).limit(limit)

            result = await db.execute(stmt)
            items = result.scalars().all()

            # Process results to handle stored content (match edge function)
            processed_results = []
            for item in items:
                content = item.content

                # If content is stored in storage, get preview
                if item.item_metadata and item.item_metadata.get('stored_in_storage') and item.content.startswith('[STORED_IN_STORAGE:'):
                    # For now, use placeholder - actual storage retrieval will be implemented later
                    content = '[Content stored in file - preview unavailable]'
                elif len(content) > 500:
                    content = content[:500] + '...'

                processed_results.append({
                    'id': item.id,
                    'user_id': item.user_id,
                    'folder_id': item.folder_id,
                    'title': item.title,
                    'content': content,
                    'content_type': item.content_type,
                    'source_url': item.source_url,
                    'metadata': item.item_metadata,
                    'created_at': item.created_at.isoformat() if item.created_at else None,
                    'updated_at': item.updated_at.isoformat() if item.updated_at else None,
                    'processing_status': item.processing_status,
                    'is_chunked': item.is_chunked,
                    'total_chunks': item.total_chunks,
                    'preview': content[:200] + ('...' if len(content) > 200 else '')
                })

            return processed_results

        except Exception as e:
            logger.error(f"Text search failed: {e}")
            raise

    async def query_content(
        self,
        db: AsyncSession,
        user_id: UUID,
        query: str,
        folder_id: Optional[UUID] = None,
        content_types: Optional[List[str]] = None,
        limit: int = 10
    ) -> Dict[str, Any]:
        """
        Query content matching the edge function format exactly.

        Args:
            db: Database session
            user_id: User ID
            query: Search query text
            folder_id: Optional folder filter
            content_types: Optional content type filter
            limit: Maximum results to return

        Returns:
            Dict matching edge function response format
        """
        try:
            results = await self.text_search(
                db=db,
                user_id=user_id,
                query=query,
                folder_id=folder_id,
                content_types=content_types,
                limit=limit
            )

            # Return in exact edge function format
            return {
                "query": query,
                "results": results,
                "total": len(results),
                "filtered_by": {
                    "folder_id": str(folder_id) if folder_id else None,
                    "content_types": content_types if content_types else None
                }
            }

        except Exception as e:
            logger.error(f"Query content failed: {e}")
            raise

    async def get_similar_content(
        self,
        db: AsyncSession,
        user_id: UUID,
        knowledge_item_id: UUID,
        limit: int = 5
    ) -> List[Dict[str, Any]]:
        """
        Placeholder for similar content search - to be implemented with vector search.
        """
        logger.info("Similar content search not yet implemented - returning empty results")
        return []

    async def _get_folder_and_descendants(
        self,
        db: AsyncSession,
        user_id: UUID,
        folder_id: UUID
    ) -> List[UUID]:
        """Get folder ID and all its descendant folder IDs."""
        # Get the folder to find its path
        folder_stmt = select(Folder).where(
            Folder.id == folder_id,
            Folder.user_id == user_id
        )
        folder_result = await db.execute(folder_stmt)
        folder = folder_result.scalar_one_or_none()

        if not folder:
            return [folder_id]  # Return just the original ID if not found

        # Get all folders that are descendants (path starts with folder.path)
        descendants_stmt = select(Folder.id).where(
            and_(
                Folder.user_id == user_id,
                or_(
                    Folder.id == folder_id,  # Include the folder itself
                    Folder.path.like(f"{folder.path}/%")  # Include descendants
                )
            )
        )

        descendants_result = await db.execute(descendants_stmt)
        folder_ids = [row[0] for row in descendants_result.all()]

        return folder_ids

    async def get_search_suggestions(
        self,
        db: AsyncSession,
        user_id: UUID,
        prefix: str,
        limit: int = 10
    ) -> List[str]:
        """
        Get search suggestions based on content titles and keywords.

        Args:
            db: Database session
            user_id: User ID
            prefix: Search prefix
            limit: Maximum suggestions

        Returns:
            List of suggestions
        """
        # Search in knowledge item titles
        stmt = (
            select(KnowledgeItem.title)
            .where(
                and_(
                    KnowledgeItem.user_id == user_id,
                    func.lower(KnowledgeItem.title).like(f"%{prefix.lower()}%")
                )
            )
            .limit(limit)
        )

        result = await db.execute(stmt)
        suggestions = [row[0] for row in result.all()]

        return suggestions

    async def enhanced_search(
        self,
        db: AsyncSession,
        user_id: UUID,
        query_text: str,
        folder_ids: Optional[List[UUID]] = None,
        limit: int = 10,
        use_enhancement: bool = True,
        retrieval_strategy: str = "top_k"
    ) -> List[Dict[str, Any]]:
        """
        Perform enhanced search using query variations and reciprocal rank fusion.

        This method:
        1. Enhances the query with semantic variations
        2. Searches with original query + variations
        3. Merges results using Reciprocal Rank Fusion

        Args:
            db: Database session
            user_id: User ID
            query_text: Original query text
            folder_ids: Optional folder filter
            limit: Maximum results
            use_enhancement: Whether to use query enhancement
            retrieval_strategy: Retrieval strategy to use

        Returns:
            Merged and re-ranked results
        """
        if not use_enhancement:
            # Fall back to regular hybrid search
            return await self.hybrid_search(
                db=db,
                user_id=user_id,
                query_text=query_text,
                folder_ids=folder_ids,
                limit=limit,
                retrieval_strategy=retrieval_strategy
            )

        try:
            # Import here to avoid circular dependency
            from app.services.query_enhancement_service import query_enhancement_service

            # Enhance query
            enhancement = await query_enhancement_service.enhance_query(
                original_query=query_text,
                user_id=str(user_id)
            )

            logger.info(f"Query enhancement: {enhancement['enhanced_query']}")
            logger.debug(f"Variations: {enhancement['variations']}")

            # Prepare queries to search (original + enhanced + variations)
            queries_to_search = [
                query_text,  # Original query (highest weight)
                enhancement['enhanced_query']  # Enhanced query
            ]

            # Add up to 2 best variations
            for variation in enhancement['variations'][:2]:
                if variation not in queries_to_search:
                    queries_to_search.append(variation)

            # Search with each query
            ranked_lists = []
            for query in queries_to_search:
                results = await self.hybrid_search(
                    db=db,
                    user_id=user_id,
                    query_text=query,
                    folder_ids=folder_ids,
                    limit=limit * 2,  # Get more results for better fusion
                    retrieval_strategy=retrieval_strategy
                )
                if results:
                    ranked_lists.append(results)

            if not ranked_lists:
                logger.info("No results from any query variation")
                return []

            # Merge using Reciprocal Rank Fusion
            merged_results = reciprocal_rank_fusion(ranked_lists)

            # Apply final limit
            final_results = merged_results[:limit]

            logger.info(f"Enhanced search found {len(final_results)} results using {len(queries_to_search)} query variations")

            # Add enhancement metadata to results
            for result in final_results:
                result['enhanced_search'] = True
                result['query_variations_used'] = len(queries_to_search)

            return final_results

        except Exception as e:
            logger.error(f"Enhanced search failed: {e}, falling back to regular search")
            # Fallback to regular search
            return await self.hybrid_search(
                db=db,
                user_id=user_id,
                query_text=query_text,
                folder_ids=folder_ids,
                limit=limit,
                retrieval_strategy=retrieval_strategy
            )


# Service instance
search_service = SearchService()