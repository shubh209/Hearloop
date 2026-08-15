# Hearloop backlog

Last updated: August 15, 2026

This file lists unfinished work only. Completed implementation history remains
in Git and measured outcomes remain in `context/METRICS.md`.

## P1 — Complete media evidence pinning

The schema, version-aware storage primitives, and idempotent upload-grant
issuance are implemented. New Sessions remain `legacy-v0` until capture clients
support the versioned contract.

1. Implement finalize-time exact-version pinning for public and authenticated
   routes, including idempotency and integrity checks.
2. Make validation and transcription workers read the pinned S3 VersionId.
3. Make Session deletion and expiry delete exact versions; add scoped cleanup
   for abandoned, unpinned upload versions.
4. Add telemetry, rollout, rollback, and legacy-Session verification.
5. Apply migration `011_media_evidence_pinning.sql` only through a separately
   approved migration/release stage.

See `context/research/hearloop-platform-design-roadmap.best-effort-73.5.md` and
the media-pinning design/plan documents under `docs/superpowers/`.

## P1 — Production validation

1. Scan a live Capture link on a phone, record real audio, and verify the
   attributed Session completes and appears in the By-Target dashboard view.
2. Run the prepared ZAP active scan after a fresh API build.
3. Verify urgent-alert email delivery and failure signals with a production-like
   negative-and-urgent Session.

## P2 — Operational follow-through

1. Resolve the API `env.test.ts` fixture drift for
   `PARTNER_SESSION_SECRET` without weakening startup validation.
2. Resolve the React SDK's three stale `apiKey` versus `embedKey` message
   expectations.
3. Decide ownership and thresholds for media-integrity failures, abandoned
   grants, exact-version deletion failures, queue depth, and webhook dead rows.
4. Measure post-rollout latency, storage growth from retained versions, safe
   Session completion, and human intervention rate.

## Deferred product work

- Promote capture-link Target metadata into a `feedback_targets` identity model
  only when merge/management UX is justified.
- Improve signage-oriented Hosted capture guidance and microphone-permission
  recovery after the live-phone capture baseline is recorded.
- Add webhook replay UI only after real Partner demand validates the workflow.
