// Full text for feeds that only carry excerpts (issue #12). Server only.
// The article page is fetched and its main text extracted with Readability. When that fails,
// the article keeps its excerpt and shows "Limited source content".
// Real article text only ever lives in memory and in the visitor's browser, never in the repo.

import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import type { FeedEntry } from "./feeds";
import { htmlToParagraphs } from "./html";
import { safeFetchText, type SafeFetchOptions } from "./safe-fetch";

/** Below this, the page probably wasn't an article: a paywall, a consent wall, or a video page. */
const MIN_ARTICLE_CHARS = 400;
const MIN_PARAGRAPHS = 2;

/** Pulls the main article text out of a page. Returns null when there isn't a readable article. */
export function extractMainText(html: string, url = "https://example.com/"): string[] | null {
  let parsed: { content?: string | null } | null;
  try {
    const { document } = parseHTML(html);
    // Readability resolves relative links against the document's URL.
    const base = document.createElement("base");
    base.setAttribute("href", url);
    document.head?.appendChild(base);
    parsed = new Readability(document as unknown as Document, { charThreshold: MIN_ARTICLE_CHARS }).parse();
  } catch {
    return null;
  }
  if (!parsed?.content) return null;
  const paragraphs = htmlToParagraphs(parsed.content);
  const chars = paragraphs.reduce((sum, paragraph) => sum + paragraph.length, 0);
  return paragraphs.length >= MIN_PARAGRAPHS && chars >= MIN_ARTICLE_CHARS ? paragraphs : null;
}

export interface TextResult {
  paragraphs: string[];
  /** True when only the feed's excerpt is available. */
  limited: boolean;
}

/**
 * Feed content at least this long is taken as the whole article. Some feeds put a teaser in
 * their full-content field, so shorter content gets checked against the article page.
 */
export const FULL_FEED_CHARS = 1500;

function length(paragraphs: readonly string[]): number {
  return paragraphs.reduce((sum, paragraph) => sum + paragraph.length, 0);
}

/** The entry's text: the feed's own content when it's the whole article, otherwise the article page's main text. */
export async function fullTextFor(entry: FeedEntry, options: SafeFetchOptions = {}): Promise<TextResult> {
  const fromFeed = htmlToParagraphs(entry.html);
  const feedChars = length(fromFeed);
  if (entry.contentKind === "full" && feedChars >= FULL_FEED_CHARS) return { paragraphs: fromFeed, limited: false };
  // Without the page, short feed text can still be compared if it's a real article, not a teaser.
  const fallback = { paragraphs: fromFeed, limited: entry.contentKind === "summary" || feedChars < MIN_ARTICLE_CHARS };
  if (!entry.url) return fallback;
  try {
    const page = await safeFetchText(entry.url, { accept: "text/html,application/xhtml+xml", ...options });
    if (!/html/i.test(page.contentType)) return fallback;
    const paragraphs = extractMainText(page.text, page.url);
    return paragraphs && length(paragraphs) > feedChars ? { paragraphs, limited: false } : fallback;
  } catch {
    return fallback;
  }
}

/** Runs `task` over `items` with at most `limit` running at once, keeping the input order. */
export async function mapWithLimit<T, R>(items: readonly T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
