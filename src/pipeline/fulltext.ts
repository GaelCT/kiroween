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

// Page furniture that Readability keeps on real news pages: skip links, bylines, author bios,
// post labels and dates, and image credits. Left in, it becomes the story's snippet, and the AI
// reads it as article text. The element markers are common class and ID words, not site names.
const FURNITURE_MARKER = /(^|[^a-z])(byline|authors?|credits?|caption|meta|posted)([^a-z]|$)/i;
const KEPT_TAGS = new Set(["HTML", "BODY", "MAIN", "ARTICLE"]);
/** A marked element holding more of the page's text than this is the article itself, so it stays. */
const MAX_FURNITURE_SHARE = 0.4;
const UI_LABEL = /^(skip to (main )?content|in brief|posted:?|view bio|advertisement)$/i;
/** What's left of an author box once the name is gone: "is a senior reporter covering ...". */
const ORPHAN_BIO = /^(is|was) (a|an|the) /;
const CREDIT_LINE = /^(credits?|image|photo|source)\s*:/i;
const AUTHOR_ROLE = /\b(reporter|writer|editor|journalist|correspondent|contributor|columnist|covers|covering)\b/i;

function removeFurniture(document: Document): void {
  const total = document.body?.textContent?.length ?? 0;
  for (const element of [...document.querySelectorAll("*")]) {
    if (KEPT_TAGS.has(element.tagName)) continue;
    const marked =
      // Only captions of pictures and video: a review's "Pros" and "Cons" boxes are figures too.
      (element.tagName === "FIGCAPTION" && Boolean(element.closest("figure")?.querySelector("img, picture, video, iframe"))) ||
      FURNITURE_MARKER.test(`${element.id} ${element.getAttribute("class") ?? ""}`) ||
      (element.tagName === "A" && /^\s*skip to\b/i.test(element.textContent ?? ""));
    if (marked && (element.textContent?.length ?? 0) <= total * MAX_FURNITURE_SHARE) element.remove();
  }
}

/** A paragraph that's page furniture rather than reporting. `author` comes from the feed. */
function isFurniture(paragraph: string, author: string | undefined): boolean {
  if (UI_LABEL.test(paragraph) || ORPHAN_BIO.test(paragraph)) return true;
  if (CREDIT_LINE.test(paragraph) && paragraph.length < 150) return true;
  const name = author?.trim().toLowerCase();
  if (!name) return false;
  const lower = paragraph.toLowerCase();
  return lower === name || lower === `by ${name}` || (lower.startsWith(`${name} is `) && AUTHOR_ROLE.test(paragraph));
}

/** Pulls the main article text out of a page. Returns null when there isn't a readable article. */
export function extractMainText(html: string, url = "https://example.com/", author?: string): string[] | null {
  let parsed: { content?: string | null } | null;
  try {
    const { document } = parseHTML(html);
    // Readability resolves relative links against the document's URL.
    const base = document.createElement("base");
    base.setAttribute("href", url);
    document.head?.appendChild(base);
    removeFurniture(document as unknown as Document);
    parsed = new Readability(document as unknown as Document, { charThreshold: MIN_ARTICLE_CHARS }).parse();
  } catch {
    return null;
  }
  if (!parsed?.content) return null;
  const paragraphs = htmlToParagraphs(parsed.content).filter((paragraph) => !isFurniture(paragraph, author));
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
  const fromFeed = htmlToParagraphs(entry.html).filter((paragraph) => !isFurniture(paragraph, entry.author));
  const feedChars = length(fromFeed);
  if (entry.contentKind === "full" && feedChars >= FULL_FEED_CHARS) return { paragraphs: fromFeed, limited: false };
  // Without the page, short feed text can still be compared if it's a real article, not a teaser.
  const fallback = { paragraphs: fromFeed, limited: entry.contentKind === "summary" || feedChars < MIN_ARTICLE_CHARS };
  if (!entry.url) return fallback;
  try {
    const page = await safeFetchText(entry.url, { accept: "text/html,application/xhtml+xml", ...options });
    if (!/html/i.test(page.contentType)) return fallback;
    const paragraphs = extractMainText(page.text, page.url, entry.author);
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
