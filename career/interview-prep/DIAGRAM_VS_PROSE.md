# Diagram vs bullets — decision guide (portable)

Use this when prepping any project. Agent applies it on **"diagram or bullets?"** or when offering a format.

---

## Quick rule

| If the answer depends on… | Primary format | Add secondary |
|---------------------------|----------------|---------------|
| **Order in time** (who calls whom, step 1→2→3) | **Diagram** (sequence / flowchart) | Bullets = what to say at each step |
| **States & transitions** (session status, job lifecycle) | **State diagram** | Bullets = what triggers each transition |
| **Spatial topology** (what runs where: Vercel, EC2, S3) | **Box diagram** | Bullets = cost, tradeoff per box |
| **Definitions** (what is a Partner vs Session) | **Bullets / glossary** | No diagram |
| **Tradeoff list** (why X not Y) | **Bullets or table** | Optional 2-box comparison diagram |
| **Numbers** (p95, $/mo, VUs) | **Bullets or table** | Sparkline/chart only if trend matters |
| **Behavioral / STAR** | **Bullets** | No diagram |

**Default combo for interviews:** **Diagram for structure, bullets for substance.**

Example (Hearloop E2E): sequence diagram for the path + 1 bullet per stage (latency, failure, idempotency).

---

## Three-question test (agent or you)

1. **Can I draw arrows between named things?** → Yes → diagram likely helps.  
2. **Would I use my hands to explain order?** → Yes → sequence/flowchart.  
3. **Is it only opinions or definitions?** → Yes → bullets only.

---

## Hearloop examples

| Topic | Diagram? | Bullets for |
|-------|----------|-------------|
| E2E pipeline after finalize | ✅ Sequence | Groq vs Bedrock timing, failure → `failed` |
| Session state machine | ✅ State | Expiry job, allowed transitions |
| Hybrid infra | ✅ Boxes | $9.60/mo, why not Lambda workers |
| Why Groq for STT | ❌ | Speed, cost, audio quality |
| Why Nova Lite | ❌ | $/session, Haiku fallback |
| Multi-tenancy | ✅ Sequence (two tenants) | `partner_id` isolation, CORS |
| OWASP ZAP | ❌ (table ok) | What was found/fixed |
| Mock: "hardest bug" | ❌ | STAR |

---

## Format templates

### Template A — E2E (recommended)

1. Mermaid sequence or flowchart (≤12 nodes)  
2. **Talk track:** numbered bullets matching diagram labels  
3. **Depth chips:** optional `Failure:` / `Metric:` under a step  

### Template B — Decision only

1. 3–5 bullets (30-second answer)  
2. Diagram only if interviewer says "draw it"

### Template C — Revision night

1. Open saved `interview-prep/diagrams/*.md`  
2. Cover diagram with hand; recite bullets from memory  

---

## Skills to pair (no single "diagram skill")

| Skill | Role in format choice |
|-------|------------------------|
| **grill-with-docs** | Concrete scenarios → agent offers diagram per triggers |
| **zoom-out** | Before diagramming: "what level?" (system vs one job) |
| **canvas** | Optional: interactive revision deck (pipeline + expandable steps) |
| **caveman** | Diagram already saved; bullets-only cram |
| **prototype** (LOGIC branch) | Optional: terminal state machine play — only if diagram isn’t clicking |

**Install nothing required** for day-to-day prep — this file + `DIAGRAM_TRIGGERS.md` are enough.

**Optional install:** Notion plugin — embed exported PNG from mermaid.live.

---

## Agent behavior

When explaining a **flow, state, or topology** topic:

> *"This is order-of-operations — I'll use a sequence diagram + bullets per step. Skip diagram?"*

User: `bullets only` | `diagram only` | `both` (default)
