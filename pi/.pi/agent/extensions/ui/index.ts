/**
 * UI Extensions — Status line, footer, and other visual helpers.
 *
 * Add more UI extensions here by importing and calling them.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import statusLine from "./status-line/index";

export default function (pi: ExtensionAPI) {
  statusLine(pi);
}
