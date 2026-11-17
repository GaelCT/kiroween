// Publishes data/sample/stories as Atom feeds in public/sample-feeds. Run: npm run sample:build

import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildSampleFeeds, readSampleFiles, SAMPLE_FEEDS_DIR } from "../src/pipeline/sample";

async function main(): Promise<void> {
  const root = process.cwd();
  const files = await readSampleFiles(root);
  const feeds = buildSampleFeeds(files);
  const dir = path.join(root, SAMPLE_FEEDS_DIR);
  await mkdir(dir, { recursive: true });
  for (const name of await readdir(dir)) {
    if (name.endsWith(".xml") && !feeds.has(name)) await rm(path.join(dir, name));
  }
  for (const [name, xml] of feeds) await writeFile(path.join(dir, name), xml);
  const articles = files.stories.reduce((total, story) => total + Object.keys(story.articles).length, 0);
  console.log(`Wrote ${feeds.size} feeds with ${articles} articles in ${files.stories.length} stories to ${SAMPLE_FEEDS_DIR}/`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
