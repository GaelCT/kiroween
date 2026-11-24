import { describe, expect, it } from "vitest";
import type { ModelClient } from "@/pipeline/ai";
import { compareArticles, findVerbatim, parseExtraction, parseMatching, type ArticleText } from "@/pipeline/facts";
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
  // Invented articles. Matching misses that B's first sentence restates A's first fact, the way
  // a real model did on Nov 19.
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
  const facts: Record<string, { fact: string; sentence: string }[]> = {
    [a.title]: [
      { fact: "Velmont agreed to acquire Quillfern", sentence: a.paragraphs[0] },
      { fact: "The deal values Quillfern at $2 billion", sentence: a.paragraphs[1] },
    ],
    [b.title]: [
      { fact: "Velmont is buying Quillfern", sentence: b.paragraphs[0] },
      { fact: "Quillfern has 4 million users", sentence: b.paragraphs[1] },
    ],
  };

  function scripted(): ModelClient & { calls: string[] } {
    const calls: string[] = [];
    return {
      name: "test/scripted",
      calls,
      async completeJson(request) {
        calls.push(request.listKey ?? "");
        if (request.listKey === "facts") return { facts: facts[request.user.match(/^Title: (.*)$/m)![1]] };
        if (request.listKey === "groups") return { groups: [[0], [1], [2], [3]] };
        // The check against the primary: the candidate that says "is buying" repeats the primary's "agreed to acquire".
        const primary = [...request.user.matchAll(/^P(\d+)\. (.*)$/gm)];
        const candidates = [...request.user.matchAll(/^C(\d+)\. (.*)$/gm)];
        const target = primary.find((line) => line[2].includes("agreed to acquire"))!;
        return {
          repeats: candidates.map((line) => ({
            candidate: Number(line[1]),
            primary: line[2].includes("is buying") ? Number(target[1]) : null,
          })),
        };
      },
    };
  }

  it("gives a restatement the primary's fact ID, so it isn't shown as new", async () => {
    const model = scripted();
    const result = await compareArticles(model, [a, b]);
    expect(model.calls).toEqual(["facts", "facts", "groups", "repeats"]);
    expect(result.evidence.b[0].factId).toBe(result.evidence.a[0].factId);
    expect(result.evidence.b[1].factId).not.toBe(result.evidence.a[1].factId);
    expect(Object.keys(result.facts)).toHaveLength(3);
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
