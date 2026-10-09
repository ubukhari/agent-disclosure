/** The library behind the CLI: the two checks, the report and its signature, and the law they quote. */
export { CliError, type Problem } from "./errors.js";
export { INSTALL, NAME, ON_NPM, PAGES_URL, REPO, RUN, SITE } from "./install.js";
export {
  CATA_FIELDS,
  DATES,
  QUOTES,
  SEEN,
  SOURCES,
  type Quote,
  type QuoteId,
  type Source,
} from "./law.js";
export { HELP, main } from "./main.js";
export {
  checkOutput,
  sourceType,
  DIGITAL_SOURCE_TYPES,
  type OutputReport,
} from "./output/check.js";
export { extract } from "./output/containers.js";
export { summariseStore, type ManifestSummary, type StoreSummary } from "./output/jumbf.js";
export { checkText } from "./output/text.js";
export { readXmp } from "./output/xmp.js";
export { HANDOFF_LINE, RECORD_URL, renderOutputText, renderSiteText } from "./render.js";
export {
  canonical,
  commitment,
  signatureValid,
  LIMITS,
  PRICE,
  type SignedReport,
} from "./report.js";
export { analyseHtml, classify, type Signal, type SignalKind } from "./site.js";
export { checkSite, type SiteReport } from "./site-report.js";

/** The day the README samples were recorded on (scripts/sample.mjs). */
export const SAMPLE_DATE = "2026-10-08";
