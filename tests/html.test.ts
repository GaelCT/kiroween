import { describe, expect, it } from "vitest";
import { decodeEntities, escapeXml, htmlToParagraphs } from "@/pipeline/html";

describe("decodeEntities", () => {
  it("decodes named and numeric entities", () => {
    expect(decodeEntities("Ohm &amp; Bit&#8217;s &#x2014; 84&deg;C")).toBe("Ohm & Bit\u2019s \u2014 84\u00b0C");
  });

  it("keeps unknown and invalid entities as written", () => {
    expect(decodeEntities("&bogus; &#0; &#xD800;")).toBe("&bogus; &#0; &#xD800;");
  });
});

describe("htmlToParagraphs", () => {
  it("splits at block tags and strips inline tags", () => {
    const html = "<p>First <b>bold</b> line.</p><p>Second<br>third</p><ul><li>Fourth</li></ul>";
    expect(htmlToParagraphs(html)).toEqual(["First bold line.", "Second", "third", "Fourth"]);
  });

  it("drops scripts, styles, and comments", () => {
    const html = "<p>Keep</p><script>alert(1)</script><style>p{}</style><!-- note --><p>this</p>";
    expect(htmlToParagraphs(html)).toEqual(["Keep", "this"]);
  });

  it("collapses whitespace, including non-breaking spaces", () => {
    expect(htmlToParagraphs("<p>  A&nbsp;&nbsp;B \n C </p>")).toEqual(["A B C"]);
  });
});

describe("escapeXml", () => {
  it("round-trips through htmlToParagraphs", () => {
    const text = 'Ohm & Bit said "<great>" things.';
    expect(htmlToParagraphs(`<p>${escapeXml(text)}</p>`)).toEqual([text]);
  });
});
