# Multimodal Feedback Competitive Landscape

**Research date:** August 12, 2026  
**Decision under review:** Whether Hearloop should become open-source, integratable multimodal feedback infrastructure, and why a company would choose it over existing products.

## Executive conclusion

Hearloop should not position itself as a novel voice-feedback product or a generic multimodal survey platform. Both categories already exist. Voiceform, Typeform, Qualtrics, Sprig, Usersnap, and Userback collect voice-bearing responses; Hoxton SaySo already offers the especially close physical-space workflow of QR or kiosk voice capture, transcription, classification, and real-time alerts. At the infrastructure layer, browser recording is a commodity supplied by the MediaRecorder API and mature wrappers. At the open-source survey layer, Formbricks and SurveyJS already provide far more general form-building capability than Hearloop should try to reproduce.

There is still a plausible project, but it is narrower than “multimodal feedback infrastructure.” Hearloop could become the open, developer-controlled **voice-to-action layer** that existing survey builders and recording components leave to integrators: dependable microphone UX, secure upload, media normalization, transcription, contextual identity, consent and retention policy, a stable provider-neutral feedback event, and reliable delivery into an application workflow. Rating and text should be supported as low-friction fallbacks, not used to justify building another form builder.

That position is not yet validated. A developer can currently combine Formbricks or SurveyJS, a browser recorder, object storage, and a speech-to-text API. Hearloop is worth pursuing only if external developers find that integration sufficiently painful, risky, or repetitive to adopt and retain a specialized layer. The next work should therefore be integration tests with real developers, not another feature cycle.

## Research method and limits

This review used official product, documentation, pricing, security, customer-story, GitHub, npm, and MDN sources. It excludes review sites and third-party market-size claims. Product capabilities and prices can change after the research date.

“Traction” below means first-party evidence such as an official usage claim, customer story, GitHub activity, or npm downloads. Vendor-authored case studies are useful evidence that a workflow exists, but they are not independent proof of general demand. Repository stars and package downloads measure interest in a technical primitive, not demand for customer-feedback software. Where an official source did not disclose a fact, it is marked unknown rather than inferred.

## Comparison matrix

| Product | Voice / multimodal capture | Context and integration | Action workflow | Deployment / price | Verified adoption evidence |
|---|---|---|---|---|---|
| **Voiceform** | Voice, video, text, quantitative questions, transcription, AI follow-ups, sentiment and topics | Links and embeds; email, SMS and chat distribution; integrations, webhooks, Results/Download API | Survey logic and research analysis; not primarily an operational case system | Proprietary SaaS. Free 10 responses/month; Essentials $90.85/month for 25; Pro $286.35/month for 100; API advertised on Enterprise | Vendor cases claim Prolific ran 500 interviews, RingCentral increased responses 40%, and Opinium achieved 4x completions. [Product](https://www.voiceform.com/product), [pricing](https://www.voiceform.com/pricing), [stories](https://www.voiceform.com/customer-stories), [API](https://docs.voiceform.com/reference/using-download-api) |
| **Voxpopme** | Self-recorded video surveys, AI-moderated voice interviews, live interviews, screen recording, transcription, themes and sentiment | Embeddable JavaScript capture widget; REST API can create responses with additional metadata | Qualitative analysis, searchable repository, reports and showreels; not operational issue ownership | Proprietary SaaS; current price is request-only | Vendor says 100+ insight teams use AI Insights and publishes enterprise customer stories; voice/video-specific retention is unknown. [Pricing](https://www.voxpopme.com/pricing/), [capture/API](https://support.voxpopme.com/hc/en-gb/articles/360004567597-Capturing-Responses), [AI Insights](https://www.voxpopme.com/ai-insights/) |
| **Hoxton SaySo** | Spoken feedback through kiosk or QR; real-time transcription, translation, themes, sentiment and urgency | Location/time stamps and distinct QR codes by area, exhibit or room | Custom alert triggers route critical feedback to duty managers, operations or leadership while a visitor is on site | Proprietary cloud service with Android/iPad kiosk and browser QR mode; SaySo-specific pricing unknown | The official page claims 5–10% kiosk completion, under-one-minute average response, and “thousands” of HoxtonAI users; SaySo-specific customer count is unknown. [Product](https://www.hoxton.ai/sayso) |
| **Typeform** | Video, audio and optional text answers with transcript; two-minute recording limit | Embed SDK, URL parameters for respondent/source context, Responses API and webhooks | Form logic and integrations; no native service-recovery ownership loop | Proprietary SaaS. Audio/video requires Growth or Talent; Growth Flow shown at $349 monthly or $266/month annually, Talent at $169 monthly or $119/month annually | Typeform claims usage by 95% of the Fortune 500, but voice/audio activation is unknown. [Audio/video](https://help.typeform.com/hc/en-us/articles/27965524569108-Collect-video-and-audio-answers-from-respondents), [context](https://help.typeform.com/hc/en-us/articles/360029264632-using-hidden-fields-with-embedded-typeforms), [pricing](https://www.typeform.com/pricing) |
| **Qualtrics** | Native video-response question records or uploads video or audio; topics, sentiment, reels and dashboards | Embedded/contact/transaction data, APIs, web services, branching and display logic | Mature Workflows can create tickets, send email/notifications, call web services and run code | Proprietary enterprise SaaS; public numeric pricing unknown and video interactions consume license capacity differently | Qualtrics' own 2025 channel study found submitted video feedback at only 0–7% by country and 2% in the US—a useful warning that rich media remains a minority channel. [Video response](https://www.qualtrics.com/support/survey-platform/survey-module/editing-questions/question-types-guide/specialty-questions/video-response-question/), [embedded data](https://www.qualtrics.com/support/survey-platform/survey-module/survey-flow/standard-elements/embedded-data/), [workflows](https://www.qualtrics.com/support/survey-platform/actions-page/building-workflows/), [channel study](https://www.qualtrics.com/m/www.xminstitute.com/wp-content/uploads/2024/12/XMI_RR-DS_GlobalFeedbackChannels-2025-1.pdf) |
| **Usersnap** | Text, rating and surveys plus screenshots and screen recording with optional microphone audio | Widget captures URL, browser, device, screen data and console errors; REST API, webhooks and 50+ integrations | Feedback management and engineering routing to tools such as Jira and Azure DevOps | Proprietary SaaS; first 20 feedback items free, current paid numeric prices not visible in the official source reviewed | Vendor reports 300M+ monthly widget views, 60K+ customers served and 2M+ feedback items; none is voice-specific. [Screen/audio](https://usersnap.com/l/screen-recording), [widget metadata](https://help.usersnap.com/docs/feedback-widget), [company](https://wf.usersnap.com/about) |
| **Userback** | Text, NPS, surveys, screenshots, screen-and-voice video, transcript, AI summary and session replay | JavaScript/npm/mobile SDKs; user identity and arbitrary attributes; behavioral triggers; console/network data; REST API and webhooks | Inbox, assignment and integrations with product/support tools | Proprietary SaaS. Business Plus is $159/month annually or $199 monthly; lower tier amounts were not reliably available in the reviewed page | Vendor claims 20K+ product teams; cases claim SEOcrawl collected 10x more feedback and Vision6 reduced processing time 94%, not specifically through voice. [Video feedback](https://support.userback.io/en/articles/15268500-video-feedback), [SDK](https://support.userback.io/en/articles/5209252-javascript-sdk-and-developer-docs), [pricing](https://userback.io/pricing/), [stories](https://userback.io/customer-stories/) |
| **Canny** | Text feature requests, posts, votes and comments; no official voice/audio/video capture found | Portal/widget, custom fields, user segments, integrations, API and signed webhooks; Autopilot ingests text from support and sales systems | Mature deduplication, triage, ownership, roadmap and status workflow | Proprietary SaaS. Free for 25 tracked users; Pro $79/month annually; Business custom | The official source provides product/pricing evidence but no voice traction. [Pricing](https://canny.io/pricing), [API](https://developers.canny.io/api-reference) |
| **Hotjar / Contentsquare Surveys** | Structured and written surveys plus session replay; no official respondent audio/voice answer found | On-site popups/buttons/embeds/links; survey responses connect to replays and survey events create behavioral segments | Analysis and integrations rather than issue ownership | Proprietary SaaS. Contentsquare Free is available; paid numeric price unknown in reviewed sources | Official claims: 402M+ survey responses and 1.3M+ websites/apps, not voice. [Surveys](https://www.hotjar.com/product/surveys/), [replay connection](https://www.hotjar.com/integrations/contentsquare/), [free plan](https://help.hotjar.com/hc/en-us/articles/41819264240273-Explore-Contentsquare-Free-More-Data-New-Features-and-Still-Free) |
| **Sprig** | Surveys, voice and video responses, session replay and prototype testing | Web, iOS, Android, React Native and Flutter SDKs/APIs; user attributes and events drive targeting and personalization; response metadata, webhooks and export API | Research design and synthesis, not operational case resolution | Proprietary SaaS. Free and Starter exist, public numeric Starter price unknown; enterprise price scales with responses and capabilities | Voice-specific usage is unknown. [Pricing](https://sprig.com/pricing), [web deployment](https://sprig.com/deploy/web-apps-websites), [docs](https://docs.sprig.com/docs/welcome-to-sprig/what-is-sprig) |
| **Formbricks** | Broad survey types and generic file upload; no native microphone/voice-recording question found | Hidden fields, identity and arbitrary attributes, targeting, personal links, Client/Management APIs and response webhooks | Slack and other integrations plus response workflows; some capabilities are enterprise-only | Cloud and self-hosted Docker/Kubernetes. Core AGPLv3 with separately licensed enterprise code. Hobby free/250 responses; Pro $74/month/2K; Scale $325/month/5K | About 12.8K GitHub stars and 2.5K forks at review time; actual active/paid customer count unknown. [Repository](https://github.com/formbricks/formbricks), [self-hosting](https://formbricks.com/docs/self-hosting/overview), [license](https://formbricks.com/docs/self-hosting/advanced/license), [pricing](https://formbricks.com/pricing) |
| **SurveyJS** | 20+ JSON form inputs; file upload accepts audio formats, but native microphone recording was not documented | Arbitrary JSON and custom properties; adopter sends results to any API/database | No first-party backend, transcription, delivery or routing; adopter implements it | MIT Form Library, client-side/self-hosted. Commercial Creator/Dashboard/PDF from $569/developer one-time | About 4.8K GitHub stars; `survey-react-ui` had roughly 208K weekly npm downloads at review time. [Repository](https://github.com/surveyjs/survey-library), [file input](https://surveyjs.io/form-library/documentation/api-reference/file-model), [pricing](https://surveyjs.io/pricing) |
| **MediaRecorder API** | Native browser primitive that records an audio/video `MediaStream` into chunks | None; the application defines all metadata and upload behavior | None | Web platform API; no product price or software license. Broadly available since April 2021, though some behavior varies by browser | Browser availability validates recording capability, not demand for feedback. [MDN](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder) |
| **RecordRTC** | MIT wrapper for audio, video, screen and canvas recording | Produces media blobs; no feedback schema or backend | None | Self-hosted library, free/MIT | About 6.9K GitHub stars and 293K weekly npm downloads at review time; downloads span many non-feedback uses. [GitHub](https://github.com/muaz-khan/RecordRTC), [npm](https://www.npmjs.com/package/recordrtc) |
| **react-media-recorder** | MIT React hook/render-prop wrapper for audio, video and screen recording | Exposes recording controls, state and blob URL; no event schema or backend | None | Self-hosted library, free/MIT | About 588 GitHub stars and 125K weekly npm downloads at review time; feedback-specific use is unknown. [GitHub](https://github.com/DeltaCircuit/react-media-recorder), [npm](https://www.npmjs.com/package/react-media-recorder) |

## What is already solved

### 1. Recording is a commodity

The browser already exposes MediaRecorder, and popular open-source wrappers make React and cross-browser capture easier. A microphone widget alone has almost no defensibility. Compatibility polish can still be valuable, but it is a quality attribute, not a category.

### 2. Multimodal form building is crowded

Voiceform, Typeform, Qualtrics and Sprig already mix structured questions with voice/video. Formbricks and SurveyJS cover open-source or developer-owned form building. Rebuilding conditional logic, question editors, themes, distribution, response tables and generalized analytics would place Hearloop behind mature competitors while distracting from its strongest engineering.

### 3. Contextual in-product feedback is mature

Sprig, Userback and Usersnap already attach identity, attributes, behavioral events, URL/browser data and session context. “Feedback with metadata” is table stakes. A generic `metadata` object is necessary but not sufficient differentiation.

### 4. Physical voice-to-alert is occupied

Hoxton SaySo is the closest strategic competitor. Its published proposition—QR/kiosk voice capture in a physical venue, multilingual transcription, theme/sentiment/urgency classification and real-time routing before the visitor leaves—is substantially the same as Hearloop's proposed automotive service-recovery story. Hearloop cannot claim novelty here without a narrower vertical workflow or a meaningfully different open/developer-controlled model.

### 5. End-to-end operational reliability is inconsistently packaged

At one end, recording libraries stop at a blob. At the other, enterprise platforms bundle collection, research and workflows into closed products. The middle—the reusable, provider-neutral path from recording to a policy-controlled, contextual event delivered into an adopter's system—appears less clearly served. This is the most plausible whitespace, although absence from product pages is not proof of customer demand.

## Adoption evidence: what it proves and what it does not

The evidence supports three conclusions:

1. **Some organizations value rich-media responses.** Voiceform and Voxpopme publish multiple cases where customers ran hundreds of asynchronous interviews or reported richer responses. Qualtrics, Typeform and Sprig have continued investing in video/voice features.
2. **Voice/video is still a minority feedback channel.** Qualtrics' own cross-country research reported submitted video feedback in the low single digits in most countries. That argues strongly for rating/text fallbacks and against voice-only positioning.
3. **Developers repeatedly need recording primitives.** RecordRTC, react-media-recorder and SurveyJS download/star counts show recurring implementation demand, but do not prove willingness to adopt a specialized feedback pipeline.

No reviewed source discloses the percentage of customers actively using voice, retention for voice features, or revenue attributable to voice. There is therefore no defensible statement that “the market depends on voice feedback.” The evidence only establishes that voice is useful in particular research, accessibility and explain-the-problem workflows.

## Build-versus-buy analysis

### A company should buy an existing product when

- It needs a general survey builder, panels, complex branching or polished research reports: choose Typeform, Qualtrics, Voiceform, Voxpopme or Sprig.
- It needs product-feedback portals, prioritization and roadmaps: choose Canny or Formbricks rather than turning Hearloop into a roadmap tool.
- It needs annotated bug reports, console logs and session replay: choose Usersnap or Userback.
- It needs a physical venue voice kiosk with managed operations now: evaluate Hoxton SaySo.
- It only needs to record media in a browser: use MediaRecorder or a wrapper.

### A company might build internally when

- Voice is a small optional field inside one existing flow.
- It already has secure object storage, event infrastructure, transcription and retention tooling.
- Its identity, consent or regulated-data model is too specialized for a third-party service.
- It can accept a basic implementation without provider portability, normalized media or durable webhook semantics.

### A company might choose Hearloop only if

- It wants voice capture embedded in its own UI rather than a separate survey product.
- It wants to retain control of identity, metadata, storage policy and downstream workflow.
- It values a stable feedback-event contract across rating, text and voice.
- It wants managed processing initially but a credible path to replace providers or self-host sensitive components.
- Hearloop reduces a multi-week, failure-prone integration to a documented implementation that an unfamiliar developer can complete in less than 30 minutes.

That final point must be demonstrated, not advertised.

## Three defensible positioning options

### Position A — Open voice-to-action infrastructure (recommended)

> Add contextual voice feedback to any product or physical touchpoint and receive a reliable, provider-neutral event in your existing workflow.

The open-source SDK owns capture, rating/text fallback, consent UI and typed event contracts. The managed service owns secure uploads, normalization, transcription, optional classification and durable delivery. Provider adapters make speech-to-text, storage and analysis replaceable. A minimal local adapter enables development without a Hearloop account.

**Why it could win:** It avoids competing with survey builders and gives developers more control than closed products. It turns the difficult operational seams—not the microphone—into the product.

**Primary risk:** The seams may not hurt enough. Teams may prefer a Typeform embed or 100 lines of custom integration.

### Position B — Privacy-first, self-hostable rich-media feedback

> Collect voice and other rich feedback without surrendering recordings, identity or retention control to a survey vendor.

This position emphasizes self-hosting, bring-your-own S3/STT/model, regional processing, explicit retention and deletion, auditable consent and no training on customer data.

**Why it could win:** Existing open-source survey tools lack a turnkey native voice pipeline, while enterprise tools are closed and expensive.

**Primary risk:** Full self-hosting creates a large support matrix—PostgreSQL, Redis, object storage, workers, codecs and model providers—before demand exists. Formbricks could add a recorder, and sophisticated privacy buyers may require compliance beyond a small project’s capacity.

### Position C — Embedded voice bug/context reports for developer tools

> Let users explain a problem while Hearloop attaches product context and delivers a developer-ready report.

This would combine voice with user/account IDs, feature flags, route, release version and optional screenshot/session context, then deliver transcript and structured event into GitHub, Linear or an internal support tool.

**Why it could win:** Speaking can be useful for explaining multi-step problems, and the output connects naturally to an engineering workflow.

**Primary risk:** Usersnap and Userback already do screen recording with voice, developer metadata and routing. Hearloop would need a strong open-source/developer-control advantage and should not attempt full session replay.

## Blunt recommendation

Proceed only with **Position A as a validation hypothesis**, not as an immediate rewrite.

Keep Hearloop's existing secure upload, asynchronous processing, normalized analysis result and reliable webhook foundation. Reframe the automotive QR experience as one reference application. Add rating and text as fallbacks at the contract level, but do not build a general form editor, panel, roadmap, session replay system or broad analytics suite. Do not promise full self-hosting yet. Open-source the smallest useful client layer and schema first; publish a local/mock adapter and one SaaS example plus one physical QR example.

The project earns a reason to exist if external developers choose it because it removes meaningful integration and operational work while preserving control. If five realistic adopters consistently say they would instead use Formbricks/Typeform or build the recorder themselves—and can do so quickly—stop expanding the platform. The result remains a strong portfolio system, but it is not a justified open-source product.

## Five validation tests before further platform work

### 1. Competitive replacement test

Give five external developers the same requirement: add rating, text and optional voice feedback to a React product; include account/feature context; produce a webhook; delete audio after a configured period. Let them choose Hearloop, Formbricks plus a recorder, Typeform, or custom code.

**Pass:** At least three choose Hearloop after seeing all options and can state a specific reason beyond “the demo looks easier.”  
**Fail:** Most choose a survey embed or custom recorder and identify no painful missing operational layer.

### 2. Time-to-first-trusted-event test

Ask three developers unfamiliar with the repository to integrate only from public documentation. Measure time from account/project creation to a verified, signed feedback event containing rating/text/voice, context and consent.

**Pass:** Median under 30 minutes, no maintainer intervention, and all three can explain how retries, identity and deletion work.  
**Fail:** Setup depends on repository knowledge, copied secrets in client code, or manual infrastructure repair.

### 3. Provider-control test

Interview ten developers or technical leads who handle user feedback or voice data. Show managed-only and provider-controlled designs. Ask what data they must own, which providers they must replace, and whether self-hosting is a requirement or merely attractive language.

**Pass:** At least four have a current or recent use case and identify provider/storage/retention control as a purchase or adoption criterion.  
**Fail:** Self-hosting receives polite interest but no concrete security review, procurement barrier or integration need.

### 4. Voice incrementality test

In two real flows, randomly offer (A) rating + text and (B) rating + text + optional voice. Compare completion, actionable detail, time to submit and follow-up rate. Do not infer value from recording count alone.

**Pass:** Voice produces a meaningful increase in actionable information or accessibility for a defined segment without materially reducing overall completion.  
**Fail:** Almost nobody uses it, completion falls, or transcripts add no actionable information beyond rating/text.

### 5. Operational pain test

Publish a small “build it yourself” reference using MediaRecorder, storage and STT, alongside Hearloop's integration. Ask adopters to identify which failure modes they would otherwise own: browser codecs, abandoned uploads, retry/idempotency, webhook delivery, consent records, retention deletion and provider errors.

**Pass:** At least three teams have encountered or actively budgeted for several of these problems and would adopt a maintained layer to avoid them.  
**Fail:** The reference implementation is sufficient for their production bar and Hearloop's additional system is perceived as more infrastructure, not less.

## Decision rule

Do not ask whether Hearloop is technically impressive enough. Ask whether it becomes the smallest credible way for another developer to add a trustworthy voice-to-action path without adopting a full survey platform.

Continue toward an open-source product only when the validation tests show all three:

1. A repeated, current integration problem;
2. A measurable advantage over Typeform/Formbricks/custom capture;
3. External developers completing and retaining the integration without the author's help.

Until then, the honest claim is: Hearloop is a well-developed exploration of voice-feedback infrastructure with a promising open integration hypothesis—not yet a differentiated product.
