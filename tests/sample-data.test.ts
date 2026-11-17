import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  assembleSampleData,
  buildSampleFeeds,
  loadSampleData,
  readSampleFiles,
  SAMPLE_FEEDS_DIR,
  type SampleFiles,
} from "@/pipeline/sample";
import { parseMarkedParagraph, SampleDataError, validateSample, type StoryFile } from "@/pipeline/sample-format";

const root = process.cwd();

describe("parseMarkedParagraph", () => {
  it("removes markers and keeps each sentence as evidence", () => {
    const marked = parseMarkedParagraph("[f01: Corvid announced it.] Big news. [f02: It costs  $899.]");
    expect(marked.text).toBe("Corvid announced it. Big news. It costs $899.");
    expect(marked.evidence).toEqual([
      { factId: "f01", sentence: "Corvid announced it." },
      { factId: "f02", sentence: "It costs $899." },
    ]);
  });

  it("rejects malformed markers", () => {
    expect(() => parseMarkedParagraph("[f1: Missing a digit.]")).toThrow(SampleDataError);
  });
});

describe("validateSample", () => {
  const source = { id: "byteward", name: "Byteward", homepage: "https://byteward.example/" };
  const story = (changes: Partial<StoryFile>): StoryFile => ({
    id: "test-story",
    title: "Test story",
    primary: "byteward",
    facts: { f01: "A fact" },
    articles: { byteward: { title: "T", publishedAt: "2026-11-16T00:00:00Z", body: ["[f01: A fact.]"] } },
    ...changes,
  });

  it("accepts a valid story", () => {
    expect(() => validateSample([source], [story({})])).not.toThrow();
  });

  it("lists every problem", () => {
    const bad = story({
      primary: "nobody",
      facts: { f01: "A fact", f02: "Never marked" },
      articles: { byteward: { title: "T", publishedAt: "soon", body: ["[f01: One.] [f01: Again.] [f09: Unknown.]"] } },
    });
    expect(() => validateSample([source], [bad])).toThrow(
      /primary "nobody"[\s\S]*ISO 8601[\s\S]*f01 is marked twice[\s\S]*unknown fact f09[\s\S]*f02 isn't marked/,
    );
  });
});

describe("sample data", () => {
  it("has feeds in public/sample-feeds that match the story files", async () => {
    const feeds = buildSampleFeeds(await readSampleFiles(root));
    const dir = path.join(root, SAMPLE_FEEDS_DIR);
    const onDisk = (await readdir(dir)).filter((name) => name.endsWith(".xml")).sort();
    expect(onDisk).toEqual([...feeds.keys()].sort());
    for (const [name, xml] of feeds) {
      expect(await readFile(path.join(dir, name), "utf8"), `${name} is out of date: run npm run sample:build`).toBe(xml);
    }
  });

  it("finds every marked sentence verbatim in its parsed article", async () => {
    const data = await loadSampleData(root);
    expect(data.sample).toBe(true);
    for (const article of Object.values(data.articles)) {
      for (const { sentence } of article.evidence) {
        expect(article.paragraphs.some((paragraph) => paragraph.includes(sentence)), sentence).toBe(true);
      }
    }
  });

  it("builds the RV-90 story with Byteward first, then by publish time", async () => {
    const data = await loadSampleData(root);
    const story = data.clusters.find((cluster) => cluster.id === "corvid-rv90");
    expect(story?.articleIds).toEqual([
      "urn:reader-sample:byteward:corvid-rv90",
      "urn:reader-sample:launch-desk:corvid-rv90",
      "urn:reader-sample:frametime:corvid-rv90",
      "urn:reader-sample:ohm-and-bit:corvid-rv90",
    ]);
    const frametime = data.articles["urn:reader-sample:frametime:corvid-rv90"];
    expect(frametime.evidence.map((evidence) => evidence.factId)).toEqual(["f01", "f08", "f09", "f10", "f03"]);
    expect(frametime.url).toBe("https://frametime.example/2026/11/corvid-rv90");
  });

  it("fails when a feed no longer contains a marked sentence", async () => {
    const files: SampleFiles = await readSampleFiles(root);
    const feeds = new Map<string, string>();
    for (const source of files.sources) {
      feeds.set(source.id, await readFile(path.join(root, SAMPLE_FEEDS_DIR, `${source.id}.xml`), "utf8"));
    }
    feeds.set("frametime", feeds.get("frametime")!.replace("320 W", "330 W"));
    expect(() => assembleSampleData(files, feeds)).toThrow(/isn't in the parsed article/);
  });
});
