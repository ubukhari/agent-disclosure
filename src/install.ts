/**
 * How to run agent-disclosure: the one constant behind every place the command is shown or printed
 * (`--help` and the CLI's own hints, the README, the plugin skill and marketplace, the GitHub
 * Action, and okgate's /ai-disclosure pages).
 *
 * npm does not serve `agent-disclosure` yet, so it runs from the public repo, whose committed dist/
 * needs no build (scripts/sync-oss-repos.sh). The day npm serves it, flip ON_NPM and rewrite the
 * rest:
 *
 *   AGENT_DISCLOSURE_WRITE_INSTALL=1 pnpm --filter agent-disclosure exec vitest run src/distribution
 *
 * The GitHub form carries `--allow-git=root`: npm 12 refuses a git spec unless `--allow-git`
 * permits it (its default is `none`), `root` permits only the spec named on the command line, and
 * npm 10 and 11 accept the flag (the same form as REL-1, checked 8 Oct 2026).
 *
 * src/distribution.test.ts fails while any surface names another form of the command.
 */
export const ON_NPM: boolean = false;

export const NAME = "agent-disclosure";
export const REPO = `https://github.com/agentwares/${NAME}`;

/** What a person types. */
export const INSTALL = ON_NPM ? `npx ${NAME}` : `npx --allow-git=root github:agentwares/${NAME}`;

/** What an agent runs unattended: no install prompt, and on npm the newest version, not a cached one. */
export const RUN = ON_NPM
  ? `npx -y ${NAME}@latest`
  : `npx -y --allow-git=root github:agentwares/${NAME}`;

/**
 * okgate's site, where the pages, the readiness report's checkout and its signing endpoint live.
 * The agentguard-era host: after the okgate host goes live it redirects people's page views there
 * and still answers `/api/*` itself (apps/agentguard-hosted/src/hosts.ts), so this keeps working.
 */
export const SITE = "https://agentwares-agentguard.vercel.app";

/** The pages: one per obligation and jurisdiction. */
export const PAGES_URL = `${SITE}/ai-disclosure`;
