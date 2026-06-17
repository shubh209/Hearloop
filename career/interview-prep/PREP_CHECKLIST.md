# Interview prep coverage checklist (portable)

Agent runs this on **"coverage check"** (user or proactive every few locked sections). Mark in project `context/INTERVIEW_PREP.md` session log — not every item needs a novel; some are "N/A for this project."

---

## 1. Pitch & problem (2 min)

- [ ] One-sentence product
- [ ] Who pays vs who uses (B2B2C clarity)
- [ ] Pain / metric (e.g. survey completion &lt;5%)

---

## 2. Architecture decisions (core)

- [ ] Why this topology (not "serverless" hand-wave — accurate labels)
- [ ] Sync vs async / event-driven
- [ ] STT choice
- [ ] LLM / analysis choice
- [ ] Storage pattern (e.g. signed URLs, not proxy)
- [ ] Queue / worker model
- [ ] Multi-tenancy & isolation
- [ ] Auth model (API keys, tokens, scopes)

---

## 3. End-to-end flows (must diagram)

- [ ] Happy path: record → upload → finalize → pipeline → webhook
- [ ] Session state machine
- [ ] Failure path (one job fails; session `failed`)
- [ ] Idempotency / double-submit (if applicable)

---

## 4. Scale, performance, cost

- [ ] Load test story (VUs, p95, error rate)
- [ ] Bottlenecks you'd name under pressure
- [ ] Monthly cost ballpark + what drives it
- [ ] Free-tier / quota pitfalls (Redis, Bedrock, etc.)

---

## 5. Security & reliability

- [ ] AuthZ mistakes prevented
- [ ] SSRF / webhook safety (if webhooks)
- [ ] Rate limiting
- [ ] Input validation (audio MIME, size)
- [ ] Security scan story (ZAP, CVE reduction) if claimed on resume
- [ ] Secrets & env handling

---

## 6. Observability & ops

- [ ] Logging / structured logs
- [ ] Health checks / uptime monitors
- [ ] Deploy pipeline (CI/CD one-liner)
- [ ] What you'd alert on in production

---

## 7. Data & consistency

- [ ] Main entities (session, partner, …) — glossary in `CONTEXT.md`
- [ ] DB choice & why not ORM (if relevant)
- [ ] Migrations / schema evolution one-liner

---

## 8. Tradeoffs & hindsight

- [ ] Biggest technical risk you took
- [ ] What you'd do differently (V2 backlog item)
- [ ] What you explicitly did **not** build

---

## 9. Mock interview bank

- [ ] "Walk me through the pipeline"
- [ ] "Why async?"
- [ ] "How does multi-tenancy work?"
- [ ] "Hardest bug / incident"
- [ ] "How did you test at scale?"
- [ ] Depth follow-ups per decision (2–3 each)

---

## 10. Behavioral bridge

- [ ] One STAR story tied to this project (conflict, deadline, tradeoff)
- [ ] Team vs solo honesty

---

## Agent output format for "coverage check"

```markdown
## Coverage — [Project] — [date]

**Strong:** (locked sections)
**Gaps:** (checklist items missing — priority order)
**Suggest next:** (one grill topic OR one diagram)
**Skill:** (optional: "/grill-with-docs on X" or "diagram: pipeline")
```

User picks the next item; agent does not auto-start five topics.
