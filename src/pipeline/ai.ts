// The AI model behind fact extraction and matching (issues #10 and #11). Server and scripts only.
// The provider is still open (issue #10), so both OpenAI and Anthropic work, chosen by env vars:
//   AI_PROVIDER=anthropic or openai
//   AI_MODEL=<model ID from the provider's model list>
//   ANTHROPIC_API_KEY or OPENAI_API_KEY
// Keys only come from the environment (.env.local locally, Vercel settings in production).
// Never log a key or a request header.

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export interface ModelRequest {
  system: string;
  user: string;
  maxTokens?: number;
}

export interface ModelClient {
  /** "provider/model", for reports and cache keys. */
  readonly name: string;
  /** Sends one prompt and returns the reply parsed as JSON. */
  completeJson(request: ModelRequest): Promise<unknown>;
}

export class ModelError extends Error {
  override name = "ModelError";
}

export class ModelNotConfiguredError extends ModelError {
  override name = "ModelNotConfiguredError";
}

type Env = Record<string, string | undefined>;

interface ProviderConfig {
  keyVar: string;
  send: (key: string, model: string, request: ModelRequest, fetchImpl: typeof fetch) => Promise<string>;
}

const PROVIDERS: Record<string, ProviderConfig> = {
  anthropic: {
    keyVar: "ANTHROPIC_API_KEY",
    async send(key, model, request, fetchImpl) {
      const response = await post(fetchImpl, "https://api.anthropic.com/v1/messages", {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      }, {
        model,
        max_tokens: request.maxTokens ?? 4096,
        system: request.system,
        messages: [{ role: "user", content: request.user }],
      });
      const content = (response as { content?: { type?: string; text?: string }[] }).content ?? [];
      return content.filter((block) => block.type === "text").map((block) => block.text ?? "").join("");
    },
  },
  openai: {
    keyVar: "OPENAI_API_KEY",
    async send(key, model, request, fetchImpl) {
      const response = await post(fetchImpl, "https://api.openai.com/v1/chat/completions", {
        Authorization: `Bearer ${key}`,
      }, {
        model,
        max_completion_tokens: request.maxTokens ?? 4096,
        messages: [
          { role: "system", content: request.system },
          { role: "user", content: request.user },
        ],
      });
      const choices = (response as { choices?: { message?: { content?: string } }[] }).choices ?? [];
      return choices[0]?.message?.content ?? "";
    },
  },
};

export const PROVIDER_NAMES = Object.keys(PROVIDERS);

async function post(fetchImpl: typeof fetch, url: string, headers: Record<string, string>, body: unknown): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(90_000),
      });
    } catch (error) {
      if (attempt < 2) continue;
      throw new ModelError(`The AI request failed: ${(error as Error).name}`);
    }
    if (response.ok) return response.json();
    const retry = response.status === 429 || response.status >= 500;
    const detail = (await response.text()).slice(0, 300);
    if (retry && attempt < 2) {
      await new Promise((done) => setTimeout(done, 2000 * (attempt + 1)));
      continue;
    }
    throw new ModelError(`The AI provider answered with HTTP ${response.status}: ${detail}`);
  }
}

/** Parses a JSON reply, tolerating code fences or a sentence around the JSON. */
export function parseJsonReply(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : text).trim();
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        // Fall through to the error below.
      }
    }
    throw new ModelError("The AI reply wasn't valid JSON.");
  }
}

/** Whether env vars for a model are set, without saying what they are. */
export function modelConfigured(env: Env = process.env): boolean {
  const provider = PROVIDERS[env.AI_PROVIDER ?? ""];
  return Boolean(provider && env.AI_MODEL && env[provider.keyVar]);
}

/** Builds the model client from AI_PROVIDER, AI_MODEL, and the provider's key variable. */
export function modelFromEnv(env: Env = process.env, fetchImpl: typeof fetch = fetch): ModelClient {
  const providerName = env.AI_PROVIDER ?? "";
  const provider = PROVIDERS[providerName];
  if (!provider) {
    throw new ModelNotConfiguredError(`Set AI_PROVIDER to ${PROVIDER_NAMES.join(" or ")} in .env.local.`);
  }
  const model = env.AI_MODEL;
  if (!model) throw new ModelNotConfiguredError("Set AI_MODEL in .env.local to a model ID from your provider.");
  const key = env[provider.keyVar];
  if (!key) throw new ModelNotConfiguredError(`Set ${provider.keyVar} in .env.local.`);
  return {
    name: `${providerName}/${model}`,
    async completeJson(request) {
      return parseJsonReply(await provider.send(key, model, request, fetchImpl));
    },
  };
}

/**
 * Wraps a client so identical requests are answered from files in `dir`, which must be gitignored.
 * Scripts use it so rerunning the accuracy check only pays for prompts that changed.
 */
export function withDiskCache(client: ModelClient, dir: string): ModelClient {
  return {
    name: client.name,
    async completeJson(request) {
      const key = createHash("sha256").update(JSON.stringify([client.name, request])).digest("hex");
      const file = path.join(dir, `${key}.json`);
      try {
        return JSON.parse(await readFile(file, "utf8"));
      } catch {
        const reply = await client.completeJson(request);
        await mkdir(dir, { recursive: true });
        await writeFile(file, JSON.stringify(reply));
        return reply;
      }
    },
  };
}

/** Wraps a client so identical requests in this process share one call. The server uses it across visitors. */
export function withMemoryCache(client: ModelClient, maxEntries = 2000): ModelClient {
  const cache = new Map<string, Promise<unknown>>();
  return {
    name: client.name,
    completeJson(request) {
      const key = createHash("sha256").update(JSON.stringify(request)).digest("hex");
      const hit = cache.get(key);
      if (hit) return hit;
      const reply = client.completeJson(request);
      reply.catch(() => cache.delete(key));
      if (cache.size >= maxEntries) cache.delete(cache.keys().next().value!);
      cache.set(key, reply);
      return reply;
    },
  };
}
