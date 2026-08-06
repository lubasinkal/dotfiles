/**
 * Lint engine for cmd-opt extension
 */

import type { LintFlag } from "./types.js";
import { RULES } from "./rules.js";

/** Analyze a command. Returns flags in severity order (block → rewrite → hint). */
export function lint(cmd: string): LintFlag[] {
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
export function applyRewrites(cmd: string): { cmd: string; applied: LintFlag[] } {
	let next = cmd;
	const applied: LintFlag[] = [];
	for (const flag of lint(next)) {
		if (flag.severity !== "rewrite" || !flag.replacement) continue;
		next = flag.replacement;
		applied.push(flag);
	}
	return { cmd: next, applied };
}
