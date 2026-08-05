/**
 * diff-hunks — current git diff hunks (working tree / staged)
 *
 * Returns git diff output for specific paths or the whole repo,
 * trimmed to context lines around each hunk. Much lighter than
 * `git diff` for the agent since it only surfaces changed regions.
 *
 * Install: import from token-tools.ts barrel, or register as standalone extension.
 * Depends on: git.
 */

import { Type } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { DEFAULT_CAP, truncate, run, textResult } from "./shared.js";

export const diffHunksTool = defineTool({
	name: "diff-hunks",
	label: "Diff hunks",
	description: "Return current git diff hunks (working tree or staged) with N context lines.",
	promptSnippet: "diff-hunks: uncommitted changes as hunks (working tree / staged, N context lines)",
	promptGuidelines: [
		"Use diff-hunks to review uncommitted changes instead of raw git diff or full-file reads.",
		"Snapshot first with files-changed, then request hunks only for the changed paths via paths=.",
		"staged=true for the staged index; default covers the working tree.",
		"Stop when hunks cover all changed paths; escalate to read only when you need context beyond the hunk window.",
	],
	parameters: Type.Object({
		context: Type.Optional(Type.Number({ description: "Context lines per hunk (default 3)", default: 3 })),
		paths: Type.Optional(Type.Array({ items: Type.String(), description: "Optional pathspecs to limit the diff" })),
		staged: Type.Optional(Type.Boolean({ description: "Diff the staged index instead of the working tree", default: false })),
	}),
	async execute(_id, params, _sig, _onUpdate, ctx) {
		const contextLines = Math.max(0, Math.min(10, params.context ?? 3));
		const diffCmd = params.staged ? "git diff --cached" : "git diff";
		const pathArgs = (params.paths ?? []).map((p) => `"${p}"`).join(" ");
		const cmd = `${diffCmd} -U${contextLines} --no-color ${pathArgs}`.trim();
		const raw = run(cmd, ctx.cwd, 15_000, 200_000);

		if (raw.trim() === "") {
			return textResult(`No uncommitted changes${params.staged ? " (staged)" : ""} in ${ctx.cwd}`);
		}

		const truncated = truncate(raw, DEFAULT_CAP * 3);
		const hunkCount = (truncated.match(/^@@/gm) ?? []).length;
		const lines = truncated.split("\n").length;

		return textResult(
			`${hunkCount} hunk${hunkCount === 1 ? "" : "s"}, ${lines} line${lines === 1 ? "" : "s"}${truncated.length < raw.length ? ` (truncated from ${Math.ceil(raw.length / 1024)}KB)` : ""}\n${truncated}`,
		);
	},
});

// No-op default so Pi's auto-discovery doesn't reject this module.
export default function() {}
