# Coverage #1 — Pitch & problem

**Status:** locked · **Notion:** yes

## 30-second

Hearloop is **voice micro-feedback for businesses** with in-person customers.

**Problem:** Traditional surveys see **under ~5% completion** — people won't stop and type after a service visit.

**Solution:** The customer **taps once, speaks ~5 seconds**, done. The **Partner** (business) gets structured JSON on a **webhook** — transcript, sentiment, topics, urgency.

**Platform:** Multi-tenant B2B — embeddable widget or hosted capture, async backend, Partner dashboard.

## 2-minute (beats)

1. **Problem (~25s):** In automotive, healthcare, hospitality, retail — in-person — surveys get single-digit completion. You lose signal on wait time, staff, cleanliness, booking friction.
2. **Who (~15s):** **Partners** = businesses (API key, webhook). **End users** = their customers (no account). B2B2C.
3. **Solution (~25s):** ~5 seconds of voice; widget or hosted capture; tap → speak → done.
4. **What Partner gets (~25s):** S3 → async pipeline (validate → Groq STT → Bedrock → HMAC webhook) → structured insights.
5. **Why built this way (~20s):** Multi-tenant; hybrid infra ~$9.60/mo; k6 + OWASP ZAP.
6. **Close (~10s):** Higher completion than surveys, lower friction, actionable JSON.
