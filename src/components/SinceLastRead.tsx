"use client";

import { formatDateTime, formatShortDate } from "@/lib/format";
import type { StoryVisit } from "@/lib/reading-store";
import { changesSinceLastVisit } from "@/lib/story-changes";
import type { Cluster, FactId, ReaderData } from "@/lib/types";
import styles from "./SinceLastRead.module.css";

interface Props {
  cluster: Cluster;
  data: ReaderData;
  previous: StoryVisit;
  onPick: (articleId: string, factId: FactId) => void;
}

export function SinceLastRead({ cluster, data, previous, onPick }: Props) {
  const changes = changesSinceLastVisit(cluster, data.articles, previous);
  return (
    <section className={styles.summary} aria-labelledby="since-last-read-title">
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>Return visit</p>
          <h3 id="since-last-read-title">Since your last read</h3>
        </div>
        <p className={styles.previous}>Previous visit: {formatDateTime(previous.visitedAt)}</p>
      </div>
      {changes.length === 0 ? (
        <p className={styles.empty}>No new developments.</p>
      ) : (
        <ul className={styles.list}>
          {changes.map((change) => {
            const source = data.sources.find((candidate) => candidate.id === data.articles[change.articleId].sourceId);
            return (
              <li key={change.factId} className={styles.change}>
                <button type="button" className={styles.fact} onClick={() => onPick(change.articleId, change.factId)}>
                  {change.text}
                </button>
                <p className={styles.context}>
                  {source?.name ?? "Unknown source"} · Article published {formatShortDate(change.publishedAt)}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
