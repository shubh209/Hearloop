# Hearloop

Multi-tenant voice micro-feedback: an End user records a short response and a
Partner receives structured Insights through the dashboard, webhook delivery,
or an urgent alert email.

[![CI](https://github.com/shubh209/Hearloop/actions/workflows/docker-image.yml/badge.svg)](https://github.com/shubh209/Hearloop/actions/workflows/docker-image.yml)

## Workspaces

| Workspace | Purpose |
| --- | --- |
| `apps/api` | Fastify API and asynchronous Pipeline workers |
| `apps/web` | Hosted capture, Partner dashboard, and documentation |
| `apps/quicklube-demo` | Intentional sales/demo Partner site |
| `packages/react` | `@hearloop/react` capture SDK |

Database migrations live in `packages/db/migrations`.

## Local development

Install dependencies from the repository root:

```bash
npm install
```

Common checks:

```bash
npm run build --workspace=apps/api
npm test --workspace=apps/api
npm run build --workspace=apps/web
npm run build --workspace=apps/quicklube-demo
npm run build --workspace=packages/react
npm test --workspace=packages/react
```

Partners describe their business manually during onboarding or in settings;
the description is optional and is used as Partner-controlled analysis
context.

## Project guidance

- Agent operating contract: [`AGENTS.md`](AGENTS.md)
- Domain language: [`CONTEXT.md`](CONTEXT.md)
- Current work: [`context/BACKLOG.md`](context/BACKLOG.md)
- Architecture decisions: [`context/DECISIONS.md`](context/DECISIONS.md)
- Infrastructure and deployment: [`context/INFRA.md`](context/INFRA.md)
- Measurements: [`context/METRICS.md`](context/METRICS.md)
- QuickLube setup: [`apps/quicklube-demo/README.md`](apps/quicklube-demo/README.md)
