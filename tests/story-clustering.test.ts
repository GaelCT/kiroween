import { describe, expect, it } from "vitest";
import { choosePrimary, clusterArticles, similarities, type ClusterInput } from "@/pipeline/cluster";
import { clusterInputs, scoreClustering } from "@/pipeline/cluster-check";
import { loadSampleData } from "@/pipeline/sample";

const root = process.cwd();

function article(id: string, sourceId: string, title: string, publishedAt = "2026-11-10T09:00:00Z", limited = false): ClusterInput {
  return { id, sourceId, title, publishedAt, paragraphs: [title], ...(limited ? { limited } : {}) };
}

function story(id: string, sourceId: string, title: string, lead: string): ClusterInput {
  return { id, sourceId, title, publishedAt: "2026-11-10T09:00:00Z", paragraphs: [lead] };
}

// Unrelated articles in the same batch, so words are weighted the way a real batch weights them.
const unrelated = [
  story("ferry", "three", "Port Ellery opens a second ferry terminal", "The terminal adds twelve daily crossings to the islands."),
  story("stadium", "four", "City council delays the stadium vote again", "Members asked for another traffic study before deciding."),
];

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

  it("never lets one shared word carry a match", () => {
    const recall = story("recall", "one", "Ostrander recalls scooters", "Riders reported brake failures.");
    const hire = story("hire", "two", "Ostrander hires a chief executive", "Lena Voss starts in January.");
    expect(similarities([recall, hire, ...unrelated])[0][1]).toBe(0);
  });

  it("keeps two stories about the same company apart when they share little but its name", () => {
    const groups = clusterArticles([
      story("recall", "one", "Ostrander Mobility recalls 40,000 scooters", "Ostrander Mobility is recalling 40,000 electric scooters after riders reported brake failures."),
      story("boss", "two", "Ostrander Mobility names a new chief executive", "Ostrander Mobility said Lena Voss will become chief executive in January."),
      ...unrelated,
    ]);
    expect(groups).toHaveLength(4);
  });

  it("groups the same event told in different words", () => {
    const groups = clusterArticles([
      story("a", "one", "Ostrander recalls 40,000 scooters over brake failures", "Ostrander is recalling 40,000 electric scooters after riders reported that the front brake can fail."),
      story("b", "two", "Brake problem forces Ostrander to recall 40,000 e-scooters", "Riders said the front brake on Ostrander's electric scooters can fail, and the company is recalling all 40,000 sold."),
      ...unrelated,
    ]);
    expect(groups.find((group) => group.articleIds.includes("a"))?.articleIds).toEqual(["a", "b"]);
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
