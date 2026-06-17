# Crawl4AI HTTP-only spike — results (Jun 17, 2026)

> Tracer bullet 1 from `context/BUSINESS_CONTEXT_SCRAPE_DESIGN.md`
> Re-run: `source /tmp/hearloop-spike-venv/bin/activate && python testing/spike/crawl4ai-http-spike.py`

## Verdict

**Go for v1 with HTTP-only Crawl4AI.** National quick-service automotive homepages crawl cleanly
without Playwright. No EC2 resize needed for HTTP mode.

| Criterion | Target | Result |
|---|---|---|
| Import success rate (5 URLs) | >80% | **100%** (5/5) |
| p95 latency | <15s | **572ms** (local); **358ms** (EC2 Docker, 1 URL) |
| OOM on t3.micro | 0 | **0** — single crawl ran in `python:3.11-slim` with `--memory=512m` |
| Markdown usable for Bedrock | qualitative | **Yes** — titles + 6–41K chars; truncate to ~8K before summarize |

## URLs tested

| URL | Latency | Markdown | Title | Signals* |
|---|---|---|---|---|
| jiffylube.com | 646ms | 16,848 | Quick Oil Changes, Tires & More \| Jiffy Lube | 122 |
| vioc.com | 370ms | 6,863 | Automotive Maintenance Services - Valvoline… | 58 |
| midas.com | 363ms | 26,672 | Midas Is the Best \| Auto Repair & Service… | 408 |
| meineke.com | 459ms | 8,462 | Auto Repair, Car Mechanics & Maintenance… | 41 |
| pepboys.com | 572ms | 41,659 | Tire Shop, Auto Repair, Service… \| Pep Boys | 327 |

\*Heuristic: count of automotive keywords in title+markdown (oil, tire, brake, service, etc.)

Raw JSON: `crawl4ai-http-spike-results.json`

## EC2 notes

- Host Python **3.9** — below Crawl4AI's 3.10+ requirement. Sidecar must be **Docker** (`python:3.11-slim` or pre-baked image).
- Ephemeral `docker run … pip install crawl4ai` took ~60s first time (install only). Production sidecar should **pre-bake** deps in image; steady-state crawl ~350ms.
- Do **not** use full `unclecode/crawl4ai:latest` for v1 if we only need HTTP — image includes browser stack. Prefer slim custom image with `AsyncHTTPCrawlerStrategy` only.

## Implementation implications

1. Sidecar image: `python:3.11-slim` + `crawl4ai` + thin FastAPI wrapper (`POST /crawl`, `mode: http`).
2. Truncate markdown to **8,000 chars** before Bedrock summarize (pepboys/midas are 26–41K).
3. Strip nav boilerplate optional post-v1; current markdown is noisy but Bedrock can summarize.
4. HTTPS-only + SSRF guard still required before any prod URL fetch.

## Not tested (out of v1 scope)

- JS-only SPAs (empty HTTP shell)
- Local mom-and-pop shop sites (no website, Facebook-only)
- Browser/Playwright mode

## Next step

Tracer bullet 2: `lib/assert-public-https-url.ts` + unit tests.
