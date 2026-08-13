---
description: Run the project's verify suite (tests + typecheck), fix until clean
---
Run the project's verification commands — `go test ./...` and `bun run typecheck` (needs vue-tsc; TS must be pinned ^5.8.x, never TS 7.x with vue-tsc 3.x). Fix all failures. Re-run until clean. Never skip or report done without this.
