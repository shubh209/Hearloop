# When to offer a diagram (portable)

Agent should **suggest** a diagram (not auto-generate every time) when the topic is hard to hold in prose. User can say "skip" or "save it."

---

## Offer Mermaid in chat

| Moment | Diagram type | Example label |
|--------|----------------|---------------|
| First pipeline walkthrough | Sequence or flowchart | `finalize → validate → transcribe → analyze → webhook` |
| Session / job state explained | State diagram | `created → … → completed \| failed` |
| Multi-tenant / auth path | Sequence | Partner API key vs public token vs widget |
| Deployment / infra answer | C4-style or simple boxes | Browser → Vercel → EC2 → Neon/Upstash/S3 |
| Queue / async vs sync tradeoff | Two small diagrams side by side | Sync vs event-driven |
| Retry / webhook delivery | Sequence with alt paths | Success vs backoff vs dead-letter |
| Data flow (audio) | Flowchart | Mic → signed URL → S3 → worker → DB |
| Comparing alternatives you rejected | Simple comparison table **or** two mini flows | "Why not Lambda for workers" |

**Phrase to use:** *"Want a quick sequence diagram for this? Easier to recall in an interview."*

---

## Offer to save to repo

After the user agrees the explanation is right:

- *"I'll save this to `interview-prep/diagrams/<name>.md` for your next chat / Notion export."*

---

## Do **not** default to image generation

Use **GenerateImage** only when the user asks for an illustration (slide hero, icon), not for architecture accuracy.

---

## Revision mode

Before an interview, user can say: **"diagram pass"** — agent lists saved diagrams + offers one-liner verbal walkthrough per file.
