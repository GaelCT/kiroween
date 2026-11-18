// The accuracy check (issue #14, Requirement 9): scores the pipeline's "+" lines against the
// story files, which are the answer key.
// The "+" lines are the ones a reader sees right after opening a story: what each unread source
// adds to the primary article. A line is right when its evidence sentence is a sentence the
// answer key marks with a fact, and the primary article doesn't state that fact.
// It checks sentences, not the wording of the "+" line, so skim the wording in the report too.

import { addsFor } from "@/lib/adds";
import type { Article, Cluster, Evidence } from "@/lib/types";
import { normalizeWhitespace } from "./html";
import { parseMarkedParagraph, type StoryFile } from "./sample-format";
import type { StoryResult } from "./sample-results";

/** Share of "+" lines that must be right: 8 of every 10. */
export const PASS_MARK = 0.8;

export interface ScoredLine {
  outlet: string;
  /** The "+" line wording. */
  text: string;
  sentence: string;
  right: boolean;
  /** The answer key's fact for this sentence, if it has one. */
  keyFact?: string;
  reason: string;
}

export interface StoryScore {
  story: string;
  lines: ScoredLine[];
  right: number;
  /** Answer-key "+" lines the pipeline didn't show, as "outlet: fact wording". */
  missed: string[];
}

export interface AccuracyReport {
  stories: StoryScore[];
  right: number;
  total: number;
  passed: boolean;
}

function keyEvidence(story: StoryFile): Record<string, Evidence[]> {
  return Object.fromEntries(
    Object.entries(story.articles).map(([outlet, article]) => [
      outlet,
      article.body.flatMap((paragraph) => parseMarkedParagraph(paragraph).evidence),
    ]),
  );
}

/** The answer key's evidence for a sentence: an exact match, or else the marked sentence it contains or sits inside. */
function keyFor(sentence: string, evidence: readonly Evidence[]): Evidence | undefined {
  const wanted = normalizeWhitespace(sentence);
  return (
    evidence.find((item) => item.sentence === wanted) ??
    evidence
      .filter((item) => item.sentence.includes(wanted) || wanted.includes(item.sentence))
      .sort((a, b) => b.sentence.length - a.sentence.length)[0]
  );
}

/** What each unread source adds once the primary is open, with evidence from `evidence`. */
function addsAfterOpening(
  story: StoryFile,
  outlets: readonly string[],
  evidence: Record<string, Evidence[]>,
  factIds: readonly string[],
): Map<string, string[]> {
  const articles: Record<string, Article> = Object.fromEntries(
    outlets.map((outlet) => [
      outlet,
      { id: outlet, sourceId: outlet, title: "", url: "", publishedAt: "", paragraphs: [], evidence: evidence[outlet] ?? [] },
    ]),
  );
  const cluster: Cluster = {
    id: story.id,
    title: story.title,
    primaryArticleId: story.primary,
    articleIds: [story.primary, ...outlets.filter((outlet) => outlet !== story.primary)],
    facts: Object.fromEntries(factIds.map((id) => [id, { id, text: id }])),
  };
  return new Map(
    cluster.articleIds.slice(1).map((outlet) => [outlet, addsFor(cluster, articles, [story.primary], outlet)]),
  );
}

export function scoreStory(story: StoryFile, result: StoryResult): StoryScore {
  const key = keyEvidence(story);
  // Outlets the pipeline compared. Excerpt-only outlets aren't, so they have no "+" lines.
  const outlets = Object.keys(result.articles);
  if (!outlets.includes(story.primary)) throw new Error(`${story.id}: the results have no primary article`);
  const primaryFacts = new Set(key[story.primary].map((item) => item.factId));

  const lines: ScoredLine[] = [];
  const credited = new Set<string>();
  const pipelineAdds = addsAfterOpening(story, outlets, result.articles, Object.keys(result.facts));
  for (const [outlet, factIds] of pipelineAdds) {
    for (const factId of factIds) {
      const sentence = result.articles[outlet].find((item) => item.factId === factId)!.sentence;
      const text = result.facts[factId] ?? factId;
      const match = keyFor(sentence, key[outlet] ?? []);
      if (!match) {
        lines.push({ outlet, text, sentence, right: false, reason: "The answer key says this sentence states no fact." });
        continue;
      }
      const keyFact = story.facts[match.factId];
      if (primaryFacts.has(match.factId)) {
        lines.push({ outlet, text, sentence, right: false, keyFact, reason: `The primary article already says this (${match.factId}).` });
        continue;
      }
      credited.add(`${outlet}:${match.factId}`);
      lines.push({ outlet, text, sentence, right: true, keyFact, reason: `Matches ${match.factId}.` });
    }
  }

  const keyAdds = addsAfterOpening(story, outlets, key, Object.keys(story.facts));
  const missed = [...keyAdds].flatMap(([outlet, factIds]) =>
    factIds.filter((factId) => !credited.has(`${outlet}:${factId}`)).map((factId) => `${outlet}: ${story.facts[factId]}`),
  );
  return { story: story.id, lines, right: lines.filter((line) => line.right).length, missed };
}

/** A plain-text report: every wrong line with its reason, then the score. `verbose` lists right lines too. */
export function formatReport(report: AccuracyReport, verbose = false): string {
  const out: string[] = [];
  for (const story of report.stories) {
    out.push(`${story.story}: ${story.right} of ${story.lines.length} right`);
    for (const line of story.lines) {
      if (line.right && !verbose) continue;
      out.push(`  ${line.right ? "ok   " : "WRONG"} ${line.outlet}: + ${line.text}`);
      out.push(`        "${line.sentence}"`);
      if (!line.right || verbose) out.push(`        ${line.reason}${line.keyFact ? ` Answer key: ${line.keyFact}` : ""}`);
    }
    for (const missed of story.missed) out.push(`  missed ${missed}`);
  }
  const share = report.total === 0 ? 0 : Math.round((report.right / report.total) * 100);
  out.push("");
  out.push(
    `${report.passed ? "PASS" : "FAIL"}: ${report.right} of ${report.total} "+" lines right (${share}%). ` +
      `The bar is ${PASS_MARK * 100}%.`,
  );
  return out.join("\n");
}

export function scoreStories(stories: readonly StoryFile[], results: ReadonlyMap<string, StoryResult>): AccuracyReport {
  const scored = stories.filter((story) => results.has(story.id)).map((story) => scoreStory(story, results.get(story.id)!));
  const right = scored.reduce((sum, story) => sum + story.right, 0);
  const total = scored.reduce((sum, story) => sum + story.lines.length, 0);
  return { stories: scored, right, total, passed: total > 0 && right / total >= PASS_MARK };
}
