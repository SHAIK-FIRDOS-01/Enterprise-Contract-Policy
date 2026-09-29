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
| 2026-09-29T17:40:20+05:30 | backend/apps/authentication | ModuleNotFoundError: No module named 'apps.authentication.authentication' | DRF views evaluate DEFAULT_AUTHENTICATION_CLASSES which references CookieJWTAuthentication | Implement CookieJWTAuthentication in apps/authentication/authentication.py |
| 2026-09-29T17:44:04+05:30 | backend/manage.py migrate | ProgrammingError: relation 'authentication_user' does not exist | admin.0001_initial depends on custom AUTH_USER_MODEL before authentication migrations were generated | Run makemigrations authentication to generate 0001_initial before migrating |
| 2026-09-29T17:45:34+05:30 | apps/authentication/authentication.py | E501 line too long & mypy unused-ignore / call-overload | Unneeded type ignore and untyped settings.SIMPLE_JWT.get lookup | Format signature under 100 chars, cast cookie_name to str, remove redundant ignore comment |
| 2026-09-29T17:47:15+05:30 | apps/authentication/authentication.py | mypy: Argument 1 to get_validated_token has incompatible type 'str'; expected 'bytes' | simplejwt stubs declare raw_token as bytes | Encode raw_token string to bytes with .encode('utf-8') |
| 2026-09-29T18:07:53+05:30 | apps/authentication/models.py & views.py | mypy: REQUIRED_FIELDS classvar override, samesite Literal type, and RefreshToken token type | REQUIRED_FIELDS needs ClassVar annotation, samesite expects Literal, simplejwt __init__ types token as Token | Use ClassVar[list[str]], cast samesite to Literal, and cast token to Any for RefreshToken |
| 2026-09-29T18:35:15+05:30 | apps/documents/views.py | mypy: Function is missing a return type annotation & user lookup type incompatibility | Generic views get_queryset missing QuerySet return type and self.request.user includes AnonymousUser | Annotate return types QuerySet[Model] and type-guard self.request.user with isinstance(user, User) |
| 2026-09-29T18:58:03+05:30 | apps/documents/services/{chunking,embedding}.py | F401 unused typing.Optional & mypy model_name type error | Unused import in chunking.py and getattr returning Any/None for model_name in embedding.py | Remove unused Optional import and cast self.model_name explicitly to str |
| 2026-09-29T19:18:45+05:30 | tests/backend/test_ticket_06_search.py | AssertionError in test_reciprocal_rank_fusion_ordering | Test chunks both matched dense and sparse leading to identical RRF scores | Explicitly configure dual-match, sparse-only (embedding=None), and dense-only chunks to verify RRF fusion dominance |
| 2026-09-29T19:22:29+05:30 | backend/apps/search/services/hybrid_search.py | W291 trailing whitespace & E501 line too long in raw CTE SQL string | SQL query lines in multiline string exceeded 100 character threshold and had trailing whitespace | Wrap SQL CTE query clauses cleanly across lines under 100 chars without trailing whitespace |
