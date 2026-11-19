import { describe, expect, it } from "vitest";
import { OpmlParseError, parseOpml } from "@/lib/opml";

// Every feed address here is invented for the tests.
const exported = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="1.0">
  <head><title>Subscriptions exported from another reader</title></head>
  <body>
    <outline text="Hardware" title="Hardware">
      <outline text="FrameTime" title="FrameTime" type="rss" xmlUrl="https://frametime.example/feed.xml" htmlUrl="https://frametime.example/"/>
      <outline text="Ohm &amp; Bit" title="Ohm &amp; Bit" type="rss" xmlUrl="https://ohmandbit.example/feed.xml" htmlUrl="https://ohmandbit.example/"/>
    </outline>
    <outline text="News" title="News">
      <outline text="Byteward" type="rss" xmlUrl="https://byteward.example/feed.xml"/>
      <outline text="FrameTime" type="rss" xmlUrl="https://frametime.example/feed.xml"/>
    </outline>
    <outline text="Launch Desk" type="rss" xmlUrl="https://launchdesk.example/feed.xml"/>
  </body>
</opml>`;

describe("parseOpml", () => {
  it("reads feeds in file order, with their folders", () => {
    expect(parseOpml(exported)).toEqual([
      { url: "https://frametime.example/feed.xml", title: "FrameTime", folder: "Hardware" },
      { url: "https://ohmandbit.example/feed.xml", title: "Ohm & Bit", folder: "Hardware" },
      { url: "https://byteward.example/feed.xml", title: "Byteward", folder: "News" },
      { url: "https://launchdesk.example/feed.xml", title: "Launch Desk" },
    ]);
  });

  it("puts a feed from a folder inside a folder in the outer one", () => {
    const xml = `<opml version="2.0"><body>
      <outline text="Tech"><outline text="Chips"><outline text="Chip news" xmlUrl="https://chips.example/rss"/></outline></outline>
    </body></opml>`;
    expect(parseOpml(xml)).toEqual([{ url: "https://chips.example/rss", title: "Chip news", folder: "Tech" }]);
  });

  it("accepts other exporters' spellings, and cleans up names and addresses", () => {
    const xml = `<opml version="2.0"><body>
      <outline title="Only a title" xmlurl="HTTPS://Caps.Example/Feed"/>
      <outline text="  Wren&#8217;s   notes " XMLURL=" https://wren.example/feed "/>
      <outline xmlUrl="https://untitled.example/feed"/>
      <outline text="Again" xmlUrl="https://CAPS.example/Feed"/>
    </body></opml>`;
    expect(parseOpml(xml)).toEqual([
      { url: "https://caps.example/Feed", title: "Only a title" },
      { url: "https://wren.example/feed", title: "Wren’s notes" },
      { url: "https://untitled.example/feed", title: "https://untitled.example/feed" },
    ]);
  });

  it("skips outlines that aren't web feeds", () => {
    const xml = `<opml version="2.0"><body>
      <outline text="An empty folder"/>
      <outline text="Mail" xmlUrl="mailto:someone@mail.example"/>
      <outline text="Script" xmlUrl="javascript:alert(1)"/>
      <outline text="Relative" xmlUrl="/feed.xml"/>
      <outline text="A link" type="link" url="https://link.example/"/>
      <outline text="Kept" xmlUrl="http://kept.example/rss"/>
    </body></opml>`;
    expect(parseOpml(xml)).toEqual([{ url: "http://kept.example/rss", title: "Kept" }]);
  });

  it("finds no feeds in an empty list", () => {
    expect(parseOpml(`<opml version="2.0"><head/><body/></opml>`)).toEqual([]);
  });

  it("rejects files that aren't OPML", () => {
    for (const text of ["", "just some text", "<html><body><p>Hi</p></body></html>", `<rss version="2.0"><channel><title>A feed</title></channel></rss>`]) {
      expect(() => parseOpml(text), text).toThrow(OpmlParseError);
    }
  });
});
