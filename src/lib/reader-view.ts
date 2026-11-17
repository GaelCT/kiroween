// What the list and sidebar show. Pure functions, browser-safe.

import { clusterState, isWorthReading, type ArticleMap, type History } from "./adds";
import type { Cluster } from "./types";

export type View = { kind: "all" } | { kind: "starred" } | { kind: "source"; sourceId: string };

export function sameView(a: View, b: View): boolean {
  return a.kind === b.kind && (a.kind !== "source" || (b.kind === "source" && a.sourceId === b.sourceId));
}

/** Stories shown in a view, in list order. */
export function storiesInView(view: View, clusters: readonly Cluster[], articles: ArticleMap, starred: readonly string[]): Cluster[] {
  switch (view.kind) {
    case "all":
      return [...clusters];
    case "starred":
      return clusters.filter((cluster) => starred.includes(cluster.id));
    case "source":
      return clusters.filter((cluster) => cluster.articleIds.some((id) => articles[id].sourceId === view.sourceId));
  }
}

/** Articles shown in a view when stories aren't grouped, newest first. */
export function articlesInView(view: View, clusters: readonly Cluster[], articles: ArticleMap, starred: readonly string[]): string[] {
  return storiesInView(view, clusters, articles, starred)
    .flatMap((cluster) => cluster.articleIds)
    .filter((id) => view.kind !== "source" || articles[id].sourceId === view.sourceId)
    .sort((a, b) => articles[b].publishedAt.localeCompare(articles[a].publishedAt) || a.localeCompare(b));
}

export interface UnreadCounts {
  /** Stories still worth opening when grouped, unread articles otherwise. */
  all: number;
  /** Per source: articles still worth opening when grouped, unread articles otherwise. */
  bySource: Record<string, number>;
}

export function unreadCounts(clusters: readonly Cluster[], articles: ArticleMap, history: History, grouped: boolean): UnreadCounts {
  const read = new Set(history);
  const bySource: Record<string, number> = {};
  let all = 0;
  for (const cluster of clusters) {
    if (grouped && clusterState(cluster, articles, history) !== "read") all += 1;
    for (const id of cluster.articleIds) {
      if (!(grouped ? isWorthReading(cluster, articles, history, id) : !read.has(id))) continue;
      if (!grouped) all += 1;
      const sourceId = articles[id].sourceId;
      bySource[sourceId] = (bySource[sourceId] ?? 0) + 1;
    }
  }
  return { all, bySource };
}

/** Google Reader capped its counts at "1000+". */
export function formatCount(count: number): string {
  return count > 1000 ? "1000+" : String(count);
}
