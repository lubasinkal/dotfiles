/**
 * git-guard — refuse to commit secrets or debug leftovers.
 *
 * Hooks `tool_call` for bash. When the command is a `git commit`, the staged
 * diff is scanned before git runs. A hit blocks the call and tells the agent
 * exactly which file:line matched, so it can fix the change instead of
 * committing it.
 *
 * quality-gate already warns about `.only`/`debugger` after an edit, but that
 * is advisory and skips anything written outside the edit/write tools. This is
 * the hard stop at the one irreversible point.
 *
 * Bypass: PI_GIT_GUARD=off in the environment.
 *
 * shortcut: patterns are hardcoded (same tradeoff as quality-gate); move to a
 * config file if they need per-repo tuning.
 *
 * Install: ~/.pi/agent/extensions/git-guard/index.ts, then /reload.
 */

import { execFileSync } from "node:child_process";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { piEnv } from "../../lib/shared.js";

// ── Rules ───────────────────────────────────────────────────────────────

const CONTENT_RULES: { id: string; re: RegExp }[] = [
	{ id: "private-key", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
	{ id: "aws-access-key", re: /\bAKIA[0-9A-Z]{16}\b/ },
	{ id: "github-token", re: /\bgh[pousr]_[A-Za-z0-9]{36,}/ },
	{ id: "slack-token", re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/ },
	{ id: "anthropic-key", re: /\bsk-ant-[A-Za-z0-9_-]{20,}/ },
	{ id: "openai-key", re: /\bsk-[A-Za-z0-9]{32,}\b/ },
	{ id: "google-api-key", re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
	{ id: "test-focused", re: /\b(?:it|describe|test|context)\.only\s*\(/ },
	{ id: "debugger", re: /^\s*debugger\s*;?\s*$/ },
];

/** Files that should not be committed at all. */
const PATH_RULES: { id: string; re: RegExp }[] = [
	{ id: "env-file", re: /(^|\/)\.env(\.(?!example$|sample$|template$)[^/]*)?$/ },
	{ id: "private-key-file", re: /\.(pem|p12|pfx|keystore)$/i },
	{ id: "ssh-key", re: /(^|\/)id_(rsa|dsa|ecdsa|ed25519)$/ },
];

// ── Command detection ───────────────────────────────────────────────────

/**
 * True for a `git commit` invocation, including option prefixes such as
 * `git -C dir commit` and `git -c user.name=x commit`, in any command list.
 * `git log --grep commit` must not match.
 */
export function isGitCommit(command: string): boolean {
	const gitInvocation = /\bgit\b(?:\s+-[Cc]\s*\S+|\s+--?[A-Za-z-]+=\S+|\s+--no-[a-z-]+|\s+-p)*\s+commit\b/;
	return command.split(/&&|\|\||[;|\n]/).some((part) => gitInvocation.test(part));
}

/** `-a` / `--all` makes `git commit` include unstaged changes to tracked files. */
export function commitsAllFiles(command: string): boolean {
	return /\bcommit\b[^;&|\n]*(?:--all\b|-[A-Za-z]*a[A-Za-z]*(?:\s|$))/.test(command);
}

/**
 * Directories each `git commit` in the command would run in, honouring
 * `cd <dir> &&` and `git -C <dir>`, so a commit aimed at another repo is
 * scanned against that repo's index rather than the session's cwd.
 */
export function commitTargets(command: string, baseCwd: string): string[] {
	const targets: string[] = [];
	let cwd = baseCwd;

	for (const part of command.split(/&&|\|\||[;|\n]/)) {
		const trimmed = part.trim();
		if (!trimmed) continue;

		const cd = /^cd\s+(?:"([^"]+)"|'([^']+)'|(\S+))/.exec(trimmed);
		if (cd) {
			cwd = path.resolve(cwd, cd[1] ?? cd[2] ?? cd[3] ?? "");
			continue;
		}

		if (!/\bgit\b(?:(?:\s+-[Cc]\s*\S+)|(?:\s+--?[A-Za-z-]+=\S+)|(?:\s+--no-[a-z-]+)|(?:\s+-p))*\s+commit\b/.test(trimmed)) continue;

		const cFlag = /\bgit\b[^;&|\n]*?\s-C\s*(?:"([^"]+)"|'([^']+)'|(\S+))/.exec(trimmed);
		targets.push(cFlag ? path.resolve(cwd, cFlag[1] ?? cFlag[2] ?? cFlag[3] ?? "") : cwd);
	}

	return targets;
}

// ── Diff scanning ───────────────────────────────────────────────────────

interface Hit {
	file: string;
	line: number;
	rule: string;
}

/** Parse added lines out of a `-U0` diff, keeping their line numbers. */
function scanDiff(diff: string): Hit[] {
	const hits: Hit[] = [];
	let file = "";
	let newLine = 0;

	for (const raw of diff.split("\n")) {
		if (raw.startsWith("+++ b/")) {
			file = raw.slice(6);
			continue;
		}
		const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
		if (hunk) {
			newLine = Number(hunk[1]);
			continue;
		}
		if (file === "") continue;
		if (raw.startsWith("+")) {
			const text = raw.slice(1);
			for (const rule of CONTENT_RULES) {
				if (rule.re.test(text)) hits.push({ file, line: newLine, rule: rule.id });
			}
			newLine++;
		} else if (!raw.startsWith("-") && !raw.startsWith("\\")) {
			newLine++;
		}
	}
	return hits;
}

function git(args: string[], cwd: string): string {
	return execFileSync("git", args, {
		cwd,
		encoding: "utf8",
		timeout: 10_000,
		maxBuffer: 32 * 1024 * 1024,
		stdio: ["ignore", "pipe", "pipe"],
		env: piEnv(),
	});
}

function stagedFiles(cwd: string): string[] {
	return git(["diff", "--cached", "--name-only", "-z"], cwd).split("\0").filter(Boolean);
}

// ── Guard ───────────────────────────────────────────────────────────────

export interface GuardResult {
	block: boolean;
	reason?: string;
}

/** Scan what would be committed; returns a block decision. */
export function checkCommit(cwd: string, command: string): GuardResult {
	if (process.env.PI_GIT_GUARD === "off") return { block: false };

	let files: string[];
	let diff: string;
	try {
		files = stagedFiles(cwd);
		// -a also commits unstaged changes to tracked files.
		diff = commitsAllFiles(command) ? git(["diff", "HEAD", "-U0", "--no-color"], cwd) : git(["diff", "--cached", "-U0", "--no-color"], cwd);
	} catch {
		// Not a git repo, no commits yet, or git unavailable: let git report it.
		return { block: false };
	}

	const hits: Hit[] = [];
	for (const file of files) {
		for (const rule of PATH_RULES) {
			if (rule.re.test(file)) hits.push({ file, line: 0, rule: rule.id });
		}
	}
	hits.push(...scanDiff(diff));

	if (hits.length === 0) return { block: false };

	const detail = hits
		.slice(0, 12)
		.map((h) => `  ${h.file}${h.line ? `:${h.line}` : ""}  ${h.rule}`)
		.join("\n");
	const more = hits.length > 12 ? `\n  … ${hits.length - 12} more` : "";
	const reason =
		`Blocked: this commit would include ${hits.length} flagged item(s):\n${detail}${more}\n\n` +
		`Fix the change (remove the secret/debug artifact) and commit again, or commit outside pi.\n` +
		`Intentional? Set PI_GIT_GUARD=off for the session.`;

	return { block: true, reason };
}

export default function gitGuard(pi: ExtensionAPI) {
	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName !== "bash") return;
		const command = (event.input as { command?: string }).command;
		if (!command || !isGitCommit(command)) return;

		for (const cwd of commitTargets(command, ctx.cwd)) {
			const result = checkCommit(cwd, command);
			if (result.block) return result;
		}
		return { block: false };
	});
}
