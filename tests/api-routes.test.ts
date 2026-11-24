// The live-feed API routes (issue #20), called the way Next.js calls them. AI replies come from
// a fake fetch that answers like OpenRouter, so this checks the routes and the pipeline, not a
// real model.

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Article } from "@/lib/types";

// Invented articles about an invented event.
const harrow = (id: string, sourceId: string, paragraphs: string[]): Article => ({
  id,
  sourceId,
  title: "Harrow Labs raises $40 million for battery recycling",
  url: `https://${sourceId}.example/harrow`,
  publishedAt: "2026-11-18T09:00:00Z",
  paragraphs,
  evidence: [],
});
const first = harrow("a", "one", ["Harrow Labs raised $40 million on Tuesday to build a recycling plant."]);
const second = harrow("b", "two", [
  "Harrow Labs said Tuesday that it raised $40 million for a recycling plant.",
  "The plant will process 12,000 tonnes of cells a year from 2028.",
]);

function post(body: unknown, visitor = "203.0.113.7"): Request {
  return new Request("http://localhost/api/x", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": visitor },
    body: JSON.stringify(body),
  });
}

/** Answers like OpenRouter: every sentence of an article is one fact, and $40 million facts match. */
function fakeOpenRouter() {
  const calls: string[] = [];
  const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
    calls.push(url);
    const { messages } = JSON.parse(String(init.body)) as { messages: { content: string }[] };
    const user = messages[1].content;
    let reply: unknown;
    if (user.startsWith("Title: ")) {
      const sentences = user.split("\n\nArticle:\n")[1].split("\n\n");
      reply = { facts: sentences.map((sentence) => ({ fact: sentence.replace(/\.$/, ""), sentence })) };
    } else if (user.startsWith("Primary article:")) {
      // The check against the primary: nothing left over repeats it.
      reply = { repeats: [...user.matchAll(/^C(\d+)\. /gm)].map((match) => ({ candidate: Number(match[1]), sentence: null })) };
    } else {
      const lines = [...user.matchAll(/^(\d+)\. .*$/gm)].map((match) => ({ index: Number(match[1]), text: match[0] }));
      const money = lines.filter((line) => line.text.includes("$40 million")).map((line) => line.index);
      reply = { groups: [money, ...lines.filter((line) => !money.includes(line.index)).map((line) => [line.index])] };
    }
    return Response.json({ choices: [{ message: { content: JSON.stringify(reply) }, finish_reason: "stop" }] });
  });
  return { fetchImpl, calls };
}

// Loading the routes' modules the first time takes about 2 seconds on an idle machine, mostly the
// HTML parser and the article extractor. During a full test run on a busy machine, that pushed
// the first test past Vitest's 5-second limit once (Nov 23). Loading them here, with room to spare,
// keeps that cost out of the tests. Each test still gets fresh modules from vi.resetModules().
beforeAll(async () => {
  await import("@/app/api/compare/route");
  await import("@/app/api/feeds/route");
  await import("@/app/api/stories/route");
}, 60_000);

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("AI_PROVIDER", "");
  vi.stubEnv("AI_MODEL", "");
  vi.stubEnv("OPENROUTER_API_KEY", "");
  vi.stubEnv("LIVE_ARTICLE_LIMIT", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function configure(limit?: number) {
  vi.stubEnv("AI_PROVIDER", "openrouter");
  vi.stubEnv("AI_MODEL", "fake/model");
  vi.stubEnv("OPENROUTER_API_KEY", "sk-or-test");
  if (limit) vi.stubEnv("LIVE_ARTICLE_LIMIT", String(limit));
  const fake = fakeOpenRouter();
  vi.stubGlobal("fetch", fake.fetchImpl);
  return fake;
}

describe("POST /api/compare", () => {
  it("answers 503 without an AI provider, so the story shows Comparison unavailable", async () => {
    const { POST } = await import("@/app/api/compare/route");
    const response = await POST(post({ articles: [first, second] }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Live comparisons aren't set up on this server." });
  });

  it("extracts and matches facts through OpenRouter", async () => {
    const fake = configure();
    const { POST } = await import("@/app/api/compare/route");
    const response = await POST(post({ articles: [first, second] }));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { facts: Record<string, { text: string }>; evidence: Record<string, { factId: string; sentence: string }[]> };
    expect(fake.calls.every((url) => url === "https://openrouter.ai/api/v1/chat/completions")).toBe(true);
    // Two extractions, one matching call, and one check against the primary.
    expect(fake.calls).toHaveLength(4);
    // The $40 million fact is shared, so only the 2028 fact is new in the second article.
    expect(body.evidence.a.map((item) => item.factId)).toEqual(["f01"]);
    expect(body.evidence.b.map((item) => item.factId)).toEqual(["f01", "f02"]);
    expect(body.evidence.b[1].sentence).toBe("The plant will process 12,000 tonnes of cells a year from 2028.");
  });

  it("caps comparisons per visitor before calling the AI", async () => {
    const fake = configure(3);
    const { POST } = await import("@/app/api/compare/route");
    expect((await POST(post({ articles: [first, second] }))).status).toBe(200);
    const callsBefore = fake.calls.length;

    const capped = await POST(post({ articles: [first, second] }));
    expect(capped.status).toBe(429);
    expect(await capped.json()).toEqual({ error: "This demo compares up to 3 articles per visitor per day." });
    expect(fake.calls).toHaveLength(callsBefore);

    // Another visitor still has their own allowance.
    expect((await POST(post({ articles: [first, second] }, "198.51.100.9"))).status).toBe(200);
  });

  it("doesn't count excerpt-only articles against the cap", async () => {
    configure(2);
    const { POST } = await import("@/app/api/compare/route");
    const wire = { ...harrow("w", "wire", ["Harrow Labs raised $40 million."]), limited: true };
    expect((await POST(post({ articles: [first, second, wire] }))).status).toBe(200);
  });

  it("answers 502 when the provider fails, without leaking its details", async () => {
    configure();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ error: { code: 402, message: "Insufficient credits" } }, { status: 402 })),
    );
    const { POST } = await import("@/app/api/compare/route");
    const response = await POST(post({ articles: [first, second] }));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "The AI service didn't respond." });
  });

  it("rejects bad input with 400", async () => {
    configure();
    const { POST } = await import("@/app/api/compare/route");
    expect((await POST(post({ articles: [] }))).status).toBe(400);
    expect((await POST(post({ articles: [{ ...first, publishedAt: "soon" }] }))).status).toBe(400);
  });
});

describe("POST /api/feeds", () => {
  it("explains a missing URL and refuses private addresses", async () => {
    const { POST } = await import("@/app/api/feeds/route");
    const missing = await POST(post({}));
    expect(missing.status).toBe(400);
    expect(await missing.json()).toEqual({ error: "Enter a feed URL." });
    const local = await POST(post({ url: "http://localhost:3000/feed.xml" }));
    expect(local.status).toBe(400);
    expect(await local.json()).toEqual({ error: "Only public addresses can be fetched." });
  });

  it("caps feed requests per visitor per hour", async () => {
    const { POST } = await import("@/app/api/feeds/route");
    for (let request = 0; request < 60; request++) expect((await POST(post({ url: "http://localhost/" }))).status).toBe(400);
    const capped = await POST(post({ url: "http://localhost/" }));
    expect(capped.status).toBe(429);
    expect(await capped.json()).toEqual({ error: "Too many feed requests. Try again in an hour." });
    expect((await POST(post({ url: "http://localhost/" }, "198.51.100.9"))).status).toBe(400);
  });
});

describe("POST /api/stories", () => {
  it("groups articles about the same event without an AI call", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { POST } = await import("@/app/api/stories/route");
    const response = await POST(post({ articles: [first, second] }));
    expect(response.status).toBe(200);
    const { clusters } = (await response.json()) as { clusters: { articleIds: string[]; comparison?: string }[] };
    expect(clusters).toEqual([expect.objectContaining({ articleIds: ["a", "b"], comparison: "pending" })]);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect((await POST(post({ articles: "nope" }))).status).toBe(400);
  });
});
