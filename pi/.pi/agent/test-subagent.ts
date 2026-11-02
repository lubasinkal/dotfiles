// Test harness for subagent agent discovery — the parsing that used to throw.
// Run: node test-subagent.ts (plain node) or bun run test-subagent.ts
import "./test-hooks.ts";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const home = mkdtempSync(join(tmpdir(), "pi-subagent-"));
const agentDir = join(home, ".pi", "agent", "agents");
mkdirSync(agentDir, { recursive: true });
process.env.HOME = home;

let pass = 0, fail = 0;
function ok(name: string, cond: boolean, extra = "") {
	if (cond) pass++; else { fail++; console.log(`✗ ${name} ${extra}`); }
}

const writeAgent = (name: string, frontmatter: string, body = "Do the thing.") =>
	writeFileSync(join(agentDir, `${name}.md`), `---\n${frontmatter}\n---\n\n${body}\n`);

// Both YAML spellings of `tools` are valid and both occur in practice.
writeAgent("string-tools", "name: string-tools\ndescription: csv form\ntools: read, bash\nthinking: low");
writeAgent("array-tools", "name: array-tools\ndescription: yaml array form\ntools: [read, bash]\nmodel: opencode/mimo-v2.6-flash");
// A malformed agent in the same directory must not take the others down.
writeAgent("broken", "name: 42\ndescription: [not, a, string]");
writeFileSync(join(agentDir, "not-frontmatter.md"), "no frontmatter at all\n");

const { discoverAgents } = await import(join(process.cwd(), "extensions", "subagent", "agents.ts"));
const discovery = discoverAgents(home, "user");
const byName = new Map(discovery.agents.map((a: any) => [a.name, a]));

ok("discovery survives a malformed agent", discovery.agents.length >= 2, JSON.stringify(discovery.agents.map((a: any) => a.name)));
ok("csv tools parsed", JSON.stringify(byName.get("string-tools")?.tools) === JSON.stringify(["read", "bash"]), JSON.stringify(byName.get("string-tools")?.tools));
ok("yaml array tools parsed", JSON.stringify(byName.get("array-tools")?.tools) === JSON.stringify(["read", "bash"]), JSON.stringify(byName.get("array-tools")?.tools));
ok("per-agent thinking kept", byName.get("string-tools")?.thinking === "low", String(byName.get("string-tools")?.thinking));
ok("per-agent model kept", byName.get("array-tools")?.model === "opencode/mimo-v2.6-flash", String(byName.get("array-tools")?.model));
ok("no empty tools array leaks", byName.get("array-tools")?.tools?.length === 2);

rmSync(home, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
