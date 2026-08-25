# Hearloop Engineering Closure Program

**Status:** Approved design
**Mode:** Guided
**Purpose:** Finish and verify the existing product before expanding scope

## Goal

Move Hearloop from a set of released, implemented-but-inactive, and builder-demo
capabilities to three explicit completion receipts:

1. the released workflow is trustworthy and reproducible;
2. new media can be pinned, processed, and removed by exact object version;
3. Insights query can return inspectable count, list, and quote results over
   eligible pinned Sessions.

This program closes existing work. It does not create a new product direction.

## Sequence

| Gate | Specification | Outcome |
| --- | --- | --- |
| 1 | [Released Workflow Verification and Safety Baseline](2026-08-24-released-workflow-verification-design.md) | Existing behavior is reproducible and unexplained release blockers are closed |
| 2 | [End-to-End Media Evidence Pinning](2026-08-24-media-evidence-pinning-completion-design.md) | New captures can use an exact audio version without breaking legacy capture |
| 3 | [Insights Query Completion](2026-08-24-insights-query-completion-design.md) | The builder can count, list, quote, and inspect eligible Sessions with strict Partner isolation |

Exactly one specification is active. The next specification starts only after
the previous implementation gate has a signed completion receipt.

## Status model

- **Implemented:** scoped tests and review pass; code may remain unreleased.
- **Released:** an explicitly authorized deployment or migration is followed by
  fresh release verification.
- **Complete:** agreed operational checks, ownership, and follow-up are recorded.

Passing tests never imply deployment, protocol activation, or Partner exposure.

## Finding policy

Every finding discovered during a specification is classified before repair:

- **Blocker:** breaks the target workflow, exposes credentials or Partner data,
  violates isolation, or permits known-broken code to release.
- **Important:** produces misleading behavior, silently loses an expected
  delivery, or invalidates the next specification's assumptions.
- **Deferred:** real but outside the active specification and not a dependency.

Blockers and Important findings are resolved or explicitly accepted before the
active specification passes. Deferred work does not expand the active scope.

## Program-wide authority

The following always require a fresh human gate:

- production deployment;
- database or infrastructure mutation;
- changing new Sessions from `legacy-v0`;
- enabling Insights query for a Partner;
- destructive cleanup against production data;
- merge, push, or pull-request creation;
- accepting a Blocker or Important finding instead of resolving it.

## Program-wide review

Each specification ends with:

1. comparison against every requirement in its design;
2. separate Standards and Spec reviews;
3. resolution of every Critical and Important review finding;
4. fresh scoped tests and builds;
5. a completion receipt listing commands, results, limitations, and checks not
   run.

## Excluded program work

- RAG, embeddings, vector databases, and knowledge graphs
- MCP access
- adaptive follow-up questions
- open-source platform packaging
- billing, SSO, or staff-role expansion
- new verticals or capture modalities
- unrelated dashboard analytics
- Partner recommendations, ticketing, or operational prescriptions

## Program completion

The program is implemented when all three implementation gates pass. It is
released only when separately approved release gates for media activation and
Insights query exposure pass. It is complete only after the agreed operational
signals and owners are recorded.
