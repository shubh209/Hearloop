# context/ — IDE-Agnostic AI Session Context

This folder gives any AI assistant enough project context to be immediately useful — in any IDE (Cursor, Kiro, VS Code + Copilot, Claude Code, etc.) and with any model — using the fewest tokens possible.

---

## How to Start a New Session

### Fastest (1 file, ~150 lines)
Point your AI to `AGENTS.md` at the repo root. It covers product, stack, live URLs, current state, P0 bugs, and next steps in a single compact page. Most tools (Cursor, Claude Code, Kiro, OpenAI Codex agents) pick this up automatically.

```
@AGENTS.md — start here, then ask what you need
```

### Full Context (when doing deep work)
Add `context/CATCHUP.md` for code-level detail on all routes, jobs, schema, and known issues.

```
@AGENTS.md @context/CATCHUP.md
```

### Task-Specific Deep Dives

| Task | File(s) to add |
|---|---|
| Fixing the hosted capture flow | `context/CATCHUP.md` → Recorder.tsx section |
| Planning what to work on | `context/BACKLOG.md` |
| Deploying / SSH / env vars | `context/INFRA.md` |
| Questioning a tech choice | `context/DECISIONS.md` |
| Debugging Bedrock token issues | `.cursor/AI_BEDROCK_RUNBOOK.md` |
| Following code style | `.cursor/CODE_STYLE.md` |

---

## File Index

| File | Lines | Purpose |
|---|---|---|
| `../AGENTS.md` | ~150 | **Start here.** Compact session primer. Auto-read by most AI tools. |
| `CATCHUP.md` | ~300 | Full code-level context: routes, jobs, schema, bugs, state |
| `BACKLOG.md` | ~80 | Prioritized task list with checkboxes (P0/P1/P2/V2) |
| `INFRA.md` | ~80 | Live URLs, AWS resources, SSH commands, deploy steps, env vars |
| `DECISIONS.md` | ~70 | Why each major tech choice was made |
| `README.md` | this file | How to use this folder |

---

## IDE-Specific Notes

### Cursor
`AGENTS.md` at repo root is auto-included as a rule. Rules in `.cursor/rules/` are also picked up. The existing `.cursor/` files remain valid but some are stale — this `context/` folder supersedes them for session priming.

### Kiro (AWS)
Kiro reads `AGENTS.md` at root and supports `.kiro/` for specs and hooks. Point Kiro at `context/CATCHUP.md` in your spec's context block for deep work.

### Claude Code (Anthropic CLI)
Automatically reads `AGENTS.md` and `CLAUDE.md` at repo root. You can also run:
```bash
claude --context context/CATCHUP.md
```

### VS Code + GitHub Copilot / Continue
Open `AGENTS.md` in the editor and use `@file` references in the chat panel. Or use Continue's `context` config to always include `AGENTS.md`.

### OpenAI Codex Agents
Reads `AGENTS.md` automatically. For deeper context add `context/CATCHUP.md` to the agent's file attachments.

---

## Keeping This Up To Date

Update these files when:
- A P0 bug is fixed (mark in `BACKLOG.md`, update state in `AGENTS.md`)
- New routes or jobs are added (update `CATCHUP.md` route table)
- Infrastructure changes (update `INFRA.md`)
- A major tech decision is made (add to `DECISIONS.md`)
- `other/summary.md` is updated (sync the Current State section to `AGENTS.md`)

The goal is: any developer or AI assistant can open this repo cold, read `AGENTS.md`, and be productive in under 2 minutes.
