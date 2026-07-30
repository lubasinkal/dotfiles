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
 * Install: copy to ~/.pi/agent/extensions/read-cap.ts
 * Configure: change MAX_LINES below or via settings.json (readCap.maxLines)
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";

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

		// For files that are obviously data (logs, CSVs, JSON) or when
		// the model requests more than MAX_LINES without offset, nudge
		// toward ctx_execute_file for analysis.
		// (The nudge is implicit — by capping the limit, the model
		// learns to use chunked reads or sandbox tools.)
	});
}
