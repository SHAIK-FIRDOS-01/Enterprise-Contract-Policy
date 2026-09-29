# Technical Architecture Specification (SPEC)

**Enterprise Contract & Policy Copilot (Hybrid RRF RAG & Real-Time Telemetry Engine)**

Triage Label: `ready-for-agent`

---

## 1. Problem Statement

Corporate legal and compliance departments struggle to audit voluminous contracts and policy documents efficiently. Off-the-shelf generative AI tools suffer from critical failure modes:
1. Hallucinated clauses and inaccurate legal advice due to ungrounded LLM synthesis.
2. Inability to verify claims against the underlying legal document at the exact coordinate/sentence level.
3. Degraded retrieval accuracy due to reliance on purely dense semantic search or purely keyword search, missing critical section references, numerical thresholds, or defined terms.
4. Total absence of real operational telemetry tracking latency, token economics, and error rates across retrieval and synthesis stages.

---

## 2. Solution

The Enterprise Contract & Policy Copilot provides a unified, production-grade architecture:
1. **Document Ingestion & Coordinate Chunking**:
   - Parses multi-page contracts with PyMuPDF (`fitz`), preserving coordinate bounding boxes `[x0, y0, x1, y1]` for every chunk.
   - Computes dense embeddings (384-dim) using local HuggingFace embeddings (`all-MiniLM-L6-v2` or `bge-small-en-v1.5`) stored with `pgvector` HNSW indexes (`vector_cosine_ops`).
   - Computes sparse lexical vectors stored in PostgreSQL `tsvector` with GIN indexes.
2. **Hybrid RRF Search Engine**:
   - Combines dense cosine similarity and sparse `ts_rank_cd` via raw SQL **Reciprocal Rank Fusion (RRF $k=60$)**.
3. **Groq Low-Latency Token Streaming**:
   - Streams answers token-by-token using Server-Sent Events (SSE) via the `groq` Python client SDK (`llama-3.3-70b-versatile`), attaching exact coordinate citation payloads that synchronize with an in-browser PDF viewer.
4. **Real-Time Telemetry Engine**:
   - Records every pipeline step into an `AuditBenchmarkLog` table (`INGEST_CHUNK_PARSE`, `EMBEDDING_GEN`, `RRF_RETRIEVAL`, `LLM_SYNTHESIS`, `CITATION_VERIFY`).
   - Records wall-clock duration (`time.perf_counter()`), prompt/completion/total token counts, and cost calculated per Groq rate tables.

---

## 3. User Stories

1. As a Legal Auditor, I want to securely log in with my enterprise credentials using HttpOnly cookies, so that my authentication session cannot be hijacked via client-side XSS attacks.
2. As a Legal Auditor, I want to upload a 100-page PDF contract and receive an immediate `202 Accepted` response with a tracking UUID, so that my browser never freezes during file processing.
3. As a Legal Auditor, I want to poll the document status endpoint, so that I can monitor progress through `PENDING`, `PROCESSING`, and `READY` states.
4. As a Legal Auditor, I want text chunks extracted with exact PDF bounding box coordinates, so that text segments can be visually highlighted on the original document layout.
5. As a Legal Auditor, I want hybrid search combining keyword and semantic matching, so that queries containing specific clause numbers (e.g. "Section 14.2") and conceptual phrases (e.g. "consequential damages exclusion") both return accurate results.
6. As a Legal Auditor, I want to ask natural-language questions and receive streamed answers token-by-token powered by Groq, so that Time-To-First-Token is under 500ms.
7. As a Legal Auditor, I want citations in the streaming response to include chunk IDs, page numbers, and bounding box coordinates, so that I can click any citation badge to highlight the exact sentence in the PDF viewer.
8. As a Legal Auditor, I want to view a split-pane layout with the PDF viewer on the left and the Copilot chat on the right, so that I can cross-reference answers against the primary source document.
9. As a Compliance Officer, I want to trigger an automated clause playbook audit, so that I can instantly see which standard organizational clauses (indemnification, governing law, data privacy) are missing, compliant, or flagged.
10. As a Compliance Officer, I want an AI-assisted redlining diff tool, so that I can compare non-compliant contract clauses against approved organizational language.
11. As a System Administrator, I want to access the Telemetry Engine summary, so that I can analyze real execution latency, token counts, and costs calculated per Groq rate tables.
12. As a System Administrator, I want automated benchmark scripts that query the platform and output execution metrics, so that system reliability and latency can be audited continuously.

---

## 4. Implementation Decisions

### 4.1 Modular Architecture (5 Isolated Django Apps)
The backend is organized into 5 isolated apps under `backend/apps/`:
1. `apps/authentication`: Custom User model, SimpleJWT cookie rotation & token blacklist.
2. `apps/documents`: Document and DocumentChunk models, PyMuPDF bounding-box extraction service, Celery async tasks.
3. `apps/search`: Hybrid search service using pgvector HNSW + tsvector full-text search fused via raw SQL RRF ($k=60$).
4. `apps/query`: Groq SSE token streaming endpoint (`StreamingHttpResponse`), prompt assembly, citation payloads.
5. `apps/analytics`: `AuditBenchmarkLog` model, telemetry recording service, metrics aggregation endpoints.

---

### 4.2 PostgreSQL Database Schemas

#### App: `apps/authentication`
```sql
CREATE TABLE authentication_user (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(128) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'AUDITOR', -- 'AUDITOR', 'ADMIN'
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_staff BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

#### App: `apps/documents`
```sql
CREATE TABLE documents_document (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES authentication_user(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    file_path VARCHAR(1024) NOT NULL,
    page_count INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'PROCESSING', 'READY', 'FAILED'
    error_message TEXT DEFAULT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE documents_documentchunk (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents_document(id) ON DELETE CASCADE,
    page_number INTEGER NOT NULL, -- 1-indexed
    chunk_index INTEGER NOT NULL, -- 0-indexed sequence within document
    text_content TEXT NOT NULL,
    bounding_box JSONB NOT NULL, -- {"x0": float, "y0": float, "x1": float, "y1": float}
    embedding vector(384) DEFAULT NULL, -- 384 dimensions for all-MiniLM-L6-v2 / bge-small
    search_vector tsvector DEFAULT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for Hybrid Search
CREATE INDEX idx_chunks_doc_page ON documents_documentchunk(document_id, page_number);
CREATE INDEX idx_chunks_embedding_hnsw ON documents_documentchunk USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_chunks_search_vector_gin ON documents_documentchunk USING gin (search_vector);
```

#### App: `apps/analytics`
```sql
CREATE TABLE analytics_auditbenchmarklog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operation VARCHAR(50) NOT NULL,     -- 'INGEST_CHUNK_PARSE', 'EMBEDDING_GEN', 'RRF_RETRIEVAL', 'LLM_SYNTHESIS', 'CITATION_VERIFY'
    model_name VARCHAR(100) NOT NULL,   -- 'llama-3.3-70b-versatile', 'all-MiniLM-L6-v2', etc.
    duration_ms DOUBLE PRECISION NOT NULL, -- precise wall-clock execution via time.perf_counter()
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    estimated_cost_usd NUMERIC(10, 6) NOT NULL DEFAULT 0.000000, -- per Groq rate tables
    status VARCHAR(20) NOT NULL DEFAULT 'SUCCESS', -- 'SUCCESS', 'FAILED'
    error_message TEXT DEFAULT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_benchmark_op ON analytics_auditbenchmarklog(operation);
CREATE INDEX idx_benchmark_status ON analytics_auditbenchmarklog(status);
CREATE INDEX idx_benchmark_created_at ON analytics_auditbenchmarklog(created_at);
```

---

### 4.3 API REST & SSE Specifications

#### 1. Authentication Endpoints
- `POST /api/auth/token/`
  - Body: `{"email": "auditor@enterprise.local", "password": "..."}`
  - Response: `200 OK` + JSON body `{"user": {"id": "...", "email": "...", "role": "..."}}`.
  - Sets HttpOnly, Secure, SameSite=Lax cookies: `access_token` (15m expiry) and `refresh_token` (7d expiry).
- `POST /api/auth/token/refresh/`
  - Reads `refresh_token` cookie, rotates the token pair, invalidates old refresh token in blacklist, sets new cookies.
- `POST /api/auth/logout/`
  - Blacklists active refresh token and clears auth cookies.

#### 2. Documents Endpoints
- `POST /api/documents/upload/`
  - Request: `multipart/form-data` with `file: <pdf>`, `title: "..."`.
  - Response: `202 Accepted`
  ```json
  {
    "document_id": "c1f7a402-8356-4e59-a681-36fbb015848d",
    "title": "Vendor-MSA-2026.pdf",
    "status": "PENDING",
    "message": "Document accepted for asynchronous ingestion."
  }
  ```
- `GET /api/documents/{id}/status/`
  - Response: `200 OK`
  ```json
  {
    "id": "c1f7a402-8356-4e59-a681-36fbb015848d",
    "status": "READY",
    "page_count": 42,
    "chunk_count": 184,
    "created_at": "2026-09-29T11:00:00Z"
  }
  ```
- `GET /api/documents/{id}/chunks/`
  - Query params: `page` (optional filter).
  - Response: `200 OK` containing array of chunks with bounding boxes.

#### 3. Query & SSE Streaming Endpoint
- `POST /api/query/stream/`
  - Body:
  ```json
  {
    "document_id": "c1f7a402-8356-4e59-a681-36fbb015848d",
    "query": "What is the limitation of liability cap?",
    "playbook_mode": false
  }
  ```
  - Response Headers:
    - `Content-Type: text/event-stream`
    - `Cache-Control: no-cache`
    - `X-Accel-Buffering: no`
  - Stream Events Protocol:
    1. First, search citations are emitted:
       `data: {"type": "citation", "chunk_id": "...", "page_number": 14, "bounding_box": {"x0": 72.0, "y0": 210.5, "x1": 520.0, "y1": 280.0}, "text_snippet": "..."}`
    2. Then, Groq LLM answer tokens are streamed:
       `data: {"type": "token", "content": "The "}`
       `data: {"type": "token", "content": "limitation "}`
       `data: {"type": "token", "content": "of liability is capped at... [Ref:1]"}`
    3. Finally, the terminal token is sent:
       `data: [DONE]`

#### 4. Analytics & Telemetry Summary Endpoints
- `GET /api/benchmarks/summary/`
  - Response: `200 OK` with real operational telemetry aggregated across operations:
  ```json
  {
    "total_operations": 840,
    "operations_breakdown": {
      "INGEST_CHUNK_PARSE": {"count": 120, "avg_duration_ms": 210.4},
      "EMBEDDING_GEN": {"count": 120, "avg_duration_ms": 145.2},
      "RRF_RETRIEVAL": {"count": 300, "avg_duration_ms": 68.7},
      "LLM_SYNTHESIS": {"count": 300, "avg_duration_ms": 482.1, "total_tokens": 145200, "total_cost_usd": 0.087120}
    },
    "system_health": {
      "overall_success_rate": 0.995,
      "failed_operations": 4
    }
  }
  ```

---

### 4.4 Raw Reciprocal Rank Fusion (RRF $k=60$) SQL Specification

```sql
WITH dense_search AS (
    SELECT 
        id,
        ROW_NUMBER() OVER (ORDER BY embedding <=> %(query_embedding)s::vector) AS dense_rank
    FROM documents_documentchunk
    WHERE document_id = %(document_id)s
    ORDER BY embedding <=> %(query_embedding)s::vector
    LIMIT %(candidate_limit)s
),
sparse_search AS (
    SELECT 
        id,
        ROW_NUMBER() OVER (ORDER BY ts_rank_cd(search_vector, plainto_tsquery('english', %(query_text)s)) DESC) AS sparse_rank
    FROM documents_documentchunk
    WHERE document_id = %(document_id)s
      AND search_vector @@ plainto_tsquery('english', %(query_text)s)
    ORDER BY ts_rank_cd(search_vector, plainto_tsquery('english', %(query_text)s)) DESC
    LIMIT %(candidate_limit)s
)
SELECT 
    c.id,
    c.document_id,
    c.page_number,
    c.chunk_index,
    c.text_content,
    c.bounding_box,
    COALESCE(1.0 / (60 + d.dense_rank), 0.0) +
    COALESCE(1.0 / (60 + s.sparse_rank), 0.0) AS rrf_score
FROM documents_documentchunk c
LEFT JOIN dense_search d ON c.id = d.id
LEFT JOIN sparse_search s ON c.id = s.id
WHERE d.id IS NOT NULL OR s.id IS NOT NULL
ORDER BY rrf_score DESC
LIMIT %(final_limit)s;
```

---

## 5. Testing Decisions

### Seam Architecture & High Seam Testing
- **Authentication Seam**: HTTP cookie exchange, rotation, and rejection on revoked tokens (`tests/backend/test_auth.py`).
- **Ingestion & Extraction Seam**: Mock PDF byte stream through PyMuPDF block parser validating bounding box coordinate calculations (`tests/backend/test_documents_pipeline.py`).
- **Search Seam**: RRF query execution against pgvector test database verifying ranking stability when dense and sparse ranks diverge (`tests/backend/test_search_rrf.py`).
- **Query & Streaming Seam**: SSE stream reader client testing token arrival and JSON citation decoding with mock Groq generator (`tests/backend/test_query_stream.py`).
- **Telemetry Seam**: Audit log creation, duration timing, and token/cost calculations per Groq rate tables (`tests/backend/test_analytics.py`).
- **Frontend Seam**: React component integration with Vitest and user journey tests with Playwright (`tests/frontend/`).

---

## 6. Out of Scope

- Optical Character Recognition (OCR) for scanned bitmaps without embedded text (standard text-layer PDFs are targeted for initial enterprise deployment).
- Direct e-signature integrations (DocuSign/HelloSign API hooks).
- Multi-tenant multi-organization billing with Stripe payment gateways.
- Model fine-tuning pipelines.

---

## 7. Further Notes

- Vector embeddings standardize on 384 dimensions for `all-MiniLM-L6-v2` / `bge-small-en-v1.5` (or 1536 if OpenAI embeddings are explicitly configured).
- Coordinate bounding boxes use the standard PDF coordinate system where `(x0, y0)` is top-left and `(x1, y1)` is bottom-right in PDF points.
- Bounding box rendering in the React PDF viewer converts points to canvas percentages for responsive scaling.
