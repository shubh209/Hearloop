# Batch prep agreement (May 31, 2026)

User requested **all remaining coverage areas drafted in one pass**; review later with specific edits per section.

## Content format (agreed May 31 — user review)

Each `coverage/*.md` file includes:

1. **Running scenario** at top (same characters throughout)
2. **Diagram** when the topic is flow/topology
3. Per step: **What happens** (paragraph) · **Why** (1–2 sentences) · **How I’d say it** (one sentence)
4. **Failure paths** as 2–3 mini-stories (not table-only)
5. **Interview script (30s)** at bottom — labeled “only after you understand above”
6. **Quick self-check** questions

Template: [`coverage/_TEMPLATE.md`](coverage/_TEMPLATE.md)

## Defaults used for this batch

| Decision | Choice |
|----------|--------|
| Depth | **Self-study explained first**, then 30s interview script |
| Status | `self-study draft` until user says `lock coverage N` |
| Notion | **Do not push** unless user explicitly asks |
| Grill mode | User reviews one-by-one; cites section + desired change |
| Code | Markdown only (AGENTS.md, CATCHUP, METRICS, testing docs) |
| Metrics framing | **Hybrid infra** ~$9.60/mo — not "fully serverless" |

## Review commands

- `lock coverage 3` — mark area final in INTERVIEW_PREP.md
- `tweak coverage 4: <what to change>` — targeted edit
- `push coverage 3-10 to notion` — MCP publish
- `handoff now` — refresh starter prompt + session log
