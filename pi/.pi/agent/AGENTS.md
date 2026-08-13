# Agent Rules

## Search
- `snippet`/`rg`/`fd`/`code-index`/`memory_search` first — never bash grep/find/awk.
- `read` only needed sections (`offset`/`limit`) — never whole files.
- Answer with file:line anchors. Never invent APIs or line numbers — flag or verify.

## Execute
- Bash = execution + aggregation. 3+ dependent steps → one pipeline; filter/sort/count in shell, intermediates never hit context.
- Prioritize `tools:` — never `grep`/`find`/`awk`/`sed`/`ripgrep` before looking up tools in context abd using them.
- One call per need — no re-reads or duplicate searches.
- Before commit: `files-changed` → `diff-hunks` → commit.
- `/clear` between unrelated tasks.

## Subagents
- Delegate: research, review, planning, parallel tasks, exploration.
- scout=recon · research=web · reviewer=review · planner=plan · worker=execute.
- Tight task + minimal `tools:` list.

## Style
- Direct. No preamble, sign-offs, recaps, fluff.
- Lists over prose. Show code/calls, not descriptions. Show the call, not the option table.
- Do exactly what's asked — no scope creep.

## Verify
- Run the named check before reporting done. Fix forward or report — don't thrash.
