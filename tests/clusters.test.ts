import { describe, expect, it } from "vitest";
import { addsFor, compareCluster } from "@/lib/adds";
import { applyDetached, pullOut, soloClusterId } from "@/lib/clusters";
import { markRead, parseReadingState } from "@/lib/reading-store";
import { buildCluster } from "./support/cluster";

const { cluster, articles } = buildCluster([
  { id: "a", facts: ["f01", "f02"] },
  { id: "b", facts: ["f01", "f03"] },
  { id: "c", facts: ["f04"] },
]);

describe("pullOut (X)", () => {
  it("moves the article into its own cluster right after the one it left", () => {
    const [left, solo] = pullOut([cluster], articles, "c");
    expect(left.articleIds).toEqual(["a", "b"]);
    expect(Object.keys(left.facts).sort()).toEqual(["f01", "f02", "f03"]);
    expect(solo).toMatchObject({ id: soloClusterId("c"), primaryArticleId: "c", articleIds: ["c"] });
    expect(Object.keys(solo.facts)).toEqual(["f04"]);
  });

  it("makes the earliest remaining article the primary when the primary is pulled out", () => {
    const [left] = pullOut([cluster], articles, "a");
    expect(left.primaryArticleId).toBe("b");
    expect(left.articleIds).toEqual(["b", "c"]);
    expect(addsFor(left, articles, ["b"], "c")).toEqual(["f04"]);
  });

  it("recomputes what the remaining sources add", () => {
    const before = compareCluster(cluster, articles, ["a"]).find((entry) => entry.articleId === "b");
    const [left] = pullOut([cluster], articles, "a");
    const after = compareCluster(left, articles, ["a", "b"]).find((entry) => entry.articleId === "c");
    expect(before?.adds).toEqual(["f03"]);
    expect(after?.adds).toEqual(["f04"]);
  });

  it("leaves one-article clusters and unknown articles alone", () => {
    const solo = pullOut([cluster], articles, "c");
    expect(pullOut(solo, articles, "c")).toEqual(solo);
    expect(pullOut([cluster], articles, "missing")).toEqual([cluster]);
  });

  it("replays every X in order", () => {
    expect(applyDetached([cluster], articles, ["c", "b"]).map((each) => each.articleIds)).toEqual([["a"], ["b"], ["c"]]);
  });
});

describe("reading state", () => {
  it("parses stored state and drops bad values", () => {
    expect(parseReadingState('{"history":["a","a",3,"b"],"detached":"x"}')).toEqual({ history: ["a", "b"], detached: [] });
    expect(parseReadingState("not json")).toEqual({ history: [], detached: [] });
    expect(parseReadingState(null)).toEqual({ history: [], detached: [] });
  });

  it("appends new reads in order and keeps the first-read position", () => {
    const state = markRead({ history: ["a"], detached: [] }, ["b", "a", "b", "c"]);
    expect(state.history).toEqual(["a", "b", "c"]);
  });

  it("returns the same state when nothing is new", () => {
    const state = { history: ["a"], detached: [] };
    expect(markRead(state, ["a"])).toBe(state);
  });
});
