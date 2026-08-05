/**
 * Terse Toggle Extension
 *
 * Injects a brevity instruction into the system prompt on every turn, toggled
 * with /terse (defaults ON). State persists to ~/.pi/agent/terse-state.json.
 *
 * Why `before_agent_start` instead of the `context` hook:
 * - The first version mutated event.messages in place and never returned the
 *   array, so pi silently ignored it -- the instruction never reached the LLM.
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
	"[SYSTEM RULE - OBEY] Respond in at most 2-3 sentences. No preamble, no sign-offs, no summaries. Lists over paragraphs. Code over prose. Explain only when the user asks why or how.";

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
		// Append -- recency bias means the last instruction gets more attention.
		return { systemPrompt: event.systemPrompt + "\n\n" + TERSE_INSTRUCTION };
	});

	pi.registerCommand("terse", {
		description: "Terse mode: /terse on|off (set), /terse (toggle), /terse status (read)",
		handler: async (args, ctx) => {
			const arg = (args ?? "").trim().toLowerCase();
			if (arg === "on") terseEnabled = true;
			else if (arg === "off") terseEnabled = false;
			else if (arg !== "status") terseEnabled = !terseEnabled;
			saveState();
			ctx.ui.notify(`Terse mode: ${terseEnabled ? "ON" : "OFF"}`);
		},
	});
}
