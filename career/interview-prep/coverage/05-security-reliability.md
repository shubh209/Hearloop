# Coverage #5 — Security & reliability

**Status:** draft — batch

## 30-second

- **API keys:** `sk-live_` prefix, **SHA-256** hash at rest; widget uses **create-token**, not raw key in browser.
- **Webhooks:** **SSRF guard** (HTTPS only, block private/loopback/metadata IPs); **HMAC-SHA256** signature.
- **Rate limiting:** per API key prefix + IP on public routes; **429** at limit+1 (tested).
- **Input:** UUID validation on `:id` routes; validate job before paid APIs.
- **Scanning:** OWASP ZAP baseline **65 pass, 0 fail**; Docker prod **runtime CVEs 46→0**.
- **CORS:** per-Partner **allowed_origins** → **403** when Origin not listed.
