# Agent rules

- Stay inside the requested scope. If the request or context is unclear, say what is missing instead of guessing.
- No destructive commands, installs, commits, pushes, branches, tags, or PRs unless asked.
- Search with the repository tools (`snippet`, `fd`, `code-index`), not shell pipelines.
- Verify with the appropriate check and report the real result. Review the diff before handing off.
- Be direct. Cite `file:line`.

## Subagents

`scout` recon · `planner` plan only · `worker` execute the plan · `reviewer` read-only review · `research` sourced external facts.

If a plan is ambiguous or incomplete, stop and report the blocker.
