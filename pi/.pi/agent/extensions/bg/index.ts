/**
 * bg — background shell tasks.
 *
 * Registers one tool:
 *   bg — start / list / output / wait / stop / clean
 *
 * Why: a long build, full test suite, install, or dev server blocks the turn
 * when run through the normal bash tool. Tasks started here run in their own
 * detached process group, so they keep running (even if pi exits) and the
 * agent polls them instead of waiting.
 *
 * State is on disk under ~/.pi/agent/bg/ (one .json + .log + .exit per task),
 * not in memory. That keeps status correct across restarts and lets a
 * subagent (a separate pi process) see and read the tasks another agent
 * started — they share the directory, not the process.
 *
 * Status is derived, never remembered: running while the pid is alive, exited
 * once the wrapper wrote its exit code to <id>.exit, "lost" if the process
 * vanished without one (killed -9, OOM).
 *
 * Install: ~/.pi/agent/extensions/bg/index.ts, then /reload.
 */

import { randomUUID } from "node:crypto";
import { closeSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { piEnv } from "../../lib/shared.js";

// ── Storage ─────────────────────────────────────────────────────────────

const BG_DIR = join(homedir(), ".pi", "agent", "bg");
const MAX_LIST = 20;
const TAIL_BYTES = 16_384;
const WAIT_POLL_MS = 150;
const STOP_GRACE_MS = 3_000;

interface Meta {
	id: string;
	command: string;
	cwd: string;
	pid: number;
	startedAt: number;
	logPath: string;
	exitPath: string;
	ownerPid: number;
	sessionId?: string;
}

const metaPath = (id: string) => join(BG_DIR, `${id}.json`);
const logPath = (id: string) => join(BG_DIR, `${id}.log`);
const exitPath = (id: string) => join(BG_DIR, `${id}.exit`);

function ensureDir(): void {
	mkdirSync(BG_DIR, { recursive: true });
}

function writeMeta(meta: Meta): void {
	ensureDir();
	const tmp = `${metaPath(meta.id)}.tmp`;
	writeFileSync(tmp, JSON.stringify(meta, null, "\t") + "\n", "utf8");
	renameSync(tmp, metaPath(meta.id));
}

function readMeta(id: string): Meta | null {
	try {
		return JSON.parse(readFileSync(metaPath(id), "utf8")) as Meta;
	} catch {
		return null;
	}
}

function allMetas(): Meta[] {
	ensureDir();
	const metas: Meta[] = [];
	for (const file of readdirSync(BG_DIR)) {
		if (!file.endsWith(".json")) continue;
		const meta = readMeta(file.slice(0, -5));
		if (meta) metas.push(meta);
	}
	return metas.sort((a, b) => b.startedAt - a.startedAt);
}

// ── Status ──────────────────────────────────────────────────────────────

type State = "running" | "exited" | "lost";

interface Status {
	state: State;
	code?: number;
	elapsedMs: number;
}

function isAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (err) {
		return (err as NodeJS.ErrnoException).code === "EPERM";
	}
}

function statusOf(meta: Meta): Status {
	const elapsedMs = Date.now() - meta.startedAt;
	try {
		const raw = readFileSync(meta.exitPath, "utf8").trim();
		if (raw !== "") {
			const code = Number(raw);
			return { state: "exited", code: Number.isFinite(code) ? code : undefined, elapsedMs };
		}
	} catch {
		// no exit file yet — still running, or died without writing one
	}
	return isAlive(meta.pid) && ownsPid(meta) ? { state: "running", elapsedMs } : { state: "lost", elapsedMs };
}

function describe(status: Status): string {
	const secs = (status.elapsedMs / 1000).toFixed(1);
	switch (status.state) {
		case "running":
			return `running ${secs}s`;
		case "exited":
			return `exited ${status.code ?? "?"} after ${secs}s`;
		case "lost":
			return `lost after ${secs}s (no exit code — killed?)`;
	}
}

/** Read at most the last `maxBytes` of a file, starting on a line boundary. */
function readTail(path: string, maxBytes: number): string {
	let size: number;
	try {
		size = statSync(path).size;
	} catch {
		return "";
	}
	if (size === 0) return "";
	const start = Math.max(0, size - maxBytes);
	const text = readFileSync(path, { encoding: "utf8", start, end: size });
	if (start === 0) return text;
	const cut = text.indexOf("\n");
	return `…[${start} bytes skipped]\n${cut >= 0 ? text.slice(cut + 1) : text}`;
}

function lastLines(text: string, lines: number): string {
	const all = text.replace(/\n+$/, "").split("\n");
	return all.slice(Math.max(0, all.length - lines)).join("\n");
}

function truncate(s: string, max: number): string {
	const one = s.replace(/\s+/g, " ").trim();
	return one.length <= max ? one : `${one.slice(0, max - 1)}…`;
}

// ── Process control ─────────────────────────────────────────────────────

/**
 * True when /proc/<pid>/cmdline matches our wrapper. Keeps a reused pid from
 * reading as "running" and from being killed as if it were this task.
 */
function ownsPid(meta: Meta): boolean {
	let cmdline: string;
	try {
		cmdline = readFileSync(`/proc/${meta.pid}/cmdline`, "utf8");
	} catch {
		return true; // no /proc (non-Linux): trust the pid
	}
	return cmdline.includes(meta.exitPath);
}

function killGroup(pid: number, signal: NodeJS.Signals): void {
	try {
		process.kill(-pid, signal);
	} catch {
		try {
			process.kill(pid, signal);
		} catch {
			// already gone
		}
	}
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ── Tool params ─────────────────────────────────────────────────────────

const BgParams = Type.Object({
	action: StringEnum(["start", "list", "output", "wait", "stop", "clean"] as const),
	command: Type.Optional(Type.String({ description: "Shell command to run in the background (action: start)" })),
	id: Type.Optional(Type.String({ description: "Task id, e.g. 'a1b2c3d4' (output, wait, stop)" })),
	lines: Type.Optional(Type.Number({ description: "Lines of log to return (output, wait; default 40, max 500)" })),
	timeout: Type.Optional(Type.Number({ description: "Seconds to wait (action: wait; default 60, max 600)" })),
	cwd: Type.Optional(Type.String({ description: "Working directory (action: start; default: current dir)" })),
});

interface BgDetails {
	action: string;
	state?: State;
	code?: number;
	elapsedMs?: number;
	taskId?: string;
	logPath?: string;
	error?: string;
}

function result(text: string, details: BgDetails) {
	return { content: [{ type: "text" as const, text }], details };
}

function fail(message: string, details: BgDetails = { action: "error" }) {
	return result(`Error: ${message}`, { ...details, error: message });
}

function requireMeta(id: string | undefined): Meta | string {
	if (!id) return "id required";
	const meta = readMeta(id);
	return meta ?? `no background task '${id}'`;
}

// ── Extension ───────────────────────────────────────────────────────────

export default function bg(pi: ExtensionAPI) {
	pi.registerTool({
		name: "bg",
		label: "Background task",
		description:
			"Run and poll shell commands in the background. Use for anything slow: full test suites, builds, installs, dev servers. Actions: start (command, cwd) → id; list; output (id, lines); wait (id, timeout); stop (id); clean (drop finished tasks).\n\nTasks run detached in their own process group: they keep running after the turn ends and after pi exits, and are visible to subagents through the shared on-disk registry. Stopping is explicit (stop), so clean up servers you no longer need.",
		promptSnippet: "bg: background shell tasks — start/list/output/wait/stop for slow commands",
		promptGuidelines: [
			"Use bg instead of bash for commands likely to take more than ~60 seconds: installs, full test suites, large builds, watch modes, dev servers.",
			"After starting, poll with bg wait (short timeout) or bg output instead of blocking; keep working while it runs.",
			"Always bg stop servers and watchers when done — they outlive the session by design.",
			"bg task state is on disk under ~/.pi/agent/bg/, so a subagent can bg list/output the parent's tasks.",
		],
		parameters: BgParams,

		async execute(_toolCallId, params) {
			switch (params.action) {
				case "start": {
					const command = params.command?.trim();
					if (!command) return fail("command required for start", { action: "start" });

					const id = randomUUID().slice(0, 8);
					const cwd = params.cwd ?? process.cwd();
					const meta: Meta = {
						id,
						command,
						cwd,
						pid: -1,
						startedAt: Date.now(),
						logPath: logPath(id),
						exitPath: exitPath(id),
						ownerPid: process.pid,
						sessionId: safeSessionId(),
					};

					let fd: number;
					try {
						ensureDir();
						fd = openSync(meta.logPath, "w");
					} catch (err) {
						return fail(`cannot create log file: ${(err as Error).message}`, { action: "start" });
					}

					try {
						// $1 = command, $2 = exit-code file. The subshell keeps `exit N`
						// inside the command from skipping the exit-code write; eval keeps
						// quoting and multiline commands intact.
						const child = spawn("bash", ["-lc", '( eval "$1" ); printf "%s" $? > "$2"', "bg", command, meta.exitPath], {
							cwd,
							detached: true,
							stdio: ["ignore", fd, fd],
							env: piEnv(),
						});
						child.unref();
						if (!child.pid) return fail("could not spawn process", { action: "start" });
						meta.pid = child.pid;
						writeMeta(meta);
					} catch (err) {
						return fail(`spawn failed: ${(err as Error).message}`, { action: "start" });
					} finally {
						closeSync(fd);
					}

					return result(
						`Started ${id} (pid ${meta.pid}) in ${cwd}\ncommand: ${command}\nlog: ${meta.logPath}\nnext: bg output ${id} · bg wait ${id} · bg stop ${id}`,
						{ action: "start", taskId: id, state: "running", elapsedMs: 0, logPath: meta.logPath },
					);
				}

				case "list": {
					const metas = allMetas().slice(0, MAX_LIST);
					if (metas.length === 0) return result("No background tasks", { action: "list" });
					const rows = metas.map((meta) => {
						const status = statusOf(meta);
						return `${meta.id}  ${describe(status).padEnd(26)}  ${truncate(meta.command, 70)}  (${meta.cwd})`;
					});
					const running = metas.filter((m) => statusOf(m).state === "running").length;
					const header = `${metas.length} task(s), ${running} running`;
					return result(`${header}\n${rows.join("\n")}`, { action: "list", taskId: metas[0]?.id });
				}

				case "output": {
					const meta = requireMeta(params.id);
					if (typeof meta === "string") return fail(meta, { action: "output" });
					const status = statusOf(meta);
					const lines = Math.max(1, Math.min(500, params.lines ?? 40));
					const text = lastLines(readTail(meta.logPath, TAIL_BYTES), lines);
					return result(
						`${meta.id} ${describe(status)} · ${truncate(meta.command, 80)}\n${text || "(no output yet)"}`,
						{ action: "output", taskId: meta.id, state: status.state, code: status.code, elapsedMs: status.elapsedMs },
					);
				}

				case "wait": {
					const meta = requireMeta(params.id);
					if (typeof meta === "string") return fail(meta, { action: "wait" });
					const timeoutMs = Math.max(1, Math.min(600, params.timeout ?? 60)) * 1000;
					const deadline = Date.now() + timeoutMs;
					let status = statusOf(meta);
					while (status.state === "running" && Date.now() < deadline) {
						await sleep(WAIT_POLL_MS);
						status = statusOf(meta);
					}
					const lines = Math.max(1, Math.min(500, params.lines ?? 20));
					const text = lastLines(readTail(meta.logPath, TAIL_BYTES), lines);
					return result(
						`${meta.id} ${describe(status)}${status.state === "running" ? ` (still running after ${Math.round(timeoutMs / 1000)}s of waiting)` : ""}\n${text || "(no output)"}`,
						{ action: "wait", taskId: meta.id, state: status.state, code: status.code, elapsedMs: status.elapsedMs },
					);
				}

				case "stop": {
					const meta = requireMeta(params.id);
					if (typeof meta === "string") return fail(meta, { action: "stop" });
					const status = statusOf(meta);
					if (status.state !== "running") return fail(`${meta.id} is not running (${describe(status)})`, { action: "stop" });
					if (!ownsPid(meta)) {
						return fail(`${meta.id}: pid ${meta.pid} no longer looks like this task; not killing it`, { action: "stop" });
					}

					killGroup(meta.pid, "SIGTERM");
					const deadline = Date.now() + STOP_GRACE_MS;
					while (isAlive(meta.pid) && Date.now() < deadline) await sleep(WAIT_POLL_MS);
					if (isAlive(meta.pid)) killGroup(meta.pid, "SIGKILL");
					return result(`Stopped ${meta.id} (${truncate(meta.command, 70)})`, { action: "stop", taskId: meta.id, state: "exited" });
				}

				case "clean": {
					const removed: string[] = [];
					for (const meta of allMetas()) {
						if (statusOf(meta).state === "running") continue;
						for (const path of [metaPath(meta.id), meta.logPath, meta.exitPath]) {
							try {
								rmSync(path, { force: true });
							} catch {
								// best effort
							}
						}
						removed.push(meta.id);
					}
					return result(removed.length ? `Removed ${removed.length} finished task(s): ${removed.join(", ")}` : "Nothing to clean (all tasks still running)", {
						action: "clean",
					});
				}

				default:
					return fail(`unknown action: ${params.action}`, { action: "list" });
			}
		},

		renderCall(args, theme) {
			let text = theme.fg("toolTitle", theme.bold("bg ")) + theme.fg("muted", args.action);
			if (args.id) text += " " + theme.fg("accent", args.id);
			if (args.command) text += " " + theme.fg("dim", truncate(String(args.command), 60));
			return new Text(text, 0, 0);
		},

		renderResult(result) {
			const details = result.details as BgDetails | undefined;
			if (details?.error) return new Text(`Error: ${details.error}`, 0, 0);
			const first = result.content[0];
			const text = first?.type === "text" ? first.text : "";
			return new Text(text.split("\n")[0] ?? "", 0, 0);
		},
	});
}

/** Session id for the owner column; undefined in RPC-free contexts. */
function safeSessionId(): string | undefined {
	return process.env.PI_SESSION_ID;
}
