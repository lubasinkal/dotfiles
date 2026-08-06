# Agent Guidelines

## Token Efficiency

- **Navigate by meaning** — Use `snippet`, `code-index`, `rg` for discovery; avoid reading whole files unless necessary.
- **Fresh sessions** — Use `/clear` between unrelated tasks to prevent context bloat.
- **Scope precisely** — Point to exact files/functions/lines, not open-ended searches.
- **Compress output** — Pipe bash output through filters; use `--porcelain`, `-o name`, `--stat`.
- **Read structure first** — Use `code-index` to find symbols before reading files.
- **Commit often** — Checkpoints let you restart clean when context fills.

## Subagent Usage

**Always use subagents for:**
- Multi-file research (understanding a codebase, finding patterns)
- Web research (looking up docs, APIs, examples)
- Code review (checking changes for issues)
- Planning before implementation (creating step-by-step plans)
- Parallel tasks (multiple independent investigations)

**Agents available:**
- `scout` — Fast codebase recon, returns compressed context
- `research` — Web/docs research specialist
- `reviewer` — Code review and quality analysis
- `planner` — Creates implementation plans from context
- `worker` — Executes plans with isolated context

**Example:** For "add feature X", first use `scout` to understand the codebase, then `planner` to create a plan, then `worker` to execute it. This keeps main context lean and allows parallel work.

## Style

- Be direct. No preamble, no sign-offs, no recaps.
- Show code instead of describing it.
- Use lists instead of paragraphs.
- Explain reasoning only when explicitly asked why or how.
