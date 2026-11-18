// A fake AI model that answers from the starter pack's story files, so pipeline tests run
// without a key. Extraction returns each article's marked sentences; matching groups them by
// the story file's fact IDs.

import type { ModelClient, ModelRequest } from "@/pipeline/ai";
import { EXTRACT_SYSTEM, MATCH_SYSTEM } from "@/pipeline/facts";
import { parseMarkedParagraph, type StoryFile } from "@/pipeline/sample-format";

interface KeyArticle {
  story: StoryFile;
  /** The published first paragraph, to tell apart articles with the same headline. */
  lead: string;
  facts: { factId: string; sentence: string }[];
}

export function answerKeyModel(stories: readonly StoryFile[]): ModelClient & { calls: ModelRequest[] } {
  const byTitle = new Map<string, KeyArticle[]>();
  for (const story of stories) {
    for (const article of Object.values(story.articles)) {
      const marked = article.body.map((paragraph) => parseMarkedParagraph(paragraph));
      const entry = { story, lead: marked[0].text, facts: marked.flatMap((paragraph) => paragraph.evidence) };
      byTitle.set(article.title, [...(byTitle.get(article.title) ?? []), entry]);
    }
  }
  const calls: ModelRequest[] = [];
  return {
    name: "test/answer-key",
    calls,
    async completeJson(request) {
      calls.push(request);
      if (request.system === EXTRACT_SYSTEM) {
        const [, title, lead] = request.user.match(/^Title: (.*)\n\nArticle:\n(.*)$/m)!;
        const found = byTitle.get(title)?.find((candidate) => candidate.lead === lead);
        if (!found) throw new Error(`No article titled ${title}`);
        return { facts: found.facts.map(({ factId, sentence }) => ({ fact: found.story.facts[factId], sentence })) };
      }
      if (request.system === MATCH_SYSTEM) {
        const titles = [...request.user.matchAll(/^Article (\d+): (.*)$/gm)].map((match) => match[2]);
        const groups = new Map<string, number[]>();
        for (const match of request.user.matchAll(/^(\d+)\. \[Article (\d+)\] .* \(sentence: "(.*)"\)$/gm)) {
          const [, index, article, sentence] = match;
          const candidates = byTitle.get(titles[Number(article) - 1]) ?? [];
          const fact = candidates.flatMap((candidate) => candidate.facts).find((item) => item.sentence === sentence);
          if (!fact) throw new Error(`No fact for "${sentence}"`);
          groups.set(fact.factId, [...(groups.get(fact.factId) ?? []), Number(index)]);
        }
        return { groups: [...groups.values()] };
      }
      throw new Error("Unexpected prompt");
    },
  };
}
