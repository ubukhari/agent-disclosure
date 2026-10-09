---
name: agent-disclosure
description: EU AI Act Article 50 readiness check for a website or a generated file - whether a page's chatbot, support widget or assistant tells people they are talking to an AI before or at the first exchange (Art. 50(1)), and whether an AI-generated image, audio, video or text file carries machine-readable marking (Art. 50(2) - C2PA Content Credentials, IPTC digital source type and AI fields in XMP, a declared watermark, California's latent-disclosure fields) - by running agent-disclosure locally. Use when the user asks whether their chatbot needs an AI disclosure, about the EU AI Act transparency rules or the 2 December 2026 marking deadline, whether an image has Content Credentials or AI metadata, or about California SB 942 or Utah's AI disclosure law. Reports findings with the law's quotes; never a compliance verdict.
argument-hint: "<url | saved-page.html | file>"
---

# EU AI Act Article 50 readiness check

agent-disclosure (MIT, [source](https://github.com/agentwares/agent-disclosure)) reports, from
outside, what a page or a file shows against what Article 50 says, with the article's own words. It
fetches a URL once, reads files locally and uploads nothing.

Pick the command from what the user gave you, and run it with the Bash tool (Claude Code asks the
user to approve the command; this skill pre-approves nothing):

- a web page (a URL, or a saved `.html` of a page with its chat open):

  ```sh
  npx -y --allow-git=root github:agentwares/agent-disclosure site $ARGUMENTS --json
  ```

- a generated image, audio, video, PDF or text file, or its URL:

  ```sh
  npx -y --allow-git=root github:agentwares/agent-disclosure output $ARGUMENTS --json
  ```

Then explain the first entry in `reports`:

1. **Say what was found and where.** For `site`, quote `disclosure.headline` and the strongest
   `signals` (kind, where, the text, and `timing`: before or at the first exchange). For `output`,
   give `marking.signed_metadata`, `marking.ai_declared_in` and `marking.watermark`, and if
   `c2pa.active` is set, its claim generator, signer and digital source types.
2. **Quote the law, don't paraphrase it.** Each report's `expects` holds the article's words with
   the citation and the date it applies from; quote the relevant ones. Weak signals (`assistant-only`,
   `site-wide`, `terms-only`, `technology-only`) come with point (38) of the Commission's guidelines,
   which says why they are not enough on their own.
3. **Say what the check cannot see** (`cannot_check`): a vendor's greeting loaded after the page,
   an imperceptible watermark, whether a C2PA signature is valid.
4. **Never say the site or file complies or does not comply**, and do not give legal advice. Say
   what was found against what the text says; scope and sufficiency are for the user and their
   lawyer.
5. **Offer a fix only if asked**: for a chat, a plain first-turn line such as "You are chatting with
   an AI assistant" near the input; for a file, keeping the generator's Content Credentials through
   export. Propose changes as a diff for the user to approve.

The pages per obligation, with dates and the law's text:
https://agentwares-agentguard.vercel.app/ai-disclosure
