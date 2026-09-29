# Autonomous Harness Engineering Rules & Referee Protocol

## 1. Context Boundary & Execution Discipline
1. **Single Atomic Ticket Execution**: The agent must execute strictly **ONE atomic ticket** from `.agent/TASKS.md` per run. Never jump ahead, conflate multiple tasks, or perform speculative multi-ticket implementation.
2. **Ticket Lifecycle**:
   - Every ticket must begin with state `[ ] Pending` in `.agent/TASKS.md`.
   - Before executing code changes, update the ticket status to `[-] In Progress`.
   - Execute all changes for the single ticket.
   - Run the full verification suite defined in Section 3.
   - If any step fails, record the error in `.agent/ERRORS.md` and resolve it.
   - Only when all verification gates pass with exit code `0`, mark the ticket `[x] Complete`.

---

## 2. Invariant Rules
1. **Strict Secret Hygiene**: Never commit raw secrets or production credentials. Never use `.env.example` as a secret store; `.env.example` serves strictly as a schema definition with dummy defaults.
2. **Zero Migration Bypasses**: Never delete, fake, edit retroactively, or bypass Django migrations. Migrations must run cleanly forwards (`python backend/manage.py migrate`) and backwards (`python backend/manage.py migrate <app> <previous_migration>`).
3. **No Linter or Type Rule Suppression**:
   - Never use `--no-verify` on git commits or harness scripts.
   - Never insert `# type: ignore` without rigorous technical justification documented in a comment.
   - Never insert `# noqa` to hide lint warnings without explicit documentation.
   - Never disable ESLint, TypeScript, or Flake8 rules in project config.
4. **Mandatory Error Logging**: Any build, lint, or test failure encountered during ticket execution MUST be logged in `.agent/ERRORS.md` with:
   - `Timestamp`
   - `App/Module`
   - `Error Message`
   - `Root Cause`
   - `Resolution / Fix Applied`

---

## 3. Verification Gate Commands

Before marking any ticket complete, the agent must run and pass the following gate commands:

| Check Domain | Command | Required Output |
| :--- | :--- | :--- |
| **Backend Typecheck** | `mypy backend` | Success: no issues found |
| **Backend Lint** | `flake8 backend` | Clean exit (0 errors/warnings) |
| **Backend Test Suite** | `pytest tests/backend -q --tb=short` | All tests green |
| **Frontend Typecheck & Lint** | `npm --prefix frontend run typecheck && npm --prefix frontend run lint` | Zero TypeScript or ESLint errors |
| **Frontend Unit Suite** | `npm --prefix frontend test -- --run` | All unit/component tests green |
| **Global Harness Gate** | `bash ./scripts/harness-check.sh` (or `powershell ./scripts/harness-check.ps1`) | Exit code 0 |

---

## 4. Harness Referee Decision Loop

```
+-------------------------------------------------------+
|  1. Read .agent/TASKS.md -> Identify Active Ticket     |
+---------------------------+---------------------------+
                            |
                            v
+-------------------------------------------------------+
|  2. Mark Ticket '[-] In Progress'                     |
+---------------------------+---------------------------+
                            |
                            v
+-------------------------------------------------------+
|  3. Implement Code Changes for Active Ticket Only     |
+---------------------------+---------------------------+
                            |
                            v
+-------------------------------------------------------+
|  4. Execute Verification Gate Checks                  |
+---------------------------+---------------------------+
                            |
             +--------------+--------------+
             |                             |
          [Passed]                      [Failed]
             |                             |
             v                             v
+------------------------+    +-------------------------+
| 5. Mark '[x] Complete' |    | 5b. Log in ERRORS.md    |
|    Commit Ticket Scope |    |     Debug & Fix Bug     |
+------------------------+    |     Re-run Gates        |
                              +-------------------------+
```
