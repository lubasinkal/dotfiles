/**
 * Lint rules for cmd-opt extension
 */

import type { Rule } from "./types.js";

export const RULES: Rule[] = [
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
		id: "rg-bare",
		severity: "hint",
		re: /(?:^|[|;&]\s*)\brg\b|\brg\b[^\n]*\|\s*head\b/,
		message: "for code search prefer the snippet tool; else use the rg TOOL with path/glob/limit params — its output is capped so drop '| head' (AGENTS.md)",
		savings: 900,
	},
	{
		id: "grep-bare",
		severity: "hint",
		re: /(?:^|[|;&]\s*)\bgrep\b|\bgrep\s+[^\n]*-(?:r|R)[^\n]/,
		message: "use the snippet tool over grep/grep -r — capped, match-centered, gitignore-aware, smart-case (AGENTS.md)",
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
		id: "find-fd",
		severity: "hint",
		re: /\bfind\s+[^\n]*(?:-name|-type|-iname|[^x]depth\b)/,
		message: "prefer the fd tool over find (gitignore-aware, faster, simpler syntax); narrow with a specific root",
		savings: 500,
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
		id: "long-chain",
		severity: "hint",
		re: /&&[\s\S]*&&|\|\|[\s\S]*\|\||(?:[^|]*\|){4,}/,
		message: "long chained bash — split into separate bash calls or dedicated tools (fd/rg/snippet/read); one command per call, single pipe max for aggregation (AGENTS.md)",
		savings: 500,
	},
];
