/**
 * The Article 50 readiness report: both checks for up to 10 URLs and 25 artefacts, dated and
 * hash-signed, as JSON and PDF. One-time $49 on okgate's site through Stripe Checkout; no account.
 *
 * 1. `report --site … --output …` without a token reads nothing yet: it names the targets, computes
 *    their commitment (a SHA-256 of the sorted URLs and file names, never their contents) and
 *    prints the checkout link for it. The targets are kept in ~/.cache/agent-disclosure.
 * 2. After payment, okgate's page gives a signed token bound to that commitment, valid 30 days.
 * 3. `report --token <t>` runs every check on this machine, hashes the report, and sends only the
 *    hash, the commitment and the two counts to be signed (Ed25519). It writes the signed JSON and
 *    a PDF of the same content. Re-runs within the 30 days (after a fix, say) are signed too.
 *
 * `verify <report.json>` recomputes the hash, checks the signature, and checks the key against the
 * one okgate publishes.
 */
import { createHash, createPublicKey, verify as verifySig } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { CliError, usage } from "./errors.js";
import { parseHttpUrl, USER_AGENT } from "./fetch.js";
import { INSTALL, SITE } from "./install.js";
import { SEEN, SOURCES } from "./law.js";
import { outputReport, readTarget, siteReport, type Deps } from "./targets.js";
import { renderPdf, type PdfLine } from "./pdf.js";
import { NOT_ADVICE, renderOutputText, renderSiteText } from "./render.js";
import { version } from "./version.js";

export const LIMITS = { sites: 10, outputs: 25 } as const;
export const PRICE = "$49";
/**
 * okgate's site. `AGENT_DISCLOSURE_SITE` points the report at another deployment of it (a preview,
 * for a test checkout in Stripe test mode); unset, it is the production site.
 */
export function siteBase(): string {
  const v = process.env["AGENT_DISCLOSURE_SITE"];
  return v && /^https?:\/\/[^\s]+$/.test(v) ? v.replace(/\/+$/, "") : SITE;
}
export const buyUrl = () => `${siteBase()}/ai-disclosure/readiness-report`;
export const signUrl = () => `${siteBase()}/api/ai-disclosure/sign`;
export const keyUrl = () => `${siteBase()}/ai-disclosure/report-key.json`;
/** The production URLs, as `--help` shows them. */
export const BUY_URL = `${SITE}/ai-disclosure/readiness-report`;

export const REPORT_HELP = `agent-disclosure report — a signed, dated Article 50 readiness report (${PRICE}, one-time)

Usage
  ${INSTALL} report --site <url> [--site <url>…] --output <file|url> [--output …]
      names the targets and prints the checkout link for them; reads and sends nothing yet
  ${INSTALL} report --token <token> [the same --site and --output]
      after payment: runs both checks on this machine, sends only the report's SHA-256 to be
      signed, and writes agent-disclosure-report-<date>-<id>.json and .pdf (--out <dir>)
  ${INSTALL} verify <report.json>
      recompute the hash and check the signature against the key okgate publishes

Up to ${LIMITS.sites} URLs (site) and ${LIMITS.outputs} artefacts (output). The token from the checkout page is
valid 30 days for the same targets, so a re-check after a fix is signed too. What is sent: the
hash, a commitment to the target names (not the files, not the findings) and the two counts.
Checkout: ${BUY_URL}
`;

/** Sorted keys, no whitespace: the bytes that are hashed and signed. */
export function canonical(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map((x) => canonical(x === undefined ? null : x)).join(",")}]`;
  const entries = Object.entries(v as Record<string, unknown>)
    .filter(([, x]) => x !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, x]) => `${JSON.stringify(k)}:${canonical(x)}`).join(",")}}`;
}

export const sha256 = (s: string | Uint8Array) => createHash("sha256").update(s).digest("hex");

export interface Targets {
  sites: string[];
  outputs: string[];
}

/** What a target is called in the commitment: a normalised URL, or a file's own name. */
export function targetName(t: string): string {
  const u = parseHttpUrl(t);
  return u ? u.href : path.basename(t);
}

export function commitment(t: Targets): string {
  return sha256(
    canonical({ sites: t.sites.map(targetName).sort(), outputs: t.outputs.map(targetName).sort() }),
  );
}

export interface TokenClaims {
  v: number;
  sku: string;
  c: string;
  iat: number;
  exp: number;
}

/** Read (not verify) the claims of a token okgate issued: the server verifies it when signing. */
export function readToken(token: string): TokenClaims {
  const bad = () =>
    new CliError({
      code: "BAD_TOKEN",
      cause: "the token is not one okgate's checkout page issued",
      fix: `copy the whole token from the page Stripe returned you to after paying (${buyUrl()}/paid)`,
      retryable: false,
    });
  const [payload, mac] = token.trim().split(".");
  if (!payload || !mac) throw bad();
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as TokenClaims;
    if (typeof claims.c !== "string" || typeof claims.exp !== "number") throw bad();
    return claims;
  } catch {
    throw bad();
  }
}

function cacheDir(deps: Deps): string {
  return (
    deps.cacheDir ??
    path.join(process.env["XDG_CACHE_HOME"] || path.join(homedir(), ".cache"), "agent-disclosure")
  );
}

export interface Signature {
  statement: {
    v: 1;
    type: "agent-disclosure-report";
    sha256: string;
    commit: string;
    sites: number;
    outputs: number;
    signed_at: string;
    purchase: string;
    key_id: string;
  };
  alg: "Ed25519";
  signature: string;
  key_id: string;
  public_key: string;
}

export interface SignedReport {
  report: Record<string, unknown>;
  sha256: string;
  signature: Signature & { verify: string };
}

function checkLimits(t: Targets): void {
  if (t.sites.length + t.outputs.length === 0)
    throw usage("report needs at least one --site or --output", `run \`${INSTALL} report --help\``);
  if (t.sites.length > LIMITS.sites || t.outputs.length > LIMITS.outputs)
    throw usage(
      `a report covers up to ${LIMITS.sites} URLs and ${LIMITS.outputs} artefacts; this names ${t.sites.length} and ${t.outputs.length}`,
      "split the targets into two reports",
    );
}

export async function reportCommand(
  rest: string[],
  values: { json?: boolean; site?: string[]; output?: string[]; token?: string; out?: string },
  deps: Deps,
  cwd: string,
  now: Date,
): Promise<number> {
  if (rest.length)
    throw usage(
      `report takes --site and --output, not "${rest[0]}"`,
      `run \`${INSTALL} report --help\``,
    );
  let targets: Targets = { sites: values.site ?? [], outputs: values.output ?? [] };
  const dir = cacheDir(deps);

  if (!values.token) {
    checkLimits(targets);
    for (const s of targets.sites)
      if (!parseHttpUrl(s)) {
        // a saved page is a file: check it exists now rather than after payment
        await readTarget(s, deps, cwd, "page");
      }
    for (const o of targets.outputs)
      if (!parseHttpUrl(o)) await readTarget(o, deps, cwd, "artefact");
    const commit = commitment(targets);
    const abs: Targets = {
      sites: targets.sites.map((s) => (parseHttpUrl(s) ? s : path.resolve(cwd, s))),
      outputs: targets.outputs.map((o) => (parseHttpUrl(o) ? o : path.resolve(cwd, o))),
    };
    try {
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, `${commit}.json`), JSON.stringify(abs, null, 2));
    } catch {
      /* the cache only saves retyping the targets */
    }
    const link = `${buyUrl()}?commit=${commit}&sites=${targets.sites.length}&outputs=${targets.outputs.length}&ref=agent-disclosure`;
    if (values.json) {
      deps.stdout(
        `${JSON.stringify({ commit, sites: targets.sites.length, outputs: targets.outputs.length, checkout: link, price: PRICE, next: `${INSTALL} report --token <token>` }, null, 2)}\n`,
      );
      return 0;
    }
    deps.stdout(
      [
        `A signed readiness report for ${targets.sites.length} URL${targets.sites.length === 1 ? "" : "s"} and ${targets.outputs.length} artefact${targets.outputs.length === 1 ? "" : "s"} (${PRICE}, one-time, no account):`,
        "",
        `  ${link}`,
        "",
        "Nothing was read or sent. After paying, the page shows a token; then run",
        "",
        `  ${INSTALL} report --token <token>`,
        "",
        "on this machine (the targets are remembered), or with the same --site and --output flags.",
        "The free checks stay free: site and output print the same findings, unsigned.",
        "",
      ].join("\n"),
    );
    return 0;
  }

  const claims = readToken(values.token);
  if (claims.exp * 1000 < now.getTime())
    throw new CliError({
      code: "TOKEN_EXPIRED",
      cause: `the token expired on ${new Date(claims.exp * 1000).toISOString().slice(0, 10)}`,
      fix: `buy a new report at ${buyUrl()}`,
      retryable: false,
    });
  if (targets.sites.length + targets.outputs.length === 0) {
    try {
      targets = JSON.parse(await readFile(path.join(dir, `${claims.c}.json`), "utf8")) as Targets;
    } catch {
      throw new CliError({
        code: "TARGETS_NOT_FOUND",
        cause:
          "no --site or --output was given, and this machine has no record of the targets this token was bought for",
        fix: "run the command again with the same --site and --output flags you bought the report for",
        retryable: false,
      });
    }
  }
  checkLimits(targets);
  const commit = commitment(targets);
  if (commit !== claims.c)
    throw new CliError({
      code: "TOKEN_FOR_OTHER_TARGETS",
      cause: "this token was bought for a different set of URLs and file names",
      fix: "pass exactly the --site and --output targets you bought the report for (same URLs, same file names)",
      retryable: false,
    });

  const today = now.toISOString().slice(0, 10);
  const sites: unknown[] = [];
  const outputs: unknown[] = [];
  const texts: { title: string; text: string }[] = [];
  // a report names targets as the commitment does (a URL, or a file's own name), never by a path
  // on this machine
  for (const s of targets.sites) {
    const name = targetName(s);
    try {
      const r = await siteReport(s, deps, cwd);
      r.target.name = name;
      sites.push(r);
      texts.push({ title: `Site: ${name}`, text: renderSiteText(r, today) });
    } catch (e) {
      if (!(e instanceof CliError)) throw e;
      sites.push({ target: { name }, error: e.toJSON() });
      texts.push({ title: `Site: ${name}`, text: `Not checked: ${e.code}: ${e.cause}\n` });
    }
  }
  for (const o of targets.outputs) {
    try {
      const r = await outputReport(o, deps, cwd);
      r.target.name = targetName(o);
      outputs.push(r);
      texts.push({ title: `Artefact: ${targetName(o)}`, text: renderOutputText(r, today) });
    } catch (e) {
      if (!(e instanceof CliError)) throw e;
      outputs.push({ target: { name: targetName(o) }, error: e.toJSON() });
      texts.push({
        title: `Artefact: ${targetName(o)}`,
        text: `Not checked: ${e.code}: ${e.cause}\n`,
      });
    }
  }
  const report = {
    type: "agent-disclosure readiness report",
    version: 1,
    tool: `agent-disclosure ${version()}`,
    generated_at: now.toISOString(),
    not_legal_advice: NOT_ADVICE,
    commit,
    targets: { sites: targets.sites.map(targetName), outputs: targets.outputs.map(targetName) },
    sites,
    outputs,
    sources: Object.values(SOURCES).map((s) => ({ ...s, read: SEEN })),
  };
  const hash = sha256(canonical(report));
  const signature = await requestSignature(deps, {
    token: values.token.trim(),
    sha256: hash,
    commit,
    sites: targets.sites.length,
    outputs: targets.outputs.length,
  });
  if (signature.statement.sha256 !== hash || signature.statement.commit !== commit)
    throw new CliError({
      code: "SIGNATURE_MISMATCH",
      cause: "the signature returned is for another report",
      fix: "run the command again",
      retryable: true,
    });
  const signed: SignedReport = {
    report,
    sha256: hash,
    signature: { ...signature, verify: keyUrl() },
  };

  const outDir = path.resolve(cwd, values.out ?? ".");
  const base = `agent-disclosure-report-${today}-${commit.slice(0, 8)}`;
  await mkdir(outDir, { recursive: true });
  const jsonPath = path.join(outDir, `${base}.json`);
  const pdfPath = path.join(outDir, `${base}.pdf`);
  await writeFile(jsonPath, `${JSON.stringify(signed, null, 2)}\n`);
  await writeFile(pdfPath, reportPdf(signed, texts, now));
  if (values.json) {
    deps.stdout(
      `${JSON.stringify({ json: jsonPath, pdf: pdfPath, sha256: hash, signed_at: signature.statement.signed_at, key_id: signature.key_id }, null, 2)}\n`,
    );
  } else {
    deps.stdout(
      [
        `Signed readiness report, ${signature.statement.signed_at}`,
        `  JSON  ${jsonPath}`,
        `  PDF   ${pdfPath}`,
        `  SHA-256 of the report: ${hash}`,
        `  Ed25519 signature by key ${signature.key_id}; check it any time with \`${INSTALL} verify ${path.basename(jsonPath)}\``,
        "",
      ].join("\n"),
    );
  }
  return 0;
}

async function requestSignature(
  deps: Deps,
  body: { token: string; sha256: string; commit: string; sites: number; outputs: number },
): Promise<Signature> {
  const doFetch = deps.fetch ?? fetch;
  let res: Response;
  try {
    res = await doFetch(signUrl(), {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": USER_AGENT() },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    throw new CliError({
      code: "SIGNING_UNREACHABLE",
      cause: `okgate's signing endpoint did not answer: ${e instanceof Error ? e.message : String(e)}`,
      fix: "try again in a minute; the token stays valid for 30 days",
      retryable: true,
    });
  }
  let payload: unknown;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }
  const err = (
    payload as {
      error?: { code?: string; cause?: string; fix?: string; retryable?: boolean };
    } | null
  )?.error;
  if (!res.ok || err) {
    throw new CliError({
      code: err?.code ?? `SIGNING_HTTP_${res.status}`,
      cause: err?.cause ?? `the signing endpoint answered ${res.status}`,
      fix: err?.fix ?? "try again in a minute; the token stays valid for 30 days",
      retryable: err?.retryable ?? res.status >= 500,
    });
  }
  const sig = payload as Signature;
  if (!sig?.statement || typeof sig.signature !== "string" || typeof sig.public_key !== "string")
    throw new CliError({
      code: "SIGNING_BAD_ANSWER",
      cause: "the signing endpoint's answer has no signature",
      fix: "try again in a minute",
      retryable: true,
    });
  return sig;
}

/** Check an Ed25519 signature over the canonical statement with a raw (base64url) public key. */
export function signatureValid(
  sig: Pick<Signature, "statement" | "signature" | "public_key">,
): boolean {
  try {
    const key = createPublicKey({
      key: { kty: "OKP", crv: "Ed25519", x: sig.public_key },
      format: "jwk",
    });
    return verifySig(
      null,
      Buffer.from(canonical(sig.statement)),
      key,
      Buffer.from(sig.signature, "base64url"),
    );
  } catch {
    return false;
  }
}

function reportPdf(
  signed: SignedReport,
  texts: { title: string; text: string }[],
  now: Date,
): Uint8Array {
  const s = signed.signature;
  const lines: PdfLine[] = [
    { text: "EU AI Act Article 50 readiness report", style: "title" },
    {
      text: `${texts.length} target${texts.length === 1 ? "" : "s"} checked by agent-disclosure ${version()} on ${now.toISOString()}`,
      style: "body",
    },
    { text: NOT_ADVICE, style: "body" },
    { text: "", style: "body" },
    { text: "Signature", style: "heading" },
    { text: `Signed at ${s.statement.signed_at} with Ed25519 key ${s.key_id}.`, style: "body" },
    {
      text: `SHA-256 of the report (the JSON file's "report" object, keys sorted, no whitespace): ${signed.sha256}`,
      style: "body",
    },
    { text: `Signature: ${s.signature}`, style: "mono" },
    { text: `Public key: ${s.public_key}  (published at ${keyUrl()})`, style: "mono" },
    {
      text: `The signed record is the JSON file; this PDF shows the same findings. Check it: ${INSTALL} verify <the .json file>. The signature shows the report has not changed since it was signed; the checks ran on the buyer's machine.`,
      style: "small",
    },
    { text: "", style: "body" },
    { text: "Targets", style: "heading" },
    ...texts.map((t) => ({ text: t.title, style: "body" as const })),
    { text: "", style: "body" },
    { text: "Sources (each read on 8 October 2026)", style: "heading" },
    ...Object.values(SOURCES).map((src) => ({
      text: `${src.name}: ${src.url}`,
      style: "small" as const,
    })),
  ];
  for (const t of texts) {
    lines.push({ text: "", style: "body" }, { text: t.title, style: "heading" });
    for (const l of t.text.trimEnd().split("\n")) lines.push({ text: l, style: "mono" });
  }
  return renderPdf(lines, {
    title: "EU AI Act Article 50 readiness report",
    footer: `agent-disclosure readiness report · SHA-256 ${signed.sha256.slice(0, 16)}… · not legal advice`,
    created: now,
  });
}

export async function verifyCommand(
  rest: string[],
  values: { json?: boolean; offline?: boolean },
  deps: Deps,
  cwd: string,
): Promise<number> {
  if (rest.length !== 1)
    throw usage(
      "verify takes one report.json",
      `run \`${INSTALL} verify agent-disclosure-report-….json\``,
    );
  let signed: SignedReport;
  try {
    signed = JSON.parse(await readFile(path.resolve(cwd, rest[0]!), "utf8")) as SignedReport;
  } catch {
    throw new CliError({
      code: "REPORT_UNREADABLE",
      cause: `${rest[0]} is not a readable report JSON`,
      fix: "pass the .json file the report command wrote",
      retryable: false,
    });
  }
  const hash = sha256(canonical(signed.report ?? null));
  const checks: { name: string; ok: boolean | null; detail: string }[] = [];
  checks.push({
    name: "hash",
    ok: hash === signed.sha256 && hash === signed.signature?.statement?.sha256,
    detail: hash,
  });
  checks.push({
    name: "signature",
    ok: Boolean(signed.signature && signatureValid(signed.signature)),
    detail: `Ed25519, key ${signed.signature?.key_id ?? "?"}`,
  });
  if (values.offline)
    checks.push({ name: "published key", ok: null, detail: "not checked (--offline)" });
  else {
    let ok: boolean | null = null;
    let detail = keyUrl();
    try {
      const res = await (deps.fetch ?? fetch)(keyUrl(), {
        headers: { "user-agent": USER_AGENT() },
        signal: AbortSignal.timeout(20_000),
      });
      const body = (await res.json()) as { keys?: { key_id: string; public_key: string }[] };
      ok = Boolean(
        body.keys?.some(
          (k) =>
            k.key_id === signed.signature?.key_id && k.public_key === signed.signature?.public_key,
        ),
      );
    } catch {
      detail = `${keyUrl()} did not answer; run again or use --offline`;
    }
    checks.push({ name: "published key", ok, detail });
  }
  const valid = checks.every((c) => c.ok !== false);
  if (values.json)
    deps.stdout(
      `${JSON.stringify({ valid, signed_at: signed.signature?.statement?.signed_at ?? null, checks }, null, 2)}\n`,
    );
  else {
    deps.stdout(
      `${valid ? "Valid" : "NOT valid"}: ${rest[0]}${signed.signature?.statement?.signed_at ? `, signed ${signed.signature.statement.signed_at}` : ""}\n`,
    );
    for (const c of checks)
      deps.stdout(
        `  ${c.ok === null ? "-" : c.ok ? "ok " : "BAD"} ${c.name.padEnd(14)} ${c.detail}\n`,
      );
  }
  return valid ? 0 : 1;
}
