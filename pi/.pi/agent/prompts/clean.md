---
description: Find and remove dead code
argument-hint: "[path]"
---
Target: ${@:-the whole repo}. Find with `snippet`, `code-index`, `fd`:

1. Unused imports, parameters, exports, files, and stale references.
2. Remove each completely — definition, call sites, tests, docs. One `edit` per logical change.
3. Verify with the project check, then `files-changed`/`diff-hunks`. Report what was removed and whether verify passed.
