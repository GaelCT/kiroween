// POST /api/compare {"articles": [primary, ...others]}: extracts and matches facts for one
// live story with the AI model (issues #11 and #20). Capped per visitor to control AI cost.

import { ModelError } from "@/pipeline/ai";
import { BadRequestError, comparisonLimit, jsonError, liveModel, parseArticles, visitorKey } from "@/pipeline/live-api";
import { compareLiveCluster } from "@/pipeline/live";

export const maxDuration = 120;

/** A story rarely has more sources than this, and it bounds one request's cost. */
const MAX_ARTICLES = 12;

export async function POST(request: Request): Promise<Response> {
  const model = liveModel();
  if (!model) return jsonError(503, "Live comparisons aren't set up on this server.");

  const body: unknown = await request.json().catch(() => null);
  let articles;
  try {
    articles = parseArticles(body, MAX_ARTICLES);
  } catch (error) {
    if (error instanceof BadRequestError) return jsonError(400, error.message);
    throw error;
  }

  const comparable = articles.filter((article) => !article.limited).length;
  if (!comparisonLimit.take(visitorKey(request), comparable)) {
    return jsonError(429, `This demo compares up to ${comparisonLimit.limit} articles per visitor per day.`);
  }

  try {
    return Response.json(await compareLiveCluster(model, articles));
  } catch (error) {
    // Never log the request or the reply: they hold article text, and errors could echo headers.
    console.error("Live comparison failed:", (error as Error).name);
    if (error instanceof ModelError) return jsonError(502, "The AI service didn't respond.");
    return jsonError(500, "The comparison failed.");
  }
}
