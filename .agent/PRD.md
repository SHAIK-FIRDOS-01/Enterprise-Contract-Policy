# Product Requirements Document (PRD)

## Enterprise Contract & Policy Copilot (Dual-System RAG with Hybrid RRF & Telemetry Engine)

---

## 1. Executive Summary & Business Problem Statement

Enterprise organizations navigate thousands of high-stakes legal agreements, vendor contracts, master service agreements (MSAs), and regulatory compliance policies annually. Currently, legal and compliance teams face severe bottlenecks:
- **Lengthy Review Cycles**: Manual review of 50-to-200 page contracts takes 4 to 12 hours per document, stalling procurement and sales deals.
- **Risk of Hallucinated AI Advice**: Generic LLMs hallucinate clauses or fail to pinpoint exact contractual language, risking catastrophic legal exposure.
- **Opaque Retrieval**: Existing naive vector search fails when searching for exact domain terminology, section numbers, or nuanced legal phrasing (e.g. "consequential damages cap within Section 14.2").
- **Lack of Verification Telemetry**: Enterprises lack visibility into grounding accuracy, token economics, latency, and parse validity between standard baseline LLMs and specialized RAG pipelines.

The **Enterprise Contract & Policy Copilot** resolves these challenges through a dual-system architecture:
1. **System One (Dual-System RAG)**: Combines dense vector semantic retrieval (pgvector HNSW) with sparse lexical full-text search (`tsvector`), fused via **Reciprocal Rank Fusion (RRF $k=60$)**, with sub-chunk coordinate bounding box extraction (`PyMuPDF`) for sub-second, hallucination-resistant retrieval.
2. **System Two (Telemetry & Benchmarking Engine)**: Continuously records latency, token cost, schema parse validity, and grounding metrics across query executions in an `AuditBenchmarkLog` ledger, allowing real-time auditability and ROI tracking.

---

## 2. Persona Workflows & Target Users

### Persona 1: Legal Auditor (Primary User)
- **Role**: Staff counsel or external legal auditor reviewing complex bilateral agreements.
- **Goals**: Verify clause adherence, locate non-standard indemnification liabilities, and generate audit trails.
- **Workflow**:
  1. Uploads counterparty Master Service Agreement (PDF).
  2. Waits for non-blocking asynchronous ingestion.
  3. Inspects the automated Clause Playbook Audit to view flags on liability caps, governing law, and indemnities.
  4. Chats with Copilot: *"Does this contract include a mutual indemnification clause, and what is the liability cap?"*
  5. Clicks returned citation badges to immediately jump to the exact page and highlight the bounding box in the integrated PDF viewer.
  6. Exports audit summary and redline diffs.

### Persona 2: Compliance Officer
- **Role**: Corporate governance officer responsible for GDPR, SOC 2, HIPAA, and internal policy conformance.
- **Goals**: Ensure every contract conforms to updated organizational policy rules and data privacy guidelines.
- **Workflow**:
  1. Submits batches of vendor data processing addenda (DPAs).
  2. Runs automated Playbook Compliance Checklists against SOC 2 security schedules.
  3. Reviews AI redlining suggestions to replace non-compliant terms with standardized playbook language.

### Persona 3: C-Suite Executive / General Counsel
- **Role**: VP of Legal / General Counsel managing risk posture and software efficiency.
- **Goals**: Quantify copilot accuracy, monitor inference cost, and review audit benchmarks.
- **Workflow**:
  1. Opens the Telemetry & Benchmark Dashboard.
  2. Analyzes comparative metrics between Baseline LLM vs Optimized Hybrid RRF pipelines (latency, grounding confidence, estimated cost).
  3. Reviews audit logs for compliance tracking.

---

## 3. Core Functional Requirements

### 3.1 Multi-Page PDF Ingestion & Coordinate-Level Bounding Box Extraction
- Ingest multi-page PDFs up to 200 pages and 50MB.
- Use `PyMuPDF (fitz)` to extract structural text blocks with precise coordinate bounding boxes:
  $$\text{BBox} = \{x_0, y_0, x_1, y_1\} \quad \text{on page } p$$
- Segregate text into semantic chunks (~400-800 tokens) while preserving exact page number and bounding box coordinates for each chunk.
- Generate dense vector embeddings (1536 dimensions) using OpenAI-compatible embedding models.
- Generate PostgreSQL `tsvector` representations for full-text search.
- Ingestion must run asynchronously via Celery workers backed by Redis, keeping the HTTP upload endpoint non-blocking (`202 Accepted`).

### 3.2 Hybrid Search with Reciprocal Rank Fusion (RRF $k=60$)
- Query the PostgreSQL database simultaneously across two modalities:
  1. **Dense Semantic Retrieval**: Cosine distance against `DocumentChunk.embedding` using pgvector HNSW indexing (`vector_cosine_ops`).
  2. **Sparse Lexical Retrieval**: `ts_rank_cd` ranking against `DocumentChunk.search_vector` using PostgreSQL full-text search.
- Fuse the two ranked result sets via raw SQL Reciprocal Rank Fusion using constant $k=60$:
  $$RRF\_Score(d) = \frac{1}{60 + \text{rank}_{dense}(d)} + \frac{1}{60 + \text{rank}_{sparse}(d)}$$
- Return top-$K$ chunks with bounding box metadata, page numbers, and similarity rankings.

### 3.3 Server-Sent Events (SSE) Token Streaming with Deep-Linked Citations
- Endpoint: `POST /api/query/stream/`
- Stream model generation token-by-token using Django's `StreamingHttpResponse` with SSE format (`data: {"type": "token", "content": "..."}`).
- Send structured citation payloads (`data: {"type": "citation", "chunk_id": "...", "page_number": 3, "bounding_box": {...}}`).
- Emit terminal event `data: [DONE]`.
- React frontend renders tokens in real time and renders interactive citation chips that immediately control the PDF viewer.

### 3.4 Automated Benchmark Instrumentation & Telemetry Engine
- Track every pipeline execution inside `AuditBenchmarkLog`:
  - `pipeline_type`: `BASELINE_LLM` vs `LAYA_SYSTEM_ONE` (Hybrid RAG).
  - `operation`: `INGEST_TRIAGE`, `CITATION_VERIFY`, `END_TO_END_QUERY`.
  - `duration_ms`: Wall-clock latency in milliseconds.
  - `input_tokens`, `output_tokens`, and `estimated_cost_usd`.
  - `schema_parse_success`: Boolean indicating valid structured JSON extraction.
  - `grounding_score`: Quantitative attribution score between answer claims and source chunks.
- Aggregated metrics API endpoint: `GET /api/benchmarks/summary/`.

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
| **Streaming Latency** | Time to First Token (TTFT) under 600ms via SSE. |
| **Throughput & Concurrency** | Ingestion queues handled asynchronously; HTTP server never blocks on PDF parsing or embedding API calls. |
| **Zero Database Lockups** | Batch chunk insertion inside database transactions; separate worker pool. |
| **Security Hygiene** | Strict role-based access control (RBAC), HttpOnly cookies, zero committed credentials, sanitized SQL inputs. |
| **Reliability & Resilience** | Celery tasks support exponential backoff retries on external LLM/embedding API failures; document status transitions to `FAILED` with logged error if terminal. |
