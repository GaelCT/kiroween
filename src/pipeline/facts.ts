// Fact extraction and matching with the AI model (issue #11). Server and scripts only.
// Step 1: for each article, the model lists atomic facts, each with the sentence that states it.
//         A fact whose sentence isn't verbatim in the article is dropped (Requirement 1.2).
// Step 2: the model groups statements from different articles that say the same thing, so they
//         share a fact ID (Requirement 3). Statements that differ in a number, date, or name stay apart.
// The output has the same shape as a story file's fact table: facts, plus evidence per article.

import type { Evidence, Fact, FactId } from "@/lib/types";
import { ModelError, type ModelClient, type ModelRequest } from "./ai";
import { normalizeWhitespace } from "./html";

export interface ArticleText {
  id: string;
  title: string;
  paragraphs: string[];
}

export interface ExtractedFact {
  /** The "+" line wording. */
  text: string;
  /** Copied verbatim from the article. */
  sentence: string;
}

export interface Extraction {
  facts: ExtractedFact[];
  /** Facts the model returned whose sentence wasn't verbatim in the article, or that repeated a sentence. */
  dropped: ExtractedFact[];
}

export interface ClusterFacts {
  facts: Record<FactId, Fact>;
  /** Keyed by article ID, in reading order. */
  evidence: Record<string, Evidence[]>;
  dropped: Record<string, ExtractedFact[]>;
}

/** Shortest sentence accepted as evidence, so a stray word can't count as a match. */
const MIN_SENTENCE_CHARS = 12;

// Typographic characters the model may swap for plain ones. Each maps to exactly one character,
// so positions in the normalized text are positions in the original.
const LOOSE_CHARS: Record<string, string> = {
  "\u2018": "'",
  "\u2019": "'",
  "\u201a": "'",
  "\u201b": "'",
  "\u2032": "'",
  "\u201c": '"',
  "\u201d": '"',
  "\u201e": '"',
  "\u201f": '"',
  "\u2033": '"',
  "\u2010": "-",
  "\u2011": "-",
  "\u2012": "-",
  "\u2013": "-",
  "\u2014": "-",
  "\u2015": "-",
  "\u2212": "-",
  "\u00a0": " ",
};

function loosen(text: string): string {
  return text.replace(/[\u2018\u2019\u201a\u201b\u2032\u201c\u201d\u201e\u201f\u2033\u2010-\u2015\u2212\u00a0]/g, (char) => LOOSE_CHARS[char]);
}

export interface Located {
  /** The sentence exactly as it appears in the article. */
  sentence: string;
  paragraph: number;
  offset: number;
}

/**
 * Finds a sentence in the article. Whitespace and typographic quotes and dashes may differ;
 * everything else must match exactly. Returns the article's own text, so highlights line up.
 */
export function findVerbatim(sentence: string, paragraphs: readonly string[]): Located | null {
  const wanted = normalizeWhitespace(sentence);
  if (wanted.length < MIN_SENTENCE_CHARS) return null;
  for (const [index, paragraph] of paragraphs.entries()) {
    const exact = paragraph.indexOf(wanted);
    if (exact !== -1) return { sentence: wanted, paragraph: index, offset: exact };
  }
  const loose = loosen(wanted);
  for (const [index, paragraph] of paragraphs.entries()) {
    const at = loosen(paragraph).indexOf(loose);
    if (at !== -1) return { sentence: paragraph.slice(at, at + wanted.length), paragraph: index, offset: at };
  }
  return null;
}

export const EXTRACT_SYSTEM = `You extract facts from news articles for a feed reader that shows reporters what each source adds.

Return JSON only, in this shape:
{"facts": [{"fact": "Lasted 14 hours in a video playback test", "sentence": "In our video playback test, the laptop lasted 14 hours."}]}

Rules:
- A fact is one atomic, checkable claim: a number, a date, a price, a name, a decision, a measurement, or a result.
- "fact" is a short line in sentence case with no final period, ideally under 60 characters. State the fact itself, not its topic: "Costs $499", never "Pricing details".
- Keep every number, unit, date, and name exactly as the article gives it.
- When the article attributes a claim, keep the attribution: "The maker claims 20 hours of battery life", not "Has 20 hours of battery life".
- Keep the article's own testing apart from a company's claims. "Lasted 14 hours in a video playback test" is a different fact from "The maker claims 20 hours of battery life".
- "sentence" is the one full sentence from the article that states the fact, copied character for character. Never paraphrase it, shorten it, or join two sentences.
- At most one fact per sentence. If a sentence states several, pick the most specific one.
- Skip opinions, predictions, rhetorical questions, transitions, and the author's plans ("we'll test it soon").
- List the facts in the order they appear.`;

export function extractRequest(article: ArticleText): ModelRequest {
  return {
    system: EXTRACT_SYSTEM,
    user: `Title: ${article.title}\n\nArticle:\n${article.paragraphs.join("\n\n")}`,
    maxTokens: 4096,
    listKey: "facts",
  };
}

/** Checks the model's reply against the article. Unverifiable facts go to `dropped`. */
export function parseExtraction(reply: unknown, paragraphs: readonly string[]): Extraction {
  const raw = (reply as { facts?: unknown })?.facts;
  if (!Array.isArray(raw)) throw new ModelError('The extraction reply has no "facts" list.');
  const facts: ExtractedFact[] = [];
  const dropped: ExtractedFact[] = [];
  const sentences = new Set<string>();
  for (const item of raw) {
    const text = normalizeWhitespace(String((item as { fact?: unknown })?.fact ?? "")).replace(/\.$/, "");
    const sentence = String((item as { sentence?: unknown })?.sentence ?? "");
    if (!text) continue;
    const located = findVerbatim(sentence, paragraphs);
    if (!located || sentences.has(located.sentence)) {
      dropped.push({ text, sentence });
      continue;
    }
    sentences.add(located.sentence);
    facts.push({ text, sentence: located.sentence });
  }
  return { facts, dropped };
}

export async function extractFacts(model: ModelClient, article: ArticleText): Promise<Extraction> {
  return parseExtraction(await model.completeJson(extractRequest(article)), article.paragraphs);
}

export const MATCH_SYSTEM = `You match facts across news articles about the same event, so a feed reader can tell which facts each source repeats and which it adds.

You get numbered statements, each labeled with the article it came from. Group the statements that state the same fact.

Return JSON only, in this shape:
{"groups": [[0, 4, 9], [1], [2, 7]]}

Rules:
- Put statements in one group only when they state the same fact, even if the words differ: "Costs $499" and "Priced at $499" match.
- Statements that differ in any number, unit, date, or name are different facts: "$499" and "$549" don't match, and neither do "March 3" and "March 5".
- A company's claim and a measured test result are different facts, even about the same topic.
- A more specific statement doesn't match a vaguer one: "Ships March 3" doesn't match "Ships in March".
- Two statements from the same article never go in the same group.
- Every statement number appears in exactly one group. A statement that matches nothing is a group of one.`;

interface Statement {
  articleIndex: number;
  fact: ExtractedFact;
}

export function matchRequest(articles: readonly ArticleText[], statements: readonly Statement[]): ModelRequest {
  const lines = statements.map(
    (statement, index) => `${index}. [Article ${statement.articleIndex + 1}] ${statement.fact.text} (sentence: "${statement.fact.sentence}")`,
  );
  const titles = articles.map((article, index) => `Article ${index + 1}: ${article.title}`);
  return {
    system: MATCH_SYSTEM,
    user: `${titles.join("\n")}\n\nStatements:\n${lines.join("\n")}`,
    maxTokens: 4096,
    listKey: "groups",
  };
}

/**
 * Turns the model's groups into a clean partition of the statements: unknown and repeated numbers
 * are ignored, a second statement from the same article starts its own group, and statements the
 * model left out become groups of one.
 */
export function parseMatching(reply: unknown, statements: readonly Statement[]): number[][] {
  const raw = (reply as { groups?: unknown })?.groups;
  if (!Array.isArray(raw)) throw new ModelError('The matching reply has no "groups" list.');
  const placed = new Set<number>();
  const groups: number[][] = [];
  for (const group of raw) {
    if (!Array.isArray(group)) continue;
    const kept: number[] = [];
    const articlesInGroup = new Set<number>();
    for (const value of group) {
      const index = Number(value);
      if (!Number.isInteger(index) || index < 0 || index >= statements.length || placed.has(index)) continue;
      placed.add(index);
      if (articlesInGroup.has(statements[index].articleIndex)) {
        groups.push([index]);
        continue;
      }
      articlesInGroup.add(statements[index].articleIndex);
      kept.push(index);
    }
    if (kept.length > 0) groups.push(kept);
  }
  for (let index = 0; index < statements.length; index++) {
    if (!placed.has(index)) groups.push([index]);
  }
  return groups;
}

function factId(n: number): FactId {
  return `f${String(n).padStart(2, "0")}`;
}

/**
 * Extracts and matches facts for one cluster. `articles` starts with the primary article.
 * Fact IDs follow the order facts first appear: the primary's facts first, in reading order.
 */
export async function compareArticles(model: ModelClient, articles: readonly ArticleText[]): Promise<ClusterFacts> {
  // A story with one source has nothing to compare, so it costs no AI calls.
  if (articles.length < 2) {
    return assembleClusterFacts(articles, articles.map(() => ({ facts: [], dropped: [] })), [], []);
  }
  const extractions = await Promise.all(articles.map((article) => extractFacts(model, article)));
  const statements: Statement[] = extractions.flatMap((extraction, articleIndex) =>
    extraction.facts.map((fact) => ({ articleIndex, fact })),
  );
  const groups =
    statements.length > 1
      ? parseMatching(await model.completeJson(matchRequest(articles, statements)), statements)
      : statements.map((_, index) => [index]);
  return assembleClusterFacts(articles, extractions, statements, groups);
}

export function assembleClusterFacts(
  articles: readonly ArticleText[],
  extractions: readonly Extraction[],
  statements: readonly Statement[],
  groups: readonly number[][],
): ClusterFacts {
  const groupOf = new Map<number, number>();
  groups.forEach((group, groupIndex) => group.forEach((statement) => groupOf.set(statement, groupIndex)));

  // Statements are already in article order, then extraction order. Sort each article's
  // statements into reading order so fact IDs and evidence follow the text.
  const position = statements.map((statement) => findVerbatim(statement.fact.sentence, articles[statement.articleIndex].paragraphs)!);
  const order = statements
    .map((_, index) => index)
    .sort(
      (a, b) =>
        statements[a].articleIndex - statements[b].articleIndex ||
        position[a].paragraph - position[b].paragraph ||
        position[a].offset - position[b].offset,
    );

  const idOfGroup = new Map<number, FactId>();
  const facts: Record<FactId, Fact> = {};
  const evidence: Record<string, Evidence[]> = Object.fromEntries(articles.map((article) => [article.id, []]));
  for (const index of order) {
    const group = groupOf.get(index)!;
    let id = idOfGroup.get(group);
    if (!id) {
      id = factId(idOfGroup.size + 1);
      idOfGroup.set(group, id);
      facts[id] = { id, text: statements[index].fact.text };
    }
    evidence[articles[statements[index].articleIndex].id].push({ factId: id, sentence: statements[index].fact.sentence });
  }
  const dropped = Object.fromEntries(articles.map((article, index) => [article.id, extractions[index].dropped]));
  return { facts, evidence, dropped };
}
