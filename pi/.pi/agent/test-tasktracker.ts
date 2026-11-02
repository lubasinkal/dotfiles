// Test harness for tasktracker — loads the extension with a mock pi API.
// Run: node test-tasktracker.ts   (node 22 strips types) or bun run test-tasktracker.ts
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Isolate persistence before the extension module computes its path.
const home = mkdtempSync(join(tmpdir(), "pi-taskhome-"));
process.env.HOME = home;
const taskFile = join(home, ".pi", "agent", "tasks.json");

const handlers: Record<string, ((...a: any[]) => any)[]> = {};
const tools: any[] = [];
const commands: any[] = [];
const pi = {
	registerTool(t: any) { tools.push(t); },
	registerCommand(name: string, c: any) { commands.push({ name, ...c }); },
	on(event: string, h: any) { (handlers[event] ||= []).push(h); },
};

const mod = await import(join(process.cwd(), "extensions", "tasktracker", "index.ts"));
mod.default(pi);

let pass = 0, fail = 0;
function ok(name: string, cond: boolean, extra = "") {
	if (cond) pass++; else { fail++; console.log(`✗ ${name} ${extra}`); }
}
function check(name: string, got: any, want: any) {
	const same = JSON.stringify(got) === JSON.stringify(want);
	ok(name, same, `got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
}

const tool = tools.find((t) => t.name === "task");
ok("task tool registered", !!tool);
ok("/tasks command registered", commands.some((c) => c.name === "tasks"));
ok("session handlers registered", !!handlers.session_start && !!handlers.session_tree);

const run = (params: any) => tool.execute("id", params, undefined, undefined, {});
const d = (r: any) => r.details;
const reconstruct = (branch: any[] = []) =>
	handlers.session_start[0](undefined, { sessionManager: { getBranch: () => branch } });

await reconstruct();

// ── 1. add / list / sort ───────────────────────────────────────────
let r = await run({ action: "add", text: "write tests", priority: "high" });
check("add assigns id 1", d(r).tasks[0].id, 1);
check("add keeps priority", d(r).tasks[0].priority, "high");

r = await run({ action: "add", text: "ship it" });
check("nextId advances", d(r).nextId, 3);

r = await run({ action: "done", id: 2 });
ok("done toggles", d(r).tasks[1].done === true);

r = await run({ action: "list" });
const lines = r.content[0].text.split("\n");
ok("list header counts", /^1\/2 done/.test(lines[0]), lines[0]);
ok("open high-priority first", /\[ \] #1 ! write tests/.test(lines[1]), lines[1]);
ok("done tasks last", /\[x\] #2 - ship it/.test(lines[2]), lines[2]);

// ── 2. errors are returned, never thrown ──────────────────────────
r = await run({ action: "done", id: 99 });
ok("unknown id errors", /#99 not found/.test(d(r).error ?? ""));
r = await run({ action: "add", text: "   " });
ok("blank text errors", /text required/.test(d(r).error ?? ""));
r = await run({ action: "remove", id: 99 });
ok("remove unknown errors", /not found/.test(d(r).error ?? ""));

// ── 3. edit ───────────────────────────────────────────────────────
r = await run({ action: "edit", id: 1, text: "write more tests", note: "cover persistence", priority: "low" });
check("edit text", d(r).tasks[0].text, "write more tests");
check("edit note", d(r).tasks[0].note, "cover persistence");
check("edit priority", d(r).tasks[0].priority, "low");

// ── 4. persistence ────────────────────────────────────────────────
r = await run({ action: "persist", persist: true });
ok("persist enabled", d(r).persisted === true && existsSync(taskFile));
check("persisted file has both tasks", JSON.parse(readFileSync(taskFile, "utf8")).tasks.length, 2);

await reconstruct();
r = await run({ action: "list" });
check("empty branch loads tasks.json", d(r).tasks.length, 2);
ok("reports persisted", d(r).persisted === true);

// branch snapshot wins over the file
const snap = {
	action: "list",
	tasks: [{ id: 7, text: "from branch", done: false, priority: "normal" }],
	nextId: 8,
	persisted: false,
};
await reconstruct([{ type: "message", message: { role: "toolResult", toolName: "task", details: snap } }]);
r = await run({ action: "list" });
check("branch snapshot wins", d(r).tasks.map((t: any) => t.id), [7]);
ok("branch snapshot clears persisted", d(r).persisted === false);

// clear removes the file
await reconstruct();
await run({ action: "persist", persist: true });
r = await run({ action: "clear" });
check("clear empties list", d(r).tasks.length, 0);
check("clear resets ids", d(r).nextId, 1);
ok("clear removes tasks.json", !existsSync(taskFile));

r = await run({ action: "persist", persist: false });
ok("persist can be disabled", d(r).persisted === false);

rmSync(home, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
