<p align="center">
  <h1 align="center">Enterprise Contract & Policy Copilot</h1>
  <p align="center">
    <strong>Dual-System RAG with Hybrid RRF & Telemetry Engine</strong>
  </p>
  <p align="center">
    <em>A production-grade AI copilot for enterprise contract auditing, policy compliance, and multi-document legal analysis — powered by <strong>Laya</strong> (Dual-System Intelligence) and <strong>Groq</strong> (Ultra-Low-Latency LLM Inference).</em>
  </p>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Python-3.11+-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python"/>
  <img src="https://img.shields.io/badge/Django-5.0-092E20?style=for-the-badge&logo=django&logoColor=white" alt="Django"/>
  <img src="https://img.shields.io/badge/React-18.3-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React"/>
  <img src="https://img.shields.io/badge/Groq-LLM%20Engine-F55036?style=for-the-badge" alt="Groq"/>
  <img src="https://img.shields.io/badge/PostgreSQL-16%20+%20pgvector-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL"/>
  <img src="https://img.shields.io/badge/Redis-7-DC382D?style=for-the-badge&logo=redis&logoColor=white" alt="Redis"/>
  <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="License"/>
</p>

---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [System Architecture](#system-architecture)
- [Laya — Dual-System Intelligence](#laya--dual-system-intelligence)
- [Groq — LLM Inference Engine](#groq--llm-inference-engine)
- [Backend Architecture](#backend-architecture)
- [Frontend Architecture](#frontend-architecture)
- [Directory Structure](#directory-structure)
- [API Reference](#api-reference)
- [Database Schema](#database-schema)
- [Getting Started](#getting-started)
- [Environment Configuration](#environment-configuration)
- [Running Tests](#running-tests)
- [Deployment](#deployment)
- [Tech Stack](#tech-stack)

---

## Overview

The **Enterprise Contract & Policy Copilot** is a full-stack AI-powered platform designed for legal teams, compliance auditors, and enterprise stakeholders to upload, search, audit, and interrogate large volumes of contracts and policy documents.

At its core, the system implements a **Dual-System RAG (Retrieval-Augmented Generation) architecture** — inspired by cognitive science's System 1 / System 2 thinking model — that intelligently routes queries through two distinct pathways:

| Path | Name | When | Latency | Cost |
|------|------|------|---------|------|
| **System 1** | `FAST_PATH` | High-confidence single-document factual lookups (τ ≥ 0.85) | **~50–200ms** | **$0.00** (no LLM call) |
| **System 2** | `FRONTIER` | Multi-document comparisons, compound queries, low-confidence retrievals | **~1–4s** | **~$0.0001/query** |

This architecture delivers **sub-200ms answers for 60–70% of enterprise queries** while reserving expensive LLM inference only for complex multi-clause analysis.

---

## Key Features

- **Hybrid Search (Dense + Sparse RRF)** — Combines 384-dim `sentence-transformers/all-MiniLM-L6-v2` embeddings (pgvector HNSW cosine) with PostgreSQL `tsvector` full-text search, fused via Reciprocal Rank Fusion (k=60)
- **Dual-System Confidence Gating** — Deterministic `ConfidenceGater` routes queries to System 1 or System 2 based on lexical containment + semantic similarity scoring
- **Multi-Document Concurrent Dispatch** — `ThreadPoolExecutor`-based `ConcurrentMapDispatcher` executes parallel per-document retrieval with strict timeout ceilings
- **Real-Time SSE Streaming** — `MultiTargetSSEMultiplexer` streams `route`, `worker_status`, `citation`, `token`, `telemetry`, and `done` events via Server-Sent Events
- **Grounded Citations with BBox Overlay** — Every AI-generated claim links back to exact PDF page coordinates, rendered as interactive canvas overlays
- **PDF Ingestion Pipeline** — Async Celery workers parse PDFs via PyMuPDF, extract normalized bounding boxes, generate embeddings, and build dual indexes
- **Telemetry & Cost Analytics** — `AuditBenchmarkLog` records wall-clock latency, token usage, and USD cost per query using Groq rate tables
- **JWT HttpOnly Cookie Auth** — Secure token rotation with access/refresh cookies, blacklist store, and role-based access (ADMIN / AUDITOR / VIEWER)

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT (React 18)                             │
│  ┌──────────┐  ┌───────────┐  ┌────────────┐  ┌──────────────────────────┐ │
│  │ Auth UI  │  │ Doc Upload│  │ PDF Viewer  │  │     Workspace Panel      │ │
│  │ (Login/  │  │ & Manager │  │ (PDF.js +   │  │  ┌──────────────────┐   │ │
│  │ Register)│  │           │  │ BBox Canvas)│  │  │ Query Input      │   │ │
│  └────┬─────┘  └─────┬─────┘  └──────┬─────┘  │  │ Synthesis View   │   │ │
│       │              │               │         │  │ Citation Panel   │   │ │
│       │              │               │         │  │ Telemetry Dash   │   │ │
│       │              │               │         │  └──────────────────┘   │ │
│       └──────────────┴───────────────┴─────────┴────────────┬────────────┘ │
│                                                             │              │
│                           EventSource (SSE) ◄───────────────┘              │
└─────────────────────────────────────────┬───────────────────────────────────┘
                                          │ HTTPS / SSE
┌─────────────────────────────────────────┴───────────────────────────────────┐
│                           DJANGO REST BACKEND                              │
│                                                                            │
│  ┌─────────────┐   ┌──────────────────────────────────────────────────┐    │
│  │ Auth Module  │   │              Query Pipeline                      │    │
│  │ JWT Cookies  │   │                                                  │    │
│  │ Role RBAC    │   │  ┌─────────────┐   ┌────────────────────────┐   │    │
│  └──────────────┘   │  │ Concurrent  │──▶│  Confidence Gater      │   │    │
│                     │  │ Map         │   │  (τ = 0.85)            │   │    │
│  ┌─────────────┐   │  │ Dispatcher  │   │                        │   │    │
│  │ Documents   │   │  │ (ThreadPool)│   │  ┌──────┐  ┌────────┐  │   │    │
│  │ Ingestion   │   │  └─────────────┘   │  │ Sys1 │  │ Sys2   │  │   │    │
│  │ (Celery +   │   │                    │  │ Fast │  │Frontier│  │   │    │
│  │  PyMuPDF)   │   │                    │  │ Path │  │(Groq)  │  │   │    │
│  └──────────────┘   │                    │  └──┬───┘  └───┬────┘  │   │    │
│                     │                    │     │          │       │   │    │
│  ┌─────────────┐   │                    └─────┴────┬─────┴───────┘   │    │
│  │ Hybrid      │   │                               │                 │    │
│  │ Search      │   │                    ┌───────────▼──────────────┐  │    │
│  │ (RRF k=60)  │◀──│                    │ SSE Multiplexer         │  │    │
│  │ Dense+Sparse│   │                    │ (token/citation/done)   │  │    │
│  └─────────────┘   │                    └─────────────────────────┘  │    │
│                     └────────────────────────────────────────────────┘    │
│  ┌─────────────┐                                                          │
│  │ Telemetry   │   Logs: operation, duration_ms, tokens, cost_usd         │
│  │ Engine      │──▶ AuditBenchmarkLog (PostgreSQL)                        │
│  └─────────────┘                                                          │
└───────────────────────────────────────────────────────────────────────────┘
                          │                    │
              ┌───────────┴──────┐    ┌────────┴───────┐
              │  PostgreSQL 16   │    │   Redis 7      │
              │  + pgvector      │    │   (Celery       │
              │  (HNSW Index)    │    │    Broker)      │
              └──────────────────┘    └────────────────┘
```

---

## Laya — Dual-System Intelligence

**Laya** is the name of this system's cognitive routing engine — the intelligence layer that decides _how_ a query should be answered before any LLM is invoked.

### How Laya Works

```
User Query
    │
    ▼
┌──────────────────────────────────┐
│   ConcurrentMapDispatcher        │
│   Parallel per-document          │
│   hybrid search (ThreadPool)     │
└──────────────┬───────────────────┘
               │ Evidence Bundles
               ▼
┌──────────────────────────────────┐
│   ConfidenceGater (Laya Core)    │
│                                  │
│   1. Count unique source docs    │
│   2. Detect compound patterns    │
│   3. Score: 0.4×lexical +        │
│            0.6×semantic          │
│   4. Compare to τ threshold      │
│      (default: 0.85)             │
└──────────┬───────────┬───────────┘
           │           │
     ≥ 0.85 τ      < 0.85 τ
     (or single-   (or multi-doc,
      doc fact)     compound query)
           │           │
           ▼           ▼
    ┌──────────┐ ┌────────────────┐
    │ SYSTEM 1 │ │   SYSTEM 2     │
    │ FAST PATH│ │   FRONTIER     │
    │          │ │                │
    │ Extract  │ │ Map-Reduce via │
    │ focused  │ │ Groq LLM      │
    │ span     │ │ (Llama 3.3    │
    │ directly │ │  70B)          │
    │ from     │ │                │
    │ top chunk│ │ Multi-clause   │
    │          │ │ synthesis +    │
    │ Cost: $0 │ │ citations      │
    │ ~100ms   │ │ Cost: ~$0.0001 │
    │          │ │ ~1-4s          │
    └──────────┘ └────────────────┘
```

### System 1 — Fast Path (No LLM)
When the `ConfidenceGater` determines that the top retrieved chunk has high enough lexical + semantic overlap with the query (confidence ≥ 0.85), it **bypasses the LLM entirely**. Instead, it extracts a focused text span directly from the source chunk using the `extract_focused_span()` algorithm, which scores paragraphs and sentences by query-term overlap to find the most relevant excerpt.

**Result**: Sub-200ms answers at zero LLM cost with full citation traceability.

### System 2 — Frontier (Groq LLM)
For complex queries — multi-document comparisons, compound questions, or low-confidence retrievals — Laya escalates to the `MultiDocReduceSynthesizer`, which constructs a structured prompt from all grounded evidence bundles and streams the response through Groq's ultra-fast inference API.

---

## Groq — LLM Inference Engine

[**Groq**](https://groq.com) serves as the exclusive LLM inference provider for System 2 Frontier queries. The system leverages Groq's Language Processing Unit (LPU) architecture for ultra-low-latency token generation.

### Configuration
| Parameter | Default | Description |
|-----------|---------|-------------|
| `GROQ_API_KEY` | — | API key for Groq Cloud |
| `GROQ_MODEL` | `llama-3.3-70b-versatile` | Primary model for synthesis |

### Supported Models & Pricing
The telemetry engine tracks costs using official Groq rate tables:

| Model | Prompt ($/1M tokens) | Completion ($/1M tokens) |
|-------|---------------------|--------------------------|
| `llama-3.3-70b-versatile` | $0.59 | $0.79 |
| `llama-3.1-8b-instant` | $0.05 | $0.08 |
| `mixtral-8x7b-32768` | $0.24 | $0.24 |

### Why Groq?
- **Speed**: 500+ tokens/second generation — critical for real-time SSE streaming
- **Cost Efficiency**: Orders of magnitude cheaper than GPT-4 for enterprise-scale auditing
- **Deterministic Routing**: Combined with Laya's System 1 fast path, 60–70% of queries never hit Groq at all

---

## Backend Architecture

The backend is a **Django 5.0 + Django REST Framework** application organized into 5 modular, isolated Django apps under `backend/apps/`.

### App Dependency Graph

```
                    ┌──────────────┐
                    │authentication│
                    │  (JWT/RBAC)  │
                    └──────┬───────┘
                           │ user_id scoping
            ┌──────────────┼──────────────┐
            ▼              ▼              ▼
    ┌───────────┐  ┌───────────┐  ┌───────────┐
    │ documents │  │  search   │  │ analytics │
    │ (Ingest)  │  │ (Hybrid)  │  │(Telemetry)│
    └─────┬─────┘  └─────┬─────┘  └───────────┘
          │               │               ▲
          │  chunks/       │  results      │ metrics
          │  embeddings    │               │
          └───────┬────────┘               │
                  ▼                        │
          ┌───────────────┐                │
          │    query      │────────────────┘
          │  (Pipeline)   │
          └───────────────┘
```

### Module Deep-Dives

#### 1. `apps.authentication` — Identity & Access Control
| Component | Purpose |
|-----------|---------|
| `models.py` | Custom `User` model (UUID PK, email auth, roles: ADMIN/AUDITOR/VIEWER) |
| `views.py` | Register, Login, Logout, Token Refresh, Profile endpoints |
| `authentication.py` | `CookieJWTAuthentication` — extracts JWT from HttpOnly cookies |
| `backends.py` | Email-based authentication backend |
| `serializers.py` | Registration & login validation with role assignment |

**Security**: All tokens stored exclusively in HttpOnly, Secure, SameSite cookies. No localStorage/sessionStorage token exposure.

#### 2. `apps.documents` — PDF Ingestion & Vectorization
| Component | Purpose |
|-----------|---------|
| `models.py` | `Document` (metadata, status lifecycle) + `Chunk` (text, embedding, bbox, search_vector) |
| `tasks.py` | Celery async task: parse → chunk → embed → index → mark READY |
| `services/chunking.py` | `PDFCoordinateChunker` — PyMuPDF extraction with normalized `[x0,y0,x1,y1]` bounding boxes |
| `services/embedding.py` | `VectorEmbeddingService` — 384-dim `all-MiniLM-L6-v2` via `sentence-transformers` |
| `views.py` | Upload (returns `202 Accepted` within 500ms), List, Detail, Delete |

**Pipeline**:
```
PDF Upload → 202 Accepted → Celery Worker
  → PyMuPDF page/block extraction
  → Semantic chunking (350 words max)
  → BBox normalization (0.0–1.0)
  → Dense embedding (384-dim MiniLM)
  → Sparse tsvector generation
  → Status → READY
```

#### 3. `apps.search` — Hybrid Retrieval Engine
| Component | Purpose |
|-----------|---------|
| `services/hybrid_search.py` | `HybridSearchService` — raw SQL CTE with RRF (k=60) |
| `views.py` | Search endpoint with user-scoped document filtering |
| `serializers.py` | Search request/response serialization |

**RRF Formula**:
```
RRF(d) = Σ [ weight_m / (60 + rank_m(d)) ]  for m ∈ {dense, sparse}
```

Both dense (cosine via pgvector `<=>`) and sparse (`ts_rank_cd` with `websearch_to_tsquery`) results are fused in a single PostgreSQL CTE query.

#### 4. `apps.query` — Dual-System Query Pipeline
This is the core intelligence module containing 8 service files:

| Service | Purpose |
|---------|---------|
| `multiplexer.py` | `MultiTargetSSEMultiplexer` — orchestrates full query lifecycle, yields SSE events |
| `gater.py` | `ConfidenceGater` — routes to System 1 or System 2 based on confidence scoring |
| `dispatcher.py` | `ConcurrentMapDispatcher` — parallel per-document retrieval with timeout ceilings |
| `worker.py` | `DocumentAuditWorker` — per-document hybrid search execution |
| `synthesis.py` | LLM prompt construction and Groq API streaming |
| `reducer.py` | `MultiDocReduceSynthesizer` — map-reduce cross-document synthesis |
| `citation.py` | Citation extraction, heading detection, reference linking |
| `verifier.py` | `CitationValidator` — lexical containment + semantic similarity scoring |

#### 5. `apps.analytics` — Telemetry & Cost Engine
| Component | Purpose |
|-----------|---------|
| `models.py` | `AuditBenchmarkLog` — stores operation, model, duration_ms, tokens, cost_usd, metadata |
| `services/telemetry.py` | `track_telemetry` context manager, `calculate_groq_cost()`, Groq rate table |
| `views.py` | Benchmark list, aggregate metrics, comparative analysis endpoints |

---

## Frontend Architecture

The frontend is a **React 18 + Vite + Tailwind CSS** single-page application with TanStack Query for server state management.

### Component Tree

```
App.jsx
├── AuthContext (JWT cookie state)
├── Routes
│   ├── /login  → LoginPage
│   ├── /register → RegisterPage
│   └── / (Protected)
│       └── ProtectedLayout
│           ├── TopNav
│           ├── SidebarNav
│           └── Outlet
│               ├── /contracts → ContractsPage
│               │   ├── DocumentListTable
│               │   └── DocumentUploadModal
│               ├── /workspace → WorkspacePage
│               │   ├── DocumentSelectorDock
│               │   ├── ModeToggle (Single/Multi)
│               │   ├── AuditQueryInput
│               │   ├── PDFViewer / DualPDFViewer
│               │   │   ├── ViewerControls / DualViewerControls
│               │   │   └── BoundingBoxOverlay (Canvas)
│               │   ├── SynthesisView
│               │   ├── CitationInspector
│               │   │   ├── CitationBadge
│               │   │   └── GroundedSourceCard
│               │   └── AuditTrail
│               └── /telemetry → TelemetryPage
│                   ├── MetricStatCard
│                   ├── PipelineLatencyBreakdown
│                   ├── TokenCostAnalytics
│                   ├── DualSystemRoiCard
│                   └── ComparativeRoiMatrix
```

### Key Frontend Modules

| Module | File(s) | Purpose |
|--------|---------|---------|
| **SSE Client** | `services/streaming.js` | EventSource connection, parses `route`, `token`, `citation`, `telemetry`, `done` events |
| **API Layer** | `services/api.js` | Axios instance with cookie credentials, interceptors for auth refresh |
| **Analytics** | `services/analytics.js` | Benchmark data fetching for telemetry dashboard |
| **Auth Context** | `context/AuthContext.jsx` | Login/logout/register state, cookie-based session |
| **PDF Viewer** | `components/viewer/PDFViewer.jsx` | PDF.js canvas rendering with page navigation |
| **Dual Viewer** | `components/viewer/DualPDFViewer.jsx` | Side-by-side document comparison mode |
| **BBox Overlay** | `components/viewer/BoundingBoxOverlay.jsx` | Canvas overlay rendering citation bounding boxes on PDF pages |
| **Synthesis** | `components/workspace/SynthesisView.jsx` | Real-time token streaming with markdown rendering |
| **Citations** | `components/workspace/CitationInspector.jsx` | Expandable citation panel with grounded source cards |
| **Telemetry** | `components/telemetry/*` | ROI matrix, latency breakdown, cost analytics dashboards |

### State Management
- **Server state**: TanStack Query (`@tanstack/react-query`) for documents, search results, benchmarks
- **Auth state**: React Context (`AuthContext`) with cookie-based JWT
- **SSE state**: Local component state in `WorkspacePage`, streamed via `EventSource`
- **Citation persistence**: `sessionStorage` (`audit_copilot_citation_history`) maintains citation history across queries within a session

---

## Directory Structure

```
PortfolioProject-1/
│
├── backend/                           # Django REST API
│   ├── manage.py                      # Django management entry point
│   ├── Dockerfile                     # Backend container image
│   ├── requirements.txt               # Python dependencies
│   ├── requirements-dev.txt           # Dev/test dependencies (pytest, mypy, flake8)
│   │
│   ├── core/                          # Django project configuration
│   │   ├── settings.py                # All settings (DB, Redis, JWT, Groq, Embedding)
│   │   ├── urls.py                    # Root URL routing → app-level includes
│   │   ├── celery.py                  # Celery app factory & autodiscover
│   │   ├── asgi.py                    # ASGI entry point
│   │   └── wsgi.py                    # WSGI entry point
│   │
│   ├── apps/
│   │   ├── authentication/            # JWT + HttpOnly cookie auth
│   │   │   ├── models.py              #   Custom User (UUID, email, roles)
│   │   │   ├── views.py               #   Register/Login/Logout/Refresh/Profile
│   │   │   ├── authentication.py      #   CookieJWTAuthentication class
│   │   │   ├── backends.py            #   Email auth backend
│   │   │   ├── serializers.py         #   Request/response validation
│   │   │   ├── urls.py                #   /api/auth/* routes
│   │   │   └── migrations/
│   │   │
│   │   ├── documents/                 # PDF ingestion & vectorization
│   │   │   ├── models.py              #   Document + Chunk (embedding, bbox, tsvector)
│   │   │   ├── views.py               #   Upload/List/Detail/Delete
│   │   │   ├── tasks.py               #   Celery async ingestion pipeline
│   │   │   ├── serializers.py         #   File upload validation
│   │   │   ├── urls.py                #   /api/documents/* routes
│   │   │   ├── services/
│   │   │   │   ├── chunking.py        #     PDFCoordinateChunker (PyMuPDF + BBox)
│   │   │   │   └── embedding.py       #     VectorEmbeddingService (384-dim MiniLM)
│   │   │   └── migrations/
│   │   │
│   │   ├── search/                    # Hybrid retrieval engine
│   │   │   ├── views.py               #   Search endpoint
│   │   │   ├── serializers.py         #   Search request validation
│   │   │   ├── urls.py                #   /api/search/* routes
│   │   │   └── services/
│   │   │       └── hybrid_search.py   #     HybridSearchService (RRF k=60 raw SQL)
│   │   │
│   │   ├── query/                     # Dual-system query pipeline
│   │   │   ├── views.py               #   SSE streaming endpoint
│   │   │   ├── serializers.py         #   Query request validation
│   │   │   ├── urls.py                #   /api/query/* routes
│   │   │   └── services/
│   │   │       ├── multiplexer.py     #     MultiTargetSSEMultiplexer (orchestrator)
│   │   │       ├── gater.py           #     ConfidenceGater (System 1 vs System 2)
│   │   │       ├── dispatcher.py      #     ConcurrentMapDispatcher (ThreadPool)
│   │   │       ├── worker.py          #     DocumentAuditWorker (per-doc search)
│   │   │       ├── synthesis.py       #     LLM prompt construction & Groq streaming
│   │   │       ├── reducer.py         #     MultiDocReduceSynthesizer (map-reduce)
│   │   │       ├── citation.py        #     Citation extraction & heading detection
│   │   │       └── verifier.py        #     CitationValidator (lexical + semantic)
│   │   │
│   │   └── analytics/                 # Telemetry & cost engine
│   │       ├── models.py              #   AuditBenchmarkLog model
│   │       ├── views.py               #   Benchmark list & aggregate endpoints
│   │       ├── serializers.py         #   Telemetry response serialization
│   │       ├── urls.py                #   /api/analytics/benchmarks/* routes
│   │       └── services/
│   │           └── telemetry.py       #     track_telemetry(), Groq rate table, cost calc
│   │
│   └── media/                         # Uploaded PDF storage
│
├── frontend/                          # React 18 SPA
│   ├── index.html                     # Entry HTML
│   ├── package.json                   # Dependencies & scripts
│   ├── vite.config.js                 # Vite build configuration
│   ├── tailwind.config.js             # Tailwind theme & design tokens
│   ├── postcss.config.js              # PostCSS pipeline
│   ├── .eslintrc.cjs                  # ESLint rules
│   │
│   └── src/
│       ├── main.jsx                   # React DOM entry
│       ├── App.jsx                    # Router + QueryClientProvider
│       ├── index.css                  # Global styles + Tailwind imports
│       │
│       ├── context/
│       │   └── AuthContext.jsx        # JWT auth state provider
│       │
│       ├── hooks/
│       │   └── useResponsiveViewport.js  # Responsive breakpoint hook
│       │
│       ├── services/
│       │   ├── api.js                 # Axios instance + interceptors
│       │   ├── streaming.js           # SSE EventSource client
│       │   └── analytics.js           # Benchmark API client
│       │
│       ├── components/
│       │   ├── layout/
│       │   │   ├── ProtectedLayout.jsx  # Auth guard + layout shell
│       │   │   ├── TopNav.jsx           # Top navigation bar
│       │   │   └── SidebarNav.jsx       # Sidebar navigation
│       │   │
│       │   ├── viewer/
│       │   │   ├── PDFViewer.jsx         # PDF.js canvas renderer
│       │   │   ├── DualPDFViewer.jsx     # Side-by-side comparison viewer
│       │   │   ├── BoundingBoxOverlay.jsx# Citation bbox canvas overlay
│       │   │   ├── ViewerControls.jsx    # Single-doc viewer controls
│       │   │   └── DualViewerControls.jsx# Dual-doc viewer controls
│       │   │
│       │   ├── workspace/
│       │   │   ├── AuditQueryInput.jsx      # Query input with mode toggle
│       │   │   ├── SynthesisView.jsx        # Streaming answer renderer
│       │   │   ├── CitationInspector.jsx     # Citation panel + source cards
│       │   │   ├── CitationBadge.jsx        # Inline citation reference badge
│       │   │   ├── GroundedSourceCard.jsx   # Source evidence card
│       │   │   ├── DocumentSelectorDock.jsx # Multi-doc selection panel
│       │   │   ├── ModeToggle.jsx           # Single/Multi document toggle
│       │   │   └── AuditAuditTrail.jsx      # Query history trail
│       │   │
│       │   ├── contracts/
│       │   │   ├── DocumentListTable.jsx    # Document listing table
│       │   │   └── DocumentUploadModal.jsx  # Upload dialog with progress
│       │   │
│       │   └── telemetry/
│       │       ├── MetricStatCard.jsx           # Single metric display
│       │       ├── PipelineLatencyBreakdown.jsx # Per-stage latency chart
│       │       ├── TokenCostAnalytics.jsx       # Token usage & cost
│       │       ├── DualSystemRoiCard.jsx        # System 1 vs 2 ROI
│       │       └── ComparativeRoiMatrix.jsx     # Full comparative matrix
│       │
│       ├── pages/
│       │   ├── auth/                  # Login & Register pages
│       │   ├── contracts/             # Contract management page
│       │   ├── workspace/             # Main audit workspace page
│       │   └── telemetry/             # Telemetry dashboard page
│       │
│       └── tests/                     # Vitest unit tests
│
├── tests/
│   ├── backend/                       # Pytest test suite (64+ tests)
│   │   ├── test_ticket_01_scaffold.py       # Project scaffold validation
│   │   ├── test_ticket_02_analytics.py      # Telemetry engine tests
│   │   ├── test_ticket_03_auth.py           # Authentication flow tests
│   │   ├── test_ticket_04_documents.py      # Document CRUD & ingestion tests
│   │   ├── test_ticket_05_chunking.py       # PDF chunking & bbox tests
│   │   ├── test_ticket_06_search.py         # Hybrid search & RRF tests
│   │   ├── test_ticket_07_query.py          # Query pipeline tests
│   │   ├── test_ticket_08_verification.py   # Citation verification tests
│   │   ├── test_ticket_13_e2e.py            # End-to-end integration tests
│   │   ├── test_ticket_15_dispatcher.py     # Concurrent dispatcher tests
│   │   ├── test_ticket_16_gater.py          # Confidence gater tests
│   │   ├── test_ticket_17_multiplexer.py    # SSE multiplexer tests
│   │   ├── test_ticket_20_ab_telemetry.py   # A/B telemetry tests
│   │   └── test_ticket_21_multidoc_e2e.py   # Multi-document E2E tests
│   │
│   └── frontend/                      # Vitest + Testing Library
│
├── scripts/
│   ├── harness-check.sh               # CI harness gate (lint, type, test)
│   ├── harness-check.ps1              # Windows PowerShell harness gate
│   ├── benchmark-ab.py                # A/B benchmark automation
│   └── setup_dev_db.py                # Dev database initialization
│
├── docker-compose.yml                 # PostgreSQL 16 (pgvector) + Redis 7
├── pyproject.toml                     # Python tool configs (black, flake8, mypy, pytest)
├── .env.example                       # Environment configuration schema
├── .gitignore                         # Git ignore rules
└── CONTEXT.md                         # Domain glossary & system invariants
```

---

## API Reference

### Authentication (`/api/auth/`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/register/` | Create new user account |
| `POST` | `/api/auth/login/` | Authenticate & set JWT cookies |
| `POST` | `/api/auth/logout/` | Blacklist refresh token & clear cookies |
| `POST` | `/api/auth/refresh/` | Rotate access token via refresh cookie |
| `GET` | `/api/auth/profile/` | Get current user profile |

### Documents (`/api/documents/`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/documents/` | List user's documents |
| `POST` | `/api/documents/upload/` | Upload PDF (returns `202 Accepted`) |
| `GET` | `/api/documents/<id>/` | Get document details + chunk count |
| `DELETE` | `/api/documents/<id>/` | Delete document and all chunks |

### Search (`/api/search/`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/search/` | Execute hybrid search (RRF fusion) |

### Query (`/api/query/`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/query/stream/` | SSE stream — dual-system RAG pipeline |
| `POST` | `/api/query/multi/` | Multi-document SSE stream |

### Analytics (`/api/analytics/benchmarks/`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/analytics/benchmarks/` | List benchmark logs |
| `GET` | `/api/analytics/benchmarks/aggregate/` | Aggregate metrics (avg latency, cost) |
| `GET` | `/api/analytics/benchmarks/comparative/` | System 1 vs System 2 comparison |

---

## Database Schema

### Core Models

```sql
-- Custom User (UUID primary key, email auth)
authentication_user
├── id            UUID PRIMARY KEY
├── email         VARCHAR(254) UNIQUE
├── first_name    VARCHAR(150)
├── last_name     VARCHAR(150)
├── role          VARCHAR(32)  -- ADMIN | AUDITOR | VIEWER
├── password      VARCHAR(128)
├── is_active     BOOLEAN
└── date_joined   TIMESTAMP

-- Uploaded Document
documents_document
├── id            UUID PRIMARY KEY
├── user_id       UUID → authentication_user
├── title         VARCHAR(255)
├── file          FileField (media/)
├── status        VARCHAR(32)  -- PENDING | PROCESSING | READY | FAILED
├── page_count    INTEGER
├── chunk_count   INTEGER
└── uploaded_at   TIMESTAMP

-- Document Chunk (dual-indexed)
documents_chunk
├── id            UUID PRIMARY KEY
├── document_id   UUID → documents_document
├── chunk_index   INTEGER
├── page_number   INTEGER
├── text_content  TEXT
├── bounding_box  JSONB  -- {norm_x0, norm_y0, norm_x1, norm_y1}
├── embedding     VECTOR(384)  -- pgvector HNSW index
└── search_vector TSVECTOR     -- GIN index

-- Telemetry Log
analytics_auditbenchmarklog
├── id                UUID PRIMARY KEY
├── operation         VARCHAR(64)   -- RRF_RETRIEVAL | LLM_SYNTHESIS | ...
├── model_name        VARCHAR(128)
├── duration_ms       DECIMAL(12,3)
├── prompt_tokens     INTEGER
├── completion_tokens INTEGER
├── total_tokens      INTEGER
├── estimated_cost_usd DECIMAL(12,6)
├── status            VARCHAR(32)
├── metadata          JSONB
└── created_at        TIMESTAMP
```

---

## Getting Started

### Prerequisites

- **Python 3.11+**
- **Node.js 18+** & npm
- **PostgreSQL 16** with [`pgvector`](https://github.com/pgvector/pgvector) extension
- **Redis 7+**
- **Groq API Key** — [Get one at console.groq.com](https://console.groq.com)

### Quick Start (Docker)

```bash
# 1. Clone the repository
git clone https://github.com/SHAIK-FIRDOS-01/Enterprise-Contract-Policy.git
cd Enterprise-Contract-Policy

# 2. Copy environment configuration
cp .env.example .env
# Edit .env with your GROQ_API_KEY and database credentials

# 3. Start infrastructure services
docker-compose up -d postgres redis

# 4. Set up Python virtual environment
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate

# 5. Install backend dependencies
pip install -r backend/requirements.txt
pip install -r backend/requirements-dev.txt

# 6. Run database migrations
python backend/manage.py migrate

# 7. Create a superuser
python backend/manage.py createsuperuser

# 8. Start the backend server
python backend/manage.py runserver 127.0.0.1:8000

# 9. (New terminal) Start Celery worker
celery -A core worker -l info -P solo

# 10. (New terminal) Install & start frontend
cd frontend
npm install
npm run dev
```

The application will be available at:
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:8000/api/
- **Admin Panel**: http://localhost:8000/admin/

---

## Environment Configuration

Copy `.env.example` to `.env` and configure:

```env
# Django
DJANGO_SECRET_KEY=<your-secret-key>
DJANGO_DEBUG=True

# PostgreSQL 16 + pgvector
POSTGRES_DB=copilot_db
POSTGRES_USER=copilot_user
POSTGRES_PASSWORD=copilot_password
POSTGRES_HOST=localhost
POSTGRES_PORT=5432

# Redis & Celery
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/1

# Groq LLM
GROQ_API_KEY=gsk_your_api_key_here
GROQ_MODEL=llama-3.3-70b-versatile

# Embedding Model
EMBEDDING_MODEL_NAME=sentence-transformers/all-MiniLM-L6-v2
EMBEDDING_DIMENSION=384

# Dual-System RAG
CONFIDENCE_THRESHOLD=0.85
MULTI_DOC_MAX_WORKERS=8
```

---

## Running Tests

```bash
# Backend tests (64+ test cases)
pytest tests/backend -q --tb=short

# Frontend tests (40+ test cases)
cd frontend && npm test

# Full harness gate (lint + typecheck + tests)
bash scripts/harness-check.sh        # Linux/Mac
powershell scripts/harness-check.ps1 # Windows
```

---

## Deployment

### Docker Compose (Full Stack)

```bash
docker-compose up -d
```

Services:
| Service | Image | Port |
|---------|-------|------|
| `postgres` | `pgvector/pgvector:pg16` | 5432 |
| `redis` | `redis:7-alpine` | 6379 |
| `backend` | Custom Dockerfile | 8000 |
| `worker` | Same image as backend | — |

---

## Tech Stack

### Backend
| Technology | Purpose |
|-----------|---------|
| Django 5.0 | Web framework & ORM |
| Django REST Framework | API serialization & views |
| PostgreSQL 16 + pgvector | Relational DB + HNSW vector index |
| Redis 7 | Celery broker & result backend |
| Celery 5.4 | Async task queue (PDF ingestion) |
| PyMuPDF (fitz) | PDF text & coordinate extraction |
| sentence-transformers | Local 384-dim embedding generation |
| Groq SDK | LLM inference API client |
| SimpleJWT | JWT token generation & validation |

### Frontend
| Technology | Purpose |
|-----------|---------|
| React 18.3 | UI component framework |
| Vite 5.2 | Build tool & dev server |
| Tailwind CSS 3.4 | Utility-first styling |
| TanStack Query 5 | Server state management |
| PDF.js 3.11 | PDF rendering in canvas |
| Lucide React | Icon library |
| Axios | HTTP client with interceptors |
| Vitest | Unit testing framework |
| React Testing Library | Component testing utilities |

### Infrastructure
| Technology | Purpose |
|-----------|---------|
| Docker Compose | Service orchestration |
| pgvector HNSW | Sub-linear ANN vector search |
| SSE (EventSource) | Real-time streaming protocol |

---

<p align="center">
  <strong>Built with Laya Intelligence & Groq Speed</strong>
  <br/>
  <em>Enterprise-grade contract auditing, reimagined.</em>
</p>
