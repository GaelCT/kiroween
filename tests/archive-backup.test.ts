import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createArchiveBackup, parseArchiveBackup, serializeArchiveBackup } from "@/lib/archive-backup";
import type { LiveState } from "@/lib/live";
import type { ReadingState } from "@/lib/reading-store";
import type { Article } from "@/lib/types";

const feedArticle: Article = {
  id: "feed-a:a1",
  sourceId: "feed-a",
  title: "Feed article",
  url: "https://a.example/story",
  publishedAt: "2026-11-18T09:00:00.000Z",
  paragraphs: ["First paragraph.", "Second paragraph."],
  evidence: [],
};
const savedArticle: Article = {
  ...feedArticle,
  id: "saved-s:s1",
  sourceId: "saved-s",
  title: "Saved page",
  url: "https://s.example/page",
};

function archive(): LiveState {
  return {
    sources: [
      { id: "feed-a", name: "Feed A", homepage: "https://a.example/", feedUrl: "https://a.example/rss", fetchedAt: "2026-11-18T09:00:00.000Z" },
      { id: "saved-s", name: "Saved", homepage: "https://s.example/", feedUrl: "", saved: true, fetchedAt: "2026-11-18T09:00:00.000Z" },
    ],
    articles: { [feedArticle.id]: feedArticle, [savedArticle.id]: savedArticle },
    stories: [{ id: "live:feed-a:a1", title: "Shared story", primaryArticleId: feedArticle.id, articleIds: [feedArticle.id, savedArticle.id] }],
    comparisons: {
      "feed-a:a1\nsaved-s:s1": {
        facts: { f01: { id: "f01", text: "A shared fact." } },
        evidence: {
          [feedArticle.id]: [{ factId: "f01", sentence: "First paragraph." }],
          [savedArticle.id]: [{ factId: "f01", sentence: "Second paragraph." }],
        },
        contradictions: [{
          id: "c01",
          topic: "Shared claim",
          claims: [
            { articleId: feedArticle.id, factId: "f01", quote: "First paragraph." },
            { articleId: savedArticle.id, factId: "f01", quote: "Second paragraph." },
          ],
        }],
      },
    },
  };
}

const reading: ReadingState = { history: [feedArticle.id], detached: [savedArticle.id], starred: ["live:feed-a:a1"], grouped: true };

function serialized(): string {
  return serializeArchiveBackup(archive(), reading, new Date("2026-11-26T00:00:00.000Z"));
}

function file(raw: string): File {
  return { size: raw.length, text: async () => raw } as File;
}

describe("archive backup format", () => {
  it("round-trips the complete archive and reading state", () => {
    const data = parseArchiveBackup(serialized());
    expect(data).toEqual({ archive: archive(), reading });
    const backup = createArchiveBackup(archive(), reading, new Date("2026-11-26T00:00:00.000Z"));
    expect(backup).toMatchObject({ format: "reader-archive", version: 1, exportedAt: "2026-11-26T00:00:00.000Z" });
    expect(serialized()).toContain("\n  \"archive\"");
  });

  it("still accepts comparisons saved before contradiction detection", () => {
    const value = JSON.parse(serialized());
    delete value.archive.comparisons["feed-a:a1\nsaved-s:s1"].contradictions;
    const restored = parseArchiveBackup(JSON.stringify(value));
    expect(restored.archive.comparisons["feed-a:a1\nsaved-s:s1"].contradictions).toBeUndefined();
  });

  it("rejects malformed JSON, wrong formats, and unsupported versions", () => {
    expect(() => parseArchiveBackup("{bad")).toThrow("isn’t readable JSON");
    expect(() => parseArchiveBackup(JSON.stringify({ format: "opml", version: 1 }))).toThrow("valid Reader archive backup");
    const wrongVersion = JSON.parse(serialized());
    wrongVersion.version = 2;
    expect(() => parseArchiveBackup(JSON.stringify(wrongVersion))).toThrow("version isn’t supported");
  });

  it("rejects structural damage instead of importing a partial archive", () => {
    const cases: Array<(value: ReturnType<typeof JSON.parse>) => void> = [
      (value) => { value.reading.history = [feedArticle.id, feedArticle.id]; },
      (value) => { value.archive.sources[1].feedUrl = "https://saved.example/rss"; },
      (value) => { value.archive.articles[feedArticle.id].sourceId = "missing"; },
      (value) => { value.archive.stories[0].articleIds = [feedArticle.id, "missing"]; },
      (value) => { value.archive.stories.push({ ...value.archive.stories[0], id: "duplicate-membership" }); },
      (value) => { value.archive.comparisons["feed-a:a1\nsaved-s:s1"].evidence[feedArticle.id] = [{ factId: "f01" }]; },
      (value) => { value.archive.comparisons["feed-a:a1\nsaved-s:s1"].contradictions[0].claims[0].quote = "Fabricated quote."; },
      (value) => { value.archive.comparisons["feed-a:a1\nsaved-s:s1"].contradictions[0].claims[0].factId = "missing"; },
      (value) => { value.archive.articles[feedArticle.id].publishedAt = "soon"; },
    ];
    for (const change of cases) {
      const value = JSON.parse(serialized());
      change(value);
      expect(() => parseArchiveBackup(JSON.stringify(value))).toThrow("valid Reader archive backup");
    }
  });
});

describe("archive backup store", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllGlobals());

  it("rejects a bad file without changing current data and restores valid data without fetching", async () => {
    const current = archive();
    const currentReading = { ...reading, grouped: false };
    const values = new Map<string, string>([
      ["reader:live:v1", JSON.stringify(current)],
      ["reader:v1", JSON.stringify(currentReading)],
    ]);
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const backups = await import("@/lib/backup-store");
    const live = await import("@/lib/live-store");
    const readingStore = await import("@/lib/reading-store");

    await expect(backups.readArchiveBackupFile(file("{bad"))).rejects.toThrow("isn’t readable JSON");
    expect(live.getLiveSnapshot().state).toEqual(current);
    expect(readingStore.getReadingSnapshot()).toEqual(currentReading);
    expect(values.get("reader:live:v1")).toBe(JSON.stringify(current));
    expect(values.get("reader:v1")).toBe(JSON.stringify(currentReading));

    const backup = await backups.readArchiveBackupFile(file(serialized()));
    expect(backups.replaceArchiveBackup(backup).ok).toBe(true);
    expect(live.getLiveSnapshot().state).toEqual(archive());
    expect(readingStore.getReadingSnapshot()).toEqual(reading);
    expect(JSON.parse(values.get("reader:live:v1")!)).toEqual(archive());
    expect(JSON.parse(values.get("reader:v1")!)).toEqual(reading);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects oversized files before reading them", async () => {
    const { MAX_BACKUP_BYTES, readArchiveBackupFile } = await import("@/lib/backup-store");
    const text = vi.fn(async () => serialized());
    await expect(readArchiveBackupFile({ size: MAX_BACKUP_BYTES + 1, text } as unknown as File)).rejects.toThrow("too large");
    expect(text).not.toHaveBeenCalled();
  });
});
