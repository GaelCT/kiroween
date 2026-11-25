// The visitor's live feeds and archive in localStorage, and the calls that fill them
// (issues #20, #21, and #32). Browser only. Fetching, grouping, and AI comparison all run on the
// server; this file only sends requests and keeps the results.

import type { OpmlFeed } from "./opml";
import type { Article, Source } from "./types";
import {
  addFetched,
  applyGrouping,
  articlesToGroup,
  EMPTY_LIVE_STATE,
  feedsToImport,
  importMessage,
  isFeedSource,
  parseLiveState,
  removeFromArchive,
  saveComparison,
  storiesToCompare,
  storySignature,
  type ImportOutcome,
  type LiveState,
  type LiveStory,
  type SavedComparison,
} from "./live";

const STORAGE_KEY = "reader:live:v1";

/** Feeds fetched more recently than this aren't fetched again on load. */
const STALE_MS = 15 * 60_000;

export interface LiveSnapshot {
  state: LiveState;
  /** Signatures whose comparison failed during this visit. Not saved, so a reload retries them. */
  failed: ReadonlySet<string>;
  /** True while feeds are being fetched or grouped. */
  busy: boolean;
  /** True when the archive no longer fits in localStorage and new articles only last until reload. */
  storageFull: boolean;
}

const EMPTY_SNAPSHOT: LiveSnapshot = { state: EMPTY_LIVE_STATE, failed: new Set(), busy: false, storageFull: false };

let snapshot: LiveSnapshot | null = null;
const listeners = new Set<() => void>();

function load(): LiveSnapshot {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // Blocked storage: start empty and keep everything in memory.
  }
  return { ...EMPTY_SNAPSHOT, state: parseLiveState(raw) };
}

export function getLiveSnapshot(): LiveSnapshot {
  snapshot ??= load();
  return snapshot;
}

export function getServerLiveSnapshot(): LiveSnapshot {
  return EMPTY_SNAPSHOT;
}

export function subscribeLive(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function publish(change: Partial<LiveSnapshot>): void {
  const current = getLiveSnapshot();
  const next = { ...current, ...change };
  if (change.state && change.state !== current.state) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(change.state));
      next.storageFull = false;
    } catch {
      next.storageFull = true;
    }
  }
  snapshot = next;
  for (const listener of listeners) listener();
}

function update(change: (state: LiveState) => LiveState): void {
  publish({ state: change(getLiveSnapshot().state) });
}

/** An error answer from one of the app's API routes. */
class ApiError extends Error {
  override name = "ApiError";

  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new ApiError(data.error ?? `The server answered with HTTP ${response.status}.`, response.status);
  return data;
}

/** Fetches a feed into the archive. `folder` only applies when the feed is new, and `isNew` says whether it was. */
async function fetchFeed(url: string, folder?: string): Promise<{ source: Source; articles: Article[]; isNew: boolean }> {
  const fetched = await post<{ source: Source; articles: Article[] }>("/api/feeds", { url });
  // Sources are keyed by the feed's address after redirects, so this also catches an old http:// address.
  const isNew = !getLiveSnapshot().state.sources.some((source) => source.id === fetched.source.id);
  const source = folder ? { ...fetched.source, folder } : fetched.source;
  update((state) => addFetched(state, source, fetched.articles, new Date()));
  return { ...fetched, isNew };
}

async function regroup(): Promise<void> {
  const articles = articlesToGroup(getLiveSnapshot().state);
  if (articles.length === 0) return;
  const { clusters } = await post<{ clusters: LiveStory[] }>("/api/stories", { articles });
  update((state) => applyGrouping(state, new Set(articles.map((article) => article.id)), clusters));
}

const comparing = new Set<string>();

/** Compares every story that needs it, two at a time. Returns the first error message, if any. */
async function compareStories(): Promise<string | null> {
  let firstError: string | null = null;
  const run = async (story: LiveStory) => {
    const { state, failed } = getLiveSnapshot();
    const signature = storySignature(story, state.articles);
    if (comparing.has(signature) || failed.has(signature)) return;
    comparing.add(signature);
    try {
      const articles = story.articleIds.map((id) => state.articles[id]);
      const comparison = await post<SavedComparison>("/api/compare", { articles });
      update((current) => saveComparison(current, signature, comparison));
    } catch (error) {
      firstError ??= (error as Error).message;
      publish({ failed: new Set([...getLiveSnapshot().failed, signature]) });
    } finally {
      comparing.delete(signature);
    }
  };
  const queue = storiesToCompare(getLiveSnapshot().state);
  const worker = async () => {
    for (let story = queue.shift(); story; story = queue.shift()) await run(story);
  };
  await Promise.all([worker(), worker()]);
  return firstError;
}

export interface LiveResult {
  ok: boolean;
  message: string;
}

export interface LiveRemoval {
  /** Complete state to put back if the reader chooses Undo. */
  before: LiveState;
  articleIds: string[];
  storyIds: Record<string, string | null>;
}

/** Deletes archived articles immediately, without fetching or regrouping anything. */
export function removeLiveArticles(articleIds: readonly string[]): LiveRemoval | null {
  const before = getLiveSnapshot().state;
  const existing = articleIds.filter((id) => id in before.articles);
  if (existing.length === 0) return null;
  const removal = removeFromArchive(before, existing);
  publish({ state: removal.state, failed: new Set() });
  return { before, articleIds: existing, storyIds: removal.storyIds };
}

/** Unsubscribes from one feed and removes its archived articles. */
export function removeLiveFeed(sourceId: string): LiveRemoval | null {
  const before = getLiveSnapshot().state;
  const source = before.sources.find((candidate) => candidate.id === sourceId && isFeedSource(candidate));
  if (!source) return null;
  const articleIds = Object.values(before.articles)
    .filter((article) => article.sourceId === sourceId)
    .map((article) => article.id);
  const removal = removeFromArchive(before, articleIds, sourceId);
  publish({ state: removal.state, failed: new Set() });
  return { before, articleIds, storyIds: removal.storyIds };
}

/** Restores a complete archive snapshot, including sources, groups, and comparisons. */
export function restoreLiveState(state: LiveState): void {
  publish({ state, failed: new Set() });
}

/** Subscribes to a feed: fetches it, regroups stories, and compares the new ones. */
export async function addFeed(url: string): Promise<LiveResult> {
  publish({ busy: true });
  try {
    const { source, articles } = await fetchFeed(url);
    await regroup();
    publish({ busy: false });
    const comparisonError = await compareStories();
    if (comparisonError) return { ok: true, message: `Added ${source.name}, but some stories couldn't be compared: ${comparisonError}` };
    return { ok: true, message: `Added ${source.name} with ${articles.length} articles.` };
  } catch (error) {
    publish({ busy: false });
    return { ok: false, message: `Couldn't add that feed: ${(error as Error).message}` };
  }
}

/** Saves one extracted page, then groups and compares it without creating a feed subscription. */
export async function addArticle(url: string): Promise<LiveResult> {
  publish({ busy: true });
  let fetched: { source: Source; article: Article };
  let isNew: boolean;
  try {
    fetched = await post<{ source: Source; article: Article }>("/api/articles", { url });
    isNew = !(fetched.article.id in getLiveSnapshot().state.articles);
    update((state) => addFetched(state, fetched.source, [fetched.article], new Date()));
  } catch (error) {
    publish({ busy: false });
    return { ok: false, message: `Couldn't save that article: ${(error as Error).message}` };
  }

  if (!isNew) {
    publish({ busy: false });
    return { ok: true, message: "That article is already in your archive." };
  }

  let groupingError: string | null = null;
  try {
    await regroup();
  } catch (error) {
    groupingError = (error as Error).message;
  }
  publish({ busy: false });
  const comparisonError = groupingError ? null : await compareStories();
  const message = `Saved “${fetched.article.title}”.`;
  if (groupingError) return { ok: true, message: `${message} It couldn't be grouped into stories: ${groupingError}` };
  if (comparisonError) return { ok: true, message: `${message} Some stories couldn't be compared: ${comparisonError}` };
  return { ok: true, message };
}

/** How many feeds an import fetches at once. Each fetch also reads up to 30 article pages on the server. */
const IMPORT_CONCURRENCY = 3;

/** Reads an OPML file the visitor picked and subscribes to its feeds. The file never leaves the browser. */
export async function importOpmlFile(file: File, onProgress?: (done: number, total: number) => void): Promise<LiveResult> {
  // Loaded on first use, so the XML parser isn't in the bundle every visitor downloads.
  const { MAX_OPML_BYTES, OpmlParseError, parseOpml } = await import("./opml");
  if (file.size > MAX_OPML_BYTES) return { ok: false, message: "That file is too big to be a subscription list." };
  let text: string;
  try {
    text = await file.text();
  } catch {
    return { ok: false, message: "Couldn't read that file." };
  }
  let feeds: OpmlFeed[];
  try {
    feeds = parseOpml(text);
  } catch (error) {
    if (error instanceof OpmlParseError) return { ok: false, message: error.message };
    throw error;
  }
  return importFeeds(feeds, onProgress);
}

/**
 * Subscribes to the feeds that aren't subscribed yet, in their folders, then regroups and
 * compares once. Stops early when the server's hourly feed limit is reached.
 */
async function importFeeds(feeds: readonly OpmlFeed[], onProgress?: (done: number, total: number) => void): Promise<LiveResult> {
  const { state, busy } = getLiveSnapshot();
  if (busy) return { ok: false, message: "Wait for the feeds that are loading to finish, then import the file again." };
  const queue = feedsToImport(state, feeds);
  const outcome: ImportOutcome = {
    listed: feeds.length,
    already: feeds.length - queue.length,
    added: 0,
    failures: [],
    limited: false,
    groupingError: null,
    comparisonError: null,
  };
  if (queue.length === 0) return { ok: feeds.length > 0, message: importMessage(outcome) };

  publish({ busy: true });
  const pending = [...queue];
  let done = 0;
  let fetched = 0;
  onProgress?.(done, queue.length);
  const worker = async () => {
    for (let feed = pending.shift(); feed && !outcome.limited; feed = pending.shift()) {
      try {
        const { isNew } = await fetchFeed(feed.url, feed.folder);
        fetched++;
        if (isNew) outcome.added++;
        else outcome.already++;
      } catch (error) {
        if (error instanceof ApiError && error.status === 429) outcome.limited = true;
        else outcome.failures.push(`${feed.title}: ${(error as Error).message}`);
      }
      onProgress?.(++done, queue.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(IMPORT_CONCURRENCY, queue.length) }, worker));

  try {
    if (fetched > 0) await regroup();
  } catch (error) {
    outcome.groupingError = (error as Error).message;
  }
  publish({ busy: false });
  if (fetched > 0) outcome.comparisonError = await compareStories();
  return { ok: outcome.added > 0 || outcome.already === outcome.listed, message: importMessage(outcome) };
}

/** Fetches every feed that's out of date (or all of them with `force`), then regroups and compares. */
export async function refreshFeeds(force = false): Promise<LiveResult | null> {
  const { state, busy } = getLiveSnapshot();
  const feeds = state.sources.filter(isFeedSource);
  if (busy || feeds.length === 0) return null;
  const stale = feeds.filter((source) => force || Date.now() - Date.parse(source.fetchedAt) > STALE_MS);
  publish({ busy: true });
  const errors: string[] = [];
  const before = Object.keys(state.articles).length;
  for (const source of stale) {
    try {
      await fetchFeed(source.feedUrl);
    } catch (error) {
      errors.push(`${source.name}: ${(error as Error).message}`);
    }
  }
  try {
    if (stale.length > 0) await regroup();
  } catch (error) {
    errors.push((error as Error).message);
  }
  publish({ busy: false });
  const comparisonError = await compareStories();
  if (comparisonError) errors.push(comparisonError);
  if (errors.length > 0) return { ok: false, message: `Some feeds didn't refresh. ${errors[0]}` };
  if (!force) return null;
  const added = Object.keys(getLiveSnapshot().state.articles).length - before;
  return { ok: true, message: added > 0 ? `${added} new articles.` : "No new articles." };
}
