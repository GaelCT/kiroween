"use client";

import { clusterState, isWorthReading, type History } from "@/lib/adds";
import { formatShortDate } from "@/lib/format";
import type { Cluster, ReaderData } from "@/lib/types";

export function StarButton({ starred, onToggle }: { starred: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className={`star${starred ? " is-starred" : ""}`}
      aria-pressed={starred}
      aria-label={starred ? "Unstar story (S)" : "Star story (S)"}
      onClick={onToggle}
    >
      {starred ? "★" : "☆"}
    </button>
  );
}

interface StoryRowProps {
  cluster: Cluster;
  data: ReaderData;
  history: History;
  starred: boolean;
  onOpen: () => void;
  onStar: () => void;
}

/** One story in the list, in the layout of Google Reader's list view. */
export function StoryRow({ cluster, data, history, starred, onOpen, onStar }: StoryRowProps) {
  const primary = data.articles[cluster.primaryArticleId];
  const state = clusterState(cluster, data.articles, history);
  const others = cluster.articleIds.length - 1;
  const left = state === "partly-read" ? cluster.articleIds.filter((id) => isWorthReading(cluster, data.articles, history, id)).length : 0;
  return (
    <div className={`row is-${state}`}>
      <StarButton starred={starred} onToggle={onStar} />
      <button type="button" className="row-main" onClick={onOpen}>
        <span className="row-source">
          {sourceName(data, primary.sourceId)}
          {others > 0 ? (
            <span className="row-more" title={`${others + 1} sources: ${cluster.articleIds.map((id) => sourceName(data, data.articles[id].sourceId)).join(", ")}`}>
              {" "}+{others}
            </span>
          ) : null}
        </span>
        <span className="row-text">
          <span className="row-title">{cluster.title}</span>
          <span className="row-snippet"> - {primary.paragraphs[0] ?? ""}</span>
        </span>
        {left > 0 ? <span className="row-left" title={`${left} more to read in this story`}>{left} new</span> : null}
        <time className="row-date" dateTime={primary.publishedAt}>{formatShortDate(primary.publishedAt)}</time>
      </button>
    </div>
  );
}

interface ArticleRowProps {
  articleId: string;
  cluster: Cluster;
  data: ReaderData;
  read: boolean;
  starred: boolean;
  /** Set while rows collapse into stories. */
  collapsing: boolean;
  onOpen: () => void;
  onStar: () => void;
  /** Present only for articles in the visitor's live archive, never sample data. */
  onDelete?: () => void;
  deleteDisabled?: boolean;
}

/** One article in the ungrouped list, the way the old Reader showed every item. */
export function ArticleRow({ articleId, cluster, data, read, starred, collapsing, onOpen, onStar, onDelete, deleteDisabled }: ArticleRowProps) {
  const article = data.articles[articleId];
  const isPrimary = articleId === cluster.primaryArticleId;
  const others = cluster.articleIds.length - 1;
  const motion = collapsing && others > 0 ? (isPrimary ? " is-gaining" : " is-collapsing") : "";
  return (
    <div className={`row ${read ? "is-read" : "is-unread"}${motion}`}>
      <StarButton starred={starred} onToggle={onStar} />
      <button type="button" className="row-main" onClick={onOpen}>
        <span className="row-source">
          {sourceName(data, article.sourceId)}
          {motion === " is-gaining" ? <span className="row-more"> +{others}</span> : null}
        </span>
        <span className="row-text">
          <span className="row-title">{article.title}</span>
          <span className="row-snippet"> - {article.paragraphs[0] ?? ""}</span>
        </span>
        <time className="row-date" dateTime={article.publishedAt}>{formatShortDate(article.publishedAt)}</time>
      </button>
      {onDelete ? (
        <button
          type="button"
          className="row-delete"
          aria-label={`Delete ${article.title}`}
          title="Delete this article from your archive"
          disabled={deleteDisabled}
          onClick={onDelete}
        >
          ×
        </button>
      ) : null}
    </div>
  );
}

function sourceName(data: ReaderData, sourceId: string): string {
  return data.sources.find((source) => source.id === sourceId)?.name ?? sourceId;
}
