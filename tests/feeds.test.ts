import { describe, expect, it } from "vitest";
import { buildAtomFeed } from "@/pipeline/atom";
import { FeedParseError, parseFeed } from "@/pipeline/feeds";

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title type="html">Byte &amp;amp; Ward</title>
  <link rel="self" href="https://byteward.example/feed.xml"/>
  <link rel="alternate" href="https://byteward.example/"/>
  <entry>
    <id>urn:test:1</id>
    <title>2026</title>
    <link rel="alternate" href="https://byteward.example/one"/>
    <author><name>Dana Whitlock</name></author>
    <published>2026-11-16T14:05:00Z</published>
    <content type="html"><![CDATA[<p>Full &amp; complete.</p>]]></content>
    <summary>Short</summary>
  </entry>
  <entry>
    <id>urn:test:2</id>
    <title>Excerpt only</title>
    <link href="https://byteward.example/two"/>
    <updated>2026-11-15T09:00:00+01:00</updated>
    <summary>Just a &lt;summary&gt;.</summary>
  </entry>
</feed>`;

const RSS = `<?xml version="1.0"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>Launch Desk</title>
    <link>https://launchdesk.example/</link>
    <item>
      <title>Full item</title>
      <link>https://launchdesk.example/full</link>
      <guid isPermaLink="false">tag:launchdesk,1</guid>
      <pubDate>Mon, 16 Nov 2026 14:20:00 GMT</pubDate>
      <dc:creator>Theo Marsh</dc:creator>
      <description>Teaser</description>
      <content:encoded><![CDATA[<p>The whole story.</p>]]></content:encoded>
    </item>
    <item>
      <title>Teaser item</title>
      <link>https://launchdesk.example/teaser</link>
      <description>&lt;p&gt;Only a teaser.&lt;/p&gt;</description>
    </item>
  </channel>
</rss>`;

describe("parseFeed", () => {
  it("reads Atom entries, preferring full content over the summary", () => {
    const feed = parseFeed(ATOM);
    expect(feed.format).toBe("atom");
    expect(feed.title).toBe("Byte & Ward");
    expect(feed.homepage).toBe("https://byteward.example/");
    expect(feed.entries[0]).toEqual({
      id: "urn:test:1",
      title: "2026",
      url: "https://byteward.example/one",
      author: "Dana Whitlock",
      publishedAt: "2026-11-16T14:05:00.000Z",
      html: "<p>Full &amp; complete.</p>",
      contentKind: "full",
    });
  });

  it("treats an Atom entry without content as a summary", () => {
    const entry = parseFeed(ATOM).entries[1];
    expect(entry.contentKind).toBe("summary");
    expect(entry.html).toBe("<p>Just a &lt;summary&gt;.</p>");
    expect(entry.publishedAt).toBe("2026-11-15T08:00:00.000Z");
    expect(entry.author).toBeUndefined();
  });

  it("reads RSS 2.0 items, preferring content:encoded over the description", () => {
    const [full, teaser] = parseFeed(RSS).entries;
    expect(full).toMatchObject({
      id: "tag:launchdesk,1",
      url: "https://launchdesk.example/full",
      author: "Theo Marsh",
      publishedAt: "2026-11-16T14:20:00.000Z",
      html: "<p>The whole story.</p>",
      contentKind: "full",
    });
    expect(teaser).toMatchObject({
      id: "https://launchdesk.example/teaser",
      html: "<p>Only a teaser.</p>",
      contentKind: "summary",
    });
  });

  it("shows the name from an RSS author written as an email address with a name", () => {
    const item = (author: string) =>
      `<rss version="2.0"><channel><title>T</title><item><title>A</title><link>https://launchdesk.example/a</link><author>${author}</author></item></channel></rss>`;
    expect(parseFeed(item("desk@launchdesk.example (Theo Marsh)")).entries[0].author).toBe("Theo Marsh");
    expect(parseFeed(item("Theo Marsh")).entries[0].author).toBe("Theo Marsh");
    expect(parseFeed(item("desk@launchdesk.example")).entries[0].author).toBe("desk@launchdesk.example");
  });

  it("rejects documents that aren't feeds", () => {
    expect(() => parseFeed("<html><body>Hi</body></html>")).toThrow(FeedParseError);
  });

  it("reads what buildAtomFeed writes", () => {
    const xml = buildAtomFeed({
      id: "urn:test",
      title: "Ohm & Bit",
      homepage: "https://ohmandbit.example/",
      entries: [
        { id: "urn:test:a", title: "Old", url: "https://ohmandbit.example/a", publishedAt: "2026-11-01T00:00:00Z", paragraphs: ["A ]]> B"] },
        { id: "urn:test:b", title: "New", url: "https://ohmandbit.example/b", publishedAt: "2026-11-02T00:00:00Z", paragraphs: ["One.", "Two."], excerptOnly: true },
      ],
    });
    const feed = parseFeed(xml);
    expect(feed.title).toBe("Ohm & Bit");
    expect(feed.entries.map((entry) => [entry.title, entry.contentKind])).toEqual([
      ["New", "summary"],
      ["Old", "full"],
    ]);
    expect(feed.entries[1].html).toBe("<p>A ]]&gt; B</p>");
  });
});
