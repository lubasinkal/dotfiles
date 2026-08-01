/**
 * Terse Toggle Extension
 *
 * Injects a brevity instruction into the system prompt on every turn, toggled
 * with /terse (defaults ON).
 *
 * Why `before_agent_start` instead of the `context` hook:
 * - The first version mutated event.messages in place and never returned the
 *   array, so pi silently ignored it — the instruction never reached the LLM.
 * - `before_agent_start` returns a systemPrompt replacement, and multiple
 *   extensions returning it are CHAINED, so this composes safely with any
 *   other extension that edits the system prompt.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const TERSE_INSTRUCTION =
	"Terse mode: one-line answers, no preamble, no summaries, no explanations unless explicitly asked. Lists for multiple items. Skip pleasantries and narration.";

let terseEnabled = true;

export default function (pi: ExtensionAPI) {
	pi.on("before_agent_start", (event) => {
		if (!terseEnabled) return {};
		return { systemPrompt: event.systemPrompt + "\n\n" + TERSE_INSTRUCTION };
	});

	pi.registerCommand("terse", {
		description: "Toggle terse mode (on/off). Terse = one-line answers, no fluff.",
		handler: async (args, ctx) => {
			const arg = args.trim().toLowerCase();
			if (arg === "on") terseEnabled = true;
			else if (arg === "off") terseEnabled = false;
			else terseEnabled = !terseEnabled;
			ctx.ui.notify(`terse mode ${terseEnabled ? "ON" : "OFF"}`, "info");
		},
	});
}
