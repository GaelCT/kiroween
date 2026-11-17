"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { applyDetached, pullOut } from "@/lib/clusters";
import {
  EMPTY_READING_STATE,
  getReadingSnapshot,
  getServerReadingSnapshot,
  markRead,
  subscribeReading,
  updateReading,
} from "@/lib/reading-store";
import type { Cluster, FactId, ReaderData } from "@/lib/types";
import type { ScrollTarget } from "./ArticleView";
import { StoryView } from "./StoryView";

interface Position {
  clusterId: string;
  articleId: string;
}

interface Toast {
  message: string;
  undoArticleId?: string;
}

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

export function Reader({ data }: { data: ReaderData }) {
  const reading = useSyncExternalStore(subscribeReading, getReadingSnapshot, getServerReadingSnapshot);
  const clusters = useMemo(
    () => applyDetached(data.clusters, data.articles, reading.detached),
    [data, reading.detached],
  );
  const [position, setPosition] = useState<Position | null>(null);
  const [scrollTarget, setScrollTarget] = useState<ScrollTarget | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const storyRef = useRef<HTMLDivElement>(null);
  const current = locate(clusters, position);

  const sourceName = (articleId: string) =>
    data.sources.find((source) => source.id === data.articles[articleId].sourceId)?.name ?? "Unknown source";

  function open(cluster: Cluster, articleId: string) {
    setPosition({ clusterId: cluster.id, articleId });
    updateReading((state) => markRead(state, [cluster.primaryArticleId, articleId]));
  }

  function moveStory(step: 1 | -1) {
    const index = current ? clusters.indexOf(current.cluster) : -1;
    const next = clusters[index === -1 ? 0 : index + step];
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
      undoArticleId: articleId,
    });
  }

  function undoPull(articleId: string) {
    updateReading((state) => ({ ...state, detached: state.detached.filter((id) => id !== articleId) }));
    setPosition({ clusterId: "", articleId });
    setToast(null);
  }

  function reset() {
    if (!window.confirm("Clear your reading history and story changes?")) return;
    updateReading(() => EMPTY_READING_STATE);
    setPosition(null);
    setToast(null);
  }

  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;
    const actions: Record<string, () => void> = {
      j: () => moveStory(1),
      k: () => moveStory(-1),
      n: () => moveSource(1),
      p: () => moveSource(-1),
      x: pull,
    };
    const action = actions[event.key];
    if (!action) return;
    event.preventDefault();
    action();
  });

  useEffect(() => {
    const handler = (event: KeyboardEvent) => onKey(event);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
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
          <span className="sample-badge" title="Fictional outlets and events. Facts come from hand-written fact tables.">
            Sample data
          </span>
        ) : null}
        <span className="key-hints">
          <kbd>J</kbd>/<kbd>K</kbd> story · <kbd>N</kbd>/<kbd>P</kbd> source · <kbd>X</kbd> not this story
        </span>
        <button type="button" className="topbar-button" onClick={reset}>
          Reset reading
        </button>
      </header>

      <main className="stories">
        {clusters.map((cluster) =>
          current && cluster.id === current.cluster.id ? (
            <div key={cluster.id} ref={storyRef} className="story-slot">
              <StoryView
                cluster={cluster}
                articleId={current.articleId}
                data={data}
                history={reading.history}
                scrollTarget={scrollTarget}
                onOpen={(articleId) => open(cluster, articleId)}
                onPick={pickFact}
              />
            </div>
          ) : (
            <button key={cluster.id} type="button" className="story-row" onClick={() => open(cluster, cluster.primaryArticleId)}>
              <span className="story-row-title">{cluster.title}</span>
              <span className="story-row-sources">
                {cluster.articleIds.length === 1 ? sourceName(cluster.primaryArticleId) : `${cluster.articleIds.length} sources`}
              </span>
            </button>
          ),
        )}
        {current ? null : <p className="empty-hint">Press J to open the first story.</p>}
      </main>

      {toast ? (
        <div className="toast" role="status">
          <span>{toast.message}</span>
          {toast.undoArticleId ? (
            <button type="button" className="toast-undo" onClick={() => undoPull(toast.undoArticleId!)}>
              Undo
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
