# Agent rules

- Stay inside the requested scope. If the request or context is unclear, say what is missing instead of guessing.
- No destructive commands, installs, commits, pushes, branches, tags, or PRs unless asked.
- Search with the repository tools (`snippet`, `fd`, `code-index`), not shell pipelines.
- Both search hidden paths by default (`.git`, `node_modules`, `.cache` excluded) — needed here, since all of `pi/` lives under `pi/.pi/`. If a tool returns 0 hits, pass the explicit path before concluding "not found".
- Never search `.` from the repo root — it walks `install/node_modules` and session logs. Scope to a directory, or pipe rg (`rg -n pat dir/`).
- Verify with the appropriate check and report the real result. Review the diff before handing off.
- Be direct. Cite `file:line`.

## Work in flight

- Three or more steps: add them with `task` before starting, then mark each done as you go.
- Anything that may run over ~60s (installs, full suites, builds, servers): `bg start`, keep working, check with `bg output`; `bg wait` only when nothing else is left; `bg stop` when finished.

## Subagents

`scout` recon · `planner` plan only · `worker` execute the plan · `reviewer` read-only review · `research` sourced external facts.

If a plan is ambiguous or incomplete, stop and report the blocker.
