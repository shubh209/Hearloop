# Hearloop

Voice micro-feedback platform: a **Partner** (business) embeds capture; an **End user** (customer) records short audio; Hearloop returns structured **Insights** via webhook.

## Language

**Partner**:
The business account that owns credentials, webhook URL, and session data. Not the person speaking feedback.
_Avoid_: Customer (ambiguous), tenant (ok in infra talk only)

**Partner dashboard session**:
The authenticated state after a Partner signs in with email and password. Used for dashboard and settings in the browser — not the Partner secret key.
_Avoid_: Session-create token, public token

**Partner secret key**:
Optional powerful credential (`sk-live_…`) for server-side Partner API calls (curl, Partner backend). Issued or rotated from Settings → API; not required for dashboard login. Must never appear in a public website or npm widget config.
_Avoid_: Widget embed key, password

**Business context**:
Plain-text description of what the Partner's business does, used when classifying feedback (e.g. services offered, typical visit). Improves topic and sentiment relevance; optional at signup, editable later.
_Avoid_: Prompt text (that's per-Session capture copy), webhook URL


**Business context import**:
Partner-initiated one-time website fetch that drafts `business_context` for review in onboarding/settings. Import pre-fills text only; Partner must click Save to persist it.
_Avoid_: Automatic scraping on every Session, page context

**Import source URL**:
The Partner-provided HTTPS site URL used for business-context import. Stored on `partners.website_url` for re-import and visibility in settings.
_Avoid_: Webhook URL, capture link

**Widget embed key**:
The browser-safe credential the Partner pastes into `@hearloop/react` on their site. Identifies which Partner receives new Sessions; can only start the capture flow, not read the dashboard or change Partner settings. Shown in dashboard **Settings → Embed** (not on the one-time signup screen).
_Avoid_: Partner secret key, public token (that's per-Session, not per-Partner)

**End user**:
The person who taps record and speaks. Has no Hearloop account.
_Avoid_: Customer, user (alone)

**Session**:
One feedback capture attempt with a lifecycle (`created` → … → `completed` | `failed` | `expired`). Identified internally by id; exposed publicly via a scoped **public token**.
_Avoid_: Recording (recording is the audio artifact row)

**Pipeline**:
The async job chain after finalize: validate → transcribe → analyze → webhook delivery. Runs out-of-band from the HTTP request.
_Avoid_: Workflow (generic)

**Insights**:
Structured output from analysis: transcript, sentiment, topics, urgency, flags — what the Partner receives.
_Avoid_: Result (too vague)

**Insights delivery**:
How a Partner receives completed Session output. **Dashboard** (Hearloop UI listing Sessions for that Partner) and **Webhook delivery** (HTTPS POST to Partner-configured URL) are separate channels; both may show the same Insights.
_Avoid_: Result (too vague)

**Recording**:
The audio artifact for a Session — stored in object storage; referenced from the database by key and metadata.
_Avoid_: Session (the recording is one part of a session)

**Public token**:
Opaque capability URL segment that scopes HTTP access to a single Session for capture (open, upload-url, finalize) without the Partner API key.
_Avoid_: API key, session id (internal UUID is separate)

**Session-create token**:
Short-lived credential used once to create a Session. May be minted from a Widget embed key (or, in legacy flows, from a Partner secret key). Keeps long-lived secrets out of repeated browser calls.
_Avoid_: Widget embed key (long-lived), JWT (not a general auth token)

**Webhook delivery**:
The act of POSTing completed Insights to the Partner's configured HTTPS endpoint, with signed proof of origin and retry history.
_Avoid_: Webhook URL (that's configuration, not delivery)

**Partner demo site**:
A standalone web app (not the Hearloop dashboard) that represents one Partner's customer-facing brand — e.g. an automotive service homepage with the widget embedded. Deployed on its own origin so the flow mirrors a real integration. **Phase 1:** simple one-page site with floating widget; **Phase 2:** post-visit focused page with inline widget.
_Avoid_: Capture page (that's Hearloop-hosted), dashboard (that's Partner admin UI)

**Embed settings**:
Dashboard area where a Partner configures **Allowed origins** and copies their **Widget embed key** for `@hearloop/react`. Separate from signup.
_Avoid_: API settings (secret keys), webhook settings (different concern)

**Capture surface**:
Where an End user reaches the recorder. Hearloop has two: the **primary** in-person surface (a **Capture link / QR** → Hosted capture, for service businesses) and the **secondary** online surface (the **Widget embed** on a Partner's website). Same Session lifecycle and Pipeline behind both.
_Avoid_: Channel (reserve for Insights delivery — dashboard vs webhook)

**Capture link / QR**:
A stable public URL (rendered as a QR code or sent by SMS) that opens the Hosted capture page for in-person feedback — printed on receipts, counter signage, or service-bay cards. May encode a **Target** (location/service). The primary capture surface.
_Avoid_: Widget embed (that's the online surface), public token (that's per-Session)

**Target**:
The thing a Session is feedback *about* — a location, service, product, or staff member (e.g. "North Ave — Oil Change"). Stored as a human `label` plus a normalized `key` for grouping. Sourced from a Capture link (in-person, built) or, in future, from page context detected by the Widget (online, designed). Sessions with no Target group under "Unattributed" on the dashboard's **By-Target** view.
_Avoid_: Product (too narrow — Hearloop generalizes beyond products), category (that's a topic of feedback, not its subject)

**Hosted capture**:
Hearloop-hosted page where an End user records using a **public token** URL. The recorder behind the **primary** in-person surface (reached via a Capture link / QR), and a fallback for online Partners who cannot embed the widget.
_Avoid_: Partner demo site, widget embed key

**Allowed origins**:
The list of website URLs where a Partner's Widget embed key may be used. Configured in Embed settings; requests from other origins are rejected.
_Avoid_: CORS (implementation detail), domain (too vague)
