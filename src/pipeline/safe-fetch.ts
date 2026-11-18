// Fetches feeds and article pages from URLs that visitors type in. Server only.
// Visitors control the URL, so every request, including each redirect, must point at a public
// http(s) address, and responses are capped in time and size.

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export class FetchBlockedError extends Error {
  override name = "FetchBlockedError";
}

export class FetchFailedError extends Error {
  override name = "FetchFailedError";
}

export interface SafeFetchOptions {
  /** Defaults to 10 seconds. */
  timeoutMs?: number;
  /** Defaults to 3 MB. */
  maxBytes?: number;
  /** Sent as the Accept header. */
  accept?: string;
  /** For tests. */
  fetchImpl?: typeof fetch;
  /** For tests. Returns the IP addresses a host name resolves to. */
  resolve?: (host: string) => Promise<string[]>;
}

export interface FetchedText {
  /** The final URL, after redirects. */
  url: string;
  contentType: string;
  text: string;
}

const MAX_REDIRECTS = 5;
const USER_AGENT = "ReaderResurrection/0.1 (+https://github.com/GaelCT/kiroween)";

async function resolveHost(host: string): Promise<string[]> {
  const addresses = await lookup(host, { all: true, verbatim: true });
  return addresses.map((address) => address.address);
}

/** True for loopback, private, link-local, carrier-grade NAT, multicast, and reserved addresses. */
export function isPrivateAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    const [a, b] = address.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (version === 6) {
    const lower = address.toLowerCase();
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return (
      lower === "::" ||
      lower === "::1" ||
      lower.startsWith("fc") ||
      lower.startsWith("fd") ||
      lower.startsWith("fe8") ||
      lower.startsWith("fe9") ||
      lower.startsWith("fea") ||
      lower.startsWith("feb") ||
      lower.startsWith("ff")
    );
  }
  return true;
}

/** Throws FetchBlockedError unless the URL is http(s) on a host that resolves only to public addresses. */
export async function assertPublicUrl(raw: string, resolve: (host: string) => Promise<string[]> = resolveHost): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new FetchBlockedError("That isn't a valid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new FetchBlockedError("Only http and https URLs work.");
  if (url.username || url.password) throw new FetchBlockedError("URLs with a user name or password aren't allowed.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new FetchBlockedError("Only public addresses can be fetched.");
  }
  let addresses: string[];
  try {
    addresses = isIP(host) ? [host] : await resolve(host);
  } catch {
    throw new FetchFailedError(`Couldn't find ${host}.`);
  }
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
    throw new FetchBlockedError("Only public addresses can be fetched.");
  }
  return url;
}

/** GETs a public URL and returns its body as text. Follows up to five redirects, checking each one. */
export async function safeFetchText(raw: string, options: SafeFetchOptions = {}): Promise<FetchedText> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxBytes = options.maxBytes ?? 3_000_000;
  const signal = AbortSignal.timeout(options.timeoutMs ?? 10_000);

  let url = await assertPublicUrl(raw, options.resolve);
  for (let redirects = 0; ; redirects++) {
    let response: Response;
    try {
      response = await fetchImpl(url, {
        redirect: "manual",
        signal,
        headers: { "User-Agent": USER_AGENT, Accept: options.accept ?? "*/*" },
      });
    } catch (error) {
      const reason = (error as Error).name === "TimeoutError" ? "timed out" : "failed";
      throw new FetchFailedError(`The request to ${url.host} ${reason}.`);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location) throw new FetchFailedError(`${url.host} sent a redirect without a location.`);
      if (redirects >= MAX_REDIRECTS) throw new FetchFailedError(`${url.host} redirected too many times.`);
      url = await assertPublicUrl(new URL(location, url).toString(), options.resolve);
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new FetchFailedError(`${url.host} answered with HTTP ${response.status}.`);
    }

    const declared = Number(response.headers.get("content-length"));
    if (declared > maxBytes) {
      await response.body?.cancel();
      throw new FetchFailedError(`The response from ${url.host} is too large.`);
    }
    const text = await readCapped(response, maxBytes, url.host);
    return { url: url.toString(), contentType: response.headers.get("content-type") ?? "", text };
  }
}

async function readCapped(response: Response, maxBytes: number, host: string): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new FetchFailedError(`The response from ${host} is too large.`);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8").decode(bytes);
}
