# Agent Rules

## Search
- `snippet`/`rg`/`fd`/`code-index`/`memory_search` — never bash grep/find/awk/ripgrep.
- The `rg`/`fd` tools accept any path — pass `path=` for files or dirs (e.g. `path: /tmp/ghostty-man.txt`). Never pipe shell output through grep/head/awk/sed.
- Filter with tool params (`path`, `glob`, `limit`, `maxResults`, `context`), never shell pipes.
- `read` only needed sections (`offset`/`limit`) — never whole files.
- Answer with file:line anchors. Never invent APIs or line numbers — flag or verify.

## Execute
- Bash = execution + aggregation only. NEVER write search commands in bash: no `grep`/`find`/`awk`/`sed`/`ripgrep` in a bash call, not even as a pipe — use the dedicated tools.
- Prioritize `tools:` — always look up the available tools in context and use them; never fall back to bash grep/find/awk/sed/ripgrep.
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
