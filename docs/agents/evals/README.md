# Harness evaluation seam

The public evaluation seam is one **task attempt**.

A trial freezes:

- `adapter` — coding-agent product (Cursor, Codex, Kiro, or other)
- `model` — model identifier used by that adapter
- `starting_commit` — repository SHA at trial start
- `task_prompt` — the scenario prompt given to the agent
- `permissions` — allowed tools, network, writes, and external actions
- `budget` — time, tokens, or turn limit
- `condition` — `control` (pre-harness instructions) or `harness` (locked kernel + `docs/agents/workflow.md`)

The evaluator observes:

- visible response text and visible tool/actions
- final repository state

Grading uses only those observables. Multiple valid traces may pass. Hidden reasoning is never required. String inspection of policy documents is not a passing grade.

Each scenario in `scenarios.yaml` lists `observable_pass` predicates and `critical_fail` predicates. A trial **passes** when every `observable_pass` holds and no `critical_fail` occurs. A trial is **RED** when any `observable_pass` fails or any `critical_fail` occurs.

Record results under `results/`. Mark adapters that were not executed as `not_run`.
