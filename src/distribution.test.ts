/**
 * The files that put agent-disclosure where people already are: the package manifest, the README
 * and its recorded sample, this package's CHANGELOG, the repo-root files the sync copies from
 * `distribution/root` (the GitHub Action and the Claude Code plugin marketplace), and what okgate's
 * /ai-disclosure pages share with the CLI (the install command, the quotes, the hand-off). The
 * public repo has distribution/root at its root, so those checks run in the monorepo only;
 * `scripts/sync-oss-repos.sh` re-validates them.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SAMPLE_DATE } from "./index.js";
import { INSTALL, ON_NPM, REPO, RUN } from "./install.js";
import { QUOTES } from "./law.js";
import { main } from "./main.js";
import { HANDOFF_LINE } from "./render.js";

const here = (rel: string): URL => new URL(`../${rel}`, import.meta.url);
const read = (rel: string): string => readFileSync(here(rel), "utf8");
const json = <T>(rel: string): T => JSON.parse(read(rel)) as T;
const pkg = json<{
  name: string;
  version: string;
  dependencies?: Record<string, string>;
  files: string[];
  bin: Record<string, string>;
}>("package.json");

describe("package", () => {
  it("is agent-disclosure with no runtime dependencies", () => {
    expect(pkg.name).toBe("agent-disclosure");
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(pkg.dependencies ?? {}).toEqual({});
    expect(pkg.bin).toEqual({ "agent-disclosure": "./dist/cli.js" });
    expect(pkg.files).toEqual(
      expect.arrayContaining(["dist", "examples", "README.md", "CHANGELOG.md"]),
    );
  });

  it("CHANGELOG has a section for this version", () => {
    expect(read("CHANGELOG.md")).toMatch(
      new RegExp(`^## ${pkg.version.replace(/\./g, "\\.")} `, "m"),
    );
  });
});

describe("README", () => {
  const readme = read("README.md");

  it("leads with the one-line use", () => {
    expect(readme).toContain(
      "```sh\n" +
        `${INSTALL} site https://your-site.example/\n${INSTALL} output generated.png\n` +
        "```",
    );
  });

  it("the recorded sample is the CLI's real output on the synthetic image (`node scripts/sample.mjs`)", async () => {
    let out = "";
    await main(["output", "examples/unmarked.png"], {
      stdout: (s) => (out += s),
      stderr: () => undefined,
      now: () => new Date(`${SAMPLE_DATE}T12:00:00Z`),
      cwd: new URL("..", import.meta.url).pathname,
    });
    expect(readme).toContain("**synthetic**");
    expect(readme).toContain("```text\n" + out.trimEnd() + "\n```");
  });

  it("says it is not legal advice, what it sends, and where the GitHub Action is", () => {
    expect(readme).toMatch(/not legal advice/);
    expect(readme).toContain("## What it reads and sends");
    expect(readme).toContain("## GitHub Action");
    expect(readme).toContain("uses: agentwares/agent-disclosure@main");
  });
});

const root = "distribution/root";
const frontmatter = (text: string): Record<string, string> =>
  Object.fromEntries(
    (text.split("---")[1] ?? "")
      .split("\n")
      .map((l) => /^([a-z-]+):\s*(.*)$/.exec(l))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => [m[1]!, m[2]!.replace(/^"|"$/g, "")]),
  );

describe.skipIf(!existsSync(here(root)))("repo-root files (distribution/root)", () => {
  it("the marketplace's plugin resolves, and versions match this package", () => {
    const marketplace = json<{
      name: string;
      owner: { name: string };
      plugins: { name: string; source: string }[];
    }>(`${root}/.claude-plugin/marketplace.json`);
    // okgate's marketplace is "agentwares"; the same name here would clash
    expect(marketplace.name).toBe("agent-disclosure");
    expect(marketplace.owner.name).toBe("agentwares");
    expect(marketplace.plugins).toHaveLength(1);
    for (const entry of marketplace.plugins) {
      expect(entry.source.startsWith("./")).toBe(true);
      const plugin = json<{ name: string; version: string }>(
        `${root}/${entry.source.slice(2)}/.claude-plugin/plugin.json`,
      );
      expect(plugin.name).toBe(entry.name);
      expect(plugin.version).toBe(pkg.version);
    }
  });

  it("plugin.json carries the links a directory listing needs", () => {
    const plugin = json<Record<string, unknown>>(
      `${root}/plugins/agent-disclosure/.claude-plugin/plugin.json`,
    );
    for (const key of [
      "homepage",
      "documentationUrl",
      "repository",
      "privacyPolicyUrl",
      "termsOfServiceUrl",
      "supportUrl",
    ])
      expect(String(plugin[key])).toMatch(/^https:\/\//);
  });

  it("the skill runs the published CLI and never asks for a verdict", () => {
    const skills = readdirSync(here(`${root}/plugins/agent-disclosure/skills`));
    expect(skills).toEqual(["agent-disclosure"]);
    const text = read(`${root}/plugins/agent-disclosure/skills/agent-disclosure/SKILL.md`);
    const front = frontmatter(text);
    expect(front.name).toBe("agent-disclosure");
    expect(front.description!.length).toBeGreaterThan(80);
    expect(front.description!.length).toBeLessThanOrEqual(1024);
    expect(text).toContain(`${RUN} site $ARGUMENTS --json`);
    expect(text).toContain(`${RUN} output $ARGUMENTS --json`);
    expect(text).toContain("Never say the site or file complies or does not comply");
  });

  it("nothing pre-approves a tool: Claude Code asks before every command", () => {
    const walk = (dir: string): string[] =>
      readdirSync(here(dir), { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`],
      );
    const files = walk(root);
    for (const f of files.filter((x) => x.endsWith(".md"))) {
      const text = read(f);
      const front = text.startsWith("---") ? (text.split("---")[1] ?? "") : "";
      expect(front, f).not.toMatch(/^\s*(allowed-tools|allowedTools)\s*:/m);
    }
    for (const f of files.filter((x) => x.endsWith(".json")))
      expect(read(f), f).not.toMatch(/allowed-?tools/i);
  });

  it("the listing icon is a 1024 px PNG drawn from distribution/icon.svg (`pnpm icon`)", () => {
    const plugin = json<{ icon?: string }>(
      `${root}/plugins/agent-disclosure/.claude-plugin/plugin.json`,
    );
    expect(plugin.icon).toBe("./.claude-plugin/icon.png");
    const file = `${root}/plugins/agent-disclosure/${plugin.icon!.slice(2)}`;
    const png = readFileSync(here(file));
    expect(statSync(here(file)).size).toBeLessThan(2 * 1024 * 1024);
    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(png.readUInt32BE(16)).toBe(1024);
    expect(png.readUInt32BE(20)).toBe(1024);
    const key = "agent-disclosure-icon-source-sha256\0";
    const at = png.indexOf(key, 0, "latin1");
    expect(at, "icon.png carries no source hash: run `pnpm icon`").toBeGreaterThan(0);
    const drawnFrom = png.subarray(at + key.length, at + key.length + 64).toString("latin1");
    const svg = createHash("sha256").update(read("distribution/icon.svg")).digest("hex");
    expect(drawnFrom, "distribution/icon.svg changed: run `pnpm icon`").toBe(svg);
  });

  it("the plugin folder has the README the directory lists it by, naming what it runs", () => {
    const readme = read(`${root}/plugins/agent-disclosure/README.md`);
    expect(readme).toContain(`${RUN} site`);
    expect(readme).toContain("pre-approve nothing");
  });
});

/**
 * The GitHub Action, run here as a runner would: bash, the committed dist/ under
 * $GITHUB_ACTION_PATH, the summary and outputs files. Needs a build (`pnpm build`).
 */
describe.skipIf(!existsSync(here("dist/cli.js")) || !existsSync(here(`${root}/action.yml`)))(
  "the GitHub Action",
  () => {
    // vitest runs a skipped block's body while collecting, so read only where the file exists (the
    // public repo carries action.yml at its root, not under distribution/root)
    const action = existsSync(here(`${root}/action.yml`)) ? read(`${root}/action.yml`) : "run: |\n";
    const script = /run: \|\n([\s\S]*)$/.exec(action)![1]!.replace(/^ {8}/gm, "");

    function runAction(url: string, failOn: string) {
      const dir = mkdtempSync(path.join(tmpdir(), "agent-disclosure-action-"));
      const summary = path.join(dir, "summary.md");
      const outputs = path.join(dir, "outputs.txt");
      writeFileSync(summary, "");
      writeFileSync(outputs, "");
      let status = 0;
      let stdout: string;
      try {
        stdout = execFileSync("bash", ["-c", script], {
          env: {
            ...process.env,
            GITHUB_ACTION_PATH: here(".").pathname,
            RUNNER_TEMP: dir,
            GITHUB_STEP_SUMMARY: summary,
            GITHUB_OUTPUT: outputs,
            DISCLOSURE_URL: url,
            DISCLOSURE_FAIL_ON: failOn,
          },
          encoding: "utf8",
        });
      } catch (e) {
        status = (e as { status: number }).status;
        stdout = String((e as { stdout: unknown }).stdout ?? "");
      }
      return {
        status,
        stdout,
        summary: readFileSync(summary, "utf8"),
        outputs: readFileSync(outputs, "utf8"),
      };
    }

    it("runs dist/cli.js with no install and writes the summary and outputs", () => {
      expect(action).toContain(
        'node "$GITHUB_ACTION_PATH/dist/cli.js" site "$DISCLOSURE_URL" --json',
      );
      const demo = here("examples/demo-site/index.html").pathname;
      const r = runAction(demo, "missing");
      expect(r.status).toBe(0);
      expect(r.stdout).toContain("disclosure found: aria-label of button#chat-launcher");
      expect(r.summary).toContain("What the law says");
      expect(r.outputs).toContain("found=true\n");
    });

    it("fail-on: missing fails the job when no disclosure is found; never only reports", () => {
      const dir = mkdtempSync(path.join(tmpdir(), "agent-disclosure-page-"));
      const page = path.join(dir, "page.html");
      writeFileSync(page, "<html><body><p>Shoes and socks.</p></body></html>");
      expect(runAction(page, "missing").status).toBe(1);
      const never = runAction(page, "never");
      expect(never.status).toBe(0);
      expect(never.outputs).toContain("found=false\n");
    });
  },
);

/**
 * One install command (src/install.ts), everywhere it is shown. Any form of it found elsewhere must
 * be INSTALL, or RUN where an agent runs it unattended; code and okgate's pages import it rather
 * than spell it. After flipping ON_NPM, rewrite the files that cannot import it:
 *
 *   AGENT_DISCLOSURE_WRITE_INSTALL=1 pnpm --filter agent-disclosure exec vitest run src/distribution
 *
 * which also rewrites the mirror okgate's pages import.
 */
const COMMAND =
  /npx (?:-{1,2}[\w-]+(?:=[\w-]+)? )*(?:github:agentwares\/)?agent-disclosure(?:@latest)?(?![\w./-])/g;
const WRITE = Boolean(process.env["AGENT_DISCLOSURE_WRITE_INSTALL"]);
const forms = (text: string): string[] => [...text.matchAll(COMMAND)].map((m) => m[0]);
const walk = (rel: string): string[] =>
  !existsSync(here(rel))
    ? []
    : statSync(here(rel)).isFile()
      ? [rel]
      : readdirSync(here(rel), { withFileTypes: true })
          .filter((e) => !["node_modules", "dist", ".next"].includes(e.name))
          .flatMap((e) => walk(`${rel}/${e.name}`));

describe("the install command", () => {
  it(`is ${INSTALL} while ON_NPM is ${String(ON_NPM)}`, () => {
    expect(INSTALL).toBe(`npx ${ON_NPM ? "" : "--allow-git=root github:agentwares/"}${pkg.name}`);
    expect(RUN).toBe(
      ON_NPM
        ? `npx -y ${pkg.name}@latest`
        : `npx -y --allow-git=root github:agentwares/${pkg.name}`,
    );
    expect(REPO).toBe(`https://github.com/agentwares/${pkg.name}`);
  });

  const docs = [
    "README.md",
    "CHANGELOG.md",
    ...walk("distribution"),
    ...walk("examples"),
    ...walk(".claude-plugin"),
    ...walk("plugins"),
  ].filter((f) => /\.(md|json|ya?ml)$/.test(f));

  it.each(docs)("%s names only INSTALL or RUN", (file) => {
    const text = read(file);
    if (WRITE) {
      const next = text.replace(COMMAND, (m) => (/ (?:-y|--yes) /.test(m) ? RUN : INSTALL));
      if (next !== text) writeFileSync(here(file), next);
    }
    for (const form of forms(read(file))) expect([INSTALL, RUN], file).toContain(form);
  });

  it("code, scripts and tests import it rather than spell it", () => {
    const files = [...walk("src"), ...walk("scripts")].filter((f) => f !== "src/install.ts");
    expect(files.length).toBeGreaterThan(5);
    for (const file of files) expect(forms(read(file)), file).toEqual([]);
  });
});

/** okgate's /ai-disclosure pages: the install mirror, the quotes and the hand-off line. */
const OKGATE = "../agentguard-app/src/app/ai-disclosure";
const MIRROR = `${OKGATE}/_lib/install.ts`;
describe.skipIf(!existsSync(here(OKGATE)))("okgate's /ai-disclosure pages", () => {
  it("import a mirror of src/install.ts", () => {
    const text = [
      "/**",
      " * How to run agent-disclosure, mirrored from apps/agent-disclosure-cli/src/install.ts, the one constant.",
      " * Written by apps/agent-disclosure-cli/src/distribution.test.ts, which fails when the two differ.",
      " */",
      `export const ON_NPM: boolean = ${String(ON_NPM)};`,
      `export const INSTALL = ${JSON.stringify(INSTALL)};`,
      `export const REPO = ${JSON.stringify(REPO)};`,
      "",
    ].join("\n");
    if (WRITE) writeFileSync(here(MIRROR), text);
    expect(read(MIRROR)).toBe(text);
  });

  it("spell the command nowhere else", () => {
    const files = walk(OKGATE).filter((f) => f !== MIRROR && /\.(tsx?|md|json)$/.test(f));
    expect(files.length).toBeGreaterThan(5);
    for (const file of files) expect(forms(read(file)), file).toEqual([]);
  });

  it("quote, word for word, everything the CLI quotes", () => {
    const law = read(`${OKGATE}/_lib/law.ts`);
    for (const [id, q] of Object.entries(QUOTES)) {
      expect(law, id).toContain(JSON.stringify(q.text));
      expect(law, id).toContain(JSON.stringify(q.cite));
    }
  });

  it("carry the hand-off line the CLI ends with, and the README's heading is that line", () => {
    expect(read(`${OKGATE}/_lib/meta.ts`)).toContain(JSON.stringify(HANDOFF_LINE));
    expect(read("README.md")).toContain(`## ${HANDOFF_LINE.replace(/\.$/, "")}\n`);
  });
});
