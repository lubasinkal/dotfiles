/**
 * Shared types for cmd-opt extension
 */

export interface Rule {
	id: string;
	severity: "block" | "rewrite" | "hint";
	re: RegExp;
	message: string;
	/** For rewrite rules: build the replacement for the whole command. */
	replace?: (m: RegExpExecArray, cmd: string) => string;
	/** Approx chars saved when triggered (for stats). */
	savings: number;
}

export interface LintFlag {
	id: string;
	severity: "block" | "rewrite" | "hint";
	message: string;
	replacement?: string;
	savings: number;
}

export interface Stats {
	linted: number;
	rewritten: number;
	blocked: number;
	hinted: number;
	charsSaved: number;
	resultsCapped: number;
	lastBlockReason: string;
}
