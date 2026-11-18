// Saved AI pipeline results for the starter pack (issue #16), one file per story in
// data/sample/results/<story>.json. They're committed so judging needs no AI calls.
// They're pipeline output: when a "+" line is wrong, fix the pipeline and rerun
// npm run pipeline:sample. Never edit a results file by hand.

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Evidence, FactId } from "@/lib/types";

export const RESULTS_DIR = "data/sample/results";

export interface StoryResult {
  story: string;
  /** "provider/model". */
  model: string;
  generatedAt: string;
  facts: Record<FactId, string>;
  /** Evidence per outlet ID, in reading order. Outlets whose feed only has excerpts are left out. */
  articles: Record<string, Evidence[]>;
  /** How many facts the model returned without a verbatim sentence, per outlet. */
  dropped: Record<string, number>;
}

export async function writeStoryResult(dir: string, result: StoryResult): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${result.story}.json`), `${JSON.stringify(result, null, 2)}\n`);
}

/**
 * Reads every results file in data/sample/results/ under `root`, keyed by story ID. A missing
 * folder means no results yet. The path is spelled out so Next.js only bundles that folder.
 */
export async function readStoryResults(root: string = process.cwd()): Promise<Map<string, StoryResult>> {
  let names: string[];
  try {
    names = (await readdir(path.join(root, "data", "sample", "results"))).filter((name) => name.endsWith(".json")).sort();
  } catch {
    return new Map();
  }
  const results = new Map<string, StoryResult>();
  for (const name of names) {
    const result = JSON.parse(await readFile(path.join(root, "data", "sample", "results", name), "utf8")) as StoryResult;
    if (`${result.story}.json` !== name) throw new Error(`${name} must be named after its story ID`);
    results.set(result.story, result);
  }
  return results;
}
