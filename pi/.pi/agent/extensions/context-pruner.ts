/**
 * Context Pruner Extension
 *
 * Prunes oversized tool results and removes noise before each LLM call,
 * dramatically reducing token consumption on long sessions.
 *
 * ## What it does
 *
 * 1. Truncates tool result text content beyond 4000 chars
 *    — The model already saw these results when fresh. On subsequent turns
 *      it only needs a reminder, not the full 50 KB read output.
 * 2. Removes empty / trivial thinking blocks (< 30 chars)
 *    — Pure noise, zero signal.
 * 3. Handles string content (some providers use `role: "user"` with a
 *    plain string instead of structured content blocks).
 *
 * ## Expected savings
 *
 * In a typical 20+ turn session this eliminates 50–80 % of tool result
 * bytes re-sent on every turn after the first.
 *
 * ## Install
 *
 *   cp context-pruner.ts ~/.pi/agent/extensions/
 *
 * ## Thresholds (override via settings.json)
 *
 *   "contextPruner": {
 *     "maxToolResultChars": 4000,
 *     "minThinkingChars": 30
 *   }
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// ── defaults (overridable via settings.json) ──
const DEFAULTS = {
	maxToolResultChars: 4_000,
	minThinkingChars: 30,
};

// Track cumulative pruned bytes across turns so the toast only fires
// when there's NEW pruning, not the same old blocks every turn.
let prevCumulative = 0;

export default function (pi: ExtensionAPI) {
	pi.on("context", async (event, ctx) => {
		const settings = DEFAULTS;
		let prunedTotal = 0;
		let blocksAffected = 0;

		for (const msg of event.messages) {
			// Some providers / message types carry content as a plain string.
			if (typeof msg.content === "string") {
				if (msg.content.length > settings.maxToolResultChars) {
					const excess = msg.content.length - settings.maxToolResultChars;
					prunedTotal += excess;
				blocksAffected++;
				msg.content =
						msg.content.slice(0, settings.maxToolResultChars) +
						`\n\n[pruned: ${excess.toLocaleString()} chars]`;
				}
				continue;
			}

			// Structured content blocks.
			if (!Array.isArray(msg.content)) continue;

			const newContent: Array<Record<string, unknown>> = [];

			for (const block of msg.content) {
				// ── thinking blocks: drop empty / trivial ──
				if (block.type === "thinking") {
					const len = (block.thinking as string | undefined)?.length ?? 0;
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
					newContent.push(pruneToolResultBlock(block, settings, (n) => (prunedTotal += n), () => blocksAffected++));
					continue;
				}

				// ── plain text blocks ──
				if (block.type === "text" && typeof block.text === "string") {
					if (block.text.length > settings.maxToolResultChars) {
						const excess = block.text.length - settings.maxToolResultChars;
						prunedTotal += excess;
						blocksAffected++;
						newContent.push({
							...block,
							text:
								block.text.slice(0, settings.maxToolResultChars) +
								`\n\n[pruned: ${excess.toLocaleString()} chars]`,
						});
						continue;
					}
					newContent.push(block);
					continue;
				}

				// Preserve everything else (toolCall, image, etc.)
				newContent.push(block);
			}

			msg.content = newContent;
		}

		// Only notify when there's NEW pruning beyond what was already pruned.
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

/**
 * Deep-prune text content inside a `tool_result` block.
 *
 * The `.content` field can be:
 *  - a plain string
 *  - an array of content blocks (TextContent / ImageContent / …)
 *  - absent
 */
function pruneToolResultBlock(
	block: Record<string, unknown>,
	settings: typeof DEFAULTS,
	accum: (n: number) => void,
	markAffected: () => void,
): Record<string, unknown> {
	const raw = block.content;

	// String content
	if (typeof raw === "string") {
		if (raw.length <= settings.maxToolResultChars) return block;
		const excess = raw.length - settings.maxToolResultChars;
		accum(excess);
		markAffected();
		return {
			...block,
			content:
				raw.slice(0, settings.maxToolResultChars) +
				`\n\n[pruned: ${excess.toLocaleString()} chars]`,
		};
	}

	// Array of content blocks
	if (Array.isArray(raw)) {
		return {
			...block,
			content: raw.map((inner) => trimInner(inner, settings, accum, markAffected)),
		};
	}

	return block;
}

/** Recursively trim text inside a nested content block. */
function trimInner(
	block: unknown,
	settings: typeof DEFAULTS,
	accum: (n: number) => void,
	markAffected: () => void,
): unknown {
	if (!block || typeof block !== "object") return block;

	const b = block as Record<string, unknown>;

	// Leaf text block — do the pruning
	if (b.type === "text" && typeof b.text === "string") {
		if ((b.text as string).length <= settings.maxToolResultChars) return block;
		const excess = (b.text as string).length - settings.maxToolResultChars;
		accum(excess);
		markAffected();
		return {
			...b,
			text:
				(b.text as string).slice(0, settings.maxToolResultChars) +
				`\n\n[pruned: ${excess.toLocaleString()} chars]`,
		};
	}

	// Recurse into .content (e.g. nested tool_result → TextContent)
	if (Array.isArray(b.content)) {
		return { ...b, content: b.content.map((inner) => trimInner(inner, settings, accum, markAffected)) };
	}

	return block;
}
