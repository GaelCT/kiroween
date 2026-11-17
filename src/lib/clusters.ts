// Correcting clusters with X. Pure functions, browser-safe.

import type { ArticleMap } from "./adds";
import type { Cluster, Fact } from "./types";

export function soloClusterId(articleId: string): string {
  return `solo:${articleId}`;
}

function factsUsedBy(facts: Record<string, Fact>, articleIds: string[], articles: ArticleMap): Record<string, Fact> {
  const used = new Set(articleIds.flatMap((id) => articles[id].evidence.map((evidence) => evidence.factId)));
  return Object.fromEntries(Object.entries(facts).filter(([factId]) => used.has(factId)));
}

/**
 * Moves an article out of its cluster into a cluster of its own, placed right after the one it left.
 * If it was the primary, the earliest remaining article becomes the primary.
 */
export function pullOut(clusters: readonly Cluster[], articles: ArticleMap, articleId: string): Cluster[] {
  const index = clusters.findIndex((cluster) => cluster.articleIds.includes(articleId));
  if (index === -1 || clusters[index].articleIds.length < 2) return [...clusters];

  const cluster = clusters[index];
  const byTime = (a: string, b: string) =>
    articles[a].publishedAt.localeCompare(articles[b].publishedAt) || a.localeCompare(b);
  const remaining = cluster.articleIds.filter((id) => id !== articleId).sort(byTime);
  const primaryArticleId = cluster.primaryArticleId === articleId ? remaining[0] : cluster.primaryArticleId;
  const articleIds = [primaryArticleId, ...remaining.filter((id) => id !== primaryArticleId)];

  const left: Cluster = { ...cluster, primaryArticleId, articleIds, facts: factsUsedBy(cluster.facts, articleIds, articles) };
  const solo: Cluster = {
    id: soloClusterId(articleId),
    title: articles[articleId].title,
    primaryArticleId: articleId,
    articleIds: [articleId],
    facts: factsUsedBy(cluster.facts, [articleId], articles),
    ...(cluster.comparison ? { comparison: cluster.comparison } : {}),
  };
  return [...clusters.slice(0, index), left, solo, ...clusters.slice(index + 1)];
}

/** Replays every X the user pressed, in order. */
export function applyDetached(clusters: readonly Cluster[], articles: ArticleMap, detached: readonly string[]): Cluster[] {
  return detached.reduce<Cluster[]>((current, articleId) => pullOut(current, articles, articleId), [...clusters]);
}
