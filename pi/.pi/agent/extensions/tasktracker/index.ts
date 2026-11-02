/**
 * tasktracker — task list tool for the agent.
 *
 * Registers:
 *   task — add / list / done / reopen / remove / edit / clear
 *   /tasks — interactive TUI panel
 *
 * Two layers of state:
 *   1. Session branching (primary): each tool result carries the full
 *      snapshot in `details`, so a rewind restores the task list for that
 *      point in history. Nothing is mutated outside the tool call.
 *   2. Cross-session persistence (opt-in): pass `persist: true` and the
 *      list also lands in `~/.pi/agent/tasks.json`, so a new session
 *      starts with the previous list. `persist: false` clears the file.
 *
 * Install: ~/.pi/agent/extensions/tasktracker/index.ts, then /reload.
 */

import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import type { ExtensionAPI, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { matchesKey, Text, truncateToWidth } from "@earendil-works/pi-tui";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

// ── Types ───────────────────────────────────────────────────────────────

type Priority = "high" | "normal" | "low";

interface Task {
	id: number;
	text: string;
	done: boolean;
	priority: Priority;
	note?: string;
}

interface TaskDetails {
	action: string;
	tasks: Task[];
	nextId: number;
	persisted: boolean;
	error?: string;
}

const TASK_FILE = join(homedir(), ".pi", "agent", "tasks.json");
const PRIORITY_ORDER: Record<Priority, number> = { high: 0, normal: 1, low: 2 };

const TaskParams = Type.Object({
	action: StringEnum(["add", "list", "done", "reopen", "remove", "edit", "clear", "persist"] as const),
	text: Type.Optional(Type.String({ description: "Task text (add) or new text (edit)" })),
	id: Type.Optional(Type.Number({ description: "Task id (done, reopen, remove, edit)" })),
	priority: Type.Optional(StringEnum(["high", "normal", "low"] as const)),
	note: Type.Optional(Type.String({ description: "Free-form note (edit)" })),
	persist: Type.Optional(
		Type.Boolean({ description: "Write the list to ~/.pi/agent/tasks.json so a new session starts with it" }),
	),
});

// ── Persistence ─────────────────────────────────────────────────────────

function loadPersisted(): { tasks: Task[]; nextId: number } | null {
	try {
		const raw: unknown = JSON.parse(readFileSync(TASK_FILE, "utf8"));
		const data = raw as { tasks?: Task[]; nextId?: number };
		if (!Array.isArray(data.tasks) || typeof data.nextId !== "number") return null;
		return { tasks: data.tasks, nextId: data.nextId };
	} catch {
		return null;
	}
}

function savePersisted(tasks: Task[], nextId: number): boolean {
	try {
		mkdirSync(dirname(TASK_FILE), { recursive: true });
		writeFileSync(TASK_FILE, JSON.stringify({ tasks, nextId }, null, "\t") + "\n", "utf8");
		return true;
	} catch {
		return false;
	}
}

function clearPersisted(): void {
	try {
		rmSync(TASK_FILE, { force: true });
	} catch {
		// Non-fatal: file may not exist or be unreadable.
	}
}

// ── Formatting ──────────────────────────────────────────────────────────

const MARK: Record<Priority, string> = { high: "!", normal: "-", low: "·" };

function sorted(tasks: Task[]): Task[] {
	return [...tasks].sort((a, b) => Number(a.done) - Number(b.done) || PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || a.id - b.id);
}

function renderList(tasks: Task[]): string {
	if (tasks.length === 0) return "No tasks";
	return sorted(tasks)
		.map((t) => {
			const box = t.done ? "[x]" : "[ ]";
			const note = t.note ? ` — ${t.note}` : "";
			return `${box} #${t.id} ${MARK[t.priority]} ${t.text}${note}`;
		})
		.join("\n");
}

function counts(tasks: Task[]): string {
	const done = tasks.filter((t) => t.done).length;
	return `${done}/${tasks.length} done`;
}

function okText(message: string, tasks: Task[], nextId: number, persisted: boolean) {
	return {
		content: [{ type: "text" as const, text: message }],
		details: { action: "mutate", tasks: [...tasks], nextId, persisted } as TaskDetails,
	};
}

function errText(message: string, tasks: Task[], nextId: number, persisted: boolean, action: string) {
	return {
		content: [{ type: "text" as const, text: `Error: ${message}` }],
		details: { action, tasks: [...tasks], nextId, persisted, error: message } as TaskDetails,
	};
}

// ── TUI panel ───────────────────────────────────────────────────────────

class TaskPanel {
	private getTasks: () => Task[];
	private theme: Theme;
	private onClose: () => void;
	private onRefresh?: () => void;
	private requestRender?: () => void;
	private cachedKey?: string;
	private cachedLines?: string[];

	constructor(options: {
		getTasks: () => Task[];
		theme: Theme;
		onClose: () => void;
		onRefresh?: () => void;
		requestRender?: () => void;
	}) {
		this.getTasks = options.getTasks;
		this.theme = options.theme;
		this.onClose = options.onClose;
		this.onRefresh = options.onRefresh;
		this.requestRender = options.requestRender;
	}

	handleInput(data: string): void {
		if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) {
			this.onClose();
			return;
		}
		// r: re-read the branch (the source of truth) without closing the panel.
		if (data === "r" || data === "R") {
			this.onRefresh?.();
			this.invalidate();
			this.requestRender?.();
		}
	}

	render(width: number): string[] {
		const tasks = this.getTasks();
		// The list is read live, so the cache key has to cover its content too —
		// otherwise a panel left open shows the tasks it started with.
		const key = `${width}:${tasks.map((t) => `${t.id}${t.done ? 1 : 0}${t.priority}${t.text}${t.note ?? ""}`).join("|")}`;
		if (this.cachedLines && this.cachedKey === key) return this.cachedLines;

		const th = this.theme;
		const lines: string[] = [""];
		const title = th.fg("accent", " Tasks ");
		lines.push(truncateToWidth(th.fg("borderMuted", "─".repeat(3)) + title + th.fg("borderMuted", "─".repeat(Math.max(0, width - 10))), width));
		lines.push("");

		if (tasks.length === 0) {
			lines.push(truncateToWidth(`  ${th.fg("dim", "No tasks. Ask the agent to add some.")}`, width));
		} else {
			lines.push(truncateToWidth(`  ${th.fg("muted", counts(tasks))}`, width));
			lines.push("");
			const ordered = sorted(tasks);
			const MAX_ROWS = 20;
			for (const t of ordered.slice(0, MAX_ROWS)) {
				const box = t.done ? th.fg("success", "✓") : th.fg("dim", "○");
				const id = th.fg("accent", `#${t.id}`);
				const prio = t.priority === "high" ? th.fg("warning", "!") : th.fg("dim", MARK[t.priority]);
				const body = t.done ? th.fg("dim", t.text) : th.fg("text", t.text);
				const note = t.note ? th.fg("dim", ` — ${t.note}`) : "";
				lines.push(truncateToWidth(`  ${box} ${id} ${prio} ${body}${note}`, width));
			}
			if (ordered.length > MAX_ROWS) {
				lines.push(truncateToWidth(`  ${th.fg("dim", `… ${ordered.length - MAX_ROWS} more (ask for the list in chat)`)}`, width));
			}
		}

		lines.push("");
		lines.push(truncateToWidth(`  ${th.fg("dim", "r refresh · Escape close")}`, width));
		lines.push("");
		this.cachedKey = key;
		this.cachedLines = lines;
		return lines;
	}

	invalidate(): void {
		this.cachedKey = undefined;
		this.cachedLines = undefined;
	}
}

// ── Extension ───────────────────────────────────────────────────────────

export default function tasktracker(pi: ExtensionAPI) {
	let tasks: Task[] = [];
	let nextId = 1;
	let persisted = false;

	// Rebuild from the current branch: last snapshot wins; the persisted file
	// seeds a session that has no task history yet.
	const reconstruct = (ctx: ExtensionContext) => {
		tasks = [];
		nextId = 1;
		persisted = false;
		for (const entry of ctx.sessionManager.getBranch()) {
			if (entry.type !== "message") continue;
			const msg = entry.message;
			if (msg.role !== "toolResult" || msg.toolName !== "task") continue;
			const details = msg.details as TaskDetails | undefined;
			if (!details) continue;
			// Clone: this array lives in the session history. Aliasing it would let
			// later pushes/toggles rewrite the transcript (and every branch reader).
			tasks = details.tasks.map((t) => ({ ...t }));
			nextId = details.nextId;
			persisted = details.persisted;
		}
		if (tasks.length === 0 && !persisted) {
			const saved = loadPersisted();
			if (saved) {
				tasks = saved.tasks.map((t) => ({ ...t }));
				nextId = saved.nextId;
				persisted = true;
			}
		}
	};

	pi.on("session_start", async (_event, ctx) => reconstruct(ctx));
	pi.on("session_tree", async (_event, ctx) => reconstruct(ctx));

	pi.registerTool({
		name: "task",
		label: "Task",
		description:
			"Manage a task list. Actions: add (text, priority), list, done (id), reopen (id), remove (id), edit (id, text, priority, note), clear, persist (true|false). Use for multi-step work: add the steps, then mark them done as you go.",
		promptSnippet: "task: task list (add/list/done/edit/clear) for multi-step work",
		promptGuidelines: [
			"For work with three or more steps, add the steps with `task` before starting and mark each done as it completes.",
			"Keep task text short and action-shaped; put detail in `note` via edit.",
			"Use persist: true when the list should survive into a new session.",
		],
		parameters: TaskParams,

		async execute(_toolCallId, params) {
			switch (params.action) {
				case "list":
					return {
						content: [
							{
								type: "text" as const,
								text: tasks.length
									? `${counts(tasks)}${persisted ? " (persisted)" : ""}\n${renderList(tasks)}`
									: "No tasks",
							},
						],
						details: { action: "list", tasks: [...tasks], nextId, persisted } as TaskDetails,
					};

				case "add": {
					if (!params.text?.trim()) return errText("text required for add", tasks, nextId, persisted, "add");
					const task: Task = {
						id: nextId++,
						text: params.text.trim(),
						done: false,
						priority: (params.priority as Priority) ?? "normal",
					};
					tasks.push(task);
					if (persisted && !savePersisted(tasks, nextId)) {
						return okText(`Added #${task.id}: ${task.text} (but saving tasks.json failed)`, tasks, nextId, persisted);
					}
					return okText(`Added #${task.id}: ${task.text}`, tasks, nextId, persisted);
				}

				case "done":
				case "reopen": {
					if (params.id === undefined) return errText(`id required for ${params.action}`, tasks, nextId, persisted, params.action);
					const task = tasks.find((t) => t.id === params.id);
					if (!task) return errText(`#${params.id} not found`, tasks, nextId, persisted, params.action);
					task.done = params.action === "done";
					if (persisted) savePersisted(tasks, nextId);
					return okText(`#${task.id} ${task.done ? "done" : "reopened"}: ${task.text}`, tasks, nextId, persisted);
				}

				case "remove": {
					if (params.id === undefined) return errText("id required for remove", tasks, nextId, persisted, "remove");
					const before = tasks.length;
					tasks = tasks.filter((t) => t.id !== params.id);
					if (tasks.length === before) return errText(`#${params.id} not found`, tasks, nextId, persisted, "remove");
					if (persisted) savePersisted(tasks, nextId);
					return okText(`Removed #${params.id}`, tasks, nextId, persisted);
				}

				case "edit": {
					if (params.id === undefined) return errText("id required for edit", tasks, nextId, persisted, "edit");
					const task = tasks.find((t) => t.id === params.id);
					if (!task) return errText(`#${params.id} not found`, tasks, nextId, persisted, "edit");
					if (params.text !== undefined) task.text = params.text.trim();
					if (params.priority !== undefined) task.priority = params.priority as Priority;
					if (params.note !== undefined) task.note = params.note.trim() || undefined;
					if (persisted) savePersisted(tasks, nextId);
					return okText(`Edited #${task.id}`, tasks, nextId, persisted);
				}

				case "clear": {
					const n = tasks.length;
					tasks = [];
					nextId = 1;
					if (persisted) clearPersisted();
					return okText(`Cleared ${n} task${n === 1 ? "" : "s"}`, tasks, nextId, persisted);
				}

				case "persist": {
					persisted = params.persist ?? true;
					if (!persisted) {
						clearPersisted();
						return okText("Stopped persisting (tasks.json removed)", tasks, nextId, persisted);
					}
					if (tasks.length === 0) {
						const saved = loadPersisted();
						if (saved) {
							tasks = saved.tasks.map((t) => ({ ...t }));
							nextId = saved.nextId;
							return okText(`Loaded ${tasks.length} task(s) from tasks.json`, tasks, nextId, persisted);
						}
					}
					return savePersisted(tasks, nextId)
						? okText(`Persisting ${tasks.length} task(s) to tasks.json`, tasks, nextId, persisted)
						: errText("could not write tasks.json", tasks, nextId, persisted, "persist");
				}

				default:
					return errText(`unknown action: ${params.action}`, tasks, nextId, persisted, "list");
			}
		},

		renderCall(args, theme) {
			let text = theme.fg("toolTitle", theme.bold("task ")) + theme.fg("muted", args.action);
			if (args.id !== undefined) text += " " + theme.fg("accent", `#${args.id}`);
			if (args.text) text += " " + theme.fg("dim", `"${args.text}"`);
			if (args.priority) text += " " + theme.fg("dim", `[${args.priority}]`);
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded }, theme) {
			const details = result.details as TaskDetails | undefined;
			if (!details) {
				const first = result.content[0];
				return new Text(first?.type === "text" ? first.text : "", 0, 0);
			}
			if (details.error) return new Text(theme.fg("error", `Error: ${details.error}`), 0, 0);

			const list = details.tasks;
			switch (details.action) {
				case "list": {
					if (list.length === 0) return new Text(theme.fg("dim", "No tasks"), 0, 0);
					const shown = expanded ? sorted(list) : sorted(list).slice(0, 6);
					const lines = shown.map((t) => {
						const box = t.done ? theme.fg("success", "✓") : theme.fg("dim", "○");
						const body = t.done ? theme.fg("dim", t.text) : theme.fg("muted", t.text);
						return `${box} ${theme.fg("accent", `#${t.id}`)} ${body}`;
					});
					if (!expanded && list.length > shown.length) {
						lines.push(theme.fg("dim", `… ${list.length - shown.length} more`));
					}
					return new Text(`${theme.fg("muted", counts(list))}\n${lines.join("\n")}`, 0, 0);
				}
				default: {
					const first = result.content[0];
					const msg = first?.type === "text" ? first.text : "";
					return new Text(theme.fg("success", "✓ ") + theme.fg("muted", msg), 0, 0);
				}
			}
		},
	});

	pi.registerCommand("tasks", {
		description: "Show the task list for the current branch",
		handler: async (_args, ctx) => {
			// Rebuild from the branch first: it is the source of truth, and the
			// in-memory copy can be behind after a rewind or a tool result the
			// extension never saw.
			reconstruct(ctx);
			if (ctx.mode !== "tui") {
				ctx.ui.notify(renderList(tasks), "info");
				return;
			}
			await ctx.ui.custom<void>((tui, theme, _kb, done) =>
				new TaskPanel({
					getTasks: () => tasks,
					theme,
					onClose: () => done(),
					onRefresh: () => reconstruct(ctx),
					requestRender: () => tui.requestRender(),
				}),
			);
		},
	});
}
