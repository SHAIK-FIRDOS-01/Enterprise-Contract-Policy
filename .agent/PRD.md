# Product Requirements Document (PRD)

## Enterprise Contract & Policy Copilot (Hybrid RRF RAG & Real-Time Telemetry Engine)

---

## 1. Executive Summary & Business Problem Statement

Enterprise organizations navigate thousands of high-stakes legal agreements, vendor contracts, master service agreements (MSAs), and regulatory compliance policies annually. Currently, legal and compliance teams face severe operational bottlenecks:
- **Lengthy Review Cycles**: Manual review of 50-to-200 page contracts takes 4 to 12 hours per document, stalling procurement and deal execution.
- **Risk of Hallucinated AI Advice**: Generic LLMs hallucinate clauses or fail to pinpoint exact contractual language, risking catastrophic legal exposure.
- **Opaque Retrieval**: Naive dense-only or sparse-only search misses critical numerical thresholds, section numbers, or legal phrasing (e.g., "consequential damages cap under Section 14.2").
- **Lack of Operational Telemetry**: Enterprises lack granular visibility into real execution latency, token economics, and grounding verification across query lifecycles.

The **Enterprise Contract & Policy Copilot** resolves these challenges through a unified, production-grade architecture:
1. **Hybrid RRF Search Engine**: Combines dense semantic vector retrieval (pgvector HNSW) with sparse lexical full-text search (`tsvector`), fused via **Reciprocal Rank Fusion (RRF $k=60$)**, with sub-chunk coordinate bounding box extraction (`PyMuPDF`) for sub-second, hallucination-resistant retrieval.
2. **Groq Low-Latency Inference**: Ultra-fast LLM generation and streaming powered by the Groq Python SDK (`llama-3.3-70b-versatile` / `mixtral-8x7b-32768`), delivering Time-To-First-Token (TTFT) under 500ms.
3. **Real-Time Telemetry Engine**: Every pipeline step (`INGEST_CHUNK_PARSE`, `EMBEDDING_GEN`, `RRF_RETRIEVAL`, `LLM_SYNTHESIS`, `CITATION_VERIFY`) writes actual execution records to PostgreSQL in `AuditBenchmarkLog`, tracking precise wall-clock duration (`time.perf_counter()`), prompt/completion/total token counts, and dollar costs calculated per Groq rate tables.

---

## 2. Persona Workflows & Target Users

### Persona 1: Legal Auditor (Primary User)
- **Role**: Staff counsel or legal auditor reviewing bilateral contracts and compliance policies.
- **Goals**: Verify clause adherence, locate non-standard indemnification liabilities, and generate audit trails.
- **Workflow**:
  1. Uploads counterparty Master Service Agreement (PDF).
  2. Waits for non-blocking asynchronous Celery ingestion.
  3. Inspects the automated Clause Playbook Audit to view flags on liability caps, governing law, and indemnities.
  4. Queries Copilot: *"Does this contract include a mutual indemnification clause, and what is the liability cap?"*
  5. Clicks returned citation badges to immediately jump to the exact page and highlight the bounding box in the integrated PDF viewer.
  6. Exports audit summary and redline diffs.

### Persona 2: Compliance Officer
- **Role**: Corporate governance officer responsible for GDPR, SOC 2, HIPAA, and internal policy conformance.
- **Goals**: Ensure every contract conforms to updated organizational policy rules and data privacy guidelines.
- **Workflow**:
  1. Submits vendor data processing addenda (DPAs).
  2. Runs automated Playbook Compliance Checklists against organizational security standards.
  3. Reviews AI redlining suggestions to replace non-compliant terms with standardized playbook language.

### Persona 3: System Administrator / DevOps Lead
- **Role**: Platform owner monitoring latency, inference cost, and system reliability.
- **Goals**: Quantify copilot accuracy, monitor token consumption, and inspect real operational logs.
- **Workflow**:
  1. Opens the Telemetry & Audit Dashboard.
  2. Inspects real terminal logs and database records in `AuditBenchmarkLog` across all operations.
  3. Evaluates prompt/completion token usage and cost metrics calculated per Groq pricing tables.

---

## 3. Core Functional Requirements

### 3.1 Multi-Page PDF Ingestion & Coordinate-Level Bounding Box Extraction
- Ingest multi-page PDFs up to 200 pages and 50MB.
- Use `PyMuPDF (fitz)` to extract structural text blocks with precise coordinate bounding boxes:
  $$\text{BBox} = \{x_0, y_0, x_1, y_1\} \quad \text{on page } p$$
- Segregate text into semantic chunks (~400-800 tokens) while preserving exact page number and bounding box coordinates for each chunk.
- Generate dense vector embeddings (384 dimensions) using local HuggingFace embeddings (`sentence-transformers/all-MiniLM-L6-v2` or `BAAI/bge-small-en-v1.5`) or OpenAI.
- Generate PostgreSQL `tsvector` representations for full-text lexical search.
- Ingestion runs asynchronously via Celery workers backed by Redis, keeping the HTTP upload endpoint non-blocking (`202 Accepted`).

### 3.2 Hybrid Search with Reciprocal Rank Fusion (RRF $k=60$)
- Query the PostgreSQL database simultaneously across two modalities:
  1. **Dense Semantic Retrieval**: Cosine distance against `DocumentChunk.embedding` using pgvector HNSW indexing (`vector_cosine_ops`).
  2. **Sparse Lexical Retrieval**: `ts_rank_cd` ranking against `DocumentChunk.search_vector` using PostgreSQL full-text search.
- Fuse the two ranked result sets via raw SQL Reciprocal Rank Fusion using constant $k=60$:
  $$RRF\_Score(d) = \frac{1}{60 + \text{rank}_{dense}(d)} + \frac{1}{60 + \text{rank}_{sparse}(d)}$$
- Return top-$K$ chunks with bounding box metadata, page numbers, and similarity rankings.

### 3.3 Server-Sent Events (SSE) Token Streaming with Deep-Linked Citations
- Endpoint: `POST /api/query/stream/`
- Stream Groq LLM generations token-by-token using Django's `StreamingHttpResponse` with SSE format (`data: {"type": "token", "content": "..."}`).
- Send structured citation payloads (`data: {"type": "citation", "chunk_id": "...", "page_number": 3, "bounding_box": {...}}`).
- Emit terminal event `data: [DONE]`.
- React frontend renders tokens in real time and renders interactive citation chips that synchronize with the PDF viewer.

### 3.4 Operational Telemetry & Audit Benchmark Logging
- Every pipeline execution logs discrete records to `AuditBenchmarkLog`:
  - `operation`: `INGEST_CHUNK_PARSE`, `EMBEDDING_GEN`, `RRF_RETRIEVAL`, `LLM_SYNTHESIS`, `CITATION_VERIFY`.
  - `model_name`: String identifier (e.g., `llama-3.3-70b-versatile`, `all-MiniLM-L6-v2`).
  - `duration_ms`: High-precision float wall-clock execution time via `time.perf_counter()`.
  - `prompt_tokens`, `completion_tokens`, `total_tokens`.
  - `estimated_cost_usd`: Calculated per Groq rate tables.
  - `status`: `SUCCESS` vs `FAILED`.
  - `error_message`: Text or null.
- Expose summary telemetry endpoint: `GET /api/benchmarks/summary/`.

---

## 4. Feature Specifications

### 4.1 AI-Assisted Contract Redlining & Diff Generator
- Compare contract clauses against standard organizational playbooks.
- Highlight inserted, modified, or deleted legal stipulations with side-by-side or inline redline diff formatting.
- Provide risk justifications explaining why a counterparty's clause poses liability risk.

### 4.2 Automated Clause Playbook Audit / Compliance Checklist
- Evaluate uploaded contracts against standard clauses:
  - Confidentiality & Non-Disclosure (term length, exclusions)
  - Limitation of Liability (aggregate cap vs fees paid, carve-outs)
  - Indemnification (IP infringement, gross negligence, mutual vs unilateral)
  - Termination for Convenience (notice period, cure windows)
  - Governing Law & Dispute Resolution (jurisdiction, arbitration clauses)
- Output a structured scorecard with status: `COMPLIANT`, `FLAGGED`, or `CRITICAL_RISK`.

### 4.3 Secure Authentication with HttpOnly Cookie Rotation
- Custom user model with `email`, `role` (`AUDITOR`, `ADMIN`), `is_active`.
- Pair access and refresh tokens stored in HttpOnly, Secure, SameSite cookies.
- Automated sliding refresh token rotation with token blacklist support on logout.
- Zero client-side storage of JWTs in `localStorage` or `sessionStorage` to eliminate XSS token theft vectors.

---

## 5. Non-Functional Requirements

| Metric / Aspect | Requirement |
| :--- | :--- |
| **Search Latency** | Hybrid RRF query retrieval under 250ms for 100k chunk index. |
| **Streaming Latency** | Time to First Token (TTFT) under 500ms via Groq API. |
| **Throughput & Concurrency** | Ingestion queues handled asynchronously; HTTP server never blocks on PDF parsing or embedding computation. |
| **Zero Database Lockups** | Batch chunk insertion inside database transactions; separate Celery worker pool. |
| **Security Hygiene** | Strict role-based access control (RBAC), HttpOnly cookies, zero committed credentials, sanitized SQL inputs. |
| **Reliability & Resilience** | Celery tasks support exponential backoff retries on external LLM/Groq API failures; document status transitions to `FAILED` with logged error if terminal. |
