/**
 * What the law and the Commission's documents say, word for word, with where and when it was read.
 *
 * Every `text` below was copied from the source named in `source`, read on SEEN (8 October 2026):
 * EUR-Lex's HTML of each Regulation, the Commission's PDFs of the code of practice and the
 * guidelines, and the California and Utah codes. Nothing is paraphrased inside a quote; anything
 * this tool says in its own words is outside the quotes. okgate's /ai-disclosure pages carry the
 * same quotes, and src/distribution.test.ts fails when the two differ.
 *
 * This tool reports what it found against what these texts say. It never says that a site or an
 * artefact complies or does not comply: that is a legal assessment, and this is not legal advice.
 */

/** The day every source below was read. */
export const SEEN = "2026-10-08";

export interface Source {
  /** what to call it in a citation */
  name: string;
  url: string;
  /** the source's own date (publication, adoption or last update), YYYY-MM-DD */
  dated: string;
}

export const SOURCES = {
  aiAct: {
    name: "Regulation (EU) 2024/1689 (AI Act), OJ L, 12.7.2024",
    url: "https://eur-lex.europa.eu/eli/reg/2024/1689/oj",
    dated: "2024-07-12",
  },
  omnibus: {
    name: "Regulation (EU) 2026/1744 (Digital Omnibus on AI), OJ L, 24.7.2026",
    url: "https://eur-lex.europa.eu/eli/reg/2026/1744/oj",
    dated: "2026-07-24",
  },
  code: {
    name: "Code of Practice on Transparency of AI-generated Content (published 10 June 2026)",
    url: "https://digital-strategy.ec.europa.eu/en/policies/code-practice-ai-generated-content",
    dated: "2026-06-10",
  },
  guidelines: {
    name: "Commission Guidelines on the transparency obligations under Article 50 AI Act, C(2026) 5054 final",
    url: "https://digital-strategy.ec.europa.eu/en/library/guidelines-transparency-obligations-providers-and-deployers-ai-systems",
    dated: "2026-07-20",
  },
  cata: {
    name: "California AI Transparency Act, Business and Professions Code §§ 22757–22757.6",
    url: "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=BPC&sectionNum=22757.3",
    dated: "2026-09-30",
  },
  utah: {
    name: "Utah Code § 13-77-103 (S.B. 226, 2025)",
    url: "https://le.utah.gov/xcode/Title13/Chapter77/13-77-S103.html",
    dated: "2025-05-07",
  },
} as const satisfies Record<string, Source>;

export type SourceId = keyof typeof SOURCES;

export interface Quote {
  /** verbatim; "…" marks a cut, and nothing else is changed */
  text: string;
  /** e.g. "AI Act, Art. 50(1)" */
  cite: string;
  source: SourceId;
  /** when this text applies from, YYYY-MM-DD, where it has a date */
  applies?: string;
}

export const QUOTES = {
  art50_1: {
    text: "Providers shall ensure that AI systems intended to interact directly with natural persons are designed and developed in such a way that the natural persons concerned are informed that they are interacting with an AI system, unless this is obvious from the point of view of a natural person who is reasonably well-informed, observant and circumspect, taking into account the circumstances and the context of use.",
    cite: "AI Act, Art. 50(1)",
    source: "aiAct",
    applies: "2026-08-02",
  },
  art50_2: {
    text: "Providers of AI systems, including general-purpose AI systems, generating synthetic audio, image, video or text content, shall ensure that the outputs of the AI system are marked in a machine-readable format and detectable as artificially generated or manipulated.",
    cite: "AI Act, Art. 50(2)",
    source: "aiAct",
    applies: "2026-08-02",
  },
  art50_5: {
    text: "The information referred to in paragraphs 1 to 4 shall be provided to the natural persons concerned in a clear and distinguishable manner at the latest at the time of the first interaction or exposure.",
    cite: "AI Act, Art. 50(5)",
    source: "aiAct",
    applies: "2026-08-02",
  },
  art111_4: {
    text: "Providers of AI systems, including general-purpose AI systems, generating synthetic audio, image, video or text content, that have been placed on the market before 2 August 2026 shall take the necessary steps in order to comply with Article 50(2) by 2 December 2026.",
    cite: "AI Act, Art. 111(4), added by Regulation (EU) 2026/1744, Art. 1, point (39)(b)",
    source: "omnibus",
    applies: "2026-07-27",
  },
  code_layers: {
    text: "Signatories will implement a multi-layered marking approach to ensure that the outputs of their generative AI systems are marked with at least two layers of machine-readable marking, as specified in Sub-measures 1.1.1 and 1.1.2 below.",
    cite: "Code of Practice, Section 1, Measure 1.1",
    source: "code",
  },
  code_signed: {
    text: "All recorded information will be digitally signed and time-stamped (on systems where time information is available) in a secure and tamper-evident manner.",
    cite: "Code of Practice, Sub-measure 1.1.1 (digitally signed metadata)",
    source: "code",
  },
  code_watermark: {
    text: "Signatories will ensure that AI-generated or manipulated content is marked with an imperceptible watermark, with the exception of very short text.",
    cite: "Code of Practice, Sub-measure 1.1.2 (imperceptible watermarking)",
    source: "code",
  },
  code_text: {
    text: "given that free-form text cannot transport metadata, a single-layer of marking as described in Sub-measure 1.1.2 is considered sufficient to comply with the requirements of Article 50(2) AI Act for this specific type of content.",
    cite: "Code of Practice, Measure 1.1",
    source: "code",
  },
  guidelines_ambiguous: {
    text: "Unclear or ambiguous signals (e.g. generic references to “assistant”) or human-like representations that may mislead users;",
    cite: "Commission Guidelines on Article 50, point (38)",
    source: "guidelines",
  },
  guidelines_generic: {
    text: "Generalised disclosures that are not sufficiently specific to the AI system’s outputs and interactions (e.g. on a platform providing a variety of services or individual inputs, a general disclosure like “Services on this website use AI” is insufficient);",
    cite: "Commission Guidelines on Article 50, point (38)",
    source: "guidelines",
  },
  guidelines_terms: {
    text: "Disclosures contained only in terms and conditions, URLs, or documentation (such disclosures may complement, though not replace, in-context disclosure);",
    cite: "Commission Guidelines on Article 50, point (38)",
    source: "guidelines",
  },
  guidelines_technical: {
    text: "Technical or capability-based descriptions: statements solely referring to underlying technologies (e.g. “this system uses LLMs”) without explaining the function or implications of the system for the user and its artificial origin.",
    cite: "Commission Guidelines on Article 50, point (38)",
    source: "guidelines",
  },
  cata_latent: {
    text: "To the extent it is technically feasible, a covered provider shall include a latent disclosure that meets all of the following criteria in any image, video, or audio content, or content that is any combination thereof, created or altered, except by minor modification, by the covered provider’s GenAI system:",
    cite: "Cal. Bus. & Prof. Code § 22757.3(a)",
    source: "cata",
    applies: "2026-08-02",
  },
  utah_disclose: {
    text: "A supplier that uses generative artificial intelligence to interact with an individual in connection with a consumer transaction shall disclose to the individual that the individual is interacting with generative artificial intelligence and not a human, if the individual asks or otherwise prompts the supplier about whether artificial intelligence is being used.",
    cite: "Utah Code § 13-77-103(1)(a)",
    source: "utah",
    applies: "2025-05-07",
  },
} as const satisfies Record<string, Quote>;

export type QuoteId = keyof typeof QUOTES;

/** The fields California's latent disclosure conveys (Bus. & Prof. Code § 22757.3(a)(1)(A)–(E)). */
export const CATA_FIELDS = [
  "The name of the covered provider.",
  "The name and version information of the GenAI system that created or altered the content.",
  "The time and date of the content’s creation or alteration.",
  "A unique identifier.",
  "Whether the GenAI system created or altered the content.",
] as const;

/** The dates the reports and pages name. */
/** Our short names for those five fields, for table rows; the statute's words are in CATA_FIELDS. */
export const CATA_FIELD_NAMES = [
  "(A) provider",
  "(B) system name and version",
  "(C) time and date",
  "(D) unique identifier",
  "(E) created or altered",
] as const;

export const DATES = {
  /** Art. 113: the Regulation, and with it Art. 50, applies */
  article50Applies: "2026-08-02",
  /** Art. 111(4): generative systems already on the market before 2 Aug 2026 */
  markingRetrofit: "2026-12-02",
  /** Cal. Bus. & Prof. Code § 22757.6 */
  cataOperative: "2026-08-02",
  /** §§ 22757.3.1 and 22757.3.2: large online platforms and GenAI hosting platforms */
  cataPlatforms: "2027-01-01",
} as const;

export function quote(id: QuoteId): Quote {
  return QUOTES[id];
}

export function sourceOf(id: QuoteId): Source {
  return SOURCES[QUOTES[id].source];
}
