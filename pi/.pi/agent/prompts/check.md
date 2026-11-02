---
description: Check and lint, fixing every error until clean
---
1. Find the checker from `package.json`, `tsconfig`, `Makefile`, or CI config.
2. Run each as its own `bash` call (`lint-cmd` first if the command is non-trivial).
3. Fix with the smallest edits, re-run until clean. Report the commands and pass/fail.
