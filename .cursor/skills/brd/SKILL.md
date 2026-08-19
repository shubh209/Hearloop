---
name: brd
description: >-
  Create Business Requirements Documents (BRD) — SDD Layer 1. Defines business
  needs, objectives, success criteria, risks, and architecture decision topics.
  Use when the user says /brd, asks for a BRD, business requirements, or Layer 1
  artifact before or alongside a PRD/spec.
disable-model-invocation: true
---

# BRD (Layer 1)

Create **Business Requirements Documents** — why the business needs something, who cares, what success looks like, and what it must not cost. Not implementation.

**Layer:** 1 (entry point in SDD; no upstream BRD required)

**Downstream:** PRD/spec (Layer 2), tickets, ADRs (topics only — never cite ADR numbers that do not exist)

## Hearloop paths

| Artifact | Location |
| --- | --- |
| New BRD (monolithic, preferred <25KB) | `docs/BRD/BRD-NN_{slug}.md` |
| Traceability matrix | `docs/BRD/BRD-00_TRACEABILITY_MATRIX.md` |
| Domain language | `CONTEXT.md` |
| Product spec (often exists first here) | `docs/superpowers/specs/*-prd.md` or `*-design.md` |
| Architecture rationale | `context/DECISIONS.md`, `docs/adr/` |
| Metrics / cost | `context/METRICS.md`, `context/INFRA.md` |

**No `ai_dev_flow/` or `strategy/` in this repo.** Do not reference missing SDD files. Use Hearloop docs above. Full SDD rules: [reference.md](reference.md).

## When to invoke

- User says `/brd`, "write a BRD", "business requirements", "Layer 1"
- After an approved product spec when the **business case** was never written (Hearloop retroactive path)
- Starting a new initiative before any spec exists (greenfield path)

## Process

### 1. Pre-flight

1. List existing BRDs: `docs/BRD/`
2. Read `CONTEXT.md` for domain terms (Partner, Session, Insights, etc.)
3. Read approved upstream **conversation + spec** if they exist — do not re-interview; synthesize
4. Confirm element ID format: `BRD.{DOC_NUM}.{ELEM_TYPE}.{SEQ}` (4 segments, dots). Never `FR-XXX`, `BO-XXX`, `AC-XXX`.

**Element type codes (common):**

| Code | Type |
| --- | --- |
| 01 | Functional requirement |
| 06 | Acceptance criteria |
| 23 | Business objective |
| 32 | Architecture topic |

### 2. Platform vs Feature BRD

Run the questionnaire in [reference.md](reference.md). For Hearloop:

- **Platform BRD** — infra, cross-cutting stack, patterns other features depend on
- **Feature BRD** — Insights query, capture, eval, etc. on existing platform

**Feature BRD:** sections 3.6 and 3.7 → `N/A — see existing platform (Postgres, AWS, Fastify, Neon, CONTEXT.md, context/INFRA.md)` with specific references.

**Platform BRD:** populate 3.6 Technology Stack Prerequisites and 3.7 Mandatory Technology Conditions.

### 3. Reserve ID

Next `BRD-NN` from `docs/BRD/` (two digits: BRD-01, not BRD-001).

### 4. Write the BRD

Use [template-monolithic.md](template-monolithic.md). **Document Control first**, then numbered sections.

**Mandatory content:**

- Business objectives with element IDs (`BRD.NN.23.xx`)
- Functional business requirements (`BRD.NN.01.xx`) — outcomes, not APIs
- Success criteria / acceptance at business level (`BRD.NN.06.xx`)
- Constraints, assumptions, risks
- **Section 7.2 Architecture Decision Requirements** — 7 topic categories (infra, data, integration, security, observability, AI/ML, technology). Status: Selected / Pending / N/A. **No ADR-NNN placeholders.** Cost-focused alternatives for Selected topics.
- Traceability to upstream (CONTEXT, design spec, approved PRD if retroactive) and downstream (PRD/spec, tickets)
- Glossary aligned with `CONTEXT.md`

**Diagrams:** Mermaid only.

### 5. Hearloop retroactive path (spec already approved)

When a PRD/spec is already approved (e.g. Insights query v4):

- BRD documents **why** that investment is justified (accuracy, cost vs lakehouse, portfolio learning, Partner trust)
- Traceability links **to** the approved spec as aligned product contract — do not contradict signed ODs
- BRD does not re-open signed product decisions unless user explicitly requests

### 6. Greenfield path (no spec yet)

- BRD first → then `to-spec` / PRD skill → then tickets
- BRD must not specify file paths or implementation

### 7. Traceability matrix

Create or update `docs/BRD/BRD-00_TRACEABILITY_MATRIX.md` with this BRD row (upstream, downstream, status).

### 8. Validate (manual — no ai_dev_flow scripts)

Checklist:

- [ ] Document Control at top
- [ ] Platform vs Feature handled; 3.6/3.7 correct
- [ ] Element IDs use `BRD.NN.TT.SS`
- [ ] No `ADR-XXX` or `TBD` placeholders
- [ ] No broken links
- [ ] Terminology matches `CONTEXT.md`
- [ ] Architecture topics listed without inventing ADR numbers
- [ ] Traceability matrix updated

### 9. Do not

- Publish GitHub issues unless user authorized
- Commit unless user asked
- Create missing upstream SDD artifacts — skip functionality instead
- Duplicate the PRD (BRD = business why; PRD = product what/how at product level)

## Next skills

| After BRD | Skill |
| --- | --- |
| Product spec missing | Matt `to-spec` or `.cursor/rules/skill-to-prd.mdc` |
| Tickets | `to-tickets` / `skill-to-issues.mdc` |
| Stress-test requirements | `skill-grill-me.mdc` |

## Full SDD reference

- SDD methodology, cloud comparison tables, validation codes: [reference.md](reference.md)
- Monolithic template: [template-monolithic.md](template-monolithic.md)
