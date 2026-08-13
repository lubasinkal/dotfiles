# Agent Guidelines

## Token Efficiency

- Use `snippet`, `code-index`, `rg` for discovery — never read whole files unless forced.
- Use `code-index` before `read` to locate symbols.
- Pipe bash output through filters (`--porcelain`, `-o name`, `--stat`).
- Point to exact files/functions/lines — no open-ended searches.
- `/clear` between unrelated tasks.

## Tool Use

Three principles (from Anthropic's advanced tool use playbook):

- **Discover, don't load** (tool search): locate with `snippet`/`code-index`/`fd`/`rg`/`memory_search` first; read only what's needed. Subagent `tools:` lists are the `defer_loading` equivalent — keep them minimal.
- **Batch in `bash`** (programmatic tool calling): 3+ dependent steps → one pipeline. Filter, sort, aggregate in the shell so intermediate data never enters context. `git diff --stat` and `rg -c` beat raw dumps.
- **Examples over schema** (tool use examples): describe tools with concrete invocations, not just parameter lists. Extend that to answers — show the call, not the option table.

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
