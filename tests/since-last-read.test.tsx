import { isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SinceLastRead } from "@/components/SinceLastRead";
import { parseReadingState, recordStoryVisit, type ReadingState, type StoryVisit } from "@/lib/reading-store";
import { changesSinceLastVisit } from "@/lib/story-changes";
import type { Cluster, ReaderData } from "@/lib/types";
import { buildCluster } from "./support/cluster";

const previous: StoryVisit = {
  visitedAt: "2026-11-20T15:30:00.000Z",
  facts: { f01: "Fact f01" },
};

function fixture() {
  const built = buildCluster([
    { id: "a", facts: ["f01"], publishedAt: "2026-11-18T09:00:00.000Z" },
    { id: "b", facts: ["f01", "f02", "f03"], publishedAt: "2026-11-26T09:00:00.000Z" },
  ]);
  const cluster: Cluster = {
    ...built.cluster,
    facts: {
      f01: { id: "f01", text: "Fact f01" },
      f02: { id: "f02", text: "The revised price is $399." },
      f03: { id: "f03", text: "The launch is confirmed for December 4." },
    },
  };
  const data: ReaderData = {
    sample: false,
    sources: [
      { id: "source-0", name: "Outlet A", homepage: "https://a.example/", feedUrl: "https://a.example/feed" },
      { id: "source-1", name: "Outlet B", homepage: "https://b.example/", feedUrl: "https://b.example/feed" },
    ],
    articles: built.articles,
    clusters: [cluster],
  };
  return { cluster, data };
}

function buttons(node: ReactNode): Array<{ props: { onClick?: () => void } }> {
  if (Array.isArray(node)) return node.flatMap(buttons);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  const own = node.type === "button" ? [node as { props: { onClick?: () => void } }] : [];
  return [...own, ...buttons(node.props.children)];
}

describe("what changed since the last read", () => {
  it("makes no update claim without a previous ready visit", () => {
    const { cluster, data } = fixture();
    expect(changesSinceLastVisit(cluster, data.articles, undefined)).toEqual([]);
  });

  it("reports an unchanged return and the previous visit time", () => {
    const { cluster, data } = fixture();
    const unchanged = { ...cluster, facts: { f01: cluster.facts.f01 } };
    const html = renderToStaticMarkup(<SinceLastRead cluster={unchanged} data={data} previous={previous} onPick={() => {}} />);
    expect(html).toContain("Since your last read");
    expect(html).toContain("Nov 20, 2026");
    expect(html).toContain("No new developments.");
    expect(html).not.toContain("revised price");
  });

  it("lists only new facts with source and article-date context", () => {
    const { cluster, data } = fixture();
    expect(changesSinceLastVisit(cluster, data.articles, previous)).toEqual([
      { factId: "f02", text: "The revised price is $399.", articleId: "b", publishedAt: "2026-11-26T09:00:00.000Z" },
      { factId: "f03", text: "The launch is confirmed for December 4.", articleId: "b", publishedAt: "2026-11-26T09:00:00.000Z" },
    ]);
    const html = renderToStaticMarkup(<SinceLastRead cluster={cluster} data={data} previous={previous} onPick={() => {}} />);
    expect(html).toContain("The revised price is $399.");
    expect(html).toContain("The launch is confirmed for December 4.");
    expect(html).toContain("Outlet B");
    expect(html).toContain("Article published Nov 26");
    expect(html).not.toContain("No new developments.");
  });

  it("does not treat repeated coverage from a newly added source as news", () => {
    const { cluster, data } = fixture();
    const repeated = {
      ...cluster,
      articleIds: ["a", "b"],
      facts: { f99: { id: "f99", text: "  FACT   f01 " } },
    };
    const repeatedData = {
      ...data,
      articles: {
        ...data.articles,
        b: { ...data.articles.b, evidence: [...data.articles.b.evidence, { factId: "f99", sentence: "Fact f01." }] },
      },
    };
    expect(changesSinceLastVisit(repeated, repeatedData.articles, previous)).toEqual([]);
  });

  it("opens the exact source and fact supporting a development", () => {
    const { cluster, data } = fixture();
    const onPick = vi.fn();
    const tree = SinceLastRead({ cluster, data, previous, onPick });
    const targets = buttons(tree);
    expect(targets).toHaveLength(2);
    targets[1].props.onClick?.();
    expect(onPick).toHaveBeenCalledWith("b", "f03");
  });
});

describe("story visit snapshots", () => {
  const { cluster } = fixture();
  const state: ReadingState = { history: [], detached: [], starred: [], grouped: true, storyVisits: {} };

  it("defaults legacy reading state to no visits", () => {
    expect(parseReadingState(JSON.stringify({ history: [], detached: [], starred: [], grouped: true }))).toEqual(state);
  });

  it("keeps valid stored visits while ignoring damaged entries", () => {
    const parsed = parseReadingState(JSON.stringify({
      ...state,
      storyVisits: { good: previous, bad: { visitedAt: "soon", facts: {} }, worse: null },
    }));
    expect(parsed.storyVisits).toEqual({ good: previous });
  });

  it("records ready facts and preserves the last good snapshot for pending or failed comparisons", () => {
    const visited = recordStoryVisit(state, cluster, new Date("2026-11-26T12:00:00.000Z"));
    expect(visited.storyVisits[cluster.id]).toEqual({
      visitedAt: "2026-11-26T12:00:00.000Z",
      facts: Object.fromEntries(Object.entries(cluster.facts).map(([id, fact]) => [id, fact.text])),
    });
    expect(recordStoryVisit(visited, { ...cluster, comparison: "pending" }, new Date("2026-11-27T12:00:00.000Z"))).toBe(visited);
    expect(recordStoryVisit(visited, { ...cluster, comparison: "failed" }, new Date("2026-11-27T12:00:00.000Z"))).toBe(visited);
  });
});
