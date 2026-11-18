// Scores story clustering against the starter pack's story files, which are its answer key.

import type { ReaderData } from "@/lib/types";
import { clusterArticles, type ClusterInput, type ClusterOptions, type StoryGroup } from "./cluster";

export interface ClusterScore {
  /** Share of grouped pairs that belong to the same story. */
  precision: number;
  /** Share of same-story pairs that were grouped. */
  recall: number;
  groups: StoryGroup[];
  /** Pairs grouped together that the answer key keeps apart. */
  wrongPairs: [string, string][];
  /** Pairs in one story in the answer key that ended up apart. */
  missedPairs: [string, string][];
}

export function clusterInputs(data: ReaderData): ClusterInput[] {
  return Object.values(data.articles).map((article) => ({
    id: article.id,
    sourceId: article.sourceId,
    title: article.title,
    publishedAt: article.publishedAt,
    paragraphs: article.paragraphs,
    ...(article.limited ? { limited: true } : {}),
  }));
}

/** `expected` maps article ID to its answer-key story ID. */
export function scoreClustering(
  inputs: readonly ClusterInput[],
  expected: ReadonlyMap<string, string>,
  options: ClusterOptions = {},
): ClusterScore {
  const groups = clusterArticles(inputs, options);
  const groupOf = new Map<string, number>();
  groups.forEach((group, index) => group.articleIds.forEach((id) => groupOf.set(id, index)));
  const ids = inputs.map((input) => input.id).sort();
  const wrongPairs: [string, string][] = [];
  const missedPairs: [string, string][] = [];
  let grouped = 0;
  let same = 0;
  let both = 0;
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const together = groupOf.get(ids[i]) === groupOf.get(ids[j]);
      const shouldBe = expected.get(ids[i]) === expected.get(ids[j]);
      if (together) grouped++;
      if (shouldBe) same++;
      if (together && shouldBe) both++;
      if (together && !shouldBe) wrongPairs.push([ids[i], ids[j]]);
      if (!together && shouldBe) missedPairs.push([ids[i], ids[j]]);
    }
  }
  return {
    precision: grouped === 0 ? 1 : both / grouped,
    recall: same === 0 ? 1 : both / same,
    groups,
    wrongPairs,
    missedPairs,
  };
}
