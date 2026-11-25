// Feeds the visitor added (issue #20), their archive (issue #21), and OPML imports (issue #32).
// Pure functions, browser-safe.
// Everything lives in this browser's localStorage. Fetched articles stay until the reader deletes
// them, so the archive reaches back past what a feed currently lists.

import type { OpmlFeed } from "./opml";
import type { Article, Cluster, Contradiction, Evidence, Fact, FactId, ReaderData, Source } from "./types";

export interface LiveSource extends Source {
  /** ISO 8601. When the feed was last fetched. */
  fetchedAt: string;
}

/** A story's members, from the server's clustering. Facts are kept separately, by signature. */
export interface LiveStory {
  id: string;
  title: string;
  primaryArticleId: string;
  /** Primary first, then by publish time. */
  articleIds: string[];
}

export interface SavedComparison {
  facts: Record<FactId, Fact>;
  /** Keyed by article ID. */
  evidence: Record<string, Evidence[]>;
  /** Missing only in comparisons and backups made before contradiction detection. */
  contradictions?: Contradiction[];
}

export interface LiveState {
  sources: LiveSource[];
  /** The archive: every article ever fetched, keyed by ID. */
  articles: Record<string, Article>;
  stories: LiveStory[];
  /** Keyed by story signature, so a story that gains a source gets compared again. */
  comparisons: Record<string, SavedComparison>;
}

export const EMPTY_LIVE_STATE: LiveState = { sources: [], articles: {}, stories: [], comparisons: {} };

/** How many of the newest articles get regrouped after a fetch. Older stories keep their grouping. */
export const REGROUP_LIMIT = 300;

/** Paragraphs the server needs for grouping: the headline and lead are enough. */
const GROUPING_PARAGRAPHS = 2;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reads stored state. Missing or damaged data gives an empty archive instead of an error. */
export function parseLiveState(raw: string | null): LiveState {
  if (!raw) return EMPTY_LIVE_STATE;
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || !Array.isArray(value.sources) || !isRecord(value.articles) || !Array.isArray(value.stories)) {
      return EMPTY_LIVE_STATE;
    }
    const articles = value.articles as Record<string, Article>;
    const stories = (value.stories as LiveStory[]).filter(
      (story) => isRecord(story) && Array.isArray(story.articleIds) && story.articleIds.every((id) => id in articles),
    );
    return {
      sources: value.sources as LiveSource[],
      articles,
      stories,
      comparisons: isRecord(value.comparisons) ? (value.comparisons as Record<string, SavedComparison>) : {},
    };
  } catch {
    return EMPTY_LIVE_STATE;
  }
}

/** Story IDs match the server's: "live:" and the primary article's ID. */
function soloStory(article: Article): LiveStory {
  return { id: `live:${article.id}`, title: article.title, primaryArticleId: article.id, articleIds: [article.id] };
}

/** Adds a fetch to the archive. Articles already kept stay as they were; new ones join as their own story until regrouped. */
export function addFetched(state: LiveState, source: Source, fetched: readonly Article[], now: Date): LiveState {
  const saved: LiveSource = { ...source, fetchedAt: now.toISOString() };
  const sources = state.sources.some((candidate) => candidate.id === source.id)
    ? state.sources.map((candidate) => (candidate.id === source.id ? { ...candidate, name: source.name, fetchedAt: saved.fetchedAt } : candidate))
    : [...state.sources, saved];
  const added = fetched.filter((article) => !(article.id in state.articles));
  if (added.length === 0) return { ...state, sources };
  const articles = { ...state.articles };
  for (const article of added) articles[article.id] = { ...article, evidence: [] };
  const solo = added.map((article) => soloStory(article));
  return { ...state, sources, articles, stories: [...state.stories, ...solo] };
}

/** The newest articles, trimmed to what grouping reads, for POST /api/stories. */
export function articlesToGroup(state: LiveState): Article[] {
  return Object.values(state.articles)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.id.localeCompare(b.id))
    .slice(0, REGROUP_LIMIT)
    .map((article) => ({ ...article, paragraphs: article.paragraphs.slice(0, GROUPING_PARAGRAPHS), evidence: [] }));
}

/**
 * Replaces the stories of the regrouped articles with the server's grouping. Other stories
 * stay as they were. Saved comparisons no story uses any more are let go.
 */
export function applyGrouping(state: LiveState, regrouped: ReadonlySet<string>, stories: readonly LiveStory[]): LiveState {
  const kept = state.stories.filter((story) => !story.articleIds.some((id) => regrouped.has(id)));
  const placed = new Set([...kept, ...stories].flatMap((story) => story.articleIds));
  const leftOver = [...regrouped]
    .filter((id) => !placed.has(id) && id in state.articles)
    .map((id) => soloStory(state.articles[id]));
  const next = [...kept, ...stories.filter((story) => story.articleIds.every((id) => id in state.articles)), ...leftOver];
  const used = new Set(next.map((story) => storySignature(story, state.articles)));
  const comparisons = Object.fromEntries(Object.entries(state.comparisons).filter(([signature]) => used.has(signature)));
  return { ...state, stories: next, comparisons };
}

/** The story's articles that can be compared: full text, not excerpts. */
export function comparableIds(story: LiveStory, articles: Readonly<Record<string, Article>>): string[] {
  return story.articleIds.filter((id) => !articles[id]?.limited);
}

/** Identifies what was compared: the primary and the comparable members. */
export function storySignature(story: LiveStory, articles: Readonly<Record<string, Article>>): string {
  const others = comparableIds(story, articles)
    .filter((id) => id !== story.primaryArticleId)
    .sort();
  return [story.primaryArticleId, ...others].join("\n");
}

/** Stories with two or more full articles and no saved comparison. */
export function storiesToCompare(state: LiveState): LiveStory[] {
  return state.stories.filter((story) => {
    if (comparableIds(story, state.articles).length < 2) return false;
    const saved = state.comparisons[storySignature(story, state.articles)];
    // Comparisons saved before #44 are regenerated once to look for contradictions.
    return !saved || !Array.isArray(saved.contradictions);
  });
}

export function saveComparison(state: LiveState, signature: string, comparison: SavedComparison): LiveState {
  return { ...state, comparisons: { ...state.comparisons, [signature]: comparison } };
}

export interface ArchiveRemoval {
  state: LiveState;
  /** Old story ID to its replacement, or null when the whole story was removed. */
  storyIds: Record<string, string | null>;
}

/** Removes articles without a network request and keeps the remaining archive internally consistent. */
export function removeFromArchive(state: LiveState, articleIds: readonly string[], unsubscribedSourceId?: string): ArchiveRemoval {
  const removed = new Set(articleIds.filter((id) => id in state.articles));
  if (removed.size === 0 && !unsubscribedSourceId) return { state, storyIds: {} };

  const articles = Object.fromEntries(Object.entries(state.articles).filter(([id]) => !removed.has(id)));
  const storyIds: Record<string, string | null> = {};
  const stories = state.stories.flatMap((story): LiveStory[] => {
    const remaining = story.articleIds.filter((id) => !removed.has(id));
    if (remaining.length === 0) {
      storyIds[story.id] = null;
      return [];
    }
    if (remaining.includes(story.primaryArticleId)) return [{ ...story, articleIds: remaining }];
    const primaryArticleId = remaining[0];
    const next = {
      id: `live:${primaryArticleId}`,
      title: articles[primaryArticleId].title,
      primaryArticleId,
      articleIds: remaining,
    };
    storyIds[story.id] = next.id;
    return [next];
  });

  const sourceIdsInUse = new Set(Object.values(articles).map((article) => article.sourceId));
  const sources = state.sources.filter(
    (source) =>
      source.id !== unsubscribedSourceId &&
      // A saved-page site exists only to organize its pages. Feed subscriptions survive article deletion.
      (!source.saved || sourceIdsInUse.has(source.id)),
  );
  const used = new Set(stories.map((story) => storySignature(story, articles)));
  const comparisons = Object.fromEntries(Object.entries(state.comparisons).filter(([signature]) => used.has(signature)));
  return { state: { sources, articles, stories, comparisons }, storyIds };
}

/** Feed subscriptions, excluding sites that only have individually saved pages. */
export function isFeedSource(source: Source): boolean {
  return source.saved !== true;
}

/** Feeds from an imported file that aren't subscribed yet. */
export function feedsToImport(state: LiveState, feeds: readonly OpmlFeed[]): OpmlFeed[] {
  const subscribed = new Set(state.sources.filter(isFeedSource).map((source) => source.feedUrl));
  return feeds.filter((feed) => !subscribed.has(feed.url));
}

export interface ImportOutcome {
  /** Feeds in the file. */
  listed: number;
  /** Feeds in the file that were already subscribed, found before fetching or, after a redirect, by fetching. */
  already: number;
  added: number;
  /** "<name>: <reason>" for each feed that couldn't be added. */
  failures: string[];
  /** True when the server's hourly feed limit stopped the import early. */
  limited: boolean;
  groupingError: string | null;
  comparisonError: string | null;
}

function sentence(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

/** The message shown after an import. */
export function importMessage(outcome: ImportOutcome): string {
  const { listed, already, added, failures, limited, groupingError, comparisonError } = outcome;
  if (listed === 0) return "No feeds found in that file.";
  if (already === listed) return "You're already subscribed to every feed in that file.";
  const fresh = listed - already;
  const feeds = (count: number) => `${count} ${count === 1 ? "feed" : "feeds"}`;
  const parts: string[] = [];
  if (added === fresh) parts.push(`Imported ${feeds(added)}.`);
  else if (added > 0) parts.push(`Imported ${added} of ${feeds(fresh)}.`);
  else parts.push("No feeds were imported.");
  if (already > 0) parts.push(`You were already subscribed to ${already === 1 ? "one other feed" : `the other ${already}`}.`);
  if (limited) parts.push("The hourly feed limit was reached, so import the file again later for the rest.");
  if (failures.length > 0) parts.push(`Couldn't add ${sentence(failures[0])}`);
  if (failures.length > 1) parts.push(`${failures.length - 1} more failed too.`);
  if (groupingError) parts.push(`The new articles couldn't be grouped into stories: ${sentence(groupingError)}`);
  if (comparisonError) parts.push(`Some stories couldn't be compared: ${sentence(comparisonError)}`);
  return parts.join(" ");
}

export type LiveData = Pick<ReaderData, "sources" | "articles" | "clusters">;

/** The reader's view of the live archive. `failed` holds signatures whose comparison failed this visit. */
export function liveReaderData(state: LiveState, failed: ReadonlySet<string> = new Set()): LiveData {
  const articles: Record<string, Article> = { ...state.articles };
  const clusters = state.stories.map((story): Cluster => {
    const base = { id: story.id, title: story.title, primaryArticleId: story.primaryArticleId, articleIds: story.articleIds };
    if (comparableIds(story, state.articles).length < 2) return { ...base, facts: {} };
    const signature = storySignature(story, state.articles);
    const saved = state.comparisons[signature];
    if (!saved) return { ...base, facts: {}, comparison: failed.has(signature) ? "failed" : "pending" };
    for (const id of story.articleIds) articles[id] = { ...state.articles[id], evidence: saved.evidence[id] ?? [] };
    return { ...base, facts: saved.facts, contradictions: saved.contradictions ?? [] };
  });
  return { sources: state.sources, articles, clusters };
}

function newest(cluster: Cluster, articles: Readonly<Record<string, Article>>): string {
  return cluster.articleIds.reduce((latest, id) => (articles[id].publishedAt > latest ? articles[id].publishedAt : latest), "");
}

/** The sample data and the live archive in one reader, stories newest first. */
export function combineReaderData(sample: ReaderData, live: LiveData): ReaderData {
  if (live.sources.length === 0) return sample;
  const articles = { ...sample.articles, ...live.articles };
  const clusters = [...sample.clusters, ...live.clusters].sort(
    (a, b) => newest(b, articles).localeCompare(newest(a, articles)) || a.id.localeCompare(b.id),
  );
  return { ...sample, sources: [...sample.sources, ...live.sources], articles, clusters };
}
