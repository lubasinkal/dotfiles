/**
 * Terse Toggle Extension
 *
 * Injects a brevity instruction into the system prompt on every turn, toggled
 * with /terse (defaults ON). State persists to ~/.pi/agent/terse-state.json.
 *
 * Why `before_agent_start` instead of the `context` hook:
 * - The first version mutated event.messages in place and never returned the
 *   array, so pi silently ignored it — the instruction never reached the LLM.
 * - `before_agent_start` returns a systemPrompt replacement, and multiple
 *   extensions returning it are CHAINED, so this composes safely with any
 *   other extension that edits the system prompt.
 */

import { homedir } from "node:os";
import { join } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const STATE_FILE = join(homedir(), ".pi", "agent", "terse-state.json");
const TERSE_INSTRUCTION =
	"Terse mode: one-line answers, no preamble, no summaries, no explanations unless explicitly asked. Lists for multiple items. Skip pleasantries and narration.";

function loadTerseEnabled(): boolean {
	try {
		const raw = readFileSync(STATE_FILE, "utf8");
		return JSON.parse(raw).enabled !== false; // default ON if key missing
	} catch {
		return true; // missing or corrupt state -> default ON
	}
}

let terseEnabled = loadTerseEnabled();

function saveState() {
	try {
		writeFileSync(STATE_FILE, JSON.stringify({ enabled: terseEnabled }, null, 2));
	} catch {
		// non-fatal: keep running with in-memory state
	}
}

export default function (pi: ExtensionAPI) {
	pi.on("before_agent_start", (event) => {
		if (!terseEnabled) return {};
		// Prepend so the rule lands near the top of the system prompt,
		// where it is more reliably followed than a tail append.
		return { systemPrompt: TERSE_INSTRUCTION + "\n\n" + event.systemPrompt };
	});

	pi.registerCommand("terse", {
		description: "Terse mode: /terse on|off (set), /terse (toggle), /terse status (read)",
		handler: async (args, ctx) => {
			const arg = args.trim().toLowerCase();
			if (arg === "on") terseEnabled = true;
			else if (arg === "off") terseEnabled = false;
			else if (arg === "status") {
				ctx.ui.notify(`terse mode is ${terseEnabled ? "ON" : "OFF"}`, "info");
				return;
			} else terseEnabled = !terseEnabled;
			saveState();
			ctx.ui.notify(`terse mode ${terseEnabled ? "ON" : "OFF"}`, "info");
		},
	});
}
