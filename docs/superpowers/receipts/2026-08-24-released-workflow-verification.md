# Released Workflow Verification — Implementation Receipt

- Issue: #7
- Specification: `docs/superpowers/specs/2026-08-24-released-workflow-verification-design.md`
- Plan: `docs/superpowers/plans/2026-08-24-released-workflow-verification.md`
- Diff base: `eab2e42`
- Evidence HEAD before Task 11: `6cc5b85ba3727078c6acce7583978ad8bea677a9`
- Final reviewed implementation HEAD: `af1eeb8`
- State: implemented, not released

## Controlled workflow evidence

The controlled Fastify test exercises Capture-link creation, Session minting and
open, legacy upload URL and finalize, recording validation, transcription,
analysis, Partner dashboard projection, webhook enqueue/signing, and the urgent
alert boundary. Database, queue, storage, transcription, analysis, webhook, and
alert adapters are in-memory or controlled. It makes no S3, Redis, SES, model,
provider, or network call.

| Command | Exit | Evidence |
| --- | ---: | --- |
| `npm test --workspace=apps/api -- src/routes/__tests__/released-workflow.e2e.test.ts` | 0 | 1 suite passed; 1 test passed |
| `ruby -e 'require "yaml"; YAML.load_file(".github/workflows/docker-image.yml"); puts "workflow YAML: PASS"'` | 0 | `workflow YAML: PASS` |
| `git diff --check` (before the full matrix) | 0 | no output |

The controlled test first failed while its test adapters were connected: Jest
rejected hoisted references, the Capture-link fake did not yet join Partner
defaults, and the fake dashboard join allowed a Recording id to shadow the
Session id. All three corrections were confined to the test adapter. No direct
cross-task production contract mismatch was reproduced, so no production code
was changed by Task 11.

## Disposable PostgreSQL migration contract

The first sandboxed attempt could not create a PostgreSQL shared-memory segment
(`Operation not permitted`) and did not initialize a cluster. The required
command was rerun with the approved local-process permission against a fresh
cluster at `/tmp/hearloop-spec1-pg.m8MapL` on `127.0.0.1:55439`.

| Command | Exit | Evidence |
| --- | ---: | --- |
| `/Library/PostgreSQL/17/bin/initdb -D "$spec1_pg_dir" -A trust` | 0 | disposable PostgreSQL 17 cluster initialized |
| `/Library/PostgreSQL/17/bin/pg_ctl -D "$spec1_pg_dir" -o "-p 55439 -h 127.0.0.1" -w start` | 0 | server accepted local connections on port 55439 |
| `/Library/PostgreSQL/17/bin/createdb -h 127.0.0.1 -p 55439 hearloop_test` | 0 | disposable database created |
| `TEST_DATABASE_URL=postgresql://127.0.0.1:55439/hearloop_test bash packages/db/tests/011_media_evidence_pinning.test.sh` | 0 | `011_media_evidence_pinning migration contract: PASS` |
| `/Library/PostgreSQL/17/bin/pg_ctl -D "$spec1_pg_dir" -m fast -w stop` | 0 | server stopped |

The constraint-error log lines are expected negative assertions performed by
the migration contract; its final result was PASS. No developer or production
database URL was used.

In CI, the PostgreSQL 17 service starts with an empty `hearloop_test` database.
After the API build and before API Jest, the validation job applies every
checked-in migration in filename order with `psql -X -v ON_ERROR_STOP=1`.
Therefore database-enabled integration suites see the current schema on a clean
runner. The later `011_media_evidence_pinning.test.sh` step remains independent:
it drops and recreates `public`, reapplies its prerequisite migrations, and
asserts the migration compatibility and constraints from a clean schema.

## Fresh local verification matrix

The commands below were run once, sequentially, after the controlled workflow
and CI changes.

| Command | Exit | Evidence |
| --- | ---: | --- |
| `npm run build --workspace=apps/api` | 0 | TypeScript build passed |
| `npm test --workspace=apps/api -- --detectOpenHandles` | 0 | 47 suites passed, 2 skipped; 325 tests passed, 2 skipped; 0 failed |
| `npm run build --workspace=apps/web` | 0 | Next.js production build passed; 10 pages generated |
| `npm run build --workspace=apps/quicklube-demo` | 0 | Next.js production build passed; 4 pages generated |
| `npm run build --workspace=packages/react` | 0 | CJS, ESM, source maps, and declarations built |
| `npm test --workspace=packages/react` | 0 | 4 suites passed; 72 tests passed |
| `npm test --workspace=apps/web` | 0 | 5 suites passed; 16 tests passed |
| `bash scripts/check-browser-secret-examples.sh` | 0 | no browser-secret examples found; no output |
| `git diff --check` | 0 | no output |

No required matrix check was omitted. Existing test-intent console output from
provider fallback and environment-validation cases remained visible, but Jest
reported zero failures.

## Reproduced findings and fixing commits

The implementation ledger records the scoped review evidence. Fixing commits:

- Baseline fixtures and SDK expectations: `ce2be07`
- Partner key rotation and valid Session-token rejection boundary: `29d5b5c`, `9e434f7`, `5e5e9ff`
- Atomic Session-create claim and deterministic PostgreSQL race evidence: `32e1990`, `8a81918`
- Authoritative consent and incomplete Target rejection: `92542d2`, `c18dff8`
- Browser capture, browser-secret scan, and documented example repairs: `dddff17`, `3bc66d8`, `db3236c`, `85d8135`
- Capture-link and Target boundary evidence: `8fcb525`, `7ab860c`
- Serialized, durable, bounded legacy finalize recovery: `ad21ba8`, `2edceb8`, `85eb2f8`, `5ce7f14`, `cb3146d`
- Session expiry scheduling: `d2e44eb`
- All-Session dashboard aggregation: `01448df`
- Delivery and health safety gaps: `6cc5b85`
- Release-blocking CI, controlled workflow, and real finalize/webhook evidence: `0696da2`, `af1eeb8`

Rejected hypotheses, with evidence:

- Task 11 did not reproduce a production cross-task contract mismatch: the
  controlled workflow passed after test-adapter-only corrections.
- A real external-service end-to-end test was unnecessary and unauthorized:
  the controlled test reached every specified production seam without network
  or provider access.

## Release boundary

- Production smoke tests: not run; not authorized.
- Release/deployment: not performed.
- Merge/push: not performed by this worker.
- Specification 2 and Specification 3: not started.
- Accurate state: **implemented, not released**.
