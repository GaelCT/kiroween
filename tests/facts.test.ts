import { describe, expect, it } from "vitest";
import type { ModelClient } from "@/pipeline/ai";
import { compareArticles, findVerbatim, parseExtraction, parseMatching, supportsNumbers, type ArticleText } from "@/pipeline/facts";
import { loadSampleData, readSampleFiles } from "@/pipeline/sample";
import { runStory } from "@/pipeline/sample-pipeline";
import { answerKeyModel } from "./support/answer-key-model";

const root = process.cwd();
const paragraphs = ["Corvid announced the RV-90 on Monday. It costs $899.", "Its maker calls it “the fastest card we’ve built.”"];

describe("findVerbatim", () => {
  it("finds an exact sentence and where it is", () => {
    expect(findVerbatim("It costs $899.", paragraphs)).toEqual({ sentence: "It costs $899.", paragraph: 0, offset: 38 });
  });

  it("accepts straight quotes for curly ones and returns the article's own text", () => {
    const located = findVerbatim('Its maker calls it "the fastest card we\'ve built."', paragraphs);
    expect(located?.sentence).toBe("Its maker calls it “the fastest card we’ve built.”");
  });

  it("rejects paraphrases and fragments", () => {
    expect(findVerbatim("It costs $999.", paragraphs)).toBeNull();
    expect(findVerbatim("It costs", paragraphs)).toBeNull();
  });
});

describe("parseExtraction", () => {
  it("keeps facts with verbatim sentences and drops the rest", () => {
    const reply = {
      facts: [
        { fact: "Costs $899.", sentence: "It costs $899." },
        { fact: "Costs $999", sentence: "It costs $999." },
        { fact: "Priced at $899", sentence: "It costs $899." },
      ],
    };
    const extraction = parseExtraction(reply, paragraphs);
    expect(extraction.facts).toEqual([{ text: "Costs $899", sentence: "It costs $899." }]);
    expect(extraction.dropped.map((fact) => fact.text)).toEqual(["Costs $999", "Priced at $899"]);
  });

  it("rejects a reply without a facts list", () => {
    expect(() => parseExtraction({ nope: [] }, paragraphs)).toThrow(/facts/);
  });
});

describe("parseMatching", () => {
  const statements = [0, 0, 1, 1, 2].map((articleIndex) => ({ articleIndex, fact: { text: "", sentence: "" } }));

  it("partitions the statements, splitting same-article pairs and adding missing ones", () => {
    expect(parseMatching({ groups: [[0, 2, 1], [3, 3, 99], ["x"]] }, statements)).toEqual([[1], [0, 2], [3], [4]]);
  });
});

describe("checking restatements against the primary article", () => {
  // Invented articles. Matching misses that B's first sentence restates A's first sentence, the
  // way a real model did on Nov 19.
  const a: ArticleText = {
    id: "a",
    title: "Velmont agrees to buy Quillfern",
    paragraphs: ["Velmont has agreed to acquire Quillfern, the companies said on Tuesday.", "The deal values Quillfern at $2 billion."],
  };
  const b: ArticleText = {
    id: "b",
    title: "Velmont is buying Quillfern",
    paragraphs: ["Velmont is buying the note-taking app Quillfern.", "Quillfern has 4 million users."],
  };
  const leadOfA = { fact: "Velmont agreed to acquire Quillfern", sentence: a.paragraphs[0] };
  const valueOfA = { fact: "The deal values Quillfern at $2 billion", sentence: a.paragraphs[1] };
  const factsOfB = [
    { fact: "Velmont is buying Quillfern", sentence: b.paragraphs[0] },
    { fact: "Quillfern has 4 million users", sentence: b.paragraphs[1] },
  ];

  /** A model whose check says B's "is buying" statement repeats `answer`, a sentence of A or not. */
  function scripted(factsOfA: { fact: string; sentence: string }[], answer: string): ModelClient & { calls: string[]; asked: string[] } {
    const calls: string[] = [];
    const asked: string[] = [];
    return {
      name: "test/scripted",
      calls,
      asked,
      async completeJson(request) {
        calls.push(request.listKey ?? "");
        if (request.listKey === "facts") return { facts: request.user.startsWith(`Title: ${a.title}`) ? factsOfA : factsOfB };
        if (request.listKey === "groups") {
          const count = [...request.user.matchAll(/^\d+\. \[Article/gm)].length;
          return { groups: Array.from({ length: count }, (_, index) => [index]) };
        }
        asked.push(request.user);
        const candidates = [...request.user.matchAll(/^C(\d+)\. (.*)$/gm)];
        return {
          repeats: candidates.map((line) => ({ candidate: Number(line[1]), sentence: line[2].includes("is buying") ? answer : null })),
        };
      },
    };
  }

  it("gives a restatement the primary's fact ID, so it isn't shown as new", async () => {
    const model = scripted([leadOfA, valueOfA], a.paragraphs[0]);
    const result = await compareArticles(model, [a, b]);
    expect(model.calls).toEqual(["facts", "facts", "groups", "repeats"]);
    // The check reads the primary article itself, not only the facts extracted from it.
    expect(model.asked[0]).toContain(a.paragraphs[1]);
    expect(result.evidence.b[0].factId).toBe(result.evidence.a[0].factId);
    expect(result.evidence.b[1].factId).not.toBe(result.evidence.a[1].factId);
    expect(Object.keys(result.facts)).toHaveLength(3);
  });

  it("adds the primary's sentence as a fact when extraction missed it", async () => {
    // Extraction skipped the primary's lead, as it did for two starter-pack stories on Nov 19.
    const model = scripted([valueOfA], a.paragraphs[0]);
    const result = await compareArticles(model, [a, b]);
    expect(result.evidence.a.map((item) => item.sentence)).toEqual(a.paragraphs);
    expect(result.evidence.b[0].factId).toBe(result.evidence.a[0].factId);
  });

  it("ignores an answer that isn't a sentence of the primary article", async () => {
    const model = scripted([valueOfA], "Velmont is acquiring Quillfern, the companies said.");
    const result = await compareArticles(model, [a, b]);
    expect(result.evidence.a).toHaveLength(1);
    expect(Object.values(result.evidence.a).map((item) => item.factId)).not.toContain(result.evidence.b[0].factId);
  });
});

describe("lines that claim more than their sentence", () => {
  // Invented articles. Matching put B's and C's prices together, so C's line would have shown
  // B's wording, "$280 for a set", which C's sentence never says. That happened on Nov 23.
  const a: ArticleText = { id: "a", title: "Harrow unveils the Glint tracker", paragraphs: ["Harrow has unveiled the Glint, a tracker with a small screen."] };
  const b: ArticleText = { id: "b", title: "Harrow's Glint tracker goes on sale", paragraphs: ["The Glint costs $35 on its own or $280 for a set of nine."] };
  const c: ArticleText = { id: "c", title: "Hands-on with the Glint 2 tracker", paragraphs: ["You can order one tracker for $35, and the whole set is also available."] };

  function grouping(groups: (count: number) => number[][]): ModelClient {
    return {
      name: "test/grouping",
      async completeJson(request) {
        if (request.listKey === "facts") {
          const article = [a, b, c].find((candidate) => request.user.startsWith(`Title: ${candidate.title}`))!;
          const text = article === a ? "Harrow unveiled the Glint" : article === b ? "Costs $35, or $280 for a set of nine" : "Costs $35 for one tracker";
          return { facts: [{ fact: text, sentence: article.paragraphs[0] }] };
        }
        if (request.listKey === "groups") return { groups: groups([...request.user.matchAll(/^\d+\. \[Article/gm)].length) };
        return { repeats: [...request.user.matchAll(/^C(\d+)\. /gm)].map((line) => ({ candidate: Number(line[1]), sentence: null })) };
      },
    };
  }

  it("splits off a statement whose sentence lacks a number in the line it would show", async () => {
    const result = await compareArticles(grouping(() => [[0], [1, 2]]), [a, b, c]);
    expect(result.evidence.c[0].factId).not.toBe(result.evidence.b[0].factId);
    expect(result.facts[result.evidence.c[0].factId].text).toBe("Costs $35 for one tracker");
  });

  it("keeps a statement whose sentence has the numbers, in words or in its article's title", () => {
    expect(supportsNumbers("Returned 2 weeks later", "Two weeks later, she was back.", "")).toBe(true);
    expect(supportsNumbers("Glint 2 costs $35", "It costs $35.", c.title)).toBe(true);
    expect(supportsNumbers("Costs $35, or $280 for a set of nine", "You can order one tracker for $35.", c.title)).toBe(false);
    expect(supportsNumbers("Raised $1,500 at 04:10", "It raised $1500 at 4:10.", "")).toBe(true);
  });
});

describe("compareArticles", () => {
  it("skips the AI for a story with one source", async () => {
    const model: ModelClient = { name: "none", completeJson: () => Promise.reject(new Error("called")) };
    const article: ArticleText = { id: "a", title: "T", paragraphs };
    expect(await compareArticles(model, [article])).toEqual({ facts: {}, evidence: { a: [] }, dropped: { a: [] } });
  });

  it("reproduces the RV-90 fact table when the model answers perfectly", async () => {
    const files = await readSampleFiles(root);
    const data = await loadSampleData(root, { useResults: false });
    const story = files.stories.find((candidate) => candidate.id === "corvid-rv90")!;
    const model = answerKeyModel(files.stories);
    const result = await runStory(model, story, data);

    // Four extractions, one matching call, and one check against the primary.
    expect(model.calls).toHaveLength(6);
    expect(Object.keys(result.facts)).toHaveLength(Object.keys(story.facts).length);
    // Fact IDs follow reading order, so compare each sentence's fact wording instead of IDs.
    for (const [outlet, evidence] of Object.entries(result.articles)) {
      const expected = data.articles[`urn:reader-sample:${outlet}:corvid-rv90`].evidence;
      expect(evidence.map((item) => [item.sentence, result.facts[item.factId]]), outlet).toEqual(
        expected.map((item) => [item.sentence, story.facts[item.factId]]),
      );
    }
  });
});
