"use client";

import type { SourceComparison } from "@/lib/adds";
import { formatPercent } from "@/lib/format";
import type { Cluster, FactId, ReaderData } from "@/lib/types";

interface Props {
  cluster: Cluster;
  comparisons: SourceComparison[];
  data: ReaderData;
  currentArticleId: string;
  onOpen: (articleId: string) => void;
  onPick: (articleId: string, factId: FactId) => void;
}

export function SourcePanel({ cluster, comparisons, data, currentArticleId, onOpen, onPick }: Props) {
  const sourceName = (articleId: string) =>
    data.sources.find((source) => source.id === data.articles[articleId].sourceId)?.name ?? "Unknown source";

  if (cluster.articleIds.length === 1) {
    return (
      <aside className="panel" aria-label="What each source adds">
        <h4 className="panel-title">What each source adds</h4>
        <p className="panel-note">Only {sourceName(cluster.primaryArticleId)} covered this story.</p>
      </aside>
    );
  }

  const nothingLeft = comparisons.every((comparison) => comparison.status !== "adds");

  return (
    <aside className="panel" aria-label="What each source adds">
      <h4 className="panel-title">What each source adds</h4>
      <p className="panel-note">
        {nothingLeft ? "Nothing new left in this story." : "Facts you haven’t read yet in this story."}
      </p>
      <ol className="panel-sources">
        {comparisons.map((comparison) => (
          <li
            key={comparison.articleId}
            className={`panel-source is-${comparison.status}${comparison.articleId === currentArticleId ? " is-current" : ""}`}
          >
            <div className="panel-source-head">
              <button type="button" className="panel-source-name" onClick={() => onOpen(comparison.articleId)}>
                {sourceName(comparison.articleId)}
              </button>
              <span className="panel-status">{statusLabel(comparison)}</span>
            </div>
            {comparison.duplicateScore !== null && (comparison.status === "adds" || comparison.status === "nothing-new") ? (
              <span className="meter" aria-hidden="true">
                <span style={{ width: formatPercent(comparison.duplicateScore) }} />
              </span>
            ) : null}
            {comparison.status === "adds" ? (
              <ul className="adds">
                {comparison.adds.map((factId) => (
                  <li key={factId}>
                    <button type="button" className="add" onClick={() => onPick(comparison.articleId, factId)}>
                      <span className="add-plus" aria-hidden="true">+</span> {cluster.facts[factId]?.text ?? factId}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ol>
    </aside>
  );
}

function statusLabel({ status, duplicateScore }: SourceComparison): string {
  switch (status) {
    case "primary":
      return "Opened first";
    case "read":
      return "Read";
    case "limited":
      return "Limited source content";
    case "nothing-new":
      return "No significant new information";
    case "adds":
      return duplicateScore === null ? "" : `${formatPercent(duplicateScore)} already seen`;
  }
}
