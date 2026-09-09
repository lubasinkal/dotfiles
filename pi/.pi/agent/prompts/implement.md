---
description: Full implementation workflow — scout gathers context, planner creates plan, worker implements
argument-hint: "[task]"
---
Use the subagent tool with chain for: $@.

1. `scout`: find all code relevant to `$@`. Return file:line findings, key quotes, Start Here, Open Questions.
2. `planner`: create verifiable plan for `$@` using `{previous}`. Per step: file:line + edit + named check. Missing context → Open Questions.
3. `worker`: execute plan from `{previous}` verbatim. Per step: read → smallest edit → run named check → next. Report diffs + pass/fail.

STOP and report on ambiguous plan, failed check (non-trivial), or out-of-scope files. No improvisation.
