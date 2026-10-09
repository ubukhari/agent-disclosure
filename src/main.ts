/**
 * `agent-disclosure` — an EU AI Act Article 50 readiness check, from outside.
 *
 *   agent-disclosure site <url|file.html>...      does the chat tell people it is an AI?
 *   agent-disclosure output <file|url>...         is the generated artefact marked?
 *   agent-disclosure report --site … --output …   a signed, dated readiness report ($49)
 *   agent-disclosure verify <report.json>         check a report's hash and signature
 *   agent-disclosure demo                         both checks on synthetic files shipped with it
 *
 * One GET per URL given; files are read locally and never uploaded. No account, no LLM calls, no
 * telemetry. Never a legal verdict: it reports what it found against what the law says.
 */
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { CliError, usage } from "./errors.js";
export type { Deps } from "./targets.js";
import { INSTALL, PAGES_URL } from "./install.js";
import { envelope, renderError, renderOutputText, renderSiteText } from "./render.js";
import { reportCommand, verifyCommand, REPORT_HELP } from "./report.js";
import { outputReport, siteReport, type Deps } from "./targets.js";
import { version } from "./version.js";

export const HELP = `agent-disclosure ${version()} — an EU AI Act Article 50 readiness check, from outside

Usage
  ${INSTALL} site <url|saved-page.html>...
      does the page's chat widget or assistant tell people they are talking to an AI, before or
      at the first exchange? Reads the text, aria labels, titles and placeholders, and the inline
      settings of the chat vendors it can name (Intercom, Zendesk, Drift, HubSpot, Crisp, Tidio,
      Ada, Botpress, Voiceflow, Dialogflow, Copilot Studio, Salesforce and more)
  ${INSTALL} output <file|url>...
      is a generated image, audio, video or text file marked in a machine-readable way? C2PA
      Content Credentials (JPEG, PNG, WebP, GIF, TIFF, HEIF, AVIF, MP4, MOV, M4A, WAV, MP3, FLAC,
      Ogg, PDF, SVG, HTML, ZIP documents and plain text), IPTC and XMP AI fields, a declared
      watermark, and California's latent-disclosure fields
  ${INSTALL} report --site <url> --output <file>...
      a signed, dated readiness report of both checks for up to 10 URLs and 25 artefacts, as PDF
      and JSON: $49, one-time, no account (see \`report --help\`)
  ${INSTALL} verify <report.json>
      check a report's hash and signature
  ${INSTALL} demo
      both checks on synthetic files shipped with this package: reads nothing of yours, no request

Options
  --json      the same, as JSON
  --strict    exit 3 when a site shows no disclosure or a file carries no signed metadata
              (for CI; the GitHub Action uses it)

Each URL is fetched once; nothing else is fetched (not the page's scripts, not a vendor's
settings, not a manifest a file points to). Files are read on this machine and never uploaded.
No account, no LLM calls, no telemetry. Not legal advice: it reports what it found against what
the law says, quoting Regulation (EU) 2024/1689 Art. 50, Regulation (EU) 2026/1744, the
Commission's code of practice and guidelines, and California's and Utah's codes.
Each obligation, with its dates: ${PAGES_URL}
`;

const defaultDeps: Deps = {
  stdout: (s) => process.stdout.write(s),
  stderr: (s) => process.stderr.write(s),
};

export async function main(argv: string[], deps: Deps = defaultDeps): Promise<number> {
  const json = argv.includes("--json");
  try {
    return await run(argv, deps);
  } catch (e) {
    if (e instanceof CliError) {
      (json ? deps.stdout : deps.stderr)(renderError(e.toJSON(), json));
      return e.exitCode;
    }
    throw e;
  }
}

const COMMANDS = ["site", "output", "report", "verify", "demo"];

/** The package root: `demo` reads the synthetic files shipped in it (examples/). */
export const PACKAGE_ROOT = fileURLToPath(new URL("..", import.meta.url));

async function run(argv: string[], deps: Deps): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        json: { type: "boolean" },
        strict: { type: "boolean" },
        site: { type: "string", multiple: true },
        output: { type: "string", multiple: true },
        token: { type: "string" },
        out: { type: "string" },
        offline: { type: "boolean" },
        help: { type: "boolean", short: "h" },
        version: { type: "boolean", short: "v" },
      },
    });
  } catch (e) {
    throw usage(
      e instanceof Error ? e.message : String(e),
      `run \`${INSTALL} --help\` for the options`,
    );
  }
  const { values, positionals } = parsed;
  if (values.version) {
    deps.stdout(`${version()}\n`);
    return 0;
  }
  const [command, ...rest] = positionals;
  if (command === "report" && values.help) {
    deps.stdout(REPORT_HELP);
    return 0;
  }
  if (values.help || command === undefined || command === "help") {
    deps.stdout(HELP);
    return 0;
  }
  if (!COMMANDS.includes(command))
    throw usage(
      `unknown command "${command}"`,
      `the commands are ${COMMANDS.join(", ")}; run \`${INSTALL} --help\``,
    );

  const cwd = deps.cwd ?? process.cwd();
  const now = deps.now?.() ?? new Date();
  const today = now.toISOString().slice(0, 10);

  if (command === "report") return reportCommand(rest, values, deps, cwd, now);
  if (command === "verify") return verifyCommand(rest, values, deps, cwd);

  if (command === "demo") {
    if (rest.length > 0) throw usage("demo takes no arguments", `run \`${INSTALL} demo\``);
    if (!values.json)
      deps.stdout("Synthetic files, written for this demo: not anyone's site or output.\n\n");
    const site = await runSite(
      ["examples/demo-site/index.html"],
      deps,
      PACKAGE_ROOT,
      today,
      Boolean(values.json),
    );
    const output = await runOutput(
      ["examples/unmarked.png", "examples/iptc-only.png"],
      deps,
      PACKAGE_ROOT,
      today,
      Boolean(values.json),
    );
    return Math.max(site.code, output.code);
  }
  if (rest.length === 0)
    throw usage(
      `${command} needs at least one ${command === "site" ? "URL or saved page" : "file or URL"}`,
      `run \`${INSTALL} ${command} ${command === "site" ? "https://example.com/" : "image.png"}\``,
    );
  const result =
    command === "site"
      ? await runSite(rest, deps, cwd, today, Boolean(values.json))
      : await runOutput(rest, deps, cwd, today, Boolean(values.json));
  if (result.code !== 0) return result.code;
  return values.strict && result.missing ? 3 : 0;
}

interface RunResult {
  code: number;
  /** a site with no disclosure, or a file with no signed metadata */
  missing: boolean;
}

async function runSite(
  targets: string[],
  deps: Deps,
  cwd: string,
  today: string,
  json: boolean,
): Promise<RunResult> {
  const reports: unknown[] = [];
  let code = 0;
  let missing = false;
  for (const target of targets) {
    try {
      const r = await siteReport(target, deps, cwd);
      if (!r.disclosure.found) missing = true;
      if (json) reports.push(r);
      else deps.stdout(renderSiteText(r, today) + (targets.length > 1 ? "\n" : ""));
    } catch (e) {
      if (!(e instanceof CliError)) throw e;
      if (targets.length === 1) throw e;
      code = 1;
      if (json) reports.push({ target: { name: target }, error: e.toJSON() });
      else deps.stderr(renderError(e.toJSON(), false));
    }
  }
  if (json) deps.stdout(envelope("site", today, reports));
  return { code, missing };
}

async function runOutput(
  targets: string[],
  deps: Deps,
  cwd: string,
  today: string,
  json: boolean,
): Promise<RunResult> {
  const reports: unknown[] = [];
  let code = 0;
  let missing = false;
  for (const target of targets) {
    try {
      const r = await outputReport(target, deps, cwd);
      if (r.marking.signed_metadata !== "found" && !(r.media === "text" && r.format !== "html"))
        missing = true;
      if (json) reports.push(r);
      else deps.stdout(renderOutputText(r, today) + (targets.length > 1 ? "\n" : ""));
    } catch (e) {
      if (!(e instanceof CliError)) throw e;
      if (targets.length === 1) throw e;
      code = 1;
      if (json) reports.push({ target: { name: target }, error: e.toJSON() });
      else deps.stderr(renderError(e.toJSON(), false));
    }
  }
  if (json) deps.stdout(envelope("output", today, reports));
  return { code, missing };
}
