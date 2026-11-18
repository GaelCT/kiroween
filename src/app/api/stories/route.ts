// POST /api/stories {"articles": [...]}: groups live articles into stories (issue #15).
// No AI call. Clustering only reads headlines and opening paragraphs.

import { BadRequestError, jsonError, parseArticles } from "@/pipeline/live-api";
import { clusterLive } from "@/pipeline/live";

/** Matches the browser, which sends its most recent articles. */
const MAX_ARTICLES = 300;

export async function POST(request: Request): Promise<Response> {
  const body: unknown = await request.json().catch(() => null);
  try {
    return Response.json({ clusters: clusterLive(parseArticles(body, MAX_ARTICLES)) });
  } catch (error) {
    if (error instanceof BadRequestError) return jsonError(400, error.message);
    throw error;
  }
}
