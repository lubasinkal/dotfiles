---
description: Find and remove dead code — unused imports, params, exports, files
argument-hint: "[path]"
---
Target: ${@:-whole repo}. Scan with `snippet`/`code-index`/`fd`:

1. Unused params, imports, exports, files, stale references.
2. Remove completely — signature, call sites, tests, docs. One `edit` per logical change.
3. Verify with project check + `files-changed`/`diff-hunks`. Report removed lines + verify pass/fail.
