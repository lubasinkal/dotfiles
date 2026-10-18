---
description: Full implementation workflow — scout gathers context, planner creates plan, worker implements
argument-hint: "[task]"
---
Use the subagent tool with chain for: $@.

Pass each result as {previous}. Stop and report if the plan is ambiguous, a check fails non-trivially, or the worker reports out-of-scope files.
