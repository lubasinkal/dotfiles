// Test harness for the lib/ tool implementations that had no coverage.
// Run: node test-lib.ts (plain node) or bun run test-lib.ts
import "./test-hooks.ts";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let pass = 0, fail = 0;
function ok(name: string, cond: boolean, extra = "") {
	if (cond) pass++; else { fail++; console.log(`✗ ${name} ${extra}`); }
}

const root = mkdtempSync(join(tmpdir(), "pi-lib-"));

// ── diff-hunks: paths must survive quoting and stay out of the shell ──
{
	const repo = join(root, "diffrepo");
	mkdirSync(repo, { recursive: true });
	const git = (args: string[]) => execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], { cwd: repo, encoding: "utf8" });
	git(["init", "-q"]);
	// Spaces, a quote, a dollar sign and a semicolon: all shell-hostile.
	const nasty = 'we ird"$x;rm -rf.txt';
	writeFileSync(join(repo, nasty), "one\n");
	git(["add", nasty]);
	git(["commit", "-q", "-m", "init"]);
	writeFileSync(join(repo, nasty), "one\ntwo\n");

	const { diffHunksTool } = await import(join(process.cwd(), "lib", "diff-hunks.ts"));
	const run = (paths?: string[]) => diffHunksTool.execute("id", { paths }, undefined, undefined, { cwd: repo });
	const all = (await run()).content[0].text;
	ok("diff-hunks finds the change", all.includes("two"), all.slice(0, 200));
	ok("diff-hunks does not leak a shell error", !all.startsWith("[exit"), all.slice(0, 200));

	const scoped = (await run([nasty])).content[0].text;
	ok("diff-hunks handles a hostile pathspec", scoped.includes("two") && !scoped.startsWith("[exit"), scoped.slice(0, 200));
	ok("diff-hunks did not delete anything", execFileSync("ls", [repo], { encoding: "utf8" }).includes("we ird"), "file vanished");

	// The harness has handed the tool a nested / non-string pathspec before, which
	// threw "s.replace is not a function" mid-session; both shapes must work.
	const nested = (await diffHunksTool.execute("id", { paths: [[nasty]] } as any, undefined, undefined, { cwd: repo })).content[0].text;
	ok("diff-hunks tolerates a nested pathspec", nested.includes("two") && !nested.startsWith("[exit"), nested.slice(0, 200));
	const bare = (await diffHunksTool.execute("id", { paths: nasty } as any, undefined, undefined, { cwd: repo })).content[0].text;
	ok("diff-hunks tolerates a bare string pathspec", bare.includes("two") && !bare.startsWith("[exit"), bare.slice(0, 200));
}

// ── check: eslint's stylish output must be parsed, not dumped raw ─────
{
	const proj = join(root, "checkproj");
	mkdirSync(join(proj, "node_modules", ".bin"), { recursive: true });
	writeFileSync(join(proj, "package.json"), "{}\n");
	writeFileSync(join(proj, "a.ts"), "const x: number = 1;\n");

	const eslint = join(proj, "node_modules", ".bin", "eslint");
	writeFileSync(eslint, `#!/bin/sh\ncat <<'OUT'\n/${proj}/a.ts\n  3:9  error  Unexpected any  @typescript-eslint/no-explicit-any\n  7:1  warning  Unused var  no-unused-vars\n\n✖ 2 problems (1 error, 1 warning)\nOUT\nexit 1\n`);
	execFileSync("chmod", ["+x", eslint]);

	const tsc = join(proj, "node_modules", ".bin", "tsc");
	writeFileSync(tsc, `#!/bin/sh\necho "a.ts(3,9): error TS2322: Type 'string' is not assignable to type 'number'." >&2\nexit 2\n`);
	execFileSync("chmod", ["+x", tsc]);

	const { checkTool } = await import(join(process.cwd(), "lib", "check.ts"));
	const run = (scope: string) => checkTool.execute("id", { scope }, undefined, undefined, { cwd: proj });

	const eslintOut = (await run("eslint")).content[0].text;
	ok("eslint output is parsed", /eslint: 2 unique problem/.test(eslintOut), eslintOut);
	ok("eslint reports file:line", eslintOut.includes("a.ts:3"), eslintOut);
	ok("eslint is not dumped raw", !/output not parsed/.test(eslintOut), eslintOut);

	const tscOut = (await run("tsc")).content[0].text;
	ok("tsc output is parsed", /tsc: 1 unique error/.test(tscOut), tscOut);
	ok("tsc reports the location", tscOut.includes("a.ts:3"), tscOut);
}

// ── code-index: prefiltered scan still finds definitions ─────────────
{
	const repo = join(root, "idxrepo");
	mkdirSync(repo, { recursive: true });
	const git = (args: string[]) => execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], { cwd: repo, encoding: "utf8" });
	git(["init", "-q"]);
	// A big non-code file that used to be scanned line by line.
	writeFileSync(join(repo, "notes.txt"), "just prose\n".repeat(50_000));
	writeFileSync(join(repo, "lib.ts"), "export function alpha() {}\nexport class Beta {}\nconst noise = 1;\n");
	git(["add", "."]);

	const { codeIndexTool } = await import(join(process.cwd(), "lib", "code-index.ts"));
	const out = (await codeIndexTool.execute("id", { query: "alpha", force: true }, undefined, undefined, { cwd: repo })).content[0].text;
	ok("code-index finds a function", /function alpha/.test(out), out);
	const beta = (await codeIndexTool.execute("id", { query: "beta" }, undefined, undefined, { cwd: repo })).content[0].text;
	ok("code-index finds a class", /class Beta/.test(beta), beta);
	const prose = (await codeIndexTool.execute("id", { query: "prose" }, undefined, undefined, { cwd: repo })).content[0].text;
	ok("code-index skips non-code text", /\(none\)/.test(prose), prose);
	const worse = (await codeIndexTool.execute("id", { query: "just" }, undefined, undefined, { cwd: repo })).content[0].text;
	ok("code-index does not index 50k prose lines", /\(none\)/.test(worse), worse.slice(0, 120));
}

rmSync(root, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
