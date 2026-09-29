# AGENTS.md

## Autonomous Harness & Project Rules

This repository contains the **Enterprise Contract & Policy Copilot (Dual-System RAG with Hybrid RRF & Telemetry Engine)**.
All development in this repository is strictly governed by automated harness engineering protocols.

### Core Non-Negotiable Invariants
1. **Context Boundary**: The agent must execute strictly **ONE atomic ticket** from `.agent/TASKS.md` per run. Never leap ahead or conflate tasks.
2. **Never Edit `.env.example` as a secret store**: Never commit raw secrets. Maintain `.env.example` strictly as schema.
3. **No Migration Bypasses**: Never delete, fake, or bypass Django migrations. Migrations must run cleanly forwards and backwards.
4. **No Disabling Lint or Type Rules**: Never use `--no-verify`, `# type: ignore` without justification, `# noqa`, or disable eslint/tsconfig rules.
5. **Mandatory Error Logging**: Any build, lint, or test failure encountered during ticket execution MUST be logged in `.agent/ERRORS.md` with Root Cause and Resolution.
6. **Harness Gate**: Before any ticket is marked `[x] Complete`, all verification gate checks must pass:
   - Backend Typecheck: `mypy backend`
   - Backend Lint: `flake8 backend`
   - Backend Test Suite: `pytest tests/backend -q --tb=short`
   - Frontend Typecheck & Lint: `npm --prefix frontend run typecheck && npm --prefix frontend run lint`
   - Frontend Unit Suite: `npm --prefix frontend test -- --run`
   - Global Harness Gate: `bash ./scripts/harness-check.sh`

---

## Agent skills

### Issue tracker
Local Markdown tracker with tickets defined in `.agent/TASKS.md` and feature specs in `.agent/SPEC.md`. See `docs/agents/issue-tracker.md`.

### Triage labels
Canonical five-role triage mapping (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs
Single-context domain architecture documented in `CONTEXT.md` with Architectural Decision Records stored in `docs/adr/`. See `docs/agents/domain.md`.

---

## Repository Map & Architecture
```
PortfolioProject-1/
├── .agent/
│   ├── HARNESS.md         # Harness referee rules, invariant enforcement & gate definitions
│   ├── ERRORS.md          # Structured error ledger (Timestamp, Module, Error, Root Cause, Fix)
│   ├── PRD.md             # Product Requirements Document (Workflows, Personas, Features)
│   ├── SPEC.md            # Technical Design & Architecture Specification (Schemas, APIs, RRF)
│   └── TASKS.md           # 12-Ticket Exhaustive Implementation Roadmap
├── backend/
│   ├── manage.py
│   ├── core/              # Django core settings, asgi, wsgi, celery app, root urls
│   └── apps/              # 5 Modular Isolated Apps:
│       ├── authentication/# Custom User, JWT HttpOnly cookie rotation, blacklist
│       ├── documents/     # PDF ingestion, PyMuPDF bbox & page extraction, Celery tasks
│       ├── search/        # pgvector HNSW index, tsvector FTS, raw SQL RRF (k=60)
│       ├── query/         # SSE token streaming (StreamingHttpResponse), citation linking
│       └── analytics/     # Telemetry engine, AuditBenchmarkLog model, metrics API
├── frontend/              # React 18+ Vite, TypeScript, Tailwind, TanStack Query, PDF.js
├── scripts/               # Harness referee, benchmark automation, metrics export
├── tests/
│   ├── backend/           # Pytest test suite for Django apps
│   └── frontend/          # Vitest and Playwright test suite for React client
├── docs/
│   ├── adr/               # Architecture Decision Records
│   └── agents/            # Agent skill configurations
├── docker-compose.yml     # PostgreSQL 16 (pgvector) + Redis 7 + App services
├── pyproject.toml         # Python tool configurations (black, flake8, mypy, pytest)
└── CONTEXT.md             # Domain Glossary, Ubiquitous Language, Invariants
```
