/**
 * Token-Saving Tool Suite (barrel)
 *
 * Registers five custom tools that cut the biggest token sinks in the agent loop:
 * search floods, whole-file reads, redundant bash, and raw build output.
 *
 *   snippet       - rg-based compact code search (capped, match-centered)
 *   diff-hunks    - current git diff hunks only (working tree / staged)
 *   code-index    - persistent per-project symbol map (name -> file:line)
 *   check         - tsc/eslint output distilled to unique file:line errors (TS/JS repos only)
 *   files-changed - branch + git status --short + diff --stat in one call
 *
 * Routing: discovery → snippet · location → code-index · review → diff-hunks
 *          state → files-changed · build → check
 * Direct tools (read/bash/write) are reserved for semantic judgment, full-file
 * context, and approval-sensitive actions, per each tool's guidelines.
 *
 * Install: copy to ~/.pi/agent/extensions/token-tools.ts, then /reload.
 * Depends on: ripgrep (`rg`) on PATH; git for git-based tools.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isTsJsProject } from "../lib/shared.js";
import { snippetTool } from "../lib/snippet.js";
import { diffHunksTool } from "../lib/diff-hunks.js";
import { codeIndexTool } from "../lib/code-index.js";
import { checkTool } from "../lib/check.js";
import { filesChangedTool } from "../lib/files-changed.js";

export default function init(pi: ExtensionAPI) {
	pi.registerTool(snippetTool);
	pi.registerTool(diffHunksTool);
	pi.registerTool(codeIndexTool);
	pi.registerTool(filesChangedTool);

	// check is only available in TS/JS repos
	pi.on("session_start", async (_event, ctx) => {
		if (isTsJsProject(ctx.cwd)) pi.registerTool(checkTool);
	});
}
