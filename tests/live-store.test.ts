import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Article, Source } from "@/lib/types";

const source: Source = {
  id: "saved-example",
  name: "Example News",
  homepage: "https://news.example/",
  feedUrl: "",
  saved: true,
};

const article: Article = {
  id: "saved-example:article",
  sourceId: source.id,
  title: "A saved article",
  url: "https://news.example/article",
  publishedAt: "2026-11-18T09:30:00.000Z",
  paragraphs: ["A complete article paragraph.", "Another paragraph with the details."],
  evidence: [],
};

function browserStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    values,
  };
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("saving an article in the browser archive", () => {
  it("persists and groups a new page, deduplicates it, and never refreshes it as a feed", async () => {
    const localStorage = browserStorage();
    vi.stubGlobal("window", { localStorage });
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push(url);
        const body = JSON.parse(String(init.body)) as { articles?: Article[] };
        if (url === "/api/articles") return Response.json({ source, article });
        if (url === "/api/stories") {
          const primary = body.articles![0];
          return Response.json({
            clusters: [{ id: `live:${primary.id}`, title: primary.title, primaryArticleId: primary.id, articleIds: [primary.id] }],
          });
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );

    const store = await import("@/lib/live-store");
    expect(await store.addArticle("https://news.example/article")).toEqual({ ok: true, message: "Saved “A saved article”." });
    expect(store.getLiveSnapshot().state.articles[article.id]).toEqual(article);
    expect(store.getLiveSnapshot().state.sources[0]).toMatchObject({ saved: true, feedUrl: "" });
    expect(JSON.parse(localStorage.values.get("reader:live:v1")!).articles[article.id].title).toBe(article.title);
    expect(calls).toEqual(["/api/articles", "/api/stories"]);

    expect(await store.addArticle("https://news.example/article")).toEqual({ ok: true, message: "That article is already in your archive." });
    expect(calls).toEqual(["/api/articles", "/api/stories", "/api/articles"]);

    const beforeRefresh = [...calls];
    expect(await store.refreshFeeds(true)).toBeNull();
    expect(calls).toEqual(beforeRefresh);
  });

  it("compares and saves evidence when a saved page joins another article's story", async () => {
    const feedSource: Source = { id: "live-feed", name: "Feed", homepage: "https://feed.example/", feedUrl: "https://feed.example/rss" };
    const feedArticle: Article = { ...article, id: "live-feed:article", sourceId: feedSource.id, publishedAt: "2026-11-18T09:00:00.000Z" };
    const localStorage = browserStorage();
    localStorage.values.set(
      "reader:live:v1",
      JSON.stringify({
        sources: [{ ...feedSource, fetchedAt: "2026-11-18T09:00:00.000Z" }],
        articles: { [feedArticle.id]: feedArticle },
        stories: [{ id: `live:${feedArticle.id}`, title: feedArticle.title, primaryArticleId: feedArticle.id, articleIds: [feedArticle.id] }],
        comparisons: {},
      }),
    );
    vi.stubGlobal("window", { localStorage });
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(url);
        if (url === "/api/articles") return Response.json({ source, article });
        if (url === "/api/stories") {
          return Response.json({
            clusters: [{ id: `live:${feedArticle.id}`, title: feedArticle.title, primaryArticleId: feedArticle.id, articleIds: [feedArticle.id, article.id] }],
          });
        }
        if (url === "/api/compare") {
          return Response.json({
            facts: { f01: { id: "f01", text: "The event happened" } },
            evidence: { [feedArticle.id]: [{ factId: "f01", sentence: "A complete article paragraph." }], [article.id]: [] },
          });
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );
    const store = await import("@/lib/live-store");
    expect((await store.addArticle(article.url)).ok).toBe(true);
    expect(calls).toEqual(["/api/articles", "/api/stories", "/api/compare"]);
    expect(Object.values(store.getLiveSnapshot().state.comparisons)[0].facts.f01.text).toBe("The event happened");
  });

  it("keeps a fetched page when story grouping fails", async () => {
    vi.stubGlobal("window", { localStorage: browserStorage() });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "/api/articles") return Response.json({ source, article });
        return Response.json({ error: "Grouping unavailable" }, { status: 500 });
      }),
    );
    const store = await import("@/lib/live-store");
    const result = await store.addArticle("https://news.example/article");
    expect(result.ok).toBe(true);
    expect(result.message).toContain("It couldn't be grouped into stories: Grouping unavailable");
    expect(store.getLiveSnapshot().state.articles[article.id]).toEqual(article);
    expect(store.getLiveSnapshot().busy).toBe(false);
  });
});
