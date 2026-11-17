import { describe, expect, it } from "vitest";
import { articlesInView, formatCount, storiesInView, unreadCounts } from "@/lib/reader-view";
import { buildCluster } from "./support/cluster";

// Two stories: "one" has three sources (a, b, c), "two" has one (d).
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
// buildCluster gives each article its own source: source-0, source-1, ...

describe("views", () => {
  it("filters stories by feed and by star", () => {
    expect(storiesInView({ kind: "all" }, clusters, articles, []).map((c) => c.id)).toEqual(["one", "two"]);
    expect(storiesInView({ kind: "starred" }, clusters, articles, ["two"]).map((c) => c.id)).toEqual(["two"]);
    expect(storiesInView({ kind: "source", sourceId: "source-2" }, clusters, articles, []).map((c) => c.id)).toEqual(["one"]);
  });

  it("lists a feed's own articles when stories aren't grouped", () => {
    expect(articlesInView({ kind: "source", sourceId: "source-1" }, clusters, articles, [])).toEqual(["b"]);
    expect(articlesInView({ kind: "all" }, clusters, articles, [])).toHaveLength(4);
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
