# BRD-NN: {Title}

## Document Control

| Field | Value |
| --- | --- |
| Project Name | Hearloop |
| Document Version | 1.0 |
| Date | YYYY-MM-DD |
| Document Owner | |
| Prepared By | |
| Status | Draft / In Review / Approved |
| BRD Type | Platform / Feature |

### Document Revision History

| Version | Date | Author | Changes |
| --- | --- | --- | --- |
| 1.0 | YYYY-MM-DD | | Initial draft |

---

## 1. Executive Summary

{One page max: business problem, proposed investment, expected outcome, decision needed.}

---

## 2. Business Context

### 2.1 Market / problem context

{Why now? Who suffers without this?}

### 2.2 Strategic alignment

{Portfolio, learning goals, competitive position — cite CONTEXT.md / conversation, not fictional strategy/ folder.}

### 2.3 Current state

{What exists today in the product — factual from repo.}

---

## 3. Stakeholder Analysis

| Stakeholder | Interest | Success looks like |
| --- | --- | --- |
| Partner | | |
| End user | | |
| Builder / owner | | |

### 3.6 Technology Stack Prerequisites

**Platform BRD:** populate with stack choices and rationale.

**Feature BRD:** N/A — see existing platform: `context/INFRA.md`, `CONTEXT.md`, {list specific dependencies}.

### 3.7 Mandatory Technology Conditions

**Platform BRD:** non-negotiable constraints (cost caps, regions, compliance).

**Feature BRD:** N/A — see Platform / INFRA: {list inherited conditions}.

---

## 4. Business Requirements

Format: `BRD.NN.01.xx` — business outcomes, not APIs.

### BRD.NN.01.01: {Title}

{Requirement statement}

---

## 5. Success Criteria

Format: `BRD.NN.06.xx` — measurable at business level.

### BRD.NN.06.01: {Title}

{Criterion and how measured — link to context/METRICS.md where applicable.}

---

## 6. Constraints and Assumptions

### Constraints

- {Budget, timeline, scope, authority gates}

### Assumptions

- {Classified: verified / default / unresolved}

---

## 7. Architecture Decision Requirements

Topics needing ADR **later** — list topics, not ADR numbers.

### 7.1 Overview

{How many topics Selected / Pending / N/A}

### 7.2 Mandatory topics

For each Selected topic include: Business Driver, Business Constraints, Alternatives Overview (cost table), Cloud Provider Comparison (if infra), Recommended Selection, PRD Requirements.

#### BRD.NN.32.01: Infrastructure

**Status:** Selected / Pending / N/A

#### BRD.NN.32.02: Data Architecture

**Status:**

#### BRD.NN.32.03: Integration

**Status:**

#### BRD.NN.32.04: Security

**Status:**

#### BRD.NN.32.05: Observability

**Status:**

#### BRD.NN.32.06: AI/ML

**Status:**

#### BRD.NN.32.07: Technology Selection

**Status:**

---

## 8. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| | | | |

---

## 9. Traceability

### Upstream

| Source | Reference |
| --- | --- |
| Domain glossary | CONTEXT.md |
| Design spec | {path or null} |
| Approved PRD/spec | {path or null} |

### Downstream

| Artifact | Reference |
| --- | --- |
| PRD / spec | {path} |
| Tickets | {GitHub issues when authorized} |
| ADRs | {topics from §7 — no numbers until written} |

### Related BRDs

| Relationship | BRD |
| --- | --- |
| @depends-brd | {BRD-NN or null} |
| @related-brd | {BRD-NN or null} |

---

## 10. Out of Scope (Business)

{Business capabilities explicitly not pursued in this initiative.}

---

## 11. Glossary

Use `CONTEXT.md` terms. Add BRD-specific terms only if new.

---

## 12. Appendices

{North-star, parked ideas, cost notes, review verdicts.}
