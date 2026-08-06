/**
 * Types and defaults for context-pruner extension
 */

export interface PrunerSettings {
	maxToolResultChars: number;
	maxReadResultChars: number;
	minThinkingChars: number;
}

export const DEFAULTS: PrunerSettings = {
	maxToolResultChars: 4_000,
	maxReadResultChars: 2_000,
	minThinkingChars: 30,
};

/** Number of most-recent tool-result messages to leave completely untouched. */
export const KEEP_LAST_RESULTS = 2;
