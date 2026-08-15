# Domain docs

How engineering work consumes this repository's domain documentation.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root.
- **`docs/adr/`** — read ADRs that touch the area you are about to work in.

If any of these files don't exist, **proceed silently**. Do not flag their absence; do not suggest creating them upfront. Domain files are created when terms or decisions are actually resolved.

This repository is **single-context**: one glossary at root `CONTEXT.md`. There is no `CONTEXT-MAP.md`.

## Use the glossary's vocabulary

When output names a domain concept, use the term as defined in `CONTEXT.md`. Do not drift to synonyms the glossary explicitly avoids.

If the concept is missing from the glossary, either the work is inventing language the project doesn't use, or there is a real gap to note for later domain modeling.

## Flag ADR conflicts

If output contradicts an existing ADR, surface it rather than silently overriding.
