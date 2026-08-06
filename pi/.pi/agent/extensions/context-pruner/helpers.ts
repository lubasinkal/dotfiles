/**
 * Helper functions for context-pruner extension
 */

/** Quick check whether a message contains an Anthropic-format tool_result block. */
export function hasToolResultBlock(msg: unknown): boolean {
	if (!msg || typeof msg !== "object") return false;
	const content = (msg as { content?: unknown }).content;
	if (!Array.isArray(content)) return false;
	return content.some((b: any) => b?.type === "tool_result");
}

/** Current pi uses role "toolResult"; keep "tool" for legacy sessions. */
export function isToolResultRole(role: string | undefined): boolean {
	return role === "toolResult" || role === "tool";
}

export function pruneToolResultBlock(
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

export function trimInner(
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
