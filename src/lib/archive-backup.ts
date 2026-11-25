// Versioned, browser-local archive backups. Validation is deliberately stricter than storage loading:
// an import must never replace a good archive with partially valid data.

import type { LiveSource, LiveState, LiveStory, SavedComparison } from "./live";
import type { ReadingState } from "./reading-store";
import type { Article, Evidence, Fact } from "./types";

export const ARCHIVE_BACKUP_FORMAT = "reader-archive";
export const ARCHIVE_BACKUP_VERSION = 1;

export interface ArchiveBackupData {
  archive: LiveState;
  reading: ReadingState;
}

export interface ArchiveBackup extends ArchiveBackupData {
  format: typeof ARCHIVE_BACKUP_FORMAT;
  version: typeof ARCHIVE_BACKUP_VERSION;
  /** ISO 8601. Informational; not used to decide which archive is newer. */
  exportedAt: string;
}

export class BackupParseError extends Error {
  override name = "BackupParseError";
}

function invalid(message = "That file isn’t a valid Reader archive backup."): never {
  throw new BackupParseError(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isIsoDate(value: unknown): value is string {
  return isString(value) && value.length > 0 && Number.isFinite(Date.parse(value));
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function uniqueStrings(value: unknown): value is string[] {
  return stringArray(value) && new Set(value).size === value.length;
}

function optionalString(record: Record<string, unknown>, key: string): boolean {
  return record[key] === undefined || isString(record[key]);
}

function optionalBoolean(record: Record<string, unknown>, key: string): boolean {
  return record[key] === undefined || isBoolean(record[key]);
}

function validSource(value: unknown): value is LiveSource {
  if (!isRecord(value)) return false;
  return (
    isString(value.id) && value.id.length > 0 &&
    isString(value.name) &&
    isString(value.homepage) &&
    isString(value.feedUrl) &&
    isIsoDate(value.fetchedAt) &&
    optionalString(value, "description") &&
    optionalString(value, "folder") &&
    optionalBoolean(value, "saved") &&
    (value.saved === true ? value.feedUrl === "" : value.feedUrl.length > 0)
  );
}

function validEvidence(value: unknown): value is Evidence {
  return isRecord(value) && isString(value.factId) && isString(value.sentence);
}

function validArticle(value: unknown): value is Article {
  if (!isRecord(value)) return false;
  return (
    isString(value.id) && value.id.length > 0 &&
    isString(value.sourceId) && value.sourceId.length > 0 &&
    isString(value.title) &&
    isString(value.url) &&
    isIsoDate(value.publishedAt) &&
    optionalString(value, "author") &&
    Array.isArray(value.paragraphs) && value.paragraphs.every(isString) &&
    Array.isArray(value.evidence) && value.evidence.every(validEvidence) &&
    optionalBoolean(value, "limited")
  );
}

function validStory(value: unknown, articles: Readonly<Record<string, Article>>): value is LiveStory {
  if (!isRecord(value)) return false;
  return (
    isString(value.id) && value.id.length > 0 &&
    isString(value.title) &&
    isString(value.primaryArticleId) &&
    uniqueStrings(value.articleIds) && value.articleIds.length > 0 &&
    value.articleIds.every((id) => Object.hasOwn(articles, id)) &&
    value.articleIds.includes(value.primaryArticleId)
  );
}

function validFact(value: unknown): value is Fact {
  return isRecord(value) && isString(value.id) && isString(value.text);
}

function validComparison(value: unknown): value is SavedComparison {
  if (!isRecord(value) || !isRecord(value.facts) || !isRecord(value.evidence)) return false;
  return (
    Object.entries(value.facts).every(([id, fact]) => validFact(fact) && fact.id === id) &&
    Object.values(value.evidence).every((evidence) => Array.isArray(evidence) && evidence.every(validEvidence))
  );
}

function validReading(value: unknown): value is ReadingState {
  if (!isRecord(value)) return false;
  return uniqueStrings(value.history) && uniqueStrings(value.detached) && uniqueStrings(value.starred) && isBoolean(value.grouped);
}

/** Parses and fully validates a backup before any browser state is changed. */
export function parseArchiveBackup(raw: string): ArchiveBackupData {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return invalid("That file isn’t readable JSON. Choose a Reader archive backup.");
  }
  if (!isRecord(value) || value.format !== ARCHIVE_BACKUP_FORMAT) return invalid();
  if (value.version !== ARCHIVE_BACKUP_VERSION) return invalid("This backup version isn’t supported by this version of Reader.");
  if (!isIsoDate(value.exportedAt) || !isRecord(value.archive) || !validReading(value.reading)) return invalid();

  const candidate = value.archive;
  if (!Array.isArray(candidate.sources) || !candidate.sources.every(validSource)) return invalid();
  const sources = candidate.sources;
  const sourceIds = new Set(sources.map((source) => source.id));
  if (sourceIds.size !== sources.length) return invalid();

  if (!isRecord(candidate.articles)) return invalid();
  const articleEntries = Object.entries(candidate.articles);
  if (!articleEntries.every(([id, article]) => validArticle(article) && article.id === id && sourceIds.has(article.sourceId))) return invalid();
  const articles = Object.fromEntries(articleEntries) as Record<string, Article>;

  if (!Array.isArray(candidate.stories) || !candidate.stories.every((story) => validStory(story, articles))) return invalid();
  const stories = candidate.stories;
  if (new Set(stories.map((story) => story.id)).size !== stories.length) return invalid();
  const memberships = stories.flatMap((story) => story.articleIds);
  if (new Set(memberships).size !== memberships.length) return invalid();

  if (!isRecord(candidate.comparisons) || !Object.values(candidate.comparisons).every(validComparison)) return invalid();
  const comparisons = candidate.comparisons as Record<string, SavedComparison>;

  return {
    archive: { sources, articles, stories, comparisons },
    reading: {
      history: value.reading.history,
      detached: value.reading.detached,
      starred: value.reading.starred,
      grouped: value.reading.grouped,
    },
  };
}

export function createArchiveBackup(archive: LiveState, reading: ReadingState, now = new Date()): ArchiveBackup {
  return {
    format: ARCHIVE_BACKUP_FORMAT,
    version: ARCHIVE_BACKUP_VERSION,
    exportedAt: now.toISOString(),
    archive,
    reading,
  };
}

export function serializeArchiveBackup(archive: LiveState, reading: ReadingState, now = new Date()): string {
  return JSON.stringify(createArchiveBackup(archive, reading, now), null, 2);
}
