# agent-disclosure

An EU AI Act Article 50 readiness check, from outside. Does your chat widget tell people they are
talking to an AI, before or at the first exchange? Do the images, audio, video and text your AI
generates carry machine-readable marking? It reports what it finds against what the law says, in
the law's own words. **A readiness check, not legal advice:** it never says that a site or a file
complies.

```sh
npx --allow-git=root github:agentwares/agent-disclosure site https://your-site.example/
npx --allow-git=root github:agentwares/agent-disclosure output generated.png
```

No account, no LLM calls, no telemetry. A URL is fetched once; files are read on your machine and
never uploaded.

Article 50 has applied since **2 August 2026**. Generative systems already on the EU market before
then have until **2 December 2026** to mark their output (Article 111(4), added by Regulation (EU)
2026/1744). A page per obligation and jurisdiction, each quoting the law with its date:
[agentwares-agentguard.vercel.app/ai-disclosure](https://agentwares-agentguard.vercel.app/ai-disclosure).

## `site`: does the chat say it is an AI?

It reads a page as served, or a page you saved from a browser with the chat open (`site saved.html`):
text, aria labels, titles and placeholders, the page title, and the inline settings of the chat
vendors it can name by their markup (Intercom, Zendesk, Drift, HubSpot, Crisp, Tidio, LiveChat,
tawk.to, Freshchat, Ada, Chatbase, Voiceflow, Botpress, Dialogflow, Copilot Studio, Salesforce,
watsonx, Typebot, Flowise, OpenAI ChatKit and more). It reports `disclosure found: <where>` or
`no disclosure found in <what was checked>`, lists everything it found strongest first, and flags
the kinds the Commission's guidelines (point 38) call insufficient on their own: a generic
"assistant", a site-wide "this website uses AI", a terms-only link, a technology name.

Recorded on our own site on 9 October 2026 (UTC). It has no chat, and the check says so; the full
run goes on to quote Article 50(1) and (5), list what a check from outside cannot see, and link the
pages:

```text
agent-disclosure 0.1.0 · site check · 9 Oct 2026
A readiness check, not legal advice: it reports what it found against what the law says, with
the law's own words.

Page      https://agentwares-agentguard.vercel.app/ (200, text/html, 28.6 KB, one request)

Chat widgets and assistants named in the markup
  none found in the HTML as served

Result
  no disclosure found in 28.6 KB of HTML, 86 text blocks, 0 labels, titles and placeholders, 0
  inline chat settings
```

## `output`: is the generated file marked?

It reads where each format keeps its marking: a C2PA manifest (Content Credentials) in JPEG, PNG,
WebP, GIF, TIFF, HEIF, AVIF, MP4, MOV, M4A, WAV, MP3, FLAC, Ogg, PDF, SVG, HTML, ZIP-based documents
and plain text, with its claim generator, signer, actions, IPTC digital source type, AI disclosure
assertion and any watermark it declares; IPTC's AI fields in XMP; unsigned generator hints; and
California's five latent-disclosure fields. It reads manifests and does not validate their
signatures: for that, use `c2patool` or contentcredentials.org/verify.

On a **synthetic** 32×32 image drawn by `scripts/examples.mjs` (no generator made it), recorded with
the clock at 8 October 2026 (`node scripts/sample.mjs`; a test keeps this block equal to the CLI's
output):

```text
agent-disclosure 0.1.0 · output check · 8 Oct 2026
A readiness check, not legal advice: it reports what it found against what the law says, with
the law's own words.

File      examples/unmarked.png (PNG image, 1.7 KB, read locally)
SHA-256   0de25129f4e57cea2fb80283e6e9cecd9eba17c8f2fa4e64094080415f8edf8d

Machine-readable marking
  C2PA manifest (signed metadata)    not found (looked in: PNG caBX chunk)
  AI generation declared in          nothing found
  Watermark                          none declared; an imperceptible watermark cannot be seen
                                     without the generator's own detector
  IPTC AI fields in XMP (unsigned)   no XMP
  Other unsigned fields              none naming a generator

Against the code of practice's layers (Measure 1.1)
  1. Signed metadata (1.1.1)         not found
  2. Imperceptible watermark (1.1.2) not checkable from the file (declared in a manifest: no)

California latent disclosure, § 22757.3(a)(1), from 2 Aug 2026: what the file shows
  (A) provider                       not seen
  (B) system name and version        not seen
  (C) time and date                  not seen
  (D) unique identifier              not seen
  (E) created or altered             not seen

What the law says
  AI Act, Art. 50(2), applies from 2 Aug 2026
    “Providers of AI systems, including general-purpose AI systems, generating synthetic audio,
    image, video or text content, shall ensure that the outputs of the AI system are marked in a
    machine-readable format and detectable as artificially generated or manipulated.”
  AI Act, Art. 111(4), added by Regulation (EU) 2026/1744, Art. 1, point (39)(b), applies from 27 Jul 2026
    “Providers of AI systems, including general-purpose AI systems, generating synthetic audio,
    image, video or text content, that have been placed on the market before 2 August 2026 shall
    take the necessary steps in order to comply with Article 50(2) by 2 December 2026.”
  Code of Practice, Section 1, Measure 1.1
    “Signatories will implement a multi-layered marking approach to ensure that the outputs of
    their generative AI systems are marked with at least two layers of machine-readable marking,
    as specified in Sub-measures 1.1.1 and 1.1.2 below.”
  Code of Practice, Sub-measure 1.1.1 (digitally signed metadata)
    “All recorded information will be digitally signed and time-stamped (on systems where time
    information is available) in a secure and tamper-evident manner.”
  Code of Practice, Sub-measure 1.1.2 (imperceptible watermarking)
    “Signatories will ensure that AI-generated or manipulated content is marked with an
    imperceptible watermark, with the exception of very short text.”
  Cal. Bus. & Prof. Code § 22757.3(a), applies from 2 Aug 2026
    “To the extent it is technically feasible, a covered provider shall include a latent
    disclosure that meets all of the following criteria in any image, video, or audio content,
    or content that is any combination thereof, created or altered, except by minor
    modification, by the covered provider’s GenAI system:”

What this check cannot see
  - whether the C2PA signature, certificate chain and content hashes are valid (this tool reads
    manifests; validate with c2patool or https://contentcredentials.org/verify)
  - an imperceptible watermark in the pixels, samples or wording: only the generator's own
    detector can find one
  - whether the artefact is in scope of Article 50(2) (who provides the system, whether an
    exception applies)

Each obligation, with its dates and the law's text:
  https://agentwares-agentguard.vercel.app/ai-disclosure?ref=agent-disclosure
A signed, dated readiness report for up to 10 URLs and 25 artefacts, as PDF and JSON ($49,
  one-time, no account): `npx --allow-git=root github:agentwares/agent-disclosure report --help`
Keep a dated record of every check, and of every disclosure and marking you ship. Not built
  yet; say you want it:
  https://agentwares-agentguard.vercel.app/ai-disclosure/record?ref=agent-disclosure
```

`npx --allow-git=root github:agentwares/agent-disclosure demo` runs both checks on the synthetic page and images in `examples/` and makes no
request.

## The Article 50 readiness report ($49)

The same checks for up to 10 URLs and 25 artefacts, dated and hash-signed, as a PDF and a JSON file
to keep or hand over. One-time, through Stripe Checkout, no account.

```sh
npx --allow-git=root github:agentwares/agent-disclosure report --site https://your-site.example/ --output generated.png
```

prints the checkout link for exactly those targets and reads and sends nothing yet. After paying,
the page Stripe returns you to shows a token, valid 30 days for those targets; then

```sh
npx --allow-git=root github:agentwares/agent-disclosure report --token <token>
```

runs both checks on your machine and sends only the report's SHA-256, a commitment to the target
names and two counts to be signed (Ed25519). `npx --allow-git=root github:agentwares/agent-disclosure verify <report.json>` checks a report's
hash, its signature and the key okgate publishes at `/ai-disclosure/report-key.json`.

## GitHub Action

`site` on a schedule, on your own runner, from this repository's committed `dist/` with no install
(`examples/github-workflow.yml`):

```yaml
on:
  schedule:
    - cron: "0 7 * * 1"
jobs:
  disclosure:
    runs-on: ubuntu-latest
    steps:
      - uses: agentwares/agent-disclosure@main
        with:
          url: https://your-site.example/
          fail-on: missing # or never, the default: only report
```

It writes the report to the job summary and sets `found`, `headline` and `report` as outputs.

## For agents

`--json` on every command. Errors carry `code`, `cause`, `fix` and `retryable`; exit 2 is a usage
mistake, 1 an error, 3 a `--strict` miss (no disclosure on a page, no signed metadata in a file).
The Claude Code plugin (`/plugin marketplace add agentwares/agent-disclosure`) runs
`npx -y --allow-git=root github:agentwares/agent-disclosure site` or `output` and explains the result with the law's quotes.

## What it reads and sends

- **Fetches** the one URL you give it, once, following redirects. Nothing else: not the page's
  scripts, not a chat vendor's settings, not a manifest a file only points to.
- **Reads** the files you name, locally. Nothing about them is uploaded.
- **The paid report** sends the report's SHA-256, a commitment to the URLs and file names (a
  SHA-256), and the two counts. Never a page, a file or a finding.

## The law it quotes, each read on 8 October 2026

- Regulation (EU) 2024/1689 (the AI Act), Articles 3, 50, 99, 111 and 113:
  [EUR-Lex](https://eur-lex.europa.eu/eli/reg/2024/1689/oj)
- Regulation (EU) 2026/1744 (Digital Omnibus on AI), adding Article 111(4), in force 27 July 2026:
  [EUR-Lex](https://eur-lex.europa.eu/eli/reg/2026/1744/oj)
- The Code of Practice on Transparency of AI-generated Content, 10 June 2026, and the Commission's
  opinion on it, 8 July 2026:
  [Commission](https://digital-strategy.ec.europa.eu/en/policies/code-practice-ai-generated-content)
- The Commission's guidelines on Article 50, C(2026) 5054 final, 20 July 2026:
  [Commission](https://digital-strategy.ec.europa.eu/en/library/guidelines-transparency-obligations-providers-and-deployers-ai-systems)
- California Business and Professions Code §§ 22757–22757.6 (SB 942, AB 853, SB 1000), § 22602
  (SB 243) and § 17941 (BOT Act); Utah Code § 13-77-103
- C2PA specification 2.4 and IPTC's digital source type vocabulary, for where marking lives in a file

## Keep a dated record of every check, and of every disclosure and marking you ship

okgate already keeps every tool call your agents make in a hash-chained audit log with daily
Merkle roots: 90 days on Pro, 365 days with a compliance export on Team
([okgate](https://agentwares-agentguard.vercel.app/?ref=agent-disclosure)). A record of your
disclosure and marking checks, kept the same way, is not built yet;
[say you want it](https://agentwares-agentguard.vercel.app/ai-disclosure/record?ref=agent-disclosure).

## Testing against another deployment

`AGENT_DISCLOSURE_SITE=https://<preview>.vercel.app` points `report` and `verify` at another
deployment of okgate's site, for a test checkout in Stripe test mode.

MIT licensed, by agentwares.
