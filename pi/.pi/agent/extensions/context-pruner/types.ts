/**
 * Types and defaults for context-pruner extension
 */

export interface PrunerSettings {
	/** Max chars for tool results (bash, rg, etc.) */
	maxToolResultChars: number;
	/** Max chars for read results (model already saw file) */
	maxReadResultChars: number;
	/** Max chars for edit/diff results (always keep more — model verifies edits) */
	maxDiffResultChars: number;
	/** Thinking blocks shorter than this are removed */
	minThinkingChars: number;
	/** Token budget ratio — prune when estimated tokens exceed this fraction of context limit */
	budgetThreshold: number;
	/** Estimated context window size in tokens (defaults to 180k for claude-sonnet) */
	contextLimitTokens: number;
	/** Keep at most N most-recent tool results untouched */
	keepLastResults: number;
	/** Max chars for a persisted/replaced read result (replaced with summary) */
	persistedReadChars: number;
	/** Minimum gap in chars before we bother pruning a block */
	minPruneGap: number;
}

export const DEFAULTS: PrunerSettings = {
	maxToolResultChars: 4_000,
	maxReadResultChars: 2_000,
	maxDiffResultChars: 8_000,
	minThinkingChars: 30,
	budgetThreshold: 0.85,
	contextLimitTokens: 180_000,
	keepLastResults: 3,
	persistedReadChars: 1_500,
	minPruneGap: 500,
};

/** Tool names whose results should be treated as file reads */
export const READ_TOOLS = new Set(["read", "read-cap"]);

/** Tool names whose results are diffs/edits — keep more content */
export const DIFF_TOOLS = new Set(["edit", "diff-hunks"]);

/** Tool names that produce ephemeral search results — aggressively prune */
export const SEARCH_TOOLS = new Set(["rg", "snippet", "fd", "code-index", "files-changed"]);

/** Tool names whose results are critical — never hard-truncate */
export const CRITICAL_TOOLS = new Set(["edit", "fee-note-sync"]);

/**
 * Estimate tokens from chars. ~4 chars/token for English/code.
 * This is a rough heuristic; real tokenizers vary.
 */
export function estimateTokens(chars: number): number {
	return Math.ceil(chars / 4);
}


