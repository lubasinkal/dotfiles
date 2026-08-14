# Hard Rules — Search & Bash Discipline

## Search: dedicated tools only, never bash
- NEVER run search commands in bash: no `rg`, `fd`, `grep`, `find`, `awk`, `sed`, or `ripgrep` — not standalone, not inside a pipe. Use the dedicated tools: `rg` (content), `fd` (names), `snippet` (code discovery), `code-index` (symbols), `read` (offset/limit), `files-changed` → `diff-hunks` (repo state).
- Filter with tool params (`path`, `glob`, `extension`, `fixed_strings`, `context`, `limit`, `maxResults`) — never shell pipes.
- When multiple lookups are needed, issue parallel dedicated-tool calls.

## Bash: one command per call, no chains
- One logical command per `bash` call. Never chain with `&&`, `;`, or `||`, and never build multi-pipe pipelines.
- A single `|` for aggregation (sort/count/dedup) on tool output is the only allowed pipe.
- "Complex multi-step workflow" means parallel tool calls, not a long bash chain.
- Run `lint-cmd` before any non-trivial bash command.

## Read & repo state
- `read` only the needed sections (`offset`/`limit`), never whole files.
- Repo state always via `files-changed` then `diff-hunks` — never `git status`/`git diff` in bash.
