import { describe, expect, it } from "vitest";
import { choosePrimary, clusterArticles, type ClusterInput } from "@/pipeline/cluster";
import { clusterInputs, scoreClustering } from "@/pipeline/cluster-check";
import { loadSampleData } from "@/pipeline/sample";

const root = process.cwd();

function article(id: string, sourceId: string, title: string, publishedAt = "2026-11-10T09:00:00Z", limited = false): ClusterInput {
  return { id, sourceId, title, publishedAt, paragraphs: [title], ...(limited ? { limited } : {}) };
}

describe("clusterArticles", () => {
  it("matches the starter pack's story files exactly", async () => {
    const data = await loadSampleData(root, { useResults: false });
    const expected = new Map(data.clusters.flatMap((cluster) => cluster.articleIds.map((id) => [id, cluster.id] as const)));
    const score = scoreClustering(clusterInputs(data), expected);
    expect(score.wrongPairs).toEqual([]);
    expect(score.missedPairs).toEqual([]);
  });

  it("keeps two same-morning outages at different companies apart", async () => {
    const data = await loadSampleData(root, { useResults: false });
    const groups = clusterArticles(clusterInputs(data));
    const storyOf = (id: string) => groups.findIndex((group) => group.articleIds.includes(id));
    expect(storyOf("urn:reader-sample:byteward:nimbusfold-outage")).not.toBe(storyOf("urn:reader-sample:byteward:deepcask-outage"));
  });

  it("leaves articles apart when they aren't clearly about the same event", () => {
    const groups = clusterArticles([
      article("a", "one", "Harrow Labs raises $40 million for battery recycling"),
      article("b", "two", "Velmont recalls 12,000 space heaters over fire risk"),
    ]);
    expect(groups).toHaveLength(2);
  });

  it("never groups two articles from the same source, or articles days apart", () => {
    const groups = clusterArticles([
      article("a", "one", "Harrow Labs raises $40 million for battery recycling"),
      article("b", "one", "Harrow Labs raises $40 million for battery recycling plant"),
      article("c", "two", "Harrow Labs raises $40 million for battery recycling", "2026-11-20T09:00:00Z"),
    ]);
    expect(groups).toHaveLength(3);
  });

  it("opens on the earliest full article and orders the rest by time", () => {
    const groups = clusterArticles([
      article("late", "one", "Harrow Labs raises $40 million for battery recycling", "2026-11-10T11:00:00Z"),
      article("wire", "two", "Harrow Labs raises $40 million for battery recycling", "2026-11-10T08:00:00Z", true),
      article("early", "three", "Harrow Labs raises $40 million for battery recycling", "2026-11-10T09:00:00Z"),
    ]);
    expect(groups).toEqual([{ primaryArticleId: "early", articleIds: ["early", "wire", "late"] }]);
  });
});

describe("choosePrimary", () => {
  it("falls back to an excerpt when every article is one", () => {
    expect(choosePrimary([article("a", "one", "T", "2026-11-10T10:00:00Z", true)]).id).toBe("a");
  });
});
