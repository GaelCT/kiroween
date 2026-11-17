// What the list and sidebar show. Pure functions, browser-safe.

import { clusterState, isWorthReading, type ArticleMap, type History } from "./adds";
import type { Article, Cluster, Source } from "./types";

export type View =
  | { kind: "all" }
  | { kind: "starred" }
  | { kind: "source"; sourceId: string }
  | { kind: "folder"; folder: string }
  | { kind: "search"; query: string };

export interface ViewContext {
  clusters: readonly Cluster[];
  articles: ArticleMap;
  sources: readonly Source[];
  starred: readonly string[];
}

export function sameView(a: View, b: View): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Lowercased search terms. Every term has to match. */
export function searchTerms(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean);
}

/** Whether an article's title or text contains every term. */
export function matchesSearch(article: Article, terms: readonly string[]): boolean {
  if (terms.length === 0) return false;
  const text = `${article.title}\n${article.paragraphs.join("\n")}`.toLowerCase();
  return terms.every((term) => text.includes(term));
}

/** For views that filter articles: which articles belong. Null means every article of the view's stories. */
function articleFilter(view: View, sources: readonly Source[]): ((article: Article) => boolean) | null {
  switch (view.kind) {
    case "all":
    case "starred":
      return null;
    case "source":
      return (article) => article.sourceId === view.sourceId;
    case "folder": {
      const ids = new Set(sources.filter((source) => source.folder === view.folder).map((source) => source.id));
      return (article) => ids.has(article.sourceId);
    }
    case "search": {
      const terms = searchTerms(view.query);
      return (article) => matchesSearch(article, terms);
    }
  }
}

/** Stories shown in a view, in list order. */
export function storiesInView(view: View, { clusters, articles, sources, starred }: ViewContext): Cluster[] {
  if (view.kind === "starred") return clusters.filter((cluster) => starred.includes(cluster.id));
  const filter = articleFilter(view, sources);
  if (!filter) return [...clusters];
  return clusters.filter((cluster) => cluster.articleIds.some((id) => filter(articles[id])));
}

/** Articles shown in a view when stories aren't grouped, newest first. */
export function articlesInView(view: View, context: ViewContext): string[] {
  const filter = articleFilter(view, context.sources);
  return storiesInView(view, context)
    .flatMap((cluster) => cluster.articleIds)
    .filter((id) => !filter || filter(context.articles[id]))
    .sort((a, b) => context.articles[b].publishedAt.localeCompare(context.articles[a].publishedAt) || a.localeCompare(b));
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

export interface FolderGroup {
  /** Null for feeds that aren't in a folder. */
  folder: string | null;
  sources: Source[];
}

/** Sidebar groups: folders in the order they first appear, then feeds without a folder. */
export function groupByFolder(sources: readonly Source[]): FolderGroup[] {
  const groups: FolderGroup[] = [];
  for (const source of sources.filter((candidate) => candidate.folder)) {
    const group = groups.find((candidate) => candidate.folder === source.folder);
    if (group) group.sources.push(source);
    else groups.push({ folder: source.folder!, sources: [source] });
  }
  const loose = sources.filter((source) => !source.folder);
  return loose.length > 0 ? [...groups, { folder: null, sources: loose }] : groups;
}

/** Google Reader capped its counts at "1000+". */
export function formatCount(count: number): string {
  return count > 1000 ? "1000+" : String(count);
}
