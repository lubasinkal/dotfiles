// Test harness for bg — loads the extension with a mock pi API.
// Run: node test-bg.ts (plain node) or bun run test-bg.ts
import "./test-hooks.ts";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const home = mkdtempSync(join(tmpdir(), "pi-bghome-"));
process.env.HOME = home;

const tools: any[] = [];
const commands: any[] = [];
const pi = {
	registerTool(t: any) { tools.push(t); },
	registerCommand(name: string, cmd: any) { commands.push({ name, ...cmd }); },
	on() {},
};

const mod = await import(join(process.cwd(), "extensions", "bg", "index.ts"));
mod.default(pi);

let pass = 0, fail = 0;
function ok(name: string, cond: boolean, extra = "") {
	if (cond) pass++; else { fail++; console.log(`✗ ${name} ${extra}`); }
}
/** Poll until `predicate` holds or `ms` elapses; returns the last value. */
async function waitUntil<T>(fn: () => T, ok: (value: T) => boolean, ms = 3000): Promise<T> {
	const deadline = Date.now() + ms;
	let value = fn();
	while (!ok(value) && Date.now() < deadline) {
		await new Promise((res) => setTimeout(res, 100));
		value = fn();
	}
	return value;
}

function check(name: string, got: any, want: any) {
	const same = JSON.stringify(got) === JSON.stringify(want);
	ok(name, same, `got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
}

const tool = tools.find((t) => t.name === "bg");
ok("bg tool registered", !!tool);
const run = (params: any) => tool.execute("id", params, undefined, undefined, {});
const text = (r: any) => r.content[0].text;
const d = (r: any) => r.details;

// ── 1. quick command, wait for exit ────────────────────────────────
let r = await run({ action: "start", command: "echo hello-bg" });
const id1 = d(r).taskId;
ok("start returns id", typeof id1 === "string" && id1.length > 0);
r = await run({ action: "wait", id: id1, timeout: 20 });
ok("wait observes exit 0", d(r).state === "exited" && d(r).code === 0, JSON.stringify(d(r)));
ok("output captured", text(r).includes("hello-bg"), text(r));

// ── 2. non-zero exit code ─────────────────────────────────────────
r = await run({ action: "start", command: "echo before-fail; exit 7" });
const id2 = d(r).taskId;
r = await run({ action: "wait", id: id2, timeout: 20 });
check("exit code 7 reported", d(r).code, 7);
ok("output before failure kept", text(r).includes("before-fail"));

// ── 3. quoting and multiline survive the wrapper ──────────────────
r = await run({ action: "start", command: `printf 'a b\\n'; echo "c'd"; echo "multi\nline"` });
const id3 = d(r).taskId;
r = await run({ action: "wait", id: id3, timeout: 20 });
ok("quotes intact", text(r).includes("a b") && text(r).includes("c'd"), text(r));
ok("multiline intact", text(r).includes("multi") && text(r).includes("line"), text(r));

// ── 4. cwd + pi PATH from piEnv() ─────────────────────────────────
r = await run({ action: "start", command: "pwd; command -v fd || echo NO-FD" });
const id4 = d(r).taskId;
r = await run({ action: "wait", id: id4, timeout: 20 });
ok("cwd respected", text(r).includes(process.cwd()), text(r));
ok("bundled fd on PATH", !text(r).includes("NO-FD"), text(r));

// ── 5. list shows running + finished, with status ─────────────────
r = await run({ action: "start", command: "sleep 5" });
const id5 = d(r).taskId;
r = await run({ action: "list" });
ok("list counts running", /(\d+) task\(s\), 1 running/.test(text(r)), text(r).split("\n")[0]);
ok("list marks running", text(r).includes(`${id5}  running`), text(r));
ok("list shows finished code", text(r).includes("exited 7 after"), text(r));

// ── 6. output on a running task, without blocking ─────────────────
r = await run({ action: "output", id: id5 });
ok("running task has status", d(r).state === "running", JSON.stringify(d(r)));
ok("no-output placeholder", text(r).includes("(no output yet)"), text(r));

r = await run({ action: "start", command: "for i in 1 2 3 4 5 6 7 8 9 10; do echo line$i; sleep 0.05; done; sleep 5" });
const id6 = d(r).taskId;
await new Promise((res) => setTimeout(res, 800));
r = await run({ action: "output", id: id6, lines: 3 });
ok("output is tailed", d(r).state === "running" && text(r).includes("line10") && !text(r).includes("line1\n"), text(r));

// ── 7. stop an explicit server-like task ──────────────────────────
r = await run({ action: "stop", id: id5 });
ok("stop reports success", !d(r).error, text(r));
r = await run({ action: "list" });
ok("stopped task no longer running", !text(r).includes(`${id5}  running`), text(r));
r = await run({ action: "output", id: id5 });
ok("stopped task reads as exited, not lost", d(r).state === "exited", JSON.stringify(d(r)));
ok("stopped task keeps its exit code", d(r).code === 143 || d(r).code === 137, String(d(r).code));

r = await run({ action: "stop", id: id5 });
ok("stop on finished task errors", /is not running/.test(d(r).error ?? ""), JSON.stringify(d(r)));

await run({ action: "stop", id: id6 });

// ── 8. errors ─────────────────────────────────────────────────────
r = await run({ action: "output", id: "deadbeef" });
ok("unknown id errors", /no background task/.test(d(r).error ?? ""));
r = await run({ action: "wait", id: "deadbeef" });
ok("wait unknown id errors", /no background task/.test(d(r).error ?? ""));
r = await run({ action: "start", command: "  " });
ok("blank command errors", /command required/.test(d(r).error ?? ""));
r = await run({ action: "wait", id: id1 });
ok("id required path", !d(r).error);
r = await run({ action: "output" });
ok("missing id errors", /id required/.test(d(r).error ?? ""));

// ── 9. durability: status comes from disk, not memory ─────────────
const metaFile = join(home, ".pi", "agent", "bg", `${id1}.json`);
ok("meta on disk", existsSync(metaFile));
ok("exit file on disk", existsSync(join(home, ".pi", "agent", "bg", `${id1}.exit`)));
ok("exit file holds code", readFileSync(join(home, ".pi", "agent", "bg", `${id1}.exit`), "utf8").trim() === "0");

// simulate a killed process: alive pid removed, no exit code -> "lost"
const meta = JSON.parse(readFileSync(metaFile, "utf8"));
const lostId = "lost1234";
const lostMeta = { ...meta, id: lostId, pid: 999999, logPath: join(home, ".pi", "agent", "bg", `${lostId}.log`), exitPath: join(home, ".pi", "agent", "bg", `${lostId}.exit`) };
const { writeFileSync } = await import("node:fs");
writeFileSync(join(home, ".pi", "agent", "bg", `${lostId}.json`), JSON.stringify(lostMeta));
writeFileSync(lostMeta.logPath, "partial output\n");
r = await run({ action: "output", id: lostId });
ok("dead pid without exit file is lost", d(r).state === "lost", JSON.stringify(d(r)));
ok("lost task keeps its log", text(r).includes("partial output"));

// ── 10. stop kills the whole process group ────────────────────────
const { execSync } = await import("node:child_process");
const countSleeps = () => Number(execSync("ps -eo args= | grep -c '^sleep 313$' || true", { encoding: "utf8" }).trim());
r = await run({ action: "start", command: "sleep 313 & sleep 313 & wait" });
const idTree = d(r).taskId;
const treeBefore = await waitUntil(countSleeps, (n) => n === 2);
await run({ action: "stop", id: idTree });
const treeAfter = await waitUntil(countSleeps, (n) => n === 0);
ok("stop killed grandchildren", treeBefore === 2 && treeAfter === 0, `before=${treeBefore} after=${treeAfter}`);

// ── 11. a reused pid is not this task ─────────────────────────────
const { writeFileSync: writeMetaFile } = await import("node:fs");
r = await run({ action: "start", command: "sleep 300" });
const idReuse = d(r).taskId;
await run({ action: "stop", id: idReuse });
const reusePath = join(home, ".pi", "agent", "bg", `${idReuse}.json`);
const reuseMeta = JSON.parse(readFileSync(reusePath, "utf8"));
writeMetaFile(reusePath, JSON.stringify({ ...reuseMeta, pid: process.pid, exitPath: "/nonexistent/exits" }));
r = await run({ action: "output", id: idReuse });
ok("foreign live pid reads as lost", d(r).state === "lost", JSON.stringify(d(r)));
r = await run({ action: "stop", id: idReuse });
ok("refuses to kill foreign pid", /not running|no longer looks/.test(d(r).error ?? ""), JSON.stringify(d(r)));

// ── 12. clean drops finished tasks, keeps running ones ────────────
r = await run({ action: "start", command: "sleep 5" });
const idKeep = d(r).taskId;
r = await run({ action: "clean" });
ok("clean removed finished", /Removed \d+ finished/.test(text(r)), text(r));
ok("clean kept the running task", existsSync(join(home, ".pi", "agent", "bg", `${idKeep}.json`)));
ok("clean removed lost task", !existsSync(join(home, ".pi", "agent", "bg", `${lostId}.json`)));
await run({ action: "stop", id: idKeep });

// ── 13. /bg command mirrors list and output ───────────────────────
const notified: string[] = [];
const ctx = { ui: { notify: (msg: string) => notified.push(msg) } };
const cmd = commands.find((c) => c.name === "bg");
ok("/bg command registered", !!cmd);
r = await run({ action: "start", command: "echo via-command; exit 3" });
const idCmd = d(r).taskId;
await run({ action: "wait", id: idCmd, timeout: 20 });
await cmd.handler("", ctx);
ok("/bg with no args lists tasks", String(notified.at(-1)).includes(`${idCmd}  exited 3`), notified.at(-1));
await cmd.handler(idCmd.slice(0, 4), ctx);
ok("/bg <id> shows output", String(notified.at(-1)).includes("via-command") && String(notified.at(-1)).includes("exited 3"), notified.at(-1));
await cmd.handler("deadbeef", ctx);
ok("/bg unknown id reports", String(notified.at(-1)).includes("No background task"), notified.at(-1));

// ── 14. /bg panel renders, selects, and closes ────────────────────
let panel: any = undefined;
let panelClosed = false;
const theme = { fg: (_color: string, s: string) => s };
const tuiCtx = {
	mode: "tui",
	ui: {
		custom: async (fn: any) => {
			panel = fn({ requestRender() {} }, theme, {}, () => {
				panelClosed = true;
			});
		},
		notify() {},
	},
};
await cmd.handler("", tuiCtx);
const frame = panel.render(100).join("\n");
ok("/bg panel lists tasks", frame.includes("Background tasks") && frame.includes(idCmd), frame.slice(0, 300));
ok("/bg panel shows selected log", frame.includes("via-command") && frame.includes("log ──"), frame);
ok("/bg panel marks the selection", frame.includes("▸"), frame);
panel.handleInput("j");
ok("/bg panel survives a keypress", panel.render(100).join("\n").includes("Background tasks"));
panel.handleInput("\u001b");
ok("/bg panel closes on escape", panelClosed);

// ── 15. finished tasks older than a day are pruned on start ───────
const bgDir = join(home, ".pi", "agent", "bg");
const fake = (id: string, ageMs: number, code = "0") => {
	const meta = { id, command: `fake ${id}`, cwd: home, pid: 999999, startedAt: Date.now() - ageMs, logPath: join(bgDir, `${id}.log`), exitPath: join(bgDir, `${id}.exit`), ownerPid: process.pid };
	writeFileSync(join(bgDir, `${id}.json`), JSON.stringify(meta));
	writeFileSync(join(bgDir, `${id}.log`), `log of ${id}\n`);
	writeFileSync(join(bgDir, `${id}.exit`), code);
};
const DAY = 24 * 60 * 60 * 1000;
fake("oldfinish", 25 * 60 * 60 * 1000);
fake("freshfinish", 60 * 60 * 1000);
r = await run({ action: "start", command: "echo prune-check" });
const idPrune = d(r).taskId;
await run({ action: "wait", id: idPrune, timeout: 20 });
ok("old finished task pruned", !existsSync(join(bgDir, "oldfinish.json")) && !existsSync(join(bgDir, "oldfinish.log")), text(r));
ok("prune is reported once", /pruned 1 finished task/.test(text(r)), text(r));
ok("fresh finished task kept", existsSync(join(bgDir, "freshfinish.json")), text(r));

// an old task that is still running is never pruned
r = await run({ action: "start", command: "sleep 300" });
const idOldRunning = d(r).taskId;
const oldRunningPath = join(bgDir, `${idOldRunning}.json`);
const oldRunningMeta = JSON.parse(readFileSync(oldRunningPath, "utf8"));
oldRunningMeta.startedAt = Date.now() - 3 * DAY;
writeFileSync(oldRunningPath, JSON.stringify(oldRunningMeta));
r = await run({ action: "start", command: "echo after-prune" });
await run({ action: "wait", id: d(r).taskId, timeout: 20 });
ok("old running task not pruned", existsSync(oldRunningPath), text(r));

// ── 16. the cap never hides a running task ────────────────────────
for (let i = 0; i < 25; i++) fake(`pad${String(i).padStart(4, "0")}`, 1000 + i);
r = await run({ action: "list" });
ok("running task survives the 20 cap", text(r).includes(`${idOldRunning}  running`), text(r).split("\n")[0]);
ok("list stays capped", text(r).split("\n").length <= 21, String(text(r).split("\n").length));
await run({ action: "stop", id: idOldRunning });

rmSync(home, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
