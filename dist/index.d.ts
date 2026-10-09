/** Every error and warning carries what went wrong, why, how to fix it, and whether a retry helps. */
interface Problem {
    code: string;
    cause: string;
    fix: string;
    retryable: boolean;
}
declare class CliError extends Error implements Problem {
    readonly code: string;
    readonly cause: string;
    readonly fix: string;
    readonly retryable: boolean;
    /** 2 for a usage mistake, 1 for anything else */
    readonly exitCode: number;
    constructor(p: Problem, exitCode?: number);
    toJSON(): Problem;
}

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
declare const ON_NPM: boolean;
declare const NAME = "agent-disclosure";
declare const REPO = "https://github.com/agentwares/agent-disclosure";
/** What a person types. */
declare const INSTALL: string;
/** What an agent runs unattended: no install prompt, and on npm the newest version, not a cached one. */
declare const RUN: string;
/**
 * okgate's site, where the pages, the readiness report's checkout and its signing endpoint live.
 * The agentguard-era host: after the okgate host goes live it redirects people's page views there
 * and still answers `/api/*` itself (apps/agentguard-hosted/src/hosts.ts), so this keeps working.
 */
declare const SITE = "https://agentwares-agentguard.vercel.app";
/** The pages: one per obligation and jurisdiction. */
declare const PAGES_URL = "https://agentwares-agentguard.vercel.app/ai-disclosure";

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
declare const SEEN = "2026-10-08";
interface Source {
    /** what to call it in a citation */
    name: string;
    url: string;
    /** the source's own date (publication, adoption or last update), YYYY-MM-DD */
    dated: string;
}
declare const SOURCES: {
    readonly aiAct: {
        readonly name: "Regulation (EU) 2024/1689 (AI Act), OJ L, 12.7.2024";
        readonly url: "https://eur-lex.europa.eu/eli/reg/2024/1689/oj";
        readonly dated: "2024-07-12";
    };
    readonly omnibus: {
        readonly name: "Regulation (EU) 2026/1744 (Digital Omnibus on AI), OJ L, 24.7.2026";
        readonly url: "https://eur-lex.europa.eu/eli/reg/2026/1744/oj";
        readonly dated: "2026-07-24";
    };
    readonly code: {
        readonly name: "Code of Practice on Transparency of AI-generated Content (published 10 June 2026)";
        readonly url: "https://digital-strategy.ec.europa.eu/en/policies/code-practice-ai-generated-content";
        readonly dated: "2026-06-10";
    };
    readonly guidelines: {
        readonly name: "Commission Guidelines on the transparency obligations under Article 50 AI Act, C(2026) 5054 final";
        readonly url: "https://digital-strategy.ec.europa.eu/en/library/guidelines-transparency-obligations-providers-and-deployers-ai-systems";
        readonly dated: "2026-07-20";
    };
    readonly cata: {
        readonly name: "California AI Transparency Act, Business and Professions Code §§ 22757–22757.6";
        readonly url: "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=BPC&sectionNum=22757.3";
        readonly dated: "2026-09-30";
    };
    readonly utah: {
        readonly name: "Utah Code § 13-77-103 (S.B. 226, 2025)";
        readonly url: "https://le.utah.gov/xcode/Title13/Chapter77/13-77-S103.html";
        readonly dated: "2025-05-07";
    };
};
type SourceId = keyof typeof SOURCES;
interface Quote {
    /** verbatim; "…" marks a cut, and nothing else is changed */
    text: string;
    /** e.g. "AI Act, Art. 50(1)" */
    cite: string;
    source: SourceId;
    /** when this text applies from, YYYY-MM-DD, where it has a date */
    applies?: string;
}
declare const QUOTES: {
    readonly art50_1: {
        readonly text: "Providers shall ensure that AI systems intended to interact directly with natural persons are designed and developed in such a way that the natural persons concerned are informed that they are interacting with an AI system, unless this is obvious from the point of view of a natural person who is reasonably well-informed, observant and circumspect, taking into account the circumstances and the context of use.";
        readonly cite: "AI Act, Art. 50(1)";
        readonly source: "aiAct";
        readonly applies: "2026-08-02";
    };
    readonly art50_2: {
        readonly text: "Providers of AI systems, including general-purpose AI systems, generating synthetic audio, image, video or text content, shall ensure that the outputs of the AI system are marked in a machine-readable format and detectable as artificially generated or manipulated.";
        readonly cite: "AI Act, Art. 50(2)";
        readonly source: "aiAct";
        readonly applies: "2026-08-02";
    };
    readonly art50_5: {
        readonly text: "The information referred to in paragraphs 1 to 4 shall be provided to the natural persons concerned in a clear and distinguishable manner at the latest at the time of the first interaction or exposure.";
        readonly cite: "AI Act, Art. 50(5)";
        readonly source: "aiAct";
        readonly applies: "2026-08-02";
    };
    readonly art111_4: {
        readonly text: "Providers of AI systems, including general-purpose AI systems, generating synthetic audio, image, video or text content, that have been placed on the market before 2 August 2026 shall take the necessary steps in order to comply with Article 50(2) by 2 December 2026.";
        readonly cite: "AI Act, Art. 111(4), added by Regulation (EU) 2026/1744, Art. 1, point (39)(b)";
        readonly source: "omnibus";
        readonly applies: "2026-07-27";
    };
    readonly code_layers: {
        readonly text: "Signatories will implement a multi-layered marking approach to ensure that the outputs of their generative AI systems are marked with at least two layers of machine-readable marking, as specified in Sub-measures 1.1.1 and 1.1.2 below.";
        readonly cite: "Code of Practice, Section 1, Measure 1.1";
        readonly source: "code";
    };
    readonly code_signed: {
        readonly text: "All recorded information will be digitally signed and time-stamped (on systems where time information is available) in a secure and tamper-evident manner.";
        readonly cite: "Code of Practice, Sub-measure 1.1.1 (digitally signed metadata)";
        readonly source: "code";
    };
    readonly code_watermark: {
        readonly text: "Signatories will ensure that AI-generated or manipulated content is marked with an imperceptible watermark, with the exception of very short text.";
        readonly cite: "Code of Practice, Sub-measure 1.1.2 (imperceptible watermarking)";
        readonly source: "code";
    };
    readonly code_text: {
        readonly text: "given that free-form text cannot transport metadata, a single-layer of marking as described in Sub-measure 1.1.2 is considered sufficient to comply with the requirements of Article 50(2) AI Act for this specific type of content.";
        readonly cite: "Code of Practice, Measure 1.1";
        readonly source: "code";
    };
    readonly guidelines_ambiguous: {
        readonly text: "Unclear or ambiguous signals (e.g. generic references to “assistant”) or human-like representations that may mislead users;";
        readonly cite: "Commission Guidelines on Article 50, point (38)";
        readonly source: "guidelines";
    };
    readonly guidelines_generic: {
        readonly text: "Generalised disclosures that are not sufficiently specific to the AI system’s outputs and interactions (e.g. on a platform providing a variety of services or individual inputs, a general disclosure like “Services on this website use AI” is insufficient);";
        readonly cite: "Commission Guidelines on Article 50, point (38)";
        readonly source: "guidelines";
    };
    readonly guidelines_terms: {
        readonly text: "Disclosures contained only in terms and conditions, URLs, or documentation (such disclosures may complement, though not replace, in-context disclosure);";
        readonly cite: "Commission Guidelines on Article 50, point (38)";
        readonly source: "guidelines";
    };
    readonly guidelines_technical: {
        readonly text: "Technical or capability-based descriptions: statements solely referring to underlying technologies (e.g. “this system uses LLMs”) without explaining the function or implications of the system for the user and its artificial origin.";
        readonly cite: "Commission Guidelines on Article 50, point (38)";
        readonly source: "guidelines";
    };
    readonly cata_latent: {
        readonly text: "To the extent it is technically feasible, a covered provider shall include a latent disclosure that meets all of the following criteria in any image, video, or audio content, or content that is any combination thereof, created or altered, except by minor modification, by the covered provider’s GenAI system:";
        readonly cite: "Cal. Bus. & Prof. Code § 22757.3(a)";
        readonly source: "cata";
        readonly applies: "2026-08-02";
    };
    readonly utah_disclose: {
        readonly text: "A supplier that uses generative artificial intelligence to interact with an individual in connection with a consumer transaction shall disclose to the individual that the individual is interacting with generative artificial intelligence and not a human, if the individual asks or otherwise prompts the supplier about whether artificial intelligence is being used.";
        readonly cite: "Utah Code § 13-77-103(1)(a)";
        readonly source: "utah";
        readonly applies: "2025-05-07";
    };
};
type QuoteId = keyof typeof QUOTES;
/** The fields California's latent disclosure conveys (Bus. & Prof. Code § 22757.3(a)(1)(A)–(E)). */
declare const CATA_FIELDS: readonly ["The name of the covered provider.", "The name and version information of the GenAI system that created or altered the content.", "The time and date of the content’s creation or alteration.", "A unique identifier.", "Whether the GenAI system created or altered the content."];
declare const DATES: {
    /** Art. 113: the Regulation, and with it Art. 50, applies */
    readonly article50Applies: "2026-08-02";
    /** Art. 111(4): generative systems already on the market before 2 Aug 2026 */
    readonly markingRetrofit: "2026-12-02";
    /** Cal. Bus. & Prof. Code § 22757.6 */
    readonly cataOperative: "2026-08-02";
    /** §§ 22757.3.1 and 22757.3.2: large online platforms and GenAI hosting platforms */
    readonly cataPlatforms: "2027-01-01";
};

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

type Media = "image" | "video" | "audio" | "text" | "document" | "unknown";
interface Hint {
    field: string;
    value: string;
}
interface Extracted {
    format: string;
    label: string;
    media: Media;
    stores: {
        location: string;
        bytes: Uint8Array;
    }[];
    /** an embedded Manifest Store this reader saw but could not take out (e.g. inside a PDF stream) */
    unreadStore?: string;
    /** URIs that point to an external C2PA manifest */
    references: {
        location: string;
        uri: string;
    }[];
    xmp: string[];
    hints: Hint[];
    /** where a C2PA Manifest Store was looked for, in words */
    looked: string[];
    /** the decoded text, for text-like formats */
    text?: string;
}
/** Identify the format and take out everything a marking check reads. */
declare function extract(b: Uint8Array, name: string, contentType?: string): Extracted;

/**
 * Read the subject of an X.509 certificate (DER): who a C2PA manifest says signed it. This reads a
 * name; it does not validate the certificate, its chain or the signature.
 */
interface CertName {
    CN?: string;
    O?: string;
    OU?: string;
    C?: string;
}

interface ActionSummary {
    action: string;
    digitalSourceType?: string;
    softwareAgent?: string;
    when?: string;
}
interface ManifestSummary {
    label: string;
    update: boolean;
    claimGenerator?: string;
    instanceId?: string;
    title?: string;
    signature: {
        present: boolean;
        alg?: string;
        signer?: CertName;
        issuer?: CertName;
        timeStamped: boolean;
    };
    assertions: string[];
    actions: ActionSummary[];
    digitalSourceTypes: string[];
    aiDisclosure?: {
        modelType?: string;
        modelName?: string;
        modelIdentifier?: string;
        humanOversightLevel?: string;
    };
    softBindings: string[];
    watermarkDeclared: boolean;
    /** a compressed ('brob') manifest this reader could not open */
    compressed: boolean;
}
interface StoreSummary {
    manifests: ManifestSummary[];
    /** the last manifest in the store (C2PA: the active manifest) */
    active?: ManifestSummary;
    problems: string[];
}
/** Summarise a C2PA Manifest Store from its bytes (the whole 'jumb' box, header included). */
declare function summariseStore(bytes: Uint8Array): StoreSummary;

/**
 * Text artefacts: a C2PA manifest embedded in unstructured text (C2PA 2.4, A.8: a U+FEFF followed
 * by Unicode variation selectors that encode "C2PATXT\0", a version, a length and the Manifest
 * Store), and an inventory of the invisible characters text can carry. A statistical watermark in
 * the wording itself cannot be seen without the generator's own detector.
 */
interface InvisibleCount {
    /** U+200B–U+200D, U+2060 */
    zeroWidth: number;
    /** U+FEFF not at the very start */
    byteOrderMarks: number;
    /** U+FE00–U+FE0F and U+E0100–U+E01EF */
    variationSelectors: number;
    /** U+E0000–U+E007F */
    tagCharacters: number;
    /** U+202A–U+202E, U+2066–U+2069 */
    bidiControls: number;
}
interface TextFindings {
    characters: number;
    invisible: InvisibleCount;
    /** the Manifest Store bytes, when a C2PATextManifestWrapper was found */
    c2paStore?: Uint8Array;
    c2paProblem?: string;
}
declare function checkText(text: string): TextFindings;

/** IPTC's names for its digital source types (cv.iptc.org/newscodes/digitalsourcetype, read 8 Oct 2026). */
declare const DIGITAL_SOURCE_TYPES: Record<string, string>;
interface SourceType {
    uri: string;
    name: string;
    /** the type says generative AI made or changed the content */
    ai: boolean;
}
declare function sourceType(uri: string): SourceType;
interface Expectation {
    cite: string;
    quote: string;
    source: string;
    applies?: string;
}
interface OutputReport {
    target: {
        source: "file" | "url";
        name: string;
        final_url?: string;
        status?: number;
        content_type?: string;
        bytes: number;
        sha256: string;
        truncated?: boolean;
    };
    format: string;
    label: string;
    media: Media;
    c2pa: {
        found: boolean;
        location: string | null;
        looked_in: string[];
        unread: string | null;
        references: {
            location: string;
            uri: string;
        }[];
        manifests: number;
        active: null | {
            label: string;
            claim_generator: string | null;
            title: string | null;
            signature: {
                present: boolean;
                alg: string | null;
                signer: string | null;
                issuer: string | null;
                time_stamped: boolean;
            };
            assertions: string[];
            actions: ActionSummary[];
            digital_source_types: SourceType[];
            ai_disclosure: ManifestSummary["aiDisclosure"] | null;
            soft_bindings: string[];
            watermark_declared: boolean;
        };
        /** this tool reads manifests; it never validates them */
        validated: false;
        problems: string[];
    };
    xmp: {
        packets: number;
        digital_source_types: SourceType[];
        ai_system_used: string | null;
        ai_system_version_used: string | null;
        ai_prompt_information: boolean;
        ai_prompt_writer_name: boolean;
        provenance_reference: string | null;
        creator_tool: string | null;
        credit: string | null;
    };
    text: null | {
        characters: number;
        invisible: InvisibleCount;
        c2pa_text_wrapper: boolean;
    };
    /** unsigned fields that name a generator or the software (not marking under the code) */
    hints: (Hint & {
        names_ai_generator: boolean;
    })[];
    marking: {
        /** a C2PA manifest: digitally signed metadata (code, Sub-measure 1.1.1) */
        signed_metadata: "found" | "not found" | "present, not opened";
        /** where AI generation or manipulation is declared, in words */
        ai_declared_in: string[];
        /** a watermark or soft binding the manifest declares */
        watermark: "declared in the manifest" | "not declared";
    };
    expects: Expectation[];
    california: null | {
        fields: {
            field: string;
            name: string;
            seen: boolean;
            from: string | null;
        }[];
    };
    cannot_check: string[];
}
interface OutputInput {
    source: "file" | "url";
    name: string;
    bytes: Uint8Array;
    finalUrl?: string;
    status?: number;
    contentType?: string;
    truncated?: boolean;
    /** an HTTP Link header, for rel="c2pa-manifest" */
    link?: string | null;
}
declare function checkOutput(input: OutputInput): OutputReport;

/**
 * `site`: from outside, does a page with a chat widget or assistant tell people it is an AI, before
 * or at the first exchange? Reads the HTML as served (or a saved copy of the rendered page): text,
 * aria labels and titles, placeholders, the inline settings of the chat vendors it can name, and
 * the page title. Reports "disclosure found: <where>" or "no disclosure found in <what was
 * checked>", never whether a site complies.
 */

type Timing = "before the first exchange" | "at the first exchange" | "not known";
type SignalKind = 
/** names AI or a bot, inside the chat interface or its settings */
"in-chat"
/** names an AI assistant, agent or bot in page text outside the chat interface */
 | "page-text"
/** says "assistant" (or similar) without saying AI */
 | "assistant-only"
/** names a technology ("LLM", "GPT") without saying the person is talking to an AI */
 | "technology-only"
/** a site-wide statement such as "this website uses AI" */
 | "site-wide"
/** only in a link to terms, a policy or documentation */
 | "terms-only";
interface Signal {
    kind: SignalKind;
    /** e.g. `aria-label of button#launcher`, `Intercom inline setting "greeting"` */
    where: string;
    text: string;
    timing: Timing;
}
interface WidgetFound {
    id: string;
    name: string;
    /** what identified it: a script src, a global, an element */
    evidence: string;
}
interface SiteFindings {
    widgets: WidgetFound[];
    /** chat-like elements found by their own markup (id, class, role, aria) when no vendor is named */
    chatElements: string[];
    signals: Signal[];
    checked: {
        bytes: number;
        textBlocks: number;
        attributes: number;
        inlineSettings: number;
        scripts: number;
    };
    /** the page sends little text and loads its interface by script */
    scriptRendered: boolean;
}
declare function classify(text: string, ctx: {
    inChat: boolean;
    linkHref?: string;
}): SignalKind | null;
/** Analyse one HTML document. */
declare function analyseHtml(html: string): SiteFindings;

/**
 * The `site` report: what was fetched, which chat widgets the markup names, the disclosures found
 * (strongest first), what Article 50(1) and (5) say, and what a check from outside cannot see.
 */

interface SiteReport {
    target: {
        source: "url" | "file";
        name: string;
        final_url?: string;
        status?: number;
        content_type?: string;
        bytes: number;
        truncated?: boolean;
    };
    widgets: WidgetFound[];
    chat_elements: string[];
    disclosure: {
        /** a disclosure naming AI or a bot was found in the chat interface or on the page */
        found: boolean;
        /** "disclosure found: <where>" or "no disclosure found in <what was checked>" */
        headline: string;
        in_chat_interface: boolean;
    };
    signals: Signal[];
    checked: SiteFindings["checked"];
    script_rendered: boolean;
    expects: Expectation[];
    cannot_check: string[];
}
interface SiteInput {
    source: "url" | "file";
    name: string;
    html: string;
    bytes: number;
    finalUrl?: string;
    status?: number;
    contentType?: string;
    truncated?: boolean;
}
declare function checkSite(input: SiteInput): SiteReport;

interface Deps {
    stdout: (s: string) => void;
    stderr: (s: string) => void;
    fetch?: FetchLike;
    now?: () => Date;
    cwd?: string;
    /** where `report` keeps the targets of a check you have not paid for yet */
    cacheDir?: string;
}

declare const HELP: string;
declare function main(argv: string[], deps?: Deps): Promise<number>;

interface XmpFindings {
    packets: number;
    digitalSourceTypes: string[];
    aiSystemUsed?: string;
    aiSystemVersionUsed?: string;
    /** present or not; the prompt itself is not repeated */
    aiPromptInformation: boolean;
    aiPromptWriterName: boolean;
    /** a URI where an external C2PA manifest is said to be */
    provenance?: string;
    creatorTool?: string;
    credit?: string;
}
declare function readXmp(packets: readonly string[]): XmpFindings;

/** What `site` and `output` print: text for a person, `--json` for a program. */

/** The hand-off, word for word the same as on okgate's /ai-disclosure pages. */
declare const HANDOFF_LINE = "Keep a dated record of every check, and of every disclosure and marking you ship.";
/** Where the hand-off points: okgate's page for it (a waitlist until the record view is built). */
declare const RECORD_URL = "https://agentwares-agentguard.vercel.app/ai-disclosure/record?ref=agent-disclosure";
declare function renderSiteText(r: SiteReport, today: string): string;
declare function renderOutputText(r: OutputReport, today: string): string;

declare const LIMITS: {
    readonly sites: 10;
    readonly outputs: 25;
};
declare const PRICE = "$49";
/** Sorted keys, no whitespace: the bytes that are hashed and signed. */
declare function canonical(v: unknown): string;
interface Targets {
    sites: string[];
    outputs: string[];
}
declare function commitment(t: Targets): string;
interface Signature {
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
interface SignedReport {
    report: Record<string, unknown>;
    sha256: string;
    signature: Signature & {
        verify: string;
    };
}
/** Check an Ed25519 signature over the canonical statement with a raw (base64url) public key. */
declare function signatureValid(sig: Pick<Signature, "statement" | "signature" | "public_key">): boolean;

/** The library behind the CLI: the two checks, the report and its signature, and the law they quote. */

/** The day the README samples were recorded on (scripts/sample.mjs). */
declare const SAMPLE_DATE = "2026-10-08";

export { CATA_FIELDS, CliError, DATES, DIGITAL_SOURCE_TYPES, HANDOFF_LINE, HELP, INSTALL, LIMITS, type ManifestSummary, NAME, ON_NPM, type OutputReport, PAGES_URL, PRICE, type Problem, QUOTES, type Quote, type QuoteId, RECORD_URL, REPO, RUN, SAMPLE_DATE, SEEN, SITE, SOURCES, type Signal, type SignalKind, type SignedReport, type SiteReport, type Source, type StoreSummary, analyseHtml, canonical, checkOutput, checkSite, checkText, classify, commitment, extract, main, readXmp, renderOutputText, renderSiteText, signatureValid, sourceType, summariseStore };
