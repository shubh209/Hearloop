# End-to-End Media Evidence Pinning

**Status:** Approved design
**Sequence:** 2 of 3
**Program:** [Hearloop Engineering Closure Program](2026-08-24-engineering-closure-program-design.md)
**Prerequisite:** Approved completion receipt for [Released Workflow Verification and Safety Baseline](2026-08-24-released-workflow-verification-design.md)

## Goal

Associate every new versioned Recording with the exact S3 object version the End
user uploaded. Validation, transcription, deletion, expiry, and retries must use
that authority while all `legacy-v0` capture clients remain compatible.

## Existing foundation

- S3 bucket versioning is enabled.
- Migration 011 provides Session protocol, upload-grant, Recording-version, and
  finalize-receipt fields.
- Version-aware S3 signing, HEAD, GET, and DELETE primitives exist.
- Public and authenticated routes can issue replay-safe versioned upload grants.
- New Sessions still default to `legacy-v0`.

These foundations are prerequisites, not end-to-end pinning.

## Authoritative flow

```text
Client creates upload attempt and SHA-256
        ↓
API validates and persists a versioned upload grant
        ↓
Client uploads with required signed headers
        ↓
Client submits grant and returned S3 version evidence to finalize
        ↓
Server verifies the exact S3 version
        ↓
One transaction selects the Session winner and stores Recording plus receipt
        ↓
Reconciliation guarantees one expected Pipeline start
        ↓
Workers load the Recording and read its exact version
        ↓
Deletion and expiry remove that exact version
```

Client values are evidence to verify. The persisted Recording is authoritative
after finalize.

## Finalize contract

Versioned finalize must verify:

- authenticated or public-token Partner/Session ownership;
- Session protocol and lifecycle;
- upload-grant identity, Partner, Session, state, and expiry;
- bucket and key from the persisted grant;
- exact S3 VersionId;
- expected and observed SHA-256;
- expected and observed byte length;
- expected and observed MIME type;
- observed ETag;
- one authoritative Recording per Session.

On success, one database transaction:

1. selects or creates the winning finalize receipt;
2. pins the exact Recording metadata;
3. marks the grant pinned;
4. advances the Session once;
5. records the durable enqueue obligation.

The HTTP response comes from the stored receipt. A replay never invents a new
response.

## Concurrency and recovery

- Same identity and same request returns the stored result.
- Same identity with different media is rejected.
- Different finalize identities racing for one Session converge on one Recording.
- Losing requests receive the winner's durable result.
- Crash after commit and before queue acknowledgement is recoverable through a
  database-backed enqueue marker and reconciliation.
- Reconciliation never starts the Pipeline twice for one accepted transition.
- Storage and database errors are sanitized; logs keep correlation identifiers,
  not signed URLs or secret media identifiers.

## Exact-version Pipeline reads

- Validation receives a Recording id, loads the row, and reads the stored
  bucket/key/VersionId.
- Transcription reloads the authoritative Recording and reads the same version.
- An overwrite of the object key after finalize cannot change processed bytes.
- Missing, inaccessible, or integrity-mismatched pinned media fails the Session
  through the shared failure path.
- Legacy Sessions retain the current key-only behavior.

## Deletion, expiry, and abandoned uploads

- Deleting or expiring a versioned Session deletes only its pinned VersionId.
- Repeated deletion treats an already-absent exact version as converged success.
- Every unpinned grant moves through explicit active, pinned, expired, cleanup-
  leased, and cleaned/failed ownership states.
- Cleanup leases are bounded and recoverable after worker failure.
- Cleanup reads explicit grant rows; it never deletes by broad prefix.
- Pinned, active, unrelated, and legacy objects are excluded.
- Cleanup failure records retryable state and an operational signal.

## Capture-client contract

Hosted capture, `widget.js`, and `@hearloop/react` each:

1. create an upload-attempt UUID;
2. compute Base64 SHA-256 for the exact bytes;
3. request a versioned upload grant;
4. PUT the same bytes with every required signed header;
5. retain VersionId and ETag from the upload response;
6. submit the versioned finalize request;
7. safely retry grant, PUT, and finalize without changing the attempt identity;
8. preserve current legacy behavior while the Session is `legacy-v0`.

The three clients share one protocol contract and fixtures. Their implementations
may differ only at the browser/SDK boundary.

## Telemetry

Record bounded counters and structured events for:

- grant issued, replayed, conflicted, expired, and abandoned;
- finalize accepted, replayed, conflicted, and failed;
- missing VersionId and metadata/integrity mismatch;
- committed Session missing accepted Pipeline work;
- exact-version read and deletion failure;
- cleanup lease recovery;
- `legacy-v0` and `versioned-v1` Session counts.

Define signal meaning and owner before production activation. Thresholds may be
proposed in the implementation plan but require release approval.

## Test matrix

| Layer | Required evidence |
| --- | --- |
| Storage unit | Commands, metadata, bytes, checksums, exact delete, sanitized failure |
| Database contract | Constraints, receipts, grant states, enqueue marker, concurrent winner |
| Route integration | Public/auth finalize, replay, conflict, ownership, expiry, legacy |
| Worker integration | Exact validation/transcription reads and shared failure behavior |
| Client contract | Equivalent grant, PUT, finalize, and retry semantics for all clients |
| Fault injection | Crashes around PUT, finalize transaction, enqueue, worker reads, cleanup |
| Live S3 contract | Multiple versions, exact HEAD/GET/DELETE, exposed headers, empty cleanup prefix |
| End to end | Versioned capture completes; legacy capture completes unchanged |

Required adversarial cases include:

- overwrite the key after finalize and prove workers read the pinned bytes;
- race different finalize identities against one Session;
- lose the first HTTP response and replay every step;
- crash after database commit and before queue acceptance;
- expire an unpinned grant while finalize attempts to claim it;
- repeat exact deletion after the version is absent;
- attempt cross-Partner grant and finalize access.

## Rollout

1. Pass all local and staging tests with seeded versioned Sessions.
2. Verify all three clients while new Sessions still default to `legacy-v0`.
3. Deploy compatible server/client code under a separate release authority.
4. Run one explicitly authorized versioned canary.
5. Verify capture, exact processing, delivery, deletion, and telemetry.
6. Request approval before changing the default for new Sessions.
7. Maintain legacy reads and operations while legacy Sessions remain.

Rollback before any versioned Session may remove inactive schema/code only under
an approved plan. After versioned Sessions exist, rollback means restoring the
default to `legacy-v0` while preserving versioned read, processing, and cleanup
support.

## Non-goals

- Insights query implementation
- general retention redesign beyond ownership of media in this protocol
- multipart uploads or new storage providers
- new capture modalities
- production default flip from implementation approval
- RAG, MCP, or AI changes

## Implementation gate

This specification passes when:

- every test layer passes;
- all three capture clients implement the versioned contract;
- one seeded versioned Session reaches completed Insights;
- overwrite-after-finalize proves exact worker reads;
- concurrent finalize produces one authority and one effective Pipeline start;
- exact deletion and abandoned-upload cleanup converge;
- legacy capture remains unchanged;
- required telemetry exists with documented meaning;
- Standards and Spec reviews have no unresolved Critical or Important findings.

A seeded pinned-Session corpus produced by this gate unlocks Specification 3.
Production activation remains a separate release decision.
