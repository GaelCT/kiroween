import { describe, expect, it } from "vitest";
import { ArticleParseError, fetchLiveArticle } from "@/pipeline/article";

const paragraphs = [
  "Harrow Labs said on Tuesday that it had raised $40 million to build its first battery recycling plant in Ashcombe County.",
  "The plant will process 12,000 tonnes of used cells a year when it opens in 2028, according to the company.",
  "Chief executive Mara Quell said the money came from three climate funds and a regional development bank.",
  "The company plans to hire 140 people at the site, most of them in operations and maintenance roles.",
];

const page = `<!doctype html><html><head>
  <title>Harrow Labs raises $40 million</title>
  <meta property="og:title" content="Harrow Labs raises $40 million for recycling">
  <meta property="og:site_name" content="Example News">
  <meta property="article:published_time" content="2026-11-18T09:30:00Z">
  <meta name="author" content="Dana Quill">
  </head><body><main><article><h1>Harrow Labs raises $40 million</h1>
  ${paragraphs.map((paragraph) => `<p>${paragraph}</p>`).join("")}
  </article></main></body></html>`;

const publicDns = async () => ["93.184.216.34"];

function serve(body: string, contentType = "text/html; charset=utf-8"): typeof fetch {
  return (async () => new Response(body, { status: 200, headers: { "content-type": contentType } })) as typeof fetch;
}

describe("fetchLiveArticle", () => {
  it("extracts metadata and full text into a saved-page source, not a feed", async () => {
    const { source, article } = await fetchLiveArticle("https://news.example/harrow#comments", {
      fetchImpl: serve(page),
      resolve: publicDns,
    });
    expect(source).toEqual({
      id: expect.stringMatching(/^saved-[a-f0-9]{12}$/),
      name: "Example News",
      homepage: "https://news.example/",
      feedUrl: "",
      saved: true,
    });
    expect(article).toMatchObject({
      sourceId: source.id,
      title: "Harrow Labs raises $40 million for recycling",
      url: "https://news.example/harrow",
      author: "Dana Quill",
      publishedAt: "2026-11-18T09:30:00.000Z",
      paragraphs,
      evidence: [],
    });
    expect(article.limited).toBeUndefined();
  });

  it("uses the final URL without its fragment as the stable article identity", async () => {
    const options = { fetchImpl: serve(page), resolve: publicDns };
    const first = await fetchLiveArticle("https://news.example/harrow", options);
    const second = await fetchLiveArticle("https://news.example/harrow#discussion", options);
    expect(second.article.id).toBe(first.article.id);
  });

  it("rejects non-HTML and pages without a readable article", async () => {
    await expect(
      fetchLiveArticle("https://news.example/file", { fetchImpl: serve("pdf", "application/pdf"), resolve: publicDns }),
    ).rejects.toThrow(ArticleParseError);
    await expect(
      fetchLiveArticle("https://news.example/paywall", { fetchImpl: serve("<p>Please subscribe.</p>"), resolve: publicDns }),
    ).rejects.toThrow("Couldn't find a readable article");
  });
});
