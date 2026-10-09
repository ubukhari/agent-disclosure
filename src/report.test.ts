import { createPrivateKey, createPublicKey, sign } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { main } from "./main.js";
import {
  canonical,
  commitment,
  keyUrl,
  readToken,
  signUrl,
  signatureValid,
  type Signature,
} from "./report.js";

/**
 * The signing endpoint, faked: okgate's /api/ai-disclosure/sign derives an Ed25519 key from its
 * secret and signs the canonical statement. The same seed and statement give the same signature
 * there (apps/agentguard-app/src/lib/disclosure/report.test.ts holds the same vector).
 */
const SEED = Buffer.alloc(32, 7);
const PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");
const privateKey = createPrivateKey({
  key: Buffer.concat([PKCS8_PREFIX, SEED]),
  format: "der",
  type: "pkcs8",
});
const publicRaw = (createPublicKey(privateKey).export({ format: "jwk" }) as { x: string }).x;

export const VECTOR = {
  statement: {
    v: 1 as const,
    type: "agent-disclosure-report" as const,
    sha256: "a".repeat(64),
    commit: "b".repeat(64),
    sites: 1,
    outputs: 2,
    signed_at: "2026-10-08T12:00:00.000Z",
    purchase: "0123456789abcdef",
    key_id: "ed25519-test",
  },
};

describe("the signature format shared with okgate", () => {
  it("canonical JSON sorts keys and drops whitespace", () => {
    expect(canonical({ b: 1, a: [2, { d: null, c: "x" }] })).toBe(
      '{"a":[2,{"c":"x","d":null}],"b":1}',
    );
  });

  it("an Ed25519 signature over the canonical statement verifies with the raw public key", () => {
    const signature = sign(null, Buffer.from(canonical(VECTOR.statement)), privateKey).toString(
      "base64url",
    );
    expect(signature).toBe(
      "uuubAcjYGwsGhE3vKFaeFQ2tAhEHf5GHwNBX74p2f6J0b9y_OXwjedjoN6dFhSvSOG12o59XO4q33yj7ki-cAQ",
    );
    expect(publicRaw).toBe("6kpsY-KcUgq-9VB7Ey7F-ZVHdq6-vnuSQh7qaRRG0iw");
    expect(signatureValid({ statement: VECTOR.statement, signature, public_key: publicRaw })).toBe(
      true,
    );
    expect(
      signatureValid({
        statement: { ...VECTOR.statement, sites: 2 },
        signature,
        public_key: publicRaw,
      }),
    ).toBe(false);
  });

  it("the commitment covers URLs and file names, not file contents or order", () => {
    const a = commitment({ sites: ["https://example.com"], outputs: ["/tmp/x/a.png", "b.png"] });
    expect(a).toBe(
      commitment({ sites: ["https://example.com/"], outputs: ["b.png", "elsewhere/a.png"] }),
    );
    expect(a).not.toBe(
      commitment({ sites: ["https://example.com/other"], outputs: ["a.png", "b.png"] }),
    );
  });
});

function harness() {
  const dir = mkdtempSync(path.join(tmpdir(), "agent-disclosure-report-"));
  const cacheDir = path.join(dir, "cache");
  writeFileSync(
    path.join(dir, "a.png"),
    readFileSync(new URL("../examples/unmarked.png", import.meta.url)),
  );
  writeFileSync(
    path.join(dir, "page.html"),
    '<html><body><button aria-label="Chat with our AI assistant">Chat</button></body></html>',
  );
  const requests: { url: string; body: unknown }[] = [];
  let out = "";
  let err = "";
  const fetch = async (url: string, init?: RequestInit) => {
    requests.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
    if (url === signUrl()) {
      const body = JSON.parse(String(init!.body)) as {
        sha256: string;
        commit: string;
        sites: number;
        outputs: number;
      };
      const statement: Signature["statement"] = {
        ...VECTOR.statement,
        sha256: body.sha256,
        commit: body.commit,
        sites: body.sites,
        outputs: body.outputs,
      };
      const signature = sign(null, Buffer.from(canonical(statement)), privateKey).toString(
        "base64url",
      );
      return Response.json({
        statement,
        alg: "Ed25519",
        signature,
        key_id: statement.key_id,
        public_key: publicRaw,
      });
    }
    if (url === keyUrl())
      return Response.json({
        keys: [{ key_id: "ed25519-test", alg: "Ed25519", public_key: publicRaw }],
      });
    return new Response("not found", { status: 404 });
  };
  const deps = {
    stdout: (s: string) => (out += s),
    stderr: (s: string) => (err += s),
    fetch,
    now: () => new Date("2026-10-08T12:00:00Z"),
    cwd: dir,
    cacheDir,
  };
  return {
    dir,
    deps,
    requests,
    out: () => out,
    err: () => err,
    reset: () => ((out = ""), (err = "")),
  };
}

const token = (claims: object) =>
  `${Buffer.from(JSON.stringify(claims)).toString("base64url")}.c2ln`;

describe("report", () => {
  it("without a token: names the targets, prints the checkout link, reads and sends nothing", async () => {
    const h = harness();
    const code = await main(["report", "--site", "page.html", "--output", "a.png"], h.deps);
    expect(code).toBe(0);
    const commit = commitment({ sites: ["page.html"], outputs: ["a.png"] });
    expect(h.out()).toContain(
      `https://agentwares-agentguard.vercel.app/ai-disclosure/readiness-report?commit=${commit}&sites=1&outputs=1&ref=agent-disclosure`,
    );
    expect(h.requests).toEqual([]);
  });

  it("with the token: runs both checks, sends only the hash, commitment and counts, writes JSON and PDF that verify", async () => {
    const h = harness();
    await main(["report", "--site", "page.html", "--output", "a.png"], h.deps);
    const commit = commitment({ sites: ["page.html"], outputs: ["a.png"] });
    h.reset();
    // the targets are remembered: the token alone is enough on the same machine
    const code = await main(
      [
        "report",
        "--token",
        token({ v: 1, sku: "report", c: commit, iat: 0, exp: 1_900_000_000 }),
        "--out",
        "out",
      ],
      h.deps,
    );
    expect(h.err()).toBe("");
    expect(code).toBe(0);
    expect(h.requests.map((r) => r.url)).toEqual([signUrl()]);
    expect(Object.keys(h.requests[0]!.body as object).sort()).toEqual([
      "commit",
      "outputs",
      "sha256",
      "sites",
      "token",
    ]);
    const files = readdirSync(path.join(h.dir, "out")).sort();
    expect(files).toEqual([
      `agent-disclosure-report-2026-10-08-${commit.slice(0, 8)}.json`,
      `agent-disclosure-report-2026-10-08-${commit.slice(0, 8)}.pdf`,
    ]);
    const json = JSON.parse(readFileSync(path.join(h.dir, "out", files[0]!), "utf8"));
    expect(json.report.targets).toEqual({ sites: ["page.html"], outputs: ["a.png"] });
    expect(json.report.sites[0].disclosure.found).toBe(true);
    expect(json.report.outputs[0].marking.signed_metadata).toBe("not found");
    const pdf = readFileSync(path.join(h.dir, "out", files[1]!), "latin1");
    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf).toContain(json.sha256.slice(0, 16));

    h.reset();
    expect(await main(["verify", `out/${files[0]}`], h.deps)).toBe(0);
    expect(h.out()).toMatch(/^Valid: /);

    // a changed finding no longer matches the signed hash
    json.report.outputs[0].marking.signed_metadata = "found";
    writeFileSync(path.join(h.dir, "out", "tampered.json"), JSON.stringify(json));
    h.reset();
    expect(await main(["verify", "out/tampered.json", "--offline"], h.deps)).toBe(1);
    expect(h.out()).toMatch(/^NOT valid/);
  });

  it("refuses a token bought for other targets, an expired token, and too many targets", async () => {
    const h = harness();
    const other = token({ v: 1, sku: "report", c: "f".repeat(64), iat: 0, exp: 1_900_000_000 });
    expect(await main(["report", "--token", other, "--output", "a.png", "--json"], h.deps)).toBe(1);
    expect(JSON.parse(h.out()).error.code).toBe("TOKEN_FOR_OTHER_TARGETS");
    h.reset();
    const old = token({ v: 1, sku: "report", c: "f".repeat(64), iat: 0, exp: 1_000 });
    expect(await main(["report", "--token", old, "--output", "a.png", "--json"], h.deps)).toBe(1);
    expect(JSON.parse(h.out()).error.code).toBe("TOKEN_EXPIRED");
    h.reset();
    const many = Array.from({ length: 11 }, (_, i) => [
      "--site",
      `https://example.com/${i}`,
    ]).flat();
    expect(await main(["report", ...many, "--json"], h.deps)).toBe(2);
    expect(JSON.parse(h.out()).error.cause).toMatch(/up to 10 URLs and 25 artefacts/);
    expect(h.requests).toEqual([]);
  });

  it("reads a token's claims without needing its secret", () => {
    expect(readToken(token({ v: 1, sku: "report", c: "c".repeat(64), iat: 1, exp: 2 })).c).toBe(
      "c".repeat(64),
    );
    expect(() => readToken("nonsense")).toThrow(/BAD_TOKEN/);
  });
});
