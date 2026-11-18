// Loads the sample data. The story files are published as Atom feeds (npm run sample:build).
// The loader reads those feeds with the same parser as real feeds, then attaches facts: the
// saved AI pipeline results in data/sample/results/ when a story has them (npm run
// pipeline:sample), and otherwise the hand-written facts from the story file.

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { Article, Cluster, Fact, ReaderData, Source } from "@/lib/types";
import { buildAtomFeed } from "./atom";
import { parseFeed, type FeedEntry } from "./feeds";
import { htmlToParagraphs } from "./html";
import {
  parseMarkedParagraph,
  SampleDataError,
  validateSample,
  type SampleSourceFile,
  type StoryFile,
} from "./sample-format";
import { readStoryResults, RESULTS_DIR, type StoryResult } from "./sample-results";

export const SAMPLE_DIR = "data/sample";
export const SAMPLE_FEEDS_DIR = "public/sample-feeds";

export interface SampleFiles {
  sources: SampleSourceFile[];
  stories: StoryFile[];
}

export function sampleArticleId(sourceId: string, storyId: string): string {
  return `urn:reader-sample:${sourceId}:${storyId}`;
}

export function sampleFeedFile(sourceId: string): string {
  return `${sourceId}.xml`;
}

export async function readSampleFiles(root: string): Promise<SampleFiles> {
  const dir = path.join(root, SAMPLE_DIR);
  const sources = JSON.parse(await readFile(path.join(dir, "sources.json"), "utf8")) as SampleSourceFile[];
  const names = (await readdir(path.join(dir, "stories"))).filter((name) => name.endsWith(".json")).sort();
  const stories = await Promise.all(
    names.map(async (name) => {
      const story = JSON.parse(await readFile(path.join(dir, "stories", name), "utf8")) as StoryFile;
      if (`${story.id}.json` !== name) throw new SampleDataError(`${name} must be named after its story ID`);
      return story;
    }),
  );
  validateSample(sources, stories);
  return { sources, stories };
}

/** Publishes the stories as one Atom feed per outlet. Returns file name to XML. */
export function buildSampleFeeds({ sources, stories }: SampleFiles): Map<string, string> {
  const feeds = new Map<string, string>();
  for (const source of sources) {
    const entries = stories.flatMap((story) => {
      const article = story.articles[source.id];
      if (!article) return [];
      const month = article.publishedAt.slice(0, 7).replace("-", "/");
      return [
        {
          id: sampleArticleId(source.id, story.id),
          title: article.title,
          url: `${source.homepage}${month}/${story.id}`,
          author: article.author,
          publishedAt: article.publishedAt,
          paragraphs: article.body.map((paragraph) => parseMarkedParagraph(paragraph).text),
          excerptOnly: source.excerptOnly,
        },
      ];
    });
    feeds.set(
      sampleFeedFile(source.id),
      buildAtomFeed({
        id: `urn:reader-sample:${source.id}`,
        title: source.name,
        subtitle: `Sample data: a fictional outlet (${source.description ?? "news"}).`,
        homepage: source.homepage,
        entries,
      }),
    );
  }
  return feeds;
}

/**
 * Builds the reader's data from the story files and the published feeds (source ID to XML).
 * Stories with an entry in `results` use the pipeline's facts instead of the story file's.
 */
export function assembleSampleData(
  { sources, stories }: SampleFiles,
  feedXml: Map<string, string>,
  results: ReadonlyMap<string, StoryResult> = new Map(),
): ReaderData {
  const entries = new Map<string, FeedEntry>();
  for (const source of sources) {
    const xml = feedXml.get(source.id);
    if (xml === undefined) throw new SampleDataError(`Missing feed for ${source.id}: run npm run sample:build`);
    for (const entry of parseFeed(xml).entries) entries.set(entry.id, entry);
  }

  const articles: Record<string, Article> = {};
  const clusters: Cluster[] = [];
  let fromPipeline = 0;
  for (const story of stories) {
    const result = results.get(story.id);
    if (result) fromPipeline++;
    for (const [sourceId, file] of Object.entries(story.articles)) {
      const id = sampleArticleId(sourceId, story.id);
      const entry = entries.get(id);
      if (!entry) throw new SampleDataError(`${id} isn't in the ${sourceId} feed: run npm run sample:build`);
      const paragraphs = htmlToParagraphs(entry.html);
      const evidence = result
        ? (result.articles[sourceId] ?? [])
        : file.body.flatMap((paragraph) => parseMarkedParagraph(paragraph).evidence);
      for (const { factId, sentence } of evidence) {
        if (!paragraphs.some((paragraph) => paragraph.includes(sentence))) {
          const fix = result ? "rerun npm run pipeline:sample for this story" : "fix the story file";
          throw new SampleDataError(`${id}: the sentence for ${factId} isn't in the parsed article (${fix}): "${sentence}"`);
        }
      }
      articles[id] = {
        id,
        sourceId,
        title: entry.title,
        url: entry.url,
        ...(entry.author ? { author: entry.author } : {}),
        publishedAt: entry.publishedAt ?? new Date(file.publishedAt).toISOString(),
        paragraphs,
        evidence,
        ...(entry.contentKind === "summary" ? { limited: true } : {}),
      };
    }

    const primaryArticleId = sampleArticleId(story.primary, story.id);
    const others = Object.keys(story.articles)
      .map((sourceId) => sampleArticleId(sourceId, story.id))
      .filter((id) => id !== primaryArticleId)
      .sort((a, b) => articles[a].publishedAt.localeCompare(articles[b].publishedAt) || a.localeCompare(b));
    const facts: Record<string, Fact> = {};
    for (const [factId, text] of Object.entries(result?.facts ?? story.facts)) facts[factId] = { id: factId, text };
    clusters.push({ id: story.id, title: story.title, primaryArticleId, articleIds: [primaryArticleId, ...others], facts });
  }

  const newest = (cluster: Cluster) =>
    cluster.articleIds.reduce((latest, id) => (articles[id].publishedAt > latest ? articles[id].publishedAt : latest), "");
  clusters.sort((a, b) => newest(b).localeCompare(newest(a)) || a.id.localeCompare(b.id));

  const readerSources: Source[] = sources.map((source) => ({
    id: source.id,
    name: source.name,
    homepage: source.homepage,
    feedUrl: `/sample-feeds/${sampleFeedFile(source.id)}`,
    ...(source.description ? { description: source.description } : {}),
    ...(source.folder ? { folder: source.folder } : {}),
  }));

  const sampleFacts = fromPipeline === 0 ? "fact-tables" : fromPipeline === stories.length ? "pipeline" : "mixed";
  return { sample: true, sampleFacts, sources: readerSources, articles, clusters };
}

export interface LoadOptions {
  /** Use saved pipeline results where they exist. Defaults to true. */
  useResults?: boolean;
}

export async function loadSampleData(root: string = process.cwd(), options: LoadOptions = {}): Promise<ReaderData> {
  const files = await readSampleFiles(root);
  const feedXml = new Map<string, string>();
  for (const source of files.sources) {
    const file = path.join(root, SAMPLE_FEEDS_DIR, sampleFeedFile(source.id));
    feedXml.set(source.id, await readFile(file, "utf8"));
  }
  const results = options.useResults === false ? new Map() : await readStoryResults(path.join(root, RESULTS_DIR));
  for (const storyId of results.keys()) {
    if (!files.stories.some((story) => story.id === storyId)) {
      throw new SampleDataError(`${RESULTS_DIR}/${storyId}.json has no story file`);
    }
  }
  return assembleSampleData(files, feedXml, results);
}
