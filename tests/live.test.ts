import { describe, expect, it } from "vitest";
import { compareCluster } from "@/lib/adds";
import {
  addFetched,
  applyGrouping,
  articlesToGroup,
  combineReaderData,
  EMPTY_LIVE_STATE,
  liveReaderData,
  parseLiveState,
  saveComparison,
  storiesToCompare,
  storySignature,
  type LiveState,
} from "@/lib/live";
import type { Article, ReaderData, Source } from "@/lib/types";
import { BadRequestError, parseArticles, UsageLimit } from "@/pipeline/live-api";

const source: Source = { id: "live-a", name: "Feed A", homepage: "https://a.example/", feedUrl: "https://a.example/feed" };
const other: Source = { id: "live-b", name: "Feed B", homepage: "https://b.example/", feedUrl: "https://b.example/feed" };

function article(id: string, sourceId: string, publishedAt: string, changes: Partial<Article> = {}): Article {
  return {
    id,
    sourceId,
    title: `Title ${id}`,
    url: `https://x.example/${id}`,
    publishedAt,
    paragraphs: ["One.", "Two.", "Three."],
    evidence: [],
    ...changes,
  };
}

const now = new Date("2026-11-18T12:00:00Z");

function twoFeeds(): LiveState {
  let state = addFetched(EMPTY_LIVE_STATE, source, [article("a1", "live-a", "2026-11-18T09:00:00Z")], now);
  state = addFetched(state, other, [article("b1", "live-b", "2026-11-18T10:00:00Z"), article("b2", "live-b", "2026-11-18T11:00:00Z", { limited: true })], now);
  return state;
}

describe("the live archive", () => {
  it("keeps every fetched article, even when the feed stops listing it", () => {
    const first = addFetched(EMPTY_LIVE_STATE, source, [article("a1", "live-a", "2026-11-17T09:00:00Z")], now);
    const second = addFetched(first, source, [article("a2", "live-a", "2026-11-18T09:00:00Z")], new Date("2026-11-18T13:00:00Z"));
    expect(Object.keys(second.articles).sort()).toEqual(["a1", "a2"]);
    expect(second.sources).toHaveLength(1);
    expect(second.sources[0].fetchedAt).toBe("2026-11-18T13:00:00.000Z");
  });

  it("keeps the saved copy when an article comes back changed", () => {
    const first = addFetched(EMPTY_LIVE_STATE, source, [article("a1", "live-a", "2026-11-17T09:00:00Z")], now);
    const second = addFetched(first, source, [article("a1", "live-a", "2026-11-17T09:00:00Z", { title: "Edited" })], now);
    expect(second.articles.a1.title).toBe("Title a1");
  });

  it("sends only headlines and leads for grouping, newest first", () => {
    const grouped = articlesToGroup(twoFeeds());
    expect(grouped.map((item) => item.id)).toEqual(["b2", "b1", "a1"]);
    expect(grouped[0].paragraphs).toEqual(["One.", "Two."]);
  });

  it("survives damaged storage", () => {
    expect(parseLiveState("{not json")).toEqual(EMPTY_LIVE_STATE);
    expect(parseLiveState(JSON.stringify({ sources: "x" }))).toEqual(EMPTY_LIVE_STATE);
  });
});

describe("live stories", () => {
  const grouping = [{ id: "live:a1", title: "Title a1", primaryArticleId: "a1", articleIds: ["a1", "b1", "b2"] }];

  it("is pending until compared, then shows each source's adds", () => {
    const state = applyGrouping(twoFeeds(), new Set(["a1", "b1", "b2"]), grouping);
    const [story] = storiesToCompare(state);
    expect(story.id).toBe("live:a1");
    expect(liveReaderData(state).clusters[0].comparison).toBe("pending");

    const signature = storySignature(story, state.articles);
    expect(liveReaderData(state, new Set([signature])).clusters[0].comparison).toBe("failed");

    const compared = saveComparison(state, signature, {
      facts: { f01: { id: "f01", text: "Event happened" }, f02: { id: "f02", text: "Costs $5" } },
      evidence: { a1: [{ factId: "f01", sentence: "One." }], b1: [{ factId: "f01", sentence: "One." }, { factId: "f02", sentence: "Two." }] },
    });
    expect(storiesToCompare(compared)).toEqual([]);
    const data = liveReaderData(compared);
    const comparisons = compareCluster(data.clusters[0], data.articles, ["a1"]);
    expect(comparisons.map((entry) => [entry.articleId, entry.status, entry.adds])).toEqual([
      ["a1", "primary", []],
      ["b1", "adds", ["f02"]],
      ["b2", "limited", []],
    ]);
  });

  it("needs comparing again when a story gains a source, and lets the old result go", () => {
    let state = applyGrouping(twoFeeds(), new Set(["a1", "b1", "b2"]), [
      { id: "live:a1", title: "T", primaryArticleId: "a1", articleIds: ["a1", "b1"] },
      { id: "live:b2", title: "T", primaryArticleId: "b2", articleIds: ["b2"] },
    ]);
    state = saveComparison(state, storySignature(state.stories[0], state.articles), { facts: {}, evidence: {} });
    const third: Source = { ...other, id: "live-c", feedUrl: "https://c.example/feed" };
    state = addFetched(state, third, [article("c1", "live-c", "2026-11-18T11:30:00Z")], now);
    state = applyGrouping(state, new Set(["a1", "b1", "b2", "c1"]), [
      { id: "live:a1", title: "T", primaryArticleId: "a1", articleIds: ["a1", "b1", "c1"] },
      { id: "live:b2", title: "T", primaryArticleId: "b2", articleIds: ["b2"] },
    ]);
    expect(storiesToCompare(state).map((story) => story.id)).toEqual(["live:a1"]);
    expect(state.comparisons).toEqual({});
  });

  it("keeps stories outside the regrouped set, and gives leftovers their own story", () => {
    const state = applyGrouping(twoFeeds(), new Set(["a1", "b1"]), [{ id: "live:a1", title: "T", primaryArticleId: "a1", articleIds: ["a1"] }]);
    expect(state.stories.map((story) => story.articleIds)).toEqual([["b2"], ["a1"], ["b1"]]);
  });

  it("joins the sample data, newest story first", () => {
    const sample: ReaderData = {
      sample: true,
      sources: [{ ...source, id: "byteward" }],
      articles: { s1: article("s1", "byteward", "2026-11-16T14:00:00Z") },
      clusters: [{ id: "s", title: "S", primaryArticleId: "s1", articleIds: ["s1"], facts: {} }],
    };
    expect(combineReaderData(sample, liveReaderData(EMPTY_LIVE_STATE))).toBe(sample);
    const combined = combineReaderData(sample, liveReaderData(twoFeeds()));
    expect(combined.sample).toBe(true);
    expect(combined.sources.map((item) => item.id)).toEqual(["byteward", "live-a", "live-b"]);
    expect(combined.clusters.at(-1)?.id).toBe("s");
  });
});

describe("live API input", () => {
  it("accepts well-formed articles and ignores evidence from the browser", () => {
    const [parsed] = parseArticles({ articles: [{ ...article("a1", "live-a", "2026-11-18T09:00:00Z"), evidence: [{ factId: "f01", sentence: "x" }] }] }, 5);
    expect(parsed.evidence).toEqual([]);
  });

  it("rejects bad input", () => {
    const good = article("a1", "live-a", "2026-11-18T09:00:00Z");
    for (const body of [null, { articles: [] }, { articles: [{ ...good, publishedAt: "soon" }] }, { articles: [good, good] }, { articles: [{ ...good, paragraphs: "x" }] }]) {
      expect(() => parseArticles(body, 5), JSON.stringify(body)).toThrow(BadRequestError);
    }
    expect(() => parseArticles({ articles: [good, { ...good, id: "a2" }] }, 1)).toThrow(BadRequestError);
  });

  it("caps usage per visitor and resets after the window", () => {
    let time = 0;
    const limit = new UsageLimit(5, 1000, () => time);
    expect(limit.take("v", 3)).toBe(true);
    expect(limit.take("v", 3)).toBe(false);
    expect(limit.take("other", 5)).toBe(true);
    expect(limit.take("v", 2)).toBe(true);
    time = 1000;
    expect(limit.take("v", 5)).toBe(true);
  });
});
