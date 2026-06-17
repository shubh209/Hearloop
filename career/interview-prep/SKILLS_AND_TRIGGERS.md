# Skills & triggers for interview prep (portable)

Copy with `interview-prep/` into any repo. Agent **recommends** skills when useful; user installs or invokes.

Paths below are common in Cursor/Codex/Kiro clones — adjust names to your environment.

---

## Core skills (use often)

| Skill | Invoke when | Command / hint |
|-------|-------------|----------------|
| **grill-with-docs** | Locking architecture, terms, tradeoffs; updating `CONTEXT.md` | `/grill-with-docs` |
| **grill-me** | Same as above but no doc updates; pure Q&A | `/grill-me` |
| **handoff** | Long chat; before switching project; ~90% context | `/handoff` or "handoff now" |
| **caveman** | Final cram; reduce tokens; bullet-only answers | `/caveman` |
| **zoom-out** | You’re lost in details; need "how this fits the product" | `/zoom-out` |

---

## Recommend installing / using when…

| Situation | Skill | Why |
|-----------|--------|-----|
| Mock answer feels vague | **grill-with-docs** | Forces precision + glossary |
| About to publish to Notion | **knowledge-capture** (Notion plugin) | Structured page from chat (if you use MCP) |
| "Did we cover everything?" | **PREP_CHECKLIST.md** + agent pass | Gap analysis without code |
| Contradiction between story and docs | **diagnose** | Reproduce → find source of truth (md first per WORKFLOW) |
| Want ADR for one decision | **grill-with-docs** ADR path | Only if hard to reverse + surprising |
| Splitting prep across repos | Copy **entire `interview-prep/`** | Same rules per project |
| PR / resume claims vs reality | **review** | Standards check on metrics wording |

**Agent line:** *"For this, `/grill-with-docs` will help more than ad-hoc Q&A — want that?"*

---

## Notion plugin (optional)

| Skill | When |
|-------|------|
| **search** / **find** | Locate project page in workspace |
| **database-query** | If tasks/flashcards live in a DB |
| **knowledge-capture** | After section final (if you chose MCP publish) |
| **spec-to-implementation** | Breaking a big prep gap into study tasks |

Publish method still **TBD** per project until user decides (copy vs MCP).

---

## Diagram vs bullets (no plugin — use repo files)

| File | Role |
|------|------|
| [`DIAGRAM_VS_PROSE.md`](./DIAGRAM_VS_PROSE.md) | **When** diagram vs bullets (E2E = diagram + bullets) |
| [`DIAGRAM_TRIGGERS.md`](./DIAGRAM_TRIGGERS.md) | **Which** diagram type to offer |

User can say: **"diagram or bullets?"** — agent runs the three-question test in `DIAGRAM_VS_PROSE.md`.

### Skills that help choose format

| Skill | Use when |
|-------|----------|
| **grill-with-docs** | Locking a flow; agent should default to **both** for E2E |
| **zoom-out** | You're not sure if you need system vs job-level diagram |
| **canvas** | You want a **revision artifact** (pipeline with expandable steps) beside chat — heavier than Mermaid |
| **caveman** | Diagram already saved; verbal bullets only |

There is **no** Cursor marketplace skill dedicated to diagram-vs-prose; the portable markdown above replaces it for all projects.

Optional user tools (not agent skills): **mermaid.live**, **Excalidraw**, VS Code Mermaid preview.

---

## Per-session rhythm (suggested)

1. **Start:** Paste starter prompt from `context/INTERVIEW_PREP.md`
2. **Grill:** `/grill-with-docs` on one architecture item or mock question
3. **Diagram:** Accept or skip when offered at pipeline / state / deploy topics
4. **Coverage:** Every ~3–5 locked answers, user or agent: **"coverage check"** → [`PREP_CHECKLIST.md`](./PREP_CHECKLIST.md)
5. **End:** Handoff update session file; optional **diagram pass**

---

## Other projects

| Repo | Session file | Notion page |
|------|--------------|-------------|
| Hearloop | `context/INTERVIEW_PREP.md` | Projects → Hearloop |
| Other | `context/INTERVIEW_PREP.md` | That project's page |

Same `interview-prep/` folder; only session file + Notion URL change.
