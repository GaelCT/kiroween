"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { formatDateTime } from "@/lib/format";
import type { Article, Evidence, FactId, Source } from "@/lib/types";

export interface ScrollTarget {
  articleId: string;
  factId: FactId;
  /** Changes on every click, so picking the same fact twice scrolls again. */
  nonce: number;
}

interface Props {
  article: Article;
  source: Source;
  /** Facts that were new when the user first opened this article. */
  highlights: ReadonlySet<FactId>;
  scrollTarget: ScrollTarget | null;
}

export function ArticleView({ article, source, highlights, scrollTarget }: Props) {
  const body = useRef<HTMLDivElement>(null);
  const marks = article.evidence.filter((evidence) => highlights.has(evidence.factId));

  useEffect(() => {
    if (!scrollTarget || scrollTarget.articleId !== article.id) return;
    const mark = body.current?.querySelector<HTMLElement>(`[data-evidence="${scrollTarget.factId}"]`);
    if (!mark) return;
    mark.scrollIntoView({ block: "center", behavior: "smooth" });
    mark.classList.add("is-flashing");
    const timer = window.setTimeout(() => mark.classList.remove("is-flashing"), 1600);
    return () => window.clearTimeout(timer);
  }, [scrollTarget, article.id]);

  return (
    <article className="article">
      <p className="article-meta">
        <span className="article-source">{source.name}</span>
        {article.author ? <> · {article.author}</> : null} · <time dateTime={article.publishedAt}>{formatDateTime(article.publishedAt)}</time>
      </p>
      <h3 className="article-title">{article.title}</h3>
      <div className="article-body" ref={body}>
        {article.paragraphs.map((paragraph, index) => (
          <p key={index}>{withMarks(paragraph, marks)}</p>
        ))}
      </div>
    </article>
  );
}

/** Wraps each highlighted evidence sentence in a <mark>. */
function withMarks(paragraph: string, marks: Evidence[]): ReactNode[] {
  const found = marks
    .map((evidence) => ({ ...evidence, start: paragraph.indexOf(evidence.sentence) }))
    .filter((evidence) => evidence.start >= 0)
    .sort((a, b) => a.start - b.start);
  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (const evidence of found) {
    if (evidence.start < cursor) continue;
    if (evidence.start > cursor) nodes.push(paragraph.slice(cursor, evidence.start));
    nodes.push(
      <mark key={evidence.factId} data-evidence={evidence.factId} title="New to you in this story">
        {evidence.sentence}
      </mark>,
    );
    cursor = evidence.start + evidence.sentence.length;
  }
  if (cursor < paragraph.length) nodes.push(paragraph.slice(cursor));
  return nodes;
}
