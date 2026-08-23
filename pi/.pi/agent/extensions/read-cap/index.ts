/**
 * Read Size Cap Extension
 *
 * Caps how many lines the `read` tool returns per call, preventing the model
 * from loading entire files into context unnecessarily.
 *
 * Rationale:
 * - The built-in read returns up to 2000 lines/50KB — huge context cost
 * - Most analysis can be done with 150 lines or less
 * - For larger files, the model should use offset/limit to read in chunks,
 *   or use ctx_execute_file (which processes data in a sandbox without
 *   sending raw bytes to the LLM)
 *
 * When a read is clamped, a truncation notice is appended so the model knows
 * to continue with offset= instead of assuming it saw the whole file.
 *
 * Install: copy to ~/.pi/agent/extensions/read-cap/
 * Configure: change MAX_LINES below or via settings.json (readCap.maxLines)
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	isReadToolResult,
	isToolCallEventType,
} from "@earendil-works/pi-coding-agent";

const MAX_LINES = 250;

export default function (pi: ExtensionAPI) {
	pi.on("tool_call", async (event, _ctx) => {
		if (!isToolCallEventType("read", event)) return;

		const currentLimit = event.input.limit;
		const path = event.input.path;

		// If no limit set or limit exceeds cap, clamp it
		if (currentLimit === undefined || currentLimit > MAX_LINES) {
			event.input.limit = MAX_LINES;
		}
	});

	// Append a notice when output was clamped, so the model knows there may
	// be more file content and can continue with offset=.
	pi.on("tool_result", async (event, _ctx) => {
		if (!isReadToolResult(event)) return;
		const content = event.content;
		if (!Array.isArray(content)) return;

		let mutated = false;
		for (const block of content) {
			if (
				!block ||
				typeof block !== "object" ||
				block.type !== "text" ||
				typeof block.text !== "string"
			) {
				continue;
			}
			const lineCount = block.text.split("\n").length;
			if (lineCount >= MAX_LINES && !block.text.includes("(truncated")) {
				block.text += `\n(truncated at ${MAX_LINES} lines; use offset= to continue)`;
				mutated = true;
			}
		}
		if (mutated) return { content };
	});
}
