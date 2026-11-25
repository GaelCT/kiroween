// Fact extraction and matching with the AI model (issue #11). Server and scripts only.
// Step 1: for each article, the model lists atomic facts, each with the sentence that states it.
//         A fact whose sentence isn't verbatim in the article is dropped (Requirement 1.2).
// Step 2: the model groups statements from different articles that say the same thing, so they
//         share a fact ID (Requirement 3). Statements that differ in a number, date, or name stay apart.
// Step 3: the statements step 2 left out of every primary fact would be shown as new, so the model
//         checks each against the primary article's full text once more and quotes the primary's
//         sentence when it already says the same thing. On Nov 19, step 2 alone missed
//         restatements such as "is buying" for "agreed to buy", and extraction sometimes skipped
//         the primary's lead, so there was no primary fact to match.
// Step 4: sources grouped under one fact all show the same "+" wording, so a source whose own
//         sentence lacks a number in that wording gets its own fact instead.
// The output has the same shape as a story file's fact table: facts, plus evidence per article.

import type { Contradiction, Evidence, Fact, FactId } from "@/lib/types";
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
  contradictions: Contradiction[];
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

You get that primary article, then statements from other articles about the same event, numbered C0, C1, and so on. Each C statement is about to be shown to the reader as new. For each one, decide whether the primary article already says it.

Return JSON only, in this shape:
{"repeats": [{"candidate": 0, "sentence": "The sentence from the primary article that says it."}, {"candidate": 1, "sentence": null}]}

Rules:
- When the primary article already makes the same claim, in any words, give the one sentence from the primary article that makes it, copied character for character from its text. "Is buying Quillfern" is the same claim as "Agreed to acquire Quillfern", "Launched the Arc 7" is the same claim as "Announced the Arc 7", and the same quotation from a different source is the same claim.
- Detail that doesn't add a number, a calendar date, or a name doesn't make a statement new: "today", "on Monday", "for hours", or "its latest phone".
- A statement is new, so answer null, when it has a number, unit, calendar date, or name that the primary article doesn't give for that claim.
- A company's claim and a measured test result are different facts.
- Only quote the primary article's text, never its title.
- Answer null unless the primary article clearly says the same thing, so a real new fact is never hidden.
- Answer for every C statement, once.`;

interface Statement {
  articleIndex: number;
  fact: ExtractedFact;
}

export function repeatsRequest(primary: ArticleText, candidates: readonly Statement[]): ModelRequest {
  const lines = candidates.map((statement, index) => `C${index}. ${statement.fact.text} (sentence: "${statement.fact.sentence}")`);
  return {
    system: REPEATS_SYSTEM,
    user:
      `Primary article:\nTitle: ${primary.title}\n\n${primary.paragraphs.join("\n\n")}\n\n` +
      `Statements from other articles:\n${lines.join("\n")}`,
    maxTokens: 4096,
    listKey: "repeats",
  };
}

/** Reads the check's reply: candidate number to the primary sentence the model quoted for it. */
export function parseRepeats(reply: unknown, candidates: number): Map<number, string> {
  const raw = (reply as { repeats?: unknown })?.repeats;
  if (!Array.isArray(raw)) throw new ModelError('The check reply has no "repeats" list.');
  const found = new Map<number, string>();
  for (const item of raw) {
    const { candidate, sentence } = (item ?? {}) as { candidate?: unknown; sentence?: unknown };
    const index = Number(candidate);
    if (typeof sentence !== "string" || !sentence.trim()) continue;
    if (!Number.isInteger(index) || index < 0 || index >= candidates || found.has(index)) continue;
    found.set(index, sentence);
  }
  return found;
}

export const CONTRADICTION_SYSTEM = `You find genuinely contradictory claims in news articles about the same event.

You get numbered atomic statements, each labeled with its article and exact source sentence. Identify only claims that cannot all be true as written because they disagree about the same subject, time, and context.

Return JSON only, in this shape:
{"contradictions": [{"topic": "Units sold", "statements": [0, 4]}]}

Rules:
- A contradiction needs at least two statements from different articles.
- Different numbers, dates, prices, names, decisions, or outcomes can conflict when they describe the same thing.
- Added detail is not a conflict. A company forecast and a later measured result are not a conflict. Claims about different dates, regions, products, or test conditions are not a conflict.
- Different wording, attribution, or emphasis alone is not a conflict.
- When the disagreement is inconclusive or merely possible, omit it.
- "topic" is a short neutral label, never a verdict about which source is right.
- Use only the supplied statement numbers. Do not invent quotes or claims. Return an empty list when nothing clearly conflicts.`;

function contradictionRequest(statements: readonly Statement[]): ModelRequest {
  const lines = statements.map(
    (statement, index) => `${index}. [Article ${statement.articleIndex + 1}] ${statement.fact.text} (sentence: "${statement.fact.sentence}")`,
  );
  return { system: CONTRADICTION_SYSTEM, user: `Statements:\n${lines.join("\n")}`, maxTokens: 2048, listKey: "contradictions" };
}

/** Accepts only resolvable cross-article pairs; all quotes come from the already verified statements. */
export function parseContradictions(
  reply: unknown,
  statements: readonly Statement[],
  cluster: Pick<ClusterFacts, "evidence">,
): Contradiction[] {
  const raw = (reply as { contradictions?: unknown })?.contradictions;
  if (!Array.isArray(raw)) throw new ModelError('The contradiction reply has no "contradictions" list.');
  const result: Contradiction[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const rawTopic = (item as { topic?: unknown })?.topic;
    const topic = typeof rawTopic === "string" ? normalizeWhitespace(rawTopic) : "";
    const indices = (item as { statements?: unknown })?.statements;
    if (!topic || topic.length > 160 || !Array.isArray(indices)) continue;
    const unique = [...new Set(indices.map(Number))];
    if (
      unique.some((index) => !Number.isInteger(index) || index < 0 || index >= statements.length) ||
      unique.length < 2 ||
      new Set(unique.map((index) => statements[index].articleIndex)).size !== unique.length
    ) continue;
    unique.sort((a, b) => a - b);
    const key = unique.join(",");
    if (seen.has(key)) continue;
    const claims = unique.map((index) => {
      const statement = statements[index];
      const articleId = Object.keys(cluster.evidence)[statement.articleIndex];
      const evidence = cluster.evidence[articleId]?.find((item) => item.sentence === statement.fact.sentence);
      return evidence ? { articleId, factId: evidence.factId, quote: statement.fact.sentence } : null;
    });
    if (claims.some((claim) => claim === null)) continue;
    seen.add(key);
    result.push({ id: `c${String(result.length + 1).padStart(2, "0")}`, topic, claims: claims as Contradiction["claims"] });
  }
  return result;
}

function overlaps(a: string, b: string): boolean {
  return a === b || a.includes(b) || b.includes(a);
}

/**
 * Step 3: asks the model whether the primary article already says what each group without a
 * primary statement says, and moves the groups it does into the primary's fact. When extraction
 * missed that primary sentence, it's added as a primary statement. Answers that aren't verbatim in
 * the primary article are ignored. A statement whose article already has one in the target group
 * stays where it was, so no article states one fact twice.
 */
async function checkRepeats(
  model: ModelClient,
  articles: readonly ArticleText[],
  statements: readonly Statement[],
  groups: readonly number[][],
): Promise<{ statements: Statement[]; groups: number[][] }> {
  const all = [...statements];
  const result = groups.map((group) => [...group]);
  const candidateGroups = result
    .map((_, index) => index)
    .filter((index) => result[index].every((statement) => all[statement].articleIndex !== 0));
  if (candidateGroups.length === 0) return { statements: all, groups: result };

  const representative = (group: readonly number[]) => all[Math.min(...group)];
  const reply = await model.completeJson(repeatsRequest(articles[0], candidateGroups.map((index) => representative(result[index]))));
  const found = parseRepeats(reply, candidateGroups.length);

  for (const [candidate, quoted] of found) {
    const located = findVerbatim(quoted, articles[0].paragraphs);
    if (!located) continue;
    const from = candidateGroups[candidate];
    const to = result.findIndex((group) => group.some((index) => all[index].articleIndex === 0 && overlaps(all[index].fact.sentence, located.sentence)));
    if (to === -1) {
      // Extraction missed this primary sentence: it becomes the primary's statement of the fact.
      all.push({ articleIndex: 0, fact: { text: representative(result[from]).fact.text, sentence: located.sentence } });
      result[from].push(all.length - 1);
      continue;
    }
    if (to === from) continue;
    const articlesThere = new Set(result[to].map((index) => all[index].articleIndex));
    const moving = result[from].filter((index) => !articlesThere.has(all[index].articleIndex));
    result[to].push(...moving);
    result[from] = result[from].filter((index) => !moving.includes(index));
  }
  return { statements: all, groups: result.filter((group) => group.length > 0) };
}

const NUMBER_WORDS: Record<string, string> = {
  zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10",
  eleven: "11", twelve: "12", thirteen: "13", fourteen: "14", fifteen: "15", sixteen: "16", seventeen: "17", eighteen: "18",
  nineteen: "19", twenty: "20", thirty: "30", forty: "40", fifty: "50", sixty: "60", seventy: "70", eighty: "80", ninety: "90",
  hundred: "100", first: "1", second: "2", third: "3", fourth: "4", fifth: "5", sixth: "6", seventh: "7", eighth: "8",
  ninth: "9", tenth: "10",
};

/** The numbers written in digits: "$1,500" is 1500, "04:10" is 4 and 10, "38%" is 38. */
function digitsIn(text: string): string[] {
  return (text.match(/\d[\d,.]*\d|\d/g) ?? []).map((raw) => raw.replace(/,/g, "").replace(/^0+(?=\d)/, ""));
}

/**
 * Whether a sentence backs every number a "+" line shows. Numbers can be in digits or words in the
 * sentence, or in its article's title, where product names such as "Pulse 3" often are.
 */
export function supportsNumbers(line: string, sentence: string, title: string): boolean {
  const available = new Set([...digitsIn(sentence), ...digitsIn(title)]);
  for (const word of sentence.toLowerCase().match(/[a-z]+/g) ?? []) if (NUMBER_WORDS[word]) available.add(NUMBER_WORDS[word]);
  return digitsIn(line).every((number) => available.has(number));
}

/**
 * Step 4: in a group with no primary statement, every source shows the first statement's wording.
 * A statement whose sentence lacks a number in that wording leaves the group, so its "+" line
 * never claims more than its highlighted sentence says. Statements that leave together stay together.
 */
function splitUnsupported(articles: readonly ArticleText[], statements: readonly Statement[], groups: readonly number[][]): number[][] {
  const position = statements.map((statement) => findVerbatim(statement.fact.sentence, articles[statement.articleIndex].paragraphs)!);
  const byReading = (a: number, b: number) =>
    statements[a].articleIndex - statements[b].articleIndex ||
    position[a].paragraph - position[b].paragraph ||
    position[a].offset - position[b].offset;
  const result: number[][] = [];
  const queue = groups.map((group) => [...group]);
  for (let group = queue.shift(); group; group = queue.shift()) {
    if (group.length < 2 || group.some((index) => statements[index].articleIndex === 0)) {
      result.push(group);
      continue;
    }
    const [shown, ...others] = [...group].sort(byReading);
    const supported = (index: number) =>
      supportsNumbers(statements[shown].fact.text, statements[index].fact.sentence, articles[statements[index].articleIndex].title);
    result.push([shown, ...others.filter(supported)]);
    const rest = others.filter((index) => !supported(index));
    if (rest.length > 0) queue.push(rest);
  }
  return result;
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
  const extracted: Statement[] = extractions.flatMap((extraction, articleIndex) =>
    extraction.facts.map((fact) => ({ articleIndex, fact })),
  );
  const matched =
    extracted.length > 1
      ? parseMatching(await model.completeJson(matchRequest(articles, extracted)), extracted)
      : extracted.map((_, index) => [index]);
  const { statements, groups } = await checkRepeats(model, articles, extracted, matched);
  const cluster = assembleClusterFacts(articles, extractions, statements, splitUnsupported(articles, statements, groups));
  if (statements.length < 2) return cluster;
  const reply = await model.completeJson(contradictionRequest(statements));
  return { ...cluster, contradictions: parseContradictions(reply, statements, cluster) };
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
  return { facts, evidence, contradictions: [], dropped };
}
