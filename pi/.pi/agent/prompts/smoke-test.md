---
description: Smoke-test a built app the reliable way
---
Build synchronously → start server → test sequentially. Never background processes during smoke tests (gives false failures, all routes return '000'). If port 3000 is a stale dev server (EADDRINUSE), use an alternate port (e.g. 3210).
