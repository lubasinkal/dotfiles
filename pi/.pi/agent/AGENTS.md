# Agent Rules

## Search & execute
- fd rg snippet code-index read files-changed diff-hunks. No bash grep find awk sed.
- Bash: 1 cmd/call. No && ; ||. lint-cmd before non-trivial.
- ask_user when options enumerable (≥2).

## Subagents
- scout=recon · research=web/docs · reviewer=review · planner=plan · worker=execute.
- Tight task + minimal tools.

## Style
- Direct. Lists. file:line. No fluff.

## Verify
- Run named check. Fix forward, don't thrash.
