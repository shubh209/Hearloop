# Insights Query Completion

**Status:** Approved design
**Sequence:** 3 of 3
**Program:** [Hearloop Engineering Closure Program](2026-08-24-engineering-closure-program-design.md)
**Prerequisite:** Approved implementation receipt and seeded pinned-Session corpus from [End-to-End Media Evidence Pinning](2026-08-24-media-evidence-pinning-completion-design.md)

## Goal

Extend the count-only, feature-flagged builder slice into a deterministic count,
list, quote, and evidence experience over eligible pinned Sessions. Every result
is Partner-scoped and inspectable; unsupported or insufficient requests refuse.

Implementation completion does not authorize Partner exposure.

This specification replaces the unfinished engineering scope in the earlier
Insights query slice documents. It does not override their business launch
restrictions or grant production authority.

## Architecture

Insights query remains a read path on the existing Fastify, Next.js, and
PostgreSQL stack:

```text
Partner dashboard
      ↓ structured intent and allowlisted filters
Authenticated Fastify route
      ↓ server adds Partner and eligible-corpus constraints
PostgreSQL Sessions plus Insights
      ↓
Cited answer, evidence page, or refusal
```

The query path does not write into Insights, start Pipeline jobs, or create a
second backend.

## Request contract

`POST /v1/partners/me/insights-query` accepts:

- intent: `count | list | quote`;
- required half-open `from` and `to` UTC instants;
- optional sentiment: `positive | neutral | negative`;
- optional urgency: `none | follow_up | urgent`;
- optional topic from the existing analysis topic allowlist;
- optional Target key;
- an opaque page cursor for list retrieval.

All fields are allowlisted. Partner identity comes only from the authenticated
dashboard session. The body cannot provide a Partner id, SQL, ordering
expression, or arbitrary field.

The dashboard sends structured intent and filters. Free-text chat and model-
generated parsing are outside this specification.

## Eligible corpus

Every retrieval applies:

- `sessions.partner_id = authenticated Partner`;
- `sessions.status = completed`;
- `sessions.upload_protocol = versioned-v1`;
- complete pinned Recording evidence;
- not deleted;
- `created_at >= from AND created_at < to`;
- maximum range of 90 days.

The same corpus function or query builder is shared by count, list, quote, and
evidence retrieval so their totals cannot drift.

## Response contract

```ts
type CitedAnswer = {
  summary: string;
  totalCount?: number;
  evidenceResultsUrl?: string;
  citations?: Citation[];
  nextPage?: string;
  refusal?: {
    code: string;
    message: string;
    suggestedIntents?: Array<"count" | "list" | "quote">;
  };
};

type Citation = {
  sessionId: string;
  dashboardUrl: string;
  supports: "list_item" | "quote";
  quote?: string;
};
```

Response summaries use deterministic templates. No model writes answer prose.

## Intent behavior

### Count

- Returns an authoritative `totalCount`.
- Returns `evidenceResultsUrl` when `totalCount > 0`.
- Does not embed one citation per matching Session.
- Returns a valid answer when the count is zero.

### List

- Returns matching Session citations ordered by `created_at DESC, id DESC`.
- Uses a page size and maximum page size of 50.
- Encodes the last ordering tuple in an opaque, validated cursor.
- Links every item to Partner-accessible Session detail.
- Includes only factual fields that support the match.

### Quote

- Returns short excerpts from stored transcripts.
- Attaches one real Session citation per excerpt.
- Returns at most 10 citations and discloses additional matches.
- Returns `insufficient_evidence` when no quote evidence matches.

### Refusal and validation

- unsupported intent: `unsupported_intent`;
- range over 90 days: `range_too_wide`;
- missing, equal, or reversed range boundaries: `invalid_range`;
- quote without evidence: `insufficient_evidence`;
- malformed or unknown fields: HTTP 400 with stable code;
- recommendations, strategy, and multi-turn behavior: refusal.

## Evidence results

Replace the current stub with an authenticated evidence route and dashboard
view that:

- re-applies Partner and corpus constraints server-side;
- reconstructs filters from a signed/validated server representation rather
  than trusting client SQL-like state;
- returns stable pages of 50;
- links to current Session detail;
- excludes Sessions deleted before a page is requested;
- shows a generic removed state for a previously opened deleted citation;
- never reveals whether another Partner's Session exists.

Count and evidence retrieval share filters and total semantics. A mismatch is a
test failure.

## Dashboard

The feature-flagged panel provides:

- count, list, and quote intent selection;
- sentiment, urgency, topic, Target, and time filters;
- loading, empty, refusal, validation, and server-error states;
- paginated list and evidence results;
- quote disclosure when more matches exist;
- click-through to accessible Session detail.

When the flag is off, the panel is absent and the route returns 404. Capture,
Pipeline, delivery, and existing dashboard behavior remain unchanged.

## Security and privacy

- Every SQL path includes the authenticated Partner constraint.
- A cross-Partner identifier in a request is rejected as malformed rather than
  probed.
- Unknown fields cannot change query structure.
- Transcript excerpts are returned only through authenticated Partner routes.
- Logs exclude transcript text, citations, raw sensitive filter values, and
  Partner questions.
- Deleted Sessions disappear from refreshed evidence.

Any cross-Partner row, count contribution, identifier, or existence signal is a
release-blocking security failure.

## Observability

Record:

- intent;
- latency;
- refusal code;
- result count;
- evidence-page open;
- feature-flag state;
- server error category.

These signals evaluate the path. They do not establish Partner demand.

## Test matrix

| Layer | Required evidence |
| --- | --- |
| Parser/property | Allowed intents, filters, ranges, cursors, and unknown-field rejection |
| Corpus/query integration | Exact Session-id sets for every filter and intent |
| Route integration | Auth, flag, shape, zero count, refusal, pagination, failure |
| Evidence integration | Shared totals, stable pages, deletion refresh, isolation |
| Dashboard | All intents and loading, empty, refusal, error, paging, click-through |
| Security | Zero cross-Partner counts, rows, ids, quotes, and existence signals |
| Query evaluation corpus | Frozen requests mapped to exact expected Session ids |
| Injection | SQL-shaped values and unknown fields cannot alter retrieval |
| End to end | Seeded pinned corpus supports count, list, quote, evidence, refusal, deletion |

Wrong Session ids fail even when the summary text sounds correct.

## Non-goals

- natural-language chatbot or multi-turn memory
- recommendations or prescribed Partner actions
- embeddings, RAG, vector storage, or knowledge graphs
- external feedback imports
- model training or fine-tuning
- query through webhook, email, MCP, or a public API
- staff-role authorization
- production protocol activation

## Implementation gate

This specification passes when:

- count, list, quote, and evidence work against seeded pinned Sessions;
- every result matches the frozen expected Session-id set;
- zero count and refusal remain distinct;
- list/evidence pagination is stable;
- deleted-Session refresh behavior passes;
- Partner isolation produces zero leaks;
- dashboard flows pass with the flag on;
- existing product behavior passes with the flag off;
- Standards and Spec reviews have no unresolved Critical or Important findings.

## Release gate

Partner exposure additionally requires:

- successful media-pinning production canary;
- explicit authorization for `versioned-v1` Session creation;
- Partner-action evaluation at 15/15;
- classifier injection evaluation at 5/5;
- query citation, refusal, injection, and isolation suites at 100%;
- non-empty eligible production corpus;
- explicit release approval.

The implementation receipt must state which release gates remain.
