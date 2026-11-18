import { describe, expect, it } from "vitest";
import type { FeedEntry } from "@/pipeline/feeds";
import { extractMainText, fullTextFor, mapWithLimit } from "@/pipeline/fulltext";

// Every page here is invented for the tests.
const body = [
  "Harrow Labs said on Tuesday that it had raised $40 million to build its first battery recycling plant in Ashcombe County.",
  "The plant will process 12,000 tonnes of used cells a year when it opens in 2028, according to the company.",
  "Chief executive Mara Quell said the money came from three climate funds and a regional development bank.",
  "The company plans to hire 140 people at the site, most of them in operations and maintenance roles.",
];

const page = `<!doctype html><html><head><title>Harrow Labs raises $40 million</title></head><body>
  <header><nav><a href="/">Home</a> <a href="/news">News</a> <a href="/subscribe">Subscribe now</a></nav></header>
  <main><article><h1>Harrow Labs raises $40 million</h1>${body.map((text) => `<p>${text}</p>`).join("")}</article></main>
  <aside><p>Sign up for our newsletter for more stories like this one.</p></aside>
  <footer><p>Copyright 2026 Example News. All rights reserved.</p></footer>
  <script>trackVisitor()</script>
</body></html>`;

function entry(changes: Partial<FeedEntry> = {}): FeedEntry {
  return {
    id: "urn:test:1",
    title: "Harrow Labs raises $40 million",
    url: "https://news.example/harrow",
    html: "<p>Harrow Labs raised $40 million.</p>",
    contentKind: "summary",
    ...changes,
  };
}

const publicDns = async () => ["93.184.216.34"];

function serve(html: string, contentType = "text/html; charset=utf-8"): typeof fetch {
  return (async () => new Response(html, { status: 200, headers: { "content-type": contentType } })) as typeof fetch;
}

describe("extractMainText", () => {
  it("keeps the article's paragraphs and drops navigation, asides, footers, and scripts", () => {
    const paragraphs = extractMainText(page)!;
    for (const text of body) expect(paragraphs).toContain(text);
    expect(paragraphs.join(" ")).not.toMatch(/Subscribe now|newsletter|All rights reserved|trackVisitor/);
  });

  it("returns null for a page without an article", () => {
    expect(extractMainText("<html><body><p>Please enable cookies.</p></body></html>")).toBeNull();
  });
});

describe("fullTextFor", () => {
  it("uses the feed's own content when it's the full article", async () => {
    const result = await fullTextFor(entry({ contentKind: "full", html: "<p>One.</p><p>Two.</p>" }), {
      fetchImpl: () => Promise.reject(new Error("should not fetch")),
    });
    expect(result).toEqual({ paragraphs: ["One.", "Two."], limited: false });
  });

  it("fetches the article page for an excerpt", async () => {
    const result = await fullTextFor(entry(), { fetchImpl: serve(page), resolve: publicDns });
    expect(result.limited).toBe(false);
    expect(result.paragraphs).toContain(body[1]);
  });

  it("falls back to the excerpt, marked limited, when extraction fails", async () => {
    const excerpt = ["Harrow Labs raised $40 million."];
    expect(await fullTextFor(entry(), { fetchImpl: serve("<p>Paywall</p>"), resolve: publicDns })).toEqual({ paragraphs: excerpt, limited: true });
    expect(await fullTextFor(entry(), { fetchImpl: serve(page, "application/pdf"), resolve: publicDns })).toEqual({ paragraphs: excerpt, limited: true });
    expect(await fullTextFor(entry(), { fetchImpl: () => Promise.reject(new Error("down")), resolve: publicDns })).toEqual({
      paragraphs: excerpt,
      limited: true,
    });
  });
});

describe("mapWithLimit", () => {
  it("keeps order and never runs more than the limit at once", async () => {
    let running = 0;
    let peak = 0;
    const results = await mapWithLimit([5, 1, 4, 2, 3], 2, async (n) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((done) => setTimeout(done, n));
      running--;
      return n * 10;
    });
    expect(results).toEqual([50, 10, 40, 20, 30]);
    expect(peak).toBe(2);
  });
});
