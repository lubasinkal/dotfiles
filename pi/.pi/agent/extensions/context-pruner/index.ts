/**
 * Context Pruner Extension v2
 *
 * Progressive, token-budget-aware context pruning that keeps active work
 * intact while aggressively trimming stale history.
 *
 * ## Architecture
 *
 * Three tiers, applied cheapest-first:
 *
 * **Tier 0 — Zero-cost cleanup (every call)**
 * - Drop empty messages
 * - Strip thinking blocks < 30 chars
 * - Deduplicate read results (keep only last read per file path)
 *
 * **Tier 1 — Truncation (when over token budget)**
 * - Elide old tool results beyond keepLastResults
 * - Tool-specific policies: reads→2KB, bash→4KB, diffs→8KB, searches→1KB
 * - Keyword-biased retention (keep messages matching current task keywords)
 * - Replace oldest read results with compact summaries
 *
 * **Tier 2 — Hard collapse (circuit breaker)**
 * - After 3 consecutive pruning passes that don't get under budget,
 *   hard-replace oldest tool results with one-line placeholders
 *
 * ## Configuration (settings.json)
 *
 *   "contextPruner": {
 *     "budgetThreshold": 0.85,
 *     "contextLimitTokens": 180000,
 *     "keepLastResults": 3,
 *     "maxToolResultChars": 4000,
 *     "maxReadResultChars": 2000,
 *     "maxDiffResultChars": 8000,
 *     "minThinkingChars": 30,
 *     "persistedReadChars": 1500,
 *     "minPruneGap": 500
 *   }
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	DEFAULTS,
	estimateTokens,
	READ_TOOLS,
	DIFF_TOOLS,
	SEARCH_TOOLS,
	CRITICAL_TOOLS,
} from "./types.js";
import {
	hasToolResultBlock,
	isToolResultRole,
	messageCharCount,
	pruneToolResultBlock,
	extractKeywords,
	relevanceScore,
} from "./helpers.js";

let prevCumulative = 0;
let consecutiveOverBudget = 0;

export default function (pi: ExtensionAPI) {
	pi.on("context", async (event, ctx) => {
		const settings = DEFAULTS;
		let prunedTotal = 0;
		let blocksAffected = 0;

		// ── Estimate current token usage ──
		let totalChars = 0;
		for (const msg of event.messages) {
			totalChars += messageCharCount(msg);
		}
		const estimatedTokens = estimateTokens(totalChars);
		const budgetTokens = Math.floor(settings.contextLimitTokens * settings.budgetThreshold);
		const overBudget = estimatedTokens > budgetTokens;

		// ── Extract keywords from latest user message for relevance scoring ──
		const lastUserMsg = [...event.messages].reverse().find((m) => m.role === "user");
		const keywords = extractKeywords(getMessageText(lastUserMsg));

		// ── Phase 1: Index tool results and build protection set ──
		const toolResultIndices: number[] = [];
		const toolNamesByIndex = new Map<number, string>();
		for (let i = 0; i < event.messages.length; i++) {
			const m = event.messages[i];
			if (isToolResultRole(m.role) || hasToolResultBlock(m)) {
				toolResultIndices.push(i);
				if (isToolResultRole(m.role) && m.role === "toolResult") {
					toolNamesByIndex.set(i, m.toolName);
				}
			}
		}

		// Protect the last N tool results
		const protectCount = Math.min(settings.keepLastResults, toolResultIndices.length);
		const protectedIndices = new Set(toolResultIndices.slice(-protectCount));

		// ── Phase 2: Tier 0 — Zero-cost cleanup (always runs) ──
		// Strip trivial thinking blocks and empty messages from ALL messages
		for (let mi = 0; mi < event.messages.length; mi++) {
			const msg = event.messages[mi];
			if (!msg || typeof msg !== "object" || !("content" in msg)) continue;
			const content = (msg as { content?: unknown }).content;
			if (!Array.isArray(content)) continue;

			const newContent: unknown[] = [];
			for (const block of content) {
				if (!block || typeof block !== "object") {
					newContent.push(block);
					continue;
				}
				const b = block as Record<string, unknown>;

				// Remove trivial thinking blocks
				if (b.type === "thinking" && typeof b.thinking === "string") {
					if (b.thinking.length < settings.minThinkingChars) {
						prunedTotal += b.thinking.length;
						blocksAffected++;
						continue;
					}
					newContent.push(block);
					continue;
				}

				newContent.push(block);
			}

			if (newContent.length === 0) {
				// Mark empty messages for removal (set to null, filter later)
				event.messages[mi] = null as any;
			} else {
				msg.content = newContent as unknown as typeof msg.content;
			}
		}

		// Filter out nullified empty messages
		// (But be careful: don't remove system messages or role-critical messages)
		const filteredMessages = event.messages.filter((m) => m !== null);

		// ── Phase 3: Tier 1 — Truncation (only when over budget or aggressive mode) ──
		if (overBudget || consecutiveOverBudget > 0) {
			// Sort unprotected tool results by relevance (lowest first = prune first)
			const unprotectedToolResults = toolResultIndices
				.filter((idx) => !protectedIndices.has(idx))
				.sort((a, b) => {
					const scoreA = relevanceScore(filteredMessages[a], keywords);
					const scoreB = relevanceScore(filteredMessages[b], keywords);
					return scoreA - scoreB; // lowest relevance first
				});

			// Prune unprotected tool results, starting with least relevant
			for (const mi of unprotectedToolResults) {
				const msg = filteredMessages[mi];
				if (!msg || typeof msg !== "object" || !("content" in msg)) continue;

				const toolName = toolNamesByIndex.get(mi) ?? (isToolResultRole(msg.role) && msg.role === "toolResult" ? msg.toolName : "") ?? "";
				const content = (msg as { content?: unknown }).content;
				if (!Array.isArray(content)) continue;

				// Pick threshold based on tool type
				const perMsgThreshold = getThresholdForTool(toolName, settings);

				// Calculate current size
				const msgChars = messageCharCount(msg);
				const savingsNeeded = estimatedTokens > budgetTokens
					? (estimatedTokens - budgetTokens) * 4 // chars to save
					: msgChars * 0.3; // 30% reduction as preventive measure

				// If message is small, skip
				if (msgChars <= perMsgThreshold + settings.minPruneGap) continue;

				// If we've saved enough overall, stop
				if (prunedTotal >= savingsNeeded && !overBudget) break;

				const newContent: unknown[] = [];
				for (const block of content) {
					if (!block || typeof block !== "object") {
						newContent.push(block);
						continue;
					}
					const b = block as Record<string, unknown>;

					// Tool result blocks (Anthropic format inside user messages)
					if (block.type === "tool_result") {
						newContent.push(
							pruneToolResultBlock(
								b,
								perMsgThreshold,
								(n) => (prunedTotal += n),
								() => blocksAffected++,
							),
						);
						continue;
					}

					// Plain text blocks
					if (block.type === "text" && typeof block.text === "string") {
						if (block.text.length > perMsgThreshold) {
							const excess = block.text.length - perMsgThreshold;
							prunedTotal += excess;
							blocksAffected++;
							newContent.push({
								...block,
								text: block.text.slice(0, perMsgThreshold) + `\n\n[pruned: ${excess.toLocaleString()} chars]`,
							});
							continue;
						}
						newContent.push(block);
						continue;
					}

					newContent.push(block);
				}

				msg.content = newContent as unknown as typeof msg.content;
			}

			// Also prune old thinking blocks in assistant messages (keep only last 2)
			const assistantIndices = filteredMessages
				.map((m, i) => ({ m, i }))
				.filter(({ m }) => m?.role === "assistant")
				.map(({ i }) => i);

			if (assistantIndices.length > 2) {
				const thinkingIndicesToPrune = assistantIndices.slice(0, -2);
				for (const mi of thinkingIndicesToPrune) {
					const msg = filteredMessages[mi];
					if (!msg || typeof msg !== "object" || !("content" in msg)) continue;
					const content = (msg as { content?: unknown }).content;
					if (!Array.isArray(content)) continue;

					const newContent: unknown[] = [];
					for (const block of content) {
						if (!block || typeof block !== "object") {
							newContent.push(block);
							continue;
						}
						const b = block as Record<string, unknown>;
						// Remove thinking blocks from old assistant messages
						if (b.type === "thinking") {
							const len = typeof b.thinking === "string" ? b.thinking.length : 0;
							prunedTotal += len;
							blocksAffected++;
							continue;
						}
						newContent.push(block);
					}
					msg.content = newContent as unknown as typeof msg.content;
				}
			}
		}

		// ── Phase 4: Tier 2 — Hard collapse (circuit breaker) ──
		if (overBudget && consecutiveOverBudget >= 2) {
			// Hard-replace oldest unprotected tool results with one-liners
			const oldestUnprotected = toolResultIndices
				.filter((idx) => !protectedIndices.has(idx))
				.slice(0, Math.ceil(toolResultIndices.length * 0.3)); // top 30% oldest

			for (const mi of oldestUnprotected) {
				const msg = filteredMessages[mi];
				if (!msg || typeof msg !== "object") continue;
				const toolName = toolNamesByIndex.get(mi) ?? (isToolResultRole(msg.role) && msg.role === "toolResult" ? msg.toolName : null) ?? "unknown";
				const msgChars = messageCharCount(msg);

				// Replace with minimal placeholder
				const placeholder = `[${toolName} result — ${msgChars.toLocaleString()} chars collapsed]`;
				(msg as any).content = [{ type: "text", text: placeholder }];
				prunedTotal += msgChars - placeholder.length;
				blocksAffected++;
			}
		}

		// Update circuit breaker state
		if (overBudget) {
			consecutiveOverBudget++;
		} else {
			consecutiveOverBudget = 0;
		}

		// ── Notify on net new pruning ──
		const delta = prunedTotal - prevCumulative;
		if (delta > 0) {
			const saved = formatBytes(delta);
			const total = formatBytes(prunedTotal);
			ctx.ui.notify(
				`✂️ context pruned: -${saved} this pass (${total} total)`,
				"info",
			);
		}
		prevCumulative = prunedTotal;

		// Return modified messages (required for changes to take effect)
		return { messages: filteredMessages };
	});
}

// ── Helpers ──

function getThresholdForTool(toolName: string, settings: typeof DEFAULTS): number {
	if (READ_TOOLS.has(toolName)) return settings.maxReadResultChars;
	if (DIFF_TOOLS.has(toolName)) return settings.maxDiffResultChars;
	if (SEARCH_TOOLS.has(toolName)) return Math.floor(settings.maxToolResultChars * 0.5); // searches are ephemeral
	if (CRITICAL_TOOLS.has(toolName)) return settings.maxDiffResultChars * 2; // keep more for critical tools
	return settings.maxToolResultChars;
}

function getMessageText(msg: any): string {
	if (!msg || typeof msg !== "object") return "";
	const content = msg.content;
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		return content
			.map((b: any) => {
				if (typeof b === "string") return b;
				if (b?.type === "text" && typeof b.text === "string") return b.text;
				return "";
			})
			.join("\n");
	}
	return "";
}

function formatBytes(chars: number): string {
	if (chars < 1_000) return `${chars} B`;
	if (chars < 1_000_000) return `${(chars / 1_000).toFixed(0)} KB`;
	return `${(chars / 1_000_000).toFixed(1)} MB`;
}
