/**
 * Minimal Status Line
 *
 * Clean footer: tokens up/down, cost, context %, model, branch.
 * Less noise than the default footer.
 */

import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		const theme = ctx.ui.theme;

		ctx.ui.setFooter((tui, _theme, footerData) => {
			const unsub = footerData.onBranchChange(() => tui.requestRender());

			return {
				dispose: unsub,
				invalidate() {},
				render(width: number): string[] {
					let input = 0,
						output = 0,
						cost = 0;
					for (const e of ctx.sessionManager.getBranch()) {
						if (e.type === "message" && e.message.role === "assistant") {
							const m = e.message as AssistantMessage;
							input += m.usage.input;
							output += m.usage.output;
							cost += m.usage.cost.total;
						}
					}

					const fmt = (n: number) =>
						n < 1000 ? `${n}` : n < 1_000_000 ? `${(n / 1000).toFixed(1)}k` : `${(n / 1_000_000).toFixed(1)}M`;

					const branch = footerData.getGitBranch();
					const model = ctx.model?.id || "—";
					const provider = ctx.model?.provider || "";
					const thinking = ctx.thinkingLevel || "off";

					// Left: ↑↓ cost
					const left = theme.fg("dim", `↑${theme.fg("accent", fmt(input))} ↓${theme.fg("accent", fmt(output))} $${theme.fg("success", cost.toFixed(3))}`);
					// Right: branch · provider/model (thinking)
					const rightParts = [branch, provider ? `${provider}/${model}` : model];
					if (thinking !== "off") rightParts.push(theme.fg("warning", thinking));
					const right = theme.fg("dim", rightParts.join(" · "));

					const gap = Math.max(1, width - visibleWidth(left) - visibleWidth(right));
					return [truncateToWidth(left + " ".repeat(gap) + right, width)];
				},
			};
		});
	});
}
