import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import manifest from "@/app/manifest";

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

describe("installable app metadata", () => {
  it("provides a standalone manifest with regular and maskable icons", () => {
    const value = manifest();
    expect(value).toMatchObject({ id: "/", start_url: "/", scope: "/", display: "standalone" });
    expect(value.icons).toEqual(expect.arrayContaining([
      expect.objectContaining({ src: "/icons/icon-192.png", sizes: "192x192", purpose: "any" }),
      expect.objectContaining({ src: "/icons/icon-maskable-512.png", sizes: "512x512", purpose: "maskable" }),
    ]));
  });
});

describe("offline network safeguards", () => {
  it("does not call feed, article, grouping, comparison, or OPML endpoints", async () => {
    vi.stubGlobal("window", {
      localStorage: { getItem: () => null, setItem: () => {} },
    });
    vi.stubGlobal("navigator", { onLine: false });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const store = await import("@/lib/live-store");

    expect(await store.addFeed("https://example.com/feed.xml")).toEqual({ ok: false, message: "You're offline. Reconnect to add a feed." });
    expect(await store.addArticle("https://example.com/article")).toEqual({ ok: false, message: "You're offline. Reconnect to save a new URL." });
    expect(await store.refreshFeeds(false)).toBeNull();
    expect(await store.refreshFeeds(true)).toEqual({ ok: false, message: "You're offline. Reconnect to refresh feeds." });

    const text = vi.fn(async () => "<opml />");
    expect(await store.importOpmlFile({ size: 9, text } as unknown as File)).toEqual({
      ok: false,
      message: "You're offline. Reconnect to import subscriptions.",
    });
    expect(text).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(store.getLiveSnapshot().busy).toBe(false);
  });
});
