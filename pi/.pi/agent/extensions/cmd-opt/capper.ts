/**
 * Bash output capper for cmd-opt extension
 * Keeps head + tail so trailing errors survive
 */

export const RESULT_KEEP_HEAD = 3_000;
export const RESULT_KEEP_TAIL = 9_000;

export function capText(text: string, keepHead: number, keepTail: number): string {
	if (text.length <= keepHead + keepTail) return text;
	return (
		text.slice(0, keepHead) +
		`\n… [cmd-opt: middle truncated, ${(text.length - keepHead - keepTail).toLocaleString()} chars] …\n` +
		text.slice(text.length - keepTail)
	);
}

export function textResult(text: string) {
	return { content: [{ type: "text" as const, text }], details: {} };
}
