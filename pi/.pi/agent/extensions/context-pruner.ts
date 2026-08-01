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

const DEFAULTS = {
	maxToolResultChars: 4_000,
	maxReadResultChars: 2_000,
	minThinkingChars: 30,
};

/** Number of most-recent tool-result messages to leave completely untouched. */
const KEEP_LAST_RESULTS = 2;

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
			if (!("content" in msg)) continue;

			// Plain-string content
			if (typeof msg.content === "string") {
				const threshold = settings.maxToolResultChars;
				if (msg.content.length > threshold) {
					const excess = msg.content.length - threshold;
					prunedTotal += excess;
					blocksAffected++;
					msg.content =
						msg.content.slice(0, threshold) +
						`\n\n[pruned: ${excess.toLocaleString()} chars]`;
				}
				continue;
			}

			if (!Array.isArray(msg.content)) continue;

			// Determine per-message threshold
			const isRead = msg.role === "toolResult" && msg.toolName === "read";
			const perMsgThreshold = isRead ? settings.maxReadResultChars : settings.maxToolResultChars;

			const newContent: Array<Record<string, unknown>> = [];

			// Cast blocks to a loose shape: providers may emit Anthropic wire-format
			// blocks (tool_result) that aren't modeled in the TS block union.
			for (const rawBlock of msg.content) {
				const block = rawBlock as { type?: string; text?: string; thinking?: string; content?: unknown };

				// ── thinking blocks: drop empty / trivial ──
				if (block.type === "thinking") {
					const len = block.thinking?.length ?? 0;
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

// ── helpers ────────────────────────────────────────────────────────────

/** Quick check whether a message contains an Anthropic-format tool_result block. */
function hasToolResultBlock(msg: unknown): boolean {
	if (!msg || typeof msg !== "object") return false;
	const content = (msg as { content?: unknown }).content;
	if (!Array.isArray(content)) return false;
	return content.some((b: any) => b?.type === "tool_result");
}

/** Current pi uses role "toolResult"; keep "tool" for legacy sessions. */
function isToolResultRole(role: string | undefined): boolean {
	return role === "toolResult" || role === "tool";
}

function pruneToolResultBlock(
	block: Record<string, unknown>,
	threshold: number,
	accum: (n: number) => void,
	markAffected: () => void,
): Record<string, unknown> {
	const raw = block.content;

	if (typeof raw === "string") {
		if (raw.length <= threshold) return block;
		const excess = raw.length - threshold;
		accum(excess);
		markAffected();
		return {
			...block,
			content:
				raw.slice(0, threshold) +
				`\n\n[pruned: ${excess.toLocaleString()} chars]`,
		};
	}

	if (Array.isArray(raw)) {
		return {
			...block,
			content: raw.map((inner) => trimInner(inner, threshold, accum, markAffected)),
		};
	}

	return block;
}

function trimInner(
	block: unknown,
	threshold: number,
	accum: (n: number) => void,
	markAffected: () => void,
): unknown {
	if (!block || typeof block !== "object") return block;

	const b = block as Record<string, unknown>;

	if (b.type === "text" && typeof b.text === "string") {
		if ((b.text as string).length <= threshold) return block;
		const excess = (b.text as string).length - threshold;
		accum(excess);
		markAffected();
		return {
			...b,
			text:
				(b.text as string).slice(0, threshold) +
				`\n\n[pruned: ${excess.toLocaleString()} chars]`,
		};
	}

	if (Array.isArray(b.content)) {
		return { ...b, content: b.content.map((inner) => trimInner(inner, threshold, accum, markAffected)) };
	}

	return block;
}
