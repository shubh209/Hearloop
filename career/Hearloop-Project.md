# Hearloop

## Tagline

Voice feedback for service businesses. A customer scans a QR code (or taps a link or on-site widget), speaks for a few seconds instead of filling out a form, and leaves. Owners see analyzed feedback per location or product on a dashboard.

## Tech Stack (Languages / Frameworks / Infrastructure / Tools)

Languages: TypeScript (primary), JavaScript, SQL, HTML, CSS

Frameworks and libraries: Node.js 20, Fastify 5, Next.js 15 App Router, React 19, Kysely, BullMQ, MediaRecorder API

Infrastructure: AWS EC2, S3, ECR, CloudWatch; Neon PostgreSQL 16; Upstash Redis; Vercel

Tools: Docker, GitHub Actions, Caddy, k6, OWASP ZAP, Pino, Turborepo, npm workspaces, Groq Whisper, AWS Bedrock (Nova Lite primary, Claude Haiku fallback)

## Problem

Many businesses still collect feedback with thumbs up/down, multiple choice, or a short text box with a character limit. Most customers skip it. They will not stop in a parking lot to type paragraphs or click through a survey.

Without that signal, owners fall back on spreadsheet exports, voicemails, or star ratings on review sites. Problems show up in public reviews before anyone inside the business hears about them. Staff also do not have time to listen to every recording or read every export line by line.

## Solution

Hearloop replaces the form with a short voice clip. There are two capture surfaces for one product. The **primary** surface is in-person: a QR code or SMS link opens a hosted capture page — printed on a receipt or counter sign so feedback happens where the service does (lead vertical: quick-service automotive). The **secondary** surface is an embeddable website widget for online businesses whose customers are already on the page. Either way the customer taps, speaks, and leaves. The system uploads audio to S3, transcribes it, runs classification, and stores results the owner can read on a dashboard. Optional webhooks push structured JSON to tools the business already uses.

Built for service businesses that need feedback without hiring engineers to wire up speech or AI themselves. The website widget targets online businesses; the QR/link surface targets the in-person service businesses where most customer-service moments actually happen.

## My Role

Solo builder. I wrote the product from scratch with AI coding tools as assistants. Every stack choice was mine, mainly around cost, latency, scale, and uptime.

Product and API: session state machine (created through completed or failed), REST routes for capture and dashboard, public token flow for browser embeds, `GET/PATCH /partners/me` settings.

Backend: Fastify API, PostgreSQL schema (six migrations), five background jobs (validate, transcribe, analyze, webhook, expire), Groq transcription, Bedrock classification with fallback, signed webhooks with retry logic and SSRF checks.

Frontend and SDK: Next.js landing, login, onboarding, dashboard, docs, hosted capture; embeddable `widget.js`; `@hearloop/react` (72 tests, 5.6 KB gzipped ESM); QuickLube demo site as a reference embed.

Infra: Docker image to ECR to EC2, GitHub Actions with a validate step before deploy, moved Postgres and Redis off RDS/ElastiCache to Neon and Upstash, k6 load and soak tests, OWASP ZAP baseline scan.

Not built on purpose: billing, native mobile app, multi language UI. If I started again I would narrow scope to one slice of the problem instead of the full stack at once.

## Features (current)

Capture (two surfaces): QR code / link → hosted capture page (primary, in-person) and embeddable website widget / `@hearloop/react` with `embedKey` (secondary, online). MediaRecorder in the browser, signed direct upload to S3 on both.

Auth and keys: email login with httpOnly session cookie; public embed keys (`pk-live_`) for the widget; secret keys (`sk-live_`) optional in settings; origin allowlist before embed works; ten minute single use session create tokens.

Dashboard: session stats, onboarding for business context, embed and API settings panels, secret key regeneration, thirty second auto refresh on session list.

Pipeline: validate recording, Groq transcription, Bedrock classification with optional company context in the prompt, HMAC signed webhook delivery with retries, session expiry cleanup.

Safety and ops: rate limits, UUID checks on route params, webhook URL blocks private and metadata IPs, structured Pino logs, CloudWatch hooks for Bedrock calls, health checks for DB, Redis, and queues.

## Locked resume bullets

Use one set per resume version. Each bullet is past tense, ends with a plain business outcome, and avoids repeating keywords within that set. Full rules: `interview-prep/resume-bullet-playbook.md`.

### Full stack (3 bullets)

1. Built an embeddable voice feedback capture flow and dashboard with TypeScript, React, REST APIs, HTML, and CSS on AWS so businesses collect spoken customer feedback instead of forms most people refuse to finish.

2. Built an async back end with Node.js, JavaScript, SQL, and Redis that processes voice feedback into stored analysis so businesses understand customer complaints without reading survey exports, chasing voicemails, or guessing from star ratings.

3. Automated DevOps deployments with Docker, Git, CI/CD, and AWS through GitHub Actions to ECR and EC2 so businesses keep collecting customer complaints the same day a fix ships instead of losing days of feedback to slow manual deploys.

### Backend (3 bullets)

1. Built server side voice processing with Node.js, REST API, SQL, Redis, and AWS to store analyzed feedback for each business so managers see what customers said without reading survey exports, chasing voicemails, or guessing from star ratings.

2. Automated service releases with Docker, Git, CI/CD, and DevOps through GitHub Actions so businesses keep collecting customer complaints the same day a server fix ships instead of losing days of feedback to manual deploys.

3. Stress tested the business logic with JavaScript, SQL, AWS, and load testing for 200 concurrent users at 149ms response time so businesses collect spoken feedback during rush hours without customers abandoning a slow or frozen capture flow.

### AI engineer (3 bullets)

1. Built a production voice to insight pipeline with ML, LLMs, AWS Bedrock, and SQL using AI orchestration from speech input to labeled feedback to help business owners understand their customers better without manually reading every transcript line by line.

2. Fine-tuned LLM inference on AWS Bedrock with MLOps token controls on AWS EC2 cloud production systems to help small local businesses turn customer voice into usable insights without hiring engineers to build AI integrations they cannot afford.

3. Configured company knowledge base for AWS Bedrock LLM classification with SQL and AI architecture using voice inputs stored on AWS S3 so business owners understand their customers and inform retention strategy from analyzed feedback instead of vague summaries they cannot act on.

Interview detail for AI bullets (not on the resume line): Groq Whisper for speech to text; Nova Lite primary with Haiku on parse failure; company context is prompt text, not RAG.

## Verified metrics

Measured in this project (safe to defend in interviews if you describe the test setup):

AWS monthly cost: $35 to $9.60 after Neon and Upstash migration
Deploy time: about fifteen minutes manual to about sixty seconds via GitHub Actions
Load test: 200 concurrent users, 149ms p95, zero errors (k6)
Soak test: 20 users for ten minutes, 116ms p95 flat (k6)
Rate limit tests: nine of nine passing
Docker runtime CVEs in prod image: forty six to zero
OWASP ZAP baseline: sixty five of sixty five checks passed
React SDK: seventy two tests passing, 5.6 KB gzipped ESM bundle

Estimates only (product potential, not live customer proof):

Higher capture than form surveys; staff time saved on manual review; AI cost at volume for small operators

Unknown (do not put on resume):

Production partner count, live session volume, webhook delivery success rate at scale

## How It Works

The business configures a webhook URL in the dashboard and gets a capture surface: a QR code / link to the hosted capture page for in-person use (primary), or a website widget gated by allowed embed origins for online use (secondary). The browser opens a session (the widget path trades a public embed key for a short lived token first), records audio, uploads to S3 with a signed URL, and calls finalize. The customer is done. Workers on EC2 pick up the job: check the file, transcribe with Groq, classify with Bedrock (Haiku if JSON parse fails), save to Postgres, mark complete, POST signed JSON to the webhook if configured. The dashboard reads stats over authenticated REST. The Next.js app on Vercel proxies HTTPS to EC2 so the browser does not hit mixed content errors.

Tradeoffs worth knowing:

Finalize is async so capture stays fast; results arrive via webhook or dashboard, not in the same HTTP response.
Audio goes straight to S3 so the small EC2 box does not proxy bytes; that adds an extra round trip.
Nova Lite keeps classification cheap; edge transcripts lean on a Haiku fallback.
Neon and Upstash cut spend but add cold start and Redis quota tuning (BullMQ drain delay, short lived queue connections).
Embed keys can sit in the page; secret keys stay server side via httpOnly cookies on the dashboard.
API and workers share one EC2 instance for now. Fine for demo scale; would split at higher load.

Repo layout: `apps/api` (API and workers), `apps/web` (dashboard and docs), `packages/react` (SDK), `packages/db/migrations`, `testing/load-performance` (k6), `apps/quicklube-demo` (sample embed).

## Keywords

Full stack: TypeScript, JavaScript, HTML, CSS, React, Node.js, REST API, SQL, AWS, Docker, Git, CI/CD, DevOps

Backend: Node.js, JavaScript, REST API, SQL, Redis, AWS, Docker, Git, CI/CD, DevOps, load testing

AI engineer: ML, LLMs, LLM, AWS Bedrock, AWS S3, AWS EC2, cloud, production systems, AI orchestration, AI architecture, MLOps, SQL

Project terms for interviews: Fastify, BullMQ, Groq, Neon, Upstash, webhooks, HMAC, k6, Vercel, sentiment analysis, embeddable widget

## Related docs

Locked bullets and interview context: `Hearloop-Context-Document.md`
Bullet writing rules: `interview-prep/resume-bullet-playbook.md`
Measured numbers log: `context/METRICS.md`
