# CONTEXT.md — Enterprise Contract & Policy Copilot

## Ubiquitous Language & Domain Glossary

This document serves as the single source of truth for domain vocabulary, bounded contexts, and domain invariants across the Enterprise Contract & Policy Copilot codebase.

### Ubiquitous Language

- **Document**: An ingested legal agreement, corporate policy, or contract file (PDF format) uploaded by an authorized user.
- **Document Chunk**: A segmented textual unit extracted from a Document, bounded by precise PDF page coordinates (`x0, y0, x1, y1` in PDF points), indexed both as a dense vector embedding (1536-dim) and as a sparse lexical `tsvector`.
- **Bounding Box (BBox)**: Normalized or absolute pixel/point coordinates `[x0, y0, x1, y1]` identifying the exact rectangular region on a PDF page where a chunk's text is physically located.
- **Dense Embedding**: A 1536-dimensional float vector produced via an embedding model (e.g. `text-embedding-3-small`), indexed via pgvector HNSW (Hierarchical Navigable Small World) for sub-linear cosine similarity retrieval.
- **Sparse Search Vector**: A PostgreSQL `tsvector` generated using the English text search dictionary for lexical BM25-style keyword matching via `ts_rank_cd`.
- **Hybrid RRF (Reciprocal Rank Fusion)**: An algorithmic rank-aggregation technique with smoothing constant $k=60$ that merges dense vector semantic scores and sparse keyword ranks into a unified relevance score without score normalization artifacts:
  $$RRF(d) = \sum_{m \in M} \frac{1}{k + r_m(d)}$$
- **Citation**: An evidence tuple linking a generated claim or answer token directly to a source Document Chunk, containing `chunk_id`, `document_id`, `page_number`, and `bounding_box`.
- **Playbook / Clause Checklist**: A predefined set of corporate policy criteria and risk thresholds (e.g., Indemnification, Governing Law, Limitation of Liability) against which an uploaded contract is automatically audited.
- **Redline Diff**: A token-level or clause-level semantic comparison highlighting divergences between standard playbook terms and the uploaded contract draft.
- **Telemetry Engine / Audit Benchmark**: An automated profiling subsystem capturing execution metrics (duration in ms, input/output token counts, estimated dollar costs, schema parse validity, grounding verification scores) comparing Baseline LLM pipelines against Optimized Hybrid RAG pipelines.

---

## Bounded Contexts

```
+-----------------------------------------------------------------------------------+
|                           Enterprise Copilot Domain                               |
+------------------------------------+----------------------------------------------+
| 1. Authentication Context          | 2. Documents & Ingestion Context             |
|    - Identity, Roles (AUDITOR,     |    - PDF Storage & Metadata                  |
|      ADMIN), JWT Cookie Rotation,  |    - PyMuPDF BBox Coordinate Extraction      |
|      Blacklist Token Store         |    - Celery Async Processing Pipeline        |
+------------------------------------+----------------------------------------------+
| 3. Hybrid Search Context           | 4. Query & Streaming Context                 |
|    - pgvector HNSW Dense Index     |    - Server-Sent Events (SSE) Streaming      |
|    - tsvector Full-Text Lexical    |    - Inline Citation Attachment              |
|    - Raw SQL RRF (k=60) Fusion     |    - Grounding Verification Engine           |
+------------------------------------+----------------------------------------------+
| 5. Analytics & Telemetry Context   | 6. Client Presentation Context               |
|    - AuditBenchmarkLog Ledger      |    - React 18 + TanStack Query UI Shell      |
|    - Comparative Baseline Metrics  |    - Split-Pane PDF.js + Dynamic BBox Canvas |
|    - Performance Telemetry Export  |    - Real-time Citation Sync & Highlighting  |
+------------------------------------+----------------------------------------------+
```

---

## System Invariants

1. **Coordinate Determinism**: Every text chunk stored in the database MUST retain its bounding box coordinates `[x0, y0, x1, y1]` and 1-indexed `page_number`. No chunk may exist without page positioning.
2. **Zero-Lock Ingestion**: Document parsing and vectorization MUST occur asynchronously in Celery background workers. The HTTP upload endpoint must return `202 Accepted` within 500ms.
3. **Dual-Index Synchrony**: A `DocumentChunk` row MUST populate both `embedding` (vector) and `search_vector` (`tsvector`) before status transitions to `READY`.
4. **Token Streaming Contract**: SSE streams must deliver textual tokens immediately via `data: {"type": "token", "content": "..."}` and citation payloads via `data: {"type": "citation", ...}` before closing with `data: [DONE]`.
5. **Cookie Security**: Authentication JWT access tokens and refresh tokens must never be accessible to client JavaScript; they must strictly reside in HttpOnly, Secure, SameSite cookies with automated rotation.
