/**
 * Web Search & Page Fetch tool for pi
 *
 * Registers a `websearch` tool with two modes:
 *   - "search": web search results (title, url, snippet)
 *   - "fetch":  fetch a URL and return its text/markdown content
 *
 * Backends (first success wins):
 *   1. Tavily  — if TAVILY_API_KEY is set (best quality, needs key)
 *   2. Brave   — if BRAVE_API_KEY is set
 *   3. SearXNG — public JSON instances, or set SEARXNG_URL to your own
 *   4. Hacker News Algolia + DuckDuckGo Instant Answer as keyless fallback
 *
 * Install: copy to ~/.pi/agent/extensions/ (auto-loaded) or .pi/extensions/
 *          for project scope, or `pi -e ./websearch.ts` for a quick test.
 */

import { Type } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const MAX_TEXT = 12_000; // ~3k tokens, plenty for results
const CACHE_TTL = 5 * 60_000;

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
  if (!Array.isArray(d.results) || !d.results.length) return null;
  return d.results.slice(0, limit).map((r: any) => ({
    title: String(r.title ?? ""),
    url: String(r.url ?? ""),
    snippet: String(r.content ?? ""),
  }));
}

async function brave(query: string, limit: number, signal?: AbortSignal): Promise<SearchResult[] | null> {
  const key = process.env.BRAVE_API_KEY;
  if (!key) return null;
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${limit}`;
  const res = await fetch(url, { signal, headers: { "X-Subscription-Token": key, Accept: "application/json" } });
  if (!res.ok) return null;
  const d = await res.json();
  if (!d.web?.results?.length) return null;
  return d.web.results.slice(0, limit).map((r: any) => ({
    title: String(r.title ?? ""),
    url: String(r.url ?? ""),
    snippet: String(r.description ?? ""),
  }));
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
  if (!Array.isArray(d.hits) || !d.hits.length) return null;
  return d.hits.slice(0, limit).map((h: any) => ({
    title: String(h.title ?? h.story_title ?? ""),
    url: String(h.url ?? `https://news.ycombinator.com/item?id=${h.objectID}`),
    snippet: `${h.points ?? 0} points · ${h.num_comments ?? 0} comments · ${(h.created_at ?? "").slice(0, 10)}`,
  }));
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

async function fetchDirect(url: string, signal?: AbortSignal): Promise<string | null> {
  const res = await fetch(url, {
    signal,
    redirect: "follow",
    headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,text/plain,*/*" },
  });
  if (!res.ok) return null;
  const ct = res.headers.get("content-type") ?? "";
  const raw = await res.text();
  const looksHtml = ct.includes("html") || /<html[\s>]/i.test(raw.slice(0, 2000));
  return looksHtml ? htmlToText(raw) : raw.trim();
}

async function fetchViaJina(url: string, signal?: AbortSignal): Promise<string | null> {
  const res = await fetch(`https://r.jina.ai/${url}`, {
    signal,
    headers: { Accept: "text/markdown,text/plain" },
  });
  if (!res.ok) return null;
  const text = await res.text();
  if (!text || text.startsWith("{")) return null; // JSON = error payload
  return text.trim();
}

/* ---------- tool ---------- */

export default function webSearchExtension(pi: ExtensionAPI) {
  pi.registerTool({
    name: "websearch",
    label: "Web Search",
    description:
      "Search the web (mode='search') or fetch a page's text (mode='fetch'). Output truncated to ~12KB.",
    promptSnippet: "Search the web or fetch a page's text content",
    promptGuidelines: [
      "Use websearch when you need current or external info not in the repo.",
      "Prefer websearch over guessing URLs — it returns canonical links with snippets.",
    ],
    parameters: Type.Object({
      mode: Type.Optional(
        Type.Union([Type.Literal("search"), Type.Literal("fetch")], { default: "search" }),
      ),
      query: Type.String({
        description: "Search query, or the URL to fetch when mode=\"fetch\"",
      }),
      limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 10, default: 5 })),
    }),

    async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
      const { mode = "search", query, limit = 5 } = params;
      try {
        if (mode === "fetch") {
          if (!/^https?:\/\//i.test(query)) return err(`not a valid URL: ${query}`);
          let text = await fetchDirect(query, signal);
          if (!text || text.length < 200) text = await fetchViaJina(query, signal); // JS-heavy site fallback
          if (!text) return err(`could not fetch ${query} (direct fetch and jina reader both failed)`);
          return ok(`# ${query}\n\n${truncate(text)}`);
        }

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
