// Story clustering (issue #15): groups articles about the same event. Server and scripts only.
// It compares headlines and opening paragraphs with TF-IDF cosine similarity, weighting names
// and numbers, since those are what tell one event from another (two outages on the same
// morning share every word except the company name). It needs no AI call, so it's free,
// fast, and gives the same answer every time.
// Articles only join a story when they're clearly similar. When the score is below the
// threshold, one shared word supplies most of it, or a marginal score lacks ordinary evidence,
// they stay separate, and X fixes any wrong grouping that gets through.

export interface ClusterInput {
  id: string;
  sourceId: string;
  title: string;
  /** ISO 8601. */
  publishedAt: string;
  paragraphs: string[];
  limited?: boolean;
}

export interface ClusterOptions {
  /** Average similarity two stories need to merge. */
  threshold?: number;
  /** Articles further apart than this are never grouped. */
  windowHours?: number;
}

export interface StoryGroup {
  primaryArticleId: string;
  /** Primary first, then by publish time. */
  articleIds: string[];
}

/**
 * On the starter pack, every threshold from 0.06 to 0.24 matches the story files exactly
 * (npm run sample:cluster). On 495 real articles from 20 tech feeds (Nov 18, 2026, labeled by
 * hand and kept out of the repo), 0.22 grouped the fewest different events together without
 * splitting many same-event pairs.
 */
export const DEFAULT_THRESHOLD = 0.22;
const DEFAULT_WINDOW_HOURS = 48;
const LEAD_PARAGRAPHS = 2;

/** Names and numbers count this many times as much as ordinary words. */
const NAME_WEIGHT = 2;

/**
 * The largest share of a pair's similarity one shared term may supply. Above it, the articles
 * have one word in common that matters, often a company name, and that doesn't make them the
 * same event: a recall and a new chief executive at one company are two stories.
 */
const MAX_TERM_SHARE = 0.6;

/** Near the default threshold, require evidence beyond shared names and numbers. */
const MARGINAL_SCORE_LIMIT = 0.24;

const STOPWORDS = new Set(
  (
    "a about after again against all also an and any are as at be because been before being but by can could " +
    "did do does doing down during each few for from further had has have having he her here hers him his how " +
    "i if in into is it its itself just me more most my new no nor not now of off on once only or other our " +
    "out over own same says said she should so some such than that the their them then there these they this " +
    "those through to too under until up us very was we were what when where which while who whom why will " +
    "with would you your yours today monday tuesday wednesday thursday friday saturday sunday week year " +
    "company announced announces launch launches launched first one two three"
  ).split(" "),
);

type Vector = Map<string, number>;

function stem(word: string): string {
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

/** Terms with weights: names and numbers count NAME_WEIGHT times, ordinary words once. */
export function terms(text: string): Vector {
  const counts: Vector = new Map();
  for (const match of text.matchAll(/[\p{L}\p{N}](?:[\p{L}\p{N}'’.-]*[\p{L}\p{N}])?/gu)) {
    const word = match[0].replace(/['’]s$/u, "").replace(/['’]/gu, "");
    const lower = word.toLowerCase();
    if ((lower.length < 2 && !/\d/.test(lower)) || STOPWORDS.has(lower)) continue;
    const startsSentence = /(?:^|[.!?:]\s*)$/.test(text.slice(Math.max(0, match.index - 3), match.index));
    const isName = /^\p{Lu}/u.test(word) && !startsSentence;
    const isNumber = /\d/.test(word);
    const term = isNumber ? lower : stem(lower);
    counts.set(term, (counts.get(term) ?? 0) + (isName || isNumber ? NAME_WEIGHT : 1));
  }
  return counts;
}

function articleText(article: ClusterInput): string {
  // The headline counts twice: it's the best summary of what happened.
  return [article.title, article.title, ...article.paragraphs.slice(0, LEAD_PARAGRAPHS)].join(". ");
}

/** Terms written as a mid-sentence name or a number in the headline or selected lead. */
function strongTerms(article: ClusterInput): Set<string> {
  const strong = new Set<string>();
  const text = [article.title, ...article.paragraphs.slice(0, LEAD_PARAGRAPHS)].join(". ");
  for (const match of text.matchAll(/[\p{L}\p{N}](?:[\p{L}\p{N}'’.-]*[\p{L}\p{N}])?/gu)) {
    const word = match[0].replace(/['’]s$/u, "").replace(/['’]/gu, "");
    const lower = word.toLowerCase();
    if ((lower.length < 2 && !/\d/.test(lower)) || STOPWORDS.has(lower)) continue;
    const startsSentence = /(?:^|[.!?:]\s*)$/.test(text.slice(Math.max(0, match.index - 3), match.index));
    if ((/^\p{Lu}/u.test(word) && !startsSentence) || /\d/.test(word)) {
      strong.add(/\d/.test(word) ? lower : stem(lower));
    }
  }
  return strong;
}

function ordinarySharedTerms(a: Vector, b: Vector, strongA: Set<string>, strongB: Set<string>): number {
  let count = 0;
  for (const term of a.keys()) {
    if (b.has(term) && !(strongA.has(term) && strongB.has(term))) count++;
  }
  return count;
}

function tfidf(documents: Vector[]): Vector[] {
  const documentFrequency = new Map<string, number>();
  for (const document of documents) for (const term of document.keys()) documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
  const count = documents.length;
  return documents.map((document) => {
    const vector: Vector = new Map();
    let norm = 0;
    for (const [term, tf] of document) {
      // Smoothed IDF stays above zero, so a word every article shares still counts a little.
      // Without that, a reader with only two articles about one event could never group them.
      const weight = (1 + Math.log(tf)) * Math.log(1 + count / documentFrequency.get(term)!);
      vector.set(term, weight);
      norm += weight * weight;
    }
    norm = Math.sqrt(norm) || 1;
    for (const [term, weight] of vector) vector.set(term, weight / norm);
    return vector;
  });
}

/** Cosine similarity, or 0 when a single shared term supplies more than MAX_TERM_SHARE of it. */
function cosine(a: Vector, b: Vector): number {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let sum = 0;
  let largest = 0;
  for (const [term, weight] of small) {
    const product = weight * (large.get(term) ?? 0);
    sum += product;
    largest = Math.max(largest, product);
  }
  return sum > 0 && largest / sum > MAX_TERM_SHARE ? 0 : sum;
}

/** Similarity of every pair of articles, with ineligible and weakly supported matches set to zero. */
export function similarities(articles: readonly ClusterInput[], windowHours = DEFAULT_WINDOW_HOURS): number[][] {
  const vectors = tfidf(articles.map((article) => terms(articleText(article))));
  const strong = articles.map((article) => strongTerms(article));
  const times = articles.map((article) => Date.parse(article.publishedAt));
  const window = windowHours * 3_600_000;
  return articles.map((a, i) =>
    articles.map((b, j) => {
      if (i === j) return 1;
      if (a.sourceId === b.sourceId) return 0;
      if (Math.abs(times[i] - times[j]) > window) return 0;
      const score = cosine(vectors[i], vectors[j]);
      if (
        score < MARGINAL_SCORE_LIMIT &&
        ordinarySharedTerms(vectors[i], vectors[j], strong[i], strong[j]) < 2
      ) {
        return 0;
      }
      return score;
    }),
  );
}

/** The article a story opens on: the earliest full article, since excerpt-only articles can't be compared. */
export function choosePrimary(articles: readonly ClusterInput[]): ClusterInput {
  const full = articles.filter((article) => !article.limited);
  const pool = full.length > 0 ? full : articles;
  return [...pool].sort((a, b) => a.publishedAt.localeCompare(b.publishedAt) || a.id.localeCompare(b.id))[0];
}

/**
 * Groups articles into stories with average-linkage clustering: the two most similar stories
 * merge while their average similarity is at least the threshold. A story never holds two
 * articles from the same source.
 */
export function clusterArticles(articles: readonly ClusterInput[], options: ClusterOptions = {}): StoryGroup[] {
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  const similarity = similarities(articles, options.windowHours);
  let groups = articles.map((_, index) => [index]);

  for (;;) {
    let best = { score: threshold, a: -1, b: -1 };
    for (let a = 0; a < groups.length; a++) {
      for (let b = a + 1; b < groups.length; b++) {
        const sources = new Set(groups[a].map((index) => articles[index].sourceId));
        if (groups[b].some((index) => sources.has(articles[index].sourceId))) continue;
        let sum = 0;
        let zero = false;
        for (const i of groups[a]) {
          for (const j of groups[b]) {
            sum += similarity[i][j];
            if (similarity[i][j] === 0) zero = true;
          }
        }
        if (zero) continue;
        const score = sum / (groups[a].length * groups[b].length);
        if (score >= best.score) best = { score, a, b };
      }
    }
    if (best.a === -1) break;
    const merged = [...groups[best.a], ...groups[best.b]];
    groups = groups.filter((_, index) => index !== best.a && index !== best.b);
    groups.push(merged);
  }

  return groups.map((group) => {
    const members = group.map((index) => articles[index]);
    const primary = choosePrimary(members);
    const rest = members
      .filter((article) => article.id !== primary.id)
      .sort((a, b) => a.publishedAt.localeCompare(b.publishedAt) || a.id.localeCompare(b.id));
    return { primaryArticleId: primary.id, articleIds: [primary.id, ...rest.map((article) => article.id)] };
  });
}
