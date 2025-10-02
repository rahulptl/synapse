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
        Parse hashtags from message and return cleaned query with folder info.
        Matches the logic from the rag-chat edge function.
        """
        hashtag_regex = re.compile(r'#([\w\-_]+)')
        hashtags = hashtag_regex.findall(message)

        cleaned_message = hashtag_regex.sub('', message).strip()
        cleaned_message = re.sub(r'\s+', ' ', cleaned_message)

        return {
            "hashtags": hashtags,
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

    async def semantic_search(
        self,
        db: AsyncSession,
        user_id: UUID,
        query_text: str,
        folder_ids: Optional[List[UUID]] = None,
        limit: int = 10,
        use_hybrid_ranking: bool = True,
        semantic_weight: float = 0.7,
        bm25_weight: float = 0.3
    ) -> List[Dict[str, Any]]:
        """
        Perform semantic search using vector embeddings with optional BM25 hybrid ranking.
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
                    logger.debug(f'Filtering search to {len(valid_folder_ids)} specific folders')

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

            # For hybrid search, always return top 5 results after ranking
            final_results = results_with_scores[:5] if use_hybrid_ranking else results_with_scores[:limit]
            if final_results:
                logger.info(f"Retrieved {len(final_results)} documents for query: '{query_text[:50]}{'...' if len(query_text) > 50 else ''}'")
                for i, result in enumerate(final_results, 1):
                    similarity_score = result.get('hybrid_score', result.get('similarity', 0))
                    logger.info(f"  [{i}] {result['title'][:60]}{'...' if len(result['title']) > 60 else ''} "
                              f"(similarity: {similarity_score:.3f}, folder: {result.get('folder_name', 'Unknown')})")
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
        limit: int = 10,
        semantic_weight: float = 0.7,
        bm25_weight: float = 0.3
    ) -> List[Dict[str, Any]]:
        """
        Perform hybrid search combining semantic similarity and BM25 ranking.

        Args:
            semantic_weight: Weight for semantic similarity (0.0-1.0)
            bm25_weight: Weight for BM25 score (0.0-1.0)

        Note: Weights should sum to 1.0 for best results
        """
        return await self.semantic_search(
            db=db,
            user_id=user_id,
            query_text=query_text,
            folder_ids=folder_ids,
            limit=limit,
            use_hybrid_ranking=True,
            semantic_weight=semantic_weight,
            bm25_weight=bm25_weight
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


# Service instance
search_service = SearchService()