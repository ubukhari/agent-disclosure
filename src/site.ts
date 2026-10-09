/**
 * `site`: from outside, does a page with a chat widget or assistant tell people it is an AI, before
 * or at the first exchange? Reads the HTML as served (or a saved copy of the rendered page): text,
 * aria labels and titles, placeholders, the inline settings of the chat vendors it can name, and
 * the page title. Reports "disclosure found: <where>" or "no disclosure found in <what was
 * checked>", never whether a site complies.
 */
import { describe, walkHtml, type Element } from "./html.js";
import {
  CHAT_CONFIG,
  CHAT_KEYS,
  CONFIG_KEYS,
  FIRST_EXCHANGE_KEYS,
  VENDORS,
  type Vendor,
} from "./vendors.js";

export type Timing = "before the first exchange" | "at the first exchange" | "not known";

export type SignalKind =
  /** names AI or a bot, inside the chat interface or its settings */
  | "in-chat"
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

export interface Signal {
  kind: SignalKind;
  /** e.g. `aria-label of button#launcher`, `Intercom inline setting "greeting"` */
  where: string;
  text: string;
  timing: Timing;
}

export interface WidgetFound {
  id: string;
  name: string;
  /** what identified it: a script src, a global, an element */
  evidence: string;
}

export interface SiteFindings {
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

const AI_TOKEN = /(?<![\p{L}\d])(?:AI|A\.I\.|KI|IA|GenAI)(?![\p{L}\d])/u;
const AI_WORDS =
  /artificial intelligence|künstliche\p{L}* intelligenz|intelligence artificielle|inteligencia artificial|intelligenza artificiale|kunstmatige intelligentie|inteligência artificial|sztuczn\p{L}* inteligencj\p{L}*|generative ai/iu;
const BOT =
  /(?<![\p{L}\d])(?:chat ?bot\p{L}*|bot|bots|virtual agent|ai agent|automated (?:assistant|agent|system|chat|responses?|repl(?:y|ies)|answers?)|agent conversationnel|robot conversationnel|not (?:a )?(?:human|real person|person))(?![\p{L}\d])/iu;
const TECH =
  /(?<![\p{L}\d])(?:LLMs?|large language models?|GPT(?:-?\d[\w.]*)?|ChatGPT|OpenAI|Claude|Gemini|Llama|machine learning|neural network)(?![\p{L}\d])/iu;
const ASSISTANT =
  /(?<![\p{L}\d])(?:assistant|assistants|assistente|asistente|assistent|helper|concierge|copilot)(?![\p{L}\d])/iu;
const SITE_WIDE =
  /(?:this|our) (?:web)?site (?:uses|is using) (?:AI|artificial intelligence)|services on this (?:web)?site use (?:AI|artificial intelligence)|we use (?:AI|artificial intelligence) (?:on|across|throughout)/iu;
/**
 * Outside the chat interface, page text counts only when it tells the reader, in the second or
 * first person, that what they talk to is an AI: an AI company's marketing copy mentions AI agents
 * on every line and discloses nothing about the page's own chat.
 */
const TELLS_READER = [
  /\byou(?:'re| are)?\s+(?:now\s+)?(?:chatting|talking|speaking|interacting|messaging)\s+(?:with|to)\s+(?:an?\s+)?(?:AI\b|A\.I\.|bot\b|chatbot|virtual|automated|artificial)/iu,
  /\b(?:this|our)\s+(?:chat|chatbot|assistant|agent|support|conversation|help)\s+(?:is|uses|runs on)\s+(?:an?\s+)?(?:AI\b|automated|bot\b|artificial|powered by)/iu,
  /\b(?:answers?|responses?|replies)\s+(?:here\s+)?(?:are|is)\s+(?:generated|written|provided)\s+by\s+(?:an?\s+)?(?:AI\b|artificial intelligence|bot\b|automated)/iu,
  /\b(?:I am|I'm|this is)\s+(?:an?\s+)?(?:AI\b|virtual|automated|bot\b|chatbot|artificial)/iu,
  /\bnot\s+a\s+(?:human|real person|person)\b/iu,
  /\bSie\s+(?:chatten|sprechen|kommunizieren)\s+mit\s+(?:einer?\s+)?(?:KI|künstlichen|Chatbot|Bot)/iu,
  /\bvous\s+(?:discutez|parlez|échangez)\s+avec\s+(?:une?\s+)?(?:IA|intelligence artificielle|assistant virtuel|chatbot|robot)/iu,
  /\b(?:está|estás)\s+(?:hablando|chateando)\s+con\s+(?:una?\s+)?(?:IA|inteligencia artificial|asistente virtual|chatbot|bot)/iu,
];
const TERMS =
  /terms|policy|privacy|legal|conditions|nutzungsbedingungen|datenschutz|mentions|cgu|disclosure/i;
const CHATTY =
  /chat|messenger|assistant|webchat|copilot|livechat|chatbot|ask-?ai|(?:^|[\s_-])bot(?:$|[\s_-])/i;
const STRUCTURAL = new Set([
  "html",
  "body",
  "main",
  "article",
  "section",
  "header",
  "footer",
  "nav",
  "ul",
  "ol",
  "li",
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "a",
  "span",
  "img",
  "link",
  "meta",
  "script",
  "style",
]);

/** Is this element part of a chat interface, by its own markup? */
export function isChatElement(el: Element): boolean {
  if (VENDORS.some((v) => v.elements.includes(el.name))) return true;
  const a = el.attrs;
  const own = [a["id"], a["class"], a["role"], a["aria-label"], a["data-testid"], a["name"]]
    .filter(Boolean)
    .join(" ");
  if (!STRUCTURAL.has(el.name) && CHATTY.test(own)) return true;
  if (el.name === "iframe" && CHATTY.test(`${a["title"] ?? ""} ${a["src"] ?? ""}`)) return true;
  return VENDORS.some((v) =>
    v.hosts.some((h) => (a["src"] ?? "").includes(h) || (a["href"] ?? "").includes(h)),
  );
}

export function classify(
  text: string,
  ctx: { inChat: boolean; linkHref?: string },
): SignalKind | null {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length < 2) return null;
  const hasAi = AI_TOKEN.test(t) || AI_WORDS.test(t);
  const hasBot = BOT.test(t);
  if (hasAi || hasBot) {
    if (ctx.linkHref !== undefined && TERMS.test(`${ctx.linkHref} ${t}`)) return "terms-only";
    if (SITE_WIDE.test(t)) return "site-wide";
    if (ctx.inChat) return "in-chat";
    if (TELLS_READER.some((r) => r.test(t))) return "page-text";
    return null;
  }
  if (!ctx.inChat) return null;
  if (TECH.test(t)) return "technology-only";
  if (ASSISTANT.test(t)) return "assistant-only";
  return null;
}

/** Split page text into sentences short enough to quote. */
function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2)
    .map((s) => (s.length > 240 ? `${s.slice(0, 237)}…` : s));
}

const LABEL_ATTRS = [
  "aria-label",
  "aria-description",
  "title",
  "alt",
  "placeholder",
  "data-title",
  "chat-title",
  "data-label",
  "label",
  "agent-name",
  "data-bot-name",
];

const CONFIG_PAIR =
  /(["']?)([A-Za-z_$][\w$-]{0,40})\1\s*:\s*(["'`])((?:\\.|(?!\3)[^\\\n]){1,300})\3/g;

function unescapeJs(s: string): string {
  return s.replace(/\\(u[0-9a-fA-F]{4}|.)/g, (_, c: string) =>
    c.length === 5 ? String.fromCharCode(parseInt(c.slice(1), 16)) : c === "n" ? " " : c,
  );
}

function vendorOfScript(text: string): Vendor | undefined {
  return VENDORS.find((v) => v.inline.some((p) => text.includes(p)));
}

/** Analyse one HTML document. */
export function analyseHtml(html: string): SiteFindings {
  const widgets = new Map<string, WidgetFound>();
  const chatElements: string[] = [];
  const signals: Signal[] = [];
  const seen = new Set<string>();
  const checked = {
    bytes: Buffer.byteLength(html),
    textBlocks: 0,
    attributes: 0,
    inlineSettings: 0,
    scripts: 0,
  };
  let visibleText = 0;

  const add = (s: Signal) => {
    const key = `${s.kind}|${s.where}|${s.text}`;
    if (seen.has(key) || signals.length >= 60) return;
    seen.add(key);
    signals.push(s);
  };
  const addWidget = (v: Vendor, evidence: string) => {
    if (!widgets.has(v.id)) widgets.set(v.id, { id: v.id, name: v.name, evidence });
  };
  const chatAncestor = (stack: readonly Element[]) => stack.find((e) => isChatElement(e));

  for (const ev of walkHtml(html)) {
    if (ev.kind === "open") {
      const { el } = ev;
      const src = el.attrs["src"] ?? el.attrs["href"] ?? "";
      for (const v of VENDORS) {
        const host = v.hosts.find((h) => src.includes(h));
        if (host)
          addWidget(v, `${el.name} ${el.name === "link" ? "href" : "src"} ${src.slice(0, 120)}`);
        if (v.elements.includes(el.name)) addWidget(v, `<${el.name}> element`);
      }
      const own = isChatElement(el);
      const inChat = own || chatAncestor(ev.stack) !== undefined;
      if (own && chatElements.length < 10 && !["script", "link"].includes(el.name))
        chatElements.push(describe(el));
      const linkAncestor = el.name === "a" ? el : ev.stack.findLast((e) => e.name === "a");
      for (const attr of LABEL_ATTRS) {
        const value = el.attrs[attr];
        if (!value) continue;
        checked.attributes++;
        const kind = classify(value, { inChat, linkHref: linkAncestor?.attrs["href"] });
        if (kind)
          add({
            kind,
            where: `${attr} of ${describe(el)}`,
            text: value.slice(0, 240),
            timing: inChat || attr !== "title" ? "before the first exchange" : "not known",
          });
      }
      continue;
    }
    if (ev.kind === "raw") {
      if (ev.el.name === "title") {
        checked.textBlocks++;
        for (const s of sentences(ev.text)) {
          const kind = classify(s, { inChat: false });
          if (kind)
            add({ kind, where: "the page title", text: s, timing: "before the first exchange" });
        }
        continue;
      }
      if (ev.el.name !== "script") continue;
      const type = (ev.el.attrs["type"] ?? "").toLowerCase();
      if (ev.el.attrs["src"]) continue;
      if (type && !/javascript|module|json/.test(type)) continue;
      checked.scripts++;
      // a short inline script: a vendor's snippet or a page's chat settings, not an app bundle
      if (ev.text.length > 20_000 || /json/.test(type)) continue;
      const vendor = vendorOfScript(ev.text);
      if (vendor)
        addWidget(vendor, `inline script sets ${vendor.inline.find((p) => ev.text.includes(p))}`);
      const chatConfig = CHAT_CONFIG.test(ev.text);
      if (!vendor && !chatConfig) continue;
      for (const m of ev.text.matchAll(CONFIG_PAIR)) {
        const key = m[2]!;
        if (!CHAT_KEYS.test(key) && !(vendor && CONFIG_KEYS.test(key))) continue;
        const value = unescapeJs(m[4]!).trim();
        if (!value || /^https?:\/\//.test(value) || value.length < 2) continue;
        checked.inlineSettings++;
        const kind = classify(value, { inChat: true });
        if (kind)
          add({
            kind,
            where: `${vendor ? vendor.name.split(" (")[0] : "inline chat"} setting "${key}"`,
            text: value.slice(0, 240),
            timing: FIRST_EXCHANGE_KEYS.test(key)
              ? "at the first exchange"
              : "before the first exchange",
          });
      }
      continue;
    }
    // text
    checked.textBlocks++;
    visibleText += ev.text.trim().length;
    const chat = chatAncestor(ev.stack);
    const link = ev.stack.findLast((e) => e.name === "a");
    const where = link
      ? `${chat ? "link in the chat" : "link"} to ${link.attrs["href"] ?? "(no href)"}`
      : chat
        ? `text in ${describe(chat)}`
        : `page text in ${describe(ev.stack.at(-1) ?? { name: "body", attrs: {} })}`;
    for (const s of sentences(ev.text)) {
      const kind = classify(s, { inChat: chat !== undefined, linkHref: link?.attrs["href"] });
      if (kind)
        add({ kind, where, text: s, timing: chat ? "not known" : "before the first exchange" });
    }
  }

  const scriptRendered = visibleText < 300 && countScriptSrc(html) > 0;
  return { widgets: [...widgets.values()], chatElements, signals, checked, scriptRendered };
}

function countScriptSrc(html: string): number {
  return (html.match(/<script[^>]+src=/gi) ?? []).length;
}

/** The order findings are reported in: the strongest first. */
export const KIND_ORDER: readonly SignalKind[] = [
  "in-chat",
  "page-text",
  "assistant-only",
  "technology-only",
  "site-wide",
  "terms-only",
];

export function sortSignals(signals: readonly Signal[]): Signal[] {
  return [...signals].sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
}
