# The Feedback-Layer Landscape

**Research date:** August 13, 2026  
**Question:** What has already been implemented around an “entire feedback layer” that can capture, ingest, normalize, analyze, route, and close the loop on feedback for any business—and what coherent part could Hearloop still build?

## Executive conclusion

Almost every individual capability in an “entire feedback layer” is already implemented, and several enterprise products implement nearly the whole loop. Qualtrics, Medallia, and InMoment collect feedback and behavioral signals across channels, associate them with customer or account context, analyze unstructured feedback, trigger workflows or cases, enforce enterprise governance, and report on action. Chattermill, Enterpret, unitQ, Dovetail Channels, Pendo Listen, Productboard, and Canny already ingest feedback from other systems, apply AI taxonomies, and route findings into product or operational work. Birdeye, Reputation, and Podium do the same for local-business reviews, messages, surveys, and reputation workflows. Formbricks, SurveyJS, PostHog Surveys, and browser/mobile SDKs cover much of the open-source capture layer.

Therefore, **“all feedback in one place, analyzed by AI” is a saturated proposition**, not a differentiation. The phrase also hides three materially different products: a capture library, a feedback system of record, and a feedback data plane. Vendors have fully realized the first, enterprise and function-specific vendors have substantially realized the second, and several vendors approximate the third. What is not clearly available is a widely adopted, open, developer-first, feedback-specific data plane with a portable event contract, idempotent ingestion, explicit identity/context semantics, pluggable processing, policy controls, and reliable activation—analogous to Segment or RudderStack, but for qualitative feedback rather than behavioral analytics.

That gap is narrower than “feedback for every business,” and it is not proof of demand. Hearloop should not clone an enterprise VoC suite, survey builder, roadmap product, help desk, or reputation-management platform. The smallest coherent hypothesis is an **open feedback event gateway**: accept feedback from an SDK, QR flow, API, and a very small number of adapters; preserve source, subject, identity, context, consent, and raw evidence; normalize it into a documented `FeedbackEvent`; optionally transcribe/analyze it; then deliver it reliably into systems the adopter already uses. Voice becomes one supported payload type and a useful reference capability—not the category.

## Method and limits

This review uses primary sources only: official product and documentation pages, official API/security pages, official GitHub repositories and licenses, and first-party case studies. It intentionally excludes SEO comparison pages, review-site rankings, and unsourced market-size estimates. Vendor capability claims establish what is offered, not adoption quality or independent proof of business impact. “Not found” means a capability was not verified in the official sources reviewed; it does not prove that a private enterprise feature does not exist.

Products change frequently. The matrix describes verified capabilities as of the research date, not permanent limits.

## First define “an entire feedback layer”

### Scope 1 — Capture library

> Components and SDKs that let a business ask for and receive feedback through web, mobile, links, email, QR, rating, text, file, audio, video, or in-product prompts.

This layer owns rendering, targeting, input UX, accessibility, client-side identity/context, consent prompts, and submission. It generally stops after creating a response.

**Already realized:** Typeform, SurveyMonkey, Survicate, Sprig, Usersnap, Userback, Qualtrics, Medallia Digital, Formbricks, PostHog Surveys, and SurveyJS cover most variants. Voiceform, Qualtrics, InMoment, and specialized products already support rich-media responses. An open recorder or new survey widget is not a market gap.

### Scope 2 — Feedback system of record

> A durable application where normalized feedback items live, connect to a person/account/product/location, accumulate themes and evidence, move through a workflow, and retain an auditable outcome.

The canonical object may be a survey response, customer interaction, product request, insight, support conversation, review, case, or research data point. The object model determines who the product serves.

**Already substantially realized:** Qualtrics, Medallia, and InMoment do this for enterprise experience programs; Canny, Productboard, and Pendo Listen do it for product feedback; Intercom and Zendesk do it for support conversations and tickets; Birdeye, Reputation, and Podium do it for local-business reputation and messaging. There is no single universal model because “resolve a complaint,” “prioritize a feature,” “answer a support ticket,” and “synthesize research” are different jobs.

### Scope 3 — Feedback data plane

> Source-agnostic infrastructure that receives feedback from many systems, validates and normalizes it, resolves identity and context, enriches it, enforces policy, and activates it into downstream systems without requiring the data plane to become the team’s main working application.

This is analogous to customer-data infrastructure: sources, schemas/contracts, transformations, identity, policy, destinations, observability, replay, and delivery guarantees. [Hightouch Events](https://hightouch.com/docs/events/overview) explicitly receives behavioral events from SDKs/APIs, validates them against contracts, gives them a consistent shape, and delivers them to a warehouse or downstream tool. [RudderStack](https://www.rudderstack.com/docs/) similarly documents sources, a standard event spec, transformations, profiles, destinations, tracking plans, consent management, and monitoring. These are infrastructure analogies, not direct feedback products.

**Already approximated:** Chattermill, Enterpret, unitQ, and Dovetail Channels ingest many feedback sources and normalize them enough for taxonomy and analysis. Medallia and Qualtrics go further into identity, governance, and action. But these products are primarily closed analysis/experience applications, not an open feedback transport standard or provider-neutral data plane. That is the most plausible whitespace, but it is also a demanding infrastructure product whose demand must be proven.

## Capability legend

- **●** strong, native capability verified
- **◐** partial, adjacent, plan-specific, or focused on one workflow
- **○** not a core capability or not found in reviewed official sources
- **?** insufficient public evidence

“Closed loop” means a first-class status/action/outcome loop, not merely sending a notification. “Governance” includes verified retention, deletion, consent, access control, audit, or data-residency capabilities; it does not imply every compliance requirement is met.

## Capability matrix

| Product / category | Native capture | External ingestion | Canonical item | Identity + context | AI themes / sentiment | Dedup / merge | Routing / work | Closed-loop outcome | API / webhook / export | Governance / deploy control |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **Qualtrics** — enterprise XM | ● | ● | ● response / interaction | ● directory, contact, transaction | ● | ◐ contact merge | ● workflows + tickets | ● ticket status/escalation | ● | ● SaaS governance; no self-host |
| **Medallia** — enterprise VoC | ● | ● | ● signal / response | ● profiles, units, accounts | ● | ◐ | ● alerts + cases | ● smart closed loop | ● | ● SaaS governance; no self-host |
| **InMoment** — enterprise XI | ● | ● | ● experience signal / case | ● segmentation + operational context | ● | ◐ data cleansing | ● workflows + cases | ● resolution + action plans | ● API + SDK | ● SaaS governance; no self-host |
| **Typeform / SurveyMonkey / Delighted / Survicate** — survey SaaS | ● | ◐ | ● survey response | ◐ hidden/custom/contact fields | ◐ varies by plan | ○ | ◐ integrations/alerts | ○/◐ follow-up, not case system | ● | ◐ SaaS controls |
| **Voiceform** — voice/video research | ● | ◐ | ● response / interview | ◐ metadata | ● transcript, topics, sentiment | ○ | ◐ integrations | ○ | ● | ◐ SaaS controls |
| **Canny** — product feedback | ● portal/board | ● conversations, reviews, API | ● request/post + votes | ● user, account, revenue | ● extraction, themes, urgency | ● semantic duplicate merge | ● ownership + dev integrations | ● status updates to requesters | ● | ◐ SaaS controls |
| **Productboard** — product insights | ● forms/portal | ● support, calls, reviews, API | ● feedback note / insight | ● customer + source metadata | ● themes, sentiment, Pulse | ◐ theme/insight consolidation | ● owners, triage, Jira | ● portal card updates | ● API 2.0 | ● enterprise SaaS controls |
| **Pendo Listen** — product discovery | ● portal/forms/polls | ● Zendesk, Gong, Zoom, Teams, API | ● feedback item → idea | ● account ARR, churn, usage | ● themes, summaries, categories | ◐ idea suggestions/linking | ● assignment, Jira, roadmap | ● email/in-app updates | ● | ● enterprise SaaS controls |
| **Sprig** — in-product research | ● | ◐ export/webhook and product context | ● response / study | ● users, events, attributes | ● research synthesis | ○ | ◐ research workflow | ○ | ● | ◐ SaaS controls |
| **Usersnap / Userback** — visual product feedback | ● text, rating, screen/video/voice | ◐ SDK/API | ● issue / feedback item | ● user, URL, browser, console/session | ● summary/transcript | ◐ | ● assignment + Jira/dev tools | ◐ issue status | ● | ◐ SaaS controls |
| **Intercom** — support | ● messenger, email, calls, surveys | ◐ APIs/apps | ● conversation / ticket | ● contact/company/custom attributes | ● topics, sentiment, urgency, CX score | ◐ conversation merge | ● inbox, assignment, workflows | ● resolution + CSAT | ● | ● enterprise SaaS controls |
| **Zendesk** — support | ● omnichannel + surveys | ● apps/APIs | ● ticket / conversation | ● user/org/custom fields | ● intelligent triage, sentiment/intent | ● ticket merge | ● routing, SLA, workflows | ● solved status + CSAT | ● | ● enterprise SaaS controls |
| **Chattermill** — CX intelligence | ○ relies on sources | ● 50+ classes, API/S3/CSV | ● feedback record | ● customer ID + arbitrary attributes | ● taxonomy, sentiment, themes | ◐ | ● alerts, Slack/Jira | ◐ action leaves analysis layer | ● API/export/MCP | ● enterprise SaaS controls |
| **Enterpret** — feedback intelligence | ○ relies on sources | ● support, calls, surveys, reviews, social, data tools | ● feedback record / insight | ● users/accounts + enrichment | ● adaptive taxonomy, themes | ◐ | ● Jira/Slack and integrations | ◐ | ● webhook/API/export | ● enterprise SaaS controls |
| **unitQ** — product-quality intelligence | ○ relies on sources | ● public/private channels + API | ● feedback / quality issue | ● enrichment API, behavior context | ● issues, sentiment, trends | ● issue clustering | ● alerts and work-tool integrations | ◐ | ● | ● enterprise SaaS controls |
| **Dovetail Channels** — research/intelligence | ◐ research uploads | ● support, reviews, Pendo, Zapier, API/CSV | ● data point → theme/topic | ◐ metadata and channel context | ● continuous themes/sentiment | ◐ theme consolidation | ◐ sharing/integrations | ○ no operational case lifecycle | ● API/export | ● SaaS governance |
| **Birdeye / Reputation / Podium** — local-business reputation | ● surveys, messaging/review requests | ● listings, reviews, social, CRM/POS | ● review/message/survey/case | ● contact + location/business context | ● sentiment/topics/summaries | ◐ duplicate/listing controls | ● inbox, response, task/case | ● response/resolution/reputation metrics | ● integrations/APIs vary | ● enterprise SaaS controls |
| **Formbricks** — open-source surveys | ● in-app/web/link/email | ◐ API/webhook/import | ● survey response | ● identity, attributes, hidden fields | ◐ AI insights/taxonomy evolving | ○ | ◐ notifications/integrations | ◐ follow-up, not general cases | ● | ● AGPL self-host + cloud |
| **PostHog Surveys** — product-suite capture | ● web/in-product/link | ◐ events/data pipelines | ● survey response as product event | ● strong person/event/session context | ● survey summaries/analysis evolving | ○ | ◐ actions/integrations | ○ | ● | ● source available/self-host caveats |
| **SurveyJS** — form components | ● embeddable form library | ○ adopter-owned backend | ◐ JSON response schema | ● arbitrary application context | ○ | ○ | ○ adopter-owned | ○ | ● client hooks | ● MIT; fully adopter-controlled |
| **Segment / RudderStack / Hightouch** — infrastructure analogy | ● event SDKs, not feedback UX | ● | ● standard event envelope | ● identity/account/context | ○ feedback semantics | ● identity dedup | ● destinations/activation | ◐ downstream-owned | ● | ● governance; RudderStack has open components |

## What has already been implemented, by market

### 1. Enterprise VoC/CXM already implements the broad promise

[Medallia Experience Cloud’s current documentation](https://docs.medallia.com/en/medallia-experience-cloud/overview/medallia-experience-cloud) describes an end-to-end platform that collects multiple “signals,” treats each interaction as a response, distinguishes known respondents with profile attributes from anonymous respondents, processes responses through alerting and text analytics, and reports them for action. Its platform page adds surveys, voice, chat, web behavior, social and operational data; customer and B2B account profiles; AI themes; alerts/case management; and automated closed-loop actions. [Medallia’s API page](https://www.medallia.com/platform/api/) documents import/export and program automation.

[Qualtrics Workflows](https://www.qualtrics.com/support/survey-platform/actions-page/building-workflows/) can start from survey responses, JSON/API events, Salesforce, ServiceNow, Zendesk, or Segment, then create tickets, send messages, call web services, update directory contacts, or execute code. [XM Directory](https://www.qualtrics.com/support/iq-directory/directory-contacts-tab/directory-options/) manages contacts, embedded data, and duplicate merging; [transactional surveys](https://www.qualtrics.com/support/customer-experience-features/customer-experience-dashboards/transactional-surveys/) preserve interaction history and identity resolution. [Ticket workflows](https://www.qualtrics.com/support/survey-platform/actions-module/ticketing/ticket-workflows/) provide ownership, state, age-based escalation, and explicit close-the-loop behavior. [Retention policies](https://www.qualtrics.com/support/survey-platform/sp-administration/data-privacy-tab/data-retention/) automatically delete or anonymize responses and contacts.

[InMoment’s XI Platform](https://inmoment.com/en-gb/xi-platform/) claims capture across surveys, contact centers, social reviews, video, web sessions, stores, image/audio feedback; AI text/conversation/sentiment analysis and segmentation; case management, alerts, action plans, automated workflows; APIs/SDKs; role-based reporting; anonymization and data protection. This is almost exactly the broad “capture, understand, act” product at enterprise scope.

**Implication:** Hearloop cannot differentiate by promising omnichannel collection, AI sentiment/themes, dashboards, alerts, or closed-loop cases. Enterprise suites already package all of them, with services and governance Hearloop cannot responsibly match soon.

### 2. Survey and research products own direct collection

[Typeform](https://help.typeform.com/hc/en-us/articles/27965524569108-Collect-video-and-audio-answers-from-respondents), [SurveyMonkey](https://www.surveymonkey.com/product/enterprise/), [Delighted](https://delighted.com/pricing), and [Survicate](https://developers.survicate.com/) make it easy to build, distribute, embed, and integrate surveys. Typeform already supports audio/video answers, embeds, hidden fields, APIs, signed webhooks, and redelivery. Voiceform specializes in asynchronous voice/video research with transcription and qualitative analysis. Sprig combines in-product surveys, targeting from user attributes/events, session replay, prototype testing, voice/video response options, APIs, and exports.

These tools deliberately model a **response to an instrument**. That is ideal for research and measurement, but weaker as a universal feedback transport because unsolicited reviews, call transcripts, support conversations, bug reports, and operational complaints do not naturally belong to one survey.

**Implication:** A general question builder, branching engine, theme editor, response table, or distribution system is a costly detour. Hearloop should integrate with survey sources rather than recreate them.

### 3. Product-feedback systems already centralize and deduplicate demand

[Canny Autopilot](https://canny.io/features/autopilot) reads support and sales conversations, app-store/review sources, surveys, call transcripts, and API payloads; extracts product requests; ties them to users, accounts, and revenue; merges duplicates; organizes them by product area; and keeps an audit log. Canny’s board, roadmap, and status updates close the loop with requesters. This directly disproves the idea that cross-source ingestion plus AI deduplication is unoccupied.

[Productboard’s API 2.0](https://www.productboard.com/integrations/api/) can create, search, and manage feedback with text, tags, owner, source metadata, and customer attribution. Its [integration catalog](https://www.productboard.com/platform/integrations/) ingests Zendesk/Intercom conversations, Gong transcripts, app reviews, emails, session-replay notes, and more. Productboard links evidence to feature ideas, applies themes/sentiment, routes triage, and updates customers through portals.

[Pendo Listen](https://support.pendo.io/hc/en-us/articles/18159674293531-Overview-of-Pendo-Discover) centralizes feedback, links it to ideas, tests ideas, promotes them into roadmaps, and communicates releases back to contributors. [Listen’s ingestion](https://support.pendo.io/hc/en-us/articles/23353635353883-Add-feedback-to-Listen) includes native Pendo polls/forms plus AI-assisted extraction from Zendesk, Gong, Zoom, Teams, and APIs. [Listen Explore](https://support.pendo.io/hc/en-us/articles/37717114561819-Explore-feedback-with-AI-in-Listen) produces themes and can order evidence by account or revenue.

**Implication:** A generic “feedback inbox,” AI duplicate merge, voting board, or roadmap would compete with mature workflows. Hearloop’s canonical event must remain broader and more neutral than a “feature request.”

### 4. Support suites already turn conversations into operational outcomes

Intercom and Zendesk capture omnichannel conversations, bind them to users and organizations, classify them, route work, enforce SLAs, track resolution, collect CSAT, and expose APIs/webhooks. [Intercom Fin Attributes](https://www.intercom.com/help/en/articles/12397045-using-fin-attributes-in-workflows-reports-and-the-inbox) uses detected topic, sentiment, or urgency inside workflows and reporting. [Intercom’s CX Score](https://www.intercom.com/help/en/articles/10495092-understand-customer-experience-at-scale-with-the-cx-score) analyzes conversations and exposes score/reasons through reporting and APIs.

**Implication:** Feedback that requires a reply and owner often belongs in the help desk. Hearloop should deliver a normalized event or create/update a downstream ticket; it should not become a support inbox.

### 5. Feedback-intelligence vendors already unify indirect signals

[Chattermill’s integration catalog](https://chattermill.com/platform/integrations) spans surveys, reviews, social media, support, call recordings, warehouses, APIs, S3, CSV, and work tools. Its platform enriches feedback with customer ID, channel, location, and other attributes; applies AI themes and sentiment; alerts teams; and creates Jira work. It also exposes feedback intelligence through MCP.

[Enterpret’s integrations](https://www.enterpret.com/platform/integrations) cover support, calls, surveys, reviews, social sources, CRM, behavioral analytics, warehouses/webhooks, and Jira/Slack. Its core proposition is adaptive feedback taxonomy and customer intelligence across those sources.

[unitQ’s integrations](https://www.unitq.com/integrations/) combine public reviews, support, surveys, calls, and behavioral data; an enrichment API adds user attributes, platform information, and CSAT/NPS; clustered issues are activated into product/engineering workflows.

[Dovetail Channels](https://dovetail.com/help/channels/) imports support tickets, NPS/CSAT, app-store reviews, in-product feedback, APIs, Zapier, and CSV into a `data point` model, then continuously classifies themes. Its [import docs](https://dovetail.com/help/import-data-to-channels/) confirm direct support, review, Pendo, API, and metadata-bearing Zapier sources. Dovetail is strong in traceable synthesis and research evidence, but it is not an operational case system.

**Implication:** “Connect every source and use AI to find themes” is already a named, funded category. A new entrant needs a distribution/deployment/control advantage or a narrow job, not a slightly different dashboard.

### 6. Reputation platforms own local-business review action

[Birdeye](https://birdeye.com/platform/), [Reputation](https://reputation.com/solutions/use-cases/reviews-surveys-social), and [Podium](https://www.podium.com/product/inbox-new-template) aggregate major review/listing sources, request reviews and surveys, centralize messages, apply sentiment/AI summaries, route responses, and measure location-level reputation. They integrate with CRM/POS/business systems and are built for multi-location operating teams. Reputation documents survey-triggered ticketing and escalation; Birdeye combines review, survey, messaging, social, listing, ticket, API, and multi-location governance capabilities; Podium centers the operational loop in its messaging inbox.

**Implication:** If Hearloop targets “any local business,” it immediately competes with broad reputation and messaging suites. QR voice capture can be an input adapter, but is not enough to justify another reputation platform.

### 7. Open-source tools already own survey construction and self-hosting

[Formbricks](https://github.com/formbricks/formbricks) is an AGPLv3 survey and experience platform with web, in-app, link, and email capture, targeting, integrations, a cloud version, and Docker/Kubernetes self-hosting; some enterprise code has a separate license. Current repository configuration also shows optional provider settings and emerging AI taxonomy services. [SurveyJS](https://github.com/surveyjs/survey-library) is an MIT JSON-driven form library whose adopters own storage and backend behavior. [PostHog](https://github.com/PostHog/posthog) includes surveys inside a source-available product analytics suite; core code outside enterprise areas is MIT, while its official self-hosting disclaimer lists feature and support limitations.

**Implication:** “Open source and self-hostable surveys” is not whitespace. Hearloop would need an infrastructure contract and media/policy/delivery semantics that these form products do not center.

## What no reviewed vendor cleanly standardizes

The following gaps are real at the product-design level, though not yet validated as valuable enough to support a company:

1. **A portable feedback event contract.** Every category uses its own object—response, ticket, review, post, insight, data point, signal. No reviewed source presented a widely adopted, vendor-neutral schema spanning solicited and unsolicited feedback, raw evidence, modality, subject, identity/account, context, consent, analysis provenance, and operational status.
2. **An open, headless feedback gateway.** Existing open-source tools center surveys or analytics. Intelligence vendors are closed applications. A thin layer that can be deployed as infrastructure and does not require its own survey builder, roadmap, help desk, or dashboard is less clearly served.
3. **Feedback-specific delivery semantics.** General CDPs provide contracts, transformations, identity, replay, observability, and destinations, but they do not understand media retention, transcript provenance, respondent consent, source evidence, taxonomy versions, or complaint-resolution state.
4. **Provider portability for rich media and analysis.** Vendors generally bundle their transcription/models. An adopter-controlled adapter model for storage, speech-to-text, classification, redaction, and retention is not a mainstream feedback-platform feature.
5. **Cross-system outcome callbacks.** Many tools push to Jira, Slack, CRM, or help desks, but a neutral way to receive acknowledgement/resolution/outcome back from the destination and connect it to the original feedback event is not standardized.

These gaps are infrastructure seams, not proof that buyers want another platform. Large organizations may already solve them in a warehouse/CDP, and small companies may prefer one SaaS application over assembling infrastructure.

## Build-versus-buy

### Buy an enterprise VoC suite when

- The organization needs global survey programs, contact directories, hierarchical access, many channels, enterprise case management, executive dashboards, consulting/services, and formal compliance.
- Feedback must be distributed to thousands of frontline users with location/role-level access and escalation.
- The budget and implementation team can absorb Qualtrics, Medallia, or InMoment complexity.

Hearloop should not compete for this buyer initially.

### Buy a function-specific system when

- Product teams need feature-request deduplication, voting, prioritization, roadmap communication, and revenue weighting: Canny, Productboard, or Pendo Listen.
- Support teams need conversations, agents, SLAs, routing, and resolution: Intercom or Zendesk.
- Research teams need studies, transcripts, repositories, synthesis, and evidence: Sprig, Voiceform, or Dovetail.
- Local businesses need reviews, listings, messaging, campaigns, and response management: Birdeye, Reputation, or Podium.
- Teams need cross-source AI taxonomy and executive insight: Chattermill, Enterpret, or unitQ.

Hearloop should integrate with these systems as destinations or sources, not reproduce their working UI.

### Use open-source capture tooling when

- The need is simply a survey or form owned by the adopter: Formbricks or SurveyJS.
- The application already uses PostHog and wants lightweight in-product surveys connected to behavior.
- Voice is only one optional input and the team already owns object storage, transcription, privacy controls, retries, and backend operations.

### Build internally when

- Feedback volume and source count are small.
- The team already has a warehouse/CDP, help desk, event bus, identity model, model platform, and data-governance program.
- The workflow is domain-specific enough that a generic canonical model would lose important semantics.
- A small API endpoint plus downstream automation meets the real reliability and policy bar.

### Consider Hearloop only if it can prove

- A developer can emit a trustworthy feedback event faster than wiring capture, storage, identity, transcription, policy, and delivery separately.
- It preserves application ownership: the adopter’s UI, identity, data destination, taxonomy, and downstream workflow remain primary.
- It is more open and inspectable than intelligence SaaS, but much less operational burden than full self-hosting.
- Its normalized event is useful across at least two genuinely different sources and destinations without collapsing important semantics.
- Delivery, deletion, provenance, and consent are demonstrably more reliable than a webhook glued to a form.

## Risks in the “any business” ambition

### A universal schema can become lowest-common-denominator data

A product request needs votes, feature links, and roadmap status. A complaint needs severity, owner, SLA, and recovery outcome. A research interview needs study, consent, transcript segments, and evidence. A review needs platform, location, rating, and response. Forcing all of them into one shallow object can make the layer less useful than category-specific systems.

### Connectors are an endless product

Each source has authentication, rate limits, pagination, historical backfill, deletes, edits, identity fields, attachments, and changing APIs. “Connect everything” is not one feature; it is a permanent integration organization. Start with an ingestion API and only two adapters selected by real design partners.

### AI normalization is not deterministic infrastructure

Taxonomy drift, model upgrades, multilingual feedback, ambiguous sentiment, and multi-topic records complicate deduplication and trend comparisons. Analysis needs provider/model/prompt/taxonomy versions, confidence, source evidence, reprocessing semantics, and human correction. Hearloop does not need to become an ML research project, but it cannot hide these production facts.

### Identity resolution creates privacy and correctness risk

Incorrectly merging two customers is worse than leaving them separate. A first version should accept explicit adopter-provided `personId`, `accountId`, and `subject` identifiers and avoid probabilistic identity resolution. Consent, deletion, and tenant isolation must apply across raw audio, transcripts, analysis, deliveries, and backups.

### “Closed loop” can accidentally become four products

Once Hearloop adds a universal inbox, assignment, comments, SLAs, customer replies, roadmaps, and case reports, it becomes a help desk, product manager, research repository, and reputation tool. The first version should let destinations own work. Hearloop tracks delivery and accepts a minimal outcome callback; it does not become the primary workspace.

### Open source is not the same as easy to operate

A complete stack involving Postgres, Redis, object storage, background workers, media codecs, STT providers, LLM providers, email, migrations, and observability is expensive to self-host and support. Open the schema, SDKs, adapters, local development path, and core gateway first. Offer a managed path. Add production-grade self-hosting only after users demonstrate that deployment control is a hard requirement.

## The minimum coherent Hearloop product

### Product statement

> Hearloop is an open feedback event gateway. Send contextual rating, text, audio, or externally captured feedback through one contract; optionally enrich it; and deliver a trustworthy event into the systems where your team already works.

This is intentionally **not** “the one app every employee uses for feedback.” It is the integration layer between capture sources and systems of action.

### Required v1 boundary

#### 1. One documented envelope

```json
{
  "id": "fbk_01...",
  "idempotencyKey": "source:zendesk:ticket_4821:comment_9",
  "occurredAt": "2026-08-13T18:42:00Z",
  "source": { "type": "sdk", "channel": "in_product", "externalId": "..." },
  "subject": { "type": "feature", "id": "checkout" },
  "actor": { "personId": "usr_123", "accountId": "acct_9" },
  "context": { "url": "/checkout", "release": "2026.08.3", "locationId": null },
  "content": {
    "rating": 2,
    "text": "Checkout keeps failing",
    "media": [{ "type": "audio", "assetId": "ast_..." }]
  },
  "consent": { "processing": true, "contactAllowed": false },
  "policy": { "deleteRawAfterDays": 30 },
  "analysis": {
    "transcript": "...",
    "sentiment": "negative",
    "topics": ["checkout_failure"],
    "urgency": "high",
    "provenance": { "provider": "...", "model": "...", "taxonomyVersion": "..." }
  }
}
```

The exact contract should be designed with adopters. The important point is the separation of source, subject, actor/account, context, content, consent/policy, analysis, and provenance.

#### 2. Four ingestion paths, only two built deeply

- A typed HTTP ingestion API for any source.
- A small framework-neutral browser SDK plus React wrapper for rating, text, and optional audio.
- The existing QR/link capture as a reference application.
- Exactly two source adapters chosen with design partners—likely one support source and one public-review or survey source. No connector marketplace yet.

#### 3. Trustworthy pipeline behavior

- Idempotency and source-level deduplication using external IDs; do not attempt semantic duplicate merging in v1.
- Immutable raw input plus derived/versioned analysis.
- Signed, retried webhooks with dead-letter visibility and replay.
- Configurable raw-media retention and deletion propagation.
- Tenant-scoped API keys, quotas, audit trail, and explicit data ownership.
- Provider adapters for storage and transcription; one supported default is sufficient.

#### 4. Minimal activation, not a new workspace

- Generic signed webhook destination.
- One work destination, such as Slack or Linear/Jira, selected by design partners.
- Delivery state: pending, delivered, failed, replayed.
- Optional destination callback: acknowledged, acted_on, resolved, dismissed, plus timestamp and external reference.
- A technical event log and failure/replay UI—not a general analytics dashboard or help desk.

#### 5. Open-source boundary

- Open: event schema, SDKs/components, adapter interfaces, signature verification, local/mock server, example applications, and ideally the core gateway.
- Managed initially: durable media processing, hosted transcription/analysis, webhook operations, upgrades, and monitoring.
- Deferred: one-command production self-hosting with every provider, enterprise SSO/audit suite, probabilistic identity, no-code survey builder, semantic dedupe, generalized BI, and dozens of connectors.

## Why a company might choose this version

The answer cannot be “because it has AI,” “because it supports voice,” or “because all feedback is centralized.” Competitors already make those claims.

A credible answer would be:

> Choose Hearloop when feedback must stay inside your product and data architecture, but you do not want to build and operate the feedback-specific ingestion, media, consent, retention, enrichment, and delivery pipeline—or adopt a survey suite, help desk, or product-roadmap system as your data model.

That choice becomes rational only if Hearloop demonstrates:

1. **Control:** adopter-owned UI, identifiers, destinations, policy, and optional providers.
2. **Neutrality:** the event can represent a rating, message, recording, review, or imported conversation without becoming a survey response or feature request.
3. **Reliability:** idempotency, versioned enrichment, signed delivery, replay, deletion, and provenance work out of the box.
4. **Composability:** the company keeps Intercom, Jira, Productboard, Slack, its warehouse, or its internal workflow; Hearloop connects rather than replaces them.
5. **Developer experience:** an unfamiliar engineer reaches a verified, contextual event quickly and can understand failure, security, and deletion behavior without maintainer help.

## Validation before a repository rewrite

### Architecture interview

Interview 10 engineers/data or product-platform leads who currently move customer feedback between at least two systems. Ask them to diagram the last real feedback flow they implemented. Record sources, destinations, identity method, data-loss/failure modes, consent/retention needs, and ongoing connector maintenance.

**Pass:** at least four describe a current/recent cross-source pipeline and at least three name repeated infrastructure pain that the proposed gateway directly owns.  
**Fail:** most need only a form, a help-desk rule, or an occasional CSV.

### Fake-door integration test

Show a concise SDK/API contract and adapters—without promising a universal dashboard. Ask developers to choose among Hearloop, their existing feedback product, a CDP/event bus, and custom code.

**Pass:** at least three choose Hearloop for control plus feedback-specific semantics, not price or novelty.  
**Fail:** a generic Segment event or direct webhook is considered sufficient.

### Two-source/two-destination proof

Build the thinnest prototype that accepts the same complaint through (a) Hearloop SDK/audio and (b) one imported text source, then delivers it to (a) a signed webhook and (b) one work tool. Preserve subject, account, context, consent, and source evidence.

**Pass:** the same contract remains useful without source-specific fields leaking everywhere, and destination teams can act without opening Hearloop.  
**Fail:** important semantics are lost or the abstraction becomes mostly arbitrary JSON.

### Time-to-trusted-event test

Give three unfamiliar developers only public documentation.

**Pass:** median time under 30 minutes to a verified event; all three can explain idempotency, signature verification, retention, and replay.  
**Fail:** they require maintainer help or copy sensitive keys into clients.

### Retention test

Ask two adopters to keep the integration for four weeks.

**Pass:** both continue sending real feedback and one adds a second source or destination.  
**Fail:** the integration is removed after the demo or becomes an unused duplicate of an existing system.

## Decision

The broad research question is answered: **yes, the end-to-end feedback platform has already been built multiple times.** The market is saturated in capture, surveys, enterprise VoC, product-feedback systems, support workflows, reputation management, and AI feedback intelligence. Hearloop can still be worth building because the goal need not be category novelty, but it needs an honest boundary.

The best boundary to test is not “feedback for every business.” It is:

> An open, developer-first gateway that converts heterogeneous, contextual feedback into trustworthy events and delivers them into existing systems of action.

That product uses Hearloop’s existing strengths—capture, media handling, asynchronous processing, tenant scoping, and webhooks—while avoiding the mature application surfaces competitors already own. If developers do not value the additional semantics and reliability over a generic event API plus custom code, Hearloop should remain a strong portfolio project rather than expand into a platform.

## Primary-source index

### Enterprise VoC/CXM

- Qualtrics: [Workflows](https://www.qualtrics.com/support/survey-platform/actions-page/building-workflows/), [ticket workflows](https://www.qualtrics.com/support/survey-platform/actions-module/ticketing/ticket-workflows/), [XM Directory](https://www.qualtrics.com/support/iq-directory/directory-contacts-tab/directory-options/), [transactional surveys and identity](https://www.qualtrics.com/support/customer-experience-features/customer-experience-dashboards/transactional-surveys/), [retention policies](https://www.qualtrics.com/support/survey-platform/sp-administration/data-privacy-tab/data-retention/), [GDPR/data deletion](https://www.qualtrics.com/support/survey-platform/getting-started/qualtrics-gdpr-compliance/)
- Medallia: [Experience Cloud model](https://docs.medallia.com/en/medallia-experience-cloud/overview/medallia-experience-cloud), [platform](https://www.medallia.com/platform/), [signals](https://www.medallia.com/platform/signals/), [APIs](https://www.medallia.com/platform/api/), [developer portal](https://developer.medallia.com/)
- InMoment: [XI Platform](https://inmoment.com/en-gb/xi-platform/)

### Product, support, and intelligence systems

- Canny: [Autopilot](https://canny.io/features/autopilot), [collection](https://canny.io/features/collect-feedback), [integration list](https://help.canny.io/en/articles/10514464-what-tools-does-canny-integrate-with)
- Productboard: [API 2.0](https://www.productboard.com/integrations/api/), [integrations](https://www.productboard.com/platform/integrations/), [customer insights](https://support.productboard.com/hc/en-us/categories/5147441679507-Customer-Insights-and-Engagement)
- Pendo: [Listen overview](https://support.pendo.io/hc/en-us/articles/18159674293531-Overview-of-Pendo-Discover), [feedback sources](https://support.pendo.io/hc/en-us/articles/23353635353883-Add-feedback-to-Listen), [AI Explore](https://support.pendo.io/hc/en-us/articles/37717114561819-Explore-feedback-with-AI-in-Listen)
- Intercom: [Fin Attributes in workflows](https://www.intercom.com/help/en/articles/12397045-using-fin-attributes-in-workflows-reports-and-the-inbox), [conversation topics](https://www.intercom.com/help/en/articles/4612191-conversation-topics-report), [CX Score](https://www.intercom.com/help/en/articles/10495092-understand-customer-experience-at-scale-with-the-cx-score), [webhooks](https://www.intercom.com/help/en/articles/9071694-intercom-developer-faqs)
- Chattermill: [platform/integrations](https://chattermill.com/platform/integrations), [ingestion methods](https://docs.chattermill.com/en/articles/8349034-how-chattermill-gets-your-data), [integration docs](https://docs.chattermill.com/en/collections/84251-integrations), [MCP](https://docs.chattermill.com/en/articles/13943134-chattermill-mcp-server)
- Enterpret: [integrations](https://www.enterpret.com/platform/integrations), [feedback sources](https://helpcenter.enterpret.com/en/articles/6446339-what-are-feedback-sources), [integration documentation](https://helpcenter.enterpret.com/en/collections/3522372-integrations)
- unitQ: [integrations and enrichment](https://www.unitq.com/integrations/)
- Dovetail: [Channels](https://dovetail.com/help/channels/), [imports](https://dovetail.com/help/import-data-to-channels/), [AI](https://dovetail.com/help/dovetail-ai/), [API](https://dovetail.com/help/integrations/dovetail-api/)

### Capture, survey, and reputation platforms

- SurveyMonkey: [Enterprise platform](https://www.surveymonkey.com/product/enterprise/), [integrations and API](https://www.surveymonkey.com/product/integrations/), [AI capabilities](https://www.surveymonkey.com/curiosity/build-with-ai/)
- Typeform: [audio/video responses](https://help.typeform.com/hc/en-us/articles/27965524569108-Collect-video-and-audio-answers-from-respondents), [developer APIs](https://www.typeform.com/developers/get-started/), [signed webhooks](https://www.typeform.com/developers/webhooks/secure-your-webhooks/)
- Delighted: [plans and distribution](https://delighted.com/pricing), [API/webhooks](https://app.delighted.com/docs/api/webhooks)
- Survicate: [platform](https://survicate.com/), [SDK/API/webhooks](https://developers.survicate.com/), [signed webhooks](https://help.survicate.com/en/articles/3942517-webhooks-integration)
- Voiceform: [platform](https://www.voiceform.com/), [product](https://www.voiceform.com/product), [API documentation](https://docs.voiceform.com/)
- Birdeye: [platform](https://birdeye.com/platform/), [enterprise controls and integrations](https://birdeye.com/enterprise/)
- Reputation: [unified review/survey/social feedback](https://reputation.com/solutions/use-cases/reviews-surveys-social), [survey-to-ticket loop](https://reputation.com/platform/surveys), [product capabilities](https://reputation.com/legal-information/product-offering-details)
- Podium: [surveys](https://www.podium.com/surveys), [omnichannel inbox](https://www.podium.com/product/inbox-new-template), [mobile/contact/call features](https://www.podium.com/product/mobile-app)

### Open source and data-plane analogies

- Formbricks: [official repository and license](https://github.com/formbricks/formbricks), [self-hosting](https://formbricks.com/docs/self-hosting/overview)
- PostHog: [official repository license](https://github.com/PostHog/posthog/blob/master/LICENSE), [self-hosting limitations](https://github.com/PostHog/posthog.com/blob/master/contents/docs/self-host/open-source/disclaimer.mdx)
- SurveyJS: [official repository](https://github.com/surveyjs/survey-library), [documentation](https://surveyjs.io/form-library/documentation/overview)
- Hightouch: [Events architecture and contract model](https://hightouch.com/docs/events/overview), [identity resolution](https://hightouch.com/docs/identity-resolution/overview)
- RudderStack: [official documentation](https://www.rudderstack.com/docs/)
