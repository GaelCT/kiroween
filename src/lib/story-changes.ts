import type { StoryVisit } from "./reading-store";
import type { Article, Cluster, FactId } from "./types";

export interface StoryChange {
  factId: FactId;
  text: string;
  articleId: string;
  publishedAt: string;
}

function wording(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Compares ready fact snapshots deterministically; no model request is needed on a return visit. */
export function changesSinceLastVisit(
  cluster: Cluster,
  articles: Readonly<Record<string, Article>>,
  previous: StoryVisit | undefined,
): StoryChange[] {
  if (!previous) return [];
  const oldWording = new Set(Object.values(previous.facts).map(wording));
  return Object.values(cluster.facts).flatMap((fact): StoryChange[] => {
    if (Object.hasOwn(previous.facts, fact.id) || oldWording.has(wording(fact.text))) return [];
    const articleId = cluster.articleIds.find((id) => articles[id]?.evidence.some((item) => item.factId === fact.id));
    if (!articleId) return [];
    return [{ factId: fact.id, text: fact.text, articleId, publishedAt: articles[articleId].publishedAt }];
  });
}
