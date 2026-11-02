/**
 * Quality Gate Extension
 *
 * Checks for common issues in git diffs after agent operations:
 * - .only in tests
 * - debugger statements
 * - @ts-ignore (should use @ts-expect-error)
 * - console.log left in code
 *
 * Only runs the diff when an edit/write actually happened this turn.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { execSync } from "node:child_process";
import { piEnv } from "../../lib/shared.js";

const EDIT_TOOLS = new Set(["edit", "write"]);

export default function (pi: ExtensionAPI) {
  let editedThisTurn = false;

  // Count the edit only when it succeeded, so a blocked or failed edit does not
  // turn the gate on.
  pi.on("tool_result", async (event) => {
    if (EDIT_TOOLS.has(event.toolName) && !(event as { isError?: boolean }).isError) {
      editedThisTurn = true;
    }
  });

  pi.on("agent_end", async (_event, ctx) => {
    if (!editedThisTurn) return;
    editedThisTurn = false;

    try {
      const diff = execSync(
        "git diff --unified=0 --no-color HEAD 2>/dev/null || echo ''",
        // Diff the session's directory, not wherever the pi process started.
        { cwd: ctx.cwd, encoding: "utf8", timeout: 3000, stdio: ["ignore", "pipe", "pipe"], env: piEnv() }
      );

      if (!diff.trim()) return;

      const hits: string[] = [];

      // Added lines only: removing a `.only`/`debugger` must not be flagged.
      if (/^\+(?!\+\+).*\b(it|describe|test|context)\.only\b/m.test(diff))
        hits.push(".only in tests");
      if (/^\+(?!\+\+).*\bdebugger\b/m.test(diff))
        hits.push("debugger statement");
      if (/^\+.*@ts-ignore\b/m.test(diff))
        hits.push("@ts-ignore (use @ts-expect-error instead)");
      if (/^\+.*console\.(log|debug|dir|trace)/m.test(diff))
        hits.push("console.log left in");

      if (hits.length) {
        await ctx.ui.notify(`⚠️ ${hits.join(", ")}`, "warning");
      }
    } catch {
      // not a git repo or unavailable
    }
  });
}
