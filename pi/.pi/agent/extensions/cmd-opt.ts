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
 * Install: copy to ~/.pi/agent/extensions/cmd-opt.ts, then /reload.
 * Test:    bun run ~/.pi/agent/test-cmd-opt.ts (mock-API harness, 26 checks).
 */

import { Type } from "@earendil-works/pi-ai";
import {
	defineTool,
	isBashToolResult,
	isToolCallEventType,
	type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";

// ── lint rules ───────────────────────────────────────────────────────────

interface Rule {
	id: string;
	severity: "block" | "rewrite" | "hint";
	re: RegExp;
	message: string;
	/** For rewrite rules: build the replacement for the whole command. */
	replace?: (m: RegExpExecArray, cmd: string) => string;
	/** Approx chars saved when triggered (for stats). */
	savings: number;
}

const RULES: Rule[] = [
	// ── blocks ───────────────────────────────────────────────────────────
	{
		id: "rm-root",
		severity: "block",
		re: /rm\s+(?:-[a-z]*\s+)*["']?\/\s*["']?$|rm\s+-rf\s+["']?~["']?(?:\s|$)|rm\s+-rf\s+["']?\.[/;\s]|sudo\s+rm\s+-rf\s+["']?\/["']?(?:\s|$)/,
		message: "refusing recursive delete of a root/home/cwd path",
		savings: 0,
	},
	{
		id: "fork-bomb",
		severity: "block",
		re: /:\s*\(\s*\)\s*\{|\(\s*\)\s*\|/,
		message: "refusing fork bomb",
		savings: 0,
	},
	{
		id: "find-root",
		severity: "block",
		re: /\bfind\s+\/(?:\s|$)/,
		message: "refusing full-filesystem find — slow and noisy; use find <specific-dir> -maxdepth N or ls a known path",
		savings: 0,
	},
	{
		id: "http-pipe-sh",
		severity: "block",
		re: /(?:curl|wget)\s+(?:-\S+\s+)*https?:\/\/[^\s|]+[^\n]*\|\s*(?:sudo\s+)?(?:sh|bash)\b/,
		message: "refusing to pipe a non-https download into a shell",
		savings: 0,
	},

	// ── rewrites (provably safe, applied automatically) ─────────────────
	{
		id: "which",
		severity: "rewrite",
		re: /\bwhich\s+([A-Za-z0-9_.-]+)/,
		replace: (m) => `command -v ${m[1]}`,
		message: "which → command -v (POSIX builtin, one process instead of a lookup)",
		savings: 12,
	},
	{
		id: "cat-head",
		severity: "rewrite",
		re: /\bcat\s+((?!-)(?:[^\s|]+|"[^"]+"|'[^']+'))\s*\|\s*head\s+(?:-n\s*|-)?(\d+)/,
		replace: (m) => `sed -n '1,${m[2]}p' ${m[1]}`,
		message: "cat f | head -N → sed -n '1,Np' f (single pass, no pipe process)",
		savings: 14,
	},
	{
		id: "cat-tail",
		severity: "rewrite",
		re: /\bcat\s+((?!-)(?:[^\s|]+|"[^"]+"|'[^']+'))\s*\|\s*tail\s+(?:-n\s*|-)?(\d+)/,
		replace: (m) => `tail -${m[2]} ${m[1]}`,
		message: "cat f | tail -N → tail -N f (drop the cat)",
		savings: 14,
	},

	// ── hints (teach the cheaper equivalent via a trailing comment) ─────
	{
		id: "rg-head",
		severity: "hint",
		re: /\brg\b[^\n]*\|\s*head\b/,
		message: "rg caps output itself — drop '| head'; prefer the snippet tool for code search",
		savings: 900,
	},
	{
		id: "grep-rn",
		severity: "hint",
		re: /\bgrep\s+-r?n\b/,
		message: "prefer the snippet tool over grep -rn (capped, match-centered lines)",
		savings: 600,
	},
	{
		id: "git-status",
		severity: "hint",
		re: /\bgit\s+(?:status|branch\s+--show-current)\b/,
		message: "use the files-changed tool — branch + git status --short + diff --stat in one call",
		savings: 400,
	},
	{
		id: "git-diff",
		severity: "hint",
		re: /\bgit\s+diff\b/,
		message: "use the diff-hunks tool to see only hunks, not the raw diff",
		savings: 900,
	},
	{
		id: "sed-read",
		severity: "hint",
		re: /\bsed\s+-n\s+'?[\d,$p]+\s*'?p?\b/,
		message: "prefer the read tool (offset/limit) over sed for viewing file ranges",
		savings: 300,
	},
	{
		id: "find-wide",
		severity: "hint",
		re: /\bfind\s+(?:\/home|\/usr\b|~)/,
		message: "narrow find with -maxdepth and a specific root",
		savings: 800,
	},
	{
		id: "require-resolve",
		severity: "hint",
		re: /require\.resolve\(|npm\s+ls\s+--parseable/,
		message: "check package presence with test -d node_modules/<pkg> or ls — don't throw via require.resolve",
		savings: 300,
	},
	{
		id: "node-e",
		severity: "hint",
		re: /\bnode\s+-e\b/,
		message: "node -e one-liners throw noise on failure; prefer a heredoc script",
		savings: 200,
	},
	{
		id: "pkill-multi",
		severity: "hint",
		re: /pkill\s+-f\s+\S+[^\n]*pkill\s+-f/,
		message: "combine kills — pkill -f 'a|b' is one process scan",
		savings: 100,
	},
	{
		id: "curl-status",
		severity: "hint",
		re: /curl\s+[^\n]*?-o\s+\/dev\/null\s+-w/,
		message: "curl -o /dev/null -w adds a process — fine, but keep it to one check",
		savings: 60,
	},
	{
		id: "find-fd",
		severity: "hint",
		re: /\bfind\s+[^\n]*(?:-name|-type|-iname|[^x]depth\b)/,
		message: "prefer the fd tool over find (gitignore-aware, faster, simpler syntax)",
		savings: 500,
	},
	{
		id: "grep-rg",
		severity: "hint",
		re: /\bgrep\s+[^\n]*-(?:r|R)[^\n]/,
		message: "prefer the rg tool over grep -r (faster, gitignore-aware, smart-case)",
		savings: 600,
	},
];

// ── lint engine ──────────────────────────────────────────────────────────

export interface LintFlag {
	id: string;
	severity: "block" | "rewrite" | "hint";
	message: string;
	replacement?: string;
	savings: number;
}

/** Analyze a command. Returns flags in severity order (block → rewrite → hint). */
function lint(cmd: string): LintFlag[] {
	const flags: LintFlag[] = [];
	const seen = new Set<string>();

	for (const rule of RULES) {
		const m = rule.re.exec(cmd);
		if (!m) continue;
		seen.add(rule.id);
		const flag: LintFlag = {
			id: rule.id,
			severity: rule.severity,
			message: rule.message,
			savings: rule.savings,
		};
		if (rule.replace) {
			const next = cmd.replace(rule.re, () => rule.replace!(m, cmd));
			if (next !== cmd) flag.replacement = next;
		}
		flags.push(flag);
	}

	// blocks first, then rewrites, then hints (stable within severity)
	return flags.sort((a, b) => {
		const rank = { block: 0, rewrite: 1, hint: 2 } as const;
		return rank[a.severity] - rank[b.severity];
	});
}

/** Apply rewrite rules to a command, returning the optimized form. */
function applyRewrites(cmd: string): { cmd: string; applied: LintFlag[] } {
	let next = cmd;
	const applied: LintFlag[] = [];
	for (const flag of lint(next)) {
		if (flag.severity !== "rewrite" || !flag.replacement) continue;
		next = flag.replacement;
		applied.push(flag);
	}
	return { cmd: next, applied };
}

// ── session stats ────────────────────────────────────────────────────────

interface Stats {
	linted: number;
	rewritten: number;
	blocked: number;
	hinted: number;
	charsSaved: number;
	resultsCapped: number;
	lastBlockReason: string;
}

// ── bash output capper (keep head + tail so trailing errors survive) ─────

const RESULT_KEEP_HEAD = 3_000;
const RESULT_KEEP_TAIL = 9_000;

function capText(text: string, keepHead: number, keepTail: number): string {
	if (text.length <= keepHead + keepTail) return text;
	return (
		text.slice(0, keepHead) +
		`\n… [cmd-opt: middle truncated, ${(text.length - keepHead - keepTail).toLocaleString()} chars] …\n` +
		text.slice(text.length - keepTail)
	);
}

function textResult(text: string) {
	return { content: [{ type: "text" as const, text }], details: {} };
}

// ── tools ─────────────────────────────────────────────────────────────────

const cmdLintTool = defineTool({
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

const cmdStatsTool = defineTool({
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

// ── extension entry ───────────────────────────────────────────────────────

const globalStats: Stats = {
	linted: 0,
	rewritten: 0,
	blocked: 0,
	hinted: 0,
	charsSaved: 0,
	resultsCapped: 0,
	lastBlockReason: "",
};

const HINT_MAX = 2; // keep the appended comment short

export default function (pi: ExtensionAPI) {
	pi.registerTool(cmdLintTool);
	pi.registerTool(cmdStatsTool);

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
