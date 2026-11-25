import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { removeFromArchive, storySignature, type LiveState, type LiveStory } from "@/lib/live";
import { pruneReading } from "@/lib/reading-store";
import type { Article, Source } from "@/lib/types";

const feedA: Source = { id: "feed-a", name: "Feed A", homepage: "https://a.example/", feedUrl: "https://a.example/rss" };
const feedB: Source = { id: "feed-b", name: "Feed B", homepage: "https://b.example/", feedUrl: "https://b.example/rss" };
const saved: Source = { id: "saved-s", name: "Saved", homepage: "https://s.example/", feedUrl: "", saved: true };

function article(id: string, sourceId: string): Article {
  return {
    id,
    sourceId,
    title: `Title ${id}`,
    url: `https://example.com/${id}`,
    publishedAt: "2026-11-18T09:00:00.000Z",
    paragraphs: ["Text."],
    evidence: [],
  };
}

function archive(): LiveState {
  const articles = Object.fromEntries([article("a1", feedA.id), article("a2", feedA.id), article("b1", feedB.id), article("s1", saved.id)].map((item) => [item.id, item]));
  const stories: LiveStory[] = [
    { id: "live:a1", title: "Shared story", primaryArticleId: "a1", articleIds: ["a1", "b1"] },
    { id: "live:a2", title: "Title a2", primaryArticleId: "a2", articleIds: ["a2"] },
    { id: "live:s1", title: "Title s1", primaryArticleId: "s1", articleIds: ["s1"] },
  ];
  const signature = storySignature(stories[0], articles);
  return {
    sources: [feedA, feedB, saved].map((source) => ({ ...source, fetchedAt: "2026-11-18T09:00:00.000Z" })),
    articles,
    stories,
    comparisons: { [signature]: { facts: { f01: { id: "f01", text: "Shared fact" } }, evidence: {} } },
  };
}

describe("archive removal", () => {
  it("chooses a new primary, drops stale comparisons, and remaps reading state", () => {
    const before = archive();
    const removal = removeFromArchive(before, ["a1"]);
    expect(removal.state.articles.a1).toBeUndefined();
    expect(removal.state.stories[0]).toEqual({ id: "live:b1", title: "Title b1", primaryArticleId: "b1", articleIds: ["b1"] });
    expect(removal.storyIds).toEqual({ "live:a1": "live:b1" });
    expect(removal.state.comparisons).toEqual({});
    expect(removal.state.sources.map((source) => source.id)).toEqual([feedA.id, feedB.id, saved.id]);

    const reading = pruneReading(
      { history: ["a1", "b1", "a2"], detached: ["a1"], starred: ["live:a1", "live:a2"], grouped: true },
      ["a1"],
      removal.storyIds,
    );
    expect(reading).toEqual({ history: ["b1", "a2"], detached: [], starred: ["live:b1", "live:a2"], grouped: true });
    expect(before.articles.a1).toBeDefined();
  });

  it("removes an orphaned saved-page source and its reading state", () => {
    const removal = removeFromArchive(archive(), ["s1"]);
    expect(removal.state.sources.map((source) => source.id)).toEqual([feedA.id, feedB.id]);
    expect(removal.storyIds["live:s1"]).toBeNull();
    const reading = pruneReading(
      { history: ["s1"], detached: ["s1"], starred: ["live:s1"], grouped: false },
      ["s1"],
      removal.storyIds,
    );
    expect(reading).toEqual({ history: [], detached: [], starred: [], grouped: false });
  });

  it("unsubscribes a feed and removes all of its articles without touching other sources", () => {
    const removal = removeFromArchive(archive(), ["a1", "a2"], feedA.id);
    expect(Object.keys(removal.state.articles).sort()).toEqual(["b1", "s1"]);
    expect(removal.state.sources.map((source) => source.id)).toEqual([feedB.id, saved.id]);
    expect(removal.storyIds).toEqual({ "live:a1": "live:b1", "live:a2": null });
  });

  it("does nothing when none of the article IDs exist", () => {
    const before = archive();
    expect(removeFromArchive(before, ["missing"])).toEqual({ state: before, storyIds: {} });
  });
});

describe("archive removal persistence and Undo", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllGlobals());

  it("persists deletion and unsubscribe, then restores the exact archive snapshot", async () => {
    const before = archive();
    const values = new Map<string, string>([["reader:live:v1", JSON.stringify(before)]]);
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });
    const store = await import("@/lib/live-store");

    const deleted = store.removeLiveArticles(["s1"]);
    expect(deleted?.articleIds).toEqual(["s1"]);
    expect(JSON.parse(values.get("reader:live:v1")!).articles.s1).toBeUndefined();
    store.restoreLiveState(deleted!.before);
    expect(store.getLiveSnapshot().state).toEqual(before);

    const unsubscribed = store.removeLiveFeed(feedA.id);
    expect(unsubscribed?.articleIds.sort()).toEqual(["a1", "a2"]);
    expect(JSON.parse(values.get("reader:live:v1")!).sources.map((source: Source) => source.id)).toEqual([feedB.id, saved.id]);
    store.restoreLiveState(unsubscribed!.before);
    expect(store.getLiveSnapshot().state).toEqual(before);
    expect(JSON.parse(values.get("reader:live:v1")!)).toEqual(before);
  });
});
