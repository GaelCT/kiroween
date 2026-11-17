// Turns feed HTML into plain-text paragraphs, and escapes text for XML and HTML.
// This is enough for feed content. Full-page extraction for excerpt-only feeds is issue #12.

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00a0",
  ndash: "\u2013",
  mdash: "\u2014",
  hellip: "\u2026",
  lsquo: "\u2018",
  rsquo: "\u2019",
  ldquo: "\u201c",
  rdquo: "\u201d",
  deg: "\u00b0",
  times: "\u00d7",
  copy: "\u00a9",
  reg: "\u00ae",
  trade: "\u2122",
  euro: "\u20ac",
  pound: "\u00a3",
  middot: "\u00b7",
  bull: "\u2022",
};

/** Decodes numeric character references and common named entities. Unknown entities are kept as written. */
export function decodeEntities(text: string): string {
  return text.replace(/&(#[xX][0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, code: string) => {
    if (code.startsWith("#")) {
      const hex = code[1] === "x" || code[1] === "X";
      const point = parseInt(code.slice(hex ? 2 : 1), hex ? 16 : 10);
      const valid = point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff);
      return valid ? String.fromCodePoint(point) : match;
    }
    return NAMED_ENTITIES[code] ?? match;
  });
}

/** Collapses runs of whitespace, including non-breaking spaces, into single spaces. */
export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

const HIDDEN_ELEMENTS = /<(script|style|noscript|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const BLOCK_BOUNDARY =
  /<\/?(?:p|div|br|hr|h[1-6]|li|ul|ol|dl|dt|dd|blockquote|pre|section|article|aside|header|footer|figure|figcaption|table|thead|tbody|tr|td|th)\b[^>]*>/gi;

/** Splits HTML into plain-text paragraphs at block-level tags. */
export function htmlToParagraphs(html: string): string[] {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(HIDDEN_ELEMENTS, " ")
    .split(BLOCK_BOUNDARY)
    .map((block) => normalizeWhitespace(decodeEntities(block.replace(/<[^>]*>/g, ""))))
    .filter((block) => block.length > 0);
}

/** Escapes text for use in XML or HTML text and attribute values. */
export function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
