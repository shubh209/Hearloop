# Hearloop — Networking & Outreach Guide

---

## Connection Request Note (300 chars)

```
Hey [Name], I built Hearloop — a voice feedback 
API that converts 5-second audio clips into 
structured business insights using Groq Whisper 
+ AWS Bedrock. Full stack on AWS (EC2/RDS/S3). 
Would love to connect!

Hi [Name], built Hearloop after noticing customers 
skip surveys but talk freely. So I made a 5-sec 
voice feedback API — businesses embed it, customers 
tap & speak, they get instant AI insights. Would 
love to connect!

Hi [Name], I built Hearloop after realizing 
customers hate filling forms but will happily 
talk for 5 seconds. Most feedback tools ask 
too much — Hearloop asks for nothing except a 
tap and a voice clip.

Built the full infrastructure: embeddable JS 
widget, async AI pipeline on AWS, Groq Whisper 
for transcription, Bedrock for classification. 
Would love to connect!
```

---

## What to Talk About

### For Tech Leads
- Multi-tenant API architecture with session state machine
- Async job pipeline — BullMQ, dedicated queues per job type
- Cost optimization — chose Nova Lite over Claude direct ($0.000066/call vs $0.00045)
- Why TypeScript monorepo over Python for this use case

### For Senior Engineers
- Solved cross-region Bedrock inference profile requirement
- Fixed Docker multi-stage build for ARM → AMD64 cross-compilation
- Debugged BullMQ shared queue race condition — workers completing jobs without executing handlers
- SSL chain issue with RDS in private VPC

### For Technical Recruiters
- Full production deployment on AWS (EC2, RDS, ElastiCache, S3, ECR)
- End-to-end system from browser MediaRecorder → S3 → AI pipeline → webhook
- Built and shipped in days not months

---

## After They Connect — The Approach

### Day 1 — Don't pitch immediately

Send this:

```
Hey [Name], thanks for connecting!

I've been building Hearloop — a voice feedback 
infrastructure product. Think Typeform but you 
tap a button and speak instead of filling forms. 
Businesses embed a JS widget, customers give 5-second 
voice feedback, and the business gets structured 
insights via webhook instantly.

Currently running on AWS with Groq + Bedrock for 
the AI layer. Happy to share the GitHub if you're 
curious about the architecture.
```

### Day 3-5 — If they respond

Share the GitHub link and one specific technical decision:

```
The trickiest part was the BullMQ shared queue 
race condition — workers were completing jobs 
without executing handlers. Fixed it by giving 
each job type a dedicated queue instead of 
filtering by job name on a shared queue.
```

### Day 7 — Ask a specific question

```
Working on adding a knowledge graph layer for 
relationship queries (location → staff → issue → 
time pattern). Would love your thoughts on 
Neo4j vs a graph extension on Postgres for 
this scale.
```

---

## What Makes This Stand Out

| What they see | Why it matters |
|---|---|
| End-to-end AWS deployment | Not just a tutorial project |
| Real debugging stories | Shows problem-solving ability |
| Cost optimization decisions | Shows engineering maturity |
| Product thinking | Not just a code monkey |
| Live URL | They can actually see it |

---

## Cold Email Templates

### For Tech Leads

```
Subject: Built a distributed voice feedback API — 
interesting architecture problem inside

Hi [Name],

I recently shipped Hearloop — a multi-tenant voice 
feedback infrastructure API. The interesting part 
wasn't the product, it was the engineering.

Ran into a nasty BullMQ bug where workers were 
completing jobs without executing handlers — turned 
out all workers shared one queue and the job.name 
filter was racing. Fixed it by giving each job type 
a dedicated queue.

Stack: TypeScript, Fastify, PostgreSQL on RDS, 
BullMQ on ElastiCache, Groq Whisper for STT, 
AWS Bedrock for classification. Full Docker 
deployment on EC2.

GitHub: [link]
Live: hearloop.vercel.app

Would love to hear your thoughts on the architecture 
if you have 5 minutes.

[Your name]
```

### For Senior Engineers

```
Subject: Chose Nova Lite over Claude for $0.000066/call 
— here's why

Hi [Name],

Building Hearloop — a voice feedback API that converts 
5-second audio into structured business insights.

Made an interesting cost decision: Amazon Nova Lite 
over Claude Haiku as the classifier. Same JSON 
classification task, 7x cheaper per call. At 100k 
sessions that's $6 vs $45.

The tradeoff — Nova Lite struggles with open-ended 
reasoning so I added Haiku as automatic fallback 
on parse errors.

Full pipeline: Browser MediaRecorder → S3 → 
Groq Whisper → BullMQ → Nova Lite → webhook.

GitHub: [link]

Curious what you would have done differently.

[Your name]
```

### For Technical Recruiters

```
Subject: Backend engineer — shipped a production 
AWS system worth looking at

Hi [Name],

I'm a backend engineer looking for new opportunities. 
Rather than send a resume cold, I wanted to share 
something I recently built.

Hearloop is a voice feedback infrastructure API — 
think Typeform but customers tap a button and speak 
instead of filling forms. Businesses embed a JS widget 
and receive structured insights via webhook.

What I built and deployed:
— Multi-tenant REST API (TypeScript, Fastify)
— Async job pipeline (BullMQ, ElastiCache Valkey)
— AI processing (Groq Whisper + AWS Bedrock)
— Full AWS deployment (EC2, RDS, S3, ECR)
— React/Next.js capture widget on Vercel

Live: hearloop.vercel.app
GitHub: [link]
Resume: [link]

Open to backend, full stack, or AI engineering 
roles. Would love 15 minutes if anything looks 
relevant to your current openings.

[Your name]
```

---

## Rules for All Cold Emails

**Subject line:** Specific > generic. "Built X with Y" beats "Experienced backend engineer."

**Length:** Under 150 words. Every line should earn its place.

**One ask only:** Don't ask for a job, a referral, AND feedback in the same email. Pick one.

**Never attach resume** in first email — link it only if relevant.

**Follow up once** after 5 days if no response:

```
Subject: Re: [original subject]

Hi [Name], just bumping this up in case it got 
buried. No worries if not the right time.

[Your name]
```

---

## Response Rate Boosters

| Do | Don't |
|---|---|
| Lead with a specific technical problem | Lead with "I'm looking for a job" |
| Name one concrete decision you made | List every technology you used |
| Ask a genuine technical question | Ask for a referral in email 1 |
| Keep it under 150 words | Write 5 paragraphs |
| Personalize first line per person | Send identical emails to everyone |

---

## Best Platforms in Order

1. **LinkedIn notes** — highest response rate for technical roles
2. **Email** — best for detailed outreach
3. **Twitter/X DMs** — good for open source maintainers and indie hackers

---

## Resume Bullet Points

### Backend / SDE
- Architected and deployed a production-grade multi-tenant REST API on AWS EC2 using TypeScript and Fastify, implementing a 9-state session state machine, BullMQ async job queue, and PostgreSQL on RDS — reducing audio-to-insight processing to a fully automated pipeline with zero manual intervention
- Engineered an end-to-end distributed system with HMAC-signed webhook delivery, exponential backoff retry logic, and dead-letter queue handling on ElastiCache Valkey, achieving at-least-once delivery guarantees across a containerized Docker deployment on AWS

### Fullstack
- Built and shipped a fullstack voice feedback platform from a React/Next.js capture widget with browser MediaRecorder API to a Fastify REST backend, deploying the frontend on Vercel and backend on AWS EC2 with RDS PostgreSQL and S3 audio storage — replacing form-based surveys with a 5-second voice capture flow

### AI Engineer
- Designed and implemented a multi-stage AI processing pipeline integrating Groq Whisper STT and AWS Bedrock (Nova Lite + Claude Haiku fallback), automatically converting raw voice recordings into structured business insights including sentiment scoring, topic classification from a fixed taxonomy, and urgency detection — delivered to partner systems via real-time webhooks with 7x cost optimization over direct API usage
