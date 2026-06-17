# Coverage #8 — Tradeoffs & hindsight

**Status:** draft — batch

## V2 — what I'd do differently

- Custom domain + **TLS on API** (vs long-term Vercel→HTTP proxy).
- **httpOnly cookies** for dashboard auth (vs localStorage API key).
- **Tenant quotas** on shared EC2 at scale.
- **CloudWatch-first** metrics (backlog items in CATCHUP).
- **RLS or dedicated DB** per enterprise tenant if selling to regulated buyers.

## Wouldn't change for portfolio

Presigned S3, async staged pipeline, Groq+Bedrock split, multi-tenant single deployment.
