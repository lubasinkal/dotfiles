/**
 * snippet — rg-based compact code search
 *
 * Returns total match count plus one compact match-centered line per hit,
 * capped at maxResults. Preferred over `bash grep/rg` for code discovery.
 *
 * Install: import from token-tools.ts barrel, or register as standalone extension.
 * Depends on: ripgrep (`rg`) on PATH.
 */

import { Type } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { IGNORES, q, run, textResult } from "./shared.js";

/** Center a line around the match so the interesting part survives truncation. */
function center(s: string, needle: string, maxLen: number): string {
	if (s.length <= maxLen) return s;
	const keep = maxLen - 3;
	const idx = needle ? s.toLowerCase().indexOf(needle.toLowerCase()) : -1;
	if (idx >= 0 && keep > 30) {
		let start = Math.max(0, idx - Math.floor(keep * 0.4));
		if (start + keep > s.length) start = s.length - keep;
		return (start > 0 ? "…" : "") + s.slice(start, start + keep) + (start + keep < s.length ? "…" : "");
	}
	return s.slice(0, maxLen) + "…";
}

export const snippetTool = defineTool({
	name: "snippet",
	label: "Snippet search",
	description:
		"Search code with ripgrep. Returns total match count plus one compact match-centered line per hit (capped match-centered lines).",
	promptSnippet: "snippet: code search — discovery, references, patterns (capped match-centered lines)",
	promptGuidelines: [
		"Use snippet for code discovery: unknown symbols, references, usage patterns, config keys — anywhere you'd reach for bash grep/rg pipelines.",
		"If you know the symbol name and only need its definition, prefer code-index (name → file:line).",
		"Treat hits as anchors: follow up with read only when the match line isn't enough to answer the question.",
		"Narrow with path= and maxResults= instead of post-filtering large result sets.",
	],
	parameters: Type.Object({
		query: Type.String({ description: "Regex or substring to search (ripgrep syntax, smart case)" }),
		path: Type.Optional(Type.String({ description: "Directory to search (default: current dir)" })),
		maxResults: Type.Optional(Type.Number({ description: "Max matches returned (default 30)", default: 30 })),
		maxLineLength: Type.Optional(Type.Number({ description: "Max chars per match line (default 120)", default: 120 })),
		caseSensitive: Type.Optional(Type.Boolean({ description: "Force case-sensitive (default smart case)", default: false })),
	}),
	async execute(_id, params, _sig, _onUpdate, ctx) {
		const searchDir = params.path ?? ctx.cwd;
		const maxResults = Math.max(1, Math.min(100, params.maxResults ?? 30));
		const maxLineLen = Math.max(40, Math.min(400, params.maxLineLength ?? 120));
		const rgArgs = ["--no-heading", "--line-number", "--color=never", "--max-count=40"];

		const ignoreArgs = IGNORES.flatMap((ig) => ["--glob", ig]);
		if (params.path) ignoreArgs.push("--glob", `!${params.path}`);

		const caseFlag = params.caseSensitive === false ? [] : params.caseSensitive ? ["--case-sensitive"] : ["--smart-case"];

		const args = [...rgArgs, ...ignoreArgs, ...caseFlag, "-e", params.query, "."];
		const raw = run(`rg ${args.map(q).join(" ")}`, searchDir, 15_000, 200_000);

		if (raw.startsWith("[exit 1]")) {
			return textResult(`0 matches for ${q(params.query)} in ${searchDir}`);
		}

		const lines = raw.split("\n").filter(Boolean);
		const total = lines.length;
		const shown = lines.slice(0, maxResults).map((line) => {
			const parts = line.split(":");
			const file = parts[0] ?? "";
			const lineNum = parts[1] ?? "";
			const rest = parts.slice(2).join(":").trimStart();
			const centered = center(rest, params.query, maxLineLen);
			return `${file}:${lineNum}: ${centered}`;
		});

		const header = `${total} match${total === 1 ? "" : "es"} for ${q(params.query)} in ${searchDir}${total > maxResults ? ` (showing ${maxResults})` : ""}`;
		return textResult(`${header}\n${shown.join("\n")}`);
	},
});

// No-op default so Pi's auto-discovery doesn't reject this module.
export default function() {}
