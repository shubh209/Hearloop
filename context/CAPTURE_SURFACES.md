# Capture Surfaces — Decision

> Who Hearloop targets and how customers reach the recorder.
> This is the positioning source of truth. AGENTS.md / CONTEXT.md / the resume
> doc reflect it.

---

## Decision

Hearloop has **one product, two capture surfaces**:

| | **Primary — In-person (Direction A)** | **Secondary — Online (Direction B)** |
|---|---|---|
| Target | In-person service businesses; **lead vertical: quick-service automotive** (oil change, tires, brakes). Also clinics, salons, hospitality. | Online businesses with real web traffic: e-commerce, SaaS, booking pages. |
| Surface | **QR code / SMS link → hosted capture page** | **Website widget** (`widget.js` / `@hearloop/react`) |
| Why it fits | The customer-service moment is in-person; capture meets the customer where they are (receipt, counter, bay, post-visit text). | The customer is already on the page; the embed is the natural surface. |

Both are fully supported. We **lead** with A (it matches the core value prop and
demos without needing website traffic) and **keep** B for partners who have a
relevant web page (online booking confirmation, post-purchase "thanks" page).

---

## Why A is primary (the mismatch it fixes)

The original value prop — "in-person service, forms get <5% completion, speaking
is effortless" — points at in-person businesses. But those businesses get little
web traffic and the feedback moment is **not** on their website. A website-only
widget therefore captures almost nobody at the moment that matters.

The fix is not a different website — it is a different surface. For in-person
service the customer is **at the location or on their phone right after**, so the
capture surface is a QR code / SMS link, not a web embed.

Portfolio framing: Hearloop is a portfolio project. The goal is one coherent,
end-to-end-**demoable** narrative, not market PMF. A demos beautifully
("scan QR on the receipt → speak 5s → owner sees sentiment + topic on the
dashboard") and needs no faked traffic. B requires real web traffic to be
meaningful. So A leads.

---

## What we reuse (A is mostly already built)

- **Hosted capture page** — `apps/web/app/capture/[token]/page.tsx` already exists.
- **Public token flow** — `GET /public/session/:token`, open, upload-url, finalize.
- **Pipeline + dashboard + webhooks** — unchanged.

A QR code is just a **link to the hosted capture page**. The pipeline does not
change; only the way the customer arrives does.

---

## What is new to build for A (minimal)

1. **Capture link / QR generator** in the dashboard — produce a stable capture
   URL (+ downloadable QR PNG/SVG) per partner, and optionally per **Target**
   (location / service), so feedback is attributed without web scraping.
2. **Signage-friendly hosted capture page** — large tap target, works on a phone
   opened from a paper QR, minimal chrome, mic-permission guidance.
3. **(Optional) SMS link** — text the capture URL after a visit. Defer unless the
   demo needs it (adds a paid SMS dependency; keep behind a flag).

`Target` (see `FEEDBACK_TARGET_DESIGN.md`) is encoded **into the capture link** for
A (location/service), and read from **page context** for B (product/page). Same
dimension, two sources.

---

## What stays for B

The website widget (`widget.js`, `@hearloop/react`, embed keys, `allowed_origins`)
remains a supported surface. The onboarding-simplification work (script-tag-first
install, origin auto-derive, verify step) still applies to B. B is not deprecated —
it is the second surface, not the headline.

---

## Positioning one-liner

> Hearloop turns 5-second voice clips into structured feedback for service
> businesses. Customers scan a QR code (or tap a link / on-site widget), speak,
> and leave; owners see sentiment, topics, and urgency per location or product on
> a dashboard — no forms, no app.

---

## Open questions

- Lead-vertical demo: keep QuickLube (automotive) as the canonical demo partner; add
  a printable QR + a "post-visit" capture page variant.
- Do we encode Target as a path segment or a query param on the capture link?
  (Lean: a short per-Target token so the public URL stays opaque.)
- SMS: in scope for the demo, or QR-only? (Lean: QR-only first.)
