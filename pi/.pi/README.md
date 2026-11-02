# Pi agent config

Source-of-truth for the local pi-coding-agent install. Mirrored to `~/.pi/`
via a manual symlink (`~/.pi → ~/dotfiles/pi/.pi`), not stow.

## Deploy convention

- **Repo:** `~/dotfiles/pi/.pi/` (this dir)
- **Live:** `~/.pi/` (symlink to the above)
- All edits to `~/.pi/...` are physical edits here. Edit dotfiles directly.
- `stow pi` is intentionally skipped — the whole-dir symlink replaces per-file symlinks.
- `dotfiles/pi/.gitignore` excludes personal/session state from the public repo (auth, sessions, memory DBs, npm deps).

## Prompt build order

`base` → `AGENTS.md` (workflow/process) → `tool snippets` → `guidelines`
→ `skills` (on-demand) → `before_agent_start` (extensions).

- `AGENTS.md` — harness contract (883 B): scope/safety rules, tool discipline, verification, subagent roster.
- `prompts/` — slash-command templates (check, clean, commit, implement, plan, review, verify).
- `agents/` — subagent system prompts (scout, research, reviewer, planner, worker).
- `skills/` — Agent Skills packs (on-demand). **Not created yet** — no `skills/` dir exists.
- `memory/` — gitignored, intended long-term memory dir. **Not active yet** — `pi-hermes-memory` was removed and no replacement memory extension is installed.

## Extensions (all user-written)

| Dir | Purpose | Tools |
|---|---|---|
| `ask-user/` | TUI multi-choice picker | `ask_user` |
| `bg/` | Detached background shell tasks with on-disk registry (shared with subagents) | `bg` |
| `cmd-opt/` | Bash lint/optimize/cap/block/rewrite engine | `lint-cmd`, `cmd-stats` |
| `context-pruner/` | 3-tier token-budget context collapse | (event hook) |
| `file-search/` | Wraps `fd` with formatting/truncation (content search lives in `snippet`) | `fd` |
| `git-guard/` | Blocks `git commit` when secrets, `.env`/key files, `.only` or `debugger` are staged | (event hook) |
| `quality-gate/` | Post-op git diff scan (`.only`, `debugger`, `@ts-ignore`, `console.log`) | (event hook) |
| `read-cap/` | Caps `read` output to 250 lines | (event hook) |
| `subagent/` | Spawns separate `pi` processes; single/parallel/chain modes | `subagent` |
| `tasktracker/` | Task list with priorities, notes, branch-aware state, optional cross-session `tasks.json` | `task`, `/tasks` || `token-tools/` | Registers efficient primitives defined in `lib/` | `snippet`, `diff-hunks`, `code-index`, `files-changed`, `check` |
| `ui/` | Footer (dir/branch, tokens, ctx%, cost, model) + a work widget above the editor (tasks, running jobs) | (event hook) |
| `atuin.ts` | Records pi's bash commands to Atuin history | (event hook) |

Web search/fetch comes from the npm package `pi-web-access` (below), not a local extension.

## npm packages (`npm/`)

One package is active:

- `pi-web-access` — web fetch/search. Settings entry: `npm:pi-web-access`; dependency pinned in `npm/package.json`.

Removed (unused): `pi-hermes-memory`, `@ollama/pi-web-search`, `context-mode`, `pi-subagents`.

## Secrets

Two mechanisms, kept separate:

- **`~/.pi/agent/auth.json`** + **`trust.json`** — pi's auth + project trust decisions. Gitignored.
- **`~/.config/opencode/secrets.sh`** — opencode env vars (`{env:VAR}` substitution in `opencode/opencode.json`). Auto-sourced by `.zshrc`.

## Tests

Run any of these with plain `node` (22+, type stripping) or `bun`:

- `test-cmd-opt.ts` — cmd-opt lint/rewrite/cap checks.
- `test-tasktracker.ts` — task add/list/sort/edit/errors, branch reconstruction, tasks.json persistence, the `/tasks` panel (live state, `r` refresh, close), and that mutations never rewrite session history.
- `test-bg.ts` — background start/wait/output/stop/clean, exit codes, quoting, process-group kill, pid-reuse safety, on-disk status.
- `test-git-guard.ts` — commit detection, secret/`.env`/debug blocking, `-a` handling, bypass, fail-open outside a repo.
- `test-statusline.ts` — footer content and width fitting, the work widget (task progress, next task by priority, running jobs, idle = no lines).
- `test-hooks.ts` — shared bootstrap; teaches node jiti's `./x.js` → `./x.ts` resolution.

All of them need `node_modules/` in this directory. `install.sh` symlinks it to
`install/releases/<current-version>/node_modules`; without it the
`@earendil-works/*` imports don't resolve.

## Caveats

- **`quality-gate/`** has hardcoded patterns (no config file). Edit `extensions/quality-gate/index.ts` to customize.
- **`git-guard/`** also hardcodes its patterns (secrets, `.env`/key files, `.only`, `debugger`). Bypass a session with `PI_GIT_GUARD=off`. It blocks only `git commit` through the bash tool — commits you make in another terminal are not covered.
- **Tool schemas import `Type` from `typebox`**, not from `@earendil-works/pi-ai`. Pi 1.5.0's published `pi-ai` no longer re-exports `Type` (inside pi it still does), and importing from `typebox` keeps extensions loadable outside pi, which is what the test harness needs. `StringEnum` still comes from `pi-ai`.
- **`lib/`** implements tools that `extensions/token-tools/` registers (plus `piEnv()`, shared by `file-search/`). Split is intentional (impl vs. registration) but undocumented in code.
- **No `AGENTS.override.md`** anywhere — if a child repo needs to shadow inherited rules, add one at the repo root.
- **No memory or skills installed yet** — `memory/` and `skills/` are the intended homes (both gitignored/absent). New-machine clones start without them.
- **`tasks.json`** is written only when a task call sets `persist: true`; it is not in `.gitignore` (it lives outside the repo, under `~/.pi/agent/`).
- **`bg` tasks outlive the session by design** — detached process groups keep running after pi exits. Stop servers/watchers explicitly (`bg stop`), and `bg clean` drops finished entries. Logs/meta live in `~/.pi/agent/bg/`.
- **UI split**: the footer below the editor shows identity and resources only (dir, branch, tokens, cost, model, plus any `setStatus` text from other extensions). Tasks, running `bg` jobs, context usage and the pruner's savings share a single horizontal line above the editor (`1/3 tasks · next: fix bug · ctx 42% · 84k/200k · 1 running · npm run build · ✂ 12k of ctx`). Segments drop from the right as the terminal narrows, and the line disappears when nothing is known. The pruner reports its bytes through `pi.events` (`context:pruned`) because pi stacks widgets vertically — one line per widget key. Task counts come from the branch; running jobs from `~/.pi/agent/bg/`, refreshed at most every 2s.
- **`node_modules/` (typecheck deps) is a gitignored symlink** — recreate it before `tsc --noEmit` works on a fresh clone.

## Bundled binaries

`agent/bin/` ships static `fd`, `rg`, and the `pi` launcher. pi's bash tool
prepends this dir to PATH automatically; extension code that spawns processes
must pass `piEnv()` from `lib/shared.ts` (the pi process PATH lacks it).
