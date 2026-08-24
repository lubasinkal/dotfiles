/**
 * Minimal Status Line Extension
 *
 * Clean footer inspired by statusline.nvim:
 * Left: ctx bar | tokens ↑↓ | cost
 * Right: branch · model (✻ thinking)
 */

import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ThemeColor } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

/** Incrementally cached token/cost totals for the current branch. */
const cache = {
	head: [] as unknown[], // snapshot of already-summed branch entries
	input: 0,
	output: 0,
	cost: 0,
};

function branchTotals(branch: readonly unknown[]) {
	const c = cache;
	// Reuse the cached prefix when the branch only grew (common case).
	const reusable = Math.min(c.head.length, branch.length);
	let m = 0;
	while (m < reusable && branch[m] === c.head[m]) m++;
	if (!(m === c.head.length && c.head.length <= branch.length)) {
		// Branch changed underneath us (switch/fork/compaction) — full rescan.
		c.input = c.output = c.cost = 0;
		m = 0;
	}
	for (let i = m; i < branch.length; i++) {
		const e = branch[i] as { type: string; message?: { role: string; usage?: AssistantMessage["usage"] } };
		if (e.type === "message" && e.message?.role === "assistant" && e.message.usage) {
			c.input += e.message.usage.input ?? 0;
			c.output += e.message.usage.output ?? 0;
			c.cost += e.message.usage.cost.total ?? 0;
		}
	}
	c.head = branch.slice();
	return c;
}

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
			const zonePct = ((i + 0.5) / BAR_WIDTH) * 100;
			const color: ThemeColor = zonePct >= 80 ? "error" : zonePct >= 60 ? "warning" : "accent";
			const eighths = Math.min(8, Math.max(1, Math.round(cell)));
			const glyph = eighths >= 8 ? "█" : FRACTIONS[eighths - 1];
			out += fg(color, glyph);
		}
	}
	return out + fg("border", "▌");
}

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		const theme = ctx.ui.theme;

		ctx.ui.setFooter((tui, _theme, footerData) => {
			const unsub = footerData.onBranchChange(() => tui.requestRender());

			return {
				dispose: unsub,
				invalidate() {},
				render(width: number): string[] {
					const { input, output, cost } = branchTotals(ctx.sessionManager.getBranch());

					const fmt = (n: number) =>
						n < 1000 ? `${n}` : n < 1_000_000 ? `${(n / 1000).toFixed(1)}k` : `${(n / 1_000_000).toFixed(1)}M`;
					const fmtCost = (n: number) => (n >= 100 ? `$${(n / 1000).toFixed(2)}k` : `$${n.toFixed(2)}`);

					// Left: [ctx bar] pct% · ↑in ↓out · $cost
					const leftParts: string[] = [];

					// Context bar: fixed 12 cells, eighth-block precision, per-zone color.
					const ctxUsage = ctx.getContextUsage();
					if (ctxUsage && ctxUsage.tokens !== null) {
						const pct = ctxUsage.percent ?? 0;
						leftParts.push(renderBar(pct, (color, text) => theme.fg(color, text)) + theme.fg("dim", ` ${pct.toFixed(0)}%`));
					}

					leftParts.push(theme.fg("dim", `↑`) + theme.fg("accent", fmt(input)) + theme.fg("dim", " ↓") + theme.fg("accent", fmt(output)));
					if (cost > 0) leftParts.push(theme.fg("success", fmtCost(cost)));

					const left = leftParts.join(theme.fg("border", " · "));

					// Right: branch · model · ✻ thinking — each part themed individually
					const rightParts: string[] = [];
					const branch = footerData.getGitBranch();
					if (branch) rightParts.push(theme.fg("dim", branch));
					const model = ctx.model?.id || "—";
					const provider = ctx.model?.provider || "";
					rightParts.push(theme.fg("dim", provider ? `${provider}/${model}` : model));
					const thinking = ctx.thinkingLevel;
					if (thinking && thinking !== "off") rightParts.push(theme.fg("warning", `✻ ${thinking}`));

					const right = rightParts.join(theme.fg("border", " · "));

					// Layout: left [gap] right
					const leftWidth = visibleWidth(left);
					const rightWidth = visibleWidth(right);
					const gap = Math.max(1, width - leftWidth - rightWidth);
					return [truncateToWidth(left + " ".repeat(gap) + right, width)];
				},
			};
		});
	});
}
