/**
 * UI Extensions — Status line, footer, and other visual helpers.
 *
 * Add more UI extensions here by importing and calling them.
 */
import statusLine from "./status-line/index.ts";

export default function (pi: any) {
  statusLine(pi);
}
