---
description: Draft a conventional commit message from staged changes
---
1. `diff-hunks` with `staged: true`. If nothing is staged, say so — do not stage anything.
2. Write `<type>: <summary>` under 72 characters (`feat`, `fix`, `chore`, `docs`, `refactor`, `test`).
3. Body: bullet what and why, taken from the real hunks. Stage and commit only when asked.
