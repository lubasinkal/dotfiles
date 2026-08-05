/**
 * check — tsc/eslint output distilled to unique file:line errors
 *
 * Only available in TypeScript/JavaScript projects. Parses tsc and eslint
 * output and deduplicates errors by file:line:message, returning a compact
 * list that the agent can act on directly instead of wading through raw
 * build noise.
 *
 * Install: import from token-tools.ts barrel, or register as standalone extension.
 * Depends on: tsc and/or eslint in PATH or node_modules/.bin.
 */

import { Type } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { findBin, runAsync, textResult } from "./shared.js";

function parseTsc(out: string): { errors: string[]; rawCount: number } {
	const seen = new Set<string>();
	const errors: string[] = [];
	let rawCount = 0;
	const re = /^(.+?\.(?:ts|tsx|js|jsx|mts|cts))\((\d+),(\d+)\): error (TS\d+): (.*)$/;
	for (const line of out.split("\n")) {
		const m = re.exec(line);
		if (!m) continue;
		rawCount++;
		const key = `${m[1]}:${m[2]}:${m[4]}:${m[5]}`;
		if (seen.has(key)) continue;
		seen.add(key);
		errors.push(`${m[1]}:${m[2]}: ${m[4]}: ${m[5]}`);
	}
	return { errors, rawCount };
}

function parseEslint(out: string): { errors: string[]; rawCount: number } {
	const seen = new Set<string>();
	const errors: string[] = [];
	let rawCount = 0;
	const re = /^(.+?)\s+(\d+):(\d+)\s+(error|warning)\s+(.+?)\s+(.+)$/;
	for (const line of out.split("\n")) {
		const m = re.exec(line);
		if (!m) continue;
		rawCount++;
		const key = `${m[1]}:${m[2]}:${m[5]}:${m[6]}`;
		if (seen.has(key)) continue;
		seen.add(key);
		errors.push(`${m[1]}:${m[2]}: ${m[4]} ${m[5]} (${m[6]})`);
	}
	return { errors, rawCount };
}

export const checkTool = defineTool({
	name: "check",
	label: "Build check",
	description:
		"Run tsc and/or eslint and return only unique file:line errors — no raw build output noise.",
	promptSnippet: "check: tsc/eslint output distilled to unique file:line errors (TS/JS repos only)",
	promptGuidelines: [
		"Use check after edits in TS/JS repos to surface only actionable errors.",
		"check is only available in TypeScript/JavaScript projects (detected automatically).",
		"scope='tsc' runs only TypeScript; scope='eslint' runs only eslint; scope='all' runs both.",
	],
	parameters: Type.Object({
		scope: Type.Optional(
			Type.Union([Type.Literal("tsc"), Type.Literal("eslint"), Type.Literal("all")], {
				description: "What to run (default: all available)",
				default: "all",
			}),
		),
	}),
	async execute(_id, params, _sig, _onUpdate, ctx) {
		const scope = params.scope ?? "all";
		const parts: string[] = [];
		const maxErrors = 120;

		if (scope === "tsc" || scope === "all") {
			const bin = findBin(ctx.cwd, "tsc");
			if (!bin) parts.push("tsc: not found");
			else {
				const t0 = Date.now();
				const { code, out } = await runAsync(bin, ["--noEmit"], ctx.cwd, 120_000);
				const { errors, rawCount } = parseTsc(out);
				const clean = code === 0 && errors.length === 0;
				const crashed = code !== 0 && errors.length === 0;
				const head = `tsc: ${clean ? "clean ✓" : crashed ? `exited ${code} (output not parsed)` : `${errors.length} unique error(s) (raw ${rawCount})`} · ${((Date.now() - t0) / 1000).toFixed(1)}s`;
				const body = clean ? "" : crashed ? `\n${out.slice(0, 2000)}` : `\n${errors.slice(0, maxErrors).join("\n")}` + (errors.length > maxErrors ? `\n… +${errors.length - maxErrors} more` : "");
				parts.push(head + body);
			}
		}

		if (scope === "eslint" || scope === "all") {
			const bin = findBin(ctx.cwd, "eslint");
			if (!bin) parts.push("eslint: not found");
			else {
				const t0 = Date.now();
				const { code, out } = await runAsync(bin, [".", "--format", "compact"], ctx.cwd, 120_000);
				const { errors, rawCount } = parseEslint(out);
				const clean = code === 0 && errors.length === 0;
				const crashed = code !== 0 && errors.length === 0;
				const head = `eslint: ${clean ? "clean ✓" : crashed ? `exited ${code} (output not parsed)` : `${errors.length} unique problem(s) (raw ${rawCount})`} · ${((Date.now() - t0) / 1000).toFixed(1)}s`;
				const body = clean ? "" : crashed ? `\n${out.slice(0, 2000)}` : `\n${errors.slice(0, maxErrors).join("\n")}` + (errors.length > maxErrors ? `\n… +${errors.length - maxErrors} more` : "");
				parts.push(head + body);
			}
		}

		return textResult(parts.join("\n"));
	},
});
