# Insights Query Design

## Goal

Keep Hearloop’s existing **Capture → Pipeline → Insights** spine. Add a later **Insights query** layer that returns **Cited answers** over **Sessions** in Postgres. Improve answer quality with **eval’d labels** and **citations**, not by training a model on a warehouse dump.

This spec is the product contract for that direction. It is not an implementation plan, PRD, BRD, or ticket list.

## Why

“Load all feedback into Databricks/Snowflake, train on lots of data, and chat over a knowledge graph” fails as a first project: it is undifferentiated, it duplicates the Pipeline, and more unlabeled text does not make answers true. Accuracy for this product is (1) Insights labels that match a published eval bar and (2) answers that point at Session ids. The Pipeline already produces the grain we need: one Session, one transcript, one Insights row.

## Non-goals (v1)

- Do not start from scratch. Do not replace the Pipeline with ELT into Snowflake or Databricks.
- Do not fine-tune on “lots of data” as the accuracy strategy.
- Do not use a knowledge graph as system of record.
- Do not answer unbounded questions (“what should we do,” strategy, competitors).
- Do not ingest every feedback type (stars, MCQ, yes/no, arbitrary forms).
- Do not tell the Partner what to do (no ticketing, no prescribed ops).
- Do not show Insights query to any Partner except the builder until the Partner-action + injection gate passes.
- Do not flip production `versioned-v1` unless separately authorized.
- Do not merge, deploy, or open GitHub Issues from this spec alone.



## Product

Hearloop remains a voice micro-feedback platform for an in-person service **Partner**. An **End user** captures after a visit. A **Session** runs the **Pipeline**. The Partner receives **Insights** (facts). Hearloop does not own the Partner’s operational response.

**Insights query** is a later read path: the Partner asks a bounded question; the system retrieves Sessions they own; the reply is counts, lists, and short quotes, each tied to Session ids (**Cited answer**). If evidence is missing or the question is unbounded, it refuses.

Warehouse, graph, and “company brain in weights” stay a north-star appendix, not a workstream.

## Accuracy (two tracks)


| Track             | Meaning of correct                                                                | Gate                                                                                                                                   |
| ----------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Labels**        | Sentiment, topics, urgency, flags match eval sets                                 | Publish `GOLDEN_SET` in `context/METRICS.md` now. Partner-action holdout + injection must pass before anyone else uses Insights query. |
| **Cited answers** | Claims match retrieved Session ids (wrong citation fails even if prose is fluent) | Starts after the Partner-facing label gate. Needs its own small question → expected Session ids set when that slice is planned.        |


Volume of Sessions helps retrieval and counts. It is not training data for a general business model.

## Evidence and store

- Cite **Hearloop Sessions only** until the label bar exists. After that, at most **one** import, same citation rule.
- **Postgres** is the system of record (Sessions, transcripts, Insights, Target).
- Snowflake/Databricks, if ever, are later read replicas — never what we train on in v1.



## Capture policy (third track, conditional)

Capture and Pipeline are **kept and improved**, not rebuilt.

- **Trustworthy voice (A):** in scope if audio can still be lost or swapped. Current repo: workers and deletes must honor pinned S3 VersionId; tests for that. Not a production traffic flip.
- **Easier capture (B):** only if completed Sessions are too few to query.
- **Short text (C):** same Session → Pipeline, skip transcription; only after the Insights eval bar.
- **Every modality (D):** out.



## Architecture

Three components:

1. **Capture + Pipeline** (exists) — validate → transcribe → analyze → webhook (+ expiry). Unchanged job.
2. **Label eval** (exists, finish the bar) — no Bedrock in unit tests.
3. **Insights query** (new, later) — parse bounded question → filter/retrieve that Partner’s Sessions → compose Cited answer. No write into Insights.

```
End user capture → Session (Postgres) → Pipeline → Insights
Partner question → retrieve those rows → Cited answer
                 → refuse if empty, too few hits, or unbounded
```

Cross-Partner retrieval is a security failure, not a quality miss.

## Build order (one in flight)

1. Publish `GOLDEN_SET` baseline in `context/METRICS.md`.
2. Close voice pinning integrity if still open (workers + exact delete/sweep + tests).
3. Partner-action + injection gate before Partner-facing Insights query.
4. Insights query v1 (Partner-only, counts/lists + quotes, citations, refuse).
5. Short text capture when 3–4 are real. Easier capture UX only if volume blocks 4.
6. Documents after this spec is accepted: PRD, then BRD, then tickets — one slice per step, not a megaticket.



## Later documents


| Doc     | Job                                                                               |
| ------- | --------------------------------------------------------------------------------- |
| PRD     | Partner-facing behavior, success metrics, out of scope                            |
| BRD     | Why citations + eval beat lakehouse training; cost; vendors we will not buy in v1 |
| Tickets | One independently shippable slice per build-order step                            |




## Assumptions

Class: **verified** (said or in repo), **default** (I filled a gap; challenge these), **unresolved** (must not drive implementation until you decide).

### Verified (you said, or the repo shows)

- Existing Pipeline is the spine; we do not start from scratch.
- Accuracy is cited Sessions **and** eval’d Insights labels, not fine-tuning on a lakehouse.
- Evidence is Hearloop Sessions, then at most one import.
- Postgres is system of record.
- v1 answers are counts/lists plus quotes, all cited; no “what should we do.”
- Label eval first; Insights query waits.
- Publish `GOLDEN_SET` now; Partner-action + injection before anyone else sees Q&A; live-shop human labels are not the gate.
- Capture: pinning if audio can swap; UX only if starved for Sessions; text after eval; not every modality.
- Facts only: Hearloop does not prescribe Partner ops.
- Design buyer in the conversation was an in-person service Partner; capture surfaces already exist (QR / hosted / widget).



### Defaults (I assumed — you can override)

- **Insights query UI lives in the Partner dashboard**, not Slack, email, or a public API, until a later spec.
- **Only completed Sessions** are citable (not failed/expired/in-flight).
- **Partner-action + injection “pass”** means the bar in `docs/superpowers/specs/2026-08-16-insights-partner-action-eval-design.md` (holdout Partner-action + all injection cases). This conversation did not re-pick the numeric threshold; it pointed at that design.
- `GOLDEN_SET` **publish** means one recorded run in `context/METRICS.md` (date, score, command). No production analyze change required for that publish.
- **Pinning “if still open”** is true today: backlog still lists workers/deletes not fully honoring VersionId on the unreleased line. This spec does not authorize merging that line to `main`.
- **Refuse** when zero hits or the question is not count/list/quote. “Too few hits” is not a fixed N yet (see unresolved).
- **One import later** is a file-shaped dump (e.g. CSV of reviews) mapped onto Session-like rows, not a live connector mesh.
- **North-star appendix** may mention warehouse/KG; it must not create tickets.
- **Business context** (existing Partner field) is enough “company context” for analyze until Insights query exists; we do not research a full decision-dimension model in v1.
- **End users never see Insights query.**
- **Urgent-alert email and webhooks stay Insights delivery**; they are not the Q&A channel.



### Unresolved (do not implement from these)

- Exact Partner-action / injection pass marks if you want different numbers than the 2026-08-16 eval spec.
- Minimum Session count before a Cited answer is allowed vs hard refuse.
- Whether Insights query may use **Target**, time range, sentiment, and topic as the only filters, or more (location as its own field vs Target, consumer identity — you asked for research; not done).
- Which single import, if any, after the label bar.
- Retrieval mechanism (SQL filters vs embeddings vs both).
- Who may use Insights query besides the Partner owner (staff roles).
- Whether pinning work happens on the existing feat/chore branches or a new branch.
- Production `versioned-v1` rollout.
- Champion Loop runner, production prompt changes, Bedrock spend caps.



## Appendix — parked north star (not a workstream)

Companies receive many feedback types; someday Hearloop might ingest more than voice/text and copy Sessions into a warehouse for analytics. That remains a paragraph, not the initial part. The grain stays the Session. The bot still cites or it does not answer.