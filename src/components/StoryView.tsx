"use client";

import { compareCluster, highlightsFor, type History } from "@/lib/adds";
import type { Cluster, FactId, ReaderData } from "@/lib/types";
import { ArticleView, type ScrollTarget } from "./ArticleView";
import { SourcePanel } from "./SourcePanel";
import { StarButton } from "./StoryRow";

interface Props {
  cluster: Cluster;
  articleId: string;
  data: ReaderData;
  history: History;
  starred: boolean;
  scrollTarget: ScrollTarget | null;
  onOpen: (articleId: string) => void;
  onPick: (articleId: string, factId: FactId) => void;
  onStar: () => void;
  onPull: () => void;
  /** Present only for articles in the visitor's live archive, never sample data. */
  onDelete?: () => void;
  deleteDisabled?: boolean;
}

export function StoryView({ cluster, articleId, data, history, starred, scrollTarget, onOpen, onPick, onStar, onPull, onDelete, deleteDisabled }: Props) {
  const article = data.articles[articleId];
  const source = data.sources.find((candidate) => candidate.id === article.sourceId);
  const comparisons = compareCluster(cluster, data.articles, history);
  const highlights = new Set(highlightsFor(cluster, data.articles, history, articleId));

  return (
    <section className="story" aria-label={cluster.title}>
      <header className="story-header">
        <div className="story-heading">
          <StarButton starred={starred} onToggle={onStar} />
          <h2 className="story-title">{cluster.title}</h2>
        </div>
        <div className="story-tabs">
          <div className="source-tabs" aria-label="Sources (N/P)">
            {cluster.articleIds.map((id) => {
              const name = data.sources.find((candidate) => candidate.id === data.articles[id].sourceId)?.name ?? id;
              const read = history.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  className={`source-tab${id === articleId ? " is-current" : ""}${read ? " is-read" : ""}`}
                  aria-current={id === articleId ? "true" : undefined}
                  onClick={() => onOpen(id)}
                >
                  {name}
                  {read ? <span className="source-tab-check" aria-label="read"> ✓</span> : null}
                </button>
              );
            })}
          </div>
          <div className="story-actions">
            {cluster.articleIds.length > 1 ? (
              <button type="button" className="pull-button" onClick={onPull} title="Move this article into its own story">
                Not this story <kbd>X</kbd>
              </button>
            ) : null}
            {onDelete ? (
              <button
                type="button"
                className="delete-button"
                disabled={deleteDisabled}
                onClick={onDelete}
                title="Delete this article from your archive"
              >
                Delete article
              </button>
            ) : null}
          </div>
        </div>
      </header>
      <div className="story-body">
        {source ? <ArticleView article={article} source={source} highlights={highlights} scrollTarget={scrollTarget} /> : null}
        <SourcePanel
          cluster={cluster}
          comparisons={comparisons}
          data={data}
          currentArticleId={articleId}
          onOpen={onOpen}
          onPick={onPick}
        />
      </div>
    </section>
  );
}
