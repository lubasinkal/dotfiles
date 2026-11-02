/**
 * Status line + work widget
 *
 * Footer (below the editor) — identity and resources:
 *   Left: directory (branch) · tokens ↑↓ [ctx%] · cost
 *   Right: [statuses ·] model · ✻ thinking
 *
 * Widget (above the editor) — only while there is work in flight:
 *   tasks done/total · next task, then running background jobs
 *   Renders no lines when idle, so it costs no space.
 */

import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

/** Incrementally cached token/cost totals for the current branch. */
const cache = {
	head: [] as unknown[], // snapshot of already-summed branch entries
	input: 0,
	output: 0,
	cost: 0,
	tasks: undefined as { done: number; total: number; next?: string } | undefined,
};

/** Running background tasks (from bg's on-disk registry), refreshed on a TTL. */
let bgCache = { at: 0, running: 0, label: undefined as string | undefined };

function bgInfo(now: number): { running: number; label?: string } {
	if (now - bgCache.at < 2000) return bgCache;
	let running = 0;
	let oldest: { startedAt: number; command: string } | undefined;
	try {
		const dir = path.join(os.homedir(), ".pi", "agent", "bg");
		for (const file of fs.readdirSync(dir)) {
			if (!file.endsWith(".json")) continue;
			const id = file.slice(0, -5);
			// Same derivation as bg: an exit-code file means finished.
			if (fs.existsSync(path.join(dir, `${id}.exit`))) continue;
			const meta = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")) as {
				id?: string;
				startedAt?: number;
				command?: string;
			};
			if (!meta?.id) continue;
			running++;
			if (typeof meta.startedAt === "number" && meta.command && (!oldest || meta.startedAt < oldest.startedAt)) {
				oldest = { startedAt: meta.startedAt, command: meta.command };
			}
		}
	} catch {
		running = 0;
	}
	bgCache = { at: now, running, label: oldest?.command };
	return bgCache;
}

function fmtTokens(n: number): string {
	return n < 1000 ? `${n}` : n < 1_000_000 ? `${(n / 1000).toFixed(0)}k` : `${(n / 1_000_000).toFixed(1)}M`;
}

/** First open task, highest priority first (mirrors the task tool's ordering). */
function nextTask(tasks: readonly { id: number; text: string; done: boolean; priority?: string }[]) {
	const rank: Record<string, number> = { high: 0, normal: 1, low: 2 };
	return [...tasks]
		.filter((t) => !t.done)
		.sort((a, b) => (rank[a.priority ?? "normal"] ?? 1) - (rank[b.priority ?? "normal"] ?? 1) || a.id - b.id)[0];
}

function branchTotals(branch: readonly unknown[]) {
	const c = cache;
	// Reuse the cached prefix when the branch only grew (common case).
	const reusable = Math.min(c.head.length, branch.length);
	let m = 0;
	while (m < reusable && branch[m] === c.head[m]) m++;
	if (!(m === c.head.length && c.head.length <= branch.length)) {
		// Branch changed underneath us (switch/fork/compaction) — full rescan.
		c.input = c.output = c.cost = 0;
		c.tasks = undefined;
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
	// Task counts come from the last task tool result — no coupling to tasktracker.
	for (let i = branch.length - 1; i >= 0; i--) {
		const e = branch[i] as {
			type: string;
			message?: { role: string; toolName?: string; details?: { tasks?: { done: boolean }[] } };
		};
		if (e.type !== "message" || e.message?.role !== "toolResult" || e.message.toolName !== "task") continue;
		const list = e.message.details?.tasks;
		if (!Array.isArray(list)) continue;
		c.tasks = { done: list.filter((t) => t.done).length, total: list.length, next: nextTask(list)?.text };
		break;
	}
	c.head = branch.slice();
	return c;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function shortenCwd(cwd: string): string {
	const home = os.homedir() || process.env.HOME || process.env.USERPROFILE || cwd;
	// Normalize to forward slashes for cross-platform comparison (Windows uses \)
	const normCwd = cwd.replace(/\\/g, "/").replace(/\/$/, "");
	const normHome = home.replace(/\\/g, "/").replace(/\/$/, "");
	if (normCwd.toLowerCase() === normHome.toLowerCase()) return "~";
	if (normCwd.toLowerCase().startsWith(normHome.toLowerCase() + "/")) {
		return `~${normCwd.slice(normHome.length)}`;
	}
	return cwd;
}

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		const theme = ctx.ui.theme;

		// Work in flight: tasks and background jobs, above the editor so the
		// footer stays a one-line summary. Renders nothing when idle.
		ctx.ui.setWidget(
			"work",
			(_tui, widgetTheme) => ({
				invalidate() {},
				render(width: number): string[] {
					const lines: string[] = [];
					// Work in flight + context headroom live above the editor.
					const { tasks } = branchTotals(ctx.sessionManager.getBranch());
					if (tasks && tasks.total > 0) {
						const pending = tasks.total - tasks.done;
						const label =
							pending > 0
								? `${tasks.done}/${tasks.total} tasks` + (tasks.next ? ` · next: ${tasks.next}` : "")
								: `✓ all ${tasks.total} tasks done`;
						lines.push(widgetTheme.fg(pending > 0 ? "accent" : "success", label));
					}
					const bg = bgInfo(Date.now());
					if (bg.running > 0) {
						const label = `${bg.running} running` + (bg.label ? ` · ${bg.label}` : "");
						lines.push(widgetTheme.fg("warning", label));
					}
					const usage = ctx.getContextUsage?.();
					if (usage?.tokens != null && usage?.percent != null && Number.isFinite(usage.percent)) {
						const pct = Math.round(usage.percent);
						const color = pct >= 80 ? "error" : pct >= 60 ? "warning" : "dim";
						const detail =
							width >= 60 && usage.contextWindow > 0
								? ` · ${fmtTokens(usage.tokens)}/${fmtTokens(usage.contextWindow)}`
								: "";
						lines.push(widgetTheme.fg(color, `ctx ${pct}%${detail}`));
					}
					return lines.map((line) => truncateToWidth(` ${line}`, width));
				},
			}),
			{ placement: "aboveEditor" },
		);

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

					const raw = footerData.getExtensionStatuses() as unknown;
					const statuses: string[] = (raw instanceof Map ? [...(raw as Map<string,string>).values()] : Array.isArray(raw) ? raw : raw && typeof raw === "object" ? Object.values(raw as Record<string,string>) : []) as string[];
					const filtered = statuses.filter(Boolean) as string[];

					// Left: directory (branch) · ↑in ↓out [ctx%] · $cost
					const leftParts: string[] = [];

					leftParts.push(theme.fg("accent", shortenCwd(ctx.cwd)));
					const branch = footerData.getGitBranch();
					if (branch) leftParts.push(theme.fg("dim", `(${branch})`));

					// Work in flight lives in the widget above the editor, not here.
					let tokenStr =
						theme.fg("dim", `↑`) + theme.fg("accent", fmt(input)) + theme.fg("dim", " ↓") + theme.fg("accent", fmt(output));
					leftParts.push(tokenStr);
					if (cost > 0) leftParts.push(theme.fg("success", fmtCost(cost)));

					// Narrow: drop cost first
					let left = leftParts.join(theme.fg("border", " · "));
					if (width < 60 && cost > 0) {
						left = leftParts.slice(0, -1).join(theme.fg("border", " · "));
					}

					// Right: [statuses ·] model · ✻ thinking
					const rightParts: string[] = [];
					if (filtered.length) rightParts.push(...filtered);
					const model = ctx.model?.id || "—";
					const provider = ctx.model?.provider || "";
					// Narrow: hide provider prefix
					const modelStr = width < 80 && provider ? model : provider ? `${provider}/${model}` : model;
					rightParts.push(theme.fg("dim", modelStr));
					const thinking = ctx.thinkingLevel;
					if (thinking && thinking !== "off") rightParts.push(theme.fg("warning", `✻ ${thinking}`));
					let right = rightParts.join(theme.fg("border", " · "));
					// Very narrow: drop thinking
					if (width < 50 && thinking && thinking !== "off") {
						right = rightParts.slice(0, -1).join(theme.fg("border", " · "));
					}

					// Layout: left [gap] right, or stacked on very narrow / with statuses
					if (width < 45) {
						return [truncateToWidth(left, width), truncateToWidth(right, width)];
					}
					const leftWidth = visibleWidth(left);
					const rightWidth = visibleWidth(right);
					const gap = Math.max(1, width - leftWidth - rightWidth);
					if (gap === 1 && leftWidth + rightWidth + 1 > width) {
						return [truncateToWidth(left, width), truncateToWidth(right, width)];
					}
					return [truncateToWidth(left + " ".repeat(gap) + right, width)];
				},
			};
		});
	});
}
