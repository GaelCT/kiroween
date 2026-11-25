// One article page that a visitor saves by URL. Server only.
// The page is fetched with the same public-address, redirect, time, and size limits as feeds.

import { createHash } from "node:crypto";
import { parseHTML } from "linkedom";
import type { Article, Source } from "@/lib/types";
import { extractMainText } from "./fulltext";
import { safeFetchText, type SafeFetchOptions } from "./safe-fetch";

export class ArticleParseError extends Error {
  override name = "ArticleParseError";
}

export interface FetchedArticle {
  source: Source;
  article: Article;
}

function hash(value: string, length: number): string {
  return createHash("sha256").update(value).digest("hex").slice(0, length);
}

function metadata(document: Document, key: string, attribute: "name" | "property" = "name"): string {
  const selector = `meta[${attribute}="${key}"]`;
  return document.querySelector(selector)?.getAttribute("content")?.trim() ?? "";
}

function publishedTime(document: Document): string | null {
  const candidates = [
    metadata(document, "article:published_time", "property"),
    metadata(document, "date"),
    metadata(document, "publish-date"),
    metadata(document, "datePublished"),
    document.querySelector("time[datetime]")?.getAttribute("datetime")?.trim() ?? "",
  ];
  for (const candidate of candidates) {
    if (candidate && !Number.isNaN(Date.parse(candidate))) return new Date(candidate).toISOString();
  }
  return null;
}

/** Fetches and extracts one page without creating a recurring feed subscription. */
export async function fetchLiveArticle(rawUrl: string, options: SafeFetchOptions = {}): Promise<FetchedArticle> {
  const response = await safeFetchText(rawUrl, { accept: "text/html,application/xhtml+xml", ...options });
  if (!/html/i.test(response.contentType)) throw new ArticleParseError("That address isn't an HTML article page.");

  const finalUrl = new URL(response.url);
  finalUrl.hash = "";
  const url = finalUrl.toString();
  const { document } = parseHTML(response.text);
  const author = metadata(document as unknown as Document, "author");
  const paragraphs = extractMainText(response.text, url, author || undefined);
  if (!paragraphs) {
    throw new ArticleParseError("Couldn't find a readable article on that page. It may be behind a paywall or contain mostly video.");
  }

  const title = metadata(document as unknown as Document, "og:title", "property") || document.title.trim() || finalUrl.hostname;
  if (url.length > 2048 || title.length > 1000 || author.length > 300 || paragraphs.length > 500) {
    throw new ArticleParseError("That article is too long to save.");
  }
  if (paragraphs.reduce((sum, paragraph) => sum + paragraph.length, 0) > 100_000) {
    throw new ArticleParseError("That article is too long to save.");
  }

  const homepage = `${finalUrl.origin}/`;
  const sourceId = `saved-${hash(homepage, 12)}`;
  const source: Source = {
    id: sourceId,
    name: metadata(document as unknown as Document, "og:site_name", "property") || finalUrl.hostname.replace(/^www\./, ""),
    homepage,
    feedUrl: "",
    saved: true,
  };
  const article: Article = {
    id: `${sourceId}:${hash(url, 24)}`,
    sourceId,
    title,
    url,
    ...(author ? { author } : {}),
    publishedAt: publishedTime(document as unknown as Document) ?? new Date().toISOString(),
    paragraphs,
    evidence: [],
  };
  return { source, article };
}
