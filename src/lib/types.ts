// Shared types for the reader. Browser-safe: no Node imports.

export type FactId = string;

/** One atomic, checkable statement. `text` is the wording shown on a "+" line. */
export interface Fact {
  id: FactId;
  text: string;
}

/** The exact sentence in one article that states a fact. */
export interface Evidence {
  factId: FactId;
  sentence: string;
}

export interface Source {
  id: string;
  name: string;
  homepage: string;
  /** Empty for a saved-page source, which is never fetched as a feed. */
  feedUrl: string;
  /** True for a site represented only by individually saved articles. */
  saved?: boolean;
  description?: string;
  folder?: string;
}

export interface Article {
  /** Feed entry ID. */
  id: string;
  sourceId: string;
  title: string;
  url: string;
  author?: string;
  /** ISO 8601. */
  publishedAt: string;
  /** Plain text, one string per paragraph. */
  paragraphs: string[];
  /** In reading order. */
  evidence: Evidence[];
  /** True when the feed only carried an excerpt, so the article can't be compared. */
  limited?: boolean;
}

export type ComparisonStatus = "ready" | "pending" | "failed";

export interface Cluster {
  id: string;
  title: string;
  primaryArticleId: string;
  /** Primary first, then by publish time. */
  articleIds: string[];
  facts: Record<FactId, Fact>;
  /** Missing means "ready". */
  comparison?: ComparisonStatus;
}

export interface ReaderData {
  sample: boolean;
  /**
   * Where the sample stories' facts come from: the hand-written fact tables, saved AI pipeline
   * results, or some of each. Missing when there's no sample data.
   */
  sampleFacts?: "fact-tables" | "pipeline" | "mixed";
  /** In sidebar order. */
  sources: Source[];
  articles: Record<string, Article>;
  /** Newest first. */
  clusters: Cluster[];
}
