# ADR 0001: Modular 5-App Django Architecture with Hybrid RRF & Celery

## Status
Accepted

## Context
Enterprise contracts and policy documents require complex, multi-stage processing:
1. High-security authentication with HttpOnly JWT rotation.
2. Heavy multi-page PDF coordinate extraction using PyMuPDF (fitz) without blocking HTTP threads.
3. Hybrid search combining dense semantic embeddings (pgvector HNSW) and sparse keyword indices (`tsvector`).
4. Real-time streaming responses with coordinate bounding box citation payloads.
5. In-depth profiling, audit telemetry, and cost/latency benchmarking.

Monolithic application architectures in Django frequently degrade into tangled imports and circular dependencies when vector search, streaming endpoints, and Celery tasks are intermingled.

## Decision
We enforce a strict 5-app modular architecture under `backend/apps/`:
1. `apps/authentication`: Custom User model, SimpleJWT cookie rotation & blacklist.
2. `apps/documents`: PDF model, PyMuPDF extraction service, Celery async pipeline.
3. `apps/search`: pgvector HNSW index, tsvector FTS, raw SQL RRF (k=60).
4. `apps/query`: SSE token streaming endpoint (`StreamingHttpResponse`), prompt assembly, citation payloads.
5. `apps/analytics`: `AuditBenchmarkLog` model, telemetry recording, performance aggregation.

Inter-app dependencies are strictly directed:
`query` -> `search` -> `documents`
`analytics` is consumed as an observer/telemetry service across all apps.
No reverse circular imports are permitted.

## Consequences
- Clean separation of concerns with isolated database migrations per domain.
- Simplified unit testing: each app contains its own tests and fixtures.
- Scalable worker deployment: Celery workers can scale independently from ASGI/WSGI web servers.
