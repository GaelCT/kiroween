import { describe, expect, it } from "vitest";
import { formatReport, scoreStories, scoreStory } from "@/pipeline/accuracy";
import { loadSampleData, readSampleFiles } from "@/pipeline/sample";
import type { StoryFile } from "@/pipeline/sample-format";
import { runStory } from "@/pipeline/sample-pipeline";
import type { StoryResult } from "@/pipeline/sample-results";
import { answerKeyModel } from "./support/answer-key-model";

const root = process.cwd();

async function perfectResults(): Promise<{ stories: StoryFile[]; results: Map<string, StoryResult> }> {
  const { stories } = await readSampleFiles(root);
  const data = await loadSampleData(root, { useResults: false });
  const model = answerKeyModel(stories);
  const results = new Map<string, StoryResult>();
  for (const story of stories) results.set(story.id, await runStory(model, story, data));
  return { stories, results };
}

describe("accuracy check", () => {
  it("scores the answer key itself as all right, with nothing missed", async () => {
    const { stories, results } = await perfectResults();
    const report = scoreStories(stories, results);
    expect(report.total).toBeGreaterThan(100);
    expect(report.right).toBe(report.total);
    expect(report.stories.flatMap((story) => story.missed)).toEqual([]);
    expect(report.passed).toBe(true);
  });

  it("marks a line wrong when the primary article already says it", async () => {
    const { stories, results } = await perfectResults();
    const story = stories.find((candidate) => candidate.id === "corvid-rv90")!;
    const result = structuredClone(results.get("corvid-rv90")!);
    // Break the match: Launch Desk's restatement of f01 gets its own fact ID.
    result.facts.f99 = "Corvid launched the RV-90";
    result.articles["launch-desk"] = result.articles["launch-desk"].map((item) => (item.factId === "f01" ? { ...item, factId: "f99" } : item));

    const score = scoreStory(story, result);
    const wrong = score.lines.filter((line) => !line.right);
    expect(wrong).toHaveLength(1);
    expect(wrong[0]).toMatchObject({ outlet: "launch-desk", reason: "The primary article already says this (f01)." });
    expect(score.right).toBe(12);
  });

  it("marks a line wrong when its sentence states no answer-key fact, and reports misses", async () => {
    const { stories, results } = await perfectResults();
    const story = stories.find((candidate) => candidate.id === "corvid-rv90")!;
    const result = structuredClone(results.get("corvid-rv90")!);
    result.articles.frametime = result.articles.frametime.map((item) =>
      item.factId === "f09" ? { ...item, sentence: "Here's how it performs." } : item,
    );

    const score = scoreStory(story, result);
    expect(score.lines.find((line) => line.sentence === "Here's how it performs.")).toMatchObject({ right: false });
    expect(score.missed).toEqual(["frametime: Averaged 142 fps across ray-traced games at 1440p"]);
  });

  it("fails below 8 of every 10 lines", async () => {
    const { stories, results } = await perfectResults();
    const story = stories.find((candidate) => candidate.id === "corvid-rv90")!;
    const result = structuredClone(results.get("corvid-rv90")!);
    // Nothing matches across articles any more, so every restated fact shows as new.
    let next = 50;
    for (const outlet of Object.keys(result.articles)) {
      if (outlet === story.primary) continue;
      result.articles[outlet] = result.articles[outlet].map((item) => ({ ...item, factId: `f${next++}` }));
    }
    const report = scoreStories([story], new Map([[story.id, result]]));
    expect(report.passed).toBe(false);
    expect(formatReport(report)).toMatch(/^FAIL: \d+ of \d+ "\+" lines right/m);
  });
});
