// Test harness for quality-gate — mock pi API + throwaway git repo.
// Run: node test-quality-gate.ts (plain node) or bun run test-quality-gate.ts
import "./test-hooks.ts";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = mkdtempSync(join(tmpdir(), "pi-qg-"));
const repo = join(root, "repo");
execFileSync("git", ["init", "-q", repo]);
const git = (args: string[]) =>
	execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], { cwd: repo, encoding: "utf8" });

let pass = 0, fail = 0;
function ok(name: string, cond: boolean, extra = "") {
	if (cond) pass++; else { fail++; console.log(`✗ ${name} ${extra}`); }
}

const handlers: Record<string, ((...a: any[]) => any)[]> = {};
const mod = await import(join(process.cwd(), "extensions", "quality-gate", "index.ts"));
mod.default({ registerTool() {}, registerCommand() {}, on(e: string, h: any) { (handlers[e] ||= []).push(h); } });

ok("uses tool_result, not tool_call", !!handlers.tool_result && !handlers.tool_call);

const write = (name: string, content: string) => {
	writeFileSync(join(repo, name), content);
	git(["add", name]);
};
const runTurn = async (isError = false) => {
	const notices: string[] = [];
	for (const h of handlers.tool_result ?? []) await h({ toolName: "edit", isError }, {});
	for (const h of handlers.agent_end ?? []) await h({}, { cwd: repo, ui: { notify: (m: string) => notices.push(m) } });
	return notices.join(" | ");
};

write("a.ts", "const x = 1;\n");
git(["commit", "-q", "-m", "base"]);

// removed debugger: not the agent's problem
write("a.ts", "const x = 1;\n");
await runTurn();
ok("no notice for a no-op turn", (await runTurn()) === "");

write("a.ts", "const x = 1;\ndebugger;\n");
let notice = await runTurn();
ok("flags an added debugger", /debugger statement/.test(notice), notice);

git(["reset", "-q", "--hard", "HEAD"]);
write("a.ts", "const x = 1;\ndebugger;\n");
git(["commit", "-q", "-am", "add debugger"]);
write("a.ts", "const x = 1;\n");
notice = await runTurn();
ok("removing a debugger is not flagged", !/debugger statement/.test(notice), notice);

// a failed edit must not arm the gate
git(["reset", "-q", "--hard", "HEAD"]);
notice = await runTurn(true);
ok("failed edit does not arm the gate", notice === "", notice);

rmSync(root, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
