---
description: Stage the changes and commit them with a conventional message
---
1. `files-changed`. If nothing changed, say so and stop. Anything already staged stays out unless it belongs: `git restore --staged <paths>` for the rest. Stage only the paths of **one** logical change; when the diff spans unrelated changes, list the split you'd make and wait — do not commit them together.
2. Message: `<type>: <summary>` under 72 characters (`feat`, `fix`, `chore`, `docs`, `refactor`, `test`), then bullets for what and why, from `diff-hunks` with `staged: true`.
3. `git commit -m` for one line, `git commit -F - <<'MSG' … MSG` for a body. No `--amend`, no `--no-verify`, no push. Report the hash and `git show --stat`.
