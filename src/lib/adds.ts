// What each source adds. Pure functions that run in the browser from saved facts, with no AI call.
// The rules are in .kiro/steering/product.md and .kiro/specs/comparison-pipeline/design.md.

import type { Article, Cluster, FactId } from "./types";

export type ArticleMap = Readonly<Record<string, Article>>;

/** Article IDs the user has read, in first-read order. Articles from other clusters are ignored. */
export type History = readonly string[];

export type ClusterState = "unread" | "partly-read" | "read";

/** "waiting" means the source hasn't been compared yet, or its comparison failed. */
export type SourceStatus = "primary" | "read" | "adds" | "nothing-new" | "limited" | "waiting";

export interface SourceComparison {
  articleId: string;
  status: SourceStatus;
  /** The facts this source adds, in the order they appear in it. Empty unless the status is "adds". */
  adds: FactId[];
  /** Share of the source's facts already seen in this cluster. Null when the source has no facts. */
  duplicateScore: number | null;
}

/** The article's fact IDs, without repeats, in the order they appear. */
export function factIdsOf(article: Article): FactId[] {
  return [...new Set(article.evidence.map((evidence) => evidence.factId))];
}

function articleIn(cluster: Cluster, articles: ArticleMap, articleId: string): Article {
  const article = articles[articleId];
  if (!article || !cluster.articleIds.includes(articleId)) {
    throw new Error(`Article ${articleId} isn't in cluster ${cluster.id}`);
  }
  return article;
}

/** Whether the cluster's facts are ready. Until then, reading state falls back to read and unread. */
export function isCompared(cluster: Cluster): boolean {
  return (cluster.comparison ?? "ready") === "ready";
}

/** The cluster's articles that the user has read. */
export function readInCluster(cluster: Cluster, history: History): Set<string> {
  const members = new Set(cluster.articleIds);
  return new Set(history.filter((id) => members.has(id)));
}

/** Facts in the primary article and in every read article of the cluster, except `exceptArticleId`. */
export function seenFacts(cluster: Cluster, articles: ArticleMap, history: History, exceptArticleId?: string): Set<FactId> {
  const seen = new Set(factIdsOf(articleIn(cluster, articles, cluster.primaryArticleId)));
  for (const id of readInCluster(cluster, history)) {
    if (id === exceptArticleId) continue;
    for (const factId of factIdsOf(articleIn(cluster, articles, id))) seen.add(factId);
  }
  return seen;
}

/** The facts a source adds: facts not in the primary article or anything else read in the cluster. */
export function addsFor(cluster: Cluster, articles: ArticleMap, history: History, articleId: string): FactId[] {
  const article = articleIn(cluster, articles, articleId);
  if (articleId === cluster.primaryArticleId || readInCluster(cluster, history).has(articleId)) return [];
  const seen = seenFacts(cluster, articles, history);
  return factIdsOf(article).filter((factId) => !seen.has(factId));
}

/** Share of a source's facts that are in the primary article or another read article. */
export function duplicateScore(cluster: Cluster, articles: ArticleMap, history: History, articleId: string): number | null {
  const facts = factIdsOf(articleIn(cluster, articles, articleId));
  if (facts.length === 0) return null;
  const seen = seenFacts(cluster, articles, history, articleId);
  return facts.filter((factId) => seen.has(factId)).length / facts.length;
}

/**
 * Facts to highlight in an article: the ones that were new when the user first opened it.
 * Only reads before that first open count, so highlights don't change as the user reads on.
 */
export function highlightsFor(cluster: Cluster, articles: ArticleMap, history: History, articleId: string): FactId[] {
  const article = articleIn(cluster, articles, articleId);
  if (articleId === cluster.primaryArticleId) return [];
  const firstRead = history.indexOf(articleId);
  const before = firstRead === -1 ? history : history.slice(0, firstRead);
  const seen = seenFacts(cluster, articles, before, articleId);
  return factIdsOf(article).filter((factId) => !seen.has(factId));
}

/** Unread until something is read, read once the primary is read and no unread source adds anything. */
export function clusterState(cluster: Cluster, articles: ArticleMap, history: History): ClusterState {
  const read = readInCluster(cluster, history);
  if (read.size === 0) return "unread";
  if (!isCompared(cluster)) return read.size === cluster.articleIds.length ? "read" : "partly-read";
  if (!read.has(cluster.primaryArticleId)) return "partly-read";
  const somethingNew = cluster.articleIds.some((id) => addsFor(cluster, articles, history, id).length > 0);
  return somethingNew ? "partly-read" : "read";
}

/** Whether opening this article still gets the user something. Drives unread counts. */
export function isWorthReading(cluster: Cluster, articles: ArticleMap, history: History, articleId: string): boolean {
  const read = readInCluster(cluster, history);
  if (read.has(articleId)) return false;
  if (read.size === 0 || articleId === cluster.primaryArticleId || !isCompared(cluster)) return true;
  return addsFor(cluster, articles, history, articleId).length > 0;
}

/** One entry per article in cluster order: what it adds and how much of it repeats. */
export function compareCluster(cluster: Cluster, articles: ArticleMap, history: History): SourceComparison[] {
  const read = readInCluster(cluster, history);
  return cluster.articleIds.map((articleId): SourceComparison => {
    const article = articleIn(cluster, articles, articleId);
    const score = duplicateScore(cluster, articles, history, articleId);
    if (articleId === cluster.primaryArticleId) return { articleId, status: "primary", adds: [], duplicateScore: score };
    if (read.has(articleId)) return { articleId, status: "read", adds: [], duplicateScore: score };
    if (!isCompared(cluster)) return { articleId, status: "waiting", adds: [], duplicateScore: null };
    if (article.limited || score === null) return { articleId, status: "limited", adds: [], duplicateScore: null };
    const adds = addsFor(cluster, articles, history, articleId);
    return { articleId, status: adds.length > 0 ? "adds" : "nothing-new", adds, duplicateScore: score };
  });
}
