# Interview Prep Workflow (reusable)

Copy this folder (`interview-prep/`) into any project repo. Pair it with a project-specific session file (e.g. `context/INTERVIEW_PREP.md`).

**One repo = one active prep session.** Do not mix multiple Notion projects in a single session file.

---

## Purpose

Thorough interview prep happens **once in chat** (iterative, imperfect drafts). **Notion** (or similar) is the **revision layer** — polished notes for quick review before interviews. Do not treat Notion as the first draft surface.

---

## Session phases

| Phase | Where | Goal |
|-------|--------|------|
| 1. Grill | Chat | Resolve decisions, terms, mock answers via Q&A |
| 2. Polish | Chat | User tweaks wording, metrics, stories |
| 3. Publish | Notion | Copy final answers only when stable |
| 4. Revise | Notion only | Later interviews = read sheets, not re-grill |

---

## Source-of-truth order (read before code)

1. **Project session file** — `context/INTERVIEW_PREP.md` (this project's rolling prep state)
2. **Domain glossary** — `CONTEXT.md` (terms only; no implementation)
3. **Architecture decisions** — `docs/adr/*.md` or `context/DECISIONS.md`
4. **Context pack** — `AGENTS.md`, `context/CATCHUP.md`, `context/METRICS.md`, `context/INFRA.md`, `.cursor/ARCHITECTURE.md`, `.cursor/RESUME_METRICS.md`, README
5. **Code** — only when markdown is missing, contradictory, or the question is implementation-specific

**When docs conflict:** `context/METRICS.md` + `AGENTS.md` = current production facts; `context/DECISIONS.md` = rationale (may describe superseded infra). If still unclear, surface the conflict and agree on interview framing — never guess silently.

**Rule:** Scan `.md` files first. Open source only when:

- No `.md` covers the topic, or docs contradict and one fact must be verified
- User asks to verify in code / “is this actually implemented?”
- Grill targets a specific mechanism not documented (retry policy, auth flow, etc.)

If unsure, ask before opening source: “docs don’t specify — verify in code?”

---

## Grill mode (`/grill-with-docs`)

- One question at a time; wait for user answer before the next
- Provide a **recommended answer** with each question
- If answerable from docs, read docs — do not spelunk code by default
- Sharpen fuzzy language; align with `CONTEXT.md` glossary
- Stress-test with concrete scenarios (edge cases, failures, scale)
- Update `CONTEXT.md` inline when a **domain term** is resolved (glossary only)
- Offer ADRs only when: hard to reverse + surprising without context + real trade-off

---

## Context window management

When the chat approaches **~90% context** (or a major section is done):

**Who triggers handoff:** Both. The agent offers proactively when the thread is long or a section is complete; the user can say "handoff now" anytime.

1. Update the project session file (`context/INTERVIEW_PREP.md`):
   - **Session log** — what was grilled, decided, still open
   - **Polished answers** — interview-ready bullets (not raw chat)
   - **Glossary deltas** — terms added to `CONTEXT.md`
2. Refresh the **Future chat starter prompt** section in that file
3. User starts the next chat by pasting the starter prompt + `@context/INTERVIEW_PREP.md`

Do **not** re-walk the codebase in a new chat if the session file is current.

---

## Notion rules

- Notion is **downstream** of chat prep
- User explicitly requests push to Notion (or confirms a section is final). **Publish mechanism (copy vs MCP) — user decides per project; default TBD until confirmed.**
- Map Notion sections to session file headings for easy copy-paste
- Keep Notion as **quick revision** — complete sentences, metrics, STAR format

---

## Interview surface vs self-study

| Layer | Purpose | Example |
|-------|---------|---------|
| **Self-study** | You understand the concept; ask anytime in chat | What does 216× realtime mean? |
| **Interview surface** | What you actually say unless they drill down | "STT is sub-second; not our bottleneck" |

Agent should **not** lead with vendor marketing metrics or textbook definitions unless you ask *"explain this for me."* Grill questions should match **likely interviewer prompts** (why X vs Y, tradeoffs, failures, scale).

---

## Answer format (default; revisable)

Per `interview-prep/coverage/*.md` file:

1. **Running scenario** — concrete Partner + End user
2. **Self-study** — per step: *What happens* (paragraph) · *Why* · *How I’d say it*
3. **Failure mini-stories** (2–3) where relevant
4. **Interview script (30s)** at bottom — only after self-study
5. Template: `coverage/_TEMPLATE.md`

User may change this format later based on how prep goes.

---

## Deliverables per project

| File | Role |
|------|------|
| `interview-prep/WORKFLOW.md` | This file — portable rules (copy across repos) |
| `context/INTERVIEW_PREP.md` | Project-specific prep state + starter prompt |
| `CONTEXT.md` | Domain language only — **create at repo root as terms lock during grill**; not duplicated in session file |
| `docs/adr/NNNN-*.md` | Rare; only for irreversible, surprising trade-offs |

---

## External links (optional)

Record Notion (or other) URLs in the project session file under **External links** so future chats can fetch without re-searching.

---

## Batch review mode (optional)

When user wants speed: draft **all** remaining coverage areas in `context/INTERVIEW_PREP.md` as `draft — batch`. User reviews one section at a time with `tweak coverage N: ...` or `lock coverage N`. Do not push Notion unless asked. See `BATCH_PREP_AGREEMENT.md`.

---

## Default grill order (per project page)

1. Architecture decisions (feeds everything else)
2. Tech concepts (fill gaps as they appear)
3. Mock Q&A (apply locked decisions)

User's Notion hub may say "weakest project first" — pick that project, then follow the order above within it.

---

## Diagrams (default; revisable)

| Trigger (agent or you) | Action |
|------------------------|--------|
| Pipeline, state machine, auth flow, deployment | **Mermaid in chat** first |
| "Save this diagram" / section locked | Also write `interview-prep/diagrams/<topic>.md` |
| "Slide visual" / hand-drawn look | Mermaid → export via mermaid.live, or Excalidraw |
| Illustration (icon, metaphor) | `GenerateImage` only on explicit request |

See [`DIAGRAM_VS_PROSE.md`](./DIAGRAM_VS_PROSE.md) (when: diagram vs bullets) and [`DIAGRAM_TRIGGERS.md`](./DIAGRAM_TRIGGERS.md) (which diagram type).

---

## Skills & coverage

- **When to invoke skills / what to install:** [`SKILLS_AND_TRIGGERS.md`](./SKILLS_AND_TRIGGERS.md)
- **Topics easy to skip:** [`PREP_CHECKLIST.md`](./PREP_CHECKLIST.md) — agent scans periodically; user can say "coverage check"

Agent should **recommend** a skill or diagram when it fits (not silently skip). User can decline and move on.

---

## What not to do

- Push half-baked answers to Notion
- Read the whole codebase at session start
- Batch 10 grill questions without user input
- Put implementation details in `CONTEXT.md`
- Skip updating the session file between long chats
