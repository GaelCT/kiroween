// The hand-written sample data format: outlets in data/sample/sources.json and one story per
// file in data/sample/stories/. See data/sample/README.md.

import type { Evidence, FactId } from "@/lib/types";
import { normalizeWhitespace } from "./html";

export interface SampleSourceFile {
  id: string;
  name: string;
  homepage: string;
  description?: string;
  folder?: string;
  /** The outlet's feed only carries excerpts, so its articles show "Limited source content". */
  excerptOnly?: boolean;
}

export interface StoryArticleFile {
  title: string;
  author?: string;
  publishedAt: string;
  /** Paragraphs. A sentence that states a fact is marked like "[f03: It has 24 GB of memory.]". */
  body: string[];
}

export interface StoryFile {
  id: string;
  title: string;
  /** Outlet ID of the article the story opens on. */
  primary: string;
  facts: Record<FactId, string>;
  /** Keyed by outlet ID. */
  articles: Record<string, StoryArticleFile>;
  notes?: string;
}

export class SampleDataError extends Error {
  override name = "SampleDataError";
}

const MARKER = /\[(f\d{2}): ([^[\]]+)\]/g;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FACT_ID = /^f\d{2}$/;

export interface MarkedParagraph {
  /** The paragraph as published, without markers. */
  text: string;
  evidence: Evidence[];
}

export function parseMarkedParagraph(paragraph: string): MarkedParagraph {
  const evidence: Evidence[] = [];
  const text = paragraph.replace(MARKER, (_marker, factId: string, sentence: string) => {
    const clean = normalizeWhitespace(sentence);
    evidence.push({ factId, sentence: clean });
    return clean;
  });
  if (/[[\]]/.test(text)) throw new SampleDataError(`Malformed fact marker in: ${paragraph}`);
  return { text: normalizeWhitespace(text), evidence };
}

/** Throws a SampleDataError that lists every problem found. */
export function validateSample(sources: SampleSourceFile[], stories: StoryFile[]): void {
  const problems: string[] = [];
  const sourceIds = new Set<string>();
  const excerptOnly = new Set<string>();
  for (const source of sources) {
    if (!SLUG.test(source.id)) problems.push(`Source ID "${source.id}" must be kebab-case`);
    if (sourceIds.has(source.id)) problems.push(`Source "${source.id}" is listed twice`);
    if (!source.name) problems.push(`Source "${source.id}" has no name`);
    if (!/^https:\/\/[a-z0-9-]+\.example\/$/.test(source.homepage)) {
      problems.push(`Source "${source.id}" homepage must be https://<name>.example/`);
    }
    sourceIds.add(source.id);
    if (source.excerptOnly) excerptOnly.add(source.id);
  }

  const storyIds = new Set<string>();
  for (const story of stories) {
    const where = `Story "${story.id}"`;
    if (!SLUG.test(story.id)) problems.push(`${where}: ID must be kebab-case`);
    if (storyIds.has(story.id)) problems.push(`${where}: ID is used twice`);
    storyIds.add(story.id);
    if (!story.title) problems.push(`${where}: missing title`);

    const outlets = Object.keys(story.articles ?? {});
    if (outlets.length === 0) problems.push(`${where}: no articles`);
    if (!outlets.includes(story.primary)) problems.push(`${where}: primary "${story.primary}" has no article`);
    if (excerptOnly.has(story.primary) && outlets.length > 1) {
      problems.push(`${where}: primary "${story.primary}" only publishes excerpts`);
    }

    const factIds = Object.keys(story.facts ?? {});
    for (const id of factIds) {
      if (!FACT_ID.test(id)) problems.push(`${where}: fact ID "${id}" must look like f01`);
      if (!story.facts[id]) problems.push(`${where}: fact ${id} has no wording`);
    }

    const used = new Set<string>();
    for (const outlet of outlets) {
      const article = story.articles[outlet];
      const at = `${where}, ${outlet}`;
      if (!sourceIds.has(outlet)) problems.push(`${at}: unknown outlet`);
      if (!article.title) problems.push(`${at}: missing title`);
      if (Number.isNaN(Date.parse(article.publishedAt))) problems.push(`${at}: publishedAt must be ISO 8601`);
      if (!Array.isArray(article.body) || article.body.length === 0) {
        problems.push(`${at}: body must be a non-empty list of paragraphs`);
        continue;
      }
      const inArticle = new Set<string>();
      for (const paragraph of article.body) {
        let marked: MarkedParagraph;
        try {
          marked = parseMarkedParagraph(paragraph);
        } catch (error) {
          problems.push(`${at}: ${(error as Error).message}`);
          continue;
        }
        for (const { factId } of marked.evidence) {
          if (!(factId in (story.facts ?? {}))) problems.push(`${at}: unknown fact ${factId}`);
          if (inArticle.has(factId)) problems.push(`${at}: fact ${factId} is marked twice`);
          inArticle.add(factId);
          used.add(factId);
        }
      }
      if (excerptOnly.has(outlet) && inArticle.size > 0) {
        problems.push(`${at}: excerpt-only outlets can't mark facts`);
      }
    }
    for (const id of factIds) {
      if (!used.has(id)) problems.push(`${where}: fact ${id} isn't marked in any article`);
    }
  }

  if (problems.length > 0) {
    throw new SampleDataError(`Invalid sample data:\n- ${problems.join("\n- ")}`);
  }
}
