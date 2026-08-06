/**
 * cmd-opt — command optimizer + tool-call guard
 *
 * Three token-saving layers:
 *
 * 1. `tool_call` interceptor on bash — every agent bash command is linted
 *    before execution:
 *      - BLOCK   destructive / expensive commands (rm -rf /, find /, fork bombs)
 *      - REWRITE provably-safe wins automatically (which → command -v,
 *                cat f | head -N → sed -n '1,Np' f)
 *      - HINT    append a compact `# [cmd-opt] …` comment teaching the
 *                cheaper equivalent (files-changed, diff-hunks, snippet, read)
 *
 * 2. `tool_result` capper on bash — oversized output is kept as
 *    head + tail (trailing errors survive), cutting re-sent bytes in the
 *    conversation and in the stored session file.
 *
 * 3. Two tools:
 *      lint-cmd  - dry-run lint/optimize a command before sending it
 *      cmd-stats - per-session savings counters (rewrites/blocks/bytes)
 *
 * Install: copy to ~/.pi/agent/extensions/cmd-opt/, then /reload.
 * Test:    bun run ~/.pi/agent/test-cmd-opt.ts (mock-API harness, 26 checks).
 */

import {
	isBashToolResult,
	isToolCallEventType,
	type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { lint, applyRewrites } from "./lint.js";
import { capText, RESULT_KEEP_HEAD, RESULT_KEEP_TAIL } from "./capper.js";
import { createCmdLintTool, createCmdStatsTool } from "./tools.js";
import type { Stats } from "./types.js";

const HINT_MAX = 2; // keep the appended comment short

// ── session stats ────────────────────────────────────────────────────────

const globalStats: Stats = {
	linted: 0,
	rewritten: 0,
	blocked: 0,
	hinted: 0,
	charsSaved: 0,
	resultsCapped: 0,
	lastBlockReason: "",
};

export default function (pi: ExtensionAPI) {
	pi.registerTool(createCmdLintTool());
	pi.registerTool(createCmdStatsTool(globalStats));

	// ── interceptor: lint every agent bash call ──
	pi.on("tool_call", (event) => {
		if (!isToolCallEventType("bash", event)) return;

		const cmd = event.input.command;
		if (!cmd.trim()) return;
		globalStats.linted++;

		const flags = lint(cmd);
		const block = flags.find((f) => f.severity === "block");
		if (block) {
			globalStats.blocked++;
			globalStats.lastBlockReason = `${block.id}: ${block.message}`;
			return { block: true, reason: `[cmd-opt] ${block.message}` };
		}

		const { cmd: rewritten, applied } = applyRewrites(cmd);
		let next = rewritten;
		if (applied.length) {
			globalStats.rewritten++;
			globalStats.charsSaved += cmd.length - rewritten.length;
		}

		// append at most HINT_MAX teaching comments (skip if the command ends
		// with a line-continuation backslash — a comment would break it)
		const hints = flags.filter((f) => f.severity === "hint").slice(0, HINT_MAX);
		if (hints.length && !/\\\s*$/.test(next)) {
			const note = hints.map((h) => h.message).join("; ");
			next = `${next}  # [cmd-opt] ${note}`;
			globalStats.hinted += hints.length;
			globalStats.charsSaved += hints.reduce((s, h) => s + h.savings, 0);
		}

		if (next !== cmd) event.input.command = next;
	});

	// ── capper: keep head + tail of oversized bash output ──
	pi.on("tool_result", (event) => {
		if (!isBashToolResult(event)) return;
		const content = event.content;
		if (!Array.isArray(content)) return;

		let mutated = false;
		const capped = content.map((block): (typeof content)[number] => {
			if (!block || typeof block !== "object") return block;
			if (block.type === "text" && typeof block.text === "string") {
				const cut = capText(block.text, RESULT_KEEP_HEAD, RESULT_KEEP_TAIL);
				if (cut !== block.text) {
					mutated = true;
					return { type: "text", text: cut };
				}
			}
			return block;
		});

		if (mutated) {
			globalStats.resultsCapped++;
			return { content: capped };
		}
	});
}
