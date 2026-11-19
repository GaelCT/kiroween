// Loading saved pipeline results for the starter pack (issue #16), and the "Sample data" note.
// The results here come from the fake answer-key model, so these tests check the loader, not
// a real model's accuracy.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Reader } from "@/components/Reader";
import { factIdsOf } from "@/lib/adds";
import { assembleSampleData, loadSampleData, readSampleFiles, SAMPLE_FEEDS_DIR } from "@/pipeline/sample";
import { runStory } from "@/pipeline/sample-pipeline";
import type { StoryResult } from "@/pipeline/sample-results";
import { answerKeyModel } from "./support/answer-key-model";

const root = process.cwd();

async function setup() {
  const files = await readSampleFiles(root);
  const feeds = new Map<string, string>();
  for (const source of files.sources) {
    feeds.set(source.id, await readFile(path.join(root, SAMPLE_FEEDS_DIR, `${source.id}.xml`), "utf8"));
  }
  const tables = await loadSampleData(root, { useResults: false });
  const result = await runStory(answerKeyModel(files.stories), files.stories.find((story) => story.id === "corvid-rv90")!, tables);
  return { files, feeds, result };
}

const id = (outlet: string) => `urn:reader-sample:${outlet}:corvid-rv90`;

describe("saved pipeline results", () => {
  it("replace a story's facts and evidence, and the data says some facts came from the pipeline", async () => {
    const { files, feeds, result } = await setup();
    // Unlike the fact table: every wording changes, and FrameTime loses its first fact.
    const renamed: StoryResult = {
      ...result,
      facts: Object.fromEntries(Object.entries(result.facts).map(([factId, text]) => [factId, `AI: ${text}`])),
      articles: { ...result.articles, frametime: result.articles.frametime.slice(1) },
    };
    const data = assembleSampleData(files, feeds, new Map([["corvid-rv90", renamed]]));

    expect(data.sampleFacts).toBe("mixed");
    const story = data.clusters.find((cluster) => cluster.id === "corvid-rv90")!;
    expect(Object.values(story.facts).every((fact) => fact.text.startsWith("AI: "))).toBe(true);
    for (const outlet of Object.keys(files.stories.find((candidate) => candidate.id === "corvid-rv90")!.articles)) {
      expect(data.articles[id(outlet)].evidence, outlet).toEqual(renamed.articles[outlet] ?? []);
    }
    // Other stories keep their fact tables.
    const other = data.clusters.find((cluster) => cluster.id === "nimbusfold-outage")!;
    expect(Object.values(other.facts).some((fact) => fact.text.startsWith("AI: "))).toBe(false);
  });

  it("say every story's facts came from the pipeline when every story has results", async () => {
    const { files, feeds } = await setup();
    const tables = await loadSampleData(root, { useResults: false });
    const model = answerKeyModel(files.stories);
    const results = new Map<string, StoryResult>();
    for (const story of files.stories) results.set(story.id, await runStory(model, story, tables));
    const data = assembleSampleData(files, feeds, results);
    expect(data.sampleFacts).toBe("pipeline");
    // Excerpt-only outlets aren't compared, so they have no evidence and stay "Limited source content".
    const wirefold = Object.values(data.articles).filter((article) => article.sourceId === "wirefold");
    expect(wirefold.length).toBeGreaterThan(0);
    expect(wirefold.every((article) => article.limited && factIdsOf(article).length === 0)).toBe(true);
  });

  it("fail loudly when a saved sentence is no longer in its article", async () => {
    const { files, feeds, result } = await setup();
    const broken: StoryResult = {
      ...result,
      articles: { ...result.articles, frametime: [{ factId: "f01", sentence: "A sentence the article never had." }] },
    };
    expect(() => assembleSampleData(files, feeds, new Map([["corvid-rv90", broken]]))).toThrow(/rerun npm run pipeline:sample/);
  });
});

describe('the "Sample data" note', () => {
  it("tells readers where the facts came from", async () => {
    const tables = await loadSampleData(root, { useResults: false });
    const note = (sampleFacts: "fact-tables" | "pipeline" | "mixed") => renderToStaticMarkup(<Reader data={{ ...tables, sampleFacts }} />);
    expect(note("fact-tables")).toContain("Facts come from hand-written fact tables.");
    expect(note("pipeline")).toContain("The AI pipeline extracted the facts ahead of time, so reading them makes no AI calls.");
    expect(note("mixed")).toContain("Some stories&#x27; facts were extracted by the AI pipeline ahead of time");
  });
});
