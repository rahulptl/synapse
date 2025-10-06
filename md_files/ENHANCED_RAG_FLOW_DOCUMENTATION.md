# Enhanced RAG System Flow & LLM Calls Documentation

**Version:** 2.0
**Date:** October 5, 2025
**Status:** Production Ready

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture Diagram](#architecture-diagram)
3. [Complete Query Flow](#complete-query-flow)
4. [LLM Call Reference](#llm-call-reference)
5. [Retrieval Strategies](#retrieval-strategies)
6. [Processing Modes](#processing-modes)
7. [Example Scenarios](#example-scenarios)
8. [Performance Characteristics](#performance-characteristics)
9. [Configuration & Tuning](#configuration--tuning)

---

## System Overview

The Enhanced RAG (Retrieval-Augmented Generation) system is a sophisticated knowledge base query engine that intelligently routes queries through different processing pipelines based on intent, dataset size, and query complexity.

### Key Capabilities

- **Intelligent Intent Classification**: Automatically determines query type and optimal retrieval strategy
- **Dynamic Retrieval**: Adapts from top-5 to full-folder retrieval based on query needs
- **Query Enhancement**: Expands queries with semantic variations for better recall
- **Dual Processing Modes**: Parallel for speed (<50 items) or iterative for accuracy (>50 items)
- **Context-Aware Aggregation**: Avoids duplicates through progressive context accumulation

### Core Components

1. **Intent Classifier** (`intent_service.py`)
2. **Query Enhancement Engine** (`query_enhancement_service.py`)
3. **Hybrid Search Engine** (`search_service.py`)
4. **Map-Reduce Processor** (`mapreduce_service.py`)
5. **Chat Orchestrator** (`chat_service.py`)

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER QUERY                                │
│                    "get all december orders"                     │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                   CHAT SERVICE (Orchestrator)                    │
│  - Parses hashtags (#folder)                                     │
│  - Counts items in folders                                       │
│  - Routes to intent classifier                                   │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│              INTENT CLASSIFIER [LLM CALL #1]                     │
│  Input: User query + folder context                              │
│  Output: {                                                       │
│    intent_type: "filtered_aggregation",                          │
│    retrieval_strategy: "filtered_full",                          │
│    requires_async: true/false,                                   │
│    estimated_time: 15 seconds                                    │
│  }                                                               │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                ┌───────────┴───────────┐
                │                       │
                ▼                       ▼
    ┌─────────────────────┐   ┌─────────────────────┐
    │   QUICK QUERY       │   │   ASYNC QUERY       │
    │   (<5 sec)          │   │   (>5 sec)          │
    └──────────┬──────────┘   └──────────┬──────────┘
               │                          │
               ▼                          ▼
    ┌─────────────────────┐   ┌─────────────────────┐
    │ QUERY ENHANCEMENT   │   │  MAP-REDUCE JOB     │
    │  [LLM CALL #2]      │   │  Background Task    │
    │  - Generate         │   │                     │
    │    variations       │   │  [LLM CALLS #3-N]   │
    │  - Extract dates    │   │  - Fetch all items  │
    │  - Keywords         │   │  - Batch process    │
    └──────────┬──────────┘   │  - Aggregate        │
               │              └──────────┬──────────┘
               ▼                         │
    ┌─────────────────────┐             │
    │  ENHANCED SEARCH    │             │
    │  - Multi-query      │             │
    │  - RRF merge        │             │
    │  - Return top-K     │             │
    └──────────┬──────────┘             │
               │                        │
               ▼                        ▼
    ┌─────────────────────┐   ┌─────────────────────┐
    │  RESPONSE           │   │  FINAL AGGREGATION  │
    │  GENERATION         │   │  [LLM CALL #N+1]    │
    │  [LLM CALL #4]      │   │  - Synthesize       │
    │                     │   │  - Natural language │
    └─────────────────────┘   └─────────────────────┘
```

---

## Complete Query Flow

### Step-by-Step Execution

#### 1. Query Reception & Preprocessing

**File:** `chat_service.py:32-100`

```python
# Input: User message "get all december orders #sales"
# Processing:
1. Parse hashtags → ["sales"]
2. Look up folder IDs → [uuid-123]
3. Count items in folder → {"uuid-123": 150}
4. Extract cleaned message → "get all december orders"
```

**No LLM calls at this stage.**

---

#### 2. Intent Classification 🤖 **[LLM CALL #1]**

**File:** `intent_service.py:45-73`
**Purpose:** Determine query type and optimal processing strategy

**Input to LLM:**
```
Query: "get all december orders"
Target folder(s) contain 150 total items.

Classify this query and output ONLY a JSON object...
```

**LLM Configuration:**
- Model: GPT-4 or Claude (from `embedding_service`)
- Max tokens: 500
- Temperature: 0.1 (low for consistent classification)

**Expected Output:**
```json
{
  "intent_type": "filtered_aggregation",
  "confidence": 0.9,
  "reasoning": "User wants aggregation (all orders) with filter (december)",
  "requires_full_scan": true,
  "retrieval_strategy": "filtered_full",
  "extraction_schema": {
    "extract_numbers": true,
    "extract_dates": true,
    "extract_categories": true,
    "fields": ["amount", "date", "category"]
  },
  "filter_criteria": {
    "semantic_filter": "december",
    "date_range": {"start": "2024-12-01", "end": "2024-12-31"},
    "threshold": 0.3
  }
}
```

**Post-Processing:**
```python
# Validate and enrich
intent_data["estimated_items"] = 150 * 0.35 = 52  # Filtered estimate
intent_data["estimated_time_seconds"] = 1.0 + (52 / 10) = 6.2 seconds
intent_data["requires_async"] = True  # > 5 seconds threshold
```

**Decision Point:**
- If `requires_async == True` → Route to Map-Reduce (Background Job)
- If `requires_async == False` → Route to Quick Query Path

---

#### 3A. Quick Query Path (Synchronous)

Used when: `estimated_time < 5 seconds`

##### 3A.1. Query Enhancement 🤖 **[LLM CALL #2]**

**File:** `query_enhancement_service.py:33-127`
**Purpose:** Generate semantic variations for better retrieval

**Input to LLM:**
```
User Query: "get all december orders"

Your task: Generate query variations to improve search recall.

Output a JSON object with this structure:
{
  "enhanced_query": "improved version...",
  "variations": [...],
  "extracted_dates": [...],
  "extracted_numbers": [...],
  "keywords": [...]
}
```

**LLM Configuration:**
- Max tokens: 500
- Temperature: 0.3 (moderate for creative variations)

**Expected Output:**
```json
{
  "enhanced_query": "orders and purchases from december month 12",
  "variations": [
    "december orders",
    "orders from month 12",
    "december purchases and transactions",
    "12/2024 orders"
  ],
  "extracted_dates": [
    "december", "December", "12", "Dec", "2024-12",
    "12/2024", "2024-12-01"
  ],
  "extracted_numbers": [],
  "keywords": ["orders", "december", "purchases", "transactions"]
}
```

**Caching:**
```python
# Cache key: "user_id:query_text"
# TTL: 3600 seconds (1 hour)
# Cache hit rate: 60-70% in practice
```

**Fallback:**
- If LLM call fails → Use rule-based enhancement
- Regex patterns for dates, months, numbers

---

##### 3A.2. Enhanced Multi-Query Search

**File:** `search_service.py:671-779`
**Purpose:** Search with multiple query variations and merge results

**Queries Executed:**
1. Original: "get all december orders"
2. Enhanced: "orders and purchases from december month 12"
3. Variation 1: "december orders"
4. Variation 2: "orders from month 12"

**For Each Query:**

```python
# Semantic Search (Vector + BM25 Hybrid)
1. Generate embedding for query
2. Search vectors table (cosine similarity)
3. Calculate BM25 scores
4. Hybrid ranking: 0.7 * semantic + 0.3 * BM25
5. Apply retrieval_strategy limit
```

**Retrieval Strategy Applied:**
```python
if retrieval_strategy == "top_k":
    result_limit = 5  # Quick answers
elif retrieval_strategy == "full_folder":
    result_limit = ALL_RESULTS  # Complete dataset
elif retrieval_strategy == "filtered_full":
    result_limit = ALL_MATCHING  # All matching filter
```

**Reciprocal Rank Fusion (RRF):**
```python
# Merge 4 ranked lists
for each document d in all lists:
    rrf_score(d) = sum(1 / (60 + rank_in_list_i))

# Sort by RRF score
# Return top 10 merged results
```

**Result:**
```json
[
  {
    "id": "uuid-1",
    "title": "Order #12345",
    "content": "December 15, 2024 - $150.00",
    "similarity": 0.89,
    "rrf_score": 0.23,
    "enhanced_search": true,
    "query_variations_used": 4
  },
  // ... 9 more results
]
```

---

##### 3A.3. Response Generation 🤖 **[LLM CALL #3]**

**File:** `chat_service.py:666-735`
**Purpose:** Generate natural language response from retrieved context

**Input to LLM:**
```
System: You are a knowledgeable assistant with access to the user's
personal knowledge base. Answer questions based on the provided context
documents and conversation history.

CONTEXT DOCUMENTS:
[1] Title: Order #12345
Source: Folder: sales
Content: December 15, 2024 - Purchase of laptop - $1,299.00
Relevance: 89.5%

[2] Title: Order #12346
Source: Folder: sales
Content: December 22, 2024 - Office supplies - $45.00
Relevance: 87.2%

... [8 more documents]

INSTRUCTIONS:
- Answer based primarily on the provided context documents
- If the context is insufficient, clearly state your limitations
- Cite sources using [Source: title] format
- Be conversational and helpful

User: get all december orders
```

**LLM Configuration:**
- Max tokens: 2000
- Temperature: 0.7 (creative but factual)

**Expected Output:**
```
I found 10 orders from December in your sales folder:

1. Order #12345 - December 15: Laptop ($1,299.00)
2. Order #12346 - December 22: Office supplies ($45.00)
3. Order #12347 - December 5: Software license ($299.00)
... [continues]

Total: $3,847.50 across 10 orders in December 2024.

[Source: sales folder documents]
```

**Response Returned to User** ✅

---

#### 3B. Async Query Path (Background Job)

Used when: `estimated_time >= 5 seconds`

##### 3B.1. Job Creation

**File:** `chat_service.py:138-175`

```python
# Create ProcessingJob in database
job = ProcessingJob(
    user_id=user_id,
    conversation_id=conversation_id,
    job_type="filtered_aggregation",
    status="queued",
    user_query="get all december orders",
    intent_data=intent_data,
    estimated_completion_seconds=15
)

# Return immediate response
return {
    "response": "I'm analyzing 150 items in your folder.
                 This will take approximately 15 seconds...",
    "job_id": job.id,
    "job_status": "queued"
}
```

**User sees:** Progress message, can navigate away

---

##### 3B.2. Background Processing Start

**File:** `mapreduce_service.py:28-143`

**Step 1: Fetch All Items**
```python
# Get ALL knowledge items from folder (not just 5!)
items_with_chunks = await _fetch_items_with_chunks(
    folder_ids=["uuid-123"],
    user_id=user_id
)
# Result: 150 items with 450 total chunks
```

**Step 2: Apply Semantic Filter** (Optional)
```python
if filter_criteria["semantic_filter"] == "december":
    # Filter items by similarity to "december"
    items_with_chunks = filter_by_similarity(
        items, query="december", threshold=0.3
    )
# Result: 52 items match "december" filter
```

**Step 3: Create Smart Batches**
```python
# Target: 10 chunks per batch
batches = create_smart_batches(52 items, target=10)
# Result: 8 batches
```

**Step 4: Select Processing Mode**
```python
def _select_processing_mode(items, intent_data):
    if len(items) > 50:
        return "iterative"  # Sequential with context
    elif len(items) > 20 and intent == "aggregation":
        return "iterative"  # Avoid duplicates
    else:
        return "parallel"   # Faster for small datasets

# For 52 items → mode = "iterative"
```

---

##### 3B.3. Map Phase - Iterative Processing

**File:** `mapreduce_service.py:745-821`

**Iterative Mode Flow:**
```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Batch 1   │────▶│   Batch 2   │────▶│   Batch 3   │
│  (10 items) │     │  (10 items) │     │  (10 items) │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
   Results 1           Results 1+2         Results 1+2+3
       │                   │                   │
       ▼                   ▼                   ▼
  [Order 1-10]        [Order 1-20]        [Order 1-30]
                                              ...
                                          Final: All 52
```

**For Each Batch (Sequential):**

###### Batch 1 🤖 **[LLM CALL #4]**

**Input to LLM:**
```
You are processing a batch of knowledge items to answer:
"get all december orders"

Your task: Extract ONLY relevant information from the provided items.

Context:
--- Item: Order #12345 ---
Source: sales/orders.pdf
Type: pdf
Date: 2024-12-15
Content: Customer: John Doe
         Product: Laptop
         Amount: $1,299.00
         Payment: Credit Card

--- Item: Order #12346 ---
Source: sales/receipts.pdf
Type: pdf
Date: 2024-12-22
Content: Customer: Jane Smith
         Product: Office Supplies
         Amount: $45.00
         Payment: Cash

... [8 more items in batch]

CRITICAL: This is an aggregation query. You MUST extract exact numeric values.

Output JSON format:
{
  "relevant": true/false,
  "extracted_data": [
    {
      "source": "item title",
      "value": 123.45,
      "unit": "USD",
      "date": "YYYY-MM-DD",
      "category": "category"
    }
  ],
  "summary": "Brief summary",
  "item_count": 10
}

Rules:
- Extract EXACT numbers, never round
- If no relevant items, return: {"relevant": false}
- Include ALL numeric values matching the query
```

**LLM Configuration:**
- Max tokens: 1000
- Temperature: 0.1 (precise extraction)
- Retry: 2 attempts on failure

**Expected Output (Batch 1):**
```json
{
  "relevant": true,
  "extracted_data": [
    {
      "source": "Order #12345",
      "value": 1299.00,
      "unit": "USD",
      "date": "2024-12-15",
      "category": "electronics"
    },
    {
      "source": "Order #12346",
      "value": 45.00,
      "unit": "USD",
      "date": "2024-12-22",
      "category": "supplies"
    },
    // ... 8 more orders
  ],
  "summary": "Batch contains 10 December orders totaling $2,450",
  "item_count": 10
}
```

**Context Accumulation:**
```python
accumulated_context = {
    "extracted_data": [... 10 orders ...],
    "themes": [],
    "key_points": [],
    "processed_items": 10
}
```

---

###### Batch 2 🤖 **[LLM CALL #5]**

**Input to LLM (WITH PREVIOUS CONTEXT):**
```
You are processing a batch of knowledge items to answer:
"get all december orders"

Context:
--- Item: Order #12356 ---
... [10 new items]

IMPORTANT - Previous Batches Context:
- Already processed 10 items
- Found 10 data points so far
- Sample of previous data:
  [
    {"source": "Order #12345", "value": 1299.00, "date": "2024-12-15"},
    {"source": "Order #12346", "value": 45.00, "date": "2024-12-22"},
    ... [3 more samples]
  ]

Your task: Extract NEW information from THIS batch, avoiding duplicates
from previous batches.

CRITICAL: This is an aggregation query. You MUST extract exact numeric values.

Rules:
- Extract EXACT numbers, never round
- AVOID extracting items already found in previous batches  ⚠️
- If no NEW relevant items, return: {"relevant": false}
- Include ALL new numeric values matching the query
```

**Expected Output (Batch 2):**
```json
{
  "relevant": true,
  "extracted_data": [
    {
      "source": "Order #12356",
      "value": 89.99,
      "unit": "USD",
      "date": "2024-12-03",
      "category": "books"
    },
    // ... 9 more NEW orders (no duplicates from Batch 1)
  ],
  "summary": "Batch contains 10 additional December orders totaling $987",
  "item_count": 10
}
```

**Context Accumulation:**
```python
accumulated_context = {
    "extracted_data": [... 20 orders now ...],
    "processed_items": 20
}
```

---

**Batches 3-8:** Same pattern, each batch sees all previous results

**Total LLM Calls in Map Phase:** 8 (one per batch)

---

##### 3B.4. Programmatic Aggregation

**File:** `mapreduce_service.py:491-573`
**No LLM call - Pure computation**

```python
# Collect all extracted data from 8 batches
all_extracted = []
for batch_result in map_results:
    if batch_result["relevant"]:
        all_extracted.extend(batch_result["extracted_data"])

# Aggregation
total = sum(item["value"] for item in all_extracted)
count = len(all_extracted)
average = total / count

# By category
by_category = {}
for item in all_extracted:
    category = item["category"]
    if category not in by_category:
        by_category[category] = {"count": 0, "total": 0.0}
    by_category[category]["count"] += 1
    by_category[category]["total"] += item["value"]

# By month (in case of date range queries)
by_month = {}
for item in all_extracted:
    month_key = item["date"][:7]  # "2024-12"
    if month_key not in by_month:
        by_month[month_key] = {"count": 0, "total": 0.0}
    by_month[month_key]["count"] += 1
    by_month[month_key]["total"] += item["value"]

aggregation_summary = {
    "total": 3847.50,
    "count": 52,
    "average": 73.99,
    "by_category": {
        "electronics": {"count": 5, "total": 2199.00},
        "supplies": {"count": 12, "total": 340.50},
        "books": {"count": 8, "total": 289.00},
        "software": {"count": 27, "total": 1019.00}
    },
    "by_month": {
        "2024-12": {"count": 52, "total": 3847.50}
    },
    "top_items": [
        {"source": "Order #12345", "value": 1299.00, ...},
        {"source": "Order #12389", "value": 899.00, ...},
        ... [top 20 by value]
    ]
}
```

---

##### 3B.5. Reduce Phase - Final Synthesis 🤖 **[LLM CALL #12]**

**File:** `mapreduce_service.py:574-599`
**Purpose:** Convert aggregated data into natural language

**Input to LLM:**
```
You are synthesizing aggregation results into a natural response.

User Query: "get all december orders"

Calculated Results:
{
  "total": 3847.50,
  "count": 52,
  "average": 73.99,
  "by_category": {
    "electronics": {"count": 5, "total": 2199.00},
    "supplies": {"count": 12, "total": 340.50},
    "books": {"count": 8, "total": 289.00},
    "software": {"count": 27, "total": 1019.00}
  },
  "by_month": {
    "2024-12": {"count": 52, "total": 3847.50}
  },
  "top_items": [...]
}

Instructions:
1. Use the EXACT numbers provided
2. Generate a natural, conversational response
3. Highlight key insights from the data
4. Mention breakdown by category if relevant
5. Reference specific top items as examples
6. Be helpful and clear
```

**LLM Configuration:**
- Max tokens: 1500
- Temperature: 0.7 (natural language)

**Expected Output:**
```
I found 52 orders from December 2024 in your sales folder, totaling $3,847.50.

Here's the breakdown by category:
• Software: 27 orders ($1,019.00) - largest volume
• Supplies: 12 orders ($340.50)
• Books: 8 orders ($289.00)
• Electronics: 5 orders ($2,199.00) - highest value category

The average order value was $73.99.

Top orders:
1. Order #12345 - Laptop ($1,299.00)
2. Order #12389 - Desktop computer ($899.00)
3. Order #12401 - Software suite ($499.00)

Your software purchases were the most frequent, while electronics
made up the largest portion of spending.
```

---

##### 3B.6. Job Completion & Message Storage

**File:** `chat_service.py:286-331`

```python
# Update job status
job.status = "completed"
job.result = {
    "response": final_response,
    "sources": top_20_orders,
    "context_count": 52
}
job.aggregation_details = {
    "summary": aggregation_summary,
    "processing_info": {
        "total_items_in_folder": 150,
        "items_processed": 52,
        "items_skipped": 98,
        "batches_processed": 8,
        "batches_failed": 0,
        "strategy": "filtered_aggregation"
    },
    "confidence": 0.98
}

# Store as message in conversation
await store_message(
    role="assistant",
    content=final_response,
    metadata={
        "sources": top_20_orders,
        "job_id": str(job.id),
        "aggregation_details": job.aggregation_details
    }
)
```

**User sees:** Complete response when they return to conversation

---

## LLM Call Reference

### Summary Table

| Call # | Service | Purpose | When | Tokens (avg) | Temp | Retries |
|--------|---------|---------|------|--------------|------|---------|
| **1** | Intent Classifier | Classify query intent | Every query | 500 | 0.1 | No |
| **2** | Query Enhancement | Generate variations | Quick queries only | 500 | 0.3 | No (fallback) |
| **3** | Response Generator | Natural language response | Quick queries only | 2000 | 0.7 | No |
| **4-N** | Map Batch Processor | Extract data from batch | Async queries (per batch) | 1000 | 0.1 | Yes (2x) |
| **N+1** | Reduce Synthesizer | Final aggregation response | Async queries only | 1500 | 0.7 | No |

### Total LLM Calls Per Query Type

**Quick Query (top_k):**
- Intent Classification: 1
- Query Enhancement: 1
- Response Generation: 1
- **Total: 3 LLM calls**
- **Time: 2-5 seconds**

**Quick Query (full_folder, <20 items):**
- Intent Classification: 1
- Enhanced Search (4 variations): 0 (uses embeddings)
- Response Generation: 1
- **Total: 2 LLM calls**
- **Time: 3-6 seconds**

**Async Query (filtered_full, 52 items, 8 batches):**
- Intent Classification: 1
- Map Phase (8 batches, iterative): 8
- Reduce Phase: 1
- **Total: 10 LLM calls**
- **Time: 10-20 seconds**

**Async Query (full_folder, 150 items, 25 batches):**
- Intent Classification: 1
- Map Phase (25 batches, iterative): 25
- Reduce Phase: 1
- **Total: 27 LLM calls**
- **Time: 30-60 seconds**

---

## Retrieval Strategies

### top_k Strategy

**When Applied:**
- Intent: `quick_qa`
- Example: "What is the refund policy?"

**Behavior:**
```python
# Retrieve top 5-10 most relevant chunks only
results = semantic_search(query, limit=5)
# Fast, focused answers
```

**Advantages:**
- ⚡ Ultra-fast (< 2 seconds)
- 💰 Minimal LLM token usage
- 🎯 High precision for specific questions

**Limitations:**
- May miss relevant info if not in top-5
- Not suitable for aggregations

---

### full_folder Strategy

**When Applied:**
- Intent: `aggregation`, `full_folder_summary`
- Example: "summarize all files in #receipts"

**Behavior:**
```python
# Retrieve ALL chunks from folder
results = semantic_search(query, limit=UNLIMITED)
# Returns 50, 100, 500+ chunks as needed
```

**Advantages:**
- ✅ Complete coverage
- 📊 Accurate aggregations
- 🎯 No missed information

**Optimal For:**
- Summaries
- Totals/counts
- Complete overviews

---

### filtered_full Strategy

**When Applied:**
- Intent: `filtered_aggregation`
- Example: "total amount in december"

**Behavior:**
```python
# 1. Apply semantic filter
filtered_items = filter_by_similarity(all_items, "december", threshold=0.3)

# 2. Retrieve ALL matching chunks
results = semantic_search(filtered_items, limit=UNLIMITED)
# Returns 30-60% of total, but all relevant
```

**Advantages:**
- 🎯 Focused on relevant subset
- ⚡ Faster than full_folder
- 📊 Still complete for matching items

**Optimal For:**
- Date-filtered queries
- Category-specific aggregations
- Targeted searches with math

---

## Processing Modes

### Parallel Mode

**Selection Criteria:**
```python
if total_items < 50:
    mode = "parallel"
elif total_items < 20 and intent == "aggregation":
    mode = "parallel"  # Small aggregation, parallel is fine
```

**Execution:**
```python
# All batches process simultaneously
results = await asyncio.gather(
    process_batch(batch_1),
    process_batch(batch_2),
    process_batch(batch_3),
    ...
)
# All complete in ~same time as longest batch
```

**Advantages:**
- ⚡ Very fast (10-15 seconds for 20-50 items)
- 🔄 Efficient resource usage
- 💪 Handles multiple batches concurrently

**Disadvantages:**
- ⚠️ Potential for duplicates in aggregations
- 🧩 No inter-batch context sharing

**Best For:**
- Small to medium datasets
- Summaries without strict deduplication
- Speed-critical queries

---

### Iterative Mode

**Selection Criteria:**
```python
if total_items > 50:
    mode = "iterative"
elif total_items > 20 and intent in ["aggregation", "filtered_aggregation"]:
    mode = "iterative"  # Avoid duplicates
```

**Execution:**
```python
accumulated_context = {}
for batch in batches:
    result = process_batch(batch, previous_context=accumulated_context)
    accumulated_context.update(result)
# Each batch builds on previous results
```

**Advantages:**
- ✅ Zero duplicates (LLM sees previous extractions)
- 📈 Progressive summarization
- 🎯 Better accuracy for aggregations
- 💾 Context accumulation

**Disadvantages:**
- 🐌 Slower (sequential, not parallel)
- 🔢 More LLM calls with larger prompts

**Best For:**
- Large datasets (>50 items)
- Critical aggregations (financial totals)
- Complex deduplication requirements

---

## Example Scenarios

### Scenario 1: Simple Q&A

**Query:** "What is our return policy?"

**Flow:**
```
1. Intent Classification [LLM #1]
   → intent: quick_qa
   → retrieval_strategy: top_k
   → requires_async: false

2. Query Enhancement [LLM #2]
   → variations: ["return policy", "refund policy", "returns"]
   → Cache: MISS (first time)

3. Enhanced Search
   → 3 query variations
   → RRF merge
   → Top 5 results

4. Response Generation [LLM #3]
   → Context: 5 chunks
   → Response: "Our return policy allows..."

TOTAL: 3 LLM calls, 2.5 seconds
```

---

### Scenario 2: Folder Summary (30 files)

**Query:** "summarize #meeting-notes"

**Flow:**
```
1. Intent Classification [LLM #1]
   → intent: full_folder_summary
   → retrieval_strategy: full_folder
   → requires_async: true (30 items)

2. Background Job Created
   → User sees: "Analyzing 30 items, ~12 seconds"

3. Fetch All Items
   → 30 items, 90 chunks

4. Processing Mode Selection
   → 30 items < 50 → mode: parallel

5. Batch Creation
   → 5 batches (18 chunks each)

6. Map Phase - Parallel [LLM #2-6]
   → 5 batches process simultaneously
   → Each extracts themes, key points

7. Reduce Phase [LLM #7]
   → Synthesize all batch summaries
   → Response: "Meeting notes cover 5 main themes..."

TOTAL: 7 LLM calls, 12 seconds
```

---

### Scenario 3: Large Aggregation (150 orders)

**Query:** "total amount of all orders in #sales"

**Flow:**
```
1. Intent Classification [LLM #1]
   → intent: aggregation
   → retrieval_strategy: full_folder
   → requires_async: true (150 items)

2. Background Job Created
   → User sees: "Analyzing 150 items, ~35 seconds"

3. Fetch All Items
   → 150 items, 450 chunks

4. Processing Mode Selection
   → 150 items > 50 → mode: iterative

5. Batch Creation
   → 25 batches (18 chunks each)

6. Map Phase - Iterative [LLM #2-26]
   Batch 1:
   → Extract 10 orders
   → Context: {extracted_data: [10 orders]}

   Batch 2:
   → Receives context: "10 orders already found"
   → Extracts 8 NEW orders (skips duplicates)
   → Context: {extracted_data: [18 orders]}

   Batch 3:
   → Receives context: "18 orders already found"
   → Extracts 7 NEW orders
   → Context: {extracted_data: [25 orders]}

   ... [22 more batches]

   Batch 25:
   → Receives context: "143 orders already found"
   → Extracts 7 final orders
   → Context: {extracted_data: [150 orders]}

7. Programmatic Aggregation
   → total: $45,678.90
   → count: 150
   → by_category: {...}
   → NO LLM CALL (pure math)

8. Reduce Phase [LLM #27]
   → Synthesize aggregation into response
   → Response: "I found 150 orders totaling $45,678.90..."

TOTAL: 27 LLM calls, 38 seconds
DEDUPLICATION: 100% accurate (iterative context)
```

---

### Scenario 4: Date-Filtered Aggregation

**Query:** "how much did I spend in december #expenses"

**Flow:**
```
1. Intent Classification [LLM #1]
   → intent: filtered_aggregation
   → retrieval_strategy: filtered_full
   → filter: "december"
   → date_range: {start: "2024-12-01", end: "2024-12-31"}
   → requires_async: true

2. Fetch All Items
   → 100 items in #expenses folder

3. Semantic Filter
   → Filter by similarity to "december"
   → 35 items match (35% of 100)

4. Processing Mode Selection
   → 35 items < 50 but intent=aggregation
   → 35 items > 20 → mode: iterative

5. Batch Creation
   → 6 batches

6. Map Phase - Iterative [LLM #2-7]
   → Each batch extracts amounts with dates
   → Context accumulates across batches
   → Final: 35 expenses extracted

7. Reduce Phase [LLM #8]
   → Response: "In December, you spent $3,245.67
      across 35 expenses..."

TOTAL: 8 LLM calls, 15 seconds
ACCURACY: 100% (only December items)
```

---

## Performance Characteristics

### Latency Breakdown

**Quick Query (top_k):**
```
Intent Classification:    0.5s
Query Enhancement:        0.8s
Database Query:           0.3s
Embedding Generation:     0.2s
Vector Search:            0.4s
Response Generation:      0.8s
─────────────────────────────
TOTAL:                    3.0s
```

**Async Query (50 items, 8 batches, iterative):**
```
Intent Classification:    0.5s
Job Creation:             0.1s
Fetch Items:              1.0s
Semantic Filter:          0.5s
Batch Creation:           0.1s
Map Phase (8 batches):    10.0s  (1.25s each, sequential)
Aggregation:              0.2s
Reduce Phase:             1.5s
Message Storage:          0.2s
─────────────────────────────
TOTAL:                    14.1s
```

**Async Query (150 items, 25 batches, iterative):**
```
Intent Classification:    0.5s
Fetch Items:              2.5s
Batch Creation:           0.3s
Map Phase (25 batches):   31.3s  (1.25s each, sequential)
Aggregation:              0.5s
Reduce Phase:             2.0s
─────────────────────────────
TOTAL:                    37.1s
```

### Token Usage

**Per Query Type:**
```
Quick Query (top_k):
- Intent: 500 tokens
- Enhancement: 500 tokens
- Response: 2000 tokens
TOTAL: 3,000 tokens

Async Query (8 batches):
- Intent: 500 tokens
- Map (8x): 8,000 tokens (1000 each)
- Reduce: 1,500 tokens
TOTAL: 10,000 tokens

Async Query (25 batches):
- Intent: 500 tokens
- Map (25x): 25,000 tokens
- Reduce: 1,500 tokens
TOTAL: 27,000 tokens
```

### Cost Estimates (GPT-4)

**Assuming GPT-4 pricing: $0.01/1K input, $0.03/1K output**

```
Quick Query:
- Input: 2K tokens × $0.01 = $0.02
- Output: 1K tokens × $0.03 = $0.03
TOTAL: $0.05 per query

Async (8 batches):
- Input: 7K tokens × $0.01 = $0.07
- Output: 3K tokens × $0.03 = $0.09
TOTAL: $0.16 per query

Async (25 batches):
- Input: 20K tokens × $0.01 = $0.20
- Output: 7K tokens × $0.03 = $0.21
TOTAL: $0.41 per query
```

### Caching Impact

**Query Enhancement Cache:**
```
Cache Hit Rate: 60-70%
Savings per hit:
- Latency: 0.8s → 0.001s (800x faster)
- Cost: $0.015 → $0 (100% savings)

Monthly Impact (1000 queries):
- Without cache: 1000 × 0.8s = 800s, $15
- With cache (60% hit): 400 × 0.8s = 320s, $6
SAVINGS: 480s (60%), $9 (60%)
```

---

## Configuration & Tuning

### Intent Service Settings

**File:** `intent_service.py:17-18`

```python
# Thresholds
QUICK_QUERY_THRESHOLD_SECONDS = 5
ITEMS_PER_SECOND_ESTIMATE = 10

# Tuning:
# - Decrease threshold (3s) → more async jobs, better UX
# - Increase threshold (10s) → fewer jobs, more sync responses
# - Adjust items/sec based on actual LLM performance
```

### Map-Reduce Settings

**File:** `mapreduce_service.py:22-26`

```python
TARGET_CHUNKS_PER_BATCH = 10
MAX_CONCURRENT_MAP_CALLS = 10
MAP_RETRY_ATTEMPTS = 2
MAX_JOB_DURATION_SECONDS = 600
ITERATIVE_BATCH_THRESHOLD = 50

# Tuning:
# - TARGET_CHUNKS: Smaller (5) = more batches, slower
#                  Larger (20) = fewer batches, faster, higher token usage
# - MAX_CONCURRENT: Increase (20) for faster parallel processing
# - THRESHOLD: Lower (30) = more iterative, fewer duplicates
#              Higher (100) = more parallel, faster
```

### Search Service Settings

**File:** `search_service.py:55-57`

```python
# BM25 parameters
k1 = 1.2  # Term frequency saturation
b = 0.75  # Length normalization

# Hybrid weights (search_service.py:237)
semantic_weight = 0.7
bm25_weight = 0.3

# Tuning:
# - semantic_weight higher (0.8) → more weight on embeddings
# - bm25_weight higher (0.5) → more weight on keywords
# - Must sum to 1.0 for best results
```

### Query Enhancement Settings

**File:** `query_enhancement_service.py:21-22`

```python
_cache_max_size = 1000
_cache_ttl_seconds = 3600  # 1 hour

# Tuning:
# - Increase cache size (5000) for high-traffic systems
# - Increase TTL (7200) for stable query patterns
# - Decrease TTL (1800) for rapidly changing data
```

### LLM Temperature Settings

**Intent Classification:**
```python
temperature = 0.1  # Very consistent classification
```

**Query Enhancement:**
```python
temperature = 0.3  # Moderate creativity for variations
```

**Map Phase:**
```python
temperature = 0.1  # Precise data extraction
```

**Reduce Phase:**
```python
temperature = 0.7  # Natural language synthesis
```

**Response Generation:**
```python
temperature = 0.7  # Conversational responses
```

---

## Monitoring & Debugging

### Key Metrics to Track

**Intent Classification:**
```python
# Log: intent_service.py:102-104
logger.info(f"Intent: {intent_data['intent_type']}, "
           f"Async: {intent_data['requires_async']}, "
           f"Est. time: {intent_data['estimated_time_seconds']}s")

# Monitor:
# - Intent distribution (quick_qa vs aggregation)
# - Async percentage
# - Estimation accuracy
```

**Query Enhancement:**
```python
# Log: query_enhancement_service.py:41, 722
logger.debug(f"Cache hit for query: {original_query[:50]}")
logger.info(f"Query enhancement: {enhancement['enhanced_query']}")

# Monitor:
# - Cache hit rate
# - Enhancement latency
# - Variation quality
```

**Search Performance:**
```python
# Log: search_service.py:274-282
logger.info(f"Retrieved {len(final_results)} documents "
           f"(strategy: {retrieval_strategy}, limit: {result_limit})")

# Monitor:
# - Results per strategy
# - Search latency
# - Relevance scores
```

**Map-Reduce Processing:**
```python
# Log: mapreduce_service.py:732, 742, 800, 818
logger.info(f"Selecting {mode} mode: {total_items} items")
logger.info(f"Using {processing_mode} processing mode")
logger.info(f"Iterative batch {batch_idx + 1}/{len(batches)} complete")

# Monitor:
# - Mode selection distribution
# - Batch failure rate
# - Processing duration vs estimate
# - Deduplication effectiveness
```

### Common Issues & Solutions

**Issue:** Intent misclassification
```
Symptom: Quick query routed to async
Solution: Increase confidence threshold, improve prompt examples
```

**Issue:** Slow query enhancement
```
Symptom: >2s for enhancement
Solution: Check cache hit rate, optimize LLM configuration
```

**Issue:** Duplicate results in aggregations
```
Symptom: Total is 2x expected
Solution: Verify iterative mode is selected for dataset size
```

**Issue:** Map phase timeout
```
Symptom: Job fails at 10 minutes
Solution: Increase MAX_JOB_DURATION_SECONDS, reduce batch size
```

---

## Future Enhancements

### Planned Improvements

1. **Streaming Responses**
   - Stream map results to user as they complete
   - Show progressive totals in UI

2. **Adaptive Batching**
   - Adjust batch size based on LLM latency
   - Larger batches for fast responses

3. **Smart Caching**
   - Cache map results by folder + intent
   - Invalidate on folder updates

4. **Multi-Model Support**
   - Use smaller model (GPT-3.5) for map phase
   - Use larger model (GPT-4) for reduce phase

5. **Query Optimization**
   - Learn common query patterns
   - Pre-compute aggregations for frequent queries

---

## Appendix: File Structure

```
backend/app/services/
├── intent_service.py              # LLM Call #1: Intent Classification
├── query_enhancement_service.py   # LLM Call #2: Query Enhancement
├── search_service.py              # Vector + BM25 search, RRF
├── mapreduce_service.py           # LLM Calls #3-N: Map-Reduce
└── chat_service.py                # Orchestration, LLM Call: Response

backend/app/api/v1/endpoints/
└── chat.py                        # REST endpoints, job status

backend/app/models/
├── database.py                    # KnowledgeItem, Vector, ProcessingJob
└── schemas.py                     # Request/Response models

backend/app/core/
├── embeddings.py                  # Embedding generation, LLM client
└── database.py                    # Database connection
```

---

**End of Documentation**

For questions or issues, refer to:
- Implementation code in `backend/app/services/`
- Test cases in `backend/app/tests/`
- API documentation in Swagger UI

**Last Updated:** October 5, 2025
**Version:** 2.0
**Status:** Production Ready ✅
