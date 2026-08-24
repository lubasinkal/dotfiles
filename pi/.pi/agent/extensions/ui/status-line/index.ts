/**
 * Status Line Extension
 *
 * Keeps pi's default footer (cwd, branch, tokens, cache hit %, cost, ctx%,
 * model • thinking, auto-compact indicator) and adds one status line:
 * a wide eighth-block context-usage bar with per-zone coloring and a
 * "free tokens" readout. Refreshes on turn/message/compaction events.
 */

import type { ExtensionAPI, ThemeColor } from "@earendil-works/pi-coding-agent";

// ── Context bar ──────────────────────────────────────────────────────────

// Wide enough to own the status line without looking lost.
const BAR_WIDTH = 24;
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

function fmtTokens(n: number): string {
	if (n < 1000) return `${n}`;
	if (n < 1_000_000) return `${(n / 1000).toFixed(0)}k`;
	return `${(n / 1_000_000).toFixed(1)}M`;
}

// ── Extension ────────────────────────────────────────────────────────────

interface UiCtx {
	ui: {
		theme: { fg: (color: ThemeColor, text: string) => string };
		setStatus: (key: string, value: string | undefined) => void;
	};
	getContextUsage(): { percent: number | null; tokens: number | null; contextWindow?: number } | undefined;
}

export default function (pi: ExtensionAPI) {
	function refresh(ctx: UiCtx) {
		const theme = ctx.ui.theme;

		const usage = ctx.getContextUsage();
		if (usage && usage.tokens !== null && usage.contextWindow) {
			const pct = usage.percent ?? 0;
			const free = fmtTokens(usage.contextWindow - usage.tokens);
			ctx.ui.setStatus(
				"ctx",
				renderBar(pct, (color, text) => theme.fg(color, text)) +
					theme.fg("dim", ` ${pct.toFixed(0)}% · ${free} free`),
			);
		} else {
			// Unknown until the next response (fresh session / just compacted).
			ctx.ui.setStatus("ctx", undefined);
		}
	}

	// Register at top level so re-sessions don't stack duplicate handlers.
	pi.on("session_start", async (_event, ctx) => refresh(ctx));
	pi.on("message_end", async (_event, ctx) => refresh(ctx));
	pi.on("turn_end", async (_event, ctx) => refresh(ctx));
	pi.on("session_compact", async (_event, ctx) => refresh(ctx));
}
