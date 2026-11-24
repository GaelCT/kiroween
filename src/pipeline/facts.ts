// Fact extraction and matching with the AI model (issue #11). Server and scripts only.
// Step 1: for each article, the model lists atomic facts, each with the sentence that states it.
//         A fact whose sentence isn't verbatim in the article is dropped (Requirement 1.2).
// Step 2: the model groups statements from different articles that say the same thing, so they
//         share a fact ID (Requirement 3). Statements that differ in a number, date, or name stay apart.
// Step 3: the statements step 2 left out of every primary fact would be shown as new, so the model
//         checks each against the primary article's facts once more. On Nov 19, step 2 alone
//         missed restatements such as "is buying" for "agreed to buy".
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
- The news itself is a fact, even when later sentences give its details. In "Velmont is recalling its space heaters. The recall covers 12,000 units.", each sentence states a fact.
- Skip opinions, predictions, rhetorical questions, transitions, and the author's plans ("we'll test it soon").
- Skip conclusions the writer works out from facts already in the article, such as the gap between two dates or two prices.
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
- Group statements that make the same claim, whatever the wording. "Costs $499" and "Priced at $499" match. So do "launched", "announced", "unveiled", "released", and "revealed" when they say the same product came out, and "oversees up to 20" and "supervises as many as 20".
- Only a conflict makes two statements different facts: a different number, unit, calendar date, or name. "$499" and "$549" don't match, and neither do "March 3" and "March 5".
- Detail that one statement adds and the other leaves out doesn't make a different fact, unless it adds a number, a calendar date, or a name. A weekday, "today", "this morning", "for hours", or a description such as "its first headset" doesn't change the claim. But "Ships March 3" doesn't match "Ships in March".
- A company's claim and a measured test result are different facts, even about the same topic.
- Article 1 is the one readers open first. A statement from another article that repeats one of Article 1's facts must go in that fact's group, or the reader is told it's new.
- Two statements from the same article never go in the same group.
- Every statement number appears in exactly one group. A statement that matches nothing is a group of one.`;

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

export const REPEATS_SYSTEM = `You check a feed reader's list of new facts against the article the reader opens first.

You get the facts of that primary article, numbered P0, P1, and so on, and statements from other articles about the same event, numbered C0, C1, and so on. Every C statement is about to be shown as new. For each one, say which P fact it repeats, if any.

Return JSON only, in this shape:
{"repeats": [{"candidate": 0, "primary": 2}, {"candidate": 1, "primary": null}]}

Rules:
- A statement repeats a P fact when it makes the same claim, whatever the wording. "Is buying Quillfern" repeats "Agreed to acquire Quillfern", and "Launched the Arc 7" repeats "Announced the Arc 7".
- Detail that doesn't add a number, a calendar date, or a name doesn't make a statement new: "today", "for hours", or "its latest phone".
- A statement with a different number, unit, calendar date, or name is new. So is one that adds a number, a date, or a name the P fact doesn't have.
- A company's claim and a measured test result are different facts.
- Give a P number only when the claim is clearly the same. Otherwise answer null, so a real new fact is never hidden.
- Answer for every C statement, once.`;

interface Statement {
  articleIndex: number;
  fact: ExtractedFact;
}

export function repeatsRequest(primary: readonly Statement[], candidates: readonly Statement[]): ModelRequest {
  const line = (prefix: string, statement: Statement, index: number) =>
    `${prefix}${index}. ${statement.fact.text} (sentence: "${statement.fact.sentence}")`;
  return {
    system: REPEATS_SYSTEM,
    user:
      `Primary article facts:\n${primary.map((statement, index) => line("P", statement, index)).join("\n")}\n\n` +
      `Statements from other articles:\n${candidates.map((statement, index) => line("C", statement, index)).join("\n")}`,
    maxTokens: 2048,
    listKey: "repeats",
  };
}

/** Reads the check's reply: candidate number to primary number, for candidates that repeat a primary fact. */
export function parseRepeats(reply: unknown, candidates: number, primary: number): Map<number, number> {
  const raw = (reply as { repeats?: unknown })?.repeats;
  if (!Array.isArray(raw)) throw new ModelError('The check reply has no "repeats" list.');
  const found = new Map<number, number>();
  for (const item of raw) {
    const { candidate, primary: target } = (item ?? {}) as { candidate?: unknown; primary?: unknown };
    if (target === null || target === undefined) continue;
    const from = Number(candidate);
    const to = Number(target);
    if (!Number.isInteger(from) || from < 0 || from >= candidates || found.has(from)) continue;
    if (!Number.isInteger(to) || to < 0 || to >= primary) continue;
    found.set(from, to);
  }
  return found;
}

/**
 * Step 3: asks the model whether any group without a primary statement repeats a primary fact,
 * and moves the ones that do into that fact's group. A statement whose article already has one
 * in the target group stays where it was, so no article states one fact twice.
 */
async function checkRepeats(model: ModelClient, statements: readonly Statement[], groups: readonly number[][]): Promise<number[][]> {
  const primary = statements.map((_, index) => index).filter((index) => statements[index].articleIndex === 0);
  const candidateGroups = groups
    .map((_, index) => index)
    .filter((index) => groups[index].every((statement) => statements[statement].articleIndex !== 0));
  if (primary.length === 0 || candidateGroups.length === 0) return groups.map((group) => [...group]);

  const representative = (group: readonly number[]) => statements[Math.min(...group)];
  const reply = await model.completeJson(
    repeatsRequest(
      primary.map((index) => statements[index]),
      candidateGroups.map((index) => representative(groups[index])),
    ),
  );
  const found = parseRepeats(reply, candidateGroups.length, primary.length);

  const result = groups.map((group) => [...group]);
  const groupOf = new Map<number, number>();
  result.forEach((group, index) => group.forEach((statement) => groupOf.set(statement, index)));
  for (const [candidate, target] of found) {
    const from = candidateGroups[candidate];
    const to = groupOf.get(primary[target])!;
    const articlesThere = new Set(result[to].map((statement) => statements[statement].articleIndex));
    const moving = result[from].filter((statement) => !articlesThere.has(statements[statement].articleIndex));
    result[to].push(...moving);
    result[from] = result[from].filter((statement) => !moving.includes(statement));
  }
  return result.filter((group) => group.length > 0);
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
  const matched =
    statements.length > 1
      ? parseMatching(await model.completeJson(matchRequest(articles, statements)), statements)
      : statements.map((_, index) => [index]);
  const groups = await checkRepeats(model, statements, matched);
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
