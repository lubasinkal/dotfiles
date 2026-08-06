/**
 * Tool definitions for cmd-opt extension
 */

import { Type } from "@earendil-works/pi-ai";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { lint, applyRewrites } from "./lint.js";
import { textResult } from "./capper.js";
import type { Stats } from "./types.js";

export function createCmdLintTool() {
	return defineTool({
		name: "lint-cmd",
		label: "Lint shell command",
		description:
			"Analyze or optimize a shell command before running it. Returns danger blocks, safe rewrites, and hints, plus the optimized command and chars saved.",
		promptSnippet: "lint-cmd: analyze/optimize a shell command before running it",
		promptGuidelines: [
			"Use lint-cmd before long or expensive bash commands to get the token-efficient equivalent.",
			"Prefer snippet, diff-hunks, files-changed, code-index, or read over bash for search, diffs, status, and file views.",
		],
		parameters: Type.Object({
			command: Type.String({ description: "Shell command string to analyze" }),
			apply: Type.Optional(
				Type.Boolean({ description: "If true, return the optimized command ready to run (rewrites applied)", default: false }),
			),
		}),
		async execute(_id, params, _sig, _onUpdate) {
			const flags = lint(params.command);
			const { cmd: optimized, applied } = applyRewrites(params.command);

			if (flags.length === 0) {
				return textResult(
					`✓ clean — no token-waste or danger patterns in:\n  ${params.command}`,
				);
			}

			const lines = flags.map((f) => {
				const tag = f.severity === "block" ? "⛔" : f.severity === "rewrite" ? "✂️" : "💡";
				let s = `${tag} [${f.severity}] ${f.id}: ${f.message}`;
				if (f.severity === "block") s += `\n   → do NOT run as-is`;
				else if (f.severity === "rewrite") s += `\n   → ${f.replacement}`;
				return s;
			});

			const blocks = flags.filter((f) => f.severity === "block").length;
			const totalSaved = flags.reduce((s, f) => s + f.savings, 0) +
				(params.command.length - optimized.length);

			const out = [
				`${flags.length} pattern${flags.length === 1 ? "" : "s"} (${blocks} block, ${flags.filter((f) => f.severity === "rewrite").length} rewrite, ${flags.filter((f) => f.severity === "hint").length} hint)`,
				`~${totalSaved.toLocaleString()} chars saved if applied`,
				...lines,
			];

			if (params.apply && applied.length) {
				out.push(`\noptimized command:\n${optimized}`);
			} else if (params.apply) {
				out.push(`\noptimized command: (no rewrites to apply)\n${params.command}`);
			}

			return textResult(out.join("\n"));
		},
	});
}

export function createCmdStatsTool(globalStats: Stats) {
	return defineTool({
		name: "cmd-stats",
		label: "Command optimizer stats",
		description:
			"Per-session cmd-opt counters: commands linted, rewritten, blocked, hinted, chars saved, results capped.",
		promptSnippet: "cmd-stats: cmd-opt session counters",
		promptGuidelines: ["Use cmd-stats to report cmd-opt's token savings."],
		parameters: Type.Object({}),
		async execute() {
			const s = globalStats;
			return textResult(
				[
					"cmd-opt session stats:",
					`  commands linted:   ${s.linted}`,
					`  auto-rewritten:    ${s.rewritten}`,
					`  blocked:           ${s.blocked}${s.lastBlockReason ? ` (last: ${s.lastBlockReason})` : ""}`,
					`  hinted:            ${s.hinted}`,
					`  bash results capped: ${s.resultsCapped}`,
					`  ~chars saved:      ${s.charsSaved.toLocaleString()}`,
				].join("\n"),
			);
		},
	});
}
