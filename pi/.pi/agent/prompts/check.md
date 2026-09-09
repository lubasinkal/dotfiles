---
description: Run typecheck + linter, fix all errors, re-run until clean
---
1. Discover checker/linter from `package.json`/`tsconfig`/`Makefile`/CI.
2. Run each as separate `bash` call (`lint-cmd` first if non-trivial).
3. Fix all errors with smallest edits, re-run until clean. Report commands + pass/fail.
