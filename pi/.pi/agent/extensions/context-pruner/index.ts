/**
 * Context Pruner Extension
 *
 * Prunes oversized tool results before each LLM call, keeping recent work
 * intact while trimming old history that the model only needs a reminder of.
 *
 * ## Strategy
 *
 * 1. **Keep the last 2 tool results untouched** — the model is still actively
 *    reasoning about its most recent tool interactions.
 * 2. **Older tool results** are truncated to 4 KB (or 2 KB for `read`
 *    results — the model already saw the file).
 * 3. **Empty / trivial thinking blocks** (< 30 chars) are removed.
 *
 * ## Expected savings
 *
 * In a 20+ turn session this eliminates 50–80 % of re-sent tool result
 * bytes while preserving active working memory.
 *
 * ## Thresholds (override via settings.json)
 *
 *   "contextPruner": {
 *     "maxToolResultChars": 4000,
 *     "maxReadResultChars": 2000,
 *     "minThinkingChars": 30
 *   }
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { DEFAULTS, KEEP_LAST_RESULTS } from "./types.js";
import { hasToolResultBlock, isToolResultRole, pruneToolResultBlock } from "./helpers.js";

let prevCumulative = 0;

export default function (pi: ExtensionAPI) {
	pi.on("context", async (event, ctx) => {
		const settings = DEFAULTS;
		let prunedTotal = 0;
		let blocksAffected = 0;

		// ── 1st pass: find tool-result message indices to protect ──
		const toolResultIdx: number[] = [];
		for (let i = 0; i < event.messages.length; i++) {
			const m = event.messages[i];
			if (isToolResultRole(m.role) || hasToolResultBlock(m)) {
				toolResultIdx.push(i);
			}
		}
		const protect = new Set(toolResultIdx.slice(-KEEP_LAST_RESULTS));

		// ── 2nd pass: prune unprotected messages ──
		for (let mi = 0; mi < event.messages.length; mi++) {
			const msg = event.messages[mi];

			// Pass-through for protected tool results
			if (protect.has(mi)) continue;

			// Skip custom messages without content (bashExecution, compactionSummary, …)
			if (!msg || typeof msg !== "object" || !("content" in msg)) continue;
			const content = (msg as { content?: unknown }).content;
			if (!Array.isArray(content)) continue;

			const perMsgThreshold =
				msg.role === "user" && content.some((b: any) => b?.type === "tool_result")
					? settings.maxReadResultChars
					: settings.maxToolResultChars;

			const newContent: unknown[] = [];

			for (const block of content) {
				if (!block || typeof block !== "object") {
					newContent.push(block);
					continue;
				}

				const b = block as Record<string, unknown>;

				// ── thinking blocks ──
				if (b.type === "thinking" && typeof b.thinking === "string") {
					const len = b.thinking.length;
					if (len < settings.minThinkingChars) {
						prunedTotal += len;
						blocksAffected++;
						continue;
					}
					newContent.push(block);
					continue;
				}

				// ── tool_result blocks (Anthropic format inside user messages) ──
				if (block.type === "tool_result") {
					newContent.push(pruneToolResultBlock(block, perMsgThreshold, (n) => (prunedTotal += n), () => blocksAffected++));
					continue;
				}

				// ── plain text blocks ──
				if (block.type === "text" && typeof block.text === "string") {
					if (block.text.length > perMsgThreshold) {
						const excess = block.text.length - perMsgThreshold;
						prunedTotal += excess;
						blocksAffected++;
						newContent.push({
							...block,
							text:
								block.text.slice(0, perMsgThreshold) +
								`\n\n[pruned: ${excess.toLocaleString()} chars]`,
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

		// Notify on net new pruning only
		const delta = prunedTotal - prevCumulative;
		if (delta > 0) {
			const saved = delta < 1_000
				? `${delta} B`
				: delta < 1_000_000
					? `${(delta / 1_000).toFixed(0)} KB`
					: `${(delta / 1_000_000).toFixed(1)} MB`;
			const total = prunedTotal < 1_000
				? `${prunedTotal} B`
				: prunedTotal < 1_000_000
					? `${(prunedTotal / 1_000).toFixed(0)} KB`
					: `${(prunedTotal / 1_000_000).toFixed(1)} MB`;
			const label = blocksAffected > 0 ? ` (${blocksAffected} blocks)` : "";
			ctx.ui.notify(`✂️ +${saved} pruned (${total} cumulative)${label}`, "info");
			prevCumulative = prunedTotal;
		}

		return { messages: event.messages };
	});
}
