import { describe, expect, it } from "vitest";
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
