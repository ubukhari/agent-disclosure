/**
 * The one GET a check makes of a URL it is given. Nothing else is fetched: not the page's scripts,
 * not a chat vendor's configuration, not a C2PA manifest a file only points to. A redirect is
 * followed (that is still the URL the user gave), the body is capped, and every failure is a
 * CliError with code, cause, fix and retryable.
 */
import { CliError } from "./errors.js";
import { REPO } from "./install.js";
import { version } from "./version.js";

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface Fetched {
  /** the URL as given */
  url: string;
  /** where the redirects ended */
  finalUrl: string;
  status: number;
  contentType: string;
  /** response headers the checks read (Link, for a C2PA manifest reference) */
  link: string | null;
  bytes: Uint8Array;
  /** true when the body was longer than the cap and was cut */
  truncated: boolean;
}

export const USER_AGENT = () =>
  `agent-disclosure/${version()} (+${REPO}; readiness check, one request)`;

export function parseHttpUrl(raw: string): URL | null {
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:" ? u : null;
  } catch {
    return null;
  }
}

export async function fetchOnce(
  raw: string,
  opts: { fetch?: FetchLike; maxBytes: number; timeoutMs?: number; accept?: string },
): Promise<Fetched> {
  const url = parseHttpUrl(raw);
  if (!url)
    throw new CliError({
      code: "BAD_URL",
      cause: `${raw} is not an http or https URL`,
      fix: "pass a full URL such as https://example.com/, or a path to a local file",
      retryable: false,
    });
  const doFetch = opts.fetch ?? fetch;
  let res: Response;
  try {
    res = await doFetch(url.href, {
      redirect: "follow",
      signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000),
      headers: {
        "user-agent": USER_AGENT(),
        accept: opts.accept ?? "*/*",
      },
    });
  } catch (e) {
    const timedOut = e instanceof Error && /abort|timeout/i.test(`${e.name} ${e.message}`);
    throw new CliError({
      code: timedOut ? "FETCH_TIMEOUT" : "FETCH_FAILED",
      cause: `${url.href} did not answer${timedOut ? " within 20 seconds" : ""}: ${e instanceof Error ? e.message : String(e)}`,
      fix: "check the URL opens in a browser from this machine; for a page behind a login, save it and pass the file instead",
      retryable: true,
    });
  }
  const reader = res.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let truncated = false;
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (size + value.length > opts.maxBytes) {
        chunks.push(value.subarray(0, opts.maxBytes - size));
        size = opts.maxBytes;
        truncated = true;
        await reader.cancel().catch(() => undefined);
        break;
      }
      chunks.push(value);
      size += value.length;
    }
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.length;
  }
  return {
    url: raw,
    finalUrl: res.url || url.href,
    status: res.status,
    contentType: (res.headers.get("content-type") ?? "").toLowerCase(),
    link: res.headers.get("link"),
    bytes,
    truncated,
  };
}
