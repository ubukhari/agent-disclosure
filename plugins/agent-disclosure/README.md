# agent-disclosure

An EU AI Act Article 50 readiness check, inside Claude Code.

- `/agent-disclosure:agent-disclosure <url>` runs
  `npx -y --allow-git=root github:agentwares/agent-disclosure site` on the page and explains where
  its chat tells people they are talking to an AI, before or at the first exchange, or that it
  found no disclosure in what it read, quoting Article 50(1) and (5).
- `/agent-disclosure:agent-disclosure <file>` runs
  `npx -y --allow-git=root github:agentwares/agent-disclosure output` on a generated image, audio,
  video or text file and explains what machine-readable marking it carries (C2PA Content
  Credentials, IPTC and XMP AI fields, a declared watermark), quoting Article 50(2).

It never says that anything complies, and it is not legal advice.

## What it runs, reads and sends

- **Runs** one command, through the Bash tool. The skill and plugin pre-approve nothing, so Claude
  Code asks you before the command runs.
- **Fetches** agent-disclosure with `npx`, from where that command names, and the one URL you give
  it, once. Nothing else: not the page's scripts, not a chat vendor's settings.
- **Reads** the file you name, on your machine. Files are never uploaded.
- **Sends nothing** about your site or files. No account, no API key, no LLM calls of its own.

Source, the full CLI, the GitHub Action and the law it quotes:
[github.com/agentwares/agent-disclosure](https://github.com/agentwares/agent-disclosure).
MIT licensed, by agentwares.
