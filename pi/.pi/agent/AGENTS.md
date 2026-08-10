# Agent Guidelines

## Token Efficiency

- Use `snippet`, `code-index`, `rg` for discovery — never read whole files unless forced.
- Use `code-index` before `read` to locate symbols.
- Pipe bash output through filters (`--porcelain`, `-o name`, `--stat`).
- Point to exact files/functions/lines — no open-ended searches.
- `/clear` between unrelated tasks.

## Subagents

**Mandatory for:** research, code review, planning, parallel tasks, codebase exploration.

| Agent     | Role                         |
|-----------|------------------------------|
| `scout`   | Fast codebase recon          |
| `research`| Web/docs lookup              |
| `reviewer`| Code review                  |
| `planner` | Implementation plans         |
| `worker`  | Plan execution               |

## Style

- Direct. No preamble, no sign-offs, no recaps.
- Show code, don't describe it.
- Use lists, not paragraphs.
- Explain reasoning only when asked.
