/**
 * The `site` report: what was fetched, which chat widgets the markup names, the disclosures found
 * (strongest first), what Article 50(1) and (5) say, and what a check from outside cannot see.
 */
import type { Expectation } from "./output/check.js";
import { QUOTES, SOURCES, type QuoteId } from "./law.js";
import {
  analyseHtml,
  sortSignals,
  type Signal,
  type SignalKind,
  type SiteFindings,
  type WidgetFound,
} from "./site.js";

export interface SiteReport {
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

const expect = (id: QuoteId): Expectation => {
  const q = QUOTES[id];
  return {
    cite: q.cite,
    quote: q.text,
    source: SOURCES[q.source].url,
    ...("applies" in q ? { applies: q.applies } : {}),
  };
};

const WEAK_QUOTE: Partial<Record<SignalKind, QuoteId>> = {
  "assistant-only": "guidelines_ambiguous",
  "site-wide": "guidelines_generic",
  "terms-only": "guidelines_terms",
  "technology-only": "guidelines_technical",
};

export function kb(bytes: number): string {
  return bytes < 1024 ? `${bytes} bytes` : `${Math.round(bytes / 102.4) / 10} KB`;
}

export interface SiteInput {
  source: "url" | "file";
  name: string;
  html: string;
  bytes: number;
  finalUrl?: string;
  status?: number;
  contentType?: string;
  truncated?: boolean;
}

export function checkSite(input: SiteInput): SiteReport {
  const f = analyseHtml(input.html);
  const signals = sortSignals(f.signals);
  const strong = signals.find((s) => s.kind === "in-chat");
  const page = signals.find((s) => s.kind === "page-text");
  const what = [
    `${kb(f.checked.bytes)} of HTML`,
    `${f.checked.textBlocks} text block${f.checked.textBlocks === 1 ? "" : "s"}`,
    `${f.checked.attributes} labels, titles and placeholders`,
    `${f.checked.inlineSettings} inline chat settings`,
  ].join(", ");
  const headline = strong
    ? `disclosure found: ${strong.where}: "${strong.text}"`
    : page
      ? `disclosure found on the page, outside the chat interface: ${page.where}: "${page.text}"`
      : `no disclosure found in ${what}`;

  const expects = [expect("art50_1"), expect("art50_5")];
  for (const kind of new Set(signals.map((s) => s.kind))) {
    const id = WEAK_QUOTE[kind];
    if (id) expects.push(expect(id));
  }

  const cannot: string[] = [];
  if (f.widgets.length)
    cannot.push(
      `what ${f.widgets.map((w) => w.name).join(", ")} says at the first exchange: the vendor's script loads its greeting after the page loads, and this check fetches nothing but the page. Open the chat in a browser, or save the page once the chat is open and run the check on the saved file`,
    );
  else
    cannot.push(
      "a chat widget that the site's own scripts add after the page loads: only widgets named in the HTML as served are seen. Open the chat in a browser, save the page, and run the check on the saved file",
    );
  if (f.scriptRendered)
    cannot.push(
      "most of this page is drawn by script after it loads, and the HTML as served carries little text: save the rendered page from a browser and run the check on the saved file",
    );
  cannot.push(
    "a voice or phone assistant, an email an agent sends, or a chat inside an app",
    "whether the system is in scope of Article 50(1), or whether its AI nature is already obvious to a reasonably well-informed person in context",
  );

  return {
    target: {
      source: input.source,
      name: input.name,
      ...(input.finalUrl && input.finalUrl !== input.name ? { final_url: input.finalUrl } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.contentType ? { content_type: input.contentType } : {}),
      bytes: input.bytes,
      ...(input.truncated ? { truncated: true } : {}),
    },
    widgets: f.widgets,
    chat_elements: f.chatElements,
    disclosure: { found: Boolean(strong || page), headline, in_chat_interface: Boolean(strong) },
    signals,
    checked: f.checked,
    script_rendered: f.scriptRendered,
    expects,
    cannot_check: cannot,
  };
}
