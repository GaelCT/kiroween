// POST /api/articles {"url": "..."}: extracts one article page for the browser archive.
// No AI call and no feed subscription. The server keeps nothing.

import { ArticleParseError, fetchLiveArticle } from "@/pipeline/article";
import { jsonError, pageLimit, visitorKey } from "@/pipeline/live-api";
import { FetchBlockedError, FetchFailedError } from "@/pipeline/safe-fetch";

export const maxDuration = 30;

export async function POST(request: Request): Promise<Response> {
  const body: unknown = await request.json().catch(() => null);
  const url = (body as { url?: unknown })?.url;
  if (typeof url !== "string" || url.trim().length === 0 || url.length > 2048) return jsonError(400, "Enter an article URL.");
  if (!pageLimit.take(visitorKey(request))) return jsonError(429, "Too many article requests. Try again in an hour.");

  try {
    return Response.json(await fetchLiveArticle(url.trim()));
  } catch (error) {
    if (error instanceof FetchBlockedError || error instanceof ArticleParseError) return jsonError(400, error.message);
    if (error instanceof FetchFailedError) return jsonError(502, error.message);
    console.error("Article fetch failed:", (error as Error).name);
    return jsonError(500, "Something went wrong while fetching that article.");
  }
}
