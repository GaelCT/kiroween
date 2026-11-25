import { describe, expect, it } from "vitest";
import { addsFor, compareCluster } from "@/lib/adds";
import { applyDetached, pullOut, soloClusterId } from "@/lib/clusters";
import { EMPTY_READING_STATE, markRead, parseReadingState, toggleStar } from "@/lib/reading-store";
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
    const after = compareCluster(left, articles, ["a"]).find((entry) => entry.articleId === "c");
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
    expect(parseReadingState('{"history":["a","a",3,"b"],"detached":"x","starred":["s1"],"grouped":"yes"}')).toEqual({
      history: ["a", "b"],
      detached: [],
      starred: ["s1"],
      grouped: false,
      storyVisits: {},
    });
    expect(parseReadingState("not json")).toEqual(EMPTY_READING_STATE);
    expect(parseReadingState(null)).toEqual(EMPTY_READING_STATE);
  });

  it("appends new reads in order and keeps the first-read position", () => {
    const state = markRead({ ...EMPTY_READING_STATE, history: ["a"] }, ["b", "a", "b", "c"]);
    expect(state.history).toEqual(["a", "b", "c"]);
  });

  it("returns the same state when nothing is new", () => {
    const state = { ...EMPTY_READING_STATE, history: ["a"] };
    expect(markRead(state, ["a"])).toBe(state);
  });

  it("stars and unstars a story", () => {
    const starred = toggleStar(EMPTY_READING_STATE, "story-1");
    expect(starred.starred).toEqual(["story-1"]);
    expect(toggleStar(starred, "story-1").starred).toEqual([]);
  });
});
