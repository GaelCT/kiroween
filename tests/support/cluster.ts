import type { Article, Cluster } from "@/lib/types";

export interface ArticleSpec {
  id: string;
  facts: string[];
  limited?: boolean;
  publishedAt?: string;
}

/** Builds a cluster whose first article is the primary. Each fact gets a made-up evidence sentence. */
export function buildCluster(specs: ArticleSpec[], id = "test-cluster"): { cluster: Cluster; articles: Record<string, Article> } {
  const articles: Record<string, Article> = {};
  specs.forEach((spec, index) => {
    articles[spec.id] = {
      id: spec.id,
      sourceId: `source-${index}`,
      title: `Article ${spec.id}`,
      url: `https://source-${index}.example/${spec.id}`,
      publishedAt: spec.publishedAt ?? new Date(Date.UTC(2026, 10, 16, index)).toISOString(),
      paragraphs: spec.facts.map((fact) => `Sentence for ${fact} in ${spec.id}.`),
      evidence: spec.facts.map((fact) => ({ factId: fact, sentence: `Sentence for ${fact} in ${spec.id}.` })),
      ...(spec.limited ? { limited: true } : {}),
    };
  });
  const factIds = [...new Set(specs.flatMap((spec) => spec.facts))];
  const cluster: Cluster = {
    id,
    title: `Cluster ${id}`,
    primaryArticleId: specs[0].id,
    articleIds: specs.map((spec) => spec.id),
    facts: Object.fromEntries(factIds.map((factId) => [factId, { id: factId, text: `Fact ${factId}` }])),
  };
  return { cluster, articles };
}
