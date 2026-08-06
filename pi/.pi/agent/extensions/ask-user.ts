/**
 * ask_user — Lets the model ask the user a single multiple-choice question.
 *
 * - 2 to 5 model-provided options, plus an always-present "Write my own answer…"
 * - Arrow keys or number keys to pick, Enter to confirm
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
    | { kind: "selected"; answer: string; index: number | undefined },
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
        let settled = false;
        const uiSignal = new AbortController();

        function finish(value: {
          answer: string;
          wasCustom: boolean;
          index?: number;
        } | null) {
          if (settled) return;
          settled = true;
          uiSignal.abort();
          done(value);
        }

        const cancel = () => finish(null);
        signal?.addEventListener("abort", cancel, { once: true });

        let editor: Editor | undefined;
        let optionsContainer: { remove: () => void } | undefined;

        const q = params.question;
        const wrappedQuestion = wrapTextWithAnsi(
          theme.fg("accent", q),
          tui.width - 4,
        );

        function showOptions() {
          editMode = false;
          editor?.remove();
          editor = undefined;

          const comp = tui.addChild(
            new (class {
              remove() {
                tui.removeChild(this as any);
              }
              render() {
                let out = "";
                out += wrappedQuestion.join("\n") + "\n\n";
                for (let i = 0; i < allOptions.length; i++) {
                  const opt = allOptions[i]!;
                  const isSelected = i === optionIndex;
                  const prefix = isSelected
                    ? theme.fg("accent", "▶")
                    : " ";
                  const num = theme.fg("dim", `${i + 1}.`);
                  const label = isSelected
                    ? theme.fg("accent", theme.bold(opt.label))
                    : theme.fg("muted", opt.label);

                  out += `${prefix} ${num} ${label}`;
                  if (opt.description) {
                    out += `\n    ${theme.fg("dim", opt.description)}`;
                  }
                  if (opt.isOther && isSelected) {
                    out += `\n    ${theme.fg("dim", "(press Enter to type your own answer)")}`;
                  }
                  out += "\n";
                }
                out += `\n${theme.fg("dim", "↑↓ or 1-" + allOptions.length + " to pick · Enter to confirm · Esc to dismiss")}`;
                return new Text(out, 0, 0);
              }
            })(),
          );
          const remove = () => tui.removeChild(comp as any);
          optionsContainer = { remove };
        }

        function showEditor() {
          editMode = true;
          optionsContainer?.remove();
          optionsContainer = undefined;

          editor = new Editor(tui, theme as EditorTheme);
          editor.placeholder = theme.fg(
            "dim",
            "Type your answer, then press Enter… (Esc to go back)",
          );

          tui.addChild(editor);
          tui.setFocus(editor);

          editor.onSubmit = (text: string) => {
            const trimmed = text.trim();
            if (trimmed) {
              finish({ answer: trimmed, wasCustom: true });
            }
          };
        }

        showOptions();

        tui.addInputListener((data: Uint8Array) => {
          if (settled) return;

          if (editMode) {
            if (matchesKey(data, Key.Escape)) {
              showOptions();
              tui.requestRender();
            }
            return;
          }

          if (matchesKey(data, Key.Escape)) {
            finish(null);
            return;
          }
          if (matchesKey(data, Key.Enter)) {
            const opt = allOptions[optionIndex];
            if (opt?.isOther) {
              showEditor();
              tui.requestRender();
            } else if (opt) {
              finish({
                answer: opt.label,
                wasCustom: false,
                index: optionIndex,
              });
            }
            return;
          }
          if (matchesKey(data, Key.ArrowUp) || matchesKey(data, "k")) {
            optionIndex =
              (optionIndex - 1 + allOptions.length) % allOptions.length;
            tui.requestRender();
            return;
          }
          if (matchesKey(data, Key.ArrowDown) || matchesKey(data, "j")) {
            optionIndex = (optionIndex + 1) % allOptions.length;
            tui.requestRender();
            return;
          }

          // Number keys 1-9 for direct selection
          const str = new TextDecoder().decode(data);
          const num = parseInt(str, 10);
          if (num >= 1 && num <= allOptions.length) {
            const opt = allOptions[num - 1]!;
            if (opt.isOther) {
              showEditor();
              tui.requestRender();
            } else {
              finish({
                answer: opt.label,
                wasCustom: false,
                index: num - 1,
              });
            }
          }
        });

        // Cleanup on external finish
        uiSignal.signal.addEventListener(
          "abort",
          () => {
            editor?.remove();
            optionsContainer?.remove();
          },
          { once: true },
        );
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
                    index: result.index,
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
