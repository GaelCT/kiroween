// Runs the AI pipeline on starter pack stories (issue #16). Scripts only.

import type { ReaderData } from "@/lib/types";
import type { ModelClient } from "./ai";
import { compareArticles, type ArticleText } from "./facts";
import { sampleArticleId } from "./sample";
import type { StoryFile } from "./sample-format";
import type { StoryResult } from "./sample-results";

/** Extracts and matches facts for one story, using the article text exactly as the app shows it. */
export async function runStory(model: ModelClient, story: StoryFile, data: ReaderData): Promise<StoryResult> {
  const ordered = [story.primary, ...Object.keys(story.articles).filter((id) => id !== story.primary)];
  const inputs: { outlet: string; text: ArticleText }[] = [];
  for (const outlet of ordered) {
    const article = data.articles[sampleArticleId(outlet, story.id)];
    if (!article) throw new Error(`${story.id}: no article from ${outlet}. Run npm run sample:build.`);
    // Excerpt-only articles show "Limited source content" and are never compared.
    if (article.limited) continue;
    inputs.push({ outlet, text: { id: article.id, title: article.title, paragraphs: article.paragraphs } });
  }
  const result = await compareArticles(
    model,
    inputs.map((input) => input.text),
  );
  return {
    story: story.id,
    model: model.name,
    generatedAt: new Date().toISOString(),
    facts: Object.fromEntries(Object.values(result.facts).map((fact) => [fact.id, fact.text])),
    articles: Object.fromEntries(inputs.map((input) => [input.outlet, result.evidence[input.text.id]])),
    dropped: Object.fromEntries(inputs.map((input) => [input.outlet, result.dropped[input.text.id].length])),
  };
}
