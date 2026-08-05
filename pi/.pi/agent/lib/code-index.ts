/**
 * code-index — persistent per-project symbol map (name → file:line)
 *
 * Builds a lightweight index of class, function, const, type, etc. definitions
 * across a project using ripgrep + heuristic kind derivation.
 * Persists the index in ~/.cache/pi-code-index/<project-hash>.json
 * with a short TTL (30 s) so it stays fresh without re-scanning every call.
 *
 * Install: import from token-tools.ts barrel, or register as standalone extension.
 * Depends on: ripgrep (`rg`) on PATH; git for project hashing.
 */

import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import * as os from "node:os";
import { Type } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { IGNORES, q, run, gitRoot, textResult } from "./shared.js";

// ── index types ─────────────────────────────────────────────────────────

interface IndexEntry {
	file: string;
	line: number;
	kind: string;
	name: string;
}

interface IndexFile {
	builtAt: number;
	gitHash: string;
	overflow: boolean;
	entries: IndexEntry[];
}

const INDEX_DIR = path.join(process.env.HOME ?? os.homedir(), ".cache", "pi-code-index");
const INDEX_MAX_ENTRIES = 20_000;
const INDEX_MAX_AGE_MS = 30_000;

// ── kind derivation ─────────────────────────────────────────────────────

const INDEX_GROUPS: { kind: "derive" | string; globs: string; re: RegExp }[] = [
	{
		kind: "derive",
		globs: "-g '*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}' -g '!**/*.d.ts'",
		re: /^\s*(?:export\s+)?(?:(?:abstract\s+)?class|interface|type|enum|(?:async\s+)?function|const)\s+(?<name>[A-Za-z_$][\w$]*)/,
	},
	{ kind: "derive", globs: "-g '*.py'", re: /^\s*(?:async\s+)?(?:def|class)\s+(?<name>\w+)/ },
	{ kind: "derive", globs: "-g '*.rs'", re: /^\s*(?:pub(?:\s*\([^)]*\))?\s+)?(?:fn|struct|enum|trait)\s+(?<name>\w+)/ },
	{ kind: "func", globs: "-g '*.go'", re: /^\s*func\s+(?:\([^)]*\)\s*)?(?<name>\w+)/ },
	{
		kind: "function",
		globs: "-g '*.{sh,zsh,bash,ksh}' -g '.{zshrc,zshenv,zprofile,zlogin,zlogout,bashrc,bash_profile,bash_logout,profile,kshrc}' -g '*.{conf,rasi}'",
		re: /^(?<name>[A-Za-z_][A-Za-z0-9_]*)\s*\(\)\s*\{/,
	},
	{
		kind: "function",
		globs: "-g '*.lua' -g '.wezterm.lua'",
		re: /^\s*(?:local\s+)?function\s+(?<name>[A-Za-z_][\w.]*)/,
	},
	{
		kind: "function",
		globs: "-g '*.lua'",
		re: /^\s*(?<name>[A-Za-z_][\w.]*)\s*=\s*function\b/,
	},
	{
		kind: "function",
		globs: "-g '*.{vim}' -g '.vimrc'",
		re: /^\s*function!?\s+(?<name>[A-Za-z_#][\w#]*)/,
	},
];

function deriveKind(text: string): string {
	if (/class\s/.test(text)) return "class";
	if (/interface\s/.test(text)) return "interface";
	if (/type\s/.test(text)) return "type";
	if (/enum\s/.test(text)) return "enum";
	if (/function\s/.test(text) || /=>\s*[({]|=\s*(?:async\s*)?function/.test(text)) return "function";
	if (/def\s/.test(text)) return "def";
	if (/struct\s/.test(text)) return "struct";
	if (/trait\s/.test(text)) return "trait";
	if (/fn\s/.test(text)) return "fn";
	return "const";
}

// ── git hash for cache invalidation ─────────────────────────────────────

const GIT_HASH_CACHE_TTL_MS = 2_000;
const gitHashCache = new Map<string, { at: number; hash: string }>();

function projectGitHash(root: string): string {
	const now = Date.now();
	const cached = gitHashCache.get(root);
	if (cached && now - cached.at < GIT_HASH_CACHE_TTL_MS) return cached.hash;
	try {
		const out = execSync("git rev-parse HEAD 2>/dev/null || echo none", { cwd: root, encoding: "utf8", timeout: 3000 }).trim();
		const hash = out || "none";
		gitHashCache.set(root, { at: now, hash });
		return hash;
	} catch {
		return "none";
	}
}

// ── build / load index ──────────────────────────────────────────────────

function buildIndex(root: string): IndexFile {
	const gitHash = projectGitHash(root);
	const ignoreArgs = IGNORES.map((ig) => `--glob ${q(ig)}`).join(" ");
	const entries: IndexEntry[] = [];
	let overflow = false;

	for (const group of INDEX_GROUPS) {
		const cmd = `rg --no-heading --line-number --color=never ${group.globs} ${ignoreArgs} -e "." .`;
		const raw = run(cmd, root, 30_000, 4_000_000);
		if (raw.startsWith("[exit ")) continue;

		for (const line of raw.split("\n")) {
			if (!line || entries.length >= INDEX_MAX_ENTRIES) {
				if (entries.length >= INDEX_MAX_ENTRIES) overflow = true;
				break;
			}
			const colonIdx = line.indexOf(":");
			const colon2 = line.indexOf(":", colonIdx + 1);
			if (colonIdx < 0 || colon2 < 0) continue;

			const file = line.slice(0, colonIdx);
			const lineNum = Number(line.slice(colonIdx + 1, colon2));
			const text = line.slice(colon2 + 1);
			const m = group.re.exec(text);
			if (!m?.groups?.name) continue;

			const kind = group.kind === "derive" ? deriveKind(text) : group.kind;
			entries.push({ file, line: lineNum, kind, name: m.groups.name });
		}
	}

	return { builtAt: Date.now(), gitHash, overflow, entries };
}

function loadOrBuildIndex(root: string, force = false): IndexFile {
	fs.mkdirSync(INDEX_DIR, { recursive: true });
	const key = createHash("sha256").update(root).digest("hex").slice(0, 16);
	const cachePath = path.join(INDEX_DIR, `${key}.json`);

	if (!force) {
		try {
			const raw = fs.readFileSync(cachePath, "utf8");
			const idx: IndexFile = JSON.parse(raw);
			const age = Date.now() - idx.builtAt;
			if (age < INDEX_MAX_AGE_MS && idx.gitHash === projectGitHash(root)) return idx;
		} catch {}
	}

	const idx = buildIndex(root);
	try {
		fs.writeFileSync(cachePath, JSON.stringify(idx), "utf8");
	} catch {}
	return idx;
}

// ── tool ────────────────────────────────────────────────────────────────

export const codeIndexTool = defineTool({
	name: "code-index",
	label: "Code index",
	description:
		"Find where a symbol is defined: name → file:line from a cached per-project index (rebuilt on change).",
	promptSnippet: "code-index: symbol map (name → file:line), rebuilt on change",
	promptGuidelines: [
		"Use code-index when you know (or partially know) a symbol name and need its definition location.",
		"Empty query returns a per-kind summary — use it to orient in an unfamiliar repo.",
		"Name-based only: use snippet for content search (strings, patterns, references).",
		"If the index looks stale, pass force=true to rebuild once; retry a stale hit before reading the whole file.",
	],
	parameters: Type.Object({
		query: Type.Optional(Type.String({ description: "Substring to filter symbol names (empty = summary only)" })),
		maxResults: Type.Optional(Type.Number({ description: "Max symbols returned (default 30)", default: 30 })),
		force: Type.Optional(Type.Boolean({ description: "Force index rebuild", default: false })),
	}),
	async execute(_id, params, _sig, _onUpdate, ctx) {
		const root = gitRoot(ctx.cwd) ?? ctx.cwd;
		const idx = loadOrBuildIndex(root, !!params.force);
		const age = Math.round((Date.now() - idx.builtAt) / 1000);
		const counts = new Map<string, number>();
		for (const e of idx.entries) counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1);
		const summary = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(" · ");
		const header = `index: ${idx.entries.length} symbols${idx.overflow ? "+" : ""} (${summary}) · built ${age}s ago`;
		const query = (params.query ?? "").trim();
		if (!query) return textResult(`${header}\npass query=… to list matching symbols`);
		const max = Math.max(1, Math.min(200, params.maxResults ?? 30));
		const matches = idx.entries.filter((e) => e.name.toLowerCase().includes(query.toLowerCase()));
		const shown = matches.slice(0, max);
		const out = shown.map((e) => `${e.file}:${e.line}  ${e.kind} ${e.name}`).join("\n");
		return textResult(`${header}\nquery ${q(query)}: ${matches.length} matches (showing ${shown.length})\n${out || "(none)"}`);
	},
});

// No-op default so Pi's auto-discovery doesn't reject this module.
export default function() {}
