# pi agent config

Source of truth for the local pi-coding-agent setup. Live at `~/.pi/`, a symlink
to this directory (`~/dotfiles/pi/.pi`) — edit here, `stow pi` is skipped.

## Layout

| Path | What |
|---|---|
| `agent/AGENTS.md` | Harness rules: scope, safety, tool discipline, verification, subagent roster |
| `agent/agents/` | Subagent system prompts: `scout`, `planner`, `worker`, `reviewer`, `research` |
| `agent/prompts/` | Slash commands: `check`, `clean`, `commit`, `implement`, `plan`, `review`, `verify` |
| `agent/extensions/` | User extensions (below) |
| `agent/lib/` | Tool implementations that `token-tools/` registers |
| `agent/bin/` | Bundled `fd`, `rg`, and the `pi` launcher |

Prompt build order: base → `AGENTS.md` → tool snippets → guidelines → skills
(on demand) → `before_agent_start` hooks.

## Extensions

| Dir | Purpose | Tools |
|---|---|---|
| `ask-user/` | TUI multiple-choice picker | `ask_user` |
| `bg/` | Detached background shell tasks; registry on disk so subagents see them | `bg` |
| `cmd-opt/` | Lints, rewrites, blocks and caps bash commands; nudges long runs toward `bg` | `lint-cmd`, `cmd-stats` |
| `file-search/` | `fd` with truncation and a temp file for full output | `fd` |
| `git-guard/` | Blocks `git commit` when secrets, `.env`/key files, `.only` or `debugger` are staged | (hook) |
| `quality-gate/` | After a successful edit, warns about `.only`, `debugger`, `@ts-ignore`, `console.log` in added lines | (hook) |
| `read-cap/` | Caps `read` at 250 lines with a truncation notice | (hook) |
| `subagent/` | pi's shipped example extension, plus per-agent `thinking` and two fixes (below) | `subagent` |
| `tasktracker/` | Task list with priorities, notes, branch-aware state, optional `tasks.json` | `task`, `/tasks` |
| `token-tools/` | Registers the `lib/` tools | `snippet`, `diff-hunks`, `code-index`, `files-changed`, `check` |
| `ui/` | Footer (dir, branch, tokens, cost, model) plus a work widget above the editor | (hook) |

`subagent` is pi's example kept close to upstream, with three deliberate
differences: agents may set their own `thinking:` level, a child killed by a
signal counts as a failure, and one aborted parallel task no longer discards
the others' results. Re-sync it when pi ships a new example.

## UI

Above the editor, one line, only while there is something to say:

```
 1/3 tasks · next: fix bug · ctx 42% · 84k/200k · 1 running · npm run build
```

Below it, always:

```
~/dotfiles (master) · ↑1.2k ↓340 · $0.42        opencode-go/mimo-v2.6-flash · ✻ high
```

Task counts come from the branch; running jobs from `~/.pi/agent/bg/` (2 s
cache). Segments drop from the right as the terminal narrows.

## Tests

`node test-*.ts` (Node 22 strips types) or `bun run test-*.ts`, from
`agent/`. `install.sh` links `agent/node_modules` to the current pi release, which
the imports need.

| File | Covers |
|---|---|
| `test-cmd-opt.ts` | lint, rewrites (one at a time), output capping |
| `test-tasktracker.ts` | task actions, branch reconstruction, `/tasks` panel, history immutability |
| `test-bg.ts` | exit codes, quoting, process-group kill, pid reuse, durability |
| `test-git-guard.ts` | commit detection, secret/debug blocking, `-a`, commit target repo, bypass |
| `test-quality-gate.ts` | added-line-only, failed edits don't arm it, session cwd |
| `test-statusline.ts` | footer and widget content, width fitting, idle state, live jobs |
| `test-subagent.ts` | agent discovery: both `tools:` spellings, malformed files |
| `test-lib.ts` | `diff-hunks` path quoting, `check` parsing tsc/eslint, `code-index` |
| `test-hooks.ts` | shared bootstrap for jiti's `./x.js` → `./x.ts` |

## Caveats

- **Nothing is version-pinned** to pi internals beyond what the extensions import; a pi upgrade can move the extension surface.
- **`git-guard` and `quality-gate` hardcode their patterns.** `PI_GIT_GUARD=off` disables the former for a session.
- **`bg` tasks outlive pi by design** — detached process groups. Stop servers with `bg stop`; `bg clean` drops finished entries.
- **No memory or skills installed.** `memory/` and `skills/` are the intended homes, both gitignored.
- **`atuin` was removed** — it recorded nothing without the binary installed.
- **`context-pruner` was removed** after measuring: at a 1M-token window its 85% trigger needed ~891k tokens of transcript. It did prune 305 KB at 128k, so recover it from history if you start running small-window models.
