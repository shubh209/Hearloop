# Hearloop

Voice micro-feedback platform — monorepo.

| App | Purpose |
|-----|---------|
| [`apps/web`](apps/web) | Hearloop dashboard & docs (Vercel) |
| [`apps/api`](apps/api) | API + workers (EC2) |
| [`apps/quicklube-demo`](apps/quicklube-demo) | Fictional partner site with embedded widget |
| [`packages/react`](packages/react) | `@hearloop/react` SDK |

**QuickLube demo (local):** see [`apps/quicklube-demo/README.md`](apps/quicklube-demo/README.md).

**Business context import (Crawl4AI):** design + implementation notes in [`context/BUSINESS_CONTEXT_SCRAPE_DESIGN.md`](context/BUSINESS_CONTEXT_SCRAPE_DESIGN.md).

**Local scraper sidecar:** `docker compose -f infra/docker-compose.scraper.yml up -d`

**Agent context:** [`AGENTS.md`](AGENTS.md) · [`context/PHASE1_PLATFORM.md`](context/PHASE1_PLATFORM.md)
