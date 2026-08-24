/**
 * Status Line Extension
 *
 * Keeps pi's default footer (cwd, branch, tokens, cache hit %, cost, ctx%,
 * auto-compact indicator) and injects two extra status chips into it:
 *   - "ctx": eighth-block context-usage bar with per-zone coloring
 *   - "thinking": ✻ + current thinking level
 *
 * Chips refresh on turn/message/compaction events — exactly when context
 * usage changes.
 */

import type { ExtensionAPI, ThemeColor } from "@earendil-works/pi-coding-agent";

// ── Context bar ──────────────────────────────────────────────────────────

const BAR_WIDTH = 12;
// Eighth-block glyphs for sub-cell precision.
const FRACTIONS = ["▏", "▎", "▍", "▌", "▋", "▊", "▉"];

type FgFn = (color: ThemeColor, text: string) => string;

function renderBar(pct: number, fg: FgFn): string {
	const clamped = Math.min(100, Math.max(0, pct));
	const exact = (clamped / 100) * BAR_WIDTH;
	let out = fg("border", "▐");
	for (let i = 0; i < BAR_WIDTH; i++) {
		const cell = (exact - i) * 8; // eighths filled in this cell
		if (cell <= 0) {
			out += fg("border", "░");
		} else {
			// Color by the zone this cell sits in, so red creeps in from the right.
			const zonePct = ((i + 0.5) / BAR_WIDTH) * 100;
			const color: ThemeColor = zonePct >= 80 ? "error" : zonePct >= 60 ? "warning" : "accent";
			const eighths = Math.min(8, Math.max(1, Math.round(cell)));
			const glyph = eighths >= 8 ? "█" : FRACTIONS[eighths - 1];
			out += fg(color, glyph);
		}
	}
	return out + fg("border", "▌");
}

// ── Extension ────────────────────────────────────────────────────────────

interface UiCtx {
	ui: {
		theme: { fg: (color: ThemeColor, text: string) => string };
		setStatus: (key: string, value: string | undefined) => void;
	};
	getContextUsage(): { percent: number | null; tokens: number | null } | undefined;
	thinkingLevel?: string;
}

export default function (pi: ExtensionAPI) {
	function refresh(ctx: UiCtx) {
		const theme = ctx.ui.theme;

		const usage = ctx.getContextUsage();
		if (usage && usage.tokens !== null) {
			const pct = usage.percent ?? 0;
			ctx.ui.setStatus("ctx", renderBar(pct, (color, text) => theme.fg(color, text)) + theme.fg("dim", ` ${pct.toFixed(0)}%`));
		} else {
			// Unknown until the next response (fresh session / just compacted).
			ctx.ui.setStatus("ctx", undefined);
		}

		const thinking = ctx.thinkingLevel;
		ctx.ui.setStatus("thinking", thinking && thinking !== "off" ? theme.fg("warning", `✻ ${thinking}`) : undefined);
	}

	// Register at top level so re-sessions don't stack duplicate handlers.
	pi.on("session_start", async (_event, ctx) => refresh(ctx));
	pi.on("message_end", async (_event, ctx) => refresh(ctx));
	pi.on("turn_end", async (_event, ctx) => refresh(ctx));
	pi.on("session_compact", async (_event, ctx) => refresh(ctx));
}
