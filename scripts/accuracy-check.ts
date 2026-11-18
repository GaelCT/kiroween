// The accuracy check (issue #14): scores the pipeline's "+" lines against the story files.
//   npm run accuracy                  score the saved results in data/sample/results/
//   npm run accuracy -- --rerun       rerun the pipeline on the check stories first
//   npm run accuracy -- --rerun --stories a,b   rerun on these stories instead
//   npm run accuracy -- --verbose     list right lines too
// Exits with code 1 when fewer than 8 of every 10 "+" lines are right.
// --rerun writes to .cache/accuracy/, not to the committed results, and caches AI replies in
// .cache/ai/, so the agent hook only pays for prompts that changed.

import "./env";
import { modelConfigured, modelFromEnv, withDiskCache } from "../src/pipeline/ai";
import { formatReport, scoreStories } from "../src/pipeline/accuracy";
import { mapWithLimit } from "../src/pipeline/fulltext";
import { loadSampleData, readSampleFiles } from "../src/pipeline/sample";
import { runStory } from "../src/pipeline/sample-pipeline";
import { readStoryResults, RESULTS_DIR, writeStoryResult, type StoryResult } from "../src/pipeline/sample-results";

/** Three stories with several full-text sources and shared new facts: enough to catch a regression cheaply. */
const CHECK_STORIES = ["corvid-rv90", "nimbusfold-outage", "quarrow-ev-recall"];
const RERUN_DIR = ".cache/accuracy";

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main(): Promise<void> {
  const rerun = process.argv.includes("--rerun");
  const verbose = process.argv.includes("--verbose");
  const { stories } = await readSampleFiles(process.cwd());

  let results: Map<string, StoryResult>;
  if (rerun) {
    if (!modelConfigured()) {
      console.log("Accuracy check skipped: no AI model is set up yet. Add AI_PROVIDER, AI_MODEL, and the key to .env.local (see README).");
      return;
    }
    const ids = option("--stories")?.split(",") ?? CHECK_STORIES;
    const chosen = stories.filter((story) => ids.includes(story.id));
    const model = withDiskCache(modelFromEnv(), ".cache/ai");
    const data = await loadSampleData(process.cwd(), { useResults: false });
    console.log(`Rerunning ${model.name} on ${chosen.map((story) => story.id).join(", ")}...`);
    results = new Map();
    await mapWithLimit(chosen, 3, async (story) => {
      const result = await runStory(model, story, data);
      await writeStoryResult(RERUN_DIR, result);
      results.set(story.id, result);
    });
  } else {
    results = await readStoryResults(RESULTS_DIR);
    if (results.size === 0) {
      console.log("No saved results yet. Run npm run pipeline:sample, or npm run accuracy -- --rerun.");
      return;
    }
  }

  const report = scoreStories(stories, results);
  console.log(formatReport(report, verbose));
  if (!report.passed) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
