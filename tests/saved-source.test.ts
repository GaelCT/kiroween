import { describe, expect, it } from "vitest";
import { addFetched, EMPTY_LIVE_STATE, isFeedSource } from "@/lib/live";
import type { Article, Source } from "@/lib/types";

describe("saved page sources", () => {
  it("stays distinct from feeds and preserves the first saved copy", () => {
    const feedSource: Source = { id: "live-a", name: "Feed A", homepage: "https://a.example/", feedUrl: "https://a.example/feed" };
    const savedSource: Source = { id: "saved-x", name: "Example", homepage: "https://x.example/", feedUrl: "", saved: true };
    const article: Article = {
      id: "saved-x:page",
      sourceId: savedSource.id,
      title: "Saved page",
      url: "https://x.example/page",
      publishedAt: "2026-11-18T09:00:00Z",
      paragraphs: ["One.", "Two."],
      evidence: [],
    };
    const now = new Date("2026-11-18T12:00:00Z");
    const first = addFetched(EMPTY_LIVE_STATE, savedSource, [article], now);
    const second = addFetched(first, savedSource, [{ ...article, title: "Fetched again" }], now);
    expect(isFeedSource(savedSource)).toBe(false);
    expect(isFeedSource(feedSource)).toBe(true);
    expect(Object.keys(second.articles)).toEqual([article.id]);
    expect(second.articles[article.id].title).toBe(article.title);
  });
});
