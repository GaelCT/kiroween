// POST /api/feeds {"url": "..."}: fetches a feed and its articles' full text (issue #20).
// No AI call. The articles go back to the browser, which keeps them (issue #21); the server
// keeps nothing.

import { FeedParseError } from "@/pipeline/feeds";
import { feedLimit, jsonError, visitorKey } from "@/pipeline/live-api";
import { fetchLiveFeed } from "@/pipeline/live";
import { FetchBlockedError, FetchFailedError } from "@/pipeline/safe-fetch";

export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  const body: unknown = await request.json().catch(() => null);
  const url = (body as { url?: unknown })?.url;
  if (typeof url !== "string" || url.length === 0 || url.length > 2048) return jsonError(400, "Enter a feed URL.");
  if (!feedLimit.take(visitorKey(request))) return jsonError(429, "Too many feed requests. Try again in an hour.");

  try {
    return Response.json(await fetchLiveFeed(url.trim()));
  } catch (error) {
    if (error instanceof FetchBlockedError || error instanceof FeedParseError) return jsonError(400, error.message);
    if (error instanceof FetchFailedError) return jsonError(502, error.message);
    console.error("Feed fetch failed:", (error as Error).name);
    return jsonError(500, "Something went wrong while fetching that feed.");
  }
}
