#!/usr/bin/env node
/**
 * Print the README's recorded sample: `agent-disclosure output examples/unmarked.png` as it runs on
 * 8 October 2026, over the synthetic image (scripts/examples.mjs drew it; no generator made it).
 * Build first (`pnpm build`); then paste the output into the README's sample block.
 * src/distribution.test.ts fails while the two differ.
 */
import { fileURLToPath } from "node:url";
import { main, SAMPLE_DATE } from "../dist/index.js";

await main(["output", "examples/unmarked.png"], {
  stdout: (s) => process.stdout.write(s),
  stderr: (s) => process.stderr.write(s),
  now: () => new Date(`${SAMPLE_DATE}T12:00:00Z`),
  cwd: fileURLToPath(new URL("..", import.meta.url)),
});
