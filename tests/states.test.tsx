// The comparison states from issue #19, rendered to HTML.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ArticleView } from "@/components/ArticleView";
import { SourcePanel } from "@/components/SourcePanel";
import { clusterState, compareCluster, isWorthReading } from "@/lib/adds";
import type { Cluster, ComparisonStatus, ReaderData } from "@/lib/types";
import { buildCluster, type ArticleSpec } from "./support/cluster";

function setup(specs: ArticleSpec[], comparison?: ComparisonStatus) {
  const built = buildCluster(specs);
  const cluster: Cluster = { ...built.cluster, ...(comparison ? { comparison } : {}) };
  const data: ReaderData = {
    sample: true,
    sources: specs.map((_, index) => ({
      id: `source-${index}`,
      name: `Outlet ${index}`,
      homepage: `https://source-${index}.example/`,
      feedUrl: `/feed-${index}.xml`,
    })),
    articles: built.articles,
    clusters: [cluster],
  };
  return { cluster, data };
}

function panel(specs: ArticleSpec[], history: string[], comparison?: ComparisonStatus): string {
  const { cluster, data } = setup(specs, comparison);
  return renderToStaticMarkup(
    <SourcePanel
      cluster={cluster}
      comparisons={compareCluster(cluster, data.articles, history)}
      data={data}
      currentArticleId={cluster.primaryArticleId}
      onOpen={() => {}}
      onPick={() => {}}
    />,
  );
}

const FOUR: ArticleSpec[] = [
  { id: "a", facts: ["f01"] },
  { id: "b", facts: ["f01", "f02"] },
  { id: "c", facts: ["f01"] },
  { id: "d", facts: [], limited: true },
];

describe("comparison states", () => {
  it("shows Comparing N sources… while the comparison runs, without + lines", () => {
    const html = panel(FOUR, ["a"], "pending");
    expect(html).toContain("Comparing 4 sources…");
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain("add-plus");
  });

  it("shows Comparison unavailable when the AI service fails", () => {
    const html = panel(FOUR, ["a"], "failed");
    expect(html).toContain("Comparison unavailable");
    expect(html).toContain("Not compared");
    expect(html).not.toContain("add-plus");
  });

  it("labels excerpt-only sources and sources that add nothing", () => {
    const html = panel(FOUR, ["a"]);
    expect(html).toContain("Limited source content");
    expect(html).toContain("No significant new information");
    expect(html).toContain("Fact f02");
  });

  it("says when only one source covered a story", () => {
    expect(panel([{ id: "a", facts: [] }], ["a"])).toContain("Only Outlet 0 covered this story.");
  });

  it("explains limited content in the article itself", () => {
    const { data } = setup(FOUR);
    const html = renderToStaticMarkup(
      <ArticleView article={data.articles.d} source={data.sources[3]} highlights={new Set()} scrollTarget={null} />,
    );
    expect(html).toContain("Outlet 3 only publishes a summary in its feed");
  });

  it("falls back to plain read and unread until a story is compared", () => {
    const { cluster, data } = setup(FOUR, "pending");
    expect(clusterState(cluster, data.articles, ["a"])).toBe("partly-read");
    expect(isWorthReading(cluster, data.articles, ["a"], "c")).toBe(true);
    expect(clusterState(cluster, data.articles, ["a", "b", "c", "d"])).toBe("read");
  });
});
