---
description: Generate conventional commit message from staged changes
---
1. `diff-hunks` with `staged: true`. If empty, report nothing-to-commit — do not stage.
2. Write `<type>: <summary>` under 72 chars (types: feat, fix, chore, docs, refactor, test).
3. Body: bullets of what/why from real hunks. Stage with `git add -p`, commit with `git commit -m "<message>"` only when told.
