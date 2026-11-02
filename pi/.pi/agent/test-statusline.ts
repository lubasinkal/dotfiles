// Test harness for ui/status-line — mock pi API, fake theme, fake footer data.
// Run: node test-statusline.ts (plain node) or bun run test-statusline.ts
import "./test-hooks.ts";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const home = mkdtempSync(join(tmpdir(), "pi-status-"));
process.env.HOME = home;

const handlers: Record<string, ((...a: any[]) => any)[]> = {};
const pi = {
	registerTool() {},
	registerCommand() {},
	on(e: string, h: any) { (handlers[e] ||= []).push(h); },
};

const mod = await import(join(process.cwd(), "extensions", "ui", "status-line", "index.ts"));
mod.default(pi);

let pass = 0, fail = 0;
function ok(name: string, cond: boolean, extra = "") {
	if (cond) pass++; else { fail++; console.log(`✗ ${name} ${extra}`); }
}

// A theme that returns text unchanged, so assertions see raw content.
const theme: any = new Proxy({}, { get: () => (a: any, b?: any) => (typeof a === "string" && typeof b === "string" ? b : String(a ?? "")) });

// Task tool results, as the branch stores them.
const taskEntry = (tasks: any[]) => ({
	type: "message",
	message: { role: "toolResult", toolName: "task", details: { action: "list", tasks, nextId: tasks.length + 1, persisted: false } },
});
const branch = [
	taskEntry([
		{ id: 1, text: "write docs", done: false, priority: "normal" },
		{ id: 2, text: "fix bug", done: false, priority: "high" },
		{ id: 3, text: "ship", done: true, priority: "low" },
	]),
	{ type: "message", message: { role: "assistant", usage: { input: 1200, output: 340, cost: { total: 0.42 } } } },
];

// One running bg task and one finished one in the on-disk registry.
const bgDir = join(home, ".pi", "agent", "bg");
mkdirSync(bgDir, { recursive: true });
writeFileSync(join(bgDir, "run1.json"), JSON.stringify({ id: "run1", command: "npm run build", startedAt: 1000, pid: 1, exitPath: join(bgDir, "run1.exit") }));
writeFileSync(join(bgDir, "done1.json"), JSON.stringify({ id: "done1", command: "npm test", startedAt: 2000, pid: 2, exitPath: join(bgDir, "done1.exit") }));
writeFileSync(join(bgDir, "done1.exit"), "0");
// A killed task: no exit file, and the pid is gone. Must not read as running.
writeFileSync(join(bgDir, "killed1.json"), JSON.stringify({ id: "killed1", command: "crashed build", startedAt: 500, pid: 999_999, exitPath: join(bgDir, "killed1.exit") }));

let footer: any;
let widget: any;
const ctx: any = {
	mode: "tui",
	cwd: join(home, "dotfiles"),
	model: { id: "mimo-v2.6-flash", provider: "opencode-go" },
	thinkingLevel: "high",
	sessionManager: { getBranch: () => branch },
	getContextUsage: () => ({ tokens: 1540, contextWindow: 200000, percent: 42 }),
	ui: {
		theme,
		setFooter: (f: any) => { footer = f({ requestRender() {} }, theme, footerData); },
		setWidget: (_key: string, factory: any, options: any) => {
			widget = { factory, options };
		},
	},
};
const footerData = { onBranchChange: () => () => {}, getGitBranch: () => "master", getExtensionStatuses: () => new Map() };

for (const h of handlers.session_start) await h({}, ctx);
ok("footer registered", !!footer);
ok("widget registered above the editor", !!widget?.factory && widget.options?.placement === "aboveEditor");

// ── footer: identity + resources only ─────────────────────────────
const footerLine = footer.render(120).join("\n");
ok("footer shows cwd", footerLine.includes("dotfiles"), footerLine);
ok("footer shows branch", footerLine.includes("(master)"));
ok("footer shows tokens", footerLine.includes("↑1.2k") && footerLine.includes("↓340"), footerLine);
ok("footer shows cost", footerLine.includes("$0.42"));
ok("footer shows model", footerLine.includes("opencode-go/mimo-v2.6-flash"), footerLine);
ok("footer shows thinking", footerLine.includes("✻ high"));
ok("footer stays a single line", footer.render(120).length === 1, String(footer.render(120).length));
ok("footer no longer duplicates task info", !/tasks/.test(footerLine), footerLine);
ok("footer no longer duplicates bg info", !/running/.test(footerLine), footerLine);
ok("footer drops context percent", !/42%/.test(footerLine), footerLine);

// ── widget: work in flight ────────────────────────────────────────
const widgetLines = widget.factory({ requestRender() {} }, theme).render(120);
const widgetText = widgetLines.join("\n");
ok("widget is a single line", widgetLines.length === 1, JSON.stringify(widgetLines));
ok("widget shows task progress", widgetText.includes("1/3 tasks"), widgetText);
ok("widget names the next task by priority", widgetText.includes("next: fix bug"), widgetText);
ok("widget counts running bg jobs", widgetText.includes("1 running"), widgetText);
ok("widget names the oldest bg job", widgetText.includes("npm run build"), widgetText);
ok("widget ignores a killed job", !widgetText.includes("crashed build"), widgetText);
ok("widget counts only live jobs", /1 running/.test(widgetText) && !/2 running/.test(widgetText), widgetText);
ok("widget shows context usage", widgetText.includes("ctx 42%"), widgetText);
ok("widget shows context window detail", /ctx 42% · 2k\/200k/.test(widgetText), widgetText);
ok("widget segments are separated", widgetText.split(" · ").length >= 3, widgetText);
ok("widget line fits the width", widgetLines.every((l: string) => l.length <= 120));

// Narrow: least important segments drop instead of wrapping.
const narrow = widget.factory({ requestRender() {} }, theme).render(40);
ok("narrow widget stays one line", narrow.length === 1, JSON.stringify(narrow));
ok("narrow widget drops trailing segments", /ctx \d+%/.test(narrow[0]), narrow[0]);
ok("narrow widget fits", narrow[0].length <= 40, narrow[0]);

// ── widget: idle state takes no space ─────────────────────────────
branch.length = 1;
branch[0] = taskEntry([]);
rmSync(bgDir, { recursive: true, force: true });
// bg stats are cached for 2s; wait it out rather than reaching into the module.
await new Promise((r) => setTimeout(r, 2100));

// Context still unknown (e.g. right after compaction) and no work in flight.
ctx.getContextUsage = () => ({ tokens: null, contextWindow: 200000, percent: null });
const idle = widget.factory({ requestRender() {} }, theme).render(120);
ok("widget renders nothing when idle", idle.length === 0, JSON.stringify(idle));

// Only context known: one line, no task/job lines.
ctx.getContextUsage = () => ({ tokens: 1540, contextWindow: 200000, percent: 1 });
const ctxOnly = widget.factory({ requestRender() {} }, theme).render(120);
ok("widget shows only context when nothing else is in flight", ctxOnly.length === 1 && /ctx 1%/.test(ctxOnly[0]), JSON.stringify(ctxOnly));

// ── footer survives a narrow terminal ─────────────────────────────
ok("narrow footer still renders", footer.render(40).length >= 1);
ok("narrow footer fits", footer.render(40).every((l: string) => l.length <= 40), JSON.stringify(footer.render(40)));

rmSync(home, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
