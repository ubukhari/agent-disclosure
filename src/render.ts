/** What `site` and `output` print: text for a person, `--json` for a program. */
import type { Problem } from "./errors.js";
import { INSTALL, PAGES_URL, SITE } from "./install.js";
import type { Expectation, OutputReport } from "./output/check.js";
import { invisibleTotal } from "./output/text.js";
import type { SignalKind } from "./site.js";
import { kb, type SiteReport } from "./site-report.js";
import { version } from "./version.js";

/** The hand-off, word for word the same as on okgate's /ai-disclosure pages. */
export const HANDOFF_LINE =
  "Keep a dated record of every check, and of every disclosure and marking you ship.";

/** Where the hand-off points: okgate's page for it (a waitlist until the record view is built). */
export const RECORD_URL = `${SITE}/ai-disclosure/record?ref=agent-disclosure`;

export const NOT_ADVICE =
  "A readiness check, not legal advice: it reports what it found against what the law says, with the law's own words.";

const DAY = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
export const shortDate = (iso: string) =>
  DAY.format(new Date(`${iso.slice(0, 10)}T00:00:00Z`)).replace("Sept", "Sep");

/** Wrap prose at `width`, every line after the first indented by `indent`. */
export function wrap(text: string, indent: string, width = 96): string {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (cur && indent.length + cur.length + 1 + w.length > width) {
      lines.push(cur);
      cur = w;
    } else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) lines.push(cur);
  return lines.map((l, i) => (i === 0 ? l : indent + l)).join("\n");
}

function header(command: string, today: string): string {
  return `agent-disclosure ${version()} · ${command} check · ${shortDate(today)}\n${wrap(NOT_ADVICE, "")}\n`;
}

function lawSection(expects: readonly Expectation[]): string {
  const out = ["What the law says"];
  for (const e of expects) {
    const when = e.applies ? `, applies from ${shortDate(e.applies)}` : "";
    out.push(`  ${e.cite}${when}`);
    out.push(`    ${wrap(`“${e.quote}”`, "    ")}`);
  }
  return out.join("\n");
}

function cannotSection(items: readonly string[]): string {
  return ["What this check cannot see", ...items.map((c) => `  - ${wrap(c, "    ")}`)].join("\n");
}

export function footer(): string {
  return [
    `Each obligation, with its dates and the law's text: ${PAGES_URL}?ref=agent-disclosure`,
    `A signed, dated readiness report for up to 10 URLs and 25 artefacts, as PDF and JSON ($49, one-time, no account): \`${INSTALL} report --help\``,
    `${HANDOFF_LINE} Not built yet; say you want it: ${RECORD_URL}`,
  ]
    .map((l) => wrap(l, "  "))
    .join("\n");
}

const KIND_LABEL: Record<SignalKind, string> = {
  "in-chat": "in the chat interface",
  "page-text": "on the page, outside the chat",
  "assistant-only": 'says "assistant", not AI',
  "technology-only": "names a technology only",
  "site-wide": "a site-wide statement",
  "terms-only": "only in a terms or policy link",
};

function fetchedLine(t: SiteReport["target"] | OutputReport["target"], label?: string): string {
  if (t.source === "file")
    return `${t.name} (${label ? `${label}, ` : ""}${kb(t.bytes)}, read locally)`;
  const bits = [
    t.status !== undefined ? String(t.status) : null,
    t.content_type?.split(";")[0] || null,
    label ?? null,
    kb(t.bytes),
    "one request",
  ].filter(Boolean);
  const moved = t.final_url ? `\n          → ${t.final_url}` : "";
  return `${t.name} (${bits.join(", ")})${moved}${t.truncated ? "\n          (cut at the size limit; the rest was not read)" : ""}`;
}

export function renderSiteText(r: SiteReport, today: string): string {
  const out = [header("site", today), `Page      ${fetchedLine(r.target)}`, ""];
  out.push("Chat widgets and assistants named in the markup");
  if (r.widgets.length === 0 && r.chat_elements.length === 0)
    out.push("  none found in the HTML as served");
  for (const w of r.widgets) out.push(`  ${w.name.padEnd(36)} ${w.evidence}`);
  if (r.widgets.length === 0 && r.chat_elements.length)
    out.push(`  chat elements by their own markup: ${r.chat_elements.slice(0, 5).join(", ")}`);
  out.push("", "Result", `  ${wrap(r.disclosure.headline, "  ")}`);
  if (r.signals.length) {
    out.push("", "Everything found, strongest first");
    for (const s of r.signals.slice(0, 12)) {
      out.push(
        `  ${KIND_LABEL[s.kind].padEnd(32)} ${wrap(`${s.where} (${s.timing})`, " ".repeat(35))}`,
      );
      out.push(`  ${" ".repeat(32)} ${wrap(`“${s.text}”`, " ".repeat(35))}`);
    }
    if (r.signals.length > 12)
      out.push(`  … and ${r.signals.length - 12} more (--json lists them all)`);
  }
  out.push("", lawSection(r.expects), "", cannotSection(r.cannot_check), "", footer(), "");
  return out.join("\n");
}

function row(label: string, value: string): string {
  return `  ${label.padEnd(34)} ${wrap(value, " ".repeat(37))}`;
}

export function renderOutputText(r: OutputReport, today: string): string {
  const out = [header("output", today)];
  out.push(
    `${r.target.source === "file" ? "File" : "URL "}      ${fetchedLine(r.target, r.label)}`,
  );
  out.push(`SHA-256   ${r.target.sha256}`, "");
  out.push("Machine-readable marking");
  const c = r.c2pa;
  const where = c.found
    ? `found: ${c.location}, ${c.manifests} manifest${c.manifests === 1 ? "" : "s"} (read, not validated)`
    : c.unread
      ? `present, not opened: ${c.unread}`
      : `not found (looked in: ${c.looked_in.join("; ") || "nothing this reader knows for this format"})`;
  out.push(row("C2PA manifest (signed metadata)", where));
  for (const ref of c.references)
    out.push(row("External manifest reference", `${ref.uri} (${ref.location}; not fetched)`));
  out.push(
    row(
      "AI generation declared in",
      r.marking.ai_declared_in.length ? r.marking.ai_declared_in.join("; ") : "nothing found",
    ),
  );
  out.push(
    row(
      "Watermark",
      c.active?.watermark_declared
        ? `declared in the manifest${c.active.soft_bindings.length ? ` (${c.active.soft_bindings.join(", ")})` : ""}; this tool cannot read it`
        : "none declared; an imperceptible watermark cannot be seen without the generator's own detector",
    ),
  );
  const x = r.xmp;
  const xmpBits = [
    x.digital_source_types.length
      ? `DigitalSourceType ${x.digital_source_types.map((t) => t.name).join(", ")}`
      : null,
    x.ai_system_used
      ? `AISystemUsed ${x.ai_system_used}${x.ai_system_version_used ? ` ${x.ai_system_version_used}` : ""}`
      : null,
    x.ai_prompt_information ? "AIPromptInformation present" : null,
  ].filter(Boolean);
  out.push(
    row(
      "IPTC AI fields in XMP (unsigned)",
      xmpBits.length ? xmpBits.join("; ") : x.packets ? "none in the XMP" : "no XMP",
    ),
  );
  const shown = r.hints.filter(
    (h) => h.names_ai_generator || /software|creatortool|generator|producer|encoder/i.test(h.field),
  );
  out.push(
    row(
      "Other unsigned fields",
      shown.length
        ? shown.map((h) => `${h.field}: ${h.value}`).join("; ")
        : "none naming a generator",
    ),
  );
  if (r.text) {
    const n = invisibleTotal(r.text.invisible);
    out.push(row("C2PA text manifest wrapper", r.text.c2pa_text_wrapper ? "found" : "not found"));
    out.push(
      row(
        "Invisible characters",
        n
          ? `${n} (${Object.entries(r.text.invisible)
              .filter(([, v]) => v)
              .map(([k, v]) => `${v} ${k}`)
              .join(", ")})`
          : "none",
      ),
    );
  }
  if (c.active) {
    const a = c.active;
    out.push("", "C2PA manifest, as read (not validated)");
    out.push(row("Label", a.label));
    if (a.claim_generator) out.push(row("Claim generator", a.claim_generator));
    out.push(
      row(
        "Signed by",
        a.signature.signer
          ? `${a.signature.signer}${a.signature.issuer ? `, issued by ${a.signature.issuer}` : ""}`
          : a.signature.present
            ? "a signature is present; no signer name read"
            : "no signature box",
      ),
    );
    if (a.signature.alg || a.signature.time_stamped)
      out.push(
        row(
          "Signature",
          [a.signature.alg, a.signature.time_stamped ? "time-stamped" : "no time-stamp"]
            .filter(Boolean)
            .join(", "),
        ),
      );
    for (const act of a.actions.slice(0, 6))
      out.push(
        row(
          "Action",
          `${act.action}${act.digitalSourceType ? `: ${act.digitalSourceType.split("/").pop()}` : ""}${act.softwareAgent ? ` by ${act.softwareAgent}` : ""}${act.when ? ` at ${act.when}` : ""}`,
        ),
      );
    if (a.ai_disclosure)
      out.push(
        row(
          "AI disclosure assertion",
          Object.entries(a.ai_disclosure)
            .filter(([, v]) => v)
            .map(([k, v]) => `${k} ${v}`)
            .join(", "),
        ),
      );
    out.push(row("Assertions", a.assertions.join(", ") || "none"));
  }
  for (const p of c.problems) out.push(`  note: ${wrap(p, "        ")}`);
  const freeText = r.media === "text" && r.format !== "html";
  out.push("", "Against the code of practice's layers (Measure 1.1)");
  if (freeText)
    out.push(
      row(
        "Signed metadata (1.1.1)",
        "not expected for free-form text: the code accepts the watermark alone",
      ),
    );
  else out.push(row("1. Signed metadata (1.1.1)", r.marking.signed_metadata));
  out.push(
    row(
      `${freeText ? "" : "2. "}Imperceptible watermark (1.1.2)`,
      `not checkable from the file (declared in a manifest: ${c.active?.watermark_declared ? "yes" : "no"})`,
    ),
  );
  if (r.california) {
    out.push(
      "",
      "California latent disclosure, § 22757.3(a)(1), from 2 Aug 2026: what the file shows",
    );
    for (const f of r.california.fields)
      out.push(row(f.name, f.seen ? `seen: ${f.from}` : "not seen"));
  }
  out.push("", lawSection(r.expects), "", cannotSection(r.cannot_check), "", footer(), "");
  return out.join("\n");
}

export function envelope(command: string, today: string, reports: unknown[]): string {
  return `${JSON.stringify(
    {
      tool: "agent-disclosure",
      version: version(),
      command,
      checked_at: today,
      not_legal_advice: NOT_ADVICE,
      reports,
      pages: PAGES_URL,
      handoff: { line: HANDOFF_LINE, url: RECORD_URL, built: false },
    },
    null,
    2,
  )}\n`;
}

export function renderError(p: Problem, json: boolean): string {
  if (json) return `${JSON.stringify({ error: p }, null, 2)}\n`;
  return `agent-disclosure: ${p.code}: ${p.cause}\n  fix: ${p.fix}${p.retryable ? "\n  (retrying may help)" : ""}\n`;
}
