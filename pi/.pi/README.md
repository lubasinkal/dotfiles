# Pi agent config

Source-of-truth for the local pi-coding-agent install. Mirrored to `~/.pi/`
via a manual symlink (`~/.pi → ~/dotfiles/pi/.pi`), not stow.

## Deploy convention

- **Repo:** `~/dotfiles/pi/.pi/` (this dir)
- **Live:** `~/.pi/` (symlink to the above)
- All edits to `~/.pi/...` are physical edits here. Edit dotfiles directly.
- `stow pi` is intentionally skipped — the whole-dir symlink replaces per-file symlinks.
- `dotfiles/pi/.gitignore` excludes personal/session state from the public repo (auth, sessions, sqlite, pi-hermes-memory).

## Prompt build order

`base` → `AGENTS.md` (workflow/process) → `tool snippets` → `guidelines`
→ `skills` (on-demand) → `before_agent_start` (extensions).

- `AGENTS.md` — caveman rules (462 B). Search/execute discipline, subagent roster, style, verify.
- `prompts/` — slash-command templates (check, clean, commit, plan, review, etc.).
- `agents/` — subagent system prompts (scout, research, reviewer, planner, worker).
- `skills/` — user-installed skill packs (Agent Skills standard).
- `pi-hermes-memory/` — gitignored. Long-term memory (MEMORY.md, USER.md, failures.md), session index, skills, sessions.db.

## Extensions (all user-written)

| Dir | Purpose | Tools |
|---|---|---|
| `ask-user/` | TUI multi-choice picker | `ask_user` |
| `cmd-opt/` | Bash lint/optimize/cap/block/rewrite engine | `lint-cmd`, `cmd-stats` |
| `context-pruner/` | 3-tier token-budget context collapse | (event hook) |
| `file-search/` | Wraps system `fd`/`rg` with formatting/truncation | `fd`, `rg` |
| `quality-gate/` | Post-op git diff scan (`.only`, `debugger`, `@ts-ignore`, `console.log`) | (event hook) |
| `read-cap/` | Caps `read` output to 250 lines | (event hook) |
| `subagent/` | Spawns separate `pi` processes; single/parallel/chain modes | `subagent` |
| `token-tools/` | Registers efficient primitives defined in `lib/` | `snippet`, `diff-hunks`, `code-index`, `files-changed`, `check` |
| `ui/` | Footer status line (ctx%, tokens, cost, branch, model) | (event hook) |
| `websearch/` | Multi-backend search (Tavily/Brave/SearXNG/HN/DDG) + HTML→markdown fetch | `websearch` |
| `atuin.ts` | Records pi's bash commands to Atuin history | (event hook) |

## npm packages (`npm/`)

Only one is actively used:

- `pi-hermes-memory` — provides `memory_*` tools, session indexing, auto-consolidation. Settings entry: `npm:pi-hermes-memory`.

Other packages were removed (unused): `@ollama/pi-web-search`, `context-mode`, `pi-subagents`, `pi-web-access`.

## Secrets

Two mechanisms, kept separate:

- **`~/.pi/agent/auth.json`** + **`trust.json`** — pi's auth + project trust decisions. Gitignored.
- **`~/.config/opencode/secrets.sh`** — opencode env vars (`{env:VAR}` substitution in `opencode/opencode.json`). Auto-sourced by `.zshrc`.

## Caveats

- **`quality-gate/`** has hardcoded patterns (no config file). Edit `extensions/quality-gate/index.ts` to customize.
- **`pi-hermes-memory/`** does not auto-cleanup `.recovery-*.md` or `.retired-*.md` files. Directory is currently clean; if it grows, prune manually with `find ~/.pi/agent/pi-hermes-memory/ \( -name '.recovery-*.md' -o -name '.retired-*.md' \) -mtime +7 -delete`.
- **`lib/`** implements tools that `extensions/token-tools/` registers. Split is intentional (impl vs. registration) but undocumented in code.
- **No `AGENTS.override.md`** anywhere — if a child repo needs to shadow inherited rules, add one at the repo root.
- **Skills at `~/.pi/agent/pi-hermes-memory/skills/`** are gitignored. New-machine clones won't have them. Track them manually or move to `~/.pi/agent/skills/`.