// The visitor's live feeds and archive in localStorage, and the calls that fill them
// (issues #20 and #21). Browser only. Fetching, grouping, and AI comparison all run on the
// server; this file only sends requests and keeps the results.

import type { Article, Source } from "./types";
import {
  addFetched,
  applyGrouping,
  articlesToGroup,
  EMPTY_LIVE_STATE,
  parseLiveState,
  saveComparison,
  storiesToCompare,
  storySignature,
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

async function post<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? `The server answered with HTTP ${response.status}.`);
  return data;
}

async function fetchFeed(url: string): Promise<{ source: Source; articles: Article[] }> {
  const fetched = await post<{ source: Source; articles: Article[] }>("/api/feeds", { url });
  update((state) => addFetched(state, fetched.source, fetched.articles, new Date()));
  return fetched;
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

/** Fetches every feed that's out of date (or all of them with `force`), then regroups and compares. */
export async function refreshFeeds(force = false): Promise<LiveResult | null> {
  const { state, busy } = getLiveSnapshot();
  if (busy || state.sources.length === 0) return null;
  const stale = state.sources.filter((source) => force || Date.now() - Date.parse(source.fetchedAt) > STALE_MS);
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
