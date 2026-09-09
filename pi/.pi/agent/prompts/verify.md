---
description: Run project verify suite (tests + typecheck + lint), fix until clean
---
1. Discover: `package.json` scripts, `Makefile`, CI config. Pick minimal named suite (e.g. `npm test`, `tsc --noEmit`).
2. Run: 1 command per `bash` call, `lint-cmd` first if non-trivial. Record pass/fail.
3. Fix forward: smallest `edit`, re-run until clean. Non-trivial failure → stop and report.

Never report done without green verify + `files-changed`/`diff-hunks` summary.
