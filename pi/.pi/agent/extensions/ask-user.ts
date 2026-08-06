/**
 * ask_user — Lets the model ask the user a single multiple-choice question.
 *
 * - 2 to 5 model-provided options, plus an always-present "Write my own answer…"
 * - Arrow keys (↑↓) or j/k to navigate, Enter to confirm
 * - "Write my own answer…" opens an inline editor (Esc returns to options)
 * - Esc on the options dismisses the question
 *
 * Install: copy to ~/.pi/agent/extensions/ask-user.ts, then /reload.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  Editor,
  type EditorTheme,
  Key,
  matchesKey,
  Text,
  visibleWidth,
  wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import { Type } from "@earendil-works/pi-ai";

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 5;

interface OptionWithDesc {
  label: string;
  description?: string;
}

type DisplayOption = OptionWithDesc & { isOther?: boolean };

interface AskUserDetails {
  question: string;
  options: string[];
  answer: string | null;
  wasCustom: boolean;
  cancelled: boolean;
}

const OptionSchema = Type.Object({
  label: Type.String({
    description: "Short display label for this option",
  }),
  description: Type.Optional(
    Type.String({
      description: "Optional one-line description shown below the label",
    }),
  ),
});

const AskUserParams = Type.Object({
  question: Type.String({
    description: "The question to ask the user",
  }),
  options: Type.Array(OptionSchema, {
    minItems: MIN_OPTIONS,
    maxItems: MAX_OPTIONS,
    description: `Between ${MIN_OPTIONS} and ${MAX_OPTIONS} answer options. A free-form 'write my own answer' option is always appended automatically — never include one yourself.`,
  }),
});

function buildResultMessage(
  outcome:
    | { kind: "no-ui" }
    | { kind: "cancelled" }
    | { kind: "dismissed" }
    | { kind: "custom"; answer: string }
    | { kind: "selected"; answer: string; index: number },
) {
  switch (outcome.kind) {
    case "no-ui":
      return "No interactive UI is available, so the question could not be shown. Ask the user in plain text instead.";
    case "cancelled":
      return "Cancelled";
    case "dismissed":
      return "User dismissed the question without answering. Do not assume an answer; proceed accordingly or ask differently.";
    case "custom":
      return `User wrote their own answer: ${outcome.answer}`;
    case "selected":
      return `User selected option ${outcome.index}: ${outcome.answer}`;
  }
}

export default function askUser(pi: ExtensionAPI) {
  pi.registerTool({
    name: "ask_user",
    label: "Ask User",
    description:
      "Ask the user a single multiple-choice question (2-5 options). A free-form 'write my own answer' option is always added automatically, and the user may dismiss the question without answering. Ask exactly one question per call.",
    promptSnippet:
      "Ask the user a multiple-choice question (2-5 options plus a free-form answer)",
    promptGuidelines: [
      "When asking the user a question whose likely answers can be enumerated, use the ask_user tool instead of asking in plain text.",
      "Ask one question per ask_user call; ask follow-up questions in subsequent calls.",
    ],
    parameters: AskUserParams,
    executionMode: "sequential",

    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      if (ctx.mode !== "tui") {
        return {
          content: [
            { type: "text", text: buildResultMessage({ kind: "no-ui" }) },
          ],
          details: {
            question: params.question,
            options: params.options.map((o: OptionWithDesc) => o.label),
            answer: null,
            wasCustom: false,
            cancelled: false,
          } satisfies AskUserDetails,
        };
      }

      if (
        params.options.length < MIN_OPTIONS ||
        params.options.length > MAX_OPTIONS
      ) {
        throw new Error(
          `ask_user requires between ${MIN_OPTIONS} and ${MAX_OPTIONS} options (got ${params.options.length}). Retry with a valid number of options.`,
        );
      }

      if (signal?.aborted) {
        return {
          content: [
            {
              type: "text",
              text: buildResultMessage({ kind: "cancelled" }),
            },
          ],
          details: {
            question: params.question,
            options: params.options.map((o: OptionWithDesc) => o.label),
            answer: null,
            wasCustom: false,
            cancelled: true,
          } satisfies AskUserDetails,
        };
      }

      const allOptions: DisplayOption[] = [
        ...params.options,
        { label: "Write my own answer…", isOther: true },
      ];

      const result = await ctx.ui.custom<{
        answer: string;
        wasCustom: boolean;
        index?: number;
      } | null>((tui, theme, _kb, done) => {
        let optionIndex = 0;
        let editMode = false;
        let cachedLines: string[] | undefined;

        const editorTheme: EditorTheme = {
          borderColor: (s: string) => theme.fg("accent", s),
          selectList: {
            selectedPrefix: (t: string) => theme.fg("accent", t),
            selectedText: (t: string) => theme.fg("accent", t),
            description: (t: string) => theme.fg("muted", t),
            scrollInfo: (t: string) => theme.fg("dim", t),
            noMatch: (t: string) => theme.fg("warning", t),
          },
        };
        const editor = new Editor(tui, editorTheme);

        editor.onSubmit = (value: string) => {
          const trimmed = value.trim();
          if (trimmed) {
            done({ answer: trimmed, wasCustom: true });
          } else {
            editMode = false;
            editor.setText("");
            refresh();
          }
        };

        function refresh() {
          cachedLines = undefined;
          tui.requestRender();
        }

        function handleInput(data: string) {
          if (editMode) {
            if (matchesKey(data, Key.escape)) {
              editMode = false;
              editor.setText("");
              refresh();
              return;
            }
            editor.handleInput(data);
            refresh();
            return;
          }

          if (matchesKey(data, Key.up) || matchesKey(data, "k")) {
            optionIndex = Math.max(0, optionIndex - 1);
            refresh();
            return;
          }
          if (matchesKey(data, Key.down) || matchesKey(data, "j")) {
            optionIndex = Math.min(allOptions.length - 1, optionIndex + 1);
            refresh();
            return;
          }

          if (matchesKey(data, Key.enter)) {
            const selected = allOptions[optionIndex];
            if (selected?.isOther) {
              editMode = true;
              refresh();
            } else if (selected) {
              done({
                answer: selected.label,
                wasCustom: false,
                index: optionIndex + 1,
              });
            }
            return;
          }

          if (matchesKey(data, Key.escape)) {
            done(null);
          }
        }

        function render(width: number): string[] {
          if (cachedLines) return cachedLines;

          const lines: string[] = [];
          const renderWidth = Math.max(1, width);

          function addWrapped(text: string) {
            lines.push(...wrapTextWithAnsi(text, renderWidth));
          }

          function addWrappedWithPrefix(prefix: string, text: string) {
            const prefixWidth = visibleWidth(prefix);
            if (prefixWidth >= renderWidth) {
              addWrapped(prefix + text);
              return;
            }
            const wrapped = wrapTextWithAnsi(
              text,
              renderWidth - prefixWidth,
            );
            const continuationPrefix = " ".repeat(prefixWidth);
            for (let i = 0; i < wrapped.length; i++) {
              lines.push(
                `${i === 0 ? prefix : continuationPrefix}${wrapped[i]}`,
              );
            }
          }

          lines.push(theme.fg("accent", "─".repeat(renderWidth)));
          addWrappedWithPrefix(
            " ",
            theme.fg("text", params.question),
          );
          lines.push("");

          for (let i = 0; i < allOptions.length; i++) {
            const opt = allOptions[i]!;
            const selected = i === optionIndex;
            const isOther = opt.isOther === true;
            const num = `${i + 1}.`;
            const label = `${num} ${opt.label}${isOther && editMode ? " ✎" : ""}`;
            const color =
              selected || (isOther && editMode) ? "accent" : "text";

            const prefix = selected
              ? theme.fg("accent", "▶ ")
              : "  ";
            addWrappedWithPrefix(prefix, theme.fg(color, label));

            if (isOther && selected && !editMode) {
              addWrappedWithPrefix(
                "     ",
                theme.fg("dim", "(press Enter to type your own answer)"),
              );
            }
            if (opt.description) {
              addWrappedWithPrefix(
                "     ",
                theme.fg("muted", opt.description),
              );
            }
          }

          if (editMode) {
            lines.push("");
            addWrappedWithPrefix(
              " ",
              theme.fg("muted", "Your answer:"),
            );
            for (const line of editor.render(
              Math.max(1, renderWidth - 2),
            )) {
              lines.push(` ${line}`);
            }
          }

          lines.push("");
          if (editMode) {
            addWrappedWithPrefix(
              " ",
              theme.fg("dim", "Enter to submit · Esc to go back"),
            );
          } else {
            addWrappedWithPrefix(
              " ",
              theme.fg(
                "dim",
                "↑↓/jk navigate · Enter to select · Esc to dismiss",
              ),
            );
          }
          lines.push(theme.fg("accent", "─".repeat(renderWidth)));

          cachedLines = lines;
          return lines;
        }

        return {
          render,
          handleInput,
          invalidate: () => {
            cachedLines = undefined;
          },
        };
      });

      if (!result) {
        return {
          content: [
            {
              type: "text",
              text: buildResultMessage({ kind: "dismissed" }),
            },
          ],
          details: {
            question: params.question,
            options: params.options.map((o: OptionWithDesc) => o.label),
            answer: null,
            wasCustom: false,
            cancelled: false,
          } satisfies AskUserDetails,
        };
      }

      return {
        content: [
          {
            type: "text",
            text: buildResultMessage(
              result.wasCustom
                ? { kind: "custom", answer: result.answer }
                : {
                    kind: "selected",
                    answer: result.answer,
                    index: result.index ?? -1,
                  },
            ),
          },
        ],
        details: {
          question: params.question,
          options: params.options.map((o: OptionWithDesc) => o.label),
          answer: result.answer,
          wasCustom: result.wasCustom,
          cancelled: false,
        } satisfies AskUserDetails,
      };
    },

    renderCall(args, theme, _context) {
      let text =
        theme.fg("toolTitle", theme.bold("ask_user ")) +
        theme.fg("muted", args.question);
      const opts = Array.isArray(args.options) ? args.options : [];
      if (opts.length) {
        const labels = [
          ...opts.map((o: OptionWithDesc) => o.label),
          "Write my own answer…",
        ];
        const numbered = labels.map((l, i) => `${i + 1}. ${l}`);
        text +=
          "\n" + theme.fg("dim", `  Options: ${numbered.join(", ")}`);
      }
      return new Text(text, 0, 0);
    },

    renderResult(result, _options, theme, _context) {
      const details = result.details as AskUserDetails | undefined;
      if (!details) {
        const text = result.content[0];
        return new Text(
          text?.type === "text" ? text.text : "",
          0,
          0,
        );
      }

      if (details.cancelled) {
        return new Text(theme.fg("warning", "Cancelled"), 0, 0);
      }
      if (details.answer === null) {
        return new Text(theme.fg("warning", "Dismissed"), 0, 0);
      }
      if (details.wasCustom) {
        return new Text(
          theme.fg("success", "✓ ") +
            theme.fg("muted", "(wrote) ") +
            theme.fg("accent", details.answer),
          0,
          0,
        );
      }

      const idx = details.options.indexOf(details.answer) + 1;
      const display = idx > 0 ? `${idx}. ${details.answer}` : details.answer;
      return new Text(
        theme.fg("success", "✓ ") + theme.fg("accent", display),
        0,
        0,
      );
    },
  });
}
