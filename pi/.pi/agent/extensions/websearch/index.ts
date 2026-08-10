/**
 * Web Search & Page Fetch tool for pi
 *
 * Registers a `websearch` tool with two modes:
 *   - "search": web search results (title, url, snippet)
 *   - "fetch":  fetch a URL and return its text/markdown/html content
 *
 * Backends (first success wins):
 *   1. Tavily  — if TAVILY_API_KEY is set (best quality, needs key)
 *   2. Brave   — if BRAVE_API_KEY is set
 *   3. SearXNG — public JSON instances, or set SEARXNG_URL to your own
 *   4. Hacker News Algolia + DuckDuckGo Instant Answer as keyless fallback
 *
 * Fetch improvements inspired by OpenCode's webfetch.ts:
 *   - TurndownService for proper HTML→markdown conversion
 *   - Format options: markdown (default), text, html
 *   - Content-type validation (rejects images, non-text MIME)
 *   - Configurable timeout
 *   - Cloudflare challenge detection with fallback User-Agent
 *
 * Install: copy to ~/.pi/agent/extensions/ (auto-loaded) or .pi/extensions/
 *          for project scope, or `pi -e ./websearch.ts` for a quick test.
 */

import { Type } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import TurndownService from "turndown";
import { Parser } from "htmlparser2";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const MAX_TEXT = 12_000; // ~3k tokens, plenty for results
const CACHE_TTL = 5 * 60_000;
const DEFAULT_TIMEOUT = 30_000;
const MAX_TIMEOUT = 120_000;
const MAX_FETCH_BYTES = 5 * 1024 * 1024;

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

const cache = new Map<string, { at: number; text: string }>();

function truncate(text: string, max = MAX_TEXT): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + `\n…[truncated ${text.length - max} chars]`;
}

// TurndownService instance for HTML→markdown conversion
const turndown = new TurndownService({
  headingStyle: "atx",
  hr: "---",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  emDelimiter: "*",
});
turndown.remove(["script", "style", "meta", "link", "noscript"]);

/** Convert HTML to markdown using TurndownService */
function htmlToMarkdown(html: string): string {
  return turndown.turndown(html);
}

/** Extract plain text from HTML using htmlparser2 (skips script/style/etc) */
function extractTextFromHTML(html: string): string {
  let text = "";
  let skipDepth = 0;
  const skipTags = ["script", "style", "noscript", "iframe", "object", "embed", "svg"];

  const parser = new Parser({
    onopentag(name) {
      if (skipDepth > 0 || skipTags.includes(name)) skipDepth++;
    },
    ontext(input) {
      if (skipDepth === 0) text += input;
    },
    onclosetag() {
      if (skipDepth > 0) skipDepth--;
    },
  });
  parser.write(html);
  parser.end();
  return text.trim();
}

/** Legacy HTML→text fallback (kept for compatibility) */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<head[\s\S]*?<\/head>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function ok(text: string) {
  return { content: [{ type: "text" as const, text }], details: {} as Record<string, unknown> };
}

function err(text: string) {
  return ok(`websearch error: ${text}`);
}

function formatResults(query: string, results: SearchResult[]): string {
  const lines = [`Web results for "${query}":`, ""];
  results.forEach((r, i) => {
    lines.push(`${i + 1}. ${r.title}`);
    if (r.url) lines.push(`   ${r.url}`);
    if (r.snippet) lines.push(`   ${r.snippet.replace(/\s+/g, " ").trim()}`);
    lines.push("");
  });
  return truncate(lines.join("\n").trim());
}

// Content-type helpers (from OpenCode)
function mimeFrom(contentType: string): string {
  return contentType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function isImageAttachment(mime: string): boolean {
  return mime.startsWith("image/") && mime !== "image/svg+xml";
}

function isTextualMime(mime: string): boolean {
  return (
    !mime ||
    mime.startsWith("text/") ||
    mime === "application/json" ||
    mime.endsWith("+json") ||
    mime === "application/xml" ||
    mime.endsWith("+xml") ||
    mime === "application/javascript"
  );
}

/** Check if response is a Cloudflare challenge */
function isCloudflareChallenge(status: number, headers: Headers): boolean {
  return status === 403 && headers.get("cf-mitigated") === "challenge";
}

/* ---------- search backends ---------- */

async function tavily(query: string, limit: number, signal?: AbortSignal): Promise<SearchResult[] | null> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return null;
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: key, query, max_results: limit, search_depth: "basic" }),
  });
  if (!res.ok) return null;
  const d = await res.json();
  if (Array.isArray(d.results) && d.results.length) {
    return d.results.slice(0, limit).map((r: any) => ({
      title: String(r.title ?? ""),
      url: String(r.url ?? ""),
      snippet: String(r.content ?? ""),
    }));
  }
  return null;
}

async function brave(query: string, limit: number, signal?: AbortSignal): Promise<SearchResult[] | null> {
  const key = process.env.BRAVE_API_KEY;
  if (!key) return null;
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${limit}`;
  const res = await fetch(url, { signal, headers: { "X-Subscription-Token": key, Accept: "application/json" } });
  if (!res.ok) return null;
  const d = await res.json();
  if (d.web?.results?.length) {
    return d.web.results.slice(0, limit).map((r: any) => ({
      title: String(r.title ?? ""),
      url: String(r.url ?? ""),
      snippet: String(r.description ?? ""),
    }));
  }
  return null;
}

const SEARXNG_INSTANCES = [
  "https://searx.be",
  "https://searx.tiekoetter.com",
  "https://priv.au",
  "https://searx.work",
  "https://search.bus-hit.me",
  "https://opnxng.com",
];

async function searxng(query: string, limit: number, signal?: AbortSignal): Promise<SearchResult[] | null> {
  const instances = process.env.SEARXNG_URL ? [process.env.SEARXNG_URL] : SEARXNG_INSTANCES;
  for (const base of instances) {
    try {
      const url = `${base.replace(/\/+$/, "")}/search?q=${encodeURIComponent(query)}&format=json&safesearch=1`;
      const res = await fetch(url, { signal, headers: { "User-Agent": UA, Accept: "application/json" } });
      if (!res.ok) continue;
      const d = await res.json();
      const results = (d.results ?? []).filter((r: any) => r?.url && r?.title);
      if (results.length) {
        return results.slice(0, limit).map((r: any) => ({
          title: String(r.title),
          url: String(r.url),
          snippet: String(r.content ?? ""),
        }));
      }
    } catch {
      /* try next instance */
    }
  }
  return null;
}

async function hnAlgolia(query: string, limit: number, signal?: AbortSignal): Promise<SearchResult[] | null> {
  const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&tags=story&hitsPerPage=${limit}`;
  const res = await fetch(url, { signal, headers: { Accept: "application/json" } });
  if (!res.ok) return null;
  const d = await res.json();
  if (Array.isArray(d.hits) && d.hits.length) {
    return d.hits.slice(0, limit).map((h: any) => ({
      title: String(h.title ?? h.story_title ?? ""),
      url: String(h.url ?? `https://news.ycombinator.com/item?id=${h.objectID}`),
      snippet: `${h.points ?? 0} points · ${h.num_comments ?? 0} comments · ${(h.created_at ?? "").slice(0, 10)}`,
    }));
  }
  return null;
}

async function ddgInstant(query: string, signal?: AbortSignal): Promise<SearchResult[] | null> {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
  const res = await fetch(url, { signal, headers: { Accept: "application/json" } });
  if (!res.ok) return null;
  const d = await res.json();
  const out: SearchResult[] = [];
  if (d.AbstractText) {
    out.push({ title: String(d.Heading ?? "Instant answer"), url: String(d.AbstractURL ?? ""), snippet: String(d.AbstractText) });
  }
  const walk = (topics: any) => {
    for (const t of topics ?? []) {
      if (t?.Topics) walk(t.Topics);
      else if (t?.Text && t?.FirstURL) {
        out.push({ title: String(t.Text.split(" - ")[0]), url: String(t.FirstURL), snippet: String(t.Text) });
      }
    }
  };
  walk(d.RelatedTopics);
  return out.length ? out.slice(0, 8) : null;
}

/* ---------- page fetching ---------- */

type FetchFormat = "text" | "markdown" | "html";

interface FetchOptions {
  url: string;
  format: FetchFormat;
  timeout: number;
  userAgent?: string;
}

interface FetchResult {
  body: string;
  contentType: string;
}

/** Direct fetch with timeout and content-type validation */
async function fetchDirect(options: FetchOptions, signal?: AbortSignal): Promise<FetchResult | null> {
  const { url, format, timeout, userAgent = UA } = options;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), Math.min(timeout, MAX_TIMEOUT));

  // Combine external signal with our timeout signal
  const combinedSignal = signal
    ? AbortSignal.any([signal, controller.signal])
    : controller.signal;

  try {
    const res = await fetch(url, {
      signal: combinedSignal,
      redirect: "follow",
      headers: {
        "User-Agent": userAgent,
        Accept: format === "markdown"
          ? "text/markdown;q=1.0, text/x-markdown;q=0.9, text/plain;q=0.8, text/html;q=0.7, */*;q=0.1"
          : format === "text"
          ? "text/plain;q=1.0, text/markdown;q=0.9, text/html;q=0.8, */*;q=0.1"
          : "text/html;q=1.0, application/xhtml+xml;q=0.9, text/plain;q=0.8, */*;q=0.1",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (!res.ok) {
      // Detect Cloudflare challenge
      if (isCloudflareChallenge(res.status, res.headers)) {
        // Retry with different user agent
        return fetchDirect({ ...options, userAgent: "opencode" }, signal);
      }
      return null;
    }

    const contentType = res.headers.get("content-type") ?? "";
    const mime = mimeFrom(contentType);

    // Validate content type
    if (isImageAttachment(mime)) {
      throw new Error(`Unsupported content type: ${mime} (images not supported)`);
    }
    if (!isTextualMime(mime)) {
      throw new Error(`Unsupported content type: ${mime}`);
    }

    // Collect body with size limit
    const reader = res.body?.getReader();
    if (!reader) return null;

    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      totalBytes += value.length;
      if (totalBytes > MAX_FETCH_BYTES) {
        throw new Error(`Response too large (exceeds ${MAX_FETCH_BYTES / 1024 / 1024}MB limit)`);
      }
    }

    const body = new TextDecoder().decode(Buffer.concat(chunks));
    return { body, contentType };
  } catch (e) {
    if (signal?.aborted) throw e;
    if ((e as Error).name === "AbortError") {
      throw new Error(`Request timed out after ${timeout / 1000}s`);
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Fetch via Jina Reader API (better for JS-heavy sites) */
async function fetchViaJina(url: string, signal?: AbortSignal): Promise<string | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);
  const combinedSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;

  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      signal: combinedSignal,
      headers: { Accept: "text/markdown,text/plain" },
    });
    if (!res.ok) return null;
    const text = await res.text();
    if (!text || text.startsWith("{")) return null; // JSON = error payload
    return text.trim();
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Convert response body based on requested format */
function convertContent(body: string, contentType: string, format: FetchFormat): string {
  const isHtml = contentType.includes("text/html") || contentType.includes("application/xhtml");

  if (!isHtml) {
    // Non-HTML content, return as-is
    return body;
  }

  switch (format) {
    case "markdown":
      return htmlToMarkdown(body);
    case "text":
      return extractTextFromHTML(body);
    case "html":
      return body;
    default:
      return htmlToMarkdown(body);
  }
}

/* ---------- tool ---------- */

export default function webSearchExtension(pi: ExtensionAPI) {
  pi.registerTool({
    name: "websearch",
    label: "Web Search",
    description:
      "Search the web (mode='search') or fetch a page's content (mode='fetch'). " +
      "Fetch supports format options: markdown (default), text, or html. " +
      "Output truncated to ~12KB.",
    promptSnippet: "Search the web or fetch a page's text content",
    promptGuidelines: [
      "Use websearch when you need current or external info not in the repo.",
      "Prefer websearch over guessing URLs — it returns canonical links with snippets.",
      "For fetch mode, use format='markdown' (default) for structured content, 'text' for plain text, 'html' for raw HTML.",
      "Fetch uses Jina Reader as fallback for JS-heavy sites that don't work with direct fetch.",
    ],
    parameters: Type.Object({
      mode: Type.Optional(
        Type.Union([Type.Literal("search"), Type.Literal("fetch")], { default: "search" }),
      ),
      query: Type.String({
        description: "Search query, or the URL to fetch when mode=\"fetch\"",
      }),
      limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 10, default: 5 })),
      format: Type.Optional(
        Type.Union(
          [Type.Literal("text"), Type.Literal("markdown"), Type.Literal("html")],
          { default: "markdown", description: "Output format for fetch mode (default: markdown)" },
        ),
      ),
      timeout: Type.Optional(
        Type.Integer({
          minimum: 5,
          maximum: 120,
          default: 30,
          description: "Timeout in seconds for fetch mode (5-120, default: 30)",
        }),
      ),
    }),

    async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
      const { mode = "search", query, limit = 5, format = "markdown", timeout = 30 } = params;
      try {
        if (mode === "fetch") {
          if (!/^https?:\/\//i.test(query)) return err(`not a valid URL: ${query}`);

          const options: FetchOptions = {
            url: query,
            format: format as FetchFormat,
            timeout: timeout * 1000,
          };

          // Try direct fetch first
          let result = await fetchDirect(options, signal);

          // If direct fetch failed or returned minimal content, try Jina Reader
          if (!result || result.body.length < 200) {
            const jinaText = await fetchViaJina(query, signal);
            if (jinaText && jinaText.length > (result?.body.length ?? 0)) {
              // Jina returned more content, use it
              const header = `# ${query}\n\n`;
              return ok(header + truncate(jinaText));
            }
          }

          if (!result) return err(`could not fetch ${query}`);

          const content = convertContent(result.body, result.contentType, format as FetchFormat);
          const header = `# ${query}\n\n`;
          return ok(header + truncate(content));
        }

        // Search mode
        const key = `search:${query}:${limit}`;
        const cached = cache.get(key);
        if (cached && Date.now() - cached.at < CACHE_TTL) return ok(cached.text);

        const results =
          (await tavily(query, limit, signal)) ??
          (await brave(query, limit, signal)) ??
          (await searxng(query, limit, signal)) ??
          (await hnAlgolia(query, limit, signal));

        let finalText: string;
        if (results?.length) {
          finalText = formatResults(query, results);
        } else {
          const ia = await ddgInstant(query, signal);
          finalText = ia?.length ? formatResults(query, ia) : `No results found for "${query}".`;
        }

        cache.set(key, { at: Date.now(), text: finalText });
        return ok(finalText);
      } catch (e) {
        return err(signal?.aborted ? "search aborted" : e instanceof Error ? e.message : String(e));
      }
    },
  });
}
