// Input checks and limits for the live-feed API routes (issue #20). Server only.
// Request bodies come from any visitor, so every field is checked before use, and AI work is
// capped per visitor to control cost.

import type { Article } from "@/lib/types";
import { modelConfigured, modelFromEnv, withMemoryCache, type ModelClient } from "./ai";

export class BadRequestError extends Error {
  override name = "BadRequestError";
}

const MAX_TEXT_CHARS = 100_000;

function text(value: unknown, field: string, max: number, required = true): string {
  if (value === undefined && !required) return "";
  if (typeof value !== "string" || (required && value.length === 0) || value.length > max) {
    throw new BadRequestError(`Invalid ${field}`);
  }
  return value;
}

/** Checks one article from a request body. Evidence is never accepted from the browser. */
export function parseArticle(value: unknown): Article {
  if (typeof value !== "object" || value === null) throw new BadRequestError("Invalid article");
  const raw = value as Record<string, unknown>;
  const publishedAt = text(raw.publishedAt, "publishedAt", 40);
  if (Number.isNaN(Date.parse(publishedAt))) throw new BadRequestError("Invalid publishedAt");
  if (!Array.isArray(raw.paragraphs) || raw.paragraphs.length > 500) throw new BadRequestError("Invalid paragraphs");
  const paragraphs = raw.paragraphs.map((paragraph) => text(paragraph, "paragraph", MAX_TEXT_CHARS));
  if (paragraphs.reduce((sum, paragraph) => sum + paragraph.length, 0) > MAX_TEXT_CHARS) {
    throw new BadRequestError("Article too long");
  }
  const author = text(raw.author, "author", 300, false);
  return {
    id: text(raw.id, "id", 1000),
    sourceId: text(raw.sourceId, "sourceId", 100),
    title: text(raw.title, "title", 1000),
    url: text(raw.url, "url", 2048, false),
    ...(author ? { author } : {}),
    publishedAt: new Date(publishedAt).toISOString(),
    paragraphs,
    evidence: [],
    ...(raw.limited === true ? { limited: true } : {}),
  };
}

export function parseArticles(body: unknown, max: number): Article[] {
  const list = (body as { articles?: unknown })?.articles;
  if (!Array.isArray(list) || list.length === 0 || list.length > max) throw new BadRequestError("Invalid articles");
  const articles = list.map(parseArticle);
  if (new Set(articles.map((article) => article.id)).size !== articles.length) throw new BadRequestError("Repeated article ID");
  return articles;
}

/** The visitor's address as Vercel reports it. Locally, everyone is one visitor. */
export function visitorKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "local";
}

interface Window {
  used: number;
  resetAt: number;
}

/**
 * Counts usage per visitor in a fixed window. It lives in memory, so on a serverless host each
 * instance counts on its own: a soft cap that keeps one visitor from running up the AI bill.
 */
export class UsageLimit {
  private readonly windows = new Map<string, Window>();

  constructor(
    readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Records `amount` uses. Returns false, recording nothing, when that would go over the limit. */
  take(key: string, amount = 1): boolean {
    const now = this.now();
    let window = this.windows.get(key);
    if (!window || window.resetAt <= now) {
      window = { used: 0, resetAt: now + this.windowMs };
      this.windows.set(key, window);
    }
    if (window.used + amount > this.limit) return false;
    window.used += amount;
    if (this.windows.size > 10_000) {
      for (const [other, entry] of this.windows) if (entry.resetAt <= now) this.windows.delete(other);
    }
    return true;
  }
}

const DAY_MS = 86_400_000;

function articleLimit(): number {
  const value = Number(process.env.LIVE_ARTICLE_LIMIT);
  return Number.isInteger(value) && value > 0 ? value : 60;
}

/** Articles each visitor can send for AI comparison per day. */
export const comparisonLimit = new UsageLimit(articleLimit(), DAY_MS);

/** Feed fetches per visitor per hour. They cost no AI, but each one fetches up to 30 pages. */
export const feedLimit = new UsageLimit(60, DAY_MS / 24);

let model: ModelClient | null = null;

/** One model client per server instance, with a cache so repeated articles are extracted once. */
export function liveModel(): ModelClient | null {
  if (!modelConfigured()) return null;
  model ??= withMemoryCache(modelFromEnv());
  return model;
}

export function jsonError(status: number, error: string): Response {
  return Response.json({ error }, { status });
}
