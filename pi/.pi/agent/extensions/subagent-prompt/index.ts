/**
 * Subagent Prompt Injection Extension
 *
 * Adds explicit subagent usage rules to the system prompt.
 * Forces the model to consider delegation before doing research/review/planning.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const SUBAGENT_PROMPT = `
## Subagent Usage Rules

You MUST use the subagent tool for:
1. **Any research task** — Looking up docs, APIs, examples, or exploring unfamiliar code
2. **Code review** — Reviewing your own changes or someone else's
3. **Planning** — Before implementing multi-file changes
4. **Parallel work** — Multiple independent investigations

How to decide:
- If the task involves reading 3+ files to understand something → use scout
- If the task involves web search or external docs → use research
- If the task involves reviewing code → use reviewer
- If the task involves planning implementation → use planner
- If the task involves executing a plan → use worker

Example: User asks "add auth to this project"
1. Use scout to understand the codebase structure
2. Use research to look up auth best practices for this stack
3. Use planner to create the implementation plan
4. Use worker to execute the plan

DO NOT do research yourself when a subagent exists for it.
`.trim();

export default function (pi: ExtensionAPI) {
	pi.on("before_agent_start", (event) => {
		return {
			systemPrompt: event.systemPrompt + "\n" + SUBAGENT_PROMPT,
		};
	});
}
