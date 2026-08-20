---
description: Generate commit message from staged changes
---
Write a conventional commit message from `diff-hunks` tool. Format: `<type>: <summary>` under 72 chars.
Then stage the changes with `git add -p` and commit with `git commit -m "<message>"`.
