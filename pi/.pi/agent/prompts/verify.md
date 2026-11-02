---
description: Run the test suite and typecheck, fixing until green
---
1. Find the suite from `package.json` scripts, `Makefile`, or CI config; pick the narrowest named one.
2. One command per `bash` call (`lint-cmd` first if non-trivial). Record pass/fail.
3. Fix forward with the smallest edits and re-run. A non-trivial failure means stop and report.

Do not report done without green output plus a `files-changed`/`diff-hunks` summary.
