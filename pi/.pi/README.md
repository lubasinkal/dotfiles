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
| `cmd-opt/` | Bash lint/optimize/cap/block/rewrite engine | `lint-cmd`, `cmd-stats` |
| `context-pruner/` | 3-tier token-budget context collapse | (event hook) |
| `file-search/` | Wraps `fd` with formatting/truncation (content search lives in `snippet`) | `fd` |
| `quality-gate/` | Post-op git diff scan (`.only`, `debugger`, `@ts-ignore`, `console.log`) | (event hook) |
| `read-cap/` | Caps `read` output to 250 lines | (event hook) |
| `subagent/` | Spawns separate `pi` processes; single/parallel/chain modes | `subagent` |
| `tasktracker/` | Task list with priorities, notes, branch-aware state, optional cross-session `tasks.json` | `task`, `/tasks` |
| `token-tools/` | Registers efficient primitives defined in `lib/` | `snippet`, `diff-hunks`, `code-index`, `files-changed`, `check` |
| `ui/` | Footer status line (ctx%, tokens, cost, branch, model) | (event hook) |
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

- `test-cmd-opt.ts` — cmd-opt lint/rewrite/cap checks (needs bun: `bun run test-cmd-opt.ts`; plain node can't resolve its `./lint.js` imports).
- `test-tasktracker.ts` — task add/list/sort/edit/errors, branch reconstruction, and tasks.json persistence (`node test-tasktracker.ts`).

Both need `node_modules/` (the gitignored symlink to the global pi install) for the `@earendil-works/*` imports.

## Caveats

- **`quality-gate/`** has hardcoded patterns (no config file). Edit `extensions/quality-gate/index.ts` to customize.
- **`lib/`** implements tools that `extensions/token-tools/` registers (plus `piEnv()`, shared by `file-search/`). Split is intentional (impl vs. registration) but undocumented in code.
- **No `AGENTS.override.md`** anywhere — if a child repo needs to shadow inherited rules, add one at the repo root.
- **No memory or skills installed yet** — `memory/` and `skills/` are the intended homes (both gitignored/absent). New-machine clones start without them.
- **`tasks.json`** is written only when a task call sets `persist: true`; it is not in `.gitignore` (it lives outside the repo, under `~/.pi/agent/`).
- **`node_modules/` (typecheck deps) is a gitignored symlink** — recreate it before `tsc --noEmit` works on a fresh clone.

## Bundled binaries

`agent/bin/` ships static `fd`, `rg`, and the `pi` launcher. pi's bash tool
prepends this dir to PATH automatically; extension code that spawns processes
must pass `piEnv()` from `lib/shared.ts` (the pi process PATH lacks it).
