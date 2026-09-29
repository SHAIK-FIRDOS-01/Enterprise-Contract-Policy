# Error Ledger & Resolution Tracking

Whenever any test, lint, typecheck, or build failure occurs during ticket execution, an entry MUST be appended to this log prior to marking the ticket complete.

## Log Schema

| Timestamp | App/Module | Error Message | Root Cause | Resolution / Fix Applied |
| :--- | :--- | :--- | :--- | :--- |

---

| 2026-09-29T17:04:55+05:30 | Core/Venv Bootstrap | pip install torch --index-url error: No matching distribution for flit_core | Using `--index-url` restricted pip solely to PyTorch CPU wheel repo, hiding PyPI build dependencies | Upgrade pip and use `--extra-index-url https://download.pytorch.org/whl/cpu` to allow PyPI fallthrough |
| 2026-09-29T17:20:24+05:30 | backend/apps/*/urls.py | F401 'django.urls.path' imported but unused in 5 app urls.py stubs | Stub files imported path before any routes were registered | Remove unused import until routes are implemented |
| 2026-09-29T17:21:47+05:30 | backend (mypy) | ModuleNotFoundError: No module named 'core' during mypy_django_plugin init | mypy ran from repository root without mypy_path including backend directory | Add mypy_path = "backend" to pyproject.toml [tool.mypy] |
| 2026-09-29T17:23:06+05:30 | backend/core/celery.py | error: Skipping analyzing 'celery': module is installed, but missing library stubs [import-untyped] | Celery and PyMuPDF (fitz) do not provide PEP 561 py.typed markers | Add [tool.mypy.overrides] ignore_missing_imports for celery, fitz, pgvector to pyproject.toml |
