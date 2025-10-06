"""
Query Enhancement Service for improving RAG retrieval.

This service enhances user queries by generating semantic variations,
normalizing dates/numbers, and expanding with synonyms to improve
retrieval recall.
"""
import logging
import re
import json
from typing import List, Dict, Any, Optional
from datetime import datetime
from app.core.embeddings import chat_service as ai_chat_service

logger = logging.getLogger(__name__)


class QueryEnhancementService:
    """Service for enhancing queries to improve RAG retrieval."""

    # Cache for enhanced queries (simple in-memory cache)
    _cache: Dict[str, Dict[str, Any]] = {}
    _cache_max_size = 1000
    _cache_ttl_seconds = 3600  # 1 hour

    async def enhance_query(
        self,
        original_query: str,
        user_id: Optional[str] = None,
        use_cache: bool = True
    ) -> Dict[str, Any]:
        """
        Enhance query with semantic variations for better retrieval.

        Returns:
        {
            "original_query": str,
            "enhanced_query": str,
            "variations": List[str],
            "extracted_dates": List[str],
            "extracted_numbers": List[float],
            "keywords": List[str]
        }
        """
        # Check cache
        cache_key = f"{user_id}:{original_query}" if user_id else original_query
        if use_cache and cache_key in self._cache:
            cached = self._cache[cache_key]
            # Check if cache is still valid
            cache_age = (datetime.now().timestamp() - cached.get("timestamp", 0))
            if cache_age < self._cache_ttl_seconds:
                logger.debug(f"Cache hit for query: {original_query[:50]}")
                return cached["data"]

        # Generate enhanced query using LLM
        enhancement = await self._generate_enhancement(original_query)

        # Cache the result
        if use_cache:
            self._cache[cache_key] = {
                "data": enhancement,
                "timestamp": datetime.now().timestamp()
            }
            # Simple cache size management
            if len(self._cache) > self._cache_max_size:
                # Remove oldest entries (first 10%)
                to_remove = int(self._cache_max_size * 0.1)
                keys_to_remove = list(self._cache.keys())[:to_remove]
                for key in keys_to_remove:
                    del self._cache[key]

        return enhancement

    async def _generate_enhancement(self, query: str) -> Dict[str, Any]:
        """Generate query enhancements using LLM."""

        prompt = f"""You are a query enhancement expert for a semantic search system.

User Query: "{query}"

Your task: Generate query variations to improve search recall.

Output a JSON object with this structure:
{{
  "enhanced_query": "improved version of query with key terms emphasized",
  "variations": ["variation1", "variation2", "variation3"],
  "extracted_dates": ["date variations if any dates mentioned"],
  "extracted_numbers": [numeric values if any],
  "keywords": ["key", "search", "terms"]
}}

Guidelines:
1. enhanced_query: Rewrite query to emphasize key search terms
2. variations: Generate 2-3 semantic variations
3. extracted_dates: Convert date mentions to multiple formats
   - "december" → ["december", "December", "12", "Dec", "2024-12"]
   - "last month" → [actual month name, number, variations]
4. extracted_numbers: Extract any numeric values or amounts
5. keywords: Extract 3-5 most important search keywords

Examples:
- "orders in december" → variations: ["December orders", "orders from month 12", "Dec purchases"]
- "total amount" → variations: ["sum of amounts", "aggregate total", "combined value"]
- "recent files" → variations: ["latest files", "newest documents", "recent uploads"]

Output ONLY valid JSON, no markdown formatting."""

        try:
            messages = [
                {"role": "system", "content": prompt},
                {"role": "user", "content": query}
            ]

            response = await ai_chat_service.generate_completion(
                messages=messages,
                max_tokens=500,
                temperature=0.3  # Lower temperature for consistent enhancements
            )

            # Parse JSON response
            enhancement_data = json.loads(response)

            # Validate and set defaults
            return {
                "original_query": query,
                "enhanced_query": enhancement_data.get("enhanced_query", query),
                "variations": enhancement_data.get("variations", []),
                "extracted_dates": enhancement_data.get("extracted_dates", []),
                "extracted_numbers": enhancement_data.get("extracted_numbers", []),
                "keywords": enhancement_data.get("keywords", [])
            }

        except Exception as e:
            logger.error(f"Query enhancement failed: {e}")
            # Fallback to basic enhancement
            return self._basic_enhancement(query)

    def _basic_enhancement(self, query: str) -> Dict[str, Any]:
        """Fallback enhancement using rule-based approach."""

        # Extract potential dates
        date_patterns = {
            r'\b(january|february|march|april|may|june|july|august|september|october|november|december)\b':
                self._expand_month_name,
            r'\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b':
                self._expand_month_abbr,
            r'\b(\d{1,2})/(\d{1,2})/(\d{2,4})\b':
                lambda m: [m.group(0)],  # Keep as-is
        }

        extracted_dates = []
        query_lower = query.lower()

        for pattern, expander in date_patterns.items():
            matches = re.finditer(pattern, query_lower, re.IGNORECASE)
            for match in matches:
                extracted_dates.extend(expander(match))

        # Extract numbers
        number_pattern = r'\b\d+\.?\d*\b'
        extracted_numbers = [float(n) for n in re.findall(number_pattern, query)]

        # Extract keywords (simple: words longer than 3 chars, not common stop words)
        stop_words = {'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'her', 'was', 'one', 'our', 'out', 'get'}
        words = re.findall(r'\b\w{4,}\b', query.lower())
        keywords = [w for w in words if w not in stop_words][:5]

        # Generate simple variations
        variations = [query]
        if keywords:
            # Reorder keywords
            variations.append(" ".join(keywords[:3]))

        return {
            "original_query": query,
            "enhanced_query": query,
            "variations": list(set(variations)),
            "extracted_dates": list(set(extracted_dates)),
            "extracted_numbers": extracted_numbers,
            "keywords": keywords
        }

    def _expand_month_name(self, match) -> List[str]:
        """Expand month name to variations."""
        month_map = {
            "january": ["january", "jan", "1", "01", "2024-01"],
            "february": ["february", "feb", "2", "02", "2024-02"],
            "march": ["march", "mar", "3", "03", "2024-03"],
            "april": ["april", "apr", "4", "04", "2024-04"],
            "may": ["may", "5", "05", "2024-05"],
            "june": ["june", "jun", "6", "06", "2024-06"],
            "july": ["july", "jul", "7", "07", "2024-07"],
            "august": ["august", "aug", "8", "08", "2024-08"],
            "september": ["september", "sep", "9", "09", "2024-09"],
            "october": ["october", "oct", "10", "2024-10"],
            "november": ["november", "nov", "11", "2024-11"],
            "december": ["december", "dec", "12", "2024-12"]
        }
        month = match.group(1).lower()
        return month_map.get(month, [month])

    def _expand_month_abbr(self, match) -> List[str]:
        """Expand month abbreviation to variations."""
        abbr_map = {
            "jan": ["january", "jan", "1", "01"],
            "feb": ["february", "feb", "2", "02"],
            "mar": ["march", "mar", "3", "03"],
            "apr": ["april", "apr", "4", "04"],
            "may": ["may", "5", "05"],
            "jun": ["june", "jun", "6", "06"],
            "jul": ["july", "jul", "7", "07"],
            "aug": ["august", "aug", "8", "08"],
            "sep": ["september", "sep", "9", "09"],
            "oct": ["october", "oct", "10"],
            "nov": ["november", "nov", "11"],
            "dec": ["december", "dec", "12"]
        }
        abbr = match.group(1).lower()
        return abbr_map.get(abbr, [abbr])

    def clear_cache(self):
        """Clear the enhancement cache."""
        self._cache.clear()
        logger.info("Query enhancement cache cleared")


# Service instance
query_enhancement_service = QueryEnhancementService()
