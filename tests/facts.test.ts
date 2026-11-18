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

    // Four extractions and one matching call.
    expect(model.calls).toHaveLength(5);
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
