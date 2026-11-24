// The Day-3 test (issue #13): runs real feeds through the whole pipeline, locally:
//   npm run pipeline:try -- <feed URL> <feed URL> ...
//   npm run pipeline:try -- --stories 3 <feed URLs>    how many stories to compare (default 3)
// It fetches the feeds, gets full text, clusters stories, and compares the three stories with the
// most sources. It writes a checklist to .cache/day3/ (gitignored) so you can mark each "+" line
// right or wrong by hand. A line is right if its sentence says it and the primary article doesn't.
// The checklist includes the primary article's text as the pipeline read it.
// Real article text stays in .cache/: never copy it into the repo.

import "./env";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { addsFor } from "../src/lib/adds";
import type { Article, Source } from "../src/lib/types";
import { modelFromEnv, withDiskCache } from "../src/pipeline/ai";
import { clusterLive, compareLiveCluster, fetchLiveFeed } from "../src/pipeline/live";

const OUT_DIR = ".cache/day3";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const storiesFlag = args.indexOf("--stories");
  const storyCount = storiesFlag === -1 ? 3 : Number(args[storiesFlag + 1]);
  const urls = args.filter((arg, index) => !arg.startsWith("--") && index !== storiesFlag + 1);
  if (urls.length < 2) throw new Error("Give at least two feed URLs: npm run pipeline:try -- <feed URL> <feed URL> ...");
  const model = withDiskCache(modelFromEnv(), ".cache/ai");

  const sources: Source[] = [];
  const articles: Article[] = [];
  for (const url of urls) {
    try {
      const feed = await fetchLiveFeed(url);
      const limited = feed.articles.filter((article) => article.limited).length;
      console.log(`${feed.source.name}: ${feed.articles.length} articles${limited ? `, ${limited} limited to the excerpt` : ""}`);
      sources.push(feed.source);
      articles.push(...feed.articles);
    } catch (error) {
      console.error(`${url}: ${(error as Error).message}`);
    }
  }

  const byId = new Map(articles.map((article) => [article.id, article]));
  const name = (article: Article) => sources.find((source) => source.id === article.sourceId)?.name ?? article.sourceId;
  const stories = clusterLive(articles)
    .filter((cluster) => cluster.comparison === "pending")
    .sort((a, b) => b.articleIds.length - a.articleIds.length)
    .slice(0, storyCount);
  if (stories.length === 0) {
    console.log("No story was covered by two or more full articles. Try feeds that cover the same beat, on a busy news day.");
    return;
  }

  const report: string[] = [
    "# Day-3 test",
    "",
    `Run ${new Date().toISOString()} with ${model.name}.`,
    "Mark each line [x] if its sentence says it and the primary article doesn't. Then count: the bar is 8 of every 10.",
    "",
  ];
  let lines = 0;
  for (const story of stories) {
    const members = story.articleIds.map((id) => byId.get(id)!);
    console.log(`\nComparing "${story.title}" (${members.length} sources)...`);
    const comparison = await compareLiveCluster(model, members);
    const withEvidence: Record<string, Article> = Object.fromEntries(
      members.map((article) => [article.id, { ...article, evidence: comparison.evidence[article.id] ?? [] }]),
    );
    const cluster = { ...story, facts: comparison.facts, comparison: "ready" as const };
    const primary = withEvidence[story.primaryArticleId];
    report.push(`## ${story.title}`, "", `Primary: ${name(primary)}, ${primary.url}`, "");
    // The text the pipeline compared, so each line can be checked against it even if the page changes.
    report.push(
      "<details><summary>Primary article, as the pipeline read it</summary>",
      "",
      ...primary.paragraphs.flatMap((paragraph) => [`> ${paragraph}`, ">"]),
      "",
      "</details>",
      "",
    );
    for (const id of story.articleIds.slice(1)) {
      const article = withEvidence[id];
      if (article.limited) {
        report.push(`### ${name(article)}: limited source content`, "");
        continue;
      }
      const adds = addsFor(cluster, withEvidence, [story.primaryArticleId], id);
      report.push(`### ${name(article)} (${adds.length} new), ${article.url}`, "");
      for (const factId of adds) {
        const sentence = article.evidence.find((item) => item.factId === factId)!.sentence;
        report.push(`- [ ] + ${comparison.facts[factId].text}`, `      "${sentence}"`);
        lines++;
      }
      report.push("");
    }
  }

  await mkdir(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, `report-${new Date().toISOString().replace(/[:.]/g, "-")}.md`);
  await writeFile(file, `${report.join("\n")}\n`);
  console.log(`\n${lines} "+" lines to check. Open ${file} and mark each one.`);
  console.log("Post only the score in issue #13, not the article text.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
