// OPML import (issue #32). Pure functions, browser-safe.
// Reads the subscription list another feed reader exported. Its folders become Reader folders.
// The file never leaves the browser: only the feed URLs go to the server, through
// POST /api/feeds, the same as a URL typed into "Add a subscription".

import { XMLParser } from "fast-xml-parser";

export interface OpmlFeed {
  url: string;
  /** The name in the file, for messages. Once fetched, a feed is named after its own title. */
  title: string;
  folder?: string;
}

export class OpmlParseError extends Error {
  override name = "OpmlParseError";
}

/** A list of 1,000 feeds is about 200 KB, so a file far bigger than that isn't a subscription list. */
export const MAX_OPML_BYTES = 2_000_000;

/** The longest URL /api/feeds accepts. */
const MAX_URL_LENGTH = 2048;

type XmlNode = Record<string, unknown>;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  parseAttributeValue: false,
  processEntities: true,
  // Readers write names with character references such as &#8217;, which this decodes.
  htmlEntities: true,
  isArray: (name) => name === "outline",
});

/**
 * The feeds in an OPML file, in file order, each listed once. An outline with an xmlUrl is a
 * feed, and one without is a folder. Reader has one level of folders, so a feed in a folder
 * inside a folder goes in the outer one. Throws OpmlParseError when the file isn't OPML.
 */
export function parseOpml(xml: string): OpmlFeed[] {
  let doc: unknown;
  try {
    doc = parser.parse(xml);
  } catch {
    throw new OpmlParseError("That file isn't valid XML.");
  }
  const opml = isNode(doc) ? doc.opml : undefined;
  if (opml === undefined) throw new OpmlParseError("That file isn't an OPML subscription list.");

  const feeds: OpmlFeed[] = [];
  const seen = new Set<string>();
  const visit = (outlines: unknown, folder: string | undefined): void => {
    for (const outline of Array.isArray(outlines) ? outlines : []) {
      if (!isNode(outline)) continue;
      const name = attribute(outline, "text") || attribute(outline, "title");
      const xmlUrl = attribute(outline, "xmlUrl");
      if (!xmlUrl) {
        visit(outline.outline, folder ?? (name || undefined));
        continue;
      }
      const url = webUrl(xmlUrl);
      // Google Reader exported a feed with two labels once per folder; the first one wins.
      if (!url || seen.has(url)) continue;
      seen.add(url);
      feeds.push({ url, title: name || url, ...(folder ? { folder } : {}) });
    }
  };
  visit(isNode(opml) && isNode(opml.body) ? opml.body.outline : undefined, undefined);
  return feeds;
}

/** An attribute's value with whitespace collapsed. Exporters disagree on case, such as xmlUrl and xmlurl. */
function attribute(node: XmlNode, name: string): string {
  const key = `@_${name}`.toLowerCase();
  for (const [candidate, value] of Object.entries(node)) {
    if (candidate.toLowerCase() === key && typeof value === "string") return value.replace(/\s+/g, " ").trim();
  }
  return "";
}

/** The URL if it's an http or https address /api/feeds would take, otherwise null. */
function webUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  return url.href.length <= MAX_URL_LENGTH ? url.href : null;
}

function isNode(value: unknown): value is XmlNode {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
