// Writes Atom feeds. Used to publish the sample stories as feeds.

import { escapeXml } from "./html";

export interface AtomEntryInput {
  id: string;
  title: string;
  url: string;
  author?: string;
  /** ISO 8601. */
  publishedAt: string;
  /** Plain-text paragraphs. */
  paragraphs: string[];
  /** Publish only a summary, like feeds that send excerpts. */
  excerptOnly?: boolean;
}

export interface AtomFeedInput {
  id: string;
  title: string;
  subtitle?: string;
  homepage: string;
  entries: AtomEntryInput[];
}

/** Builds an Atom feed with entries newest first. The output only depends on the input. */
export function buildAtomFeed(feed: AtomFeedInput): string {
  const entries = [...feed.entries].sort(
    (a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.id.localeCompare(b.id),
  );
  const lines = [
    `<?xml version="1.0" encoding="utf-8"?>`,
    `<feed xmlns="http://www.w3.org/2005/Atom">`,
    `  <id>${escapeXml(feed.id)}</id>`,
    `  <title>${escapeXml(feed.title)}</title>`,
    ...(feed.subtitle ? [`  <subtitle>${escapeXml(feed.subtitle)}</subtitle>`] : []),
    `  <link rel="alternate" href="${escapeXml(feed.homepage)}"/>`,
    `  <updated>${escapeXml(entries[0]?.publishedAt ?? "1970-01-01T00:00:00Z")}</updated>`,
    ...entries.flatMap(entryLines),
    `</feed>`,
  ];
  return `${lines.join("\n")}\n`;
}

function entryLines(entry: AtomEntryInput): string[] {
  const html = entry.paragraphs.map((paragraph) => `<p>${escapeXml(paragraph)}</p>`).join("");
  return [
    `  <entry>`,
    `    <id>${escapeXml(entry.id)}</id>`,
    `    <title>${escapeXml(entry.title)}</title>`,
    `    <link rel="alternate" href="${escapeXml(entry.url)}"/>`,
    ...(entry.author ? [`    <author><name>${escapeXml(entry.author)}</name></author>`] : []),
    `    <published>${escapeXml(entry.publishedAt)}</published>`,
    `    <updated>${escapeXml(entry.publishedAt)}</updated>`,
    entry.excerptOnly
      ? `    <summary type="text">${escapeXml(entry.paragraphs.join(" "))}</summary>`
      : `    <content type="html"><![CDATA[${html.replaceAll("]]>", "]]]]><![CDATA[>")}]]></content>`,
    `  </entry>`,
  ];
}
