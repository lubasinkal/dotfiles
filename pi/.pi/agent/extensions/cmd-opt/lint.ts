/**
 * Lint engine for cmd-opt extension
 */

import type { LintFlag } from "./types.js";
import { RULES } from "./rules.js";

/** Analyze a command. Returns flags in severity order (block → rewrite → hint). */
export function lint(cmd: string): LintFlag[] {
	const flags: LintFlag[] = [];

	for (const rule of RULES) {
		const m = rule.re.exec(cmd);
		if (!m) continue;
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

/**
 * Apply rewrite rules to a command, returning the optimized form.
 *
 * A replacement is computed against the string it matched, so rewrites are
 * applied one at a time and the result is re-linted: applying a batch computed
 * from the original command would let each later rewrite overwrite the earlier
 * ones.
 */
export function applyRewrites(cmd: string): { cmd: string; applied: LintFlag[] } {
	let next = cmd;
	const applied: LintFlag[] = [];
	for (let pass = 0; pass < 10; pass++) {
		const rewrite = lint(next).find(
			(flag) => flag.severity === "rewrite" && flag.replacement && flag.replacement !== next,
		);
		if (!rewrite?.replacement) break;
		next = rewrite.replacement;
		applied.push(rewrite);
	}
	return { cmd: next, applied };
}
