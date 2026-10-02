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
| **TICKET-06** | `[x] Complete` | `documents` & Celery | Celery async worker, ingestion task, local embedding generation, Groq clause extraction & telemetry |
| **TICKET-07** | `[x] Complete` | `search` | Hybrid Search service (Dense pgvector + tsvector FTS fused via RRF $k=60$) & tests |
| **TICKET-08** | `[x] Complete` | `query` | Groq SSE Streaming Endpoint (`StreamingHttpResponse`), citation injection, telemetry |
| **TICKET-09** | `[x] Complete` | `frontend` | React 18+ Vite + Tailwind initialization, auth context, TanStack Query client |
| **TICKET-10** | `[x] Complete` | `frontend` | PDF.js split-pane viewer with dynamic bounding-box canvas highlight overlays |
| **TICKET-11** | `[x] Complete` | `frontend` | SSE streaming chat interface with interactive citation badges syncing to viewer |
| **TICKET-12** | `[x] Complete` | `frontend` & Telemetry | High-density telemetry dashboard, pipeline latency analytics, token economics & ROI cards |
| **TICKET-13** | `[x] Complete` | System Integration | Full-pipeline E2E test suite, ingestion-to-synthesis verification, and Phase 1 release sign-off |
| **TICKET-14-RESPONSIVE** | `[x] Complete` | `frontend` | Responsive Web Layout, High-DPI Canvas Coordinate Normalization, and Adaptive Split-Pane Ergonomics |

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

### TICKET-07: apps/query Setup - Groq LLM Client, Coordinate Citation Synthesis Engine, and SSE Streaming Endpoint
- **Status**: `[x] Complete`
- **Scope**: Implement `apps/query` services: `GroqSynthesisService` for prompt assembly, Groq LLM streaming, token metrics, and `CitationEngine` for `[Ref:N]` coordinate bounding box extraction. Implement `POST /api/query/stream/` endpoint with Server-Sent Events (`metadata`, `delta`, `telemetry`, `done`) and `LLM_SYNTHESIS` telemetry logging.
- **Files**:
  - `backend/apps/query/services/synthesis.py`
  - `backend/apps/query/services/citation.py`
  - `backend/apps/query/serializers.py`
  - `backend/apps/query/views.py`
  - `backend/apps/query/urls.py`
  - `tests/backend/test_ticket_07_query.py`
- **Verification Gate**:
  - `pytest tests/backend/test_ticket_07_query.py -q --tb=short`
  - `flake8 backend`
  - `mypy backend`


---

### TICKET-08: Citation Verification Engine - Deterministic Ground-Truth Validator, Confidence Scoring, and Audit Logging
- **Status**: `[x] Complete`
- **Scope**: Implement `CitationValidator` in `apps/query/services/verifier.py`. Combine deterministic lexical containment and `VectorEmbeddingService` cosine similarity to score factual grounding. Enforce categorical confidence thresholds (`HIGH >= 0.75`, `MEDIUM >= 0.50`, `REJECTED < 0.50`). Integrate verification event in `StreamingQueryView`, provide `POST /api/query/verify/` endpoint, and log `CITATION_VERIFY` telemetry in `AuditBenchmarkLog`.
- **Files**:
  - `backend/apps/query/services/verifier.py`
  - `backend/apps/query/services/synthesis.py`
  - `backend/apps/query/serializers.py`
  - `backend/apps/query/views.py`
  - `backend/apps/query/urls.py`
  - `tests/backend/test_ticket_08_verification.py`
- **Verification Gate**:
  - `pytest tests/backend/test_ticket_08_verification.py -q --tb=short`
  - `flake8 backend`
  - `mypy backend`

---

### TICKET-09: React Vite + Tailwind UI Foundation & Auth Client
- **Status**: `[x] Complete`
- **Scope**: Setup React 18+ client with JSX, Tailwind CSS, and Axios client configured with credentials (`withCredentials: true`). Implement authentication context (login, registration, session check, logout), high-density institutional workstation UI shell, and route protection.
- **Files**:
  - `frontend/src/App.jsx`
  - `frontend/src/context/AuthContext.jsx`
  - `frontend/src/services/api.js`
  - `frontend/src/components/layout/TopNav.jsx`
  - `frontend/src/components/layout/SidebarNav.jsx`
  - `frontend/src/components/layout/ProtectedLayout.jsx`
  - `frontend/src/pages/auth/LoginPage.jsx`
  - `frontend/src/pages/auth/RegisterPage.jsx`
  - `frontend/src/pages/contracts/ContractsPage.jsx`
  - `frontend/src/pages/workspace/WorkspacePage.jsx`
  - `frontend/src/pages/telemetry/TelemetryPage.jsx`
  - `frontend/src/tests/auth.test.jsx`
- **Verification Gate**:
  - `npm --prefix frontend run typecheck`
  - `npm --prefix frontend run lint`
  - `npm --prefix frontend test -- --run`

---

### TICKET-10: React PDF Viewer with Dynamic Bounding-Box Canvas Overlays
- **Status**: `[x] Complete`
- **Scope**: Implement interactive contract viewing interface using `pdfjs-dist` and HTML5 canvas. Render multi-page PDF documents with page navigation, zoom controls, and a custom canvas overlay layer that dynamically draws high-contrast bounding boxes on top of cited clauses with hover metadata tooltips and interactive selection. Provide contract upload and registry table management.
- **Files**:
  - `frontend/src/utils/coordinates.js`
  - `frontend/src/components/viewer/PDFViewer.jsx`
  - `frontend/src/components/viewer/ViewerControls.jsx`
  - `frontend/src/components/viewer/BoundingBoxOverlay.jsx`
  - `frontend/src/components/contracts/DocumentUploadModal.jsx`
  - `frontend/src/components/contracts/DocumentListTable.jsx`
  - `frontend/src/pages/contracts/ContractsPage.jsx`
  - `frontend/src/pages/workspace/WorkspacePage.jsx`
  - `frontend/src/tests/pdf_viewer.test.jsx`
  - `backend/apps/documents/views.py`
- **Verification Gate**:
  - `npm --prefix frontend run typecheck`
  - `npm --prefix frontend run lint`
  - `npm --prefix frontend test -- --run`

---

### TICKET-11: Real-Time SSE Streaming Chat & Interactive Citation Deep-Linking
- **Status**: `[x] Complete`
- **Scope**: Implement real-time Copilot chat pane consuming `POST /api/query/stream/` via SSE `fetch` stream reader with cookie credentials. Render streaming synthesis response with interactive citation pills `[Ref: 1]`, telemetry benchmark footer, session query history, and bidirectional synchronization with the PDF viewer canvas.
- **Files**:
  - `frontend/src/services/streaming.js`
  - `frontend/src/components/workspace/CitationBadge.jsx`
  - `frontend/src/components/workspace/AuditQueryInput.jsx`
  - `frontend/src/components/workspace/SynthesisView.jsx`
  - `frontend/src/components/workspace/CitationInspector.jsx`
  - `frontend/src/components/workspace/AuditAuditTrail.jsx`
  - `frontend/src/pages/workspace/WorkspacePage.jsx`
  - `frontend/src/tests/workspace.test.jsx`
- **Verification Gate**:
  - `npm --prefix frontend run typecheck`
  - `npm --prefix frontend run lint`
  - `npm --prefix frontend test -- --run`

---

### TICKET-12: Operational Telemetry Dashboard - Benchmark Metrics, Latency & Token Cost Analytics, and ROI Projection Cards
- **Status**: `[x] Complete`
- **Scope**: Build high-density operational telemetry dashboard consuming `GET /api/analytics/benchmarks/summary/`. Render numerical stat cards, pipeline latency stage decomposition, token expenditure and model pricing analysis, and dual-system ROI economics comparative matrix. Implement 10-second auto-sync toggle and JSON report export.
- **Files**:
  - `frontend/src/services/analytics.js`
  - `frontend/src/components/telemetry/MetricStatCard.jsx`
  - `frontend/src/components/telemetry/PipelineLatencyBreakdown.jsx`
  - `frontend/src/components/telemetry/TokenCostAnalytics.jsx`
  - `frontend/src/components/telemetry/DualSystemRoiCard.jsx`
  - `frontend/src/pages/telemetry/TelemetryPage.jsx`
  - `frontend/src/tests/telemetry.test.jsx`
- **Verification Gate**:
  - `npm --prefix frontend run typecheck`
  - `npm --prefix frontend run lint`
  - `npm --prefix frontend test -- --run`

---

### TICKET-13: End-to-End Integration Test Suite, Ingestion-to-Synthesis Workflow Verification, and Phase 1 Release Sign-Off
- **Status**: `[x] Complete`
- **Scope**: Implement full-pipeline integration test suite exercising the end-to-end critical path: user registration and HttpOnly cookie issuance, multi-page synthetic PDF document upload and asynchronous ingestion task execution, pgvector dense + tsvector sparse hybrid RRF search, Groq SSE streaming answer synthesis, deterministic citation verification with high confidence scoring, and aggregate benchmark telemetry validation across all 6 core pipeline stages. Implement comprehensive frontend integration test exercising operator login, document selection, query submission, token streaming render, and one-click citation synchronization to PDF viewer canvas page navigation and active bounding box highlighting.
- **Files**:
  - `tests/backend/test_ticket_13_e2e.py`
  - `frontend/src/tests/e2e_flow.test.jsx`
  - `scripts/harness-check.ps1`
  - `.agent/ERRORS.md`
  - `.agent/TASKS.md`
- **Verification Gate**:
  - `mypy backend`
  - `flake8 backend`
  - `pytest tests/backend -v --tb=short`
  - `npm --prefix frontend run typecheck`
  - `npm --prefix frontend run lint`
  - `npm --prefix frontend test -- --run`
  - `npm --prefix frontend run build`
  - `powershell -ExecutionPolicy Bypass -File ./scripts/harness-check.ps1`

---

### TICKET-14-RESPONSIVE: Responsive Web Layout, High-DPI Canvas Coordinate Normalization, and Adaptive Split-Pane Ergonomics
- **Status**: `[x] Complete`
- **Scope**: Implement institutional viewport responsiveness and DPI-aware canvas normalization across the workstation frontend:
  1. High-DPI coordinate normalization decoupling hardware canvas buffer scaling (`viewport.scale * window.devicePixelRatio`) from CSS layout dimensions (`canvas.style.width/height`, `getBoundingClientRect()`), container `ResizeObserver` listener, and robust coordinate transforms guarding against initial render 0/null/negative box dimensions.
  2. Institutional responsive viewport hook (`useResponsiveViewport`) and adaptive segmented view controls (`[1] DOCUMENT VIEWER | [2] AUDIT COPILOT | [3] CITATIONS`) on compact viewports with automatic tab transition on citation badge click.
  3. Responsive top navigation ticker, sleek mobile bottom dock, and responsive telemetry grid layouts (`grid-cols-1 md:grid-cols-2 lg:grid-cols-4`).
- **Files**:
  - `frontend/src/utils/coordinates.js`
  - `frontend/src/hooks/useResponsiveViewport.js`
  - `frontend/src/components/viewer/PDFViewer.jsx`
  - `frontend/src/pages/workspace/WorkspacePage.jsx`
  - `frontend/src/components/layout/TopNav.jsx`
  - `frontend/src/components/layout/SidebarNav.jsx`
  - `frontend/src/components/layout/ProtectedLayout.jsx`
  - `frontend/src/pages/telemetry/TelemetryPage.jsx`
  - `frontend/src/components/telemetry/PipelineLatencyBreakdown.jsx`
  - `frontend/src/components/telemetry/TokenCostAnalytics.jsx`
  - `frontend/src/components/telemetry/DualSystemRoiCard.jsx`
  - `frontend/src/tests/responsive_viewport.test.jsx`
- **Verification Gate**:
  - `npm --prefix frontend run lint`
  - `npm --prefix frontend test -- --run`
  - `npm --prefix frontend run build`
  - `mypy backend`
  - `flake8 backend`
  - `pytest tests/backend -q --tb=short`
  - `powershell -ExecutionPolicy Bypass -File ./scripts/harness-check.ps1`

---

## Phase 2: Multi-Document Analysis & Distributed Query Processing

### TICKET-15: Concurrent Multi-Document Worker Pool & Map Dispatcher
- **Status**: `[x] Complete`
- **Scope**: Implement `DocumentAuditWorker` and `ConcurrentMapDispatcher` for isolated, parallel multi-document RAG queries:
  1. `apps/query/services/worker.py`: `DocumentAuditWorker` executing single-document bounded hybrid RRF search with strict SQL context isolation (`document_id = %(document_id)s`), extracting and normalizing bounding box coordinate evidence payloads.
  2. `apps/query/services/dispatcher.py`: `ConcurrentMapDispatcher` utilizing bounded `ThreadPoolExecutor(max_workers=min(8, os.cpu_count()))`, per-worker timeout ceiling (250ms), thread-safe Django DB connection cleanup (`connections.close_all()`), and aggregating isolated per-document evidence bundles (`document_id`, `status`, `duration_ms`, `candidate_chunks`).
  3. `tests/backend/test_ticket_15_dispatcher.py`: Concurrency and thread-safety test suite asserting zero cross-document context bleed, graceful timeout handling on simulated latency, and error resilience without pool failure.
- **Files**:
  - `backend/apps/query/services/worker.py`
  - `backend/apps/query/services/dispatcher.py`
  - `backend/apps/query/services/__init__.py`
  - `tests/backend/test_ticket_15_dispatcher.py`
- **Verification Gate**:
  - `pytest tests/backend/test_ticket_15_dispatcher.py -v --tb=short`
  - `flake8 backend`
  - `mypy backend`
  - `npm --prefix frontend run lint`
  - `npm --prefix frontend test -- --run`
  - `powershell -ExecutionPolicy Bypass -File ./scripts/harness-check.ps1`

---

### TICKET-16: Deterministic Confidence Gater & Reduce-Stage Groq Handoff
- **Status**: `[x] Complete`
- **Scope**: Implement `ConfidenceGater` and `MultiDocReduceSynthesizer` for dual-system routing and multi-document map-reduce synthesis:
  1. `apps/query/services/gater.py`: `ConfidenceGater` evaluating evidence bundles from `ConcurrentMapDispatcher` with threshold $\tau = 0.85$. Routes single-doc high-confidence queries to `SYSTEM_1_FAST_PATH` bypassing Groq, and escalates multi-doc or sub-threshold queries to `SYSTEM_2_FRONTIER`.
  2. `apps/query/services/reducer.py`: `MultiDocReduceSynthesizer` assembling multi-document evidence prompts inside strict `<document_context id="..." title="...">` XML boundaries, invoking Groq SDK (`qwen/qwen3.8-27b`) for comparative analysis with standardized citations `[Ref:DocID:ChunkID:Page]`, and recording `REDUCE_SYNTHESIS` telemetry in `AuditBenchmarkLog`.
  3. `tests/backend/test_ticket_16_gater.py`: Comprehensive test suite verifying high-confidence single-doc fast path bypass, low-confidence escalation, multi-doc auto-escalation, and prompt XML boundary isolation.
- **Files**:
  - `backend/apps/query/services/gater.py`
  - `backend/apps/query/services/reducer.py`
  - `backend/apps/query/services/__init__.py`
  - `tests/backend/test_ticket_16_gater.py`
- **Verification Gate**:
  - `pytest tests/backend/test_ticket_16_gater.py -v --tb=short`
  - `flake8 backend`
  - `mypy backend`
  - `npm --prefix frontend run lint`
  - `npm --prefix frontend test -- --run`
  - `powershell -ExecutionPolicy Bypass -File ./scripts/harness-check.ps1`

---

### TICKET-17: Real-Time Multi-Target SSE Protocol & Stream Multiplexer
- **Status**: `[x] Complete`
- **Scope**: Implement `MultiTargetSSEMultiplexer` and multi-target streaming orchestration:
  1. `apps/query/services/multiplexer.py`: `MultiTargetSSEMultiplexer` encoding standard SSE event taxonomy (`route`, `worker_status`, `citation`, `token`, `telemetry`, `done`) with double newline boundaries (`event: <type>\ndata: <json>\n\n`).
  2. `apps/query/serializers.py` & `apps/query/views.py`: Extend `QueryRequestSerializer` to accept `document_ids: list[UUID]` (1 to 8 documents). Orchestrate `ConcurrentMapDispatcher`, `ConfidenceGater`, fast-path instant delivery, and `MultiDocReduceSynthesizer` in `StreamingQueryView`.
  3. `frontend/src/services/streaming.js`: Extend `streamContractQuery` with multi-event callbacks (`onRoute`, `onWorkerStatus`, `onCitation`, `onToken`, `onTelemetry`, `onDone`) while maintaining backward compatibility with legacy streams.
  4. `tests/backend/test_ticket_17_multiplexer.py`: Pytest suite validating SSE event framing, document ID citation tagging, worker progress event dispatch, and telemetry latency precision.
- **Files**:
  - `backend/apps/query/services/multiplexer.py`
  - `backend/apps/query/services/__init__.py`
  - `backend/apps/query/serializers.py`
  - `backend/apps/query/views.py`
  - `frontend/src/services/streaming.js`
  - `tests/backend/test_ticket_17_multiplexer.py`
- **Verification Gate**:
  - `pytest tests/backend/test_ticket_17_multiplexer.py -v --tb=short`
  - `flake8 backend`
  - `mypy backend`
  - `npm --prefix frontend run lint`
  - `npm --prefix frontend test -- --run`
  - `powershell -ExecutionPolicy Bypass -File ./scripts/harness-check.ps1`

---

### TICKET-18: Multi-Document Workspace UI & Institutional A/B Mode Toggle
- **Status**: `[x] Complete`
- **Scope**: Implement multi-document workspace selector dock, institutional A/B operational mode toggle, and multi-target synthesis/citation integration:
  1. `frontend/src/components/workspace/DocumentSelectorDock.jsx`: Dock selector allowing selection of 1 to 8 documents (default 2), institutional badge indicators (Doc A: slate-cyan, Doc B: amber-indigo), and real-time worker status indicators (`PENDING`, `PROCESSING`, `READY`, `TIMEOUT`).
  2. `frontend/src/components/workspace/ModeToggle.jsx`: Institutional A/B mode toggle between `DUAL-SYSTEM (AUTONOMOUS)` (default) and `FRONTIER-ONLY (BENCHMARK)`, passing `force_frontier` flag.
  3. `frontend/src/pages/workspace/WorkspacePage.jsx` & `frontend/src/components/workspace/SynthesisView.jsx`: Integrate multi-target streaming with `document_ids`, display active route indicator badge in synthesis header (`SYSTEM 1: EXTRACTIVE FAST-PATH` vs `SYSTEM 2: FRONTIER REDUCE SYNTHESIS`), and document-distinguishing citation chips (`[Doc A - P.92]`, `[Doc B - P.34]`) with document selection dispatch.
  4. `frontend/src/tests/workspace_multidoc.test.jsx`: Unit and integration test suite covering document dock selection, mode toggle payload, multi-document citation chips, and worker status updates.
- **Files**:
  - `frontend/src/components/workspace/DocumentSelectorDock.jsx`
  - `frontend/src/components/workspace/ModeToggle.jsx`
  - `frontend/src/components/workspace/SynthesisView.jsx`
  - `frontend/src/pages/workspace/WorkspacePage.jsx`
  - `frontend/src/tests/workspace_multidoc.test.jsx`
- **Verification Gate**:
  - `npm --prefix frontend test -- --run src/tests/workspace_multidoc.test.jsx`
  - `npm --prefix frontend run lint`
  - `npm --prefix frontend run build`
  - `flake8 backend`
  - `mypy backend`
  - `pytest tests/backend -q --tb=short`
  - `powershell -ExecutionPolicy Bypass -File ./scripts/harness-check.ps1`

