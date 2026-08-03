/**
 * Token-Saving Tool Suite
 *
 * Five custom tools that cut the biggest token sinks in the agent loop:
 * search floods, whole-file reads, redundant bash, and raw build output.
 *
 *   snippet       - rg-based compact code search (capped, match-centered)
 *   diff-hunks    - current git diff hunks only (working tree / staged)
 *   code-index    - persistent per-project symbol map (name -> file:line)
 *   check         - tsc/eslint output distilled to unique file:line errors (TS/JS repos only)
 *   files-changed - branch + git status --short + diff --stat in one call
 *
 * Install: copy to ~/.pi/agent/extensions/token-tools.ts, then /reload.
 * Depends on: ripgrep (`rg`) on PATH; git for git-based tools.
 */

import { execSync, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import * as os from "node:os";
import { Type } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

// ── shared helpers ──────────────────────────────────────────────────────

const DEFAULT_CAP = 8_192;
const IGNORES = [
	"!**/node_modules/**",
	"!**/.git/**",
	"!**/.next/**",
	"!**/dist/**",
	"!**/build/**",
	"!**/coverage/**",
	"!**/vendor/**",
	"!**/target/**",
	"!**/.venv/**",
];

/** Shell-safe single quoting. */
function q(s: string): string {
	return "'" + s.replace(/'/g, `'\\''`) + "'";
}

/** Truncate a string to maxBytes (UTF-8 safe). */
function truncate(s: string, maxBytes: number): string {
	const b = Buffer.from(s, "utf8");
	if (b.length <= maxBytes) return s;
	const cut = b.subarray(0, maxBytes).toString("utf8").replace(/\uFFFD+$/, "");
	return cut + `\n… [truncated ${b.length - Buffer.byteLength(cut, "utf8")} bytes]`;
}

/** Run a command, returning capped stdout (or stderr on non-zero exit). */
function run(cmd: string, cwd: string, timeoutMs = 20_000, maxBytes = DEFAULT_CAP): string {
	let out = "";
	let code = 0;
	try {
		out = execSync(cmd, {
			cwd,
			encoding: "utf8",
			timeout: timeoutMs,
			maxBuffer: 128 * 1024 * 1024,
			shell: "/bin/bash",
			stdio: ["ignore", "pipe", "pipe"],
		});
	} catch (e) {
		const err = e as { stdout?: string; stderr?: string; status?: number; message?: string };
		code = err.status ?? 1;
		out = (err.stdout ?? err.stderr ?? "").toString();
		if (!out.trim()) return `[exit ${code}] ${String(err.message ?? e).split("\n")[0]}`;
	}
	const capped = truncate(out, maxBytes);
	return code ? `[exit ${code}]\n${capped}` : capped;
}

/** Async spawn with timeout + output cap. */
function runAsync(cmd: string, args: string[], cwd: string, timeoutMs: number): Promise<{ code: number; out: string }> {
	return new Promise((resolve) => {
		let out = "";
		let settled = false;
		const finish = (code: number, extra = "") => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			resolve({ code, out: out + extra });
		};
		const timer = setTimeout(() => {
			child.kill("SIGKILL");
			finish(-9, "\n[timed out]");
		}, timeoutMs);
		const child = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
		child.stdout.on("data", (d: Buffer) => {
			out += d.toString();
			if (out.length > 8_000_000) {
				child.kill("SIGKILL");
				finish(-2, "\n[output capped]");
			}
		});
		child.stderr.on("data", (d: Buffer) => {
			out += d.toString();
			if (out.length > 8_000_000) {
				child.kill("SIGKILL");
				finish(-2, "\n[output capped]");
			}
		});
		child.on("close", (code) => finish(code ?? 0));
		child.on("error", (e) => finish(-1, `\n[spawn error] ${e.message}`));
	});
}

function gitRoot(cwd: string): string | null {
	try {
		const out = execSync("git rev-parse --show-toplevel", { cwd, encoding: "utf8", timeout: 5000 }).trim();
		return out || null;
	} catch {
		return null;
	}
}

const TS_JS_MARKERS = ["package.json", "tsconfig.json", "tsconfig.app.json", "tsconfig.node.json", "jsconfig.json"];

/** True if cwd or its git root looks like a TypeScript/JavaScript project. */
function isTsJsProject(cwd: string): boolean {
	for (const dir of new Set([cwd, gitRoot(cwd)].filter((d): d is string => !!d))) {
		if (TS_JS_MARKERS.some((m) => fs.existsSync(path.join(dir, m)))) return true;
	}
	return false;
}

function textResult(text: string) {
	return { content: [{ type: "text" as const, text }], details: {} };
}

// ── 1. snippet ──────────────────────────────────────────────────────────

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

const snippetTool = defineTool({
	name: "snippet",
	label: "Snippet search",
	description:
		"Search code with ripgrep. Returns total match count plus one compact match-centered line per hit (file:line: text), capped at maxResults. query is a ripgrep regex (smart case by default).",
	promptSnippet: "snippet: rg-powered compact code search (capped one-liners)",
	promptGuidelines: ["Use snippet for all code search instead of bash grep/rg pipelines."],
	parameters: Type.Object({
		query: Type.String({ description: "Regex or substring to search (ripgrep syntax, smart case)" }),
		path: Type.Optional(Type.String({ description: "Directory to search (default: current dir)" })),
		maxResults: Type.Optional(Type.Number({ description: "Max matches returned (default 30)", default: 30 })),
		maxLineLength: Type.Optional(Type.Number({ description: "Max chars per match line (default 120)", default: 120 })),
		caseSensitive: Type.Optional(Type.Boolean({ description: "Force case-sensitive (default smart case)", default: false })),
	}),
	async execute(_id, params, _sig, _onUpdate, ctx) {
		const root = params.path ? path.resolve(ctx.cwd, params.path) : ctx.cwd;
		if (!fs.existsSync(root)) return textResult(`[error] path not found: ${root}`);
		const maxResults = Math.max(1, Math.min(200, params.maxResults ?? 30));
		const maxLen = Math.max(40, Math.min(500, params.maxLineLength ?? 120));
		const smart = params.caseSensitive ? "" : "-S ";
		const globs = IGNORES.map((g) => `-g ${q(g)}`).join(" ");
		const cmd = `rg --hidden --no-heading -n --max-filesize 2M ${smart}${globs} -e ${q(params.query)} ${q(root)}`;
		const raw = run(cmd, ctx.cwd, 15_000, 512_000);
		const wasTruncated = raw.includes("… [truncated");
		if (/^\[exit 1\]/.test(raw) || !raw.trim()) return textResult(`no matches for ${q(params.query)} in ${root}`);
		if (raw.startsWith("[exit ")) return textResult(raw); // rg errors (bad path, binary, etc.)
		const needle = params.query.replace(/\^|\$|\\./g, "").slice(0, 60);
		const lines: string[] = [];
		const re = /^(.+?):(\d+):(.*)$/;
		let totalMatches = 0;
		for (const line of raw.split("\n")) {
			const m = re.exec(line);
			if (!m) continue;
			totalMatches++;
			if (lines.length >= maxResults) continue;
			lines.push(`${m[1]}:${m[2]}: ${center(m[3], needle, maxLen)}`);
		}
		const total = wasTruncated ? `≥${totalMatches}+` : totalMatches;
		return textResult(`${total} match${totalMatches === 1 ? "" : "es"} in ${root} (showing ${lines.length})\n${lines.join("\n")}`);
	},
});

// ── 2. diff-hunks ───────────────────────────────────────────────────────

const diffHunksTool = defineTool({
	name: "diff-hunks",
	label: "Diff hunks",
	description:
		"Return current git diff hunks (working tree or staged) with N context lines.",
	promptSnippet: "diff-hunks: current git diff hunks only (working tree or staged)",
	promptGuidelines: ["Use diff-hunks to review uncommitted changes instead of raw git diff or full-file reads."],
	parameters: Type.Object({
		staged: Type.Optional(Type.Boolean({ description: "Diff the staged index instead of the working tree", default: false })),
		context: Type.Optional(Type.Number({ description: "Context lines per hunk (default 3)", default: 3 })),
		paths: Type.Optional(Type.Array(Type.String(), { description: "Optional pathspecs to limit the diff" })),
	}),
	async execute(_id, params, _sig, _onUpdate, ctx) {
		const root = gitRoot(ctx.cwd);
		if (!root) return textResult("[error] not a git repo");
		const flag = params.staged ? "--cached" : "";
		const paths = (params.paths ?? []).map(q).join(" ");
		const ctxn = Math.max(0, Math.min(20, params.context ?? 3));
		const stat = run(`git diff --stat --no-color ${flag} ${paths}`.trim(), root, 10_000, 2000);
		const hunks = run(`git diff --no-color --unified=${ctxn} ${flag} ${paths}`.trim(), root, 15_000, DEFAULT_CAP);
		const clean = !hunks.replace(/^\[exit [^]]*\]/, "").trim();
		return textResult(clean ? `${stat}\n\n(no changes${params.staged ? " staged" : " in working tree"})` : `stat:\n${stat}\n\nhunks:\n${hunks}`);
	},
});

// ── 3. code-index ───────────────────────────────────────────────────────

interface IndexEntry {
	name: string;
	kind: string;
	file: string;
	line: number;
}

interface IndexFile {
	root: string;
	builtAt: number;
	gitHash: string;
	overflow: boolean;
	entries: IndexEntry[];
}

const INDEX_DIR = path.join(process.env.HOME ?? os.homedir(), ".cache", "pi-code-index");
const INDEX_MAX_ENTRIES = 20_000;
const INDEX_MAX_AGE_MS = 30_000;

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
		globs: "-g '*.lua' -g '.{wezterm.lua}'",
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

function projectGitHash(root: string): string {
	try {
		const head = execSync("git rev-parse HEAD 2>/dev/null", { cwd: root, encoding: "utf8", timeout: 5000 }).trim();
		const dirty = execSync("git status --porcelain | sha256sum", { cwd: root, encoding: "utf8", timeout: 5000 }).trim().split(/\s+/)[0];
		return `${head}:${dirty}`;
	} catch {
		try {
			return String(fs.statSync(root).mtimeMs);
		} catch {
			return "unknown";
		}
	}
}

function buildIndex(root: string): IndexFile {
	const gitHash = projectGitHash(root);
	const entries: IndexEntry[] = [];
	const seen = new Set<string>();
	let overflow = false;
	for (const g of INDEX_GROUPS) {
		const cmd = `rg --hidden --no-heading -n --max-filesize 2M ${g.globs} ${IGNORES.map((x) => `-g ${q(x)}`).join(" ")} -e ${q(g.re.source)} ${q(root)}`;
		let raw: string;
		try {
			raw = execSync(cmd, { cwd: root, encoding: "utf8", timeout: 30_000, maxBuffer: 64 * 1024 * 1024, shell: "/bin/bash" });
		} catch {
			continue; // exit 1 = no matches in this language group
		}
		for (const line of raw.split("\n")) {
			const m = /^(.+?):(\d+):(.*)$/.exec(line);
			if (!m) continue;
			const text = m[3];
			const n = g.re.exec(text);
			if (!n?.groups?.name) continue;
			const key = `${m[1]}:${m[2]}`;
			if (seen.has(key)) continue;
			seen.add(key);
			entries.push({ name: n.groups.name, kind: g.kind === "derive" ? deriveKind(text) : g.kind, file: m[1], line: Number(m[2]) });
			if (entries.length >= INDEX_MAX_ENTRIES) {
				overflow = true;
				break;
			}
		}
		if (overflow) break;
	}
	entries.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1));
	const idx: IndexFile = { root, builtAt: Date.now(), gitHash, overflow, entries };
	try {
		fs.mkdirSync(INDEX_DIR, { recursive: true });
		const indexFile = path.join(INDEX_DIR, createHash("sha1").update(root).digest("hex").slice(0, 16) + ".json");
		fs.writeFileSync(indexFile, JSON.stringify(idx));
	} catch {
		// cache write failure is non-fatal
	}
	return idx;
}

function loadOrBuildIndex(root: string, force: boolean): IndexFile {
	const indexFile = path.join(INDEX_DIR, createHash("sha1").update(root).digest("hex").slice(0, 16) + ".json");
	if (!force) {
		try {
			const idx = JSON.parse(fs.readFileSync(indexFile, "utf8")) as IndexFile;
			if (idx.root === root && Date.now() - idx.builtAt < INDEX_MAX_AGE_MS && idx.gitHash === projectGitHash(root)) {
				return idx;
			}
		} catch {
			// stale or missing — rebuild
		}
	}
	return buildIndex(root);
}

const codeIndexTool = defineTool({
	name: "code-index",
	label: "Code index",
	description:
		"Find where a symbol is defined: name → file:line from a cached per-project index (rebuilt on change).",
	promptSnippet: "code-index: symbol map (name → file:line), rebuilt on change",
	promptGuidelines: ["Use code-index (or snippet) to locate symbol definitions instead of full-file reads."],
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

// ── 4. check ────────────────────────────────────────────────────────────

function findBin(cwd: string, name: string): string | null {
	const local = path.join(cwd, "node_modules", ".bin", name);
	if (fs.existsSync(local)) return local;
	try {
		const out = execSync(`command -v ${name}`, { cwd, encoding: "utf8", timeout: 3000 }).trim();
		return out || null;
	} catch {
		return null;
	}
}

function parseTsc(out: string): { errors: string[]; rawCount: number } {
	const seen = new Set<string>();
	const errors: string[] = [];
	let rawCount = 0;
	const re = /^(.+?\.(?:ts|tsx|js|jsx|mts|cts))\((\d+),(\d+)\): error (TS\d+): (.*)$/;
	for (const line of out.split("\n")) {
		const m = re.exec(line);
		if (!m) continue;
		rawCount++;
		const key = `${m[1]}:${m[2]}:${m[4]}:${m[5].trim()}`;
		if (seen.has(key)) continue;
		seen.add(key);
		errors.push(`${m[1]}:${m[2]}:${m[3]} ${m[4]} ${m[5].trim().slice(0, 200)}`);
		if (errors.length >= 200) break;
	}
	return { errors, rawCount };
}

function parseEslint(out: string): { errors: string[]; rawCount: number } {
	const seen = new Set<string>();
	const errors: string[] = [];
	let rawCount = 0;
	const re = /^(.+?): line (\d+), col (\d+), (Error|Warning) - (.+?)(?: \(([^)]+)\))?$/;
	for (const line of out.split("\n")) {
		const m = re.exec(line);
		if (!m) continue;
		rawCount++;
		const key = `${m[1]}:${m[2]}:${m[4]}`;
		if (seen.has(key)) continue;
		seen.add(key);
		errors.push(`${m[1]}:${m[2]}:${m[3]} ${m[4]}${m[5] ? ` (${m[5]})` : ""}`);
		if (errors.length >= 200) break;
	}
	return { errors, rawCount };
}

const checkTool = defineTool({
	name: "check",
	label: "Check code",
	description:
		"Run tsc/eslint and return only distilled unique errors (file:line:col CODE), capped.",
	promptSnippet: "check: distilled tsc/eslint errors (unique, capped)",
	promptGuidelines: ["Use check for distilled tsc/eslint errors instead of raw build output."],
	parameters: Type.Object({
		scope: Type.Optional(Type.String({ description: "Which checker to run", default: "tsc", enum: ["tsc", "eslint", "all"] })),
		maxErrors: Type.Optional(Type.Number({ description: "Max unique errors returned (default 15)", default: 15 })),
	}),
	async execute(_id, params, _sig, _onUpdate, ctx) {
		const scope = params.scope ?? "tsc";
		const maxErrors = Math.max(1, Math.min(100, params.maxErrors ?? 15));
		const parts: string[] = [];

		if (scope === "tsc" || scope === "all") {
			const bin = findBin(ctx.cwd, "tsc");
			if (!bin) parts.push("tsc: not found (not a TS project?)");
			else {
				const t0 = Date.now();
				const { code, out } = await runAsync(bin, ["--noEmit"], ctx.cwd, 120_000);
				const { errors, rawCount } = parseTsc(out);
				const clean = code === 0 || errors.length === 0;
				const head = `tsc: ${clean ? "clean ✓" : `${errors.length} unique error(s) (raw ${rawCount})`} · ${((Date.now() - t0) / 1000).toFixed(1)}s`;
				parts.push(head + (clean ? "" : `\n${errors.slice(0, maxErrors).join("\n")}` + (errors.length > maxErrors ? `\n… +${errors.length - maxErrors} more` : "")));
			}
		}

		if (scope === "eslint" || scope === "all") {
			const bin = findBin(ctx.cwd, "eslint");
			if (!bin) parts.push("eslint: not found");
			else {
				const t0 = Date.now();
				const { out } = await runAsync(bin, [".", "--format", "compact"], ctx.cwd, 120_000);
				const { errors, rawCount } = parseEslint(out);
				const clean = errors.length === 0;
				const head = `eslint: ${clean ? "clean ✓" : `${errors.length} unique problem(s) (raw ${rawCount})`} · ${((Date.now() - t0) / 1000).toFixed(1)}s`;
				parts.push(head + (clean ? "" : `\n${errors.slice(0, maxErrors).join("\n")}` + (errors.length > maxErrors ? `\n… +${errors.length - maxErrors} more` : "")));
			}
		}

		return textResult(parts.join("\n"));
	},
});

// ── 5. files-changed ────────────────────────────────────────────────────

const filesChangedTool = defineTool({
	name: "files-changed",
	label: "Files changed",
	description:
		"One-call repo snapshot: branch, git status --short, diff --stat (staged + unstaged).",
	promptSnippet: "files-changed: branch + git status + diff --stat in one call",
	promptGuidelines: ["Use files-changed to check repo state instead of separate git commands."],
	parameters: Type.Object({}),
	async execute(_id, _p, _sig, _onUpdate, ctx) {
		const root = gitRoot(ctx.cwd);
		if (!root) return textResult("[error] not a git repo");
		const branch = run("git rev-parse --abbrev-ref HEAD", root, 5000, 200).trim();
		const status = run("git status --short", root, 5000, 4000);
		const stat = run("git diff --stat --no-color && git diff --cached --stat --no-color", root, 5000, 2000);
		return textResult(`branch: ${branch}\nstatus:\n${status}\ndiff --stat:\n${stat}`);
	},
});

// ── register ────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	pi.registerTool(snippetTool);
	pi.registerTool(diffHunksTool);
	pi.registerTool(codeIndexTool);
	pi.registerTool(filesChangedTool);

	// `check` only earns prompt space in TypeScript/JavaScript projects.
	pi.on("session_start", (_event, ctx) => {
		if (isTsJsProject(ctx.cwd)) pi.registerTool(checkTool);
	});
}
