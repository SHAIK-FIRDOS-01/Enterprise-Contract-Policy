# Issue tracker: Local Markdown & Tasks Ledger

Issues and tickets for this repo live as structured Markdown tasks in `.agent/TASKS.md` and feature specs in `.agent/SPEC.md`.

## Conventions

- Master tickets roadmap: `.agent/TASKS.md`
- Master technical specification: `.agent/SPEC.md`
- Master product requirements: `.agent/PRD.md`
- Master error tracking ledger: `.agent/ERRORS.md`
- Each ticket follows the strict ID format `TICKET-01`, `TICKET-02`, through `TICKET-12`.
- Status transitions: `[ ] Pending` -> `[-] In Progress` -> `[x] Complete`.
- Verification criteria must be documented under each ticket with exact commands.

## When a skill says "publish to the issue tracker"
Append or update the issue entry in `.agent/TASKS.md` or write to `.scratch/<ticket-id>/` if detailed working notes are required.

## When a skill says "fetch the relevant ticket"
Read `.agent/TASKS.md` and select the active ticket.
