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

// ── every md file the harness loads must parse ────────────────────
// An unquoted colon+space in a description is a hard YAML error that drops the
// whole file ("description: Recon: locate ...").
const { parseFrontmatter } = await import("@earendil-works/pi-coding-agent");
const { readdirSync, readFileSync } = await import("node:fs");
for (const dir of ["agents", "prompts"]) {
	for (const file of readdirSync(join(process.cwd(), dir)).filter((f: string) => f.endsWith(".md"))) {
		const path = join(process.cwd(), dir, file);
		let frontmatter: Record<string, unknown> = {};
		let error = "";
		try {
			frontmatter = parseFrontmatter<Record<string, unknown>>(readFileSync(path, "utf8")).frontmatter;
		} catch (err) {
			error = err instanceof Error ? err.message.split("\n")[0] : String(err);
		}
		ok(`${dir}/${file} frontmatter parses`, error === "", error);
		ok(`${dir}/${file} has a description`, typeof frontmatter.description === "string" && frontmatter.description.length > 0);
	}
}

// ── agent tool lists must name tools that exist ───────────────────
// This is what catches `web_fetch`, command -v is not a tool here.
const BASE_TOOLS = [
	// built-in
	"read", "write", "edit", "bash",
	// npm:pi-web-access
	"web_search", "fetch_content", "get_search_content", "source_check",
];
const registered = new Set<string>(BASE_TOOLS);
const mockPi = {
	registerTool: (t: any) => registered.add(t.name),
	registerCommand: () => {},
	on: () => {},
	events: { on: () => () => {}, emit: () => {} },
};
for (const entry of readdirSync(join(process.cwd(), "extensions"))) {
	const file = entry.endsWith(".ts") ? entry : join(entry, "index.ts");
	try {
		const mod = await import(join(process.cwd(), "extensions", file));
		mod.default?.(mockPi);
	} catch (err) {
		ok(`extension ${entry} loads for tool discovery`, false, err instanceof Error ? err.message.split("\n")[0] : "");
	}
}

// Read the shipped agent files directly: discovery resolves against $HOME, and
// this test deliberately points $HOME at a fixture directory.
for (const file of readdirSync(join(process.cwd(), "agents")).filter((f: string) => f.endsWith(".md"))) {
	const { frontmatter } = parseFrontmatter<Record<string, unknown>>(readFileSync(join(process.cwd(), "agents", file), "utf8"));
	const tools = (typeof frontmatter.tools === "string" ? frontmatter.tools.split(",") : []).map((t) => t.trim()).filter(Boolean);
	const unknown = tools.filter((t) => !registered.has(t));
	ok(`${file} lists only real tools`, unknown.length === 0, `unknown: ${unknown.join(", ")}`);
}

rmSync(home, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
