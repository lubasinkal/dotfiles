/**
 * file-search — first-class `fd` and `rg` tools for pi.
 *
 * Registers two tools:
 *   fd — find files/directories by name with fd (fast, gitignore-aware)
 *   rg — search file contents with ripgrep (regex content search)
 *
 * Uses system `fd`/`rg` binaries from PATH. If not installed, tools
 * report a clear error. Output is truncated to 2000 lines/50KB with
 * full output saved to a temp file when cut off.
 *
 * Install: copy to ~/.pi/agent/extensions/file-search.ts, then /reload.
 */

import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { Type } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

const execFileAsync = promisify(execFile);

// ── Limits ──────────────────────────────────────────────────────────────

const FD_MAX_RESULTS = 10_000;
const FD_DEFAULT_LIMIT = 1000;
const FD_MAX_DEPTH = 64;

const RG_MAX_COUNT = 1000;
const RG_DEFAULT_LIMIT = 100;
const RG_MAX_CONTEXT = 20;

const MAX_OUTPUT_BYTES = 50_000; // ~50KB
const MAX_OUTPUT_LINES = 2000;
const EXEC_TIMEOUT_MS = 60_000;
const STDERR_MAX_BYTES = 64 * 1024;

// ── Output helpers ──────────────────────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

interface FormattedOutput {
  text: string;
  lineCount: number;
  truncated: boolean;
  fullOutputPath?: string;
}

function formatOutput(raw: string): FormattedOutput {
  const trimmed = raw.replace(/\n+$/, "");
  const lines = trimmed === "" ? [] : trimmed.split("\n");
  const lineCount = lines.length;
  const totalBytes = Buffer.byteLength(trimmed);

  // Check if we need to truncate
  if (lineCount <= MAX_OUTPUT_LINES && totalBytes <= MAX_OUTPUT_BYTES) {
    return { text: trimmed || "(no output)", lineCount, truncated: false };
  }

  // Truncate to limits
  let kept = lines.slice(0, MAX_OUTPUT_LINES);
  let keptBytes = Buffer.byteLength(kept.join("\n"));

  // If still over byte limit, trim lines further
  while (keptBytes > MAX_OUTPUT_BYTES && kept.length > 1) {
    kept = kept.slice(0, -1);
    keptBytes = Buffer.byteLength(kept.join("\n"));
  }

  const content = kept.join("\n");
  const notice =
    `\n\n[Output truncated: ${kept.length} of ${lineCount} lines ` +
    `(${formatSize(keptBytes)} of ${formatSize(totalBytes)}). ` +
    `Full output saved to temp file.]`;

  return {
    text: content + notice,
    lineCount,
    truncated: true,
  };
}

async function persistFullOutput(raw: string, prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  const path = join(dir, "output.txt");
  await writeFile(path, raw, "utf8");
  return path;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.floor(v)));
}

// ── fd ──────────────────────────────────────────────────────────────────

const FD_TYPE_MAP: Record<string, string> = {
  file: "f",
  directory: "d",
  symlink: "l",
};

function buildFdArgs(params: Record<string, unknown>): string[] {
  const args = ["--color=never"];
  if (params.hidden) args.push("--hidden");
  if (params.glob) args.push("--glob");
  if (params.type && typeof params.type === "string") {
    const flag = FD_TYPE_MAP[params.type];
    if (flag) args.push("--type", flag);
  }
  if (params.extension && typeof params.extension === "string") {
    args.push("--extension", params.extension.replace(/^\.+/, ""));
  }
  if (params.max_depth !== undefined && typeof params.max_depth === "number") {
    args.push("--max-depth", String(clamp(params.max_depth, 1, FD_MAX_DEPTH)));
  }
  args.push(
    "--max-results",
    String(
      clamp(
        typeof params.limit === "number" ? params.limit : FD_DEFAULT_LIMIT,
        1,
        FD_MAX_RESULTS,
      ),
    ),
  );
  // pattern
  args.push(
    "--",
    typeof params.pattern === "string" ? params.pattern : "",
  );
  // path
  if (params.path && typeof params.path === "string") {
    args.push(params.path);
  }
  return args;
}

// ── rg ──────────────────────────────────────────────────────────────────

function buildRgArgs(params: Record<string, unknown>): string[] {
  const args = [
    "--line-number",
    "--color=never",
    "--no-heading",
    "--with-filename",
  ];
  if (params.case_sensitive === true) args.push("--case-sensitive");
  else if (params.case_sensitive === false) args.push("--ignore-case");
  else args.push("--smart-case");
  if (params.fixed_strings) args.push("--fixed-strings");
  if (params.hidden) args.push("--hidden");
  if (
    params.context !== undefined &&
    typeof params.context === "number"
  ) {
    args.push(
      "--context",
      String(clamp(params.context, 0, RG_MAX_CONTEXT)),
    );
  }
  if (params.glob && typeof params.glob === "string") {
    args.push("--glob", params.glob);
  }
  if (params.file_type && typeof params.file_type === "string") {
    args.push("--type", params.file_type);
  }
  args.push(
    "--max-count",
    String(
      clamp(
        typeof params.limit === "number" ? params.limit : RG_DEFAULT_LIMIT,
        1,
        RG_MAX_COUNT,
      ),
    ),
  );
  // pattern (required)
  args.push("--", String(params.pattern ?? ""));
  // path
  if (params.path && typeof params.path === "string") {
    args.push(params.path);
  }
  return args;
}

// ── Execute helper ──────────────────────────────────────────────────────

async function runTool(
  command: string,
  args: string[],
  cwd: string,
  tempPrefix: string,
): Promise<FormattedOutput> {
  let stdout = "";
  let stderr = "";

  try {
    const result = await execFileAsync(command, args, {
      cwd,
      timeout: EXEC_TIMEOUT_MS,
      maxBuffer: 10 * 1024 * 1024, // 10MB
      encoding: "utf8",
    });
    stdout = result.stdout;
    stderr = result.stderr;
  } catch (err: unknown) {
    const execErr = err as NodeJS.ErrnoException & {
      stdout?: string;
      stderr?: string;
    };
    if (execErr.stdout) stdout = execErr.stdout;
    if (execErr.stderr) stderr = execErr.stderr;

    if (execErr.code === "ENOENT") {
      return {
        text: `Error: \`${command}\` not found on PATH. Install it (e.g. \`brew install fd ripgrep\` or \`apt install fd-find ripgrep\`) and try again.`,
        lineCount: 0,
        truncated: false,
      };
    }
  }

  const output = formatOutput(stdout);

  // Persist full output to temp file if truncated
  if (output.truncated) {
    try {
      output.fullOutputPath = await persistFullOutput(stdout, tempPrefix);
      output.text = output.text.replace(
        "Full output saved to temp file.",
        `Full output saved to: ${output.fullOutputPath}`,
      );
    } catch {
      // Non-fatal: temp file creation failed, just return truncated output
    }
  }

  // Include non-empty stderr as a trailing note
  if (stderr && stderr.trim()) {
    const maxStderr = stderr.slice(0, STDERR_MAX_BYTES);
    output.text += `\n\n[stderr: ${maxStderr}]`;
  }

  return output;
}

// ── Extension ───────────────────────────────────────────────────────────

export default function fileSearch(pi: ExtensionAPI) {
  // ── fd tool ──────────────────────────────────────────────────────────

  pi.registerTool({
    name: "fd",
    label: "Find Files",
    description:
      "Find files and directories by name with fd. Respects .gitignore by default. Results are limited to 1000 entries unless a higher limit is given; output is limited to 2000 lines or 50KB, and complete truncated output is saved to a temporary file.",
    promptSnippet:
      "Find files and directories by name with fd (fast, gitignore-aware).",
    promptGuidelines: [
      "Use fd as the primary tool for discovering files and directories by name, extension, or glob instead of bash with find or ls -R.",
      "Use rg instead of fd when searching file contents rather than file names.",
      "Keep using bash for complex multi-step workflows that pipe or post-process file listings.",
    ],
    parameters: Type.Object({
      pattern: Type.Optional(
        Type.String({
          description:
            "Regex matched against file names (or a glob when glob is true). Omit to list everything under path.",
        }),
      ),
      path: Type.Optional(
        Type.String({
          description:
            "Directory to search. Defaults to the current working directory.",
        }),
      ),
      type: Type.Optional(
        Type.String({
          description:
            "Only return entries of this type: file, directory, or symlink.",
        }),
      ),
      extension: Type.Optional(
        Type.String({
          description:
            "Only return files with this extension, e.g. 'ts' or 'md'.",
        }),
      ),
      glob: Type.Optional(
        Type.Boolean({
          description:
            "Treat pattern as a glob (e.g. '*.test.ts') instead of a regex.",
        }),
      ),
      hidden: Type.Optional(
        Type.Boolean({
          description:
            "Include hidden files and directories. Defaults to false.",
        }),
      ),
      max_depth: Type.Optional(
        Type.Number({
          description: "Maximum directory depth to descend (1-64).",
        }),
      ),
      limit: Type.Optional(
        Type.Number({
          description:
            "Maximum number of results (1-10000). Defaults to 1000.",
        }),
      ),
    }),
    executionMode: "sequential",

    async execute(_id, params, signal, _onUpdate, ctx) {
      if (signal?.aborted) {
        return {
          content: [{ type: "text", text: "fd search cancelled." }],
          details: {},
        };
      }

      const args = buildFdArgs(params as Record<string, unknown>);
      const output = await runTool("fd", args, ctx.cwd, "pi-fd-");

      return {
        content: [{ type: "text", text: output.text }],
        details: {
          matchCount: output.lineCount,
          truncated: output.truncated,
          fullOutputPath: output.fullOutputPath,
        },
      };
    },

    renderCall(args, theme, _context) {
      const pattern = args.pattern ? `"${args.pattern}"` : "(all)";
      const path = args.path ? ` in ${args.path}` : "";
      let text =
        theme.fg("toolTitle", theme.bold("fd ")) +
        theme.fg("muted", `${pattern}${path}`);
      if (args.type) text += theme.fg("dim", ` [${args.type}]`);
      if (args.extension) text += theme.fg("dim", ` .${args.extension}`);
      return new Text(text, 0, 0);
    },

    renderResult(result, _options, theme, _context) {
      const details = result.details as {
        matchCount?: number;
        truncated?: boolean;
      };
      const count =
        details?.matchCount !== undefined ? `${details.matchCount}` : "?";
      const suffix = details?.truncated ? " (truncated)" : "";
      return new Text(
        theme.fg("success", `${count} results`) +
          theme.fg("dim", suffix),
        0,
        0,
      );
    },
  });

  // ── rg tool ──────────────────────────────────────────────────────────

  pi.registerTool({
    name: "rg",
    label: "Search Content",
    description:
      "Search file contents with ripgrep. Uses smart-case matching, respects .gitignore by default, and returns at most 100 matches per file unless a different limit is given. Output is limited to 2000 lines or 50KB; complete truncated output is saved to a temporary file.",
    promptSnippet:
      "Search file contents with ripgrep (fast regex content search).",
    promptGuidelines: [
      "Use rg as the primary tool for searching file contents instead of bash with grep.",
      "Use fd instead of rg when looking for files by name rather than content.",
      "Set fixed_strings on rg when searching for literal code snippets containing regex metacharacters.",
      "Use snippet for code discovery when you only need match-centered one-liners; use rg when you need full context, glob filtering, or file type filtering.",
      "Keep using bash for complex multi-step workflows that combine searching with other commands.",
    ],
    parameters: Type.Object({
      pattern: Type.String({
        description:
          "Regex to search for (literal text when fixed_strings is true).",
      }),
      path: Type.Optional(
        Type.String({
          description:
            "File or directory to search. Defaults to the current working directory.",
        }),
      ),
      glob: Type.Optional(
        Type.String({
          description:
            "Only search files matching this glob, e.g. '*.ts' or 'src/**'.",
        }),
      ),
      file_type: Type.Optional(
        Type.String({
          description:
            "Only search files of this ripgrep type, e.g. 'ts', 'js', 'py', 'rust'.",
        }),
      ),
      case_sensitive: Type.Optional(
        Type.Boolean({
          description:
            "true forces case-sensitive matching, false forces case-insensitive. Defaults to smart-case.",
        }),
      ),
      fixed_strings: Type.Optional(
        Type.Boolean({
          description:
            "Treat pattern as a literal string instead of a regex.",
        }),
      ),
      hidden: Type.Optional(
        Type.Boolean({
          description:
            "Search hidden files and directories. Defaults to false.",
        }),
      ),
      context: Type.Optional(
        Type.Number({
          description: "Lines of context to show around each match (0-20).",
        }),
      ),
      limit: Type.Optional(
        Type.Number({
          description: "Maximum matches per file (1-1000). Defaults to 100.",
        }),
      ),
    }),
    executionMode: "sequential",

    async execute(_id, params, signal, _onUpdate, ctx) {
      if (signal?.aborted) {
        return {
          content: [{ type: "text", text: "rg search cancelled." }],
          details: {},
        };
      }

      const args = buildRgArgs(params as Record<string, unknown>);
      const output = await runTool("rg", args, ctx.cwd, "pi-rg-");

      return {
        content: [{ type: "text", text: output.text }],
        details: {
          outputLines: output.lineCount,
          truncated: output.truncated,
          fullOutputPath: output.fullOutputPath,
        },
      };
    },

    renderCall(args, theme, _context) {
      const pattern =
        typeof args.pattern === "string" ? args.pattern : "";
      const path = args.path ? ` in ${args.path}` : "";
      let text =
        theme.fg("toolTitle", theme.bold("rg ")) +
        theme.fg("muted", `"${pattern.slice(0, 60)}"${path}`);
      if (args.glob) text += theme.fg("dim", ` [${args.glob}]`);
      return new Text(text, 0, 0);
    },

    renderResult(result, _options, theme, _context) {
      const details = result.details as {
        outputLines?: number;
        truncated?: boolean;
      };
      const lines =
        details?.outputLines !== undefined
          ? `${details.outputLines} lines`
          : "?";
      const suffix = details?.truncated ? " (truncated)" : "";
      return new Text(
        theme.fg("success", lines) + theme.fg("dim", suffix),
        0,
        0,
      );
    },
  });
}
