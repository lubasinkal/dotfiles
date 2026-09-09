---
description: Plan before coding — confirm scope, check patterns, propose simplest verifiable change
argument-hint: "[task]"
---
Understand the requirement: $ARGUMENTS.

1. Scope: restate goal in one testable sentence. Non-goals explicitly out.
2. Recon: locate relevant code with `code-index`/`fd`/`snippet`, `read` sections. Cite `file:line`.
3. Patterns: note existing conventions to follow (naming, errors, tests).
4. Proposal: simplest solution, files to change + dead code to clean alongside.
5. Checks: named verify commands (package.json/Makefile/CI). Risks + open questions — never assume.
