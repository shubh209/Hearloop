# Coverage #7 — Data & consistency

**Status:** draft — batch

## 30-second

- **Postgres (Neon)** via **Kysely** — typed SQL, no heavy ORM.
- **Entities:** Partner, api_keys, Session (`partner_id`), Recording, Analysis, webhook_deliveries, session_create_tokens.
- **Isolation:** every Session belongs to one Partner; auth never crosses tenants.
- **Consistency:** `completed` in DB before webhook must succeed; Partner delivery is **at-least-once** with retries.

**Glossary:** [`../../CONTEXT.md`](../../CONTEXT.md)
