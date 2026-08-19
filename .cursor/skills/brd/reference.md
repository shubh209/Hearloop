# BRD — SDD reference (Hearloop adaptation)

Condensed from `doc-brd` SDD Layer 1 skill. Hearloop has no `ai_dev_flow/` or `strategy/` — use paths in `SKILL.md`.

## Layer model

```
BRD (Layer 1) → PRD/spec (Layer 2) → EARS/BDD/tickets → ADR (Layer 5, from §7 topics only)
```

**Layer separation:**

| BRD §7.2 | PRD/spec | ADR |
| --- | --- | --- |
| WHAT & WHY & HOW MUCH | HOW to evaluate | Final decision |
| Business drivers | Technical detail | Implementation |

## Platform vs Feature questionnaire

1. Infrastructure / cross-cutting / stack? → **Platform**
2. Specific user-facing workflow? → **Feature**
3. Other BRDs depend on this? → **Platform**
4. Patterns used across features? → **Platform**
5. Builds on existing platform? → **Feature**

Auto-detect:

- Title: Platform, Architecture, Infrastructure → Platform
- Title: workflow, user type, feature name → Feature

## Element ID format (mandatory)

- **Format:** `BRD.{DOC_NUM}.{ELEM_TYPE}.{SEQ}` — four segments, dots
- **Examples:** `BRD.01.23.01` (objective), `BRD.01.32.03` (architecture topic)
- **Never:** `FR-XXX`, `AC-XXX`, `BO-XXX`, `BRD-017.001` (deprecated 3-segment)

## Tag format (downstream artifacts)

| Notation | Example | Points to |
| --- | --- | --- |
| Dot | `@brd: BRD.01.01.01` | Element inside BRD |
| Dash | `ADR-03` | ADR document file |

BRD (Layer 1) has **0 upstream tags**.

## Seven mandatory architecture topics (§7.2)

| # | Category | Element | When N/A |
| --- | --- | --- | --- |
| 1 | Infrastructure | BRD.NN.32.01 | Pure analytics, no deploy |
| 2 | Data Architecture | BRD.NN.32.02 | No persistent data |
| 3 | Integration | BRD.NN.32.03 | Standalone |
| 4 | Security | BRD.NN.32.04 | Internal, no sensitive data |
| 5 | Observability | BRD.NN.32.05 | MVP only — still document Pending |
| 6 | AI/ML | BRD.NN.32.06 | No AI |
| 7 | Technology Selection | BRD.NN.32.07 | Fixed stack |

### Selected topic — required fields

- Status: **Selected**
- Business Driver
- Business Constraints
- **Alternatives Overview** (cost table, mandatory)
- **Cloud Provider Comparison** (GCP / Azure / AWS — mandatory for infra selections)
- Recommended Selection + rationale
- PRD Requirements (what product spec must elaborate)

### Alternatives table template

| Option | Function | Est. Monthly Cost | Selection Rationale |
| --- | --- | --- | --- |
| | | | Selected / Rejected — reason |

### Cloud comparison template

| Criterion | GCP | Azure | AWS |
| --- | --- | --- | --- |
| Service Name | | | |
| Est. Monthly Cost | | | |
| Key Strength | | | |
| Key Limitation | | | |
| Fit for This Project | High/Med/Low | | |

### N/A topic example

```markdown
### BRD.01.32.06: AI/ML Architecture
**Status:** N/A — {reason}
**PRD Requirements:** None for current scope.
```

### Pending topic example

```markdown
**Status:** Pending — awaiting {dependency}
**Alternatives Overview:** To be completed after {X}.
```

## Traceability matrix

File: `docs/BRD/BRD-00_TRACEABILITY_MATRIX.md`

| BRD ID | Title | Type | Upstream | Downstream | Status |
| --- | --- | --- | --- | --- | --- |
| BRD-01 | … | Feature | CONTEXT, spec | PRD, tickets | Draft |

Update matrix in same commit as BRD when user requests commit.

## Validation (manual checklist)

- Document Control first
- 18 core sections or N/A with reason
- Platform: 3.6 + 3.7 populated. Feature: N/A with references
- No ADR-NNN references before ADRs exist
- No TBD / BRD-XXX placeholders
- Mermaid for diagrams (no ASCII architecture)
- File < 50KB preferred for monolithic
- Terminology matches CONTEXT.md

## Common pitfalls

1. Referencing ADR numbers that do not exist
2. Feature BRD populating 3.6/3.7 instead of referencing platform
3. BRD specifying APIs and file paths (belongs in PRD/spec)
4. Skipping traceability matrix
5. Inventing `strategy/` citations in Hearloop

## Hearloop platform facts (for Feature BRD §3.6 references)

- **API:** Fastify on EC2 (see `context/INFRA.md`)
- **DB:** Postgres (Neon)
- **Object storage:** S3/R2 for recordings
- **Queue:** BullMQ
- **Transcription:** Groq Whisper
- **Classification:** AWS Bedrock
- **Frontend:** Partner dashboard, hosted capture
- **Domain:** `CONTEXT.md`

Feature BRDs reference these; they do not re-decide stack unless §7.2 topic is Pending with business driver.

## Post-creation

Next: PRD/spec (`to-spec`) if missing; tickets (`to-tickets`); ADRs only for Selected §7.2 topics after PRD.
