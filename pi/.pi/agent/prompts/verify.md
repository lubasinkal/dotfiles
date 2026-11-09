---
description: Run the checks for what changed — fixing until green
---
1. Checks in this repo: the TS suites in `pi/.pi/agent/test-*.ts` (`cd pi/.pi/agent && node test-bg.ts` — use the real path, not the `~/.pi` symlink). Elsewhere look for `package.json` scripts, `tsconfig`, `Makefile`, or CI config.
2. Run the checks that cover what you changed, one command per `bash` call (`bg start` if one is slow). Record pass/fail for each.
3. Fix forward with the smallest edits and re-run until clean. A non-trivial failure means stop and report. If the touched area has no check, say so — do not invent one.

Do not report done without green output plus a `files-changed`/`diff-hunks` summary.
