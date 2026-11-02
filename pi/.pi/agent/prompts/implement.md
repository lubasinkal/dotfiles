---
description: Scout, plan, then implement — one subagent chain
argument-hint: "[task]"
---
Run a subagent chain for: $@.

Pass each result to the next step as `{previous}`. Stop and report if the plan is ambiguous, a check fails non-trivially, or the worker touches files outside the plan.
