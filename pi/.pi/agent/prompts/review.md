---
description: Review staged + unstaged changes for bugs, types, security, dead code
---
1. `files-changed` → `diff-hunks` with `staged: true`, then working tree (default).
2. Context: trace each hunk via `code-index`/`snippet`/`fd`, `read` sections — not just diff lines.
3. Check: bugs/logic, type errors, error handling, dead code/incomplete cleanup, security (injection, authz, secrets, SSRF, traversal, leaks).

Output: Files Reviewed (path + L range) / Critical (file:line + fix) / Warnings / Suggestions / Summary (risk low/med/high, merge yes/yes-with-fixes/no, what verification closes gap).
