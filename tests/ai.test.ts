import { afterEach, describe, expect, it, vi } from "vitest";
import { modelConfigured, modelFromEnv, ModelError, ModelNotConfiguredError, parseJsonReply, withMemoryCache, type ModelClient } from "@/pipeline/ai";

describe("parseJsonReply", () => {
  it("reads plain JSON, fenced JSON, and JSON inside a sentence", () => {
    expect(parseJsonReply('{"a":1}')).toEqual({ a: 1 });
    expect(parseJsonReply('```json\n{"a":2}\n```')).toEqual({ a: 2 });
    expect(parseJsonReply('Here you go: {"a":3} Hope that helps.')).toEqual({ a: 3 });
  });

  it("throws on anything else", () => {
    expect(() => parseJsonReply("no json here")).toThrow(ModelError);
  });
});

describe("modelFromEnv", () => {
  it("says which variable is missing, without echoing any value", () => {
    expect(() => modelFromEnv({})).toThrow(ModelNotConfiguredError);
    expect(() => modelFromEnv({ AI_PROVIDER: "anthropic" })).toThrow(/AI_MODEL/);
    expect(() => modelFromEnv({ AI_PROVIDER: "openai", AI_MODEL: "m" })).toThrow(/OPENAI_API_KEY/);
    expect(modelConfigured({ AI_PROVIDER: "openai", AI_MODEL: "m", OPENAI_API_KEY: "k" })).toBe(true);
  });

  it("sends the key in a header and parses the reply", async () => {
    const seen: { url: string; headers: Record<string, string>; body: { model: string } }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seen.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) });
      return Response.json({ content: [{ type: "text", text: '{"facts":[]}' }] });
    }) as unknown as typeof fetch;
    const model = modelFromEnv({ AI_PROVIDER: "anthropic", AI_MODEL: "test-model", ANTHROPIC_API_KEY: "sk-test" }, fetchImpl);
    expect(model.name).toBe("anthropic/test-model");
    expect(await model.completeJson({ system: "s", user: "u" })).toEqual({ facts: [] });
    expect(seen[0].url).toBe("https://api.anthropic.com/v1/messages");
    expect(seen[0].headers["x-api-key"]).toBe("sk-test");
    expect(seen[0].body.model).toBe("test-model");
  });

  it("reports provider errors without the key", async () => {
    const fetchImpl = (async () => new Response("bad request", { status: 400 })) as unknown as typeof fetch;
    const model = modelFromEnv({ AI_PROVIDER: "openai", AI_MODEL: "m", OPENAI_API_KEY: "sk-secret" }, fetchImpl);
    const error = await model.completeJson({ system: "s", user: "u" }).catch((caught: Error) => caught);
    expect(error).toBeInstanceOf(ModelError);
    expect(String(error)).not.toContain("sk-secret");
  });
});

describe("OpenRouter", () => {
  const env = { AI_PROVIDER: "openrouter", AI_MODEL: "vendor/test-model", OPENROUTER_API_KEY: "sk-or-test-secret" };

  interface Seen {
    url: string;
    headers: Record<string, string>;
    body: { model: string; max_tokens?: number; max_completion_tokens?: number; messages: { role: string; content: string }[] };
  }

  /** A fake fetch that answers each call with the next response and records what was sent. */
  function replies(...responses: (() => Response)[]): { fetchImpl: typeof fetch; seen: Seen[] } {
    const seen: Seen[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seen.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) });
      const next = responses[Math.min(seen.length - 1, responses.length - 1)];
      return next();
    }) as unknown as typeof fetch;
    return { fetchImpl, seen };
  }

  const answer = (content: string, finishReason = "stop") => () =>
    Response.json({ id: "gen-1", choices: [{ message: { role: "assistant", content }, finish_reason: finishReason }] });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("is configured by AI_PROVIDER, AI_MODEL, and OPENROUTER_API_KEY", () => {
    expect(modelConfigured(env)).toBe(true);
    expect(modelConfigured({ ...env, OPENROUTER_API_KEY: "" })).toBe(false);
    expect(() => modelFromEnv({ AI_PROVIDER: "openrouter", AI_MODEL: "m" })).toThrow(/OPENROUTER_API_KEY/);
    expect(() => modelFromEnv({ AI_PROVIDER: "nope" })).toThrow(/openrouter/);
  });

  it("posts a chat completion with the key as a bearer token and parses the JSON reply", async () => {
    const { fetchImpl, seen } = replies(answer('```json\n{"facts":[]}\n```'));
    const model = modelFromEnv(env, fetchImpl);
    expect(model.name).toBe("openrouter/vendor/test-model");
    expect(await model.completeJson({ system: "sys", user: "usr", maxTokens: 1234 })).toEqual({ facts: [] });
    expect(seen).toHaveLength(1);
    expect(seen[0].url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(seen[0].headers.Authorization).toBe("Bearer sk-or-test-secret");
    expect(seen[0].body).toEqual({
      model: "vendor/test-model",
      max_tokens: 1234,
      messages: [
        { role: "system", content: "sys" },
        { role: "user", content: "usr" },
      ],
    });
  });

  it("reports OpenRouter's error message, without the key, and doesn't retry a credits error", async () => {
    const { fetchImpl, seen } = replies(() =>
      Response.json({ error: { code: 402, message: "Insufficient credits. Add more using https://openrouter.ai/credits" } }, { status: 402 }),
    );
    const error = await modelFromEnv(env, fetchImpl)
      .completeJson({ system: "s", user: "u" })
      .catch((caught: Error) => caught);
    expect(error).toBeInstanceOf(ModelError);
    expect(String(error)).toMatch(/HTTP 402: Insufficient credits/);
    expect(String(error)).not.toContain("sk-or-test-secret");
    expect(seen).toHaveLength(1);
  });

  it("retries a rate limit after the Retry-After delay", async () => {
    const { fetchImpl, seen } = replies(
      () => Response.json({ error: { code: 429, message: "Rate limit exceeded" } }, { status: 429, headers: { "Retry-After": "0" } }),
      answer('{"groups":[[0]]}'),
    );
    expect(await modelFromEnv(env, fetchImpl).completeJson({ system: "s", user: "u" })).toEqual({ groups: [[0]] });
    expect(seen).toHaveLength(2);
  });

  it("treats an error body sent with HTTP 200 as a failure, and retries it when the provider was overloaded", async () => {
    vi.useFakeTimers();
    const overloaded = () =>
      Response.json({ id: "gen-2", error: { code: 502, message: "Provider overloaded", metadata: { error_type: "provider_overloaded" } } });
    const { fetchImpl, seen } = replies(overloaded, answer('{"facts":[]}'));
    const reply = modelFromEnv(env, fetchImpl).completeJson({ system: "s", user: "u" });
    await vi.runAllTimersAsync();
    expect(await reply).toEqual({ facts: [] });
    expect(seen).toHaveLength(2);

    const refused = () => Response.json({ id: "gen-3", error: { code: 403, message: "Flagged by moderation", metadata: { error_type: "content_policy_violation" } } });
    const once = replies(refused);
    const error = await modelFromEnv(env, once.fetchImpl)
      .completeJson({ system: "s", user: "u" })
      .catch((caught: Error) => caught);
    expect(error).toBeInstanceOf(ModelError);
    expect(String(error)).toMatch(/Flagged by moderation/);
    expect(once.seen).toHaveLength(1);
  });

  it("explains an empty reply cut off at the token limit", async () => {
    const { fetchImpl } = replies(answer("", "length"));
    const error = await modelFromEnv(env, fetchImpl)
      .completeJson({ system: "s", user: "u" })
      .catch((caught: Error) => caught);
    expect(error).toBeInstanceOf(ModelError);
    expect(String(error)).toMatch(/token limit/);
  });

  it("turns a reply that isn't JSON into a ModelError", async () => {
    const { fetchImpl } = replies(() => new Response("<html>gateway</html>", { status: 200, headers: { "content-type": "text/html" } }));
    const error = await modelFromEnv(env, fetchImpl)
      .completeJson({ system: "s", user: "u" })
      .catch((caught: Error) => caught);
    expect(error).toBeInstanceOf(ModelError);
  });
});

describe("withMemoryCache", () => {
  it("answers a repeated request once", async () => {
    let calls = 0;
    const client: ModelClient = { name: "t", completeJson: async () => ({ n: ++calls }) };
    const cached = withMemoryCache(client);
    expect(await cached.completeJson({ system: "s", user: "u" })).toEqual({ n: 1 });
    expect(await cached.completeJson({ system: "s", user: "u" })).toEqual({ n: 1 });
    expect(await cached.completeJson({ system: "s", user: "other" })).toEqual({ n: 2 });
  });
});
