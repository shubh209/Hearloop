# Domain docs

How engineering work consumes this repository's domain documentation.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root.
- **`docs/adr/`** records that touch the area you are about to work in.

This repository is **single-context**: one glossary at root `CONTEXT.md`. Continue with the files that exist. Create domain files when a term or decision is actually resolved.

**Done when:** glossary terms in play are loaded from `CONTEXT.md`, and ADRs that touch the area are loaded when those files exist.

## Use the glossary's vocabulary

When output names a domain concept, use the term as defined in `CONTEXT.md`. If the concept is missing, either the work is inventing language the project doesn't use, or there is a real gap to note for later domain modeling.

## Flag ADR conflicts

If output contradicts an existing ADR, surface it:

> Contradicts ADR-\<id\> (\<title\>) — worth reopening because…
