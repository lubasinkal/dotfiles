// Test harness for cmd-opt.ts — loads the extension with a mock pi API.
import { join } from "node:path";

function makeMockPi() {
	const handlers: Record<string, ((...a: any[]) => any)[]> = {};
	const tools: any[] = [];
	const pi = {
		registerTool(t: any) { tools.push(t); },
		on(event: string, h: any) { (handlers[event] ||= []).push(h); },
	};
	return { pi, handlers, tools };
}

const { pi, handlers, tools } = makeMockPi();
const mod = await import(join(process.cwd(), "extensions", "cmd-opt.ts"));
mod.default(pi);

let pass = 0, fail = 0;
function check(name: string, got: any, want: any) {
	const ok = JSON.stringify(got) === JSON.stringify(want);
	if (ok) pass++; else { fail++; console.log(`✗ ${name}\n   got:  ${JSON.stringify(got)}\n   want: ${JSON.stringify(want)}`); }
}
function ok(name: string, cond: boolean, extra = "") {
	if (cond) pass++; else { fail++; console.log(`✗ ${name} ${extra}`); }
}

// ── 1. lint-cmd tool ───────────────────────────────────────────────
const lintTool = tools.find(t => t.name === "lint-cmd");
const statsTool = tools.find(t => t.name === "cmd-stats");
ok("lint-cmd registered", !!lintTool);
ok("cmd-stats registered", !!statsTool);

async function lint(cmd: string, apply = false) {
	const r = await lintTool.execute("id", { command: cmd, apply }, null, null, { cwd: "/tmp" });
	return r.content[0].text;
}

let r = await lint("which python3", true);
ok("which → command -v", r.includes("command -v python3") && r.includes("rewrite"), r.slice(0, 120));

r = await lint("cat file.txt | head -20", true);
ok("cat|head → sed", r.includes("sed -n '1,20p' file.txt"), r.slice(0, 140));

r = await lint("cat file.txt | head -n 20", true);
ok("cat|head -n → sed", r.includes("sed -n '1,20p' file.txt"), r.slice(0, 140));

r = await lint("cat file.txt | tail -5", true);
ok("cat|tail → tail", r.includes("tail -5 file.txt"), r.slice(0, 140));

r = await lint("git status --short");
ok("git status hint", r.includes("files-changed"), r.slice(0, 120));

r = await lint("rg foo . | head");
ok("rg|head hint", r.includes("snippet"), r.slice(0, 120));

r = await lint("rm -rf /");
ok("rm -rf / block", r.includes("⛔") && r.includes("do NOT run"), r.slice(0, 120));

r = await lint("find / -name foo");
ok("find / block", r.includes("⛔"), r.slice(0, 120));

r = await lint("ls -la");
ok("clean command", r.includes("clean"), r.slice(0, 80));

r = await lint("grep -rn foo .");
ok("grep -rn hint", r.includes("snippet"), r.slice(0, 120));

// ── 2. tool_call interceptor ───────────────────────────────────────
const tcHandler = handlers.tool_call?.[0];
ok("tool_call handler registered", !!tcHandler);

function tcEvent(cmd: string) {
	return { toolName: "bash", toolCallId: "t1", input: { command: cmd } };
}

// block
let ev = tcEvent("rm -rf ~");
let res = await tcHandler(ev, {});
ok("interceptor blocks rm -rf ~", res?.block === true, JSON.stringify(res));

ev = tcEvent("find / -name foo");
res = await tcHandler(ev, {});
ok("interceptor blocks find /", res?.block === true, JSON.stringify(res));

// rewrite
ev = tcEvent("which git");
res = await tcHandler(ev, {});
ok("interceptor rewrites which", ev.input.command === "command -v git", ev.input.command);

// hint
ev = tcEvent("git diff");
res = await tcHandler(ev, {});
ok("interceptor hints git diff", ev.input.command.includes("[cmd-opt]") && ev.input.command.includes("diff-hunks"), ev.input.command);

// clean passthrough
ev = tcEvent("ls");
res = await tcHandler(ev, {});
ok("clean command untouched", ev.input.command === "ls", ev.input.command);

// stats after interceptor
const sr = await statsTool.execute("id", {}, null, null, { cwd: "/tmp" });
const statsText = sr.content[0].text;
ok("stats shows linted≥5", /commands linted:\s+5/.test(statsText), statsText.split("\n").slice(1, 3).join(" | "));
ok("stats shows rewritten≥1", /auto-rewritten:\s+1/.test(statsText));
ok("stats shows blocked≥2", /blocked:\s+2/.test(statsText), statsText.split("\n")[3]);

// ── 3. tool_result capper ──────────────────────────────────────────
const trHandler = handlers.tool_result?.[0];
ok("tool_result handler registered", !!trHandler);

const big = "x".repeat(30_000) + "ERROR-AT-TAIL";
ev = { toolName: "bash", toolCallId: "t2", input: {}, content: [{ type: "text", text: big }], isError: false };
res = await trHandler(ev, {});
const cappedText = res?.content?.[0]?.text ?? "";
ok("capper truncates", cappedText.length < 30_000, `len=${cappedText.length}`);
ok("capper keeps tail", cappedText.endsWith("ERROR-AT-TAIL"));
ok("capper marks truncation", cappedText.includes("[cmd-opt: middle truncated"));

// small output untouched
ev = { toolName: "bash", toolCallId: "t3", input: {}, content: [{ type: "text", text: "ok" }], isError: false };
res = await trHandler(ev, {});
ok("capper leaves small output", res === undefined);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
