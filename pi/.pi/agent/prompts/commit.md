---
description: Split the working tree into logical commits, each with a conventional message
---
1. `files-changed`. Nothing changed → say so, stop. Unstage what doesn't belong: `git restore --staged <paths>`.
2. Split by intent and commit it yourself, in dependency order (schema → server → UI). A migration and the code that needs it are one commit; each commit must still build. Docs/prompt changes are their own. Ask only if unrelated changes share one file.
3. Message: `type(scope): summary`, header ≤72, imperative, lowercase, no period. type ∈ feat fix perf refactor chore docs test build ci style. Then a blank line and `- ` bullets on why and decisions the diff hides, ~72 cols, including migration/deploy steps and `BREAKING CHANGE:` when a route or caller breaks. Write it from `diff-hunks` with `staged: true`.
4. `bun run typecheck` when TS changed. Never commit red.
5. `git commit -F - <<'MSG' … MSG`. No `--amend`, no `--no-verify`, no push unless asked.
6. Report `hash type(scope): subject` per commit, then `git show --stat --oneline`.
