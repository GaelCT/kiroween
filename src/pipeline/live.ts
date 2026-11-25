// Live feeds that a visitor adds (issue #20). Server and scripts only.
// Feeds are fetched, articles get full text, stories are clustered, and facts are compared
// with the AI model. Nothing here writes to disk: real article text only lives in memory and
// in the visitor's browser, never in the repo.

import { createHash } from "node:crypto";
import type { Article, Cluster, Contradiction, Evidence, Fact, FactId, Source } from "@/lib/types";
import type { ModelClient } from "./ai";
import { clusterArticles } from "./cluster";
import { compareArticles } from "./facts";
import { FeedParseError, parseFeed } from "./feeds";
import { fullTextFor, mapWithLimit } from "./fulltext";
import { safeFetchText, type SafeFetchOptions } from "./safe-fetch";

/** Entries kept from one fetch of a feed, newest first. */
export const ENTRIES_PER_FETCH = 30;

export function liveSourceId(feedUrl: string): string {
  return `live-${createHash("sha256").update(feedUrl).digest("hex").slice(0, 12)}`;
}

/** Named after the primary article, which only changes when X pulls it out, so stars survive regrouping. */
export function liveClusterId(primaryArticleId: string): string {
  return `live:${primaryArticleId}`;
}

/** Live article IDs are namespaced by source, so two feeds can't collide on an entry ID. */
export function liveArticleId(sourceId: string, entryId: string): string {
  return `${sourceId}:${entryId}`;
}

export interface FetchedFeed {
  source: Source;
  /** Newest first, with full text where the feed only had excerpts. No evidence yet. */
  articles: Article[];
}

/** Fetches a feed and its articles' full text. */
export async function fetchLiveFeed(feedUrl: string, options: SafeFetchOptions = {}): Promise<FetchedFeed> {
  const response = await safeFetchText(feedUrl, {
    accept: "application/atom+xml, application/rss+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5",
    ...options,
  });
  let feed;
  try {
    feed = parseFeed(response.text);
  } catch (error) {
    if (error instanceof FeedParseError) throw new FeedParseError("That address isn't an RSS or Atom feed.");
    throw error;
  }
  const url = new URL(response.url);
  const sourceId = liveSourceId(response.url);
  const source: Source = {
    id: sourceId,
    name: feed.title || url.hostname,
    homepage: feed.homepage ?? `${url.protocol}//${url.host}/`,
    feedUrl: response.url,
  };
  const fetchedAt = new Date().toISOString();
  const entries = feed.entries
    .filter((entry) => entry.id && entry.title)
    .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))
    .slice(0, ENTRIES_PER_FETCH);
  const articles = await mapWithLimit(entries, 4, async (entry): Promise<Article> => {
    const text = await fullTextFor(entry, options);
    return {
      id: liveArticleId(sourceId, entry.id),
      sourceId,
      title: entry.title,
      url: entry.url,
      ...(entry.author ? { author: entry.author } : {}),
      publishedAt: entry.publishedAt ?? fetchedAt,
      paragraphs: text.paragraphs,
      evidence: [],
      ...(text.limited ? { limited: true } : {}),
    };
  });
  return { source, articles };
}

/** Groups live articles into stories. Facts come later, from compareLiveCluster. */
export function clusterLive(articles: readonly Article[]): Cluster[] {
  return clusterArticles(articles).map((group): Cluster => {
    const primary = articles.find((article) => article.id === group.primaryArticleId)!;
    const comparable = group.articleIds.filter((id) => !articles.find((article) => article.id === id)!.limited);
    return {
      id: liveClusterId(group.primaryArticleId),
      title: primary.title,
      primaryArticleId: group.primaryArticleId,
      articleIds: group.articleIds,
      facts: {},
      // A story needs two full articles before there's anything to compare.
      ...(comparable.length > 1 ? { comparison: "pending" as const } : {}),
    };
  });
}

export interface LiveComparison {
  facts: Record<FactId, Fact>;
  /** Keyed by article ID. */
  evidence: Record<string, Evidence[]>;
  contradictions: Contradiction[];
}

/** Extracts and matches facts for one live story. `articles` starts with the primary. */
export async function compareLiveCluster(model: ModelClient, articles: readonly Article[]): Promise<LiveComparison> {
  const comparable = articles.filter((article) => !article.limited);
  const result = await compareArticles(
    model,
    comparable.map((article) => ({ id: article.id, title: article.title, paragraphs: article.paragraphs })),
  );
  return { facts: result.facts, evidence: result.evidence, contradictions: result.contradictions };
}
