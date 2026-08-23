/**
 * Helper functions for context-pruner extension
 */

import { estimateTokens, type PrunerSettings } from "./types.js";

// ── Message type guards ──

/** Check whether a message is a toolResult role */
export function isToolResultRole(role: string | undefined): boolean {
	return role === "toolResult" || role === "tool";
}

/** Check whether a message contains an Anthropic-format tool_result block */
export function hasToolResultBlock(msg: unknown): boolean {
	if (!msg || typeof msg !== "object") return false;
	const content = (msg as { content?: unknown }).content;
	if (!Array.isArray(content)) return false;
	return content.some((b: any) => b?.type === "tool_result");
}

/** Get total char count of a message's content blocks */
export function messageCharCount(msg: any): number {
	if (!msg || typeof msg !== "object") return 0;
	const content = msg.content;
	if (typeof content === "string") return content.length;
	if (Array.isArray(content)) {
		return content.reduce((sum: number, b: any) => {
			if (typeof b === "string") return sum + b.length;
			if (b?.type === "text" && typeof b.text === "string") return sum + b.text.length;
			if (b?.type === "thinking" && typeof b.thinking === "string") return sum + b.thinking.length;
			if (b?.type === "tool_result") {
				const raw = b.content;
				if (typeof raw === "string") return sum + raw.length;
				if (Array.isArray(raw)) {
					return sum + raw.reduce((s: number, inner: any) => {
						if (typeof inner === "string") return s + inner.length;
						if (inner?.type === "text" && typeof inner.text === "string") return s + inner.text.length;
						return s;
					}, 0);
				}
			}
			return sum;
		}, 0);
	}
	return 0;
}

/** Estimate token count for a message */
export function messageTokenCount(msg: any): number {
	return estimateTokens(messageCharCount(msg));
}

// ── Pruning functions ──

function truncate(text: string, threshold: number): { text: string; pruned: number } {
	if (text.length <= threshold) return { text, pruned: 0 };
	const excess = text.length - threshold;
	return {
		text: text.slice(0, threshold) + `\n\n[pruned: ${excess.toLocaleString()} chars]`,
		pruned: excess,
	};
}

/** Prune a tool_result block (Anthropic format inside user messages) */
export function pruneToolResultBlock(
	block: Record<string, unknown>,
	threshold: number,
	accum: (n: number) => void,
	markAffected: () => void,
): Record<string, unknown> {
	const raw = block.content;

	if (typeof raw === "string") {
		const { text, pruned } = truncate(raw, threshold);
		if (pruned > 0) {
			accum(pruned);
			markAffected();
			return { ...block, content: text };
		}
		return block;
	}

	if (Array.isArray(raw)) {
		return {
			...block,
			content: raw.map((inner) => trimInner(inner, threshold, accum, markAffected)),
		};
	}

	return block;
}

/** Trim inner content blocks recursively */
export function trimInner(
	block: unknown,
	threshold: number,
	accum: (n: number) => void,
	markAffected: () => void,
): unknown {
	if (!block || typeof block !== "object") return block;

	const b = block as Record<string, unknown>;

	if (b.type === "text" && typeof b.text === "string") {
		const { text, pruned } = truncate(b.text, threshold);
		if (pruned > 0) {
			accum(pruned);
			markAffected();
			return { ...b, text };
		}
		return block;
	}

	if (Array.isArray(b.content)) {
		return { ...b, content: b.content.map((inner) => trimInner(inner, threshold, accum, markAffected)) };
	}

	return block;
}

/** Replace a toolResult message with a compact summary */
export function summarizeToolResult(
	msg: any,
	settings: PrunerSettings,
	accum: (n: number) => void,
): any {
	const toolName = msg.toolName ?? "unknown";
	const content = msg.content;
	let originalChars = 0;

	if (typeof content === "string") {
		originalChars = content.length;
	} else if (Array.isArray(content)) {
		originalChars = content.reduce((sum: number, b: any) => {
			if (typeof b === "string") return sum + b.length;
			if (b?.type === "text" && typeof b.text === "string") return sum + b.text.length;
			return sum;
		}, 0);
	}

	if (originalChars <= settings.persistedReadChars) return msg;

	const saved = originalChars - settings.persistedReadChars;
	accum(saved);

	// Build a compact summary preserving key metadata
	const summary = `[Tool result: ${toolName} — ${originalChars.toLocaleString()} chars, pruned to summary]`;

	return {
		...msg,
		content: [{ type: "text", text: summary }],
	};
}

// ── Keyword extraction ──

const STOP_WORDS = new Set([
	"the", "a", "an", "and", "or", "but", "is", "are", "was", "were", "be", "been",
	"being", "have", "has", "had", "do", "does", "did", "will", "would", "could",
	"should", "may", "might", "can", "shall", "to", "of", "in", "for", "on", "with",
	"at", "by", "from", "as", "into", "about", "between", "through", "during", "before",
	"after", "above", "below", "out", "off", "over", "under", "again", "further",
	"then", "once", "here", "there", "when", "where", "why", "how", "all", "each",
	"every", "both", "few", "more", "most", "other", "some", "such", "no", "not",
	"only", "own", "same", "so", "than", "too", "very", "just", "now", "also",
	"that", "this", "these", "those", "it", "its", "if", "what", "which", "who",
	"whom", "you", "your", "i", "my", "me", "we", "our", "they", "them", "their",
	"he", "she", "him", "her", "his", "up", "said", "get", "got", "make", "made",
	// pi-specific noise
	"use", "run", "need", "find", "search", "check", "look", "see", "tell", "show",
	"file", "files", "path", "please",
]);

/**
 * Extract meaningful keywords from text, filtering stop words.
 * Returns lowercase unique keywords.
 */
export function extractKeywords(text: string): Set<string> {
	const words = text.toLowerCase().split(/[^a-z0-9_./\\-]+/);
	const keywords = new Set<string>();
	for (const w of words) {
		const clean = w.replace(/[^a-z0-9_./\\-]/g, "");
		if (clean.length < 2 || STOP_WORDS.has(clean)) continue;
		// Also keep path-like tokens (e.g., "src/components/app.ts")
		keywords.add(clean);
	}
	return keywords;
}

/**
 * Compute relevance score for a message against a set of keywords.
 * Higher = more relevant, should be kept.
 */
export function relevanceScore(msg: any, keywords: Set<string>): number {
	if (keywords.size === 0) return 0;
	const text = getMessageText(msg).toLowerCase();
	if (!text) return 0;

	let matches = 0;
	for (const kw of keywords) {
		if (text.includes(kw)) matches++;
	}
	// Normalize to 0..1 range
	return matches / keywords.size;
}

export function getMessageText(msg: any): string {
	if (!msg || typeof msg !== "object") return "";
	const content = msg.content;
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		return content
			.map((b: any) => {
				if (typeof b === "string") return b;
				if (b?.type === "text" && typeof b.text === "string") return b.text;
				if (b?.type === "thinking" && typeof b.thinking === "string") return b.thinking;
				return "";
			})
			.join("\n");
	}
	return "";
}
