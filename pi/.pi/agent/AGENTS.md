# Agent Guidelines

## Token Efficiency

- **Navigate by meaning** — Use `snippet`, `code-index`, `rg` for discovery; avoid reading whole files unless necessary.
- **Fresh sessions** — Use `/clear` between unrelated tasks to prevent context bloat.
- **Scope precisely** — Point to exact files/functions/lines, not open-ended searches.
- **Compress output** — Pipe bash output through filters; use `--porcelain`, `-o name`, `--stat`.
- **Read structure first** — Use `code-index` to find symbols before reading files.
- **Use subagents** — Delegate research to subagents to keep main context lean.
- **Commit often** — Checkpoints let you restart clean when context fills.

## Style

- Be direct. No preamble, no sign-offs, no recaps.
- Show code instead of describing it.
- Use lists instead of paragraphs.
- Explain reasoning only when explicitly asked why or how.
