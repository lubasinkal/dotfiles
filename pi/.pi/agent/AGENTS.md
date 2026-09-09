# Agent Rules — pi harness contract

## Search first, never guess
- Locate with `code-index` (symbol defs) → `fd` (file names) → `snippet` (content) → `read` (offset/limit sections).
- Never `bash` for search: no `grep/rg/find/awk/sed`, no `ls|grep`. `bash` is for named verify commands only.
- Every claim cites `path:line`. Not found → say so, never invent paths, APIs, or flags.
- `read` sections, not whole files. Failed/ambiguous tool → switch tools, don't retry blindly.

## Execute small
- `bash`: 1 command per call. No `&&`/`;`/`||` chains. `lint-cmd` before non-trivial/destructive commands.
- `edit`: smallest change that satisfies the step, one logical change per call. `write` only for new files / full rewrites.
- No `rm -rf`, `chmod 777`, interactive shells, installs, commits, push, branch, tag, PR unless explicitly told.

## Subagents — tight task + minimal tools
- `scout` = recon only (locate, read, report). `research` = external facts with URL + date cites. `reviewer` = read-only review. `planner` = plan only, no edits. `worker` = execute plan verbatim, no redesign.
- Chain with `{previous}`: scout → planner → worker. Single task per call, pass only needed context.
- Ambiguous/incomplete plan → STOP and report, don't improvise. Ask one `ask_user` question when options are enumerable (2-5).

## Style
- Direct. Lists. `file:line`. No fluff, no paraphrase of quoted code, no scope creep.

## Verify before done
- Discover check from `package.json` scripts / `Makefile` / CI config first. Run the plan's named check, re-run until clean.
- `files-changed` → `diff-hunks` (staged + unstaged) before every review/commit/handoff. Report real diffs + pass/fail, never "done" without verification.
- Fix forward if trivial, else stop and report deviations, risks, open blockers.
