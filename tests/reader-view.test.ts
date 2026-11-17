import { describe, expect, it } from "vitest";
import {
  articlesInView,
  formatCount,
  groupByFolder,
  storiesInView,
  unreadCounts,
  type ViewContext,
} from "@/lib/reader-view";
import type { Source } from "@/lib/types";
import { buildCluster } from "./support/cluster";

// Two stories: "one" has three sources (a, b, c), "two" has one (d).
// buildCluster gives each article its own source by position: source-0, source-1, ...
const one = buildCluster(
  [
    { id: "a", facts: ["f01", "f02"] },
    { id: "b", facts: ["f01"] },
    { id: "c", facts: ["f01", "f03"] },
  ],
  "one",
);
const two = buildCluster([{ id: "d", facts: [] }], "two");
const clusters = [one.cluster, two.cluster];
const articles = { ...one.articles, ...two.articles };
articles.c = { ...articles.c, title: "Benchmarks for the new card", paragraphs: ["It draws 320 W under load."] };

const source = (id: string, folder?: string): Source => ({
  id,
  name: id,
  homepage: `https://${id}.example/`,
  feedUrl: `/${id}.xml`,
  ...(folder ? { folder } : {}),
});
const sources = [source("source-0", "News"), source("source-1"), source("source-2", "Hardware"), source("source-3", "News")];
const context: ViewContext = { clusters, articles, sources, starred: [] };
const ids = (view: Parameters<typeof storiesInView>[0], starred: string[] = []) =>
  storiesInView(view, { ...context, starred }).map((cluster) => cluster.id);

describe("views", () => {
  it("filters stories by feed, folder, and star", () => {
    expect(ids({ kind: "all" })).toEqual(["one", "two"]);
    expect(ids({ kind: "starred" }, ["two"])).toEqual(["two"]);
    expect(ids({ kind: "source", sourceId: "source-2" })).toEqual(["one"]);
    expect(ids({ kind: "folder", folder: "Hardware" })).toEqual(["one"]);
    expect(ids({ kind: "folder", folder: "News" })).toEqual(["one", "two"]);
  });

  it("lists only a feed's or folder's own articles when stories aren't grouped", () => {
    expect(articlesInView({ kind: "source", sourceId: "source-1" }, context)).toEqual(["b"]);
    expect(articlesInView({ kind: "folder", folder: "Hardware" }, context)).toEqual(["c"]);
    expect(articlesInView({ kind: "all" }, context)).toHaveLength(4);
  });

  it("searches titles and text, requiring every term", () => {
    expect(ids({ kind: "search", query: "benchmarks" })).toEqual(["one"]);
    expect(ids({ kind: "search", query: "320 W under" })).toEqual(["one"]);
    expect(ids({ kind: "search", query: "320 W missing" })).toEqual([]);
    expect(articlesInView({ kind: "search", query: "BENCHMARKS" }, context)).toEqual(["c"]);
  });

  it("groups feeds by folder, with loose feeds last", () => {
    expect(groupByFolder(sources).map((group) => [group.folder, group.sources.map((member) => member.id)])).toEqual([
      ["News", ["source-0", "source-3"]],
      ["Hardware", ["source-2"]],
      [null, ["source-1"]],
    ]);
  });
});

describe("unread counts", () => {
  it("counts every article before grouping and every story after", () => {
    expect(unreadCounts(clusters, articles, [], false).all).toBe(4);
    expect(unreadCounts(clusters, articles, [], true).all).toBe(2);
  });

  it("drops sources that add nothing once a story is opened", () => {
    const counts = unreadCounts(clusters, articles, ["a"], true);
    expect(counts.all).toBe(2);
    expect(counts.bySource).toEqual({ "source-2": 1, "source-0": 1 });
  });

  it("counts a story as read once nothing new is left", () => {
    expect(unreadCounts(clusters, articles, ["a", "c"], true).all).toBe(1);
  });

  it("caps counts at 1000+ like Google Reader", () => {
    expect(formatCount(1000)).toBe("1000");
    expect(formatCount(1001)).toBe("1000+");
  });
});
