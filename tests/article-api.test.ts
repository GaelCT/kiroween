import { beforeEach, describe, expect, it, vi } from "vitest";

function post(body: unknown, visitor = "203.0.113.7"): Request {
  return new Request("http://localhost/api/articles", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": visitor },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetModules();
});

describe("POST /api/articles", () => {
  it("explains a missing URL and refuses private addresses", async () => {
    const { POST } = await import("@/app/api/articles/route");
    const missing = await POST(post({}));
    expect(missing.status).toBe(400);
    expect(await missing.json()).toEqual({ error: "Enter an article URL." });
    const local = await POST(post({ url: "http://localhost:3000/article" }));
    expect(local.status).toBe(400);
    expect(await local.json()).toEqual({ error: "Only public addresses can be fetched." });
  });

  it("caps article requests per visitor per hour", async () => {
    const { POST } = await import("@/app/api/articles/route");
    for (let request = 0; request < 30; request++) expect((await POST(post({ url: "http://localhost/article" }))).status).toBe(400);
    const capped = await POST(post({ url: "http://localhost/article" }));
    expect(capped.status).toBe(429);
    expect(await capped.json()).toEqual({ error: "Too many article requests. Try again in an hour." });
    expect((await POST(post({ url: "http://localhost/article" }, "198.51.100.9"))).status).toBe(400);
  });
});
