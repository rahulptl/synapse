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
  "intent_type": "no_search_needed" | "quick_qa" | "aggregation" | "full_folder_summary" | "filtered_aggregation",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation",
  "requires_full_scan": true/false,
  "retrieval_strategy": "none" | "top_k" | "full_folder" | "filtered_full",
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
- "no_search_needed": Greetings, chitchat, general knowledge not in knowledge base (e.g., "hello", "what is Python?", "how are you?")
- "quick_qa": Simple question answerable with top-k retrieval (e.g., "What is X?", "Explain Y")
- "aggregation": Requires counting/summing across items (e.g., "total transactions", "how many", "sum of")
- "full_folder_summary": Needs to process all items (e.g., "summarize everything", "overview of folder")
- "filtered_aggregation": Aggregation with semantic/temporal filter (e.g., "December transactions", "recent orders")

Retrieval Strategies:
- "none": No search needed - answer directly (for greetings, chitchat, general knowledge)
- "top_k": Retrieve top 5-10 most relevant chunks (for quick_qa)
- "full_folder": Retrieve ALL chunks from folder (for full summaries, aggregations without filters)
- "filtered_full": Retrieve all chunks matching semantic/date filter (for filtered aggregations)

Guidelines:
1. Use "no_search_needed" for: greetings ("hello", "hi"), chitchat, general knowledge ("what is Python?"), meta questions about the system → retrieval_strategy: "none"
2. Use "quick_qa" for: definitions, explanations, finding specific info in knowledge base → retrieval_strategy: "top_k"
3. Use "aggregation" for: totals, counts, averages, all items with math operations → retrieval_strategy: "full_folder"
4. Use "full_folder_summary" for: broad summaries, overviews without specific filter → retrieval_strategy: "full_folder"
5. Use "filtered_aggregation" for: "total X in December", "count Y from last month" → retrieval_strategy: "filtered_full"
6. Set requires_full_scan=true only if answer needs ALL items (aggregations, full summaries)
7. Extract semantic filters naturally (e.g., "December orders" → filter: "December", date_range: Dec 2024)
8. Folder-scoped queries (e.g., "summarize #foldername", "all files in folder") → retrieval_strategy: "full_folder"
9. NO folders specified + general question (not about user's data) → likely "no_search_needed"
10. confidence < 0.5 means unclear, default to "quick_qa" with "top_k" retrieval

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

        # Set retrieval strategy based on intent type if not provided
        if "retrieval_strategy" not in intent_data:
            if intent_data["intent_type"] == "no_search_needed":
                intent_data["retrieval_strategy"] = "none"
            elif intent_data["intent_type"] == "quick_qa":
                intent_data["retrieval_strategy"] = "top_k"
            elif intent_data["intent_type"] == "filtered_aggregation":
                intent_data["retrieval_strategy"] = "filtered_full"
            else:  # aggregation or full_folder_summary
                intent_data["retrieval_strategy"] = "full_folder"

        # Calculate estimated items to process
        total_items = sum(folder_item_counts.values()) if folder_item_counts else 0

        # Use retrieval_strategy to determine estimated items
        if intent_data["retrieval_strategy"] == "none":
            estimated_items = 0  # No search needed
        elif intent_data["retrieval_strategy"] == "top_k":
            estimated_items = 10  # Top-k retrieval (5-10 items)
        elif intent_data["retrieval_strategy"] == "filtered_full":
            # Filtered aggregation: estimate 20-50% of items will be relevant
            estimated_items = int(total_items * 0.35) if total_items > 0 else 10
        else:  # full_folder
            # Full scan of all items
            estimated_items = total_items if total_items > 0 else 10

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
        query_lower = user_query.lower().strip()

        # Check for greetings and chitchat first
        greeting_keywords = ["hello", "hi", "hey", "good morning", "good afternoon", "good evening",
                            "how are you", "what's up", "sup", "greetings"]
        general_knowledge = ["what is ", "who is ", "what are ", "define ", "explain "]

        # No folders means likely not a knowledge base query
        has_folders = folder_item_counts and sum(folder_item_counts.values()) > 0

        if any(query_lower.startswith(kw) for kw in greeting_keywords):
            intent_type = "no_search_needed"
            requires_full_scan = False
        elif not has_folders and any(kw in query_lower for kw in general_knowledge):
            # General knowledge question without folder context
            intent_type = "no_search_needed"
            requires_full_scan = False
        else:
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
        estimated_items = total_items if requires_full_scan else (0 if intent_type == "no_search_needed" else 10)
        estimated_time = 1.0 + (estimated_items / self.ITEMS_PER_SECOND_ESTIMATE)

        # Determine retrieval strategy based on intent
        if intent_type == "no_search_needed":
            retrieval_strategy = "none"
        elif intent_type == "quick_qa":
            retrieval_strategy = "top_k"
        elif intent_type == "filtered_aggregation":
            retrieval_strategy = "filtered_full"
        else:
            retrieval_strategy = "full_folder"

        return {
            "intent_type": intent_type,
            "confidence": 0.3,  # Low confidence for fallback
            "reasoning": "Fallback classification based on keywords",
            "requires_full_scan": requires_full_scan,
            "retrieval_strategy": retrieval_strategy,
            "requires_async": estimated_time > self.QUICK_QUERY_THRESHOLD_SECONDS,
            "estimated_items": estimated_items,
            "estimated_time_seconds": estimated_time,
            "extraction_schema": {},
            "filter_criteria": {}
        }


# Service instance
intent_classifier = IntentClassifier()
