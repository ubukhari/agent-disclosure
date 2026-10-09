/**
 * Reading what a check is given: a URL is fetched once (fetch.ts), anything else is a local file
 * read on this machine. Shared by the checks and the paid report.
 */
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { CliError } from "./errors.js";
import { fetchOnce, parseHttpUrl, type FetchLike } from "./fetch.js";
import { INSTALL } from "./install.js";
import { checkOutput, type OutputReport } from "./output/check.js";
import { checkSite, type SiteReport } from "./site-report.js";

export interface Deps {
  stdout: (s: string) => void;
  stderr: (s: string) => void;
  fetch?: FetchLike;
  now?: () => Date;
  cwd?: string;
  /** where `report` keeps the targets of a check you have not paid for yet */
  cacheDir?: string;
}

/** The cap on what one check reads: a page, or an artefact. */
export const MAX_PAGE_BYTES = 5 * 1024 * 1024;
export const MAX_FILE_BYTES = 100 * 1024 * 1024;

/** Read a target: a URL is fetched once, anything else is a local file. */
export async function readTarget(
  target: string,
  deps: Deps,
  cwd: string,
  kind: "page" | "artefact",
): Promise<{
  source: "url" | "file";
  name: string;
  bytes: Uint8Array;
  finalUrl?: string;
  status?: number;
  contentType?: string;
  truncated?: boolean;
  link?: string | null;
}> {
  if (parseHttpUrl(target)) {
    const f = await fetchOnce(target, {
      fetch: deps.fetch,
      maxBytes: kind === "page" ? MAX_PAGE_BYTES : MAX_FILE_BYTES,
      accept: kind === "page" ? "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5" : "*/*",
    });
    if (f.status >= 400)
      throw new CliError({
        code: "HTTP_ERROR",
        cause: `${target} answered ${f.status}`,
        fix: "check the URL in a browser; for a page behind a login, save it and pass the file instead",
        retryable: f.status >= 500 || f.status === 429,
      });
    return {
      source: "url",
      name: target,
      bytes: f.bytes,
      finalUrl: f.finalUrl,
      status: f.status,
      contentType: f.contentType,
      truncated: f.truncated,
      link: f.link,
    };
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(target))
    throw new CliError({
      code: "BAD_URL",
      cause: `${target} is not an http or https URL`,
      fix: "pass an http(s) URL or a local file path",
      retryable: false,
    });
  const file = path.resolve(cwd, target);
  let info;
  try {
    info = await stat(file);
  } catch {
    throw new CliError({
      code: "FILE_NOT_FOUND",
      cause: `no file at ${target}`,
      fix: `pass a URL (https://…) or the path to a file, e.g. \`${INSTALL} ${kind === "page" ? "site page.html" : "output image.png"}\``,
      retryable: false,
    });
  }
  if (!info.isFile())
    throw new CliError({
      code: "NOT_A_FILE",
      cause: `${target} is a directory`,
      fix: "pass one file at a time, or several as separate arguments",
      retryable: false,
    });
  if (info.size > MAX_FILE_BYTES)
    throw new CliError({
      code: "FILE_TOO_LARGE",
      cause: `${target} is ${Math.round(info.size / 1048576)} MB; this check reads up to 100 MB`,
      fix: "check a shorter export of the same output",
      retryable: false,
    });
  return { source: "file", name: target, bytes: new Uint8Array(await readFile(file)) };
}

function decodeHtml(bytes: Uint8Array, contentType = ""): string {
  const charset = /charset=([\w-]+)/i.exec(contentType)?.[1]?.toLowerCase();
  try {
    return new TextDecoder(charset && charset !== "utf8" ? charset : "utf-8").decode(bytes);
  } catch {
    return new TextDecoder().decode(bytes);
  }
}

export async function siteReport(target: string, deps: Deps, cwd: string): Promise<SiteReport> {
  const t = await readTarget(target, deps, cwd, "page");
  return checkSite({ ...t, html: decodeHtml(t.bytes, t.contentType), bytes: t.bytes.length });
}

export async function outputReport(target: string, deps: Deps, cwd: string): Promise<OutputReport> {
  const t = await readTarget(target, deps, cwd, "artefact");
  return checkOutput(t);
}
