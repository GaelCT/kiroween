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

  // Built like real pages that leaked page furniture into the text on Nov 19, with invented words.
  // The byline is there twice, as on those pages, because Readability already removes the first one.
  const furnished = `<!doctype html><html><head><title>Harrow Labs raises $40 million</title></head><body>
    <div id="app" class="app-shell"><div class="entry-body">
      <p><a class="cta-button" href="#content"><span>Skip to main content</span></a></p>
      <p><span><span id="follow-author-byline_lead-1"><a href="/authors/dana-quill">Dana Quill</a></span></span></p>
      <p><span><span id="follow-author-article_details-1"><a href="/authors/dana-quill">Dana Quill</a></span></span>
        <span class="cms-markup">is a senior reporter covering energy and gadgets. She joined Example News in 2020.</span></p>
      <div class="article__meta"><p><span class="post-primary-term">In Brief</span></p></div>
      <div class="article__posted-date"><p>Posted:</p><p>9:26 AM PST · November 19, 2026</p></div>
      <div id="content" class="entry-content">
        <p>${body[0]}</p>
        <div class="slide-key image-holder"><img src="plant.jpg" alt=""><p><span class="gallery-image-credit">Ari Lund for Example News</span></p></div>
        <p>${body[1]}</p>
        <figure><img src="cells.jpg" alt=""><figcaption>Credit: Ashcombe County Archive, 2026</figcaption></figure>
        <p>${body[2]}</p>
        <p>${body[3]}</p>
      </div>
    </div></div>
  </body></html>`;

  it("drops skip links, bylines, author bios, post labels, and image credits", () => {
    const paragraphs = extractMainText(furnished, "https://news.example/harrow", "Dana Quill")!;
    expect(paragraphs).toEqual(body);
  });

  it("keeps a sentence that only mentions the author or a credit", () => {
    const mentions = [
      ...body,
      "Dana Quill, who covers energy for Example News, toured the site in October.",
      "The image credit system at the plant tracks every pallet, the company said.",
    ];
    const page = `<html><body><article>${mentions.map((text) => `<p>${text}</p>`).join("")}</article></body></html>`;
    expect(extractMainText(page, "https://news.example/harrow", "Dana Quill")).toEqual(mentions);
  });

  it("keeps the label of a box that isn't a picture, like a review's pros and cons", () => {
    const review = `<html><body><article>${body.map((text) => `<p>${text}</p>`).join("")}
      <div class="procon"><figure class="pro"><figcaption>Pros</figcaption><ul><li>Easy setup</li></ul></figure>
      <figure class="con"><figcaption>Cons</figcaption><ul><li>Loud fan</li></ul></figure></div></article></body></html>`;
    expect(extractMainText(review)).toEqual([...body, "Pros", "Easy setup", "Cons", "Loud fan"]);
  });
});

describe("fullTextFor", () => {
  it("uses the feed's own content when it's the full article", async () => {
    const long = Array.from({ length: 8 }, () => body[0]);
    const result = await fullTextFor(entry({ contentKind: "full", html: long.map((text) => `<p>${text}</p>`).join("") }), {
      fetchImpl: () => Promise.reject(new Error("should not fetch")),
    });
    expect(result).toEqual({ paragraphs: long, limited: false });
  });

  it("drops the same furniture from a feed that sends whole articles", async () => {
    const long = Array.from({ length: 8 }, () => body[0]);
    const html = ["Dana Quill", ...long, "Credit: Ashcombe County Archive, 2026"].map((text) => `<p>${text}</p>`).join("");
    const result = await fullTextFor(entry({ contentKind: "full", author: "Dana Quill", html }), {
      fetchImpl: () => Promise.reject(new Error("should not fetch")),
    });
    expect(result).toEqual({ paragraphs: long, limited: false });
  });

  it("checks the page when a feed's full content is only a teaser", async () => {
    const teaser = entry({ contentKind: "full", html: "<p>Harrow Labs raised $40 million. Read more.</p>" });
    const result = await fullTextFor(teaser, { fetchImpl: serve(page), resolve: publicDns });
    expect(result.paragraphs).toContain(body[2]);
    expect(await fullTextFor(teaser, { fetchImpl: serve("<p>Paywall</p>"), resolve: publicDns })).toEqual({
      paragraphs: ["Harrow Labs raised $40 million. Read more."],
      limited: true,
    });
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
