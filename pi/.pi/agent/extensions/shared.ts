/**
 * Shared helpers for the token-saving tool suite.
 *
 * Import from individual tool files — this is not an extension itself.
 */

import { execSync, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

export const DEFAULT_CAP = 8_192;

export const IGNORES = [
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
export function q(s: string): string {
	return "'" + s.replace(/'/g, `'\\''`) + "'";
}

/** Truncate a string to maxBytes (UTF-8 safe). */
export function truncate(s: string, maxBytes: number): string {
	const b = Buffer.from(s, "utf8");
	if (b.length <= maxBytes) return s;
	const cut = b.subarray(0, maxBytes);
	// Avoid cutting a multi-byte char
	let str = cut.toString("utf8");
	const full = s.slice(0, str.length);
	if (full !== str) str = str.slice(0, -1);
	return str + "…";
}

/**
 * Synchronous shell exec — returns stdout as string.
 * On error, returns stderr + exit code as a visible string (never throws).
 */
export function run(
	cmd: string,
	cwd: string,
	timeoutMs = 10_000,
	maxBytes = DEFAULT_CAP,
): string {
	try {
		const raw = execSync(cmd, {
			cwd,
			encoding: "utf8",
			timeout: timeoutMs,
			maxBuffer: 64 * 1024 * 1024,
			shell: "/bin/bash",
		});
		return truncate(raw, maxBytes);
	} catch (err: any) {
		const stderr = err?.stderr?.toString?.() ?? "";
		const code = err?.status ?? 1;
		return `[exit ${code}] ${truncate(stderr, maxBytes)}`;
	}
}

/**
 * Async shell exec — returns { code, out }.
 * Resolves when the process exits; never rejects.
 */
export function runAsync(
	bin: string,
	args: string[],
	cwd: string,
	timeoutMs = 30_000,
): Promise<{ code: number; out: string }> {
	return new Promise((resolve) => {
		let out = "";
		let finished = false;
		const finish = (code: number, extra = "") => {
			if (finished) return;
			finished = true;
			resolve({ code, out: out + extra });
		};
		const child = spawn(bin, args, {
			cwd,
			stdio: ["ignore", "pipe", "pipe"],
			shell: true,
			timeout: timeoutMs,
		});
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

/** Return the git root of `cwd`, or null if not inside a repo. */
export function gitRoot(cwd: string): string | null {
	try {
		const out = execSync("git rev-parse --show-toplevel", { cwd, encoding: "utf8", timeout: 5000 }).trim();
		return out || null;
	} catch {
		return null;
	}
}

/** Find a binary in local node_modules/.bin, then fall back to `which`. */
export function findBin(cwd: string, name: string): string | null {
	const local = path.join(cwd, "node_modules", ".bin", name);
	if (fs.existsSync(local)) return local;
	try {
		const out = execSync(`command -v ${name}`, { cwd, encoding: "utf8", timeout: 3000 }).trim();
		return out || null;
	} catch {
		return null;
	}
}

/** Standard tool result wrapper. */
export function textResult(text: string) {
	return { content: [{ type: "text" as const, text }], details: {} };
}

const TS_JS_MARKERS = ["package.json", "tsconfig.json", "tsconfig.app.json", "tsconfig.node.json", "jsconfig.json"];

/** True if cwd or its git root looks like a TypeScript/JavaScript project. */
export function isTsJsProject(cwd: string): boolean {
	for (const dir of new Set([cwd, gitRoot(cwd)].filter((d): d is string => !!d))) {
		if (TS_JS_MARKERS.some((m) => fs.existsSync(path.join(dir, m)))) return true;
	}
	return false;
}

// No-op default so Pi's auto-discovery doesn't reject this module.
export default function() {}

