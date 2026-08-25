# Released Workflow Verification and Safety Baseline

**Status:** Approved design
**Sequence:** 1 of 3
**Program:** [Hearloop Engineering Closure Program](2026-08-24-engineering-closure-program-design.md)

## Goal

Establish a reproducible baseline for the product that already exists. Verify
released behavior, reproduce suspected defects before changing code, and close
every finding that would make later media or query work untrustworthy.

This specification verifies and repairs the baseline. It adds no new product
capability.

## Entry state

- Partner authentication, Capture links, Hosted capture, widget/React capture,
  signed uploads, Pipeline processing, dashboard Insights, webhooks, and health
  endpoints exist.
- Previous evidence recorded two API environment-fixture failures and three
  React SDK expectation failures.
- Earlier audits reported possible browser-secret guidance, server-consent,
  dashboard-aggregation, urgent-delivery, retention, and CI coverage gaps.
  These are hypotheses until reproduced against the current code.

## Included surfaces

### Build and test health

- API build and full test suite
- web production build
- QuickLube production build
- React SDK build and full test suite
- database migration contract tests
- CI release-blocking checks

### Partner access

- signup, login, logout, and dashboard-session behavior
- Partner secret-key issuance and rotation
- browser-safe embed-key behavior
- allowed-origin enforcement
- public-token scope, single-use behavior, and expiry

### Capture

- Capture-link creation and QR rendering
- one fresh Session per Capture-link use
- Target propagation into Session and dashboard data
- Hosted capture
- widget and React SDK request contracts
- microphone permission, cancellation, and recording failure

### Pipeline and delivery

- signed upload and finalize
- validation, transcription, and structured analysis
- Session completion and dashboard persistence
- webhook success, retry, signature, and terminal failure
- urgent-alert eligibility, attempted delivery, and configuration limits
- Session expiry

### Safety and operations

- browser examples use an embed key, never a Partner secret key
- required consent is enforced at the authoritative server boundary
- dashboard totals are not silently limited to a recent page
- SSRF validation runs when settings are saved and when delivery occurs
- health checks report dependency state without excessive Redis commands
- CI blocks the failures selected by this specification

## Verification ladder

Use the highest practical seam for each behavior:

| Evidence | Use |
| --- | --- |
| Unit/property test | Pure validation, token, parsing, and transition rules |
| API integration test | Authentication, Partner isolation, state, and HTTP contracts |
| Local end-to-end test | Capture through completed Insights with controlled audio |
| Production smoke test | Routing, configuration, and external connectivity |

Production smoke tests require approval immediately before execution.

## Scenario matrix

### Partner and key boundaries

- Partner A cannot read or mutate Partner B state.
- Dashboard-session authentication cannot be replaced by a public token.
- Embed keys can create only within allowed origins.
- Partner secret keys never appear in browser configuration or public examples.
- Expired, reused, malformed, and wrong-Partner public tokens fail consistently.

### Capture and Pipeline

- Capture link mints a Session with the correct Target.
- Hosted capture, widget, and React SDK produce compatible legacy requests.
- Valid audio completes with transcript and Insights.
- Invalid media fails before paid providers.
- Provider failure marks the Session failed through the shared failure path.
- Finalize retry does not create duplicate Pipeline work.

### Dashboard and delivery

- Dashboard totals, recent Sessions, topics, sentiment, urgency, and Target views
  come from authenticated Partner data.
- Pagination does not redefine an all-time aggregate.
- Webhook delivery signs the stable event identity on every retry.
- SSRF-blocked destinations never receive a network request.
- Urgent-alert code runs only for qualifying Insights and reports send failure.

### Operations

- Detailed health distinguishes database, Redis, and queue failure.
- Monitor polling uses the cached, bounded Redis path.
- CI runs the full set of checks designated as release-blocking.

## Finding workflow

For every suspected defect:

1. name the externally observable failure;
2. write or identify a test seam;
3. run it and record whether the defect reproduces;
4. classify the reproduced finding under the program policy;
5. repair Blocker and Important findings through red-green TDD;
6. rerun the affected seam and the full relevant suite.

An old audit statement is not a reproduced finding.

## Non-goals

- media-pinning finalize, workers, clients, or rollout
- Insights query expansion
- new capture features or dashboard analytics
- broad UI redesign
- RAG, MCP, embeddings, or adaptive follow-up
- production mutation without a release gate

## Implementation gate

This specification passes only when:

- API, web, QuickLube, and React SDK builds pass.
- Full API and React SDK suites have no unexplained failures.
- The five previously recorded failures are fixed or proven obsolete.
- One controlled capture reaches completed Insights.
- Capture-link Target attribution passes.
- Partner isolation, public-token, embed-key, and secret-key boundaries pass.
- Dashboard aggregate semantics pass.
- Webhook and urgent-alert success and failure behavior have evidence.
- CI contains the agreed release-blocking checks.
- Every Blocker and Important finding is resolved or explicitly accepted.
- Standards and Spec reviews have no unresolved Critical or Important findings.

## Completion receipt

Record:

- exact commit or diff base;
- every command and exit result;
- scenario evidence;
- reproduced and rejected audit findings;
- remaining accepted limitations;
- production smoke checks run or not run;
- state as implemented, released, or complete.

Specification 2 cannot start before this receipt is approved.
