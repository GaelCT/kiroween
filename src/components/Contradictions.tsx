"use client";

import type { Contradiction, FactId } from "@/lib/types";
import styles from "./Contradictions.module.css";

interface Props {
  contradictions: readonly Contradiction[];
  sourceName: (articleId: string) => string;
  onPick: (articleId: string, factId: FactId) => void;
}

/** Neutral, source-backed disagreements. The quotes are the verdict-free evidence. */
export function Contradictions({ contradictions, sourceName, onPick }: Props) {
  if (contradictions.length === 0) return null;
  return (
    <section className={styles.contradictions} aria-label="Conflicting claims">
      <h5 className={styles.title}>Conflicting claims</h5>
      <p className={styles.note}>These sources disagree. Compare their original quotes; neither is marked as correct.</p>
      <ul className={styles.list}>
        {contradictions.map((contradiction) => (
          <li key={contradiction.id} className={styles.contradiction}>
            <h6 className={styles.topic}>{contradiction.topic}</h6>
            {contradiction.claims.map((claim) => (
              <blockquote key={`${claim.articleId}:${claim.factId}`} className={styles.quote}>
                <p>“{claim.quote}”</p>
                <footer>
                  <button type="button" onClick={() => onPick(claim.articleId, claim.factId)}>
                    {sourceName(claim.articleId)}
                  </button>
                </footer>
              </blockquote>
            ))}
          </li>
        ))}
      </ul>
    </section>
  );
}
