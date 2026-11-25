"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { applyDetached, pullOut } from "@/lib/clusters";
import { downloadArchiveBackup, readArchiveBackupFile, replaceArchiveBackup } from "@/lib/backup-store";
import { combineReaderData, isFeedSource, liveReaderData } from "@/lib/live";
import {
  addArticle,
  addFeed,
  getLiveSnapshot,
  getServerLiveSnapshot,
  importOpmlFile,
  refreshFeeds,
  removeLiveArticles,
  removeLiveFeed,
  restoreLiveState,
  subscribeLive,
  type LiveRemoval,
} from "@/lib/live-store";
import { articlesInView, storiesInView, unreadCounts, type View } from "@/lib/reader-view";
import {
  EMPTY_READING_STATE,
  getReadingSnapshot,
  getServerReadingSnapshot,
  markRead,
  pruneReading,
  subscribeReading,
  toggleStar,
  updateReading,
  type ReadingState,
} from "@/lib/reading-store";
import type { Cluster, FactId, ReaderData } from "@/lib/types";
import type { ScrollTarget } from "./ArticleView";
import { Sidebar } from "./Sidebar";
import { ArticleRow, StoryRow } from "./StoryRow";
import { StoryView } from "./StoryView";

interface Position {
  clusterId: string;
  articleId: string;
}

interface Toast {
  message: string;
  undo?: () => void;
}

/** How long rows take to collapse into stories. Matches the CSS animation. */
const COLLAPSE_MS = 650;

/** Finds the open article's cluster, following it if X or an undo moved it. */
function locate(clusters: Cluster[], position: Position | null): { cluster: Cluster; articleId: string } | null {
  if (!position) return null;
  const cluster =
    clusters.find((candidate) => candidate.id === position.clusterId && candidate.articleIds.includes(position.articleId)) ??
    clusters.find((candidate) => candidate.articleIds.includes(position.articleId));
  return cluster ? { cluster, articleId: position.articleId } : null;
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
}

function sampleNote(data: ReaderData): string {
  switch (data.sampleFacts) {
    case "pipeline":
      return "Fictional outlets and events. The AI pipeline extracted the facts ahead of time, so reading them makes no AI calls.";
    case "mixed":
      return "Fictional outlets and events. Some stories' facts were extracted by the AI pipeline ahead of time; the rest come from hand-written fact tables.";
    default:
      return "Fictional outlets and events. Facts come from hand-written fact tables.";
  }
}

function viewTitle(view: View, data: ReaderData): string {
  switch (view.kind) {
    case "all":
      return "All items";
    case "starred":
      return "Starred items";
    case "folder":
      return view.folder;
    case "search":
      return `Search results for “${view.query.trim()}”`;
    case "source":
      return data.sources.find((source) => source.id === view.sourceId)?.name ?? "Feed";
  }
}

export function Reader({ data: sample }: { data: ReaderData }) {
  const reading = useSyncExternalStore(subscribeReading, getReadingSnapshot, getServerReadingSnapshot);
  const live = useSyncExternalStore(subscribeLive, getLiveSnapshot, getServerLiveSnapshot);
  const data = useMemo(
    () => combineReaderData(sample, liveReaderData(live.state, live.failed)),
    [sample, live.state, live.failed],
  );
  const hasLiveFeeds = live.state.sources.some(isFeedSource);
  const clusters = useMemo(
    () => applyDetached(data.clusters, data.articles, reading.detached),
    [data, reading.detached],
  );
  const [view, setView] = useState<View>({ kind: "all" });
  const [position, setPosition] = useState<Position | null>(null);
  const [scrollTarget, setScrollTarget] = useState<ScrollTarget | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [collapsing, setCollapsing] = useState(false);
  const [query, setQuery] = useState("");
  const storyRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const collapseTimer = useRef<number | undefined>(undefined);

  const grouped = reading.grouped;
  const context = { clusters, articles: data.articles, sources: data.sources, starred: reading.starred };
  const stories = storiesInView(view, context);
  const articleIds = grouped ? [] : articlesInView(view, context);
  const clusterOf = new Map(clusters.flatMap((cluster) => cluster.articleIds.map((id) => [id, cluster] as const)));
  const counts = unreadCounts(clusters, data.articles, reading.history, grouped);
  const current = grouped ? locate(clusters, position) : null;

  const sourceName = (articleId: string) =>
    data.sources.find((source) => source.id === data.articles[articleId].sourceId)?.name ?? "Unknown source";

  function open(cluster: Cluster, articleId: string) {
    setPosition({ clusterId: cluster.id, articleId });
    updateReading((state) => markRead(state, [cluster.primaryArticleId, articleId]));
  }

  /** Collapses every article into its story, then opens one: the old Reader becomes the new one. */
  function groupIntoStories(then: Cluster | null) {
    if (collapsing) return;
    setCollapsing(true);
    window.clearTimeout(collapseTimer.current);
    collapseTimer.current = window.setTimeout(() => {
      setCollapsing(false);
      updateReading((state) => ({ ...state, grouped: true }));
      if (then) open(then, then.primaryArticleId);
    }, COLLAPSE_MS);
  }

  function showEveryArticle() {
    setPosition(null);
    updateReading((state) => ({ ...state, grouped: false }));
  }

  function changeView(next: View) {
    setView(next);
    setPosition(null);
    if (next.kind !== "search") setQuery("");
    listRef.current?.scrollTo({ top: 0 });
  }

  /** Searches every article, including the whole archive, as you type. */
  function search(text: string) {
    setQuery(text);
    changeView(text.trim() ? { kind: "search", query: text } : { kind: "all" });
  }

  function moveStory(step: 1 | -1) {
    const index = current ? stories.findIndex((cluster) => cluster.id === current.cluster.id) : -1;
    const next = stories[index === -1 ? 0 : index + step];
    if (next) open(next, next.primaryArticleId);
  }

  function moveSource(step: 1 | -1) {
    if (!current) return;
    const ids = current.cluster.articleIds;
    const next = ids[ids.indexOf(current.articleId) + step];
    if (next) open(current.cluster, next);
  }

  function pickFact(articleId: string, factId: FactId) {
    if (!current) return;
    open(current.cluster, articleId);
    setScrollTarget((previous) => ({ articleId, factId, nonce: (previous?.nonce ?? 0) + 1 }));
  }

  function star(clusterId: string) {
    updateReading((state) => toggleStar(state, clusterId));
  }

  function pull() {
    if (!current) return;
    const { cluster, articleId } = current;
    if (cluster.articleIds.length < 2) {
      setToast({ message: "This story has only one source." });
      return;
    }
    const left = pullOut(clusters, data.articles, articleId).find((candidate) => candidate.id === cluster.id);
    updateReading((state) => ({ ...state, detached: [...state.detached, articleId] }));
    if (left) open(left, left.primaryArticleId);
    setToast({
      message: `Moved “${data.articles[articleId].title}” from ${sourceName(articleId)} into its own story.`,
      undo: () => undoPull(articleId),
    });
  }

  /** Google Reader's "Mark all as read" (Shift+A), for the stories or articles in this view. */
  function markAllRead() {
    const ids = grouped ? stories.flatMap((cluster) => cluster.articleIds) : articleIds;
    const before = reading.history;
    const after = markRead(reading, ids);
    if (after === reading) {
      setToast({ message: "Everything here is already read." });
      return;
    }
    updateReading(() => after);
    const what = grouped ? `${stories.length} ${stories.length === 1 ? "story" : "stories"}` : `${ids.length} articles`;
    setToast({
      message: `Marked ${what} as read.`,
      undo: () => {
        updateReading((state) => ({ ...state, history: before }));
        setToast(null);
      },
    });
  }

  function undoPull(articleId: string) {
    updateReading((state) => ({ ...state, detached: state.detached.filter((id) => id !== articleId) }));
    setPosition({ clusterId: "", articleId });
    setToast(null);
  }

  function finishRemoval(removal: LiveRemoval, beforeReading: ReadingState, message: string) {
    updateReading((state) => pruneReading(state, removal.articleIds, removal.storyIds));
    if (position && removal.articleIds.includes(position.articleId)) setPosition(null);
    if (view.kind === "source" && !getLiveSnapshot().state.sources.some((source) => source.id === view.sourceId)) {
      setView({ kind: "all" });
    }
    setToast({
      message,
      undo: () => {
        restoreLiveState(removal.before);
        updateReading(() => beforeReading);
        setToast(null);
      },
    });
  }

  function deleteArticle(articleId: string) {
    const article = live.state.articles[articleId];
    if (!article || live.busy) return;
    const removal = removeLiveArticles([articleId]);
    if (removal) finishRemoval(removal, reading, `Deleted “${article.title}”.`);
  }

  function unsubscribe(sourceId: string) {
    const source = live.state.sources.find((candidate) => candidate.id === sourceId && isFeedSource(candidate));
    if (!source || live.busy) return;
    const count = Object.values(live.state.articles).filter((article) => article.sourceId === sourceId).length;
    const articles = `${count} archived ${count === 1 ? "article" : "articles"}`;
    if (!window.confirm(`Unsubscribe from ${source.name} and delete its ${articles}? You can undo this right afterward.`)) return;
    const removal = removeLiveFeed(sourceId);
    if (removal) finishRemoval(removal, reading, `Unsubscribed from ${source.name} and deleted ${articles}.`);
  }

  async function subscribe(url: string): Promise<boolean> {
    const result = await addFeed(url);
    setToast({ message: result.message });
    return result.ok;
  }

  async function saveArticle(url: string): Promise<boolean> {
    const result = await addArticle(url);
    setToast({ message: result.message });
    return result.ok;
  }

  /** Google Reader's "Import your subscriptions", from an OPML file another reader exported. */
  async function importSubscriptions(file: File, onProgress: (done: number, total: number) => void): Promise<boolean> {
    try {
      const result = await importOpmlFile(file, onProgress);
      setToast({ message: result.message });
      return result.ok;
    } catch (error) {
      setToast({ message: `Couldn't import that file: ${(error as Error).message}` });
      return false;
    }
  }

  function exportBackup() {
    setToast(downloadArchiveBackup());
  }

  async function importBackup(file: File): Promise<boolean> {
    if (live.busy) {
      setToast({ message: "Wait for the current feed work to finish, then restore the backup again." });
      return false;
    }
    try {
      const backup = await readArchiveBackupFile(file);
      const count = Object.keys(backup.archive.articles).length;
      if (!window.confirm(`Replace this browser’s current archive and reading state with the backup’s ${count} ${count === 1 ? "article" : "articles"}? This cannot be undone.`)) {
        return false;
      }
      const result = replaceArchiveBackup(backup);
      setPosition(null);
      setView({ kind: "all" });
      setToast(result);
      return result.ok;
    } catch (error) {
      setToast({ message: `Couldn't restore that backup: ${(error as Error).message}` });
      return false;
    }
  }

  async function refresh() {
    const result = await refreshFeeds(true);
    if (result) setToast({ message: result.message });
  }

  function reset() {
    if (!window.confirm("Clear your reading history, stars, and story changes?")) return;
    updateReading(() => EMPTY_READING_STATE);
    setPosition(null);
    setView({ kind: "all" });
    setToast(null);
  }

  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;
    const actions: Record<string, () => void> = grouped
      ? {
          j: () => moveStory(1),
          k: () => moveStory(-1),
          n: () => moveSource(1),
          p: () => moveSource(-1),
          x: pull,
          s: () => current && star(current.cluster.id),
          A: markAllRead,
          "/": () => searchRef.current?.focus(),
        }
      : { j: () => groupIntoStories(stories[0] ?? null), A: markAllRead, "/": () => searchRef.current?.focus() };
    const action = actions[event.key];
    if (!action) return;
    event.preventDefault();
    action();
  });

  // Live feeds refresh once per visit when they're out of date, and finish any comparisons left over.
  useEffect(() => {
    void refreshFeeds().then((result) => {
      if (result) setToast({ message: result.message });
    });
  }, []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => onKey(event);
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
      window.clearTimeout(collapseTimer.current);
    };
  }, []);

  const openClusterId = current?.cluster.id;
  useEffect(() => {
    if (openClusterId) storyRef.current?.scrollIntoView({ block: "start" });
  }, [openClusterId]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 7000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  return (
    <div className="reader">
      <header className="topbar">
        <span className="wordmark">Reader</span>
        {data.sample ? (
          <span className="sample-badge" title={sampleNote(data)}>
            Sample data
          </span>
        ) : null}
        <form className="search" role="search" onSubmit={(event) => event.preventDefault()}>
          <input
            ref={searchRef}
            type="search"
            className="search-input"
            placeholder="Search all items  /"
            aria-label="Search all items"
            value={query}
            onChange={(event) => search(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                search("");
                event.currentTarget.blur();
              }
            }}
          />
        </form>
        <span className="key-hints">
          <kbd>J</kbd>/<kbd>K</kbd> story · <kbd>N</kbd>/<kbd>P</kbd> source · <kbd>S</kbd> star · <kbd>X</kbd> not this story
        </span>
        <button type="button" className="topbar-button" onClick={reset}>
          Reset reading
        </button>
      </header>

      <div className="reader-body">
        <Sidebar
          sources={data.sources}
          counts={counts}
          view={view}
          onView={changeView}
          busy={live.busy}
          removableFeedIds={new Set(live.state.sources.filter(isFeedSource).map((source) => source.id))}
          onAddFeed={subscribe}
          onAddArticle={saveArticle}
          onImport={importSubscriptions}
          onUnsubscribe={unsubscribe}
          onExportBackup={exportBackup}
          onImportBackup={importBackup}
        />

        <main className="list-pane">
          <div className="toolbar">
            <h1 className="view-title">{viewTitle(view, data)}</h1>
            <div className="show-toggle" role="group" aria-label="Show">
              Show:
              <button
                type="button"
                aria-pressed={grouped}
                className={grouped ? "is-on" : ""}
                onClick={() => (grouped ? undefined : groupIntoStories(null))}
              >
                Stories
              </button>
              <button type="button" aria-pressed={!grouped} className={grouped ? "" : "is-on"} onClick={showEveryArticle}>
                Every article
              </button>
            </div>
            {hasLiveFeeds ? (
              <button type="button" className="toolbar-button" onClick={() => void refresh()} disabled={live.busy}>
                {live.busy ? "Refreshing…" : "Refresh"}
              </button>
            ) : null}
            <button
              type="button"
              className={`toolbar-button${hasLiveFeeds ? " toolbar-button-next" : ""}`}
              onClick={markAllRead}
              title="Shift+A"
            >
              Mark all as read
            </button>
          </div>

          <div className="list" ref={listRef}>
            {live.storageFull ? (
              <p className="storage-note" role="status">
                This browser’s storage is full, so new articles only last until you reload.
              </p>
            ) : null}
            {grouped ? null : (
              <div className="overload">
                <strong>
                  {articleIds.length} articles, {stories.length} stories.
                </strong>{" "}
                Most of these articles repeat each other. Press <kbd>J</kbd> to read them as stories.
                <button type="button" className="overload-button" onClick={() => groupIntoStories(stories[0] ?? null)}>
                  Group into stories
                </button>
              </div>
            )}

            {grouped
              ? stories.map((cluster) =>
                  current && cluster.id === current.cluster.id ? (
                    <div key={cluster.id} ref={storyRef} className="story-slot">
                      <StoryView
                        cluster={cluster}
                        articleId={current.articleId}
                        data={data}
                        history={reading.history}
                        starred={reading.starred.includes(cluster.id)}
                        scrollTarget={scrollTarget}
                        onOpen={(articleId) => open(cluster, articleId)}
                        onPick={pickFact}
                        onStar={() => star(cluster.id)}
                        onPull={pull}
                        onDelete={current.articleId in live.state.articles ? () => deleteArticle(current.articleId) : undefined}
                        deleteDisabled={live.busy}
                      />
                    </div>
                  ) : (
                    <StoryRow
                      key={cluster.id}
                      cluster={cluster}
                      data={data}
                      history={reading.history}
                      starred={reading.starred.includes(cluster.id)}
                      onOpen={() => open(cluster, cluster.primaryArticleId)}
                      onStar={() => star(cluster.id)}
                    />
                  ),
                )
              : articleIds.map((articleId) => {
                  const cluster = clusterOf.get(articleId)!;
                  return (
                    <ArticleRow
                      key={articleId}
                      articleId={articleId}
                      cluster={cluster}
                      data={data}
                      read={reading.history.includes(articleId)}
                      starred={reading.starred.includes(cluster.id)}
                      collapsing={collapsing}
                      onOpen={() => groupIntoStories(cluster)}
                      onStar={() => star(cluster.id)}
                      onDelete={articleId in live.state.articles ? () => deleteArticle(articleId) : undefined}
                      deleteDisabled={live.busy}
                    />
                  );
                })}

            {grouped && stories.length === 0 ? (
              <p className="empty-hint">
                {view.kind === "starred" ? (
                  <>
                    No starred stories yet. Press <kbd>S</kbd> on a story to star it.
                  </>
                ) : view.kind === "search" ? (
                  `No articles match “${view.query.trim()}”.`
                ) : (
                  "No stories here."
                )}
              </p>
            ) : null}
            {grouped && stories.length > 0 && !current ? (
              <p className="empty-hint">
                Press <kbd>J</kbd> to open the first story.
              </p>
            ) : null}
          </div>
        </main>
      </div>

      {toast ? (
        <div className="toast" role="status">
          <span>{toast.message}</span>
          {toast.undo ? (
            <button type="button" className="toast-undo" onClick={toast.undo}>
              Undo
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
