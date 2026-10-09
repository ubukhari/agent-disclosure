import { defineConfig } from "tsup";

/**
 * No runtime dependencies: npx installs one package. The CLI's only requests are the one GET of
 * the URL it is given, and, for a paid report, one POST of the report's hash to be signed.
 */
export default defineConfig({
  entry: { cli: "src/cli.ts", index: "src/index.ts" },
  format: ["esm"],
  platform: "node",
  target: "node20",
  dts: { entry: { index: "src/index.ts" } },
  sourcemap: true,
  clean: true,
  splitting: false,
});
