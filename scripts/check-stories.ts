// Checks story files without writing anything:
//   npm run sample:check -- data/sample/stories/one.json data/sample/stories/two.json
// With no arguments it checks every story. Prints what each source adds once the story is opened.

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { compareCluster, factIdsOf } from "../src/lib/adds";
import { formatPercent } from "../src/lib/format";
import { assembleSampleData, buildSampleFeeds, SAMPLE_DIR, sampleFeedFile } from "../src/pipeline/sample";
import { validateSample, type SampleSourceFile, type StoryFile } from "../src/pipeline/sample-format";

/** The four RV-90 articles open the demo, so every other article must be older. */
const DEMO_STORY = "corvid-rv90";
const OLDER_THAN = "2026-11-16T14:00:00Z";

async function main(): Promise<void> {
  const root = process.cwd();
  const sources = JSON.parse(await readFile(path.join(root, SAMPLE_DIR, "sources.json"), "utf8")) as SampleSourceFile[];
  const storyDir = path.join(root, SAMPLE_DIR, "stories");
  const args = process.argv.slice(2);
  const files =
    args.length > 0
      ? args
      : (await readdir(storyDir)).filter((name) => name.endsWith(".json")).map((name) => path.join(storyDir, name));

  const problems: string[] = [];
  const stories: StoryFile[] = [];
  for (const file of files) {
    try {
      const story = JSON.parse(await readFile(file, "utf8")) as StoryFile;
      if (`${story.id}.json` !== path.basename(file)) problems.push(`${file}: the file must be named ${story.id}.json`);
      for (const [outlet, article] of Object.entries(story.articles ?? {})) {
        if (story.id !== DEMO_STORY && !(Date.parse(article.publishedAt) < Date.parse(OLDER_THAN))) {
          problems.push(`${story.id}, ${outlet}: publishedAt must be before ${OLDER_THAN}`);
        }
      }
      stories.push(story);
    } catch (error) {
      problems.push(`${file}: ${(error as Error).message}`);
    }
  }
  if (problems.length > 0) throw new Error(`Problems:\n- ${problems.join("\n- ")}`);

  validateSample(sources, stories);
  const feeds = buildSampleFeeds({ sources, stories });
  const xml = new Map(sources.map((source) => [source.id, feeds.get(sampleFeedFile(source.id)) ?? ""]));
  const data = assembleSampleData({ sources, stories }, xml);
  const name = (articleId: string) => data.articles[articleId].sourceId;

  for (const cluster of data.clusters) {
    const opened = compareCluster(cluster, data.articles, [cluster.primaryArticleId]).slice(1).map((entry) => {
      const label = entry.status === "adds" ? `+${entry.adds.length}` : entry.status;
      const seen = entry.duplicateScore === null ? "" : ` (${formatPercent(entry.duplicateScore)} seen)`;
      return `${name(entry.articleId)} ${label}${seen}`;
    });
    const covered = cluster.articleIds.slice(1).filter((id) => {
      const others = new Set(cluster.articleIds.filter((other) => other !== id).flatMap((other) => factIdsOf(data.articles[other])));
      const facts = factIdsOf(data.articles[id]);
      return facts.length > 0 && facts.every((fact) => others.has(fact));
    });
    console.log(
      `${cluster.id}: ${cluster.articleIds.length} articles, ${Object.keys(cluster.facts).length} facts, opens on ${name(cluster.primaryArticleId)}` +
        (opened.length > 0 ? `\n  after opening: ${opened.join(" | ")}` : "") +
        (covered.length > 0 ? `\n  adds nothing once the others are read: ${covered.map(name).join(", ")}` : ""),
    );
  }
  console.log(`OK: ${stories.length} stories, ${Object.keys(data.articles).length} articles`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
