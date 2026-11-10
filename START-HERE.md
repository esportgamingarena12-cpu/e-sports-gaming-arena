# Start here – building E Gaming Era with Claude Code

## 1. One-time setup (your PC)

- [ ] Install: Node.js LTS, Git, Docker Desktop (running), Supabase CLI, Angular CLI (`npm i -g @angular/cli`), Claude Code.
- [ ] Create a folder `egaming-era` and copy into it: `CLAUDE.md`, `START-HERE.md`, `docs/spec.md`.
- [ ] Open a terminal in that folder: `git init`, then run `claude`.

## 2. First message (paste once, at the start of the project)

```text
You are building the E Gaming Era billing and slot-booking system.

Read CLAUDE.md and docs/spec.md completely before doing anything.
- Part A of docs/spec.md is the specification (roles, requirements, billing rules, data model).
- Part B is the build plan: 11 phases (0–10), decisions D1–D13, tech stack, folder structure, and an acceptance checklist per phase.

Working rules for the whole project:
1. Work one phase at a time. Never start the next phase until I say "next phase".
2. At the start of each phase: restate the phase goal, list the files you will create or change, and list any question where the spec is unclear. Wait for my OK.
3. Follow the spec and decisions D1–D13 exactly. If something is not in the spec, ask; do not invent features.
4. Money, stock, sessions and bookings change only through Postgres RPC functions with RLS on every table.
5. Write tests for every phase (pgTAP for the database, unit and Playwright tests for the web app) and run them.
6. At the end of each phase: run all tests, go through that phase's acceptance checks one by one and report PASS/FAIL for each, show me how to verify it myself, then commit with the message "Phase N: <name>".
7. Keep a file docs/PROGRESS.md: phase, status, date, notes, open questions. Update it at the end of every phase.

Confirm you have read both files by summarising in 10 lines or fewer: the three roles, the billing rule, and the 11 phases. Then wait for me to say "start Phase 0".
```

## 3. Start each phase

Paste the **Prompt** block for that phase from `docs/spec.md` (Part B). For a new Claude Code session, paste this first:

```text
Read CLAUDE.md, docs/spec.md and docs/PROGRESS.md. We are continuing the E Gaming Era build. Tell me which phase is next according to PROGRESS.md and wait.
```

## 4. Useful follow-up prompts

| Situation | Prompt |
| --- | --- |
| A check fails | `Acceptance check "<paste check>" fails. Error: <paste error>. Find the root cause, fix it, re-run the tests and re-check all acceptance checks of this phase.` |
| Review before moving on | `Review everything built in Phase N against docs/spec.md: missing requirements, security gaps (RLS, roles), and untested logic. List findings by severity, then fix the High ones.` |
| Change a decision | `Change decision D<n> to: <new rule>. Update docs/spec.md, list every file affected, and apply the change with a new migration and tests.` |
| Context is getting long | `Summarise the current state into docs/PROGRESS.md so a new session can continue, then stop.` |
| End of project | `Do a final release review: run all tests, RLS matrix (table x role x action), npm audit, check no service_role key in web/, and confirm every FR-01 to FR-39 is implemented. Report a table: requirement, status, where implemented.` |

## 5. Rules for you

- [ ] Tick each phase's acceptance checks yourself before typing "next phase".
- [ ] Never paste the Supabase service_role key into the chat or into `web/`.
- [ ] Use Plan mode (Shift+Tab) for Phases 1, 6, 7, 8 and 10.
