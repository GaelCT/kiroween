// Correctness properties P1 to P8 from .kiro/specs/comparison-pipeline/design.md.

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  addsFor,
  clusterState,
  compareCluster,
  duplicateScore,
  factIdsOf,
  isWorthReading,
  readInCluster,
  type ArticleMap,
} from "@/lib/adds";
import type { Cluster } from "@/lib/types";
import { buildCluster } from "./support/cluster";

const FACTS = ["f01", "f02", "f03", "f04", "f05", "f06", "f07", "f08"];
const OTHER_CLUSTER = ["elsewhere-1", "elsewhere-2"];

interface Scenario {
  cluster: Cluster;
  articles: ArticleMap;
  /** Read articles in first-read order, mixed with reads from other clusters. */
  history: string[];
  /** Articles the user reads next. */
  more: string[];
}

const scenarios: fc.Arbitrary<Scenario> = fc
  .array(fc.tuple(fc.subarray(FACTS), fc.boolean()), { minLength: 1, maxLength: 6 })
  .chain((specs) => {
    const { cluster, articles } = buildCluster(
      specs.map(([facts, limited], index) => ({ id: `a${index}`, facts, limited: limited && facts.length === 0 })),
    );
    return fc
      .shuffledSubarray([...cluster.articleIds, ...OTHER_CLUSTER])
      .chain((history) =>
        fc
          .shuffledSubarray(cluster.articleIds.filter((id) => !history.includes(id)))
          .map((more): Scenario => ({ cluster, articles, history, more })),
      );
  });

const RUNS = { numRuns: 300 };

function seenBy({ cluster, articles, history }: Scenario): Set<string> {
  const seen = new Set(factIdsOf(articles[cluster.primaryArticleId]));
  for (const id of readInCluster(cluster, history)) for (const fact of factIdsOf(articles[id])) seen.add(fact);
  return seen;
}

function isUnread({ cluster, history }: Scenario, id: string): boolean {
  return id !== cluster.primaryArticleId && !history.includes(id);
}

describe("adds properties", () => {
  it("P1: a source's adds are a subset of its facts", () => {
    fc.assert(
      fc.property(scenarios, ({ cluster, articles, history }) => {
        for (const id of cluster.articleIds) {
          const facts = new Set(factIdsOf(articles[id]));
          expect(addsFor(cluster, articles, history, id).every((fact) => facts.has(fact))).toBe(true);
        }
      }),
      RUNS,
    );
  });

  it("P2: adds never include a fact from the primary or a read article", () => {
    fc.assert(
      fc.property(scenarios, (scenario) => {
        const seen = seenBy(scenario);
        for (const id of scenario.cluster.articleIds) {
          const adds = addsFor(scenario.cluster, scenario.articles, scenario.history, id);
          expect(adds.some((fact) => seen.has(fact))).toBe(false);
        }
      }),
      RUNS,
    );
  });

  it("P3: reading more never makes a list longer", () => {
    fc.assert(
      fc.property(scenarios, ({ cluster, articles, history, more }) => {
        const later = [...history, ...more];
        for (const id of cluster.articleIds) {
          const before = new Set(addsFor(cluster, articles, history, id));
          expect(addsFor(cluster, articles, later, id).every((fact) => before.has(fact))).toBe(true);
        }
      }),
      RUNS,
    );
  });

  it("P4: the primary and read articles add nothing", () => {
    fc.assert(
      fc.property(scenarios, (scenario) => {
        const { cluster, articles, history } = scenario;
        for (const id of cluster.articleIds.filter((articleId) => !isUnread(scenario, articleId))) {
          expect(addsFor(cluster, articles, history, id)).toEqual([]);
        }
      }),
      RUNS,
    );
  });

  it("P5: lists depend on which articles were read, not the order", () => {
    const withShuffle = scenarios.chain((scenario) =>
      fc
        .shuffledSubarray(scenario.history, { minLength: scenario.history.length, maxLength: scenario.history.length })
        .map((shuffled) => ({ scenario, shuffled })),
    );
    fc.assert(
      fc.property(withShuffle, ({ scenario: { cluster, articles, history }, shuffled }) => {
        expect(compareCluster(cluster, articles, shuffled)).toEqual(compareCluster(cluster, articles, history));
        expect(clusterState(cluster, articles, shuffled)).toBe(clusterState(cluster, articles, history));
      }),
      RUNS,
    );
  });

  it("P6: for an unread source with facts, adds and seen facts cover all its facts", () => {
    fc.assert(
      fc.property(scenarios, (scenario) => {
        const { cluster, articles, history } = scenario;
        const seen = seenBy(scenario);
        for (const id of cluster.articleIds.filter((articleId) => isUnread(scenario, articleId))) {
          const facts = factIdsOf(articles[id]);
          if (facts.length === 0) continue;
          const adds = addsFor(cluster, articles, history, id);
          expect(adds.length + facts.filter((fact) => seen.has(fact)).length).toBe(facts.length);
          expect(duplicateScore(cluster, articles, history, id)).toBeCloseTo(1 - adds.length / facts.length, 10);
        }
      }),
      RUNS,
    );
  });

  it("P7: a fact the user hasn't seen appears under every unread source that reports it", () => {
    fc.assert(
      fc.property(scenarios, (scenario) => {
        const { cluster, articles, history } = scenario;
        const seen = seenBy(scenario);
        for (const id of cluster.articleIds.filter((articleId) => isUnread(scenario, articleId))) {
          const adds = new Set(addsFor(cluster, articles, history, id));
          for (const fact of factIdsOf(articles[id]).filter((candidate) => !seen.has(candidate))) {
            expect(adds.has(fact)).toBe(true);
          }
        }
      }),
      RUNS,
    );
  });

  it("P8: a cluster is read exactly when its primary is read and no unread source adds anything", () => {
    fc.assert(
      fc.property(scenarios, (scenario) => {
        const { cluster, articles, history } = scenario;
        const read = readInCluster(cluster, history);
        const state = clusterState(cluster, articles, history);
        const nothingNew = cluster.articleIds
          .filter((id) => isUnread(scenario, id))
          .every((id) => addsFor(cluster, articles, history, id).length === 0);
        expect(state === "read").toBe(read.has(cluster.primaryArticleId) && nothingNew);
        expect(state === "unread").toBe(read.size === 0);
        const worthReading = cluster.articleIds.some((id) => isWorthReading(cluster, articles, history, id));
        expect(state !== "read").toBe(worthReading);
      }),
      RUNS,
    );
  });
});
