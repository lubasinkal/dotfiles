/**
 * files-changed — repo snapshot in one call
 *
 * Returns current branch, git status --short, and diff --stat for both
 * staged and unstaged changes. Replaces three separate bash calls.
 *
 * Install: import from token-tools.ts barrel, or register as standalone extension.
 * Depends on: git.
 */

import { Type } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { run, textResult } from "./shared.js";

export const filesChangedTool = defineTool({
	name: "files-changed",
	label: "Files changed",
	description:
		"One-call repo snapshot: branch, git status --short, diff --stat (staged + unstaged).",
	promptSnippet: "files-changed: repo snapshot (branch, status --short, diff --stat) in one call",
	promptGuidelines: [
		"Use files-changed to check repo state instead of separate git commands (status, branch, diff --stat).",
		"Use it at task start and before commits to confirm scope.",
		"For actual hunks, follow up with diff-hunks (paths= to limit scope).",
		"Stop at the snapshot unless you need hunks or file contents.",
	],
	parameters: Type.Object({}),
	async execute(_id, _params, _sig, _onUpdate, ctx) {
		const branch = run("git branch --show-current", ctx.cwd, 5000, 512);
		const staged = run("git diff --cached --stat", ctx.cwd, 10_000, 4096);
		const unstaged = run("git diff --stat", ctx.cwd, 10_000, 4096);
		const untracked = run("git status --short", ctx.cwd, 5000, 4096);

		const parts = [`branch: ${branch}`];
		if (staged.trim()) parts.push(`\nstaged:\n${staged}`);
		if (unstaged.trim()) parts.push(`\nunstaged:\n${unstaged}`);
		if (untracked.trim()) {
			const untrackedFiles = untracked.split("\n").filter((l) => l.startsWith("??")).length;
			if (untrackedFiles > 0) parts.push(`\n${untrackedFiles} untracked file(s)`);
		}
		if (parts.length === 1) parts.push("\nnothing changed");

		return textResult(parts.join(""));
	},
});

// No-op default so Pi's auto-discovery doesn't reject this module.
export default function() {}
