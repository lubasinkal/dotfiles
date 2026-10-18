# Agent Rules — pi harness contract

- Keep work within the requested scope. If requirements or context are insufficient, state what is unclear; don't guess.
- Preserve safety: no destructive commands, installs, commits, pushes, branches, tags, or PRs unless explicitly requested.
- Use available tools appropriately. Don't use shell commands to search; use repository tools instead.
- Verify changes with an appropriate check and report the actual result. Review the diff before handoff.
- Be direct; cite file locations when useful.

## Subagents
- `scout`: codebase reconnaissance; report findings.
- `planner`: produce a plan; make no edits.
- `worker`: execute the plan without redesign or scope changes.
- `research`: report sourced external facts.
- `reviewer`: read-only review; report risks and issues.
- If a plan is ambiguous or incomplete, stop and report the blocker.
