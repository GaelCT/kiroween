// Parses Atom and RSS 2.0 feeds. The same parser reads the sample feeds and real ones.

import { XMLParser } from "fast-xml-parser";
import { decodeEntities, escapeXml, normalizeWhitespace } from "./html";

/** "full" when the feed carried the article itself, "summary" when it only carried an excerpt. */
export type ContentKind = "full" | "summary";

export interface FeedEntry {
  id: string;
  title: string;
  url: string;
  author?: string;
  /** ISO 8601. Missing when the feed gives no usable date. */
  publishedAt?: string;
  html: string;
  contentKind: ContentKind;
}

export interface ParsedFeed {
  format: "atom" | "rss";
  title: string;
  homepage?: string;
  entries: FeedEntry[];
}

export class FeedParseError extends Error {
  override name = "FeedParseError";
}

type XmlNode = Record<string, unknown>;

const ARRAY_PATHS = new Set([
  "feed.entry",
  "feed.link",
  "feed.entry.link",
  "feed.entry.author",
  "rss.channel.item",
  "rss.channel.link",
]);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  processEntities: true,
  htmlEntities: false,
  jPath: true,
  isArray: (_name, jPath) => ARRAY_PATHS.has(String(jPath)),
});

export function parseFeed(xml: string): ParsedFeed {
  let doc: XmlNode;
  try {
    doc = asNode(parser.parse(xml));
  } catch (error) {
    throw new FeedParseError(`Not valid XML: ${(error as Error).message}`);
  }
  if (isNode(doc.feed)) return parseAtom(doc.feed);
  const rss = doc.rss;
  if (isNode(rss) && isNode(rss.channel)) return parseRss(rss.channel);
  throw new FeedParseError("Not an Atom or RSS 2.0 feed");
}

function parseAtom(feed: XmlNode): ParsedFeed {
  const entries = asList(feed.entry).filter(isNode).map((entry): FeedEntry => {
    const content = atomContentHtml(entry.content);
    const url = atomLink(entry.link) ?? "";
    return {
      id: textOf(entry.id) || url,
      title: plainTitle(textOf(entry.title)),
      url,
      author: firstAuthor(entry.author),
      publishedAt: toIso(textOf(entry.published) || textOf(entry.updated)),
      html: content || atomContentHtml(entry.summary),
      contentKind: content ? "full" : "summary",
    };
  });
  return { format: "atom", title: plainTitle(textOf(feed.title)), homepage: atomLink(feed.link), entries };
}

function parseRss(channel: XmlNode): ParsedFeed {
  const entries = asList(channel.item).filter(isNode).map((item): FeedEntry => {
    const encoded = textOf(item["content:encoded"]);
    const guid = textOf(item.guid);
    const link = textOf(item.link);
    return {
      id: guid || link,
      title: plainTitle(textOf(item.title)),
      url: link || (isPermalink(item.guid) ? guid : ""),
      author: textOf(item["dc:creator"]) || rssAuthor(textOf(item.author)) || undefined,
      publishedAt: toIso(textOf(item.pubDate) || textOf(item["dc:date"])),
      html: encoded || textOf(item.description),
      contentKind: encoded ? "full" : "summary",
    };
  });
  const homepage = asList(channel.link).map(textOf).find((value) => value.length > 0);
  return { format: "rss", title: plainTitle(textOf(channel.title)), homepage, entries };
}

/** Atom text constructs default to plain text. Only "html" content is HTML already. */
function atomContentHtml(node: unknown): string {
  const text = textOf(node);
  if (!text) return "";
  const type = isNode(node) ? textOf(node["@_type"]) : "";
  if (type === "html") return text;
  if (type === "xhtml") return "";
  return `<p>${escapeXml(text)}</p>`;
}

function atomLink(links: unknown): string | undefined {
  const all = asList(links).filter(isNode);
  const alternate = all.find((link) => !link["@_rel"] || link["@_rel"] === "alternate") ?? all[0];
  const href = alternate ? textOf(alternate["@_href"]) : "";
  return href || undefined;
}

function firstAuthor(authors: unknown): string | undefined {
  const first = asList(authors)[0];
  const name = isNode(first) ? textOf(first.name) : textOf(first);
  return name || undefined;
}

/** RSS 2.0 writes authors as "email (Name)". Readers show the name, and full-text cleanup matches bylines against it. */
function rssAuthor(value: string): string {
  return value.match(/^\S+@\S+\s*\((.+)\)$/)?.[1].trim() ?? value;
}

function isPermalink(guid: unknown): boolean {
  return !isNode(guid) || textOf(guid["@_isPermaLink"]) !== "false";
}

function plainTitle(raw: string): string {
  return normalizeWhitespace(decodeEntities(raw.replace(/<[^>]*>/g, "")));
}

function toIso(value: string): string | undefined {
  if (!value) return undefined;
  const time = Date.parse(value);
  return Number.isNaN(time) ? undefined : new Date(time).toISOString();
}

function textOf(node: unknown): string {
  if (node == null) return "";
  if (typeof node === "string") return node;
  if (typeof node === "number" || typeof node === "boolean") return String(node);
  if (Array.isArray(node)) return node.length > 0 ? textOf(node[0]) : "";
  if (isNode(node)) return textOf(node["#text"]);
  return "";
}

function asList(value: unknown): unknown[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function isNode(value: unknown): value is XmlNode {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asNode(value: unknown): XmlNode {
  return isNode(value) ? value : {};
}
