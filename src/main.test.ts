import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error -- a plain .mjs script with no types
import { itxt, png, XMP } from "../scripts/examples.mjs";
import { INSTALL } from "./install.js";
import { HELP, main, PACKAGE_ROOT } from "./main.js";
import { pngChunk, pngWith, syntheticStore } from "./output/fixtures.js";

function run(argv: string[], extra: Partial<Parameters<typeof main>[1]> = {}) {
  let out = "";
  let err = "";
  const requests: { url: string; init?: RequestInit }[] = [];
  const deps = {
    stdout: (s: string) => (out += s),
    stderr: (s: string) => (err += s),
    now: () => new Date("2026-10-08T12:00:00Z"),
    cwd: PACKAGE_ROOT,
    fetch: async (url: string, init?: RequestInit) => {
      requests.push({ url, init });
      return new Response("nothing here", { status: 404 });
    },
    ...extra,
  };
  return main(argv, deps).then((code) => ({ code, out, err, requests }));
}

describe("the CLI", () => {
  it("--help names every command with the one install command", async () => {
    const r = await run(["--help"]);
    expect(r.code).toBe(0);
    expect(r.out).toBe(HELP);
    for (const c of ["site", "output", "report", "verify", "demo"])
      expect(HELP).toContain(`${INSTALL} ${c}`);
    expect(HELP).toMatch(/Not legal advice/);
  });

  it("an unknown command or a missing target is a usage error (exit 2) with a fix", async () => {
    expect((await run(["check"])).code).toBe(2);
    const r = await run(["site", "--json"]);
    expect(r.code).toBe(2);
    expect(JSON.parse(r.out).error).toMatchObject({ code: "BAD_ARGUMENTS", retryable: false });
  });

  it("a file that is not there: code, cause, fix, retryable", async () => {
    const r = await run(["output", "nope.png", "--json"]);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out).error).toEqual({
      code: "FILE_NOT_FOUND",
      cause: "no file at nope.png",
      fix: `pass a URL (https://…) or the path to a file, e.g. \`${INSTALL} output image.png\``,
      retryable: false,
    });
  });

  it("demo checks the synthetic page and images and makes no request", async () => {
    const r = await run(["demo", "--json"]);
    expect(r.code).toBe(0);
    expect(r.requests).toEqual([]);
    const [site, output] = r.out
      .trim()
      .split(/\n(?=\{)/)
      .map((s) => JSON.parse(s));
    expect(site.reports[0].disclosure.in_chat_interface).toBe(true);
    expect(
      output.reports.map(
        (o: { marking: { ai_declared_in: string[] } }) => o.marking.ai_declared_in.length,
      ),
    ).toEqual([0, 2]);
    expect(site.not_legal_advice).toMatch(/^A readiness check, not legal advice/);
  });

  it("--strict exits 3 when a file carries no signed metadata, 0 when it does", async () => {
    expect((await run(["output", "examples/unmarked.png", "--strict"])).code).toBe(3);
    expect((await run(["output", "examples/unmarked.png"])).code).toBe(0);
  });

  it("a URL is fetched once, with the tool's user agent, and its Link header is read", async () => {
    const marked = pngWith(pngChunk("caBX", syntheticStore()));
    const r = await run(["output", "https://cdn.example.com/a.png", "--json"], {
      fetch: async (url: string, init?: RequestInit) => {
        expect(new Headers(init?.headers).get("user-agent")).toMatch(
          /^agent-disclosure\/\d+\.\d+\.\d+ /,
        );
        return new Response(marked.slice().buffer, {
          headers: {
            "content-type": "image/png",
            link: '<https://cdn.example.com/a.c2pa>; rel="c2pa-manifest"',
          },
        });
      },
    });
    expect(r.code).toBe(0);
    const report = JSON.parse(r.out).reports[0];
    expect(report.target).toMatchObject({ source: "url", status: 200, content_type: "image/png" });
    expect(report.c2pa.found).toBe(true);
    expect(report.c2pa.references).toEqual([
      { location: "HTTP Link header", uri: "https://cdn.example.com/a.c2pa" },
    ]);
  });

  it("an HTTP error says so and that a retry may help when the server failed", async () => {
    const r = await run(["site", "https://example.com/", "--json"], {
      fetch: async () => new Response("down", { status: 503 }),
    });
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out).error).toMatchObject({ code: "HTTP_ERROR", retryable: true });
  });

  it("several targets: one report each, and a failure does not stop the rest", async () => {
    const r = await run(["output", "examples/unmarked.png", "missing.png", "--json"]);
    expect(r.code).toBe(1);
    const reports = JSON.parse(r.out).reports;
    expect(reports[0].format).toBe("png");
    expect(reports[1].error.code).toBe("FILE_NOT_FOUND");
  });
});

describe("the synthetic examples", () => {
  it("are what scripts/examples.mjs writes (`pnpm examples`)", () => {
    const here = (f: string) => readFileSync(new URL(`../examples/${f}`, import.meta.url));
    expect(Buffer.compare(here("unmarked.png"), png())).toBe(0);
    expect(Buffer.compare(here("iptc-only.png"), png([itxt("XML:com.adobe.xmp", XMP)]))).toBe(0);
  });
});
