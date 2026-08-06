/**
 * Quality Gate Extension
 *
 * Checks for common issues in git diffs after agent operations:
 * - .only in tests
 * - debugger statements
 * - @ts-ignore (should use @ts-expect-error)
 * - console.log left in code
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { execSync } from "node:child_process";

export default function (pi: ExtensionAPI) {
  pi.on("agent_end", async (_event, ctx) => {
    try {
      const diff = execSync(
        "git diff --unified=0 --no-color HEAD 2>/dev/null || echo ''",
        { encoding: "utf8", timeout: 3000, stdio: ["ignore", "pipe", "pipe"] }
      );

      if (!diff.trim()) return;

      const hits: string[] = [];

      if (/\b(it|describe|test|context)\.only\b/.test(diff))
        hits.push(".only in tests");
      if (/\bdebugger\b/.test(diff))
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
