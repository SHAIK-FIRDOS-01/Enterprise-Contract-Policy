# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root: Contains the ubiquitous language, domain glossary, bounded contexts, and system invariants.
- **`docs/adr/`**: Read ADRs that touch the area you're about to work in.
- **`.agent/SPEC.md`**: Contains detailed schemas, API contracts, and SQL query definitions.
- **`.agent/PRD.md`**: Contains business requirements, user personas, and feature workflows.

## File structure

Single-context repo:

```
/
├── CONTEXT.md
├── docs/adr/
│   └── 0001-modular-django-architecture.md
├── .agent/
│   ├── HARNESS.md
│   ├── ERRORS.md
│   ├── PRD.md
│   ├── SPEC.md
│   └── TASKS.md
└── backend/apps/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding.
