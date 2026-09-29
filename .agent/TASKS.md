# Implementation Roadmap & Autonomous Task Ledger

This ledger contains the exhaustive 12-ticket roadmap for the **Enterprise Contract & Policy Copilot**.
In accordance with `.agent/HARNESS.md`, the agent must execute strictly **ONE atomic ticket** per run.
Never proceed to ticket $N+1$ until ticket $N$ passes all verification gate checks.

---

## Ticket Overview

| Ticket ID | Status | Module / App | Description |
| :--- | :--- | :--- | :--- |
| **TICKET-01** | `[x] Complete` | Core Infrastructure | Scaffolding, Docker Compose (pgvector + Redis 7), Python (`groq`, `sentence-transformers`) & Node dependencies |
| **TICKET-02** | `[x] Complete` | `core` & `analytics` | Django settings, modular URL routing, `AuditBenchmarkLog` model & telemetry tests |
| **TICKET-03** | `[x] Complete` | `authentication` | Custom User model, SimpleJWT HttpOnly cookie rotation, auth tests |
| **TICKET-04** | `[x] Complete` | `documents` | Document & DocumentChunk models, pgvector VectorField(384), HNSW & GIN indexes |
| **TICKET-05** | `[x] Complete` | `documents` | PyMuPDF (fitz) bounding box extraction engine & mock PDF unit tests |
| **TICKET-06** | `[ ] Pending` | `documents` & Celery | Celery async worker, ingestion task, local embedding generation, Groq clause extraction & telemetry |
| **TICKET-07** | `[ ] Pending` | `search` | Hybrid Search service (Dense pgvector + tsvector FTS fused via RRF $k=60$) & tests |
| **TICKET-08** | `[ ] Pending` | `query` | Groq SSE Streaming Endpoint (`StreamingHttpResponse`), citation injection, telemetry |
| **TICKET-09** | `[ ] Pending` | `frontend` | React 18+ Vite + Tailwind initialization, auth context, TanStack Query client |
| **TICKET-10** | `[ ] Pending` | `frontend` | PDF.js split-pane viewer with dynamic bounding-box canvas highlight overlays |
| **TICKET-11** | `[ ] Pending` | `frontend` | SSE streaming chat interface with interactive citation badges syncing to viewer |
| **TICKET-12** | `[ ] Pending` | `scripts` & Analytics | Benchmark automation (`run_benchmark_suite.py`) & metrics export (`export_metrics.py`) |

---

## Detailed Ticket Specifications

### TICKET-01: Core Infrastructure, Docker Services & Dependency Scaffolding
- **Status**: `[x] Complete`
- **Scope**: Core project directory structure, Docker Compose with PostgreSQL 16 + `pgvector` extension and Redis 7, Python configuration (`pyproject.toml`, `requirements.txt`, `requirements-dev.txt`) with `groq` and `sentence-transformers`, Frontend base (`package.json`, `tsconfig.json`, `vite.config.ts`), and `.env.example` with `GROQ_API_KEY`.
- **Files**:
  - `docker-compose.yml`
  - `.env.example`
  - `pyproject.toml`
  - `backend/requirements.txt`
  - `backend/requirements-dev.txt`
  - `frontend/package.json`
- **Verification Gate**:
  - `flake8 backend`
  - `mypy backend`
  - `bash ./scripts/harness-check.sh`

---

### TICKET-02: Django Core Settings, Modular URL Routing & Analytics Telemetry
- **Status**: `[x] Complete`
- **Scope**: Configure Django core `settings.py` for modular 5-app architecture, database credentials from environment, pgvector engine compatibility, modular root `urls.py`. Implement `apps/analytics` with `AuditBenchmarkLog` model (tracking `operation`, `model_name`, `duration_ms` via `time.perf_counter()`, `prompt_tokens`, `completion_tokens`, `total_tokens`, `estimated_cost_usd` per Groq rates, `status`, `error_message`), telemetry recording service, and Pytest suite.
- **Files**:
  - `backend/core/settings.py`
  - `backend/core/urls.py`
  - `backend/core/celery.py`
  - `backend/apps/analytics/models.py`
  - `backend/apps/analytics/services.py`
  - `backend/apps/analytics/views.py`
  - `tests/backend/test_analytics.py`
- **Verification Gate**:
  - `pytest tests/backend/test_analytics.py -q --tb=short`
  - `flake8 backend`
  - `mypy backend`

---

### TICKET-03: Authentication Engine with HttpOnly Cookie Rotation
- **Status**: `[x] Complete`
- **Scope**: Custom `User` model (`UUID`, `email`, `role`, `is_active`) in `apps/authentication`. Configure `djangorestframework-simplejwt` with custom cookie authentication middleware, login endpoint setting HttpOnly `access_token` and `refresh_token` cookies, refresh endpoint with token rotation, and logout endpoint with token blacklisting.
- **Files**:
  - `backend/apps/authentication/models.py`
  - `backend/apps/authentication/serializers.py`
  - `backend/apps/authentication/authentication.py`
  - `backend/apps/authentication/views.py`
  - `backend/apps/authentication/urls.py`
  - `tests/backend/test_auth.py`
- **Verification Gate**:
  - `pytest tests/backend/test_auth.py -q --tb=short`
  - `flake8 backend`
  - `mypy backend`

---

### TICKET-04: Documents Data Layer & pgvector VectorField Schema
- **Status**: `[x] Complete`
- **Scope**: Implement `Document` and `DocumentChunk` models in `apps/documents`. Integrate `pgvector.django.VectorField(dimensions=384)` and `django.contrib.postgres.search.SearchVectorField`. Add HNSW index (`vector_cosine_ops`) and GIN index for full-text search. Generate initial Django migrations and verify bidirectional migration reversibility.
- **Files**:
  - `backend/apps/documents/models.py`
  - `backend/apps/documents/serializers.py`
  - `backend/apps/documents/migrations/0001_initial.py`
  - `tests/backend/test_documents_models.py`
- **Verification Gate**:
  - `pytest tests/backend/test_documents_models.py -q --tb=short`
  - `python backend/manage.py makemigrations --check --dry-run`
  - `flake8 backend`
  - `mypy backend`

---

### TICKET-05: PyMuPDF Coordinate Bounding-Box Extraction Pipeline
- **Status**: `[x] Complete`
- **Scope**: Build extraction service in `apps/documents/services/pdf_extractor.py` using `PyMuPDF` (`fitz`). Extract structured text blocks per page with exact coordinates `[x0, y0, x1, y1]`, normalize bounding boxes, chunk text into coherent legal segments (preserving page number and bounding box), and write unit test suite with mock generated PDF buffers.
- **Files**:
  - `backend/apps/documents/services/pdf_extractor.py`
  - `tests/backend/test_pdf_extractor.py`
- **Verification Gate**:
  - `pytest tests/backend/test_pdf_extractor.py -q --tb=short`
  - `flake8 backend`
  - `mypy backend`

---

### TICKET-06: apps/search Hybrid Search Engine (Dense + Sparse RRF k=60) & Search API
- **Status**: `[x] Complete`
- **Scope**: Implement `apps/search/services/hybrid_search.py`. Execute raw SQL Reciprocal Rank Fusion ($k=60$) combining pgvector cosine distance (`<=>`) and PostgreSQL `ts_rank_cd`. Provide filtering by `document_id`. Implement `POST /api/search/hybrid/` endpoint with JWT authentication and comprehensive unit/integration test suite.
- **Files**:
  - `backend/apps/search/services/hybrid_search.py`
  - `backend/apps/search/serializers.py`
  - `backend/apps/search/views.py`
  - `backend/apps/search/urls.py`
  - `tests/backend/test_ticket_06_search.py`
- **Verification Gate**:
  - `pytest tests/backend/test_ticket_06_search.py -q --tb=short`
  - `flake8 backend`
  - `mypy backend`


---

### TICKET-08: apps/query Groq SSE Streaming Endpoint with Citation Attachment
- **Status**: `[ ] Pending`
- **Scope**: Implement `POST /api/query/stream/` returning `StreamingHttpResponse(content_type="text/event-stream")`. Retrieve relevant chunks using hybrid search, assemble legal prompt with system guardrails, stream generated tokens via Groq API (`llama-3.3-70b-versatile`), inject JSON citation payloads (`chunk_id`, `page_number`, `bounding_box`), and log telemetry metrics in `AuditBenchmarkLog`.
- **Files**:
  - `backend/apps/query/services/streamer.py`
  - `backend/apps/query/services/prompt_builder.py`
  - `backend/apps/query/views.py`
  - `backend/apps/query/urls.py`
  - `tests/backend/test_query_stream.py`
- **Verification Gate**:
  - `pytest tests/backend/test_query_stream.py -q --tb=short`
  - `flake8 backend`
  - `mypy backend`

---

### TICKET-09: React Vite + Tailwind UI Foundation & Auth Client
- **Status**: `[ ] Pending`
- **Scope**: Setup React 18+ client with TypeScript, Tailwind CSS, TanStack Query, and Axios/Fetch client configured with credentials (`withCredentials: true`). Implement authentication context (login modal, persistent user session check, logout) and main application dashboard shell.
- **Files**:
  - `frontend/src/App.tsx`
  - `frontend/src/context/AuthContext.tsx`
  - `frontend/src/api/client.ts`
  - `frontend/src/components/Navbar.tsx`
  - `frontend/src/components/UploadModal.tsx`
- **Verification Gate**:
  - `npm --prefix frontend run typecheck`
  - `npm --prefix frontend run lint`

---

### TICKET-10: React PDF Viewer with Dynamic Bounding-Box Canvas Overlays
- **Status**: `[ ] Pending`
- **Scope**: Implement split-pane contract viewing interface using `PDF.js` / `react-pdf`. Render multi-page PDF documents with thumbnail navigation, zoom controls, and a custom canvas overlay layer that dynamically draws high-contrast bounding boxes on top of cited clauses when clicked.
- **Files**:
  - `frontend/src/components/PDFViewer/SplitPaneContainer.tsx`
  - `frontend/src/components/PDFViewer/PDFCanvasViewer.tsx`
  - `frontend/src/components/PDFViewer/BoundingBoxOverlay.tsx`
  - `frontend/src/types/document.ts`
- **Verification Gate**:
  - `npm --prefix frontend run typecheck`
  - `npm --prefix frontend test -- --run`

---

### TICKET-11: Real-Time SSE Streaming Chat & Interactive Citation Deep-Linking
- **Status**: `[ ] Pending`
- **Scope**: Implement real-time Copilot chat pane consuming `POST /api/query/stream/` via `EventSource` or `fetch` stream reader. Render streaming Markdown response with interactive citation pills `[Ref: 1]`. Clicking a citation badge dispatches an event to the PDF viewer to scroll directly to the cited page and pulse-highlight the bounding box.
- **Files**:
  - `frontend/src/components/Chat/ChatContainer.tsx`
  - `frontend/src/components/Chat/MessageList.tsx`
  - `frontend/src/components/Chat/CitationBadge.tsx`
  - `frontend/src/hooks/useSSEStream.ts`
- **Verification Gate**:
  - `npm --prefix frontend run typecheck`
  - `npm --prefix frontend test -- --run`

---

### TICKET-12: Automated Benchmark Suite & High-Resolution Telemetry Visualization
- **Status**: `[ ] Pending`
- **Scope**: Create end-to-end benchmark script `scripts/run_benchmark_suite.py` measuring Groq execution latency, prompt/completion tokens, and cost. Create `scripts/export_metrics.py` exporting publication-ready charts (latency, cost, throughput).
- **Files**:
  - `scripts/run_benchmark_suite.py`
  - `scripts/export_metrics.py`
  - `scripts/harness-check.sh`
- **Verification Gate**:
  - `python scripts/run_benchmark_suite.py --dry-run`
  - `bash ./scripts/harness-check.sh`
