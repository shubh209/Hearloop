# Resume Bullet Playbook — Shubh's Style

> **Use this file** when asking any agent to rewrite Hearloop (or other project) bullets for **Full Stack**, **Backend**, or **AI Engineer** roles.
>
> **Gold examples (locked):** [`Hearloop-Context-Document.md`](../Hearloop-Context-Document.md) → sections *Locked Resume Bullets — Full Stack / Backend / AI Engineer Roles*.

---

## 1. What a good bullet is

Every bullet must pass **four parts** (Headless Headhunter formula):

| Part | Question | Bad | Good |
|------|----------|-----|------|
| **What** | Which JD keywords? | List tools only | 3–6 **common JD terms** (see §3) |
| **How** | What did you *do* with them? | "using React" | "embeddable capture flow and dashboard" |
| **Where** | Which surface of the product? | "AWS environment" | "capture flow", "server side processing", "production pipeline" |
| **Why** | Why should a **non-technical** person care? | "without polling the database" | "without reading survey exports, chasing voicemails, or guessing from star ratings" |

**Canonical shape:**

```
[PAST-TENSE VERB] [what you built] with [KEYWORD, KEYWORD, …] [how/where detail] [to help / so] [business audience] [plain English outcome].
```

**Reference bullet (Full Stack — the bar):**

> Built an embeddable voice feedback capture flow and dashboard with TypeScript, React, REST APIs, HTML, and CSS on AWS so businesses collect spoken customer feedback instead of forms most people refuse to finish.

---

## 2. Hard rules (non-negotiable)

### Voice and grammar
- **Past tense** opening verb: Built, Automated, Fine-tuned, Configured, Stress tested — never "Fine-tune" or present tense.
- Prefer **"to help [audience]…"** when the outcome is about people (owners, small local businesses); **"so [audience]…"** is fine when the clause is clearly business result (e.g. same-day fix ships).
- **No hyphens** inside the bullet text.
- Banned words: **leveraged**, **utilized**, **implemented**, **robust**.

### Keywords
- **3–6 keywords per bullet** — list them in brackets after drafting.
- Keywords must come from **job description language**, not niche library names.
- **No keyword repeats** across bullets **on the same project** in the same resume version.
- **SQL and PostgreSQL** — use **one**, not both.
- **AWS** may appear on more than one bullet only when the user explicitly allows it (e.g. Full Stack #1 + #3; AI set uses Bedrock/S3/EC2 across bullets).

### Do NOT put on the resume line
| Avoid as keywords | Say in interview instead |
|-------------------|-------------------------|
| BullMQ, Fastify, Groq, Kysely | Job queues, Node.js back end, speech-to-text vendor |
| job queues, speech-to-text, AI classification (alone) | Too vague for ATS; use Node.js, SQL, ML, LLMs |
| partner | dashboard, each business, business owners |
| multi-tenant REST API | server side processing that stores feedback **for each business** |
| polling, database exports, inference | plain outcomes (see §4) |

### Metrics
- **[MEASURED]** only if the developer will defend it in an interview under **their exact test conditions**.
- If a number depends on narrow conditions (e.g. per-session LLM cost), **drop the number** and keep qualitative outcome.
- **[ESTIMATE]** for business lift (form abandonment, retention) — OK with label, not on resume line unless user wants it.
- **[UNKNOWN]** — never on a bullet.

### Business and audience (Hearloop)
- **Generic business** — no oil changes, auto shops, or industry-specific examples unless user asks.
- **Primary buyer:** business owners / managers at **small local businesses** (especially AI bullets).
- **End speaker:** customers who refuse forms but will speak briefly.
- **Core pain:** survey exports, voicemails, star-rating guesswork, vague AI summaries, days of lost feedback when systems break.
- **Do not claim** production customer counts if none exist.

### Scope per role
- **2–3 bullets max** per project per resume version.
- **Separate keyword pools** per role — do not copy the same three bullets across Full Stack, Backend, and AI resumes.

---

## 3. Keyword pools by role

### Full Stack SWE (recruiter baseline)
TypeScript, JavaScript, HTML, CSS, React, Node.js, REST API, SQL, AWS, Docker, Git, CI/CD, DevOps, Agile

**Hearloop locked split:** Bullet 1 = frontend stack; Bullet 2 = back end data; Bullet 3 = DevOps.

### Backend SWE
Node.js, JavaScript, REST API, SQL, Redis, AWS, Docker, Git, CI/CD, DevOps, load testing

**Hearloop locked split:** B1 = API + storage; B2 = service releases (not "back end releases"); B3 = load testing + measured concurrency.

### AI Engineer (user's JD list — only if true in repo)
ML, LLMs, LLM, cloud, AWS, AWS Bedrock, AWS S3, AWS EC2, production systems, AI orchestration, AI architecture, MLOps, SQL, Git

**Do not claim for Hearloop:** RAG, LangChain, LangGraph, agentic systems, NumPy, Google ADK (unless actually added).

**Interview-only for Hearloop AI:** Groq Whisper, Nova Lite / Haiku fallback, business context = prompt injection not RAG, solo build with Cursor/AI tools.

---

## 4. Why endings that work (Hearloop)

Use **manual work removed** or **capability gained** — never engineer-only consequences.

| Weak (technical Why) | Strong (business Why) |
|---------------------|------------------------|
| without polling for completed sessions | without reading survey exports, chasing voicemails, or guessing from star ratings |
| without manual database exports | managers see what customers said in one place |
| sixty seconds instead of fifteen minutes | keep collecting complaints the **same day a fix ships** instead of **losing days of feedback** |
| 149ms p95 latency | customers don't abandon a **slow or frozen capture flow** during rush hours |
| three hundredths of a cent per session | small local businesses get insights **without hiring engineers** to build AI integrations they cannot afford |
| generic visit summaries | vague summaries **leaders cannot use to improve** retention strategy |

---

## 5. Journey lessons (before → after)

### Jargon → plain English
- ❌ Designed a multi-tenant REST API… without polling  
- ✅ Built server side voice processing with Node.js, REST API, SQL, Redis, and AWS **to store** analyzed feedback for each business so managers see what customers said without…

### Niche libs → JD keywords
- ❌ BullMQ, Groq, Fastify on the bullet  
- ✅ Node.js, SQL, Redis, load testing + vendor names in interview

### Industry-specific → generic
- ❌ oil change wait time, automotive rush hour  
- ✅ rush hours, small local businesses, retention strategy

### AI bullets
- ❌ Reduced LLM cost to $0.00003/session (hard to defend)  
- ✅ Fine-tuned LLM inference… **to help small local businesses** turn customer voice into usable insights…
- ❌ Added prompt context / tuned Bedrock  
- ✅ **Configured company knowledge base** for AWS Bedrock LLM classification… inform **retention strategy**

### DevOps bullets
- ❌ Automated back end releases… sixty seconds vs fifteen minutes (metric-only Why)  
- ✅ Automated **service releases** with Docker, Git, CI/CD, and DevOps… **same day a server fix ships** instead of **losing days of feedback**

### Load / scale bullets
- ❌ Stress tested the API…  
- ✅ Stress tested **the business logic** with JavaScript, SQL, AWS, and **load testing** for 200 concurrent users at 149ms…

---

## 6. Agent workflow (follow in order)

### Step 1 — Scan codebase (do not ask user to paste notes)
Extract: stack, features, measured metrics, what was **not** built, solo vs team.

### Step 2 — Confirm with user (one category at a time if greenfield)
- Business audience and pain  
- Solo ownership and decisions  
- Non-technical impact  
- Which metrics are measured vs estimate vs unknown  
- Tradeoffs and deliberate omissions  

### Step 3 — Draft 2–3 bullets per role
For each bullet output:
```
Bullet: [text]
Keywords: [k1, k2, …]
Metric type: [MEASURED | ESTIMATE]
Business outcome: [one plain English sentence]
Four-part check: What / How / Where / Why — pass or fix
```

### Step 4 — Iterate with user
- One bullet at a time if needed.  
- **Do not lock** until user says lock.  
- Apply edits verbatim when user gives exact phrasing (e.g. "to store", "service releases", "Configured company knowledge base").

### Step 5 — Lock
Append to `Hearloop-Context-Document.md` under the correct role section.

### Step 6 — Self-critique
1. Any technical word in the business outcome? → rewrite  
2. Fewer than 3 or more than 6 keywords? → rewrite  
3. Any hyphen in the bullet? → rewrite  
4. Any [UNKNOWN] metric on the line? → remove  
5. Ends without plain English Why? → rewrite  
6. Would a non-technical hiring manager understand the Why without follow-up? → rewrite  

---

## 7. Copy-paste prompt for other agents

```
You are rewriting resume bullets for the Hearloop project. Read and follow:
- interview-prep/resume-bullet-playbook.md (all rules)
- Hearloop-Context-Document.md (locked examples — match tone and structure)

Role: [Full Stack | Backend | AI Engineer]
Task: [Draft new bullets | Rewrite bullet X | Lock set after approval]

Rules summary:
- Past tense; What + How + Where + Why; 3–6 JD keywords per bullet; no repeats within this project on this resume.
- Why = plain English for business owners / small local businesses — no polling, exports, or jargon endings.
- No BullMQ/Groq/Fastify on the line; no industry-specific examples; no "partner".
- Only [MEASURED] metrics the developer will defend; no hard-to-explain cost numbers.
- Generic business language; AI audience includes small local businesses without engineering teams.

Do not lock until I approve. Show four-part check for each bullet.
```

---

## 8. Locked Hearloop bullets (quick reference)

### Full Stack
1. Capture flow + dashboard — TypeScript, React, REST API, HTML, CSS, AWS  
2. Async back end — Node.js, JavaScript, SQL, Redis  
3. DevOps deploy — DevOps, Docker, Git, CI/CD, AWS  

### Backend
1. Server side storage — Node.js, REST API, SQL, Redis, AWS  
2. Service releases — Docker, Git, CI/CD, DevOps  
3. Load testing — JavaScript, SQL, AWS, load testing  

### AI Engineer
1. Production pipeline — ML, LLMs, AWS Bedrock, SQL, AI orchestration, production systems  
2. LLM access for locals — LLM, AWS Bedrock, MLOps, AWS EC2, cloud, production systems  
3. Knowledge base — AWS Bedrock, LLM, SQL, AI architecture, AWS S3  

---

*Last updated from bullet-rewriting session — Hearloop, June 2026.*
