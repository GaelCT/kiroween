// Runs the AI pipeline on the starter pack and saves the results (issue #16):
//   npm run pipeline:sample                       every story
//   npm run pipeline:sample -- corvid-rv90 ...    only these stories
// Results go to data/sample/results/ and are committed, so judging needs no AI calls.
// Replies are cached in .cache/ai/, so rerunning only pays for prompts that changed.
// When a "+" line is wrong, fix the pipeline and rerun this. Never edit the results by hand.

import "./env";
import { modelFromEnv, withDiskCache } from "../src/pipeline/ai";
import { formatReport, scoreStories } from "../src/pipeline/accuracy";
import { mapWithLimit } from "../src/pipeline/fulltext";
import { loadSampleData, readSampleFiles } from "../src/pipeline/sample";
import { runStory } from "../src/pipeline/sample-pipeline";
import { readStoryResults, RESULTS_DIR, writeStoryResult } from "../src/pipeline/sample-results";

async function main(): Promise<void> {
  const model = withDiskCache(modelFromEnv(), ".cache/ai");
  const { stories } = await readSampleFiles(process.cwd());
  const wanted = process.argv.slice(2);
  const unknown = wanted.filter((id) => !stories.some((story) => story.id === id));
  if (unknown.length > 0) throw new Error(`Unknown stories: ${unknown.join(", ")}`);
  const chosen = wanted.length > 0 ? stories.filter((story) => wanted.includes(story.id)) : stories;

  // Run on the articles exactly as the app parses them, without any earlier results.
  const data = await loadSampleData(process.cwd(), { useResults: false });
  console.log(`Running ${model.name} on ${chosen.length} stories...`);
  let failed = 0;
  await mapWithLimit(chosen, 3, async (story) => {
    try {
      const result = await runStory(model, story, data);
      await writeStoryResult(RESULTS_DIR, result);
      const dropped = Object.values(result.dropped).reduce((sum, count) => sum + count, 0);
      console.log(`  ${story.id}: ${Object.keys(result.facts).length} facts${dropped ? `, ${dropped} dropped without a verbatim sentence` : ""}`);
    } catch (error) {
      failed++;
      console.error(`  ${story.id}: failed: ${(error as Error).message}`);
    }
  });

  const results = await readStoryResults(RESULTS_DIR);
  console.log(`\n${formatReport(scoreStories(stories, results))}`);
  if (failed > 0) {
    console.error(`${failed} stories failed. Rerun the command to retry them.`);
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
