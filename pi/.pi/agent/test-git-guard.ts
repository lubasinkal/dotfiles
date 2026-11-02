// Test harness for git-guard — mock pi API + throwaway git repos.
// Run: node test-git-guard.ts (plain node) or bun run test-git-guard.ts
import "./test-hooks.ts";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const handlers: Record<string, ((...a: any[]) => any)[]> = {};
const pi = { registerTool() {}, registerCommand() {}, on(event: string, h: any) { (handlers[event] ||= []).push(h); } };

const mod = await import(join(process.cwd(), "extensions", "git-guard", "index.ts"));
mod.default(pi);

let pass = 0, fail = 0;
function ok(name: string, cond: boolean, extra = "") {
	if (cond) pass++; else { fail++; console.log(`✗ ${name} ${extra}`); }
}
function check(name: string, got: any, want: any) {
	const same = JSON.stringify(got) === JSON.stringify(want);
	ok(name, same, `got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
}

ok("tool_call handler registered", !!handlers.tool_call?.length);

// ── repo fixture ───────────────────────────────────────────────────
const root = mkdtempSync(join(tmpdir(), "pi-guard-"));
const repo = join(root, "repo");
execFileSync("git", ["init", "-q", repo]);
const gitIn = (args: string[]) =>
	execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], { cwd: repo, encoding: "utf8" });
gitIn(["commit", "-q", "--allow-empty", "-m", "init"]);

const write = (name: string, content: string) => writeFileSync(join(repo, name), content);
const stage = (name: string) => gitIn(["add", name]);

const guard = async (command: string, cwd = repo) => {
	for (const h of handlers.tool_call) {
		const res = await h({ toolName: "bash", input: { command }, toolCallId: "t" }, { cwd });
		if (res) return res;
	}
	return undefined;
};

// ── commit target resolution ──────────────────────────────────────
const { commitTargets } = mod;
check("plain commit targets cwd", commitTargets("git commit -m x", "/base"), ["/base"]);
check("cd then commit targets that dir", commitTargets("cd sub && git commit -m x", "/base"), ["/base/sub"]);
check("quoted cd target", commitTargets('cd "a b" && git commit -m x', "/base"), ["/base/a b"]);
check("git -C targets that dir", commitTargets("git -C sub commit -m x", "/base"), ["/base/sub"]);
check("absolute cd target", commitTargets("cd /tmp/x && git commit", "/base"), ["/tmp/x"]);
check("two commits, two targets", commitTargets("git commit -m a; cd sub && git commit -m b", "/base"), ["/base", "/base/sub"]);
check("no commit, no targets", commitTargets("git status", "/base"), []);

// ── commit detection ───────────────────────────────────────────────
const { isGitCommit, commitsAllFiles } = mod;
ok("plain commit", isGitCommit("git commit -m 'x'"));
ok("commit after cd", isGitCommit("cd /tmp && git commit -m x"));
ok("commit with -C", isGitCommit("git -C sub commit -m x"));
ok("commit with -c", isGitCommit("git -c user.name=x commit -m x"));
ok("commit with --no-pager", isGitCommit("git --no-pager commit -m x"));
ok("not log --grep commit", !isGitCommit("git log --grep commit"));
ok("not status", !isGitCommit("git status"));
ok("not gitignore write", !isGitCommit("echo commit > .gitignore"));
ok("-a detected", commitsAllFiles("git commit -am 'x'"));
ok("--all detected", commitsAllFiles("git commit --all -m x"));
ok("plain commit is not -a", !commitsAllFiles("git commit -m 'add all the things'"));

// ── clean commit passes ────────────────────────────────────────────
write("a.txt", "hello\n");
stage("a.txt");
ok("clean staged change allowed", (await guard("git commit -m 'add a'"))?.block !== true);

// ── secret in staged content ───────────────────────────────────────
write("creds.txt", "line one\naws: AKIAIOSFODNN7EXAMPLE\n");
stage("creds.txt");
let res = await guard("git commit -m 'x'");
ok("aws key blocked", res?.block === true, JSON.stringify(res));
ok("reason names file and line", /creds\.txt:2\s+aws-access-key/.test(res?.reason ?? ""), res?.reason);
ok("reason explains the bypass", /PI_GIT_GUARD=off/.test(res?.reason ?? ""));
gitIn(["restore", "--staged", "creds.txt"]);

// ── private key + github token ─────────────────────────────────────
write("key.txt", "-----BEGIN RSA PRIVATE KEY-----\nabc\n");
stage("key.txt");
res = await guard("git commit -m x");
ok("private key blocked", res?.block === true && /private-key/.test(res.reason ?? ""), res?.reason);
write("key.txt", "token: ghp_abcdefghijklmnopqrstuvwxyz0123456789\n");
stage("key.txt");
res = await guard("git commit -m x");
ok("github token blocked", res?.block === true && /github-token/.test(res.reason ?? ""), res?.reason);
gitIn(["restore", "--staged", "key.txt"]);

// ── debug leftovers ────────────────────────────────────────────────
write("t.test.ts", "describe('x', () => {\n  it.only('y', () => {});\n});\n");
stage("t.test.ts");
res = await guard("git commit -m x");
ok("focused test blocked", res?.block === true && /test-focused/.test(res.reason ?? ""), res?.reason);
write("t.test.ts", "const x = 1;\ndebugger;\n");
stage("t.test.ts");
res = await guard("git commit -m x");
ok("debugger blocked", res?.block === true && /debugger/.test(res.reason ?? ""), res?.reason);
write("t.test.ts", "const x = 1;\n// debugger; is mentioned here\n");
stage("t.test.ts");
ok("debugger in comment allowed", (await guard("git commit -m x"))?.block !== true);
gitIn(["restore", "--staged", "t.test.ts"]);

// ── sensitive file names ───────────────────────────────────────────
write(".env", "TOKEN=abc\n");
stage(".env");
res = await guard("git commit -m x");
ok(".env blocked", res?.block === true && /env-file/.test(res.reason ?? ""), res?.reason);
gitIn(["restore", "--staged", ".env"]);
write(".env.example", "TOKEN=\n");
stage(".env.example");
ok(".env.example allowed", (await guard("git commit -m x"))?.block !== true);
gitIn(["restore", "--staged", ".env.example"]);
write("server.pem", "not really a key\n");
stage("server.pem");
res = await guard("git commit -m x");
ok("*.pem blocked", res?.block === true && /private-key-file/.test(res.reason ?? ""), res?.reason);
gitIn(["restore", "--staged", "server.pem"]);

// ── git commit -a sees unstaged tracked changes ────────────────────
write("tracked.txt", "clean\n");
stage("tracked.txt");
gitIn(["commit", "-q", "-m", "add tracked"]);
write("tracked.txt", "clean\npassword: sk-ant-abcdefghijklmnopqrstuvwx\n");
ok("uncovered by --cached alone", (await guard("git commit -m x"))?.block !== true);
res = await guard("git commit -am x");
ok("-a commit scans working tree", res?.block === true && /anthropic-key/.test(res.reason ?? ""), res?.reason);
gitIn(["checkout", "--", "tracked.txt"]);

// ── the scanned repo is the one being committed to ────────────────
const other = join(root, "other");
execFileSync("git", ["init", "-q", other]);
const gitOther = (args: string[]) =>
	execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], { cwd: other, encoding: "utf8" });
gitOther(["commit", "-q", "--allow-empty", "-m", "init"]);

// Secret staged in the OTHER repo, nothing staged here.
writeFileSync(join(other, "creds.txt"), "AKIAIOSFODNN7EXAMPLE\n");
gitOther(["add", "creds.txt"]);

res = await guard(`cd ${other} && git commit -m x`);
ok("cd into another repo: scans that repo", res?.block === true, JSON.stringify(res));

// Secret staged HERE, commit aimed at the clean other repo: must not block.
write("mine.txt", "AKIAIOSFODNN7EXAMPLE\n");
stage("mine.txt");
gitOther(["restore", "--staged", "creds.txt"]);
res = await guard(`cd ${other} && git commit -m x`);
ok("cd into a clean repo: does not block on cwd's index", res?.block !== true, JSON.stringify(res));

// Secret staged in the other repo, reached with git -C.
gitOther(["add", "creds.txt"]);
res = await guard(`git -C ${other} commit -m x`);
ok("git -C scans the target repo", res?.block === true, JSON.stringify(res));
gitOther(["restore", "--staged", "creds.txt"]);
gitIn(["restore", "--staged", "mine.txt"]);

// ── bypass and failure modes ───────────────────────────────────────
write("creds2.txt", "AKIAIOSFODNN7EXAMPLE\n");
stage("creds2.txt");
process.env.PI_GIT_GUARD = "off";
ok("PI_GIT_GUARD=off bypasses", (await guard("git commit -m x"))?.block !== true);
delete process.env.PI_GIT_GUARD;
ok("guard active again", (await guard("git commit -m x"))?.block === true);

const plainDir = mkdtempSync(join(tmpdir(), "pi-nogit-"));
ok("outside a git repo: fail open", (await guard("git commit -m x", plainDir))?.block !== true);
ok("non-bash tool ignored", !(await (async () => {
	for (const h of handlers.tool_call) {
		const r = await h({ toolName: "write", input: { path: "x", content: "AKIAIOSFODNN7EXAMPLE" }, toolCallId: "t" }, { cwd: repo });
		if (r) return r;
	}
})()));

rmSync(root, { recursive: true, force: true });
rmSync(plainDir, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
