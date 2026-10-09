# Changelog

## 0.1.0 (2026-10-08)

First release.

- `agent-disclosure site <url|saved-page.html>` reads a page as served (or a saved copy of the
  rendered page) and reports whether its chat widget or assistant tells people they are talking to
  an AI, and where: text, aria labels, titles and placeholders, and the inline settings of the chat
  vendors it can name by markup (Intercom, Zendesk, Drift, HubSpot, Crisp, Tidio, LiveChat, tawk.to,
  Freshchat, Ada, Chatbase, Voiceflow, Botpress, Dialogflow, Copilot Studio, Salesforce, watsonx,
  Typebot, Flowise, OpenAI ChatKit and more). It sorts what it finds by strength, flags the kinds
  the Commission's guidelines call insufficient on their own (a generic "assistant", a site-wide
  "uses AI" line, a terms-only link, a technology name), and says what a check from outside cannot
  see.
- `agent-disclosure output <file|url>` reports the machine-readable marking a generated artefact
  carries: a C2PA manifest in JPEG, PNG, WebP, GIF, TIFF, HEIF, AVIF, MP4, MOV, M4A, WAV, MP3,
  FLAC, Ogg, PDF, SVG, HTML, ZIP-based documents and plain text (its claim generator, signer,
  actions, IPTC digital source type, AI disclosure assertion and any declared watermark), IPTC and
  XMP AI fields, unsigned generator hints, and California's five latent-disclosure fields. It reads
  manifests and never validates them, and says so.
- Each report quotes what Article 50 of Regulation (EU) 2024/1689, Article 111(4) as added by
  Regulation (EU) 2026/1744, the Commission's code of practice and guidelines, and California's
  Business and Professions Code say, with the date each applies from. Never a verdict.
- `agent-disclosure report` writes a signed, dated readiness report (JSON and PDF) for up to 10
  URLs and 25 artefacts after a one-time purchase on okgate's site; only the report's hash is sent
  to be signed. `agent-disclosure verify` checks one.
- `--json` for programs, `--strict` for CI, `demo` on synthetic files shipped in `examples/`. One
  request per URL given; files are read locally; no account, no LLM calls, no telemetry. Errors
  carry `code`, `cause`, `fix` and `retryable`.
