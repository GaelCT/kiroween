import { describe, expect, it } from "vitest";
import { assertPublicUrl, FetchBlockedError, FetchFailedError, isPrivateAddress, safeFetchText } from "@/pipeline/safe-fetch";

const publicDns = async () => ["93.184.216.34"];

describe("isPrivateAddress", () => {
  it("flags loopback, private, link-local, and mapped addresses", () => {
    for (const address of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1"]) {
      expect(isPrivateAddress(address), address).toBe(true);
    }
  });

  it("allows public addresses", () => {
    for (const address of ["93.184.216.34", "8.8.8.8", "2606:4700::1111"]) expect(isPrivateAddress(address), address).toBe(false);
  });
});

describe("assertPublicUrl", () => {
  it("rejects other schemes, credentials, local names, and hosts that resolve privately", async () => {
    await expect(assertPublicUrl("file:///etc/passwd", publicDns)).rejects.toThrow(FetchBlockedError);
    await expect(assertPublicUrl("https://user:pw@news.example/", publicDns)).rejects.toThrow(FetchBlockedError);
    await expect(assertPublicUrl("http://localhost:3000/", publicDns)).rejects.toThrow(FetchBlockedError);
    await expect(assertPublicUrl("http://[::1]/", publicDns)).rejects.toThrow(FetchBlockedError);
    await expect(assertPublicUrl("http://sneaky.example/", async () => ["10.0.0.5"])).rejects.toThrow(FetchBlockedError);
  });

  it("accepts a public https URL", async () => {
    expect((await assertPublicUrl("https://news.example/feed.xml", publicDns)).host).toBe("news.example");
  });
});

describe("safeFetchText", () => {
  it("checks every redirect", async () => {
    const fetchImpl = (async (url: URL) =>
      url.host === "news.example"
        ? new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data" } })
        : new Response("secret")) as unknown as typeof fetch;
    await expect(safeFetchText("https://news.example/feed", { fetchImpl, resolve: publicDns })).rejects.toThrow(FetchBlockedError);
  });

  it("follows a public redirect and reports the final URL", async () => {
    const fetchImpl = (async (url: URL) =>
      url.pathname === "/old"
        ? new Response(null, { status: 301, headers: { location: "/new" } })
        : new Response("<rss/>", { headers: { "content-type": "application/rss+xml" } })) as unknown as typeof fetch;
    const result = await safeFetchText("https://news.example/old", { fetchImpl, resolve: publicDns });
    expect(result).toEqual({ url: "https://news.example/new", contentType: "application/rss+xml", text: "<rss/>" });
  });

  it("stops reading past the size cap", async () => {
    const fetchImpl = (async () => new Response("x".repeat(2000))) as unknown as typeof fetch;
    await expect(safeFetchText("https://news.example/big", { fetchImpl, resolve: publicDns, maxBytes: 1000 })).rejects.toThrow(
      FetchFailedError,
    );
  });

  it("reports HTTP errors", async () => {
    const fetchImpl = (async () => new Response("no", { status: 404 })) as unknown as typeof fetch;
    await expect(safeFetchText("https://news.example/missing", { fetchImpl, resolve: publicDns })).rejects.toThrow(/HTTP 404/);
  });
});
