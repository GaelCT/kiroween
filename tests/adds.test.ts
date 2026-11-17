import { beforeAll, describe, expect, it } from "vitest";
import {
  addsFor,
  clusterState,
  compareCluster,
  duplicateScore,
  highlightsFor,
  isWorthReading,
  type ArticleMap,
} from "@/lib/adds";
import type { Cluster } from "@/lib/types";
import { loadSampleData } from "@/pipeline/sample";
import { buildCluster } from "./support/cluster";

// The worked example in .kiro/specs/comparison-pipeline/design.md, on the real sample data.
const id = (outlet: string) => `urn:reader-sample:${outlet}:corvid-rv90`;
const BYTEWARD = id("byteward");
const LAUNCH_DESK = id("launch-desk");
const FRAMETIME = id("frametime");
const OHM_AND_BIT = id("ohm-and-bit");

describe("the RV-90 worked example", () => {
  let cluster: Cluster;
  let articles: ArticleMap;

  beforeAll(async () => {
    const data = await loadSampleData();
    cluster = data.clusters.find((candidate) => candidate.id === "corvid-rv90")!;
    articles = data.articles;
  });

  it("shows what each source adds after the story opens on Byteward", () => {
    const history = [BYTEWARD];
    expect(compareCluster(cluster, articles, history)).toEqual([
      { articleId: BYTEWARD, status: "primary", adds: [], duplicateScore: 1 },
      { articleId: LAUNCH_DESK, status: "adds", adds: ["f06", "f07"], duplicateScore: 4 / 6 },
      { articleId: FRAMETIME, status: "adds", adds: ["f08", "f09", "f10"], duplicateScore: 2 / 5 },
      {
        articleId: OHM_AND_BIT,
        status: "adds",
        adds: ["f06", "f07", "f08", "f10", "f11", "f12", "f13"],
        duplicateScore: 3 / 10,
      },
    ]);
    expect(clusterState(cluster, articles, history)).toBe("partly-read");
  });

  it("treats the primary as seen even before the story is opened", () => {
    expect(addsFor(cluster, articles, [], FRAMETIME)).toEqual(["f08", "f09", "f10"]);
    expect(clusterState(cluster, articles, [])).toBe("unread");
  });

  it("shrinks the other lists after reading FrameTime", () => {
    const history = [BYTEWARD, FRAMETIME];
    expect(addsFor(cluster, articles, history, LAUNCH_DESK)).toEqual(["f06", "f07"]);
    expect(addsFor(cluster, articles, history, OHM_AND_BIT)).toEqual(["f06", "f07", "f11", "f12", "f13"]);
    expect(addsFor(cluster, articles, history, FRAMETIME)).toEqual([]);
    expect(duplicateScore(cluster, articles, history, OHM_AND_BIT)).toBe(5 / 10);
  });

  it("shows a shared fact under both unread sources until one is read", () => {
    const history = [BYTEWARD];
    expect(addsFor(cluster, articles, history, FRAMETIME)).toContain("f08");
    expect(addsFor(cluster, articles, history, OHM_AND_BIT)).toContain("f08");
  });

  it("marks Launch Desk as adding nothing once FrameTime and Ohm & Bit are read", () => {
    const history = [BYTEWARD, FRAMETIME, OHM_AND_BIT];
    const launchDesk = compareCluster(cluster, articles, history)[1];
    expect(launchDesk).toEqual({ articleId: LAUNCH_DESK, status: "nothing-new", adds: [], duplicateScore: 1 });
    expect(clusterState(cluster, articles, history)).toBe("read");
    expect(isWorthReading(cluster, articles, history, LAUNCH_DESK)).toBe(false);
  });

  it("highlights the facts that were new when each article was first opened", () => {
    const history = [BYTEWARD, FRAMETIME, OHM_AND_BIT];
    expect(highlightsFor(cluster, articles, history, BYTEWARD)).toEqual([]);
    expect(highlightsFor(cluster, articles, history, FRAMETIME)).toEqual(["f08", "f09", "f10"]);
    expect(highlightsFor(cluster, articles, history, OHM_AND_BIT)).toEqual(["f06", "f07", "f11", "f12", "f13"]);
    expect(highlightsFor(cluster, articles, [...history, LAUNCH_DESK], FRAMETIME)).toEqual(["f08", "f09", "f10"]);
  });
});

describe("edge cases", () => {
  it("shows a source without facts as limited, with no duplicate score", () => {
    const { cluster, articles } = buildCluster([
      { id: "a", facts: ["f01"] },
      { id: "b", facts: [], limited: true },
    ]);
    expect(compareCluster(cluster, articles, ["a"])[1]).toEqual({
      articleId: "b",
      status: "limited",
      adds: [],
      duplicateScore: null,
    });
    expect(clusterState(cluster, articles, ["a"])).toBe("read");
  });

  it("ignores reads from other clusters", () => {
    const { cluster, articles } = buildCluster([
      { id: "a", facts: ["f01"] },
      { id: "b", facts: ["f01", "f02"] },
    ]);
    expect(addsFor(cluster, articles, ["elsewhere", "a"], "b")).toEqual(["f02"]);
    expect(clusterState(cluster, articles, ["elsewhere"])).toBe("unread");
  });

  it("counts every unread article as worth reading until the cluster is opened", () => {
    const { cluster, articles } = buildCluster([
      { id: "a", facts: ["f01", "f02"] },
      { id: "b", facts: ["f01"] },
    ]);
    expect(isWorthReading(cluster, articles, [], "b")).toBe(true);
    expect(isWorthReading(cluster, articles, ["a"], "b")).toBe(false);
  });

  it("rejects articles outside the cluster", () => {
    const { cluster, articles } = buildCluster([{ id: "a", facts: [] }]);
    expect(() => addsFor(cluster, articles, [], "missing")).toThrow(/isn't in cluster/);
  });
});
