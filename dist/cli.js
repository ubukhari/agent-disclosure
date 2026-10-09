#!/usr/bin/env node

// src/main.ts
import { fileURLToPath } from "url";
import { parseArgs } from "util";

// src/errors.ts
var CliError = class extends Error {
  code;
  cause;
  fix;
  retryable;
  /** 2 for a usage mistake, 1 for anything else */
  exitCode;
  constructor(p, exitCode = 1) {
    super(`${p.code}: ${p.cause}`);
    this.name = "CliError";
    this.code = p.code;
    this.cause = p.cause;
    this.fix = p.fix;
    this.retryable = p.retryable;
    this.exitCode = exitCode;
  }
  toJSON() {
    return { code: this.code, cause: this.cause, fix: this.fix, retryable: this.retryable };
  }
};
function usage(cause, fix) {
  return new CliError({ code: "BAD_ARGUMENTS", cause, fix, retryable: false }, 2);
}

// src/install.ts
var ON_NPM = false;
var NAME = "agent-disclosure";
var REPO = `https://github.com/agentwares/${NAME}`;
var INSTALL = ON_NPM ? `npx ${NAME}` : `npx --allow-git=root github:agentwares/${NAME}`;
var RUN = ON_NPM ? `npx -y ${NAME}@latest` : `npx -y --allow-git=root github:agentwares/${NAME}`;
var SITE = "https://agentwares-agentguard.vercel.app";
var PAGES_URL = `${SITE}/ai-disclosure`;

// src/output/text.ts
var MAGIC = [67, 50, 80, 65, 84, 88, 84, 0];
function vsByte(cp) {
  if (cp >= 65024 && cp <= 65039) return cp - 65024;
  if (cp >= 917760 && cp <= 917999) return cp - 917760 + 16;
  return null;
}
function checkText(text) {
  const cps = Array.from(text, (c) => c.codePointAt(0));
  const invisible = {
    zeroWidth: 0,
    byteOrderMarks: 0,
    variationSelectors: 0,
    tagCharacters: 0,
    bidiControls: 0
  };
  const out = { characters: cps.length, invisible };
  for (let i = 0; i < cps.length; i++) {
    const cp = cps[i];
    if (cp >= 8203 && cp <= 8205 || cp === 8288) invisible.zeroWidth++;
    else if (cp === 65279 && i > 0) invisible.byteOrderMarks++;
    else if (vsByte(cp) !== null) invisible.variationSelectors++;
    else if (cp >= 917504 && cp <= 917631) invisible.tagCharacters++;
    else if (cp >= 8234 && cp <= 8238 || cp >= 8294 && cp <= 8297)
      invisible.bidiControls++;
    if (cp !== 65279 || out.c2paStore) continue;
    const bytes = [];
    for (let j = i + 1; j < cps.length; j++) {
      const b = vsByte(cps[j]);
      if (b === null) break;
      bytes.push(b);
    }
    if (bytes.length < 13 || !MAGIC.every((m, k) => bytes[k] === m)) continue;
    const version2 = bytes[8];
    const length = (bytes[9] << 24 | bytes[10] << 16 | bytes[11] << 8 | bytes[12]) >>> 0;
    if (version2 !== 1)
      out.c2paProblem = `C2PA text wrapper version ${version2}; this reader knows version 1`;
    if (13 + length > bytes.length) {
      out.c2paProblem = "the C2PA text wrapper is shorter than the length it declares";
      continue;
    }
    out.c2paStore = Uint8Array.from(bytes.slice(13, 13 + length));
  }
  return out;
}
function invisibleTotal(c) {
  return c.zeroWidth + c.byteOrderMarks + c.variationSelectors + c.tagCharacters + c.bidiControls;
}

// src/law.ts
var SEEN = "2026-10-08";
var SOURCES = {
  aiAct: {
    name: "Regulation (EU) 2024/1689 (AI Act), OJ L, 12.7.2024",
    url: "https://eur-lex.europa.eu/eli/reg/2024/1689/oj",
    dated: "2024-07-12"
  },
  omnibus: {
    name: "Regulation (EU) 2026/1744 (Digital Omnibus on AI), OJ L, 24.7.2026",
    url: "https://eur-lex.europa.eu/eli/reg/2026/1744/oj",
    dated: "2026-07-24"
  },
  code: {
    name: "Code of Practice on Transparency of AI-generated Content (published 10 June 2026)",
    url: "https://digital-strategy.ec.europa.eu/en/policies/code-practice-ai-generated-content",
    dated: "2026-06-10"
  },
  guidelines: {
    name: "Commission Guidelines on the transparency obligations under Article 50 AI Act, C(2026) 5054 final",
    url: "https://digital-strategy.ec.europa.eu/en/library/guidelines-transparency-obligations-providers-and-deployers-ai-systems",
    dated: "2026-07-20"
  },
  cata: {
    name: "California AI Transparency Act, Business and Professions Code \xA7\xA7 22757\u201322757.6",
    url: "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=BPC&sectionNum=22757.3",
    dated: "2026-09-30"
  },
  utah: {
    name: "Utah Code \xA7 13-77-103 (S.B. 226, 2025)",
    url: "https://le.utah.gov/xcode/Title13/Chapter77/13-77-S103.html",
    dated: "2025-05-07"
  }
};
var QUOTES = {
  art50_1: {
    text: "Providers shall ensure that AI systems intended to interact directly with natural persons are designed and developed in such a way that the natural persons concerned are informed that they are interacting with an AI system, unless this is obvious from the point of view of a natural person who is reasonably well-informed, observant and circumspect, taking into account the circumstances and the context of use.",
    cite: "AI Act, Art. 50(1)",
    source: "aiAct",
    applies: "2026-08-02"
  },
  art50_2: {
    text: "Providers of AI systems, including general-purpose AI systems, generating synthetic audio, image, video or text content, shall ensure that the outputs of the AI system are marked in a machine-readable format and detectable as artificially generated or manipulated.",
    cite: "AI Act, Art. 50(2)",
    source: "aiAct",
    applies: "2026-08-02"
  },
  art50_5: {
    text: "The information referred to in paragraphs 1 to 4 shall be provided to the natural persons concerned in a clear and distinguishable manner at the latest at the time of the first interaction or exposure.",
    cite: "AI Act, Art. 50(5)",
    source: "aiAct",
    applies: "2026-08-02"
  },
  art111_4: {
    text: "Providers of AI systems, including general-purpose AI systems, generating synthetic audio, image, video or text content, that have been placed on the market before 2 August 2026 shall take the necessary steps in order to comply with Article 50(2) by 2 December 2026.",
    cite: "AI Act, Art. 111(4), added by Regulation (EU) 2026/1744, Art. 1, point (39)(b)",
    source: "omnibus",
    applies: "2026-07-27"
  },
  code_layers: {
    text: "Signatories will implement a multi-layered marking approach to ensure that the outputs of their generative AI systems are marked with at least two layers of machine-readable marking, as specified in Sub-measures 1.1.1 and 1.1.2 below.",
    cite: "Code of Practice, Section 1, Measure 1.1",
    source: "code"
  },
  code_signed: {
    text: "All recorded information will be digitally signed and time-stamped (on systems where time information is available) in a secure and tamper-evident manner.",
    cite: "Code of Practice, Sub-measure 1.1.1 (digitally signed metadata)",
    source: "code"
  },
  code_watermark: {
    text: "Signatories will ensure that AI-generated or manipulated content is marked with an imperceptible watermark, with the exception of very short text.",
    cite: "Code of Practice, Sub-measure 1.1.2 (imperceptible watermarking)",
    source: "code"
  },
  code_text: {
    text: "given that free-form text cannot transport metadata, a single-layer of marking as described in Sub-measure 1.1.2 is considered sufficient to comply with the requirements of Article 50(2) AI Act for this specific type of content.",
    cite: "Code of Practice, Measure 1.1",
    source: "code"
  },
  guidelines_ambiguous: {
    text: "Unclear or ambiguous signals (e.g. generic references to \u201Cassistant\u201D) or human-like representations that may mislead users;",
    cite: "Commission Guidelines on Article 50, point (38)",
    source: "guidelines"
  },
  guidelines_generic: {
    text: "Generalised disclosures that are not sufficiently specific to the AI system\u2019s outputs and interactions (e.g. on a platform providing a variety of services or individual inputs, a general disclosure like \u201CServices on this website use AI\u201D is insufficient);",
    cite: "Commission Guidelines on Article 50, point (38)",
    source: "guidelines"
  },
  guidelines_terms: {
    text: "Disclosures contained only in terms and conditions, URLs, or documentation (such disclosures may complement, though not replace, in-context disclosure);",
    cite: "Commission Guidelines on Article 50, point (38)",
    source: "guidelines"
  },
  guidelines_technical: {
    text: "Technical or capability-based descriptions: statements solely referring to underlying technologies (e.g. \u201Cthis system uses LLMs\u201D) without explaining the function or implications of the system for the user and its artificial origin.",
    cite: "Commission Guidelines on Article 50, point (38)",
    source: "guidelines"
  },
  cata_latent: {
    text: "To the extent it is technically feasible, a covered provider shall include a latent disclosure that meets all of the following criteria in any image, video, or audio content, or content that is any combination thereof, created or altered, except by minor modification, by the covered provider\u2019s GenAI system:",
    cite: "Cal. Bus. & Prof. Code \xA7 22757.3(a)",
    source: "cata",
    applies: "2026-08-02"
  },
  utah_disclose: {
    text: "A supplier that uses generative artificial intelligence to interact with an individual in connection with a consumer transaction shall disclose to the individual that the individual is interacting with generative artificial intelligence and not a human, if the individual asks or otherwise prompts the supplier about whether artificial intelligence is being used.",
    cite: "Utah Code \xA7 13-77-103(1)(a)",
    source: "utah",
    applies: "2025-05-07"
  }
};
var CATA_FIELDS = [
  "The name of the covered provider.",
  "The name and version information of the GenAI system that created or altered the content.",
  "The time and date of the content\u2019s creation or alteration.",
  "A unique identifier.",
  "Whether the GenAI system created or altered the content."
];
var CATA_FIELD_NAMES = [
  "(A) provider",
  "(B) system name and version",
  "(C) time and date",
  "(D) unique identifier",
  "(E) created or altered"
];

// src/html.ts
var VOID = /* @__PURE__ */ new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "source",
  "track",
  "wbr"
]);
var RAW = /* @__PURE__ */ new Set(["script", "style", "textarea", "template", "noscript", "title"]);
var NAMED = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "\u2013",
  mdash: "\u2014",
  hellip: "\u2026",
  rsquo: "\u2019",
  lsquo: "\u2018",
  rdquo: "\u201D",
  ldquo: "\u201C",
  copy: "\xA9",
  reg: "\xAE",
  trade: "\u2122"
};
function decodeEntities(s) {
  if (!s.includes("&")) return s;
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, body) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1));
      return Number.isFinite(code) && code > 0 && code < 1114112 ? String.fromCodePoint(code) : m;
    }
    return NAMED[body.toLowerCase()] ?? m;
  });
}
var ATTR = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
function parseAttrs(src) {
  const attrs = {};
  for (const m of src.matchAll(ATTR)) {
    const name2 = m[1].toLowerCase();
    if (name2 in attrs) continue;
    attrs[name2] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? "");
  }
  return attrs;
}
function* walkHtml(html) {
  const stack = [];
  let i = 0;
  const n = html.length;
  while (i < n) {
    const lt = html.indexOf("<", i);
    if (lt < 0) {
      const text = html.slice(i);
      if (text.trim()) yield { kind: "text", text: decodeEntities(text), stack: [...stack] };
      break;
    }
    if (lt > i) {
      const text = html.slice(i, lt);
      if (text.trim()) yield { kind: "text", text: decodeEntities(text), stack: [...stack] };
    }
    if (html.startsWith("<!--", lt)) {
      const end = html.indexOf("-->", lt + 4);
      i = end < 0 ? n : end + 3;
      continue;
    }
    if (html[lt + 1] === "!" || html[lt + 1] === "?") {
      const end = html.indexOf(">", lt);
      i = end < 0 ? n : end + 1;
      continue;
    }
    const close = html[lt + 1] === "/";
    const nameMatch = /^[a-zA-Z][a-zA-Z0-9:-]*/.exec(html.slice(lt + (close ? 2 : 1), lt + 80));
    if (!nameMatch) {
      yield { kind: "text", text: "<", stack: [...stack] };
      i = lt + 1;
      continue;
    }
    const name2 = nameMatch[0].toLowerCase();
    let j = lt + (close ? 2 : 1) + nameMatch[0].length;
    let quote = null;
    for (; j < n; j++) {
      const c = html[j];
      if (quote) {
        if (c === quote) quote = null;
      } else if (c === '"' || c === "'") quote = c;
      else if (c === ">") break;
    }
    const inner = html.slice(lt + (close ? 2 : 1) + nameMatch[0].length, j);
    i = j + 1;
    if (close) {
      const at = stack.map((e) => e.name).lastIndexOf(name2);
      if (at >= 0) stack.length = at;
      continue;
    }
    const selfClosing = inner.trimEnd().endsWith("/");
    const el = {
      name: name2,
      attrs: parseAttrs(selfClosing ? inner.trimEnd().slice(0, -1) : inner)
    };
    yield { kind: "open", el, stack: [...stack] };
    if (RAW.has(name2) && !selfClosing) {
      const endRe = new RegExp(`</${name2}\\s*>`, "i");
      const rest = html.slice(i);
      const m = endRe.exec(rest);
      const body = m ? rest.slice(0, m.index) : rest;
      yield { kind: "raw", el, text: body, stack: [...stack] };
      i += m ? m.index + m[0].length : rest.length;
      continue;
    }
    if (!VOID.has(name2) && !selfClosing) stack.push(el);
  }
}
function describe(el) {
  const id = el.attrs["id"] ? `#${el.attrs["id"]}` : "";
  const cls = (el.attrs["class"] ?? "").split(/\s+/).filter(Boolean).slice(0, 2).map((c) => `.${c}`).join("");
  return `${el.name}${id}${cls}`.slice(0, 80);
}

// src/vendors.ts
var VENDORS = [
  {
    id: "intercom",
    name: "Intercom (Messenger, Fin)",
    hosts: ["widget.intercom.io", "js.intercomcdn.com"],
    inline: ["intercomSettings", "Intercom("],
    elements: []
  },
  {
    id: "zendesk",
    name: "Zendesk Web Widget / Messaging",
    hosts: ["static.zdassets.com/ekr/snippet.js", "zopim.com"],
    inline: ["zESettings", "zE("],
    elements: []
  },
  {
    id: "drift",
    name: "Drift",
    hosts: ["js.driftt.com", "drift.com/include"],
    inline: ["drift.load("],
    elements: []
  },
  {
    id: "hubspot",
    name: "HubSpot chat",
    hosts: ["js.usemessages.com"],
    inline: ["hsConversationsSettings", "HubSpotConversations"],
    elements: []
  },
  {
    id: "hubspot-tracking",
    name: "HubSpot tracking code (loads HubSpot chat where it is switched on)",
    hosts: ["js.hs-scripts.com"],
    inline: [],
    elements: []
  },
  {
    id: "crisp",
    name: "Crisp",
    hosts: ["client.crisp.chat"],
    inline: ["CRISP_WEBSITE_ID", "$crisp"],
    elements: []
  },
  {
    id: "tidio",
    name: "Tidio (Lyro)",
    hosts: ["code.tidio.co"],
    inline: ["tidioChatApi"],
    elements: []
  },
  {
    id: "livechat",
    name: "LiveChat",
    hosts: ["cdn.livechatinc.com"],
    inline: ["__lc.license", "LiveChatWidget"],
    elements: []
  },
  { id: "tawk", name: "tawk.to", hosts: ["embed.tawk.to"], inline: ["Tawk_API"], elements: [] },
  {
    id: "freshchat",
    name: "Freshchat",
    hosts: ["wchat.freshchat.com", "snippets.freshchat.com", "fw-cdn.com"],
    inline: ["fcWidget"],
    elements: []
  },
  {
    id: "olark",
    name: "Olark",
    hosts: ["static.olark.com"],
    inline: ["olark.identify"],
    elements: []
  },
  {
    id: "helpscout",
    name: "Help Scout Beacon",
    hosts: ["beacon-v2.helpscout.net"],
    inline: ["Beacon('init'", 'Beacon("init"'],
    elements: []
  },
  { id: "ada", name: "Ada", hosts: ["static.ada.support"], inline: ["adaSettings"], elements: [] },
  {
    id: "chatbase",
    name: "Chatbase",
    hosts: ["chatbase.co/embed", "chatbase.co/chatbot-iframe"],
    inline: ["chatbaseConfig"],
    elements: []
  },
  {
    id: "voiceflow",
    name: "Voiceflow",
    hosts: ["cdn.voiceflow.com/widget"],
    inline: ["voiceflow.chat.load"],
    elements: []
  },
  {
    id: "botpress",
    name: "Botpress webchat",
    hosts: ["cdn.botpress.cloud/webchat", "mediafiles.botpress.cloud"],
    inline: ["botpressWebChat", "botpress.init"],
    elements: []
  },
  {
    id: "dialogflow",
    name: "Dialogflow / Conversational Agents Messenger (Google)",
    hosts: ["gstatic.com/dialogflow-console/fast/messenger"],
    inline: [],
    elements: ["df-messenger", "df-messenger-chat-bubble"]
  },
  {
    id: "botframework",
    name: "Microsoft Copilot Studio / Bot Framework Web Chat",
    hosts: ["cdn.botframework.com", "webchat.botframework.com", "copilotstudio.microsoft.com"],
    inline: ["renderWebChat"],
    elements: []
  },
  {
    id: "salesforce",
    name: "Salesforce Embedded Messaging",
    hosts: ["service.force.com/embeddedservice", "my.site.com/ESW", "embeddedservice"],
    inline: ["embeddedservice_bootstrap", "embedded_svc"],
    elements: []
  },
  {
    id: "watson",
    name: "IBM watsonx Assistant web chat",
    hosts: ["web-chat.global.assistant.watson.appdomain.cloud"],
    inline: ["watsonAssistantChatOptions"],
    elements: []
  },
  { id: "gorgias", name: "Gorgias", hosts: ["config.gorgias.chat"], inline: [], elements: [] },
  {
    id: "kustomer",
    name: "Kustomer",
    hosts: ["cdn.kustomerapp.com"],
    inline: ["Kustomer.start"],
    elements: []
  },
  {
    id: "front",
    name: "Front Chat",
    hosts: ["chat-assets.frontapp.com"],
    inline: ["FrontChat("],
    elements: []
  },
  {
    id: "chatwoot",
    name: "Chatwoot",
    hosts: ["/packs/js/sdk.js"],
    inline: ["chatwootSDK"],
    elements: []
  },
  { id: "landbot", name: "Landbot", hosts: ["cdn.landbot.io"], inline: ["Landbot."], elements: [] },
  {
    id: "reamaze",
    name: "Re:amaze",
    hosts: ["cdn.reamaze.com"],
    inline: ['_support["account"]', "_support['account']"],
    elements: []
  },
  {
    id: "zoho",
    name: "Zoho SalesIQ",
    hosts: ["salesiq.zoho"],
    inline: ["$zoho.salesiq"],
    elements: []
  },
  {
    id: "kommunicate",
    name: "Kommunicate",
    hosts: ["widget.kommunicate.io"],
    inline: ["kommunicateSettings"],
    elements: []
  },
  {
    id: "smartsupp",
    name: "Smartsupp",
    hosts: ["smartsuppchat.com"],
    inline: ["_smartsupp"],
    elements: []
  },
  { id: "userlike", name: "Userlike", hosts: ["userlike-cdn-widgets"], inline: [], elements: [] },
  {
    id: "forethought",
    name: "Forethought Solve",
    hosts: ["solve-widget.forethought.ai"],
    inline: [],
    elements: []
  },
  {
    id: "typebot",
    name: "Typebot",
    hosts: ["@typebot.io/js", "typebot.io"],
    inline: ["Typebot.init"],
    elements: ["typebot-bubble", "typebot-standard"]
  },
  {
    id: "flowise",
    name: "Flowise embed",
    hosts: ["flowise-embed"],
    inline: ["Chatbot.init", "Chatbot.initFull"],
    elements: ["flowise-chatbot", "flowise-fullchatbot"]
  },
  {
    id: "chatkit",
    name: "OpenAI ChatKit",
    hosts: ["cdn.platform.openai.com/deployments/chatkit"],
    inline: [],
    elements: ["openai-chatkit"]
  }
];
var CHAT_KEYS = /^(?:chatTitle|chat-title|chat_title|headerTitle|botName|bot_name|assistantName|agentName|welcome\w*|greeting\w*|intro(?:Message|Text)?|initialMessage\w*|firstMessage|starterMessage|launcherText|launcherLabel|composerPlaceholder|botConversationDescription|disclaimer\w*|aiDisclosure\w*)$/i;
var CHAT_CONFIG = /(?:chat|bot|assistant|messenger|widget)\w*(?:settings|config|configuration|options)\s*[=:(]/i;
var CONFIG_KEYS = /^(?:title|subtitle|chatTitle|chat-title|headerTitle|header|botName|bot_name|assistantName|agentName|name|welcome\w*|greeting\w*|intro\w*|initialMessage\w*|firstMessage|starterMessage|launcherText|label|buttonLabel|placeholder|composerPlaceholder|disclaimer\w*|description|botConversationDescription|tagline|headline|message|text)$/i;
var FIRST_EXCHANGE_KEYS = /welcome|greeting|intro|initial|first|starter|message|text/i;

// src/site.ts
var AI_TOKEN = /(?<![\p{L}\d])(?:AI|A\.I\.|KI|IA|GenAI)(?![\p{L}\d])/u;
var AI_WORDS = new RegExp("artificial intelligence|k\xFCnstliche\\p{L}* intelligenz|intelligence artificielle|inteligencia artificial|intelligenza artificiale|kunstmatige intelligentie|intelig\xEAncia artificial|sztuczn\\p{L}* inteligencj\\p{L}*|generative ai", "iu");
var BOT = new RegExp("(?<![\\p{L}\\d])(?:chat ?bot\\p{L}*|bot|bots|virtual agent|ai agent|automated (?:assistant|agent|system|chat|responses?|repl(?:y|ies)|answers?)|agent conversationnel|robot conversationnel|not (?:a )?(?:human|real person|person))(?![\\p{L}\\d])", "iu");
var TECH = /(?<![\p{L}\d])(?:LLMs?|large language models?|GPT(?:-?\d[\w.]*)?|ChatGPT|OpenAI|Claude|Gemini|Llama|machine learning|neural network)(?![\p{L}\d])/iu;
var ASSISTANT = /(?<![\p{L}\d])(?:assistant|assistants|assistente|asistente|assistent|helper|concierge|copilot)(?![\p{L}\d])/iu;
var SITE_WIDE = /(?:this|our) (?:web)?site (?:uses|is using) (?:AI|artificial intelligence)|services on this (?:web)?site use (?:AI|artificial intelligence)|we use (?:AI|artificial intelligence) (?:on|across|throughout)/iu;
var TELLS_READER = [
  /\byou(?:'re| are)?\s+(?:now\s+)?(?:chatting|talking|speaking|interacting|messaging)\s+(?:with|to)\s+(?:an?\s+)?(?:AI\b|A\.I\.|bot\b|chatbot|virtual|automated|artificial)/iu,
  /\b(?:this|our)\s+(?:chat|chatbot|assistant|agent|support|conversation|help)\s+(?:is|uses|runs on)\s+(?:an?\s+)?(?:AI\b|automated|bot\b|artificial|powered by)/iu,
  /\b(?:answers?|responses?|replies)\s+(?:here\s+)?(?:are|is)\s+(?:generated|written|provided)\s+by\s+(?:an?\s+)?(?:AI\b|artificial intelligence|bot\b|automated)/iu,
  /\b(?:I am|I'm|this is)\s+(?:an?\s+)?(?:AI\b|virtual|automated|bot\b|chatbot|artificial)/iu,
  /\bnot\s+a\s+(?:human|real person|person)\b/iu,
  /\bSie\s+(?:chatten|sprechen|kommunizieren)\s+mit\s+(?:einer?\s+)?(?:KI|künstlichen|Chatbot|Bot)/iu,
  /\bvous\s+(?:discutez|parlez|échangez)\s+avec\s+(?:une?\s+)?(?:IA|intelligence artificielle|assistant virtuel|chatbot|robot)/iu,
  /\b(?:está|estás)\s+(?:hablando|chateando)\s+con\s+(?:una?\s+)?(?:IA|inteligencia artificial|asistente virtual|chatbot|bot)/iu
];
var TERMS = /terms|policy|privacy|legal|conditions|nutzungsbedingungen|datenschutz|mentions|cgu|disclosure/i;
var CHATTY = /chat|messenger|assistant|webchat|copilot|livechat|chatbot|ask-?ai|(?:^|[\s_-])bot(?:$|[\s_-])/i;
var STRUCTURAL = /* @__PURE__ */ new Set([
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
  "style"
]);
function isChatElement(el) {
  if (VENDORS.some((v) => v.elements.includes(el.name))) return true;
  const a = el.attrs;
  const own = [a["id"], a["class"], a["role"], a["aria-label"], a["data-testid"], a["name"]].filter(Boolean).join(" ");
  if (!STRUCTURAL.has(el.name) && CHATTY.test(own)) return true;
  if (el.name === "iframe" && CHATTY.test(`${a["title"] ?? ""} ${a["src"] ?? ""}`)) return true;
  return VENDORS.some(
    (v) => v.hosts.some((h) => (a["src"] ?? "").includes(h) || (a["href"] ?? "").includes(h))
  );
}
function classify(text, ctx) {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length < 2) return null;
  const hasAi = AI_TOKEN.test(t) || AI_WORDS.test(t);
  const hasBot = BOT.test(t);
  if (hasAi || hasBot) {
    if (ctx.linkHref !== void 0 && TERMS.test(`${ctx.linkHref} ${t}`)) return "terms-only";
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
function sentences(text) {
  return text.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length >= 2).map((s) => s.length > 240 ? `${s.slice(0, 237)}\u2026` : s);
}
var LABEL_ATTRS = [
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
  "data-bot-name"
];
var CONFIG_PAIR = /(["']?)([A-Za-z_$][\w$-]{0,40})\1\s*:\s*(["'`])((?:\\.|(?!\3)[^\\\n]){1,300})\3/g;
function unescapeJs(s) {
  return s.replace(
    /\\(u[0-9a-fA-F]{4}|.)/g,
    (_, c) => c.length === 5 ? String.fromCharCode(parseInt(c.slice(1), 16)) : c === "n" ? " " : c
  );
}
function vendorOfScript(text) {
  return VENDORS.find((v) => v.inline.some((p) => text.includes(p)));
}
function analyseHtml(html) {
  const widgets = /* @__PURE__ */ new Map();
  const chatElements = [];
  const signals = [];
  const seen = /* @__PURE__ */ new Set();
  const checked = {
    bytes: Buffer.byteLength(html),
    textBlocks: 0,
    attributes: 0,
    inlineSettings: 0,
    scripts: 0
  };
  let visibleText = 0;
  const add = (s) => {
    const key = `${s.kind}|${s.where}|${s.text}`;
    if (seen.has(key) || signals.length >= 60) return;
    seen.add(key);
    signals.push(s);
  };
  const addWidget = (v, evidence) => {
    if (!widgets.has(v.id)) widgets.set(v.id, { id: v.id, name: v.name, evidence });
  };
  const chatAncestor = (stack) => stack.find((e) => isChatElement(e));
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
      const inChat = own || chatAncestor(ev.stack) !== void 0;
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
            timing: inChat || attr !== "title" ? "before the first exchange" : "not known"
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
      if (ev.text.length > 2e4 || /json/.test(type)) continue;
      const vendor = vendorOfScript(ev.text);
      if (vendor)
        addWidget(vendor, `inline script sets ${vendor.inline.find((p) => ev.text.includes(p))}`);
      const chatConfig = CHAT_CONFIG.test(ev.text);
      if (!vendor && !chatConfig) continue;
      for (const m of ev.text.matchAll(CONFIG_PAIR)) {
        const key = m[2];
        if (!CHAT_KEYS.test(key) && !(vendor && CONFIG_KEYS.test(key))) continue;
        const value = unescapeJs(m[4]).trim();
        if (!value || /^https?:\/\//.test(value) || value.length < 2) continue;
        checked.inlineSettings++;
        const kind = classify(value, { inChat: true });
        if (kind)
          add({
            kind,
            where: `${vendor ? vendor.name.split(" (")[0] : "inline chat"} setting "${key}"`,
            text: value.slice(0, 240),
            timing: FIRST_EXCHANGE_KEYS.test(key) ? "at the first exchange" : "before the first exchange"
          });
      }
      continue;
    }
    checked.textBlocks++;
    visibleText += ev.text.trim().length;
    const chat = chatAncestor(ev.stack);
    const link = ev.stack.findLast((e) => e.name === "a");
    const where = link ? `${chat ? "link in the chat" : "link"} to ${link.attrs["href"] ?? "(no href)"}` : chat ? `text in ${describe(chat)}` : `page text in ${describe(ev.stack.at(-1) ?? { name: "body", attrs: {} })}`;
    for (const s of sentences(ev.text)) {
      const kind = classify(s, { inChat: chat !== void 0, linkHref: link?.attrs["href"] });
      if (kind)
        add({ kind, where, text: s, timing: chat ? "not known" : "before the first exchange" });
    }
  }
  const scriptRendered = visibleText < 300 && countScriptSrc(html) > 0;
  return { widgets: [...widgets.values()], chatElements, signals, checked, scriptRendered };
}
function countScriptSrc(html) {
  return (html.match(/<script[^>]+src=/gi) ?? []).length;
}
var KIND_ORDER = [
  "in-chat",
  "page-text",
  "assistant-only",
  "technology-only",
  "site-wide",
  "terms-only"
];
function sortSignals(signals) {
  return [...signals].sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
}

// src/site-report.ts
var expect = (id) => {
  const q = QUOTES[id];
  return {
    cite: q.cite,
    quote: q.text,
    source: SOURCES[q.source].url,
    ..."applies" in q ? { applies: q.applies } : {}
  };
};
var WEAK_QUOTE = {
  "assistant-only": "guidelines_ambiguous",
  "site-wide": "guidelines_generic",
  "terms-only": "guidelines_terms",
  "technology-only": "guidelines_technical"
};
function kb(bytes) {
  return bytes < 1024 ? `${bytes} bytes` : `${Math.round(bytes / 102.4) / 10} KB`;
}
function checkSite(input) {
  const f = analyseHtml(input.html);
  const signals = sortSignals(f.signals);
  const strong = signals.find((s) => s.kind === "in-chat");
  const page = signals.find((s) => s.kind === "page-text");
  const what = [
    `${kb(f.checked.bytes)} of HTML`,
    `${f.checked.textBlocks} text block${f.checked.textBlocks === 1 ? "" : "s"}`,
    `${f.checked.attributes} labels, titles and placeholders`,
    `${f.checked.inlineSettings} inline chat settings`
  ].join(", ");
  const headline = strong ? `disclosure found: ${strong.where}: "${strong.text}"` : page ? `disclosure found on the page, outside the chat interface: ${page.where}: "${page.text}"` : `no disclosure found in ${what}`;
  const expects = [expect("art50_1"), expect("art50_5")];
  for (const kind of new Set(signals.map((s) => s.kind))) {
    const id = WEAK_QUOTE[kind];
    if (id) expects.push(expect(id));
  }
  const cannot = [];
  if (f.widgets.length)
    cannot.push(
      `what ${f.widgets.map((w) => w.name).join(", ")} says at the first exchange: the vendor's script loads its greeting after the page loads, and this check fetches nothing but the page. Open the chat in a browser, or save the page once the chat is open and run the check on the saved file`
    );
  else
    cannot.push(
      "a chat widget that the site's own scripts add after the page loads: only widgets named in the HTML as served are seen. Open the chat in a browser, save the page, and run the check on the saved file"
    );
  if (f.scriptRendered)
    cannot.push(
      "most of this page is drawn by script after it loads, and the HTML as served carries little text: save the rendered page from a browser and run the check on the saved file"
    );
  cannot.push(
    "a voice or phone assistant, an email an agent sends, or a chat inside an app",
    "whether the system is in scope of Article 50(1), or whether its AI nature is already obvious to a reasonably well-informed person in context"
  );
  return {
    target: {
      source: input.source,
      name: input.name,
      ...input.finalUrl && input.finalUrl !== input.name ? { final_url: input.finalUrl } : {},
      ...input.status !== void 0 ? { status: input.status } : {},
      ...input.contentType ? { content_type: input.contentType } : {},
      bytes: input.bytes,
      ...input.truncated ? { truncated: true } : {}
    },
    widgets: f.widgets,
    chat_elements: f.chatElements,
    disclosure: { found: Boolean(strong || page), headline, in_chat_interface: Boolean(strong) },
    signals,
    checked: f.checked,
    script_rendered: f.scriptRendered,
    expects,
    cannot_check: cannot
  };
}

// src/version.ts
import { readFileSync } from "fs";
var cached;
function version() {
  if (cached !== void 0) return cached;
  try {
    cached = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
  } catch {
    cached = "0.0.0";
  }
  return cached;
}

// src/render.ts
var HANDOFF_LINE = "Keep a dated record of every check, and of every disclosure and marking you ship.";
var RECORD_URL = `${SITE}/ai-disclosure/record?ref=agent-disclosure`;
var NOT_ADVICE = "A readiness check, not legal advice: it reports what it found against what the law says, with the law's own words.";
var DAY = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC"
});
var shortDate = (iso) => DAY.format(/* @__PURE__ */ new Date(`${iso.slice(0, 10)}T00:00:00Z`)).replace("Sept", "Sep");
function wrap(text, indent, width = 96) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = "";
  for (const w of words) {
    if (cur && indent.length + cur.length + 1 + w.length > width) {
      lines.push(cur);
      cur = w;
    } else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) lines.push(cur);
  return lines.map((l, i) => i === 0 ? l : indent + l).join("\n");
}
function header(command, today) {
  return `agent-disclosure ${version()} \xB7 ${command} check \xB7 ${shortDate(today)}
${wrap(NOT_ADVICE, "")}
`;
}
function lawSection(expects) {
  const out = ["What the law says"];
  for (const e of expects) {
    const when = e.applies ? `, applies from ${shortDate(e.applies)}` : "";
    out.push(`  ${e.cite}${when}`);
    out.push(`    ${wrap(`\u201C${e.quote}\u201D`, "    ")}`);
  }
  return out.join("\n");
}
function cannotSection(items) {
  return ["What this check cannot see", ...items.map((c) => `  - ${wrap(c, "    ")}`)].join("\n");
}
function footer() {
  return [
    `Each obligation, with its dates and the law's text: ${PAGES_URL}?ref=agent-disclosure`,
    `A signed, dated readiness report for up to 10 URLs and 25 artefacts, as PDF and JSON ($49, one-time, no account): \`${INSTALL} report --help\``,
    `${HANDOFF_LINE} Not built yet; say you want it: ${RECORD_URL}`
  ].map((l) => wrap(l, "  ")).join("\n");
}
var KIND_LABEL = {
  "in-chat": "in the chat interface",
  "page-text": "on the page, outside the chat",
  "assistant-only": 'says "assistant", not AI',
  "technology-only": "names a technology only",
  "site-wide": "a site-wide statement",
  "terms-only": "only in a terms or policy link"
};
function fetchedLine(t, label) {
  if (t.source === "file")
    return `${t.name} (${label ? `${label}, ` : ""}${kb(t.bytes)}, read locally)`;
  const bits = [
    t.status !== void 0 ? String(t.status) : null,
    t.content_type?.split(";")[0] || null,
    label ?? null,
    kb(t.bytes),
    "one request"
  ].filter(Boolean);
  const moved = t.final_url ? `
          \u2192 ${t.final_url}` : "";
  return `${t.name} (${bits.join(", ")})${moved}${t.truncated ? "\n          (cut at the size limit; the rest was not read)" : ""}`;
}
function renderSiteText(r, today) {
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
        `  ${KIND_LABEL[s.kind].padEnd(32)} ${wrap(`${s.where} (${s.timing})`, " ".repeat(35))}`
      );
      out.push(`  ${" ".repeat(32)} ${wrap(`\u201C${s.text}\u201D`, " ".repeat(35))}`);
    }
    if (r.signals.length > 12)
      out.push(`  \u2026 and ${r.signals.length - 12} more (--json lists them all)`);
  }
  out.push("", lawSection(r.expects), "", cannotSection(r.cannot_check), "", footer(), "");
  return out.join("\n");
}
function row(label, value) {
  return `  ${label.padEnd(34)} ${wrap(value, " ".repeat(37))}`;
}
function renderOutputText(r, today) {
  const out = [header("output", today)];
  out.push(
    `${r.target.source === "file" ? "File" : "URL "}      ${fetchedLine(r.target, r.label)}`
  );
  out.push(`SHA-256   ${r.target.sha256}`, "");
  out.push("Machine-readable marking");
  const c = r.c2pa;
  const where = c.found ? `found: ${c.location}, ${c.manifests} manifest${c.manifests === 1 ? "" : "s"} (read, not validated)` : c.unread ? `present, not opened: ${c.unread}` : `not found (looked in: ${c.looked_in.join("; ") || "nothing this reader knows for this format"})`;
  out.push(row("C2PA manifest (signed metadata)", where));
  for (const ref of c.references)
    out.push(row("External manifest reference", `${ref.uri} (${ref.location}; not fetched)`));
  out.push(
    row(
      "AI generation declared in",
      r.marking.ai_declared_in.length ? r.marking.ai_declared_in.join("; ") : "nothing found"
    )
  );
  out.push(
    row(
      "Watermark",
      c.active?.watermark_declared ? `declared in the manifest${c.active.soft_bindings.length ? ` (${c.active.soft_bindings.join(", ")})` : ""}; this tool cannot read it` : "none declared; an imperceptible watermark cannot be seen without the generator's own detector"
    )
  );
  const x = r.xmp;
  const xmpBits = [
    x.digital_source_types.length ? `DigitalSourceType ${x.digital_source_types.map((t) => t.name).join(", ")}` : null,
    x.ai_system_used ? `AISystemUsed ${x.ai_system_used}${x.ai_system_version_used ? ` ${x.ai_system_version_used}` : ""}` : null,
    x.ai_prompt_information ? "AIPromptInformation present" : null
  ].filter(Boolean);
  out.push(
    row(
      "IPTC AI fields in XMP (unsigned)",
      xmpBits.length ? xmpBits.join("; ") : x.packets ? "none in the XMP" : "no XMP"
    )
  );
  const shown = r.hints.filter(
    (h) => h.names_ai_generator || /software|creatortool|generator|producer|encoder/i.test(h.field)
  );
  out.push(
    row(
      "Other unsigned fields",
      shown.length ? shown.map((h) => `${h.field}: ${h.value}`).join("; ") : "none naming a generator"
    )
  );
  if (r.text) {
    const n = invisibleTotal(r.text.invisible);
    out.push(row("C2PA text manifest wrapper", r.text.c2pa_text_wrapper ? "found" : "not found"));
    out.push(
      row(
        "Invisible characters",
        n ? `${n} (${Object.entries(r.text.invisible).filter(([, v]) => v).map(([k, v]) => `${v} ${k}`).join(", ")})` : "none"
      )
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
        a.signature.signer ? `${a.signature.signer}${a.signature.issuer ? `, issued by ${a.signature.issuer}` : ""}` : a.signature.present ? "a signature is present; no signer name read" : "no signature box"
      )
    );
    if (a.signature.alg || a.signature.time_stamped)
      out.push(
        row(
          "Signature",
          [a.signature.alg, a.signature.time_stamped ? "time-stamped" : "no time-stamp"].filter(Boolean).join(", ")
        )
      );
    for (const act of a.actions.slice(0, 6))
      out.push(
        row(
          "Action",
          `${act.action}${act.digitalSourceType ? `: ${act.digitalSourceType.split("/").pop()}` : ""}${act.softwareAgent ? ` by ${act.softwareAgent}` : ""}${act.when ? ` at ${act.when}` : ""}`
        )
      );
    if (a.ai_disclosure)
      out.push(
        row(
          "AI disclosure assertion",
          Object.entries(a.ai_disclosure).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(", ")
        )
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
        "not expected for free-form text: the code accepts the watermark alone"
      )
    );
  else out.push(row("1. Signed metadata (1.1.1)", r.marking.signed_metadata));
  out.push(
    row(
      `${freeText ? "" : "2. "}Imperceptible watermark (1.1.2)`,
      `not checkable from the file (declared in a manifest: ${c.active?.watermark_declared ? "yes" : "no"})`
    )
  );
  if (r.california) {
    out.push(
      "",
      "California latent disclosure, \xA7 22757.3(a)(1), from 2 Aug 2026: what the file shows"
    );
    for (const f of r.california.fields)
      out.push(row(f.name, f.seen ? `seen: ${f.from}` : "not seen"));
  }
  out.push("", lawSection(r.expects), "", cannotSection(r.cannot_check), "", footer(), "");
  return out.join("\n");
}
function envelope(command, today, reports) {
  return `${JSON.stringify(
    {
      tool: "agent-disclosure",
      version: version(),
      command,
      checked_at: today,
      not_legal_advice: NOT_ADVICE,
      reports,
      pages: PAGES_URL,
      handoff: { line: HANDOFF_LINE, url: RECORD_URL, built: false }
    },
    null,
    2
  )}
`;
}
function renderError(p, json) {
  if (json) return `${JSON.stringify({ error: p }, null, 2)}
`;
  return `agent-disclosure: ${p.code}: ${p.cause}
  fix: ${p.fix}${p.retryable ? "\n  (retrying may help)" : ""}
`;
}

// src/report.ts
import { createHash as createHash2, createPublicKey, verify as verifySig } from "crypto";
import { mkdir, readFile as readFile2, writeFile } from "fs/promises";
import { homedir } from "os";
import path2 from "path";

// src/fetch.ts
var USER_AGENT = () => `agent-disclosure/${version()} (+${REPO}; readiness check, one request)`;
function parseHttpUrl(raw) {
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:" ? u : null;
  } catch {
    return null;
  }
}
async function fetchOnce(raw, opts) {
  const url = parseHttpUrl(raw);
  if (!url)
    throw new CliError({
      code: "BAD_URL",
      cause: `${raw} is not an http or https URL`,
      fix: "pass a full URL such as https://example.com/, or a path to a local file",
      retryable: false
    });
  const doFetch = opts.fetch ?? fetch;
  let res;
  try {
    res = await doFetch(url.href, {
      redirect: "follow",
      signal: AbortSignal.timeout(opts.timeoutMs ?? 2e4),
      headers: {
        "user-agent": USER_AGENT(),
        accept: opts.accept ?? "*/*"
      }
    });
  } catch (e) {
    const timedOut = e instanceof Error && /abort|timeout/i.test(`${e.name} ${e.message}`);
    throw new CliError({
      code: timedOut ? "FETCH_TIMEOUT" : "FETCH_FAILED",
      cause: `${url.href} did not answer${timedOut ? " within 20 seconds" : ""}: ${e instanceof Error ? e.message : String(e)}`,
      fix: "check the URL opens in a browser from this machine; for a page behind a login, save it and pass the file instead",
      retryable: true
    });
  }
  const reader = res.body?.getReader();
  const chunks = [];
  let size = 0;
  let truncated = false;
  if (reader) {
    for (; ; ) {
      const { done, value } = await reader.read();
      if (done) break;
      if (size + value.length > opts.maxBytes) {
        chunks.push(value.subarray(0, opts.maxBytes - size));
        size = opts.maxBytes;
        truncated = true;
        await reader.cancel().catch(() => void 0);
        break;
      }
      chunks.push(value);
      size += value.length;
    }
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.length;
  }
  return {
    url: raw,
    finalUrl: res.url || url.href,
    status: res.status,
    contentType: (res.headers.get("content-type") ?? "").toLowerCase(),
    link: res.headers.get("link"),
    bytes,
    truncated
  };
}

// src/targets.ts
import { readFile, stat } from "fs/promises";
import path from "path";

// src/output/check.ts
import { createHash } from "crypto";

// src/output/containers.ts
import { inflateSync } from "zlib";

// src/output/jumbf.ts
import { brotliDecompressSync } from "zlib";

// src/output/cbor.ts
var Tagged = class {
  constructor(tag, value) {
    this.tag = tag;
    this.value = value;
  }
  tag;
  value;
};
var CborError = class extends Error {
};
function decodeCbor(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 0;
  const need = (n) => {
    if (n < 0 || pos + n > bytes.length) throw new CborError("CBOR runs past its end");
  };
  const readArg = (info) => {
    if (info < 24) return info;
    if (info === 24) {
      need(1);
      return bytes[pos++];
    }
    if (info === 25) {
      need(2);
      const v = view.getUint16(pos);
      pos += 2;
      return v;
    }
    if (info === 26) {
      need(4);
      const v = view.getUint32(pos);
      pos += 4;
      return v;
    }
    if (info === 27) {
      need(8);
      const v = view.getBigUint64(pos);
      pos += 8;
      return v <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(v) : v;
    }
    if (info === 31) return null;
    throw new CborError(`reserved additional info ${info}`);
  };
  const text = new TextDecoder("utf-8", { fatal: false });
  const item = (depth) => {
    if (depth > 64) throw new CborError("CBOR nested too deeply");
    need(1);
    const first = bytes[pos++];
    const major = first >> 5;
    const info = first & 31;
    if (major === 7) {
      if (info === 20) return false;
      if (info === 21) return true;
      if (info === 22) return null;
      if (info === 23) return void 0;
      if (info === 25) {
        need(2);
        const h = view.getUint16(pos);
        pos += 2;
        return halfToNumber(h);
      }
      if (info === 26) {
        need(4);
        const v = view.getFloat32(pos);
        pos += 4;
        return v;
      }
      if (info === 27) {
        need(8);
        const v = view.getFloat64(pos);
        pos += 8;
        return v;
      }
      if (info < 24) return info;
      if (info === 24) {
        need(1);
        return bytes[pos++];
      }
      throw new CborError("unexpected break");
    }
    const arg = readArg(info);
    switch (major) {
      case 0:
        return arg;
      case 1:
        return typeof arg === "bigint" ? -1n - arg : -1 - arg;
      case 2:
      case 3: {
        let out;
        if (arg === null) {
          const parts = [];
          for (; ; ) {
            need(1);
            if (bytes[pos] === 255) {
              pos++;
              break;
            }
            const part = item(depth + 1);
            if (!(part instanceof Uint8Array) && typeof part !== "string")
              throw new CborError("bad chunk in an indefinite string");
            parts.push(typeof part === "string" ? new TextEncoder().encode(part) : part);
          }
          const len = parts.reduce((s, p) => s + p.length, 0);
          out = new Uint8Array(len);
          let at = 0;
          for (const p of parts) {
            out.set(p, at);
            at += p.length;
          }
        } else {
          const len = Number(arg);
          need(len);
          out = bytes.subarray(pos, pos + len);
          pos += len;
        }
        return major === 2 ? out : text.decode(out);
      }
      case 4: {
        const arr = [];
        if (arg === null) {
          for (; ; ) {
            need(1);
            if (bytes[pos] === 255) {
              pos++;
              break;
            }
            arr.push(item(depth + 1));
          }
        } else {
          const len = Number(arg);
          if (len > bytes.length) throw new CborError("array longer than its input");
          for (let i = 0; i < len; i++) arr.push(item(depth + 1));
        }
        return arr;
      }
      case 5: {
        const obj = {};
        const entry = () => {
          const k = item(depth + 1);
          const v = item(depth + 1);
          obj[typeof k === "string" ? k : String(k)] = v;
        };
        if (arg === null) {
          for (; ; ) {
            need(1);
            if (bytes[pos] === 255) {
              pos++;
              break;
            }
            entry();
          }
        } else {
          const len = Number(arg);
          if (len > bytes.length) throw new CborError("map longer than its input");
          for (let i = 0; i < len; i++) entry();
        }
        return obj;
      }
      case 6:
        return new Tagged(Number(arg), item(depth + 1));
      default:
        throw new CborError(`major type ${major}`);
    }
  };
  return item(0);
}
function halfToNumber(h) {
  const s = h & 32768 ? -1 : 1;
  const e = h >> 10 & 31;
  const f = h & 1023;
  if (e === 0) return s * 2 ** -14 * (f / 1024);
  if (e === 31) return f ? NaN : s * Infinity;
  return s * 2 ** (e - 15) * (1 + f / 1024);
}
function isTagged(v) {
  return v instanceof Tagged;
}
function asMap(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v) && !(v instanceof Uint8Array) && !isTagged(v) ? v : void 0;
}
function asString(v) {
  return typeof v === "string" ? v : void 0;
}

// src/output/der.ts
function readTlv(b, at) {
  if (at + 2 > b.length) return null;
  const tag = b[at];
  let len = b[at + 1];
  let p = at + 2;
  if (len & 128) {
    const n = len & 127;
    if (n === 0 || n > 4 || p + n > b.length) return null;
    len = 0;
    for (let i = 0; i < n; i++) len = len * 256 + b[p + i];
    p += n;
  }
  if (p + len > b.length) return null;
  return { tag, start: p, end: p + len };
}
function children(b, t) {
  const out = [];
  let at = t.start;
  while (at < t.end) {
    const c = readTlv(b, at);
    if (!c) break;
    out.push(c);
    at = c.end;
  }
  return out;
}
var OIDS = {
  "2.5.4.3": "CN",
  "2.5.4.10": "O",
  "2.5.4.6": "C",
  "2.5.4.11": "OU"
};
function oid(b, t) {
  const bytes = b.subarray(t.start, t.end);
  if (bytes.length === 0) return "";
  const parts = [Math.floor(bytes[0] / 40), bytes[0] % 40];
  let v = 0;
  for (let i = 1; i < bytes.length; i++) {
    v = v * 128 + (bytes[i] & 127);
    if (!(bytes[i] & 128)) {
      parts.push(v);
      v = 0;
    }
  }
  return parts.join(".");
}
function certificateNames(der) {
  const cert = readTlv(der, 0);
  if (!cert || cert.tag !== 48) return null;
  const [tbs] = children(der, cert);
  if (!tbs || tbs.tag !== 48) return null;
  const fields = children(der, tbs);
  const offset = fields[0]?.tag === 160 ? 1 : 0;
  const issuer = fields[offset + 2];
  const subject = fields[offset + 4];
  if (!issuer || !subject) return null;
  return { subject: readName(der, subject), issuer: readName(der, issuer) };
}
function readName(b, name2) {
  const out = {};
  for (const set of children(b, name2)) {
    for (const atv of children(b, set)) {
      const [o, value] = children(b, atv);
      if (!o || !value || o.tag !== 6) continue;
      const key = OIDS[oid(b, o)];
      if (!key || out[key]) continue;
      out[key] = new TextDecoder().decode(b.subarray(value.start, value.end));
    }
  }
  return out;
}

// src/output/jumbf.ts
var LATIN1 = new TextDecoder("latin1");
var latin1 = (b) => LATIN1.decode(b);
function readBoxes(b) {
  const out = [];
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let at = 0;
  while (at + 8 <= b.length) {
    let size = view.getUint32(at);
    const type = latin1(b.subarray(at + 4, at + 8));
    let header2 = 8;
    if (size === 1) {
      if (at + 16 > b.length) break;
      const big = view.getBigUint64(at + 8);
      if (big > BigInt(b.length)) break;
      size = Number(big);
      header2 = 16;
    } else if (size === 0) size = b.length - at;
    if (size < header2 || at + size > b.length) break;
    out.push({ type, data: b.subarray(at + header2, at + size) });
    at += size;
  }
  return out;
}
function readSuperbox(data) {
  const boxes = readBoxes(data);
  const desc = boxes[0];
  if (!desc || desc.type !== "jumd" || desc.data.length < 17) return null;
  const uuid = [...desc.data.subarray(0, 16)].map((x) => x.toString(16).padStart(2, "0")).join("");
  const toggles = desc.data[16];
  let label = "";
  if (toggles & 2) {
    const rest = desc.data.subarray(17);
    const nul = rest.indexOf(0);
    label = new TextDecoder().decode(nul < 0 ? rest : rest.subarray(0, nul));
  }
  return { uuid, label, children: boxes.slice(1) };
}
var TAIL = "00110010800000aa00389b71";
var UUID = {
  store: `63327061${TAIL}`,
  // c2pa
  manifest: `63326d61${TAIL}`,
  // c2ma
  update: `6332756d${TAIL}`,
  // c2um
  assertions: `63326173${TAIL}`,
  // c2as
  claim: `6332636c${TAIL}`,
  // c2cl
  signature: `63326373${TAIL}`
  // c2cs
};
var STORE_SIGNATURE = Uint8Array.from([
  106,
  117,
  109,
  100,
  99,
  50,
  112,
  97,
  0,
  17,
  0,
  16,
  128,
  0,
  0,
  170,
  0,
  56,
  155,
  113
]);
var ALGS = {
  "-7": "ES256",
  "-35": "ES384",
  "-36": "ES512",
  "-37": "PS256",
  "-38": "PS384",
  "-39": "PS512",
  "-8": "Ed25519"
};
var DST = /^https?:\/\/cv\.iptc\.org\/newscodes\/digitalsourcetype\/[A-Za-z]+$/;
function generatorName(v) {
  if (typeof v === "string") return v;
  const m = asMap(v);
  if (m) {
    const name2 = asString(m["name"]);
    const ver = asString(m["version"]);
    return name2 ? ver ? `${name2} ${ver}` : name2 : void 0;
  }
  if (Array.isArray(v)) return v.map(generatorName).filter(Boolean).join(", ") || void 0;
  return void 0;
}
function contentOf(sb) {
  for (const c of sb.children) {
    try {
      if (c.type === "cbor") return decodeCbor(c.data);
      if (c.type === "json") return JSON.parse(new TextDecoder().decode(c.data));
    } catch {
      return void 0;
    }
  }
  return void 0;
}
function sourceTypesIn(v, out, depth = 0) {
  if (v === void 0 || v === null || depth > 20) return;
  if (typeof v === "string") {
    if (DST.test(v)) out.add(v);
  } else if (Array.isArray(v)) for (const x of v) sourceTypesIn(x, out, depth + 1);
  else if (isTagged(v)) sourceTypesIn(v.value, out, depth + 1);
  else if (typeof v === "object" && !(v instanceof Uint8Array))
    for (const x of Object.values(v)) sourceTypesIn(x, out, depth + 1);
}
function readSignature(sb) {
  const out = { present: true, timeStamped: false };
  let v;
  try {
    v = contentOf(sb);
  } catch {
    return out;
  }
  const arr = isTagged(v ?? null) ? v.value : v;
  if (!Array.isArray(arr) || arr.length < 4) return out;
  const headers = [];
  if (arr[0] instanceof Uint8Array && arr[0].length > 0) {
    try {
      const m = asMap(decodeCbor(arr[0]));
      if (m) headers.push(m);
    } catch {
    }
  }
  const unprotected = asMap(arr[1] ?? null);
  if (unprotected) headers.push(unprotected);
  for (const h of headers) {
    if (h["1"] !== void 0 && out.alg === void 0)
      out.alg = ALGS[String(h["1"])] ?? String(h["1"]);
    const chain = h["33"] ?? h["x5chain"];
    const first = Array.isArray(chain) ? chain[0] : chain;
    if (first instanceof Uint8Array && !out.signer) {
      const names = certificateNames(first);
      if (names) {
        out.signer = names.subject;
        out.issuer = names.issuer;
      }
    }
    if (h["sigTst"] !== void 0 || h["sigTst2"] !== void 0) out.timeStamped = true;
  }
  return out;
}
function readManifest(sb) {
  const m = {
    label: sb.label,
    update: sb.uuid === UUID.update,
    signature: { present: false, timeStamped: false },
    assertions: [],
    actions: [],
    digitalSourceTypes: [],
    softBindings: [],
    watermarkDeclared: false,
    compressed: false
  };
  let children2 = sb.children;
  const brob = children2.find((c) => c.type === "brob");
  if (brob) {
    try {
      children2 = readBoxes(new Uint8Array(brotliDecompressSync(brob.data.subarray(4))));
    } catch {
      m.compressed = true;
      return m;
    }
  }
  const dst = /* @__PURE__ */ new Set();
  for (const c of children2) {
    if (c.type !== "jumb") continue;
    const child = readSuperbox(c.data);
    if (!child) continue;
    if (child.uuid === UUID.claim) {
      const claim = asMap(contentOf(child) ?? null);
      if (claim) {
        m.claimGenerator = generatorName(claim["claim_generator_info"] ?? null) ?? asString(claim["claim_generator"]);
        m.instanceId = asString(claim["instanceID"]);
        m.title = asString(claim["dc:title"]);
      }
    } else if (child.uuid === UUID.signature) {
      m.signature = readSignature(child);
    } else if (child.uuid === UUID.assertions) {
      for (const a of child.children) {
        if (a.type !== "jumb") continue;
        const assertion = readSuperbox(a.data);
        if (!assertion) continue;
        const label = assertion.label;
        m.assertions.push(label);
        const base = label.replace(/__\d+$/, "");
        sourceTypesIn(contentOf(assertion), dst);
        if (base === "c2pa.actions" || base === "c2pa.actions.v2") {
          const value = asMap(contentOf(assertion) ?? null);
          const actions = Array.isArray(value?.["actions"]) ? value["actions"] : [];
          for (const raw of actions.slice(0, 50)) {
            const act = asMap(raw);
            if (!act) continue;
            const action = asString(act["action"]) ?? "";
            const summary = { action };
            const d = asString(act["digitalSourceType"]);
            if (d) {
              summary.digitalSourceType = d;
              dst.add(d);
            }
            const agent = generatorName(act["softwareAgent"] ?? null);
            if (agent) summary.softwareAgent = agent;
            const when = asString(act["when"]);
            if (when) summary.when = when;
            if (action.startsWith("c2pa.watermarked")) m.watermarkDeclared = true;
            m.actions.push(summary);
          }
        } else if (base === "c2pa.soft-binding") {
          const value = asMap(contentOf(assertion) ?? null);
          m.softBindings.push(asString(value?.["alg"] ?? null) ?? "unnamed algorithm");
          m.watermarkDeclared = true;
        } else if (base === "c2pa.ai-disclosure") {
          const value = asMap(contentOf(assertion) ?? null);
          const profile = asMap(value?.["contentProfile"] ?? null);
          m.aiDisclosure = {
            modelType: asString(value?.["modelType"] ?? null),
            modelName: asString(value?.["modelName"] ?? null),
            modelIdentifier: asString(value?.["modelIdentifier"] ?? null),
            humanOversightLevel: asString(profile?.["humanOversightLevel"] ?? null)
          };
        }
      }
    }
  }
  m.digitalSourceTypes = [...dst];
  return m;
}
function summariseStore(bytes) {
  const problems = [];
  const top = readBoxes(bytes).find((b) => b.type === "jumb");
  const store = top ? readSuperbox(top.data) : null;
  if (!store || store.uuid !== UUID.store) {
    return { manifests: [], problems: ["the C2PA box could not be read as a Manifest Store"] };
  }
  const manifests = [];
  for (const c of store.children) {
    if (c.type !== "jumb") continue;
    const sb = readSuperbox(c.data);
    if (!sb || sb.uuid !== UUID.manifest && sb.uuid !== UUID.update) continue;
    try {
      manifests.push(readManifest(sb));
    } catch (e) {
      problems.push(`a manifest could not be read: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (manifests.length === 0)
    problems.push("the Manifest Store holds no manifest this reader could open");
  return { manifests, active: manifests.at(-1), problems };
}

// src/output/xmp.ts
var NS = {
  iptcExt: "http://iptc.org/std/Iptc4xmpExt/2008-02-29/",
  dcterms: "http://purl.org/dc/terms/",
  xmp: "http://ns.adobe.com/xap/1.0/",
  photoshop: "http://ns.adobe.com/photoshop/1.0/"
};
function findXmpPackets(bytes) {
  const latin = new TextDecoder("latin1").decode(bytes);
  const out = [];
  let at = 0;
  while (out.length < 20) {
    const start = latin.indexOf("<x:xmpmeta", at);
    if (start < 0) break;
    const end = latin.indexOf("</x:xmpmeta>", start);
    if (end < 0) break;
    out.push(new TextDecoder().decode(bytes.subarray(start, end + "</x:xmpmeta>".length)));
    at = end + 1;
  }
  if (out.length === 0) {
    const start = latin.indexOf("<rdf:RDF");
    const end = latin.indexOf("</rdf:RDF>", start);
    if (start >= 0 && end > start)
      out.push(new TextDecoder().decode(bytes.subarray(start, end + "</rdf:RDF>".length)));
  }
  return out;
}
function prefixesFor(xml, ns) {
  const out = /* @__PURE__ */ new Set();
  for (const m of xml.matchAll(/xmlns:([\w.-]+)\s*=\s*["']([^"']+)["']/g))
    if (m[2] === ns) out.add(m[1]);
  return [...out];
}
var esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function valuesOf(xml, ns, name2) {
  const values = [];
  for (const p of prefixesFor(xml, ns)) {
    const q = `${esc(p)}:${esc(name2)}`;
    for (const m of xml.matchAll(new RegExp(`\\s${q}\\s*=\\s*"([^"]*)"`, "g"))) values.push(m[1]);
    for (const m of xml.matchAll(new RegExp(`\\s${q}\\s*=\\s*'([^']*)'`, "g"))) values.push(m[1]);
    for (const m of xml.matchAll(new RegExp(`<${q}\\b([^>]*?)(/?)>`, "g"))) {
      const res = /rdf:resource\s*=\s*["']([^"']*)["']/.exec(m[1]);
      if (res) {
        values.push(res[1]);
        continue;
      }
      if (m[2] === "/") continue;
      const startAt = m.index + m[0].length;
      const end = xml.indexOf(`</${p}:${name2}>`, startAt);
      if (end < 0) continue;
      const inner = xml.slice(startAt, end);
      const items = [...inner.matchAll(/<rdf:li\b[^>]*>([\s\S]*?)<\/rdf:li>/g)].map((x) => x[1]);
      for (const v of items.length ? items : [inner]) values.push(v.replace(/<[^>]+>/g, ""));
    }
  }
  return values.map((v) => decodeEntities(v).trim()).filter(Boolean);
}
function readXmp(packets) {
  const out = {
    packets: packets.length,
    digitalSourceTypes: [],
    aiPromptInformation: false,
    aiPromptWriterName: false
  };
  const dst = /* @__PURE__ */ new Set();
  for (const xml of packets) {
    for (const v of valuesOf(xml, NS.iptcExt, "DigitalSourceType")) dst.add(v);
    out.aiSystemUsed ??= valuesOf(xml, NS.iptcExt, "AISystemUsed")[0];
    out.aiSystemVersionUsed ??= valuesOf(xml, NS.iptcExt, "AISystemVersionUsed")[0];
    if (valuesOf(xml, NS.iptcExt, "AIPromptInformation").length) out.aiPromptInformation = true;
    if (valuesOf(xml, NS.iptcExt, "AIPromptWriterName").length) out.aiPromptWriterName = true;
    out.provenance ??= valuesOf(xml, NS.dcterms, "provenance")[0];
    out.creatorTool ??= valuesOf(xml, NS.xmp, "CreatorTool")[0];
    out.credit ??= valuesOf(xml, NS.photoshop, "Credit")[0];
  }
  out.digitalSourceTypes = [...dst];
  return out;
}

// src/output/containers.ts
var LATIN12 = new TextDecoder("latin1");
var UTF8 = new TextDecoder();
var ascii = (b, at, n) => LATIN12.decode(b.subarray(at, at + n));
var starts = (b, s, at = 0) => {
  if (at + s.length > b.length) return false;
  for (let i = 0; i < s.length; i++) if (b[at + i] !== s.charCodeAt(i)) return false;
  return true;
};
function indexOfBytes(hay, needle, from = 0) {
  outer: for (let i = from; i <= hay.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}
function concat(parts) {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
function trimHint(field, raw) {
  const value = raw.replace(/\0+$/, "").replace(/\s+/g, " ").trim();
  if (/^(parameters|prompt|workflow|comment|usercomment)$/i.test(field) && value.length > 80)
    return {
      field,
      value: `${value.length} characters${generatorIn(value) ? `, naming ${generatorIn(value)}` : ""}`
    };
  return { field, value: value.length > 120 ? `${value.slice(0, 117)}\u2026` : value };
}
var GENERATORS = /midjourney|dall[·\-\s]?e|stable[ -]?diffusion|sdxl|comfyui|automatic1111|novelai|firefly|imagen|gemini|made with google ai|google ai|openai|chatgpt|gpt-image|sora|veo|runway|pika|luma|flux|black forest labs|ideogram|leonardo|kling|hailuo|elevenlabs|suno|udio|synthesia|heygen|grok|aurora|recraft|krea|playground/i;
function generatorIn(value) {
  return GENERATORS.exec(value)?.[0];
}
function readTiff(b, base = 0) {
  if (b.length < base + 8) return null;
  const le = starts(b, "II", base);
  if (!le && !starts(b, "MM", base)) return null;
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const u16 = (at) => view.getUint16(base + at, le);
  const u32 = (at) => view.getUint32(base + at, le);
  if (u16(2) !== 42) return null;
  const SIZES = {
    1: 1,
    2: 1,
    3: 2,
    4: 4,
    5: 8,
    6: 1,
    7: 1,
    8: 2,
    9: 4,
    10: 8,
    11: 4,
    12: 8,
    13: 4
  };
  const ifds = [];
  const read = (off2) => {
    if (off2 <= 0 || base + off2 + 2 > b.length) return null;
    const n = u16(off2);
    if (n > 1e3 || base + off2 + 2 + n * 12 + 4 > b.length) return null;
    const entries = /* @__PURE__ */ new Map();
    const sub = [];
    for (let i = 0; i < n; i++) {
      const e = off2 + 2 + i * 12;
      const tag = u16(e);
      const type = u16(e + 2);
      const count = u32(e + 4);
      const size = (SIZES[type] ?? 1) * count;
      const at = size <= 4 ? e + 8 : u32(e + 8);
      if (base + at + size > b.length || size > b.length) continue;
      entries.set(tag, b.subarray(base + at, base + at + size));
      if (tag === 34665 && count === 1) sub.push(u32(e + 8));
    }
    return { entries, next: u32(off2 + 2 + n * 12), sub };
  };
  let off = u32(4);
  const seen = /* @__PURE__ */ new Set();
  while (off && !seen.has(off) && ifds.length < 50) {
    seen.add(off);
    const ifd = read(off);
    if (!ifd) break;
    ifds.push(ifd);
    for (const s of ifd.sub) {
      const exif = read(s);
      if (exif) ifds.push({ ...exif, next: 0 });
    }
    off = ifd.next;
  }
  return { ifds };
}
var TIFF_TEXT = {
  305: "Software",
  270: "ImageDescription",
  315: "Artist",
  37510: "UserComment"
};
function tiffFindings(b, base, x, where) {
  const t = readTiff(b, base);
  if (!t) return;
  for (const ifd of t.ifds) {
    const c2pa = ifd.entries.get(52545);
    if (c2pa) x.stores.push({ location: `${where} tag 52545`, bytes: c2pa });
    const xmp = ifd.entries.get(700);
    if (xmp) x.xmp.push(UTF8.decode(xmp));
    for (const [tag, field] of Object.entries(TIFF_TEXT)) {
      const v = ifd.entries.get(Number(tag));
      if (!v) continue;
      const text = Number(tag) === 37510 ? UTF8.decode(v.subarray(8)) : LATIN12.decode(v);
      if (text.replace(/\0/g, "").trim()) x.hints.push(trimHint(field, text));
    }
  }
}
function jpeg(b, x) {
  x.looked.push("JPEG APP11 segments");
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const app11 = /* @__PURE__ */ new Map();
  const extended = [];
  let at = 2;
  while (at + 4 <= b.length && b[at] === 255) {
    const marker = b[at + 1];
    if (marker === 217 || marker === 218) break;
    if (marker === 1 || marker >= 208 && marker <= 215 || marker === 255) {
      at += marker === 255 ? 1 : 2;
      continue;
    }
    const len = view.getUint16(at + 2);
    const p = b.subarray(at + 4, at + 2 + len);
    if (marker === 235 && p.length > 8 && p[0] === 74 && p[1] === 80) {
      const en = p[2] << 8 | p[3];
      const seq = new DataView(p.buffer, p.byteOffset, p.byteLength).getUint32(4);
      const list = app11.get(en) ?? [];
      list.push({ seq, data: p.subarray(8) });
      app11.set(en, list);
    } else if (marker === 225) {
      const xmpHead = "http://ns.adobe.com/xap/1.0/\0";
      const extHead = "http://ns.adobe.com/xmp/extension/\0";
      if (starts(p, xmpHead)) x.xmp.push(UTF8.decode(p.subarray(xmpHead.length)));
      else if (starts(p, extHead)) extended.push(p.subarray(extHead.length + 32 + 8));
      else if (starts(p, "Exif\0\0")) tiffFindings(p, 6, x, "EXIF");
    } else if (marker === 254) {
      const text = LATIN12.decode(p);
      if (text.trim()) x.hints.push(trimHint("Comment", text));
    }
    at += 2 + len;
  }
  if (extended.length) x.xmp.push(UTF8.decode(concat(extended)));
  for (const [, parts] of app11) {
    parts.sort((a, c) => a.seq - c.seq);
    const first = parts[0].data;
    const lbox = first.length >= 8 ? new DataView(first.buffer, first.byteOffset).getUint32(0) : 0;
    const headerLen = lbox === 1 ? 16 : 8;
    const bytes = concat([first, ...parts.slice(1).map((s) => s.data.subarray(headerLen))]);
    if (ascii(bytes, 4, 4) === "jumb") x.stores.push({ location: "JPEG APP11 segments", bytes });
  }
}
function png(b, x) {
  x.looked.push("PNG caBX chunk");
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let at = 8;
  while (at + 12 <= b.length) {
    const len = view.getUint32(at);
    const type = ascii(b, at + 4, 4);
    if (at + 12 + len > b.length) break;
    const d = b.subarray(at + 8, at + 8 + len);
    if (type === "caBX") x.stores.push({ location: "PNG caBX chunk", bytes: d });
    else if (type === "tEXt" || type === "zTXt" || type === "iTXt") {
      const nul = d.indexOf(0);
      const keyword = LATIN12.decode(d.subarray(0, nul < 0 ? d.length : nul));
      let text;
      try {
        if (type === "tEXt") text = LATIN12.decode(d.subarray(nul + 1));
        else if (type === "zTXt") text = LATIN12.decode(inflateSync(d.subarray(nul + 2)));
        else {
          const compressed = d[nul + 1] === 1;
          let p = nul + 3;
          p = d.indexOf(0, p) + 1;
          p = d.indexOf(0, p) + 1;
          const body = d.subarray(p);
          text = UTF8.decode(compressed ? inflateSync(body) : body);
        }
      } catch {
        text = "";
      }
      if (keyword === "XML:com.adobe.xmp") x.xmp.push(text);
      else if (text.trim()) x.hints.push(trimHint(keyword, text));
    } else if (type === "eXIf") tiffFindings(d, 0, x, "PNG eXIf");
    if (type === "IEND") break;
    at += 12 + len;
  }
}
function riff(b, x) {
  x.looked.push("RIFF C2PA chunk");
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const walk = (start, end, depth) => {
    let at = start;
    while (at + 8 <= end) {
      const id = ascii(b, at, 4);
      const size = view.getUint32(at + 4, true);
      const d = b.subarray(at + 8, Math.min(end, at + 8 + size));
      if (id === "C2PA") x.stores.push({ location: "RIFF C2PA chunk", bytes: d });
      else if (id === "XMP " || id === "_PMX") x.xmp.push(UTF8.decode(d));
      else if (id === "EXIF") tiffFindings(d, starts(d, "Exif\0\0") ? 6 : 0, x, "WebP EXIF");
      else if (id === "LIST" && depth < 3) walk(at + 12, at + 8 + size, depth + 1);
      else if (id === "ISFT" || id === "ICMT")
        x.hints.push(trimHint(id === "ISFT" ? "Software" : "Comment", LATIN12.decode(d)));
      at += 8 + size + (size & 1);
    }
  };
  walk(12, b.length, 0);
}
function gif(b, x) {
  x.looked.push("GIF C2PA_GIF application extension");
  let at = 13;
  const flags = b[10] ?? 0;
  if (flags & 128) at += 3 * 2 ** ((flags & 7) + 1);
  while (at < b.length) {
    const intro = b[at];
    if (intro !== 33) break;
    const label = b[at + 1];
    at += 2;
    let appId = "";
    if (label === 255 && b[at] === 11) {
      appId = ascii(b, at + 1, 8);
      at += 12;
    }
    const blocks = [];
    while (at < b.length && b[at] !== 0) {
      const n = b[at];
      blocks.push(b.subarray(at + 1, at + 1 + n));
      at += 1 + n;
    }
    at += 1;
    if (appId === "C2PA_GIF")
      x.stores.push({ location: "GIF C2PA_GIF application extension", bytes: concat(blocks) });
    else if (label === 254) x.hints.push(trimHint("Comment", LATIN12.decode(concat(blocks))));
  }
}
var C2PA_UUID_BMFF = "d8fec3d61b0e483c92975828877ec481";
var XMP_UUID_BMFF = "be7acfcb97a942e89c71999491e3afac";
function bmff(b, x) {
  x.looked.push("ISO BMFF C2PA uuid box");
  for (const box of readBoxes(b)) {
    if (box.type !== "uuid" || box.data.length < 16) continue;
    const id = [...box.data.subarray(0, 16)].map((v) => v.toString(16).padStart(2, "0")).join("");
    const rest = box.data.subarray(16);
    if (id === XMP_UUID_BMFF) x.xmp.push(UTF8.decode(rest));
    if (id !== C2PA_UUID_BMFF || rest.length < 5) continue;
    const afterFlags = rest.subarray(4);
    const nul = afterFlags.indexOf(0);
    const purpose = LATIN12.decode(afterFlags.subarray(0, nul < 0 ? 0 : nul));
    let data = afterFlags.subarray(nul + 1);
    if (purpose === "manifest" || purpose === "original") data = data.subarray(8);
    if (purpose === "manifest" || purpose === "original" || purpose === "update")
      x.stores.push({ location: `ISO BMFF uuid box (${purpose})`, bytes: data });
  }
}
function id3(b, x) {
  x.looked.push("ID3 GEOB frame");
  if (!starts(b, "ID3") || b.length < 10) return 0;
  const major = b[3];
  const syncsafe = (at2) => (b[at2] & 127) << 21 | (b[at2 + 1] & 127) << 14 | (b[at2 + 2] & 127) << 7 | b[at2 + 3] & 127;
  const size = syncsafe(6);
  const end = Math.min(b.length, 10 + size);
  if (major < 3) return end;
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let at = 10;
  while (at + 10 <= end) {
    const id = ascii(b, at, 4);
    if (!/^[A-Z0-9]{4}$/.test(id)) break;
    const len = major === 4 ? syncsafe(at + 4) : view.getUint32(at + 4);
    const d = b.subarray(at + 10, Math.min(end, at + 10 + len));
    if (id === "GEOB") {
      const enc = d[0];
      const mimeEnd = d.indexOf(0, 1);
      const mime = LATIN12.decode(d.subarray(1, mimeEnd));
      const terminator = (from) => {
        if (enc === 1 || enc === 2) {
          for (let i2 = from; i2 + 1 < d.length; i2 += 2)
            if (d[i2] === 0 && d[i2 + 1] === 0) return i2 + 2;
          return d.length;
        }
        const i = d.indexOf(0, from);
        return i < 0 ? d.length : i + 1;
      };
      const afterName = terminator(mimeEnd + 1);
      const afterDesc = terminator(afterName);
      if (/^application\/(?:x-c2pa-manifest-store|c2pa)$/i.test(mime))
        x.stores.push({ location: "ID3 GEOB frame", bytes: d.subarray(afterDesc) });
    } else if (id === "PRIV" && starts(d, "XMP\0")) x.xmp.push(UTF8.decode(d.subarray(4)));
    else if (id === "TSSE" || id === "TENC" || id === "COMM" || id === "TXXX") {
      const text = d[0] === 1 || d[0] === 2 ? new TextDecoder("utf-16").decode(d.subarray(1)) : UTF8.decode(d.subarray(1));
      if (text.replace(/\0/g, "").trim())
        x.hints.push(
          trimHint(id === "TSSE" || id === "TENC" ? "Encoder" : id, text.replace(/\0/g, " "))
        );
    }
    at += 10 + len;
  }
  return end;
}
function ogg(b, x) {
  x.looked.push("Ogg C2PA logical stream");
  const streams = /* @__PURE__ */ new Map();
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let at = 0;
  while (at + 27 <= b.length && starts(b, "OggS", at)) {
    const serial = view.getUint32(at + 14, true);
    const segs = b[at + 26];
    let len = 0;
    for (let i = 0; i < segs; i++) len += b[at + 27 + i];
    const start = at + 27 + segs;
    const list = streams.get(serial) ?? [];
    list.push(b.subarray(start, start + len));
    streams.set(serial, list);
    at = start + len;
  }
  for (const parts of streams.values()) {
    const data = concat(parts);
    if (data[0] === 0 && starts(data, "c2pa", 1))
      x.stores.push({ location: "Ogg C2PA logical stream", bytes: data.subarray(5) });
  }
}
function pdfStream(b, text, n) {
  const objRe = new RegExp(`(?:^|[\\s>])${n}\\s+0\\s+obj\\b`, "g");
  const found = objRe.exec(text);
  if (!found) return null;
  const objStart = found.index;
  const streamAt = text.indexOf("stream", objStart);
  const endObj = text.indexOf("endobj", objStart);
  if (streamAt < 0 || endObj >= 0 && streamAt > endObj) return null;
  const dict = text.slice(objStart, streamAt);
  let start = streamAt + "stream".length;
  if (text[start] === "\r") start++;
  if (text[start] === "\n") start++;
  let length;
  const direct = /\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(dict);
  const indirect = /\/Length\s+(\d+)\s+0\s+R/.exec(dict);
  if (direct) length = Number(direct[1]);
  else if (indirect) {
    const ref = new RegExp(`(?:^|\\s)${indirect[1]}\\s+0\\s+obj\\s*(\\d+)`).exec(text);
    if (ref) length = Number(ref[1]);
  }
  const end = length !== void 0 ? start + length : text.indexOf("endstream", start);
  if (end <= start || end > b.length) return null;
  const raw = b.subarray(start, end);
  try {
    if (/\/FlateDecode/.test(dict)) return new Uint8Array(inflateSync(raw));
    return /\/Filter/.test(dict) ? null : raw;
  } catch {
    return null;
  }
}
function pdf(b, x) {
  x.looked.push("PDF embedded file (AFRelationship C2PA_Manifest)");
  const text = LATIN12.decode(b);
  for (const m of text.matchAll(/\/(Producer|Creator)\s*\(([^)]{1,200})\)/g))
    x.hints.push(trimHint(m[1], m[2]));
  const objects = /* @__PURE__ */ new Set();
  for (const m of text.matchAll(/\/AFRelationship\s*\/C2PA_Manifest/g)) {
    const dictStart = text.lastIndexOf("obj", m.index);
    const dictEnd = text.indexOf("endobj", m.index);
    const dict = text.slice(dictStart, dictEnd < 0 ? void 0 : dictEnd);
    const ef = /\/EF\s*<<[^>]*?\/(?:UF|F)\s+(\d+)\s+0\s+R/.exec(dict);
    if (ef) objects.add(Number(ef[1]));
  }
  for (const m of text.matchAll(/\/Subtype\s*\/application#2[Ff]c2pa/g)) {
    const head = /(\d+)\s+0\s+obj\b(?![\s\S]*\bobj\b)/.exec(
      text.slice(Math.max(0, m.index - 2e3), m.index)
    );
    if (head) objects.add(Number(head[1]));
  }
  for (const n of objects) {
    const data = pdfStream(b, text, n);
    if (data && ascii(data, 4, 4) === "jumb") {
      x.stores.push({ location: "PDF embedded file (C2PA_Manifest)", bytes: data });
      return;
    }
  }
  if (objects.size)
    x.unreadStore = "a PDF embedded file marked as a C2PA Manifest Store (not opened by this reader)";
}
function zip(b, x) {
  x.looked.push("ZIP META-INF/content_credential.c2pa");
  const name2 = new TextEncoder().encode("META-INF/content_credential.c2pa");
  const sig = Uint8Array.from([80, 75, 3, 4]);
  let at = 0;
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  while ((at = indexOfBytes(b, sig, at)) >= 0 && at + 30 <= b.length) {
    const method = view.getUint16(at + 8, true);
    const size = view.getUint32(at + 18, true);
    const nameLen = view.getUint16(at + 26, true);
    const extraLen = view.getUint16(at + 28, true);
    const fname = b.subarray(at + 30, at + 30 + nameLen);
    if (fname.length === name2.length && indexOfBytes(fname, name2) === 0) {
      const start = at + 30 + nameLen + extraLen;
      if (method === 0 && size > 0)
        x.stores.push({
          location: "ZIP META-INF/content_credential.c2pa",
          bytes: b.subarray(start, start + size)
        });
      else
        x.unreadStore = "META-INF/content_credential.c2pa is in the archive but compressed or sized by a data descriptor";
      break;
    }
    at += 4;
  }
}
function base64(s) {
  try {
    return new Uint8Array(Buffer.from(s.replace(/\s+/g, ""), "base64"));
  } catch {
    return null;
  }
}
function markup(text, x, kind) {
  if (kind === "svg") {
    x.looked.push("SVG c2pa:manifest element");
    const m = /<(?:[\w-]+:)?manifest\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?manifest>/.exec(text);
    const bytes = m ? base64(m[1]) : null;
    if (bytes?.length) x.stores.push({ location: "SVG c2pa:manifest element", bytes });
  } else {
    x.looked.push('HTML <script type="application/c2pa"> and <link rel="c2pa-manifest">');
    const s = /<script\b[^>]*type\s*=\s*["']application\/c2pa["'][^>]*>([\s\S]*?)<\/script>/i.exec(
      text
    );
    const bytes = s ? base64(s[1]) : null;
    if (bytes?.length) x.stores.push({ location: 'HTML <script type="application/c2pa">', bytes });
    for (const l of text.matchAll(/<link\b[^>]*>/gi)) {
      if (!/rel\s*=\s*["']?c2pa-manifest/i.test(l[0])) continue;
      const href = /href\s*=\s*["']([^"']+)["']/i.exec(l[0])?.[1];
      if (href)
        x.references.push({ location: '<link rel="c2pa-manifest">', uri: decodeEntities(href) });
    }
    for (const g of text.matchAll(/<meta\b[^>]*name\s*=\s*["']generator["'][^>]*>/gi)) {
      const c = /content\s*=\s*["']([^"']+)["']/i.exec(g[0])?.[1];
      if (c) x.hints.push(trimHint("generator", decodeEntities(c)));
    }
  }
}
function hasControlCharacters(s) {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 9 || c > 13 && c < 32) return true;
  }
  return false;
}
var TEXT_EXT = /\.(txt|md|markdown|csv|json|jsonl|yaml|yml|xml|rtf|log|srt|vtt)$/i;
function extract(b, name2, contentType = "") {
  const x = {
    format: "unknown",
    label: "file",
    media: "unknown",
    stores: [],
    references: [],
    xmp: [],
    hints: [],
    looked: []
  };
  const set = (format, label, media) => Object.assign(x, { format, label, media });
  const head = ascii(b, 0, 16);
  if (b[0] === 255 && b[1] === 216) {
    set("jpeg", "JPEG image", "image");
    jpeg(b, x);
  } else if (starts(b, "\x89PNG\r\n\n")) {
    set("png", "PNG image", "image");
    png(b, x);
  } else if (starts(b, "RIFF") && b.length >= 12) {
    const kind = ascii(b, 8, 4);
    if (kind === "WEBP") set("webp", "WebP image", "image");
    else if (kind === "WAVE") set("wav", "WAV audio", "audio");
    else if (kind === "AVI ") set("avi", "AVI video", "video");
    else set("riff", "RIFF file", "unknown");
    riff(b, x);
  } else if (head.startsWith("GIF87a") || head.startsWith("GIF89a")) {
    set("gif", "GIF image", "image");
    gif(b, x);
  } else if (head.startsWith("II*\0") || head.startsWith("MM\0*")) {
    set("tiff", "TIFF image", "image");
    x.looked.push("TIFF tag 52545");
    tiffFindings(b, 0, x, "TIFF");
  } else if (ascii(b, 4, 4) === "ftyp") {
    const brand = ascii(b, 8, 4);
    if (/^(heic|heix|hevc|mif1|msf1|heim|heis)$/.test(brand)) set("heif", "HEIF image", "image");
    else if (/^avi[fs]$/.test(brand)) set("avif", "AVIF image", "image");
    else if (/^M4A |^M4B /.test(brand)) set("m4a", "M4A audio", "audio");
    else if (brand === "qt  ") set("mov", "QuickTime video", "video");
    else set("mp4", "MP4 video", "video");
    bmff(b, x);
  } else if (starts(b, "ID3") || b[0] === 255 && ((b[1] ?? 0) & 224) === 224) {
    const end = id3(b, x);
    if (starts(b, "fLaC", end)) set("flac", "FLAC audio", "audio");
    else set("mp3", "MP3 audio", "audio");
  } else if (starts(b, "fLaC")) {
    set("flac", "FLAC audio", "audio");
    x.looked.push("ID3 GEOB frame (none: native FLAC)");
  } else if (starts(b, "OggS")) {
    set("ogg", "Ogg audio", "audio");
    ogg(b, x);
  } else if (starts(b, "%PDF-")) {
    set("pdf", "PDF document", "document");
    pdf(b, x);
  } else if (starts(b, "PK")) {
    const lower = name2.toLowerCase();
    set(
      "zip",
      /\.docx$/.test(lower) ? "Word document" : /\.epub$/.test(lower) ? "EPUB book" : /\.(pptx|xlsx|odt|ods|odp)$/.test(lower) ? "office document" : "ZIP archive",
      "document"
    );
    zip(b, x);
  } else {
    const text = UTF8.decode(b);
    const trimmed = text.replace(/^\uFEFF/, "").trimStart().slice(0, 600).toLowerCase();
    if (trimmed.includes("<svg")) {
      set("svg", "SVG image", "image");
      markup(text, x, "svg");
    } else if (/^<!doctype html|^<html|<head|<body/.test(trimmed) || /html/.test(contentType)) {
      set("html", "HTML document", "text");
      markup(text, x, "html");
    } else if (TEXT_EXT.test(name2) || /^text\/|json|xml/.test(contentType) || !hasControlCharacters(text.slice(0, 2e3))) {
      set("text", "text", "text");
      x.looked.push("C2PA text manifest wrapper (U+FEFF + variation selectors)");
    }
    if (x.media === "text") x.text = text;
  }
  if (x.stores.length === 0 && !x.unreadStore) {
    const at = indexOfBytes(b, STORE_SIGNATURE);
    const start = at - 12;
    if (start >= 0 && ascii(b, at - 8, 4) === "jumb") {
      const size = new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(start);
      if (size > 0 && start + size <= b.length)
        x.stores.push({
          location: `a raw scan (byte ${start}; the container was not parsed)`,
          bytes: b.subarray(start, start + size)
        });
    }
  }
  x.looked.push("XMP dcterms:provenance");
  for (const p of findXmpPackets(b)) if (!x.xmp.some((q) => q.includes(p))) x.xmp.push(p);
  return x;
}

// src/output/check.ts
var DIGITAL_SOURCE_TYPES = {
  trainedAlgorithmicMedia: "Created using Generative AI",
  compositeWithTrainedAlgorithmicMedia: "Edited using Generative AI",
  compositeSynthetic: "Composite including generative AI elements",
  algorithmicMedia: "Pure algorithmic media",
  algorithmicallyEnhanced: "Algorithmically-altered media",
  digitalCapture: "Digital capture sampled from real life",
  computationalCapture: "Multi-frame computational capture sampled from real life",
  digitalCreation: "Digital creation",
  digitalArt: "Digital art",
  dataDrivenMedia: "Data-driven media",
  humanEdits: "Human-edited media",
  minorHumanEdits: "Original media with minor human edits",
  composite: "Composite of elements",
  compositeCapture: "Composite of captured elements",
  screenCapture: "Screen capture",
  softwareImage: "Created by software",
  virtualRecording: "Virtual event recording",
  negativeFilm: "Digitised from a transparent negative",
  positiveFilm: "Digitised from a transparent positive",
  print: "Digitised from a non-transparent medium",
  trainedAlgorithmicData: "Trained algorithmic data"
};
var AI_TYPES = /* @__PURE__ */ new Set([
  "trainedAlgorithmicMedia",
  "compositeWithTrainedAlgorithmicMedia",
  "compositeSynthetic",
  "trainedAlgorithmicData"
]);
function sourceType(uri) {
  const code = uri.replace(/\/+$/, "").split("/").pop() ?? uri;
  return { uri, name: DIGITAL_SOURCE_TYPES[code] ?? code, ai: AI_TYPES.has(code) };
}
function name(cn) {
  if (!cn) return null;
  return [cn.O, cn.CN].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(" / ") || null;
}
var expect2 = (id) => {
  const q = QUOTES[id];
  return {
    cite: q.cite,
    quote: q.text,
    source: SOURCES[q.source].url,
    ..."applies" in q ? { applies: q.applies } : {}
  };
};
function checkOutput(input) {
  const x = extract(input.bytes, input.name, input.contentType);
  const problems = [];
  let textReport = null;
  if (x.media === "text" && x.text !== void 0) {
    const t = checkText(x.text);
    if (t.c2paStore) x.stores.push({ location: "C2PA text manifest wrapper", bytes: t.c2paStore });
    if (t.c2paProblem) problems.push(t.c2paProblem);
    textReport = {
      characters: t.characters,
      invisible: t.invisible,
      c2pa_text_wrapper: Boolean(t.c2paStore)
    };
  }
  if (input.link) {
    for (const part of input.link.split(",")) {
      const m = /<([^>]+)>\s*;(.*)/.exec(part.trim());
      if (m && /rel\s*=\s*"?c2pa-manifest/i.test(m[2]))
        x.references.push({ location: "HTTP Link header", uri: m[1] });
    }
  }
  const store = x.stores[0];
  const summary = store ? summariseStore(store.bytes) : null;
  if (summary) problems.push(...summary.problems);
  const active = summary?.active;
  const xmp = readXmp(x.xmp);
  if (xmp.provenance && !xmp.provenance.startsWith("self#jumbf="))
    x.references.push({ location: "XMP dcterms:provenance", uri: xmp.provenance });
  const c2paTypes = (active?.digitalSourceTypes ?? []).map(sourceType);
  const xmpTypes = xmp.digitalSourceTypes.map(sourceType);
  const hints = x.hints.map((h) => ({
    ...h,
    names_ai_generator: generatorIn(`${h.field} ${h.value}`) !== void 0
  }));
  const declared = [];
  const aiC2pa = c2paTypes.filter((t) => t.ai);
  if (aiC2pa.length)
    declared.push(
      `C2PA manifest: ${aiC2pa.map((t) => `${t.name} (${t.uri.split("/").pop()})`).join(", ")}`
    );
  if (active?.aiDisclosure)
    declared.push(
      `C2PA AI disclosure assertion${active.aiDisclosure.modelName ? `: ${active.aiDisclosure.modelName}` : ""}`
    );
  const aiXmp = xmpTypes.filter((t) => t.ai);
  if (aiXmp.length)
    declared.push(
      `IPTC DigitalSourceType in XMP (unsigned): ${aiXmp.map((t) => t.name).join(", ")}`
    );
  if (xmp.aiSystemUsed) declared.push(`IPTC AISystemUsed in XMP (unsigned): ${xmp.aiSystemUsed}`);
  for (const h of hints.filter((h2) => h2.names_ai_generator))
    declared.push(`${h.field} (unsigned): ${h.value}`);
  const signed = active ? "found" : store || x.unreadStore ? "present, not opened" : "not found";
  const watermarkDeclared = Boolean(active?.watermarkDeclared);
  const freeText = x.media === "text" && x.format !== "html";
  const expects = [expect2("art50_2"), expect2("art111_4"), expect2("code_layers")];
  if (freeText) expects.push(expect2("code_text"));
  else expects.push(expect2("code_signed"));
  expects.push(expect2("code_watermark"));
  let california = null;
  if (x.media === "image" || x.media === "video" || x.media === "audio") {
    expects.push(expect2("cata_latent"));
    const when = active?.actions.find((a) => a.when)?.when;
    const created = active?.actions.find(
      (a) => /c2pa\.(created|edited|converted|placed)/.test(a.action)
    );
    california = {
      fields: [
        {
          field: CATA_FIELDS[0],
          name: CATA_FIELD_NAMES[0],
          seen: Boolean(active?.signature.signer),
          from: active?.signature.signer ? `C2PA signer certificate: ${name(active.signature.signer)}` : null
        },
        {
          field: CATA_FIELDS[1],
          name: CATA_FIELD_NAMES[1],
          seen: Boolean(active?.claimGenerator || active?.aiDisclosure?.modelName),
          from: active?.claimGenerator ? `C2PA claim generator: ${active.claimGenerator}` : active?.aiDisclosure?.modelName ? `C2PA AI disclosure: ${active.aiDisclosure.modelName}` : null
        },
        {
          field: CATA_FIELDS[2],
          name: CATA_FIELD_NAMES[2],
          seen: Boolean(when || active?.signature.timeStamped),
          from: when ? `C2PA action time: ${when}` : active?.signature.timeStamped ? "C2PA signature time-stamp" : null
        },
        {
          field: CATA_FIELDS[3],
          name: CATA_FIELD_NAMES[3],
          seen: Boolean(active?.label || active?.instanceId),
          from: active?.label ? `C2PA manifest label: ${active.label}` : active?.instanceId ? `C2PA instanceID: ${active.instanceId}` : null
        },
        {
          field: CATA_FIELDS[4],
          name: CATA_FIELD_NAMES[4],
          seen: Boolean(created || aiC2pa.length),
          from: created ? `C2PA action: ${created.action}${created.digitalSourceType ? ` (${sourceType(created.digitalSourceType).name})` : ""}` : aiC2pa.length ? `C2PA digital source type: ${aiC2pa[0].name}` : null
        }
      ]
    };
  }
  const cannot = [
    "whether the C2PA signature, certificate chain and content hashes are valid (this tool reads manifests; validate with c2patool or https://contentcredentials.org/verify)",
    "an imperceptible watermark in the pixels, samples or wording: only the generator's own detector can find one",
    "whether the artefact is in scope of Article 50(2) (who provides the system, whether an exception applies)"
  ];
  if (x.references.length)
    cannot.unshift(
      "the external manifest a reference points to (not fetched: one request per check)"
    );
  return {
    target: {
      source: input.source,
      name: input.name,
      ...input.finalUrl && input.finalUrl !== input.name ? { final_url: input.finalUrl } : {},
      ...input.status !== void 0 ? { status: input.status } : {},
      ...input.contentType ? { content_type: input.contentType } : {},
      bytes: input.bytes.length,
      sha256: createHash("sha256").update(input.bytes).digest("hex"),
      ...input.truncated ? { truncated: true } : {}
    },
    format: x.format,
    label: x.label,
    media: x.media,
    c2pa: {
      found: Boolean(active),
      location: store?.location ?? null,
      looked_in: x.looked.filter((l) => !l.startsWith("XMP")),
      unread: x.unreadStore ?? null,
      references: x.references,
      manifests: summary?.manifests.length ?? 0,
      active: active ? {
        label: active.label,
        claim_generator: active.claimGenerator ?? null,
        title: active.title ?? null,
        signature: {
          present: active.signature.present,
          alg: active.signature.alg ?? null,
          signer: name(active.signature.signer),
          issuer: name(active.signature.issuer),
          time_stamped: active.signature.timeStamped
        },
        assertions: active.assertions,
        actions: active.actions,
        digital_source_types: c2paTypes,
        ai_disclosure: active.aiDisclosure ?? null,
        soft_bindings: active.softBindings,
        watermark_declared: active.watermarkDeclared
      } : null,
      validated: false,
      problems
    },
    xmp: {
      packets: xmp.packets,
      digital_source_types: xmpTypes,
      ai_system_used: xmp.aiSystemUsed ?? null,
      ai_system_version_used: xmp.aiSystemVersionUsed ?? null,
      ai_prompt_information: xmp.aiPromptInformation,
      ai_prompt_writer_name: xmp.aiPromptWriterName,
      provenance_reference: xmp.provenance ?? null,
      creator_tool: xmp.creatorTool ?? null,
      credit: xmp.credit ?? null
    },
    text: textReport,
    hints,
    marking: {
      signed_metadata: signed,
      ai_declared_in: declared,
      watermark: watermarkDeclared ? "declared in the manifest" : "not declared"
    },
    expects,
    california,
    cannot_check: cannot
  };
}

// src/targets.ts
var MAX_PAGE_BYTES = 5 * 1024 * 1024;
var MAX_FILE_BYTES = 100 * 1024 * 1024;
async function readTarget(target, deps, cwd, kind) {
  if (parseHttpUrl(target)) {
    const f = await fetchOnce(target, {
      fetch: deps.fetch,
      maxBytes: kind === "page" ? MAX_PAGE_BYTES : MAX_FILE_BYTES,
      accept: kind === "page" ? "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5" : "*/*"
    });
    if (f.status >= 400)
      throw new CliError({
        code: "HTTP_ERROR",
        cause: `${target} answered ${f.status}`,
        fix: "check the URL in a browser; for a page behind a login, save it and pass the file instead",
        retryable: f.status >= 500 || f.status === 429
      });
    return {
      source: "url",
      name: target,
      bytes: f.bytes,
      finalUrl: f.finalUrl,
      status: f.status,
      contentType: f.contentType,
      truncated: f.truncated,
      link: f.link
    };
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(target))
    throw new CliError({
      code: "BAD_URL",
      cause: `${target} is not an http or https URL`,
      fix: "pass an http(s) URL or a local file path",
      retryable: false
    });
  const file = path.resolve(cwd, target);
  let info;
  try {
    info = await stat(file);
  } catch {
    throw new CliError({
      code: "FILE_NOT_FOUND",
      cause: `no file at ${target}`,
      fix: `pass a URL (https://\u2026) or the path to a file, e.g. \`${INSTALL} ${kind === "page" ? "site page.html" : "output image.png"}\``,
      retryable: false
    });
  }
  if (!info.isFile())
    throw new CliError({
      code: "NOT_A_FILE",
      cause: `${target} is a directory`,
      fix: "pass one file at a time, or several as separate arguments",
      retryable: false
    });
  if (info.size > MAX_FILE_BYTES)
    throw new CliError({
      code: "FILE_TOO_LARGE",
      cause: `${target} is ${Math.round(info.size / 1048576)} MB; this check reads up to 100 MB`,
      fix: "check a shorter export of the same output",
      retryable: false
    });
  return { source: "file", name: target, bytes: new Uint8Array(await readFile(file)) };
}
function decodeHtml(bytes, contentType = "") {
  const charset = /charset=([\w-]+)/i.exec(contentType)?.[1]?.toLowerCase();
  try {
    return new TextDecoder(charset && charset !== "utf8" ? charset : "utf-8").decode(bytes);
  } catch {
    return new TextDecoder().decode(bytes);
  }
}
async function siteReport(target, deps, cwd) {
  const t = await readTarget(target, deps, cwd, "page");
  return checkSite({ ...t, html: decodeHtml(t.bytes, t.contentType), bytes: t.bytes.length });
}
async function outputReport(target, deps, cwd) {
  const t = await readTarget(target, deps, cwd, "artefact");
  return checkOutput(t);
}

// src/pdf.ts
var STYLE = {
  title: { font: "F2", size: 15, lead: 22, width: 0.56 },
  heading: { font: "F2", size: 10.5, lead: 16, width: 0.56 },
  body: { font: "F1", size: 9, lead: 12.5, width: 0.5 },
  mono: { font: "F3", size: 7.4, lead: 9.2, width: 0.6 },
  small: { font: "F1", size: 7.5, lead: 10, width: 0.5 }
};
var PAGE_W = 595.28;
var PAGE_H = 841.89;
var MARGIN = 48;
var TEXT_W = PAGE_W - 2 * MARGIN;
var WIN = {
  "\u20AC": 128,
  "\u201A": 130,
  "\u201E": 132,
  "\u2026": 133,
  "\u2018": 145,
  "\u2019": 146,
  "\u201C": 147,
  "\u201D": 148,
  "\u2022": 149,
  "\u2013": 150,
  "\u2014": 151,
  "\u2122": 153
};
var REPLACE = {
  "\u2192": "->",
  "\u2190": "<-",
  "\u2265": ">=",
  "\u2264": "<=",
  "\u2713": "v",
  "\xD7": "x"
};
function winAnsi(s) {
  const out = [];
  for (const ch of s) {
    const r = REPLACE[ch];
    if (r) {
      for (const c of r) out.push(c.charCodeAt(0));
      continue;
    }
    const cp = ch.codePointAt(0);
    if (cp >= 32 && cp < 127) out.push(cp);
    else if (WIN[ch] !== void 0) out.push(WIN[ch]);
    else if (cp >= 160 && cp <= 255) out.push(cp);
    else if (cp === 9) out.push(32);
    else out.push(63);
  }
  return out;
}
function pdfString(s) {
  return `(${winAnsi(s).map(
    (b) => b === 40 || b === 41 || b === 92 ? `\\${String.fromCharCode(b)}` : b < 32 || b > 126 ? `\\${b.toString(8).padStart(3, "0")}` : String.fromCharCode(b)
  ).join("")})`;
}
function wrapTo(text, max) {
  if (text.length <= max) return [text];
  const indent = /^\s*/.exec(text)[0];
  const out = [];
  let rest = text;
  while (rest.length > max) {
    let cut = rest.lastIndexOf(" ", max);
    if (cut <= indent.length) cut = max;
    out.push(rest.slice(0, cut));
    rest = indent + rest.slice(cut).trimStart();
  }
  out.push(rest);
  return out;
}
function renderPdf(lines, meta) {
  const pages = [[]];
  let y = PAGE_H - MARGIN;
  for (const line of lines) {
    const st = STYLE[line.style];
    const max = Math.floor(TEXT_W / (st.size * st.width));
    for (const part of line.text === "" ? [""] : wrapTo(line.text, max)) {
      if (y - st.lead < MARGIN + 18) {
        pages.push([]);
        y = PAGE_H - MARGIN;
      }
      y -= st.lead;
      if (part)
        pages.at(-1).push(
          `BT /${st.font} ${st.size} Tf ${MARGIN} ${y.toFixed(2)} Td ${pdfString(part)} Tj ET`
        );
    }
  }
  const objects = [];
  const add = (body) => {
    objects.push(body);
    return objects.length;
  };
  const catalog = add("");
  const pagesObj = add("");
  const f1 = add(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"
  );
  const f2 = add(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"
  );
  const f3 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>");
  const kids = [];
  pages.forEach((ops, i) => {
    const foot = `BT /F1 7 Tf ${MARGIN} ${MARGIN - 10} Td ${pdfString(`${meta.footer} \xB7 page ${i + 1} of ${pages.length}`)} Tj ET`;
    const stream = [...ops, foot].join("\n");
    const content = add(
      `<< /Length ${Buffer.byteLength(stream, "latin1")} >>
stream
${stream}
endstream`
    );
    kids.push(
      add(
        `<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R /F3 ${f3} 0 R >> >> /Contents ${content} 0 R >>`
      )
    );
  });
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objects[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;
  const d = meta.created.toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const info = add(
    `<< /Title ${pdfString(meta.title)} /Producer (agent-disclosure) /CreationDate (D:${d}Z) >>`
  );
  let out = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out, "latin1"));
    out += `${i + 1} 0 obj
${body}
endobj
`;
  });
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref
0 ${objects.length + 1}
0000000000 65535 f 
`;
  for (const o of offsets) out += `${String(o).padStart(10, "0")} 00000 n 
`;
  out += `trailer
<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>
startxref
${xref}
%%EOF
`;
  return new Uint8Array(Buffer.from(out, "latin1"));
}

// src/report.ts
var LIMITS = { sites: 10, outputs: 25 };
var PRICE = "$49";
function siteBase() {
  const v = process.env["AGENT_DISCLOSURE_SITE"];
  return v && /^https?:\/\/[^\s]+$/.test(v) ? v.replace(/\/+$/, "") : SITE;
}
var buyUrl = () => `${siteBase()}/ai-disclosure/readiness-report`;
var signUrl = () => `${siteBase()}/api/ai-disclosure/sign`;
var keyUrl = () => `${siteBase()}/ai-disclosure/report-key.json`;
var BUY_URL = `${SITE}/ai-disclosure/readiness-report`;
var REPORT_HELP = `agent-disclosure report \u2014 a signed, dated Article 50 readiness report (${PRICE}, one-time)

Usage
  ${INSTALL} report --site <url> [--site <url>\u2026] --output <file|url> [--output \u2026]
      names the targets and prints the checkout link for them; reads and sends nothing yet
  ${INSTALL} report --token <token> [the same --site and --output]
      after payment: runs both checks on this machine, sends only the report's SHA-256 to be
      signed, and writes agent-disclosure-report-<date>-<id>.json and .pdf (--out <dir>)
  ${INSTALL} verify <report.json>
      recompute the hash and check the signature against the key okgate publishes

Up to ${LIMITS.sites} URLs (site) and ${LIMITS.outputs} artefacts (output). The token from the checkout page is
valid 30 days for the same targets, so a re-check after a fix is signed too. What is sent: the
hash, a commitment to the target names (not the files, not the findings) and the two counts.
Checkout: ${BUY_URL}
`;
function canonical(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map((x) => canonical(x === void 0 ? null : x)).join(",")}]`;
  const entries = Object.entries(v).filter(([, x]) => x !== void 0).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  return `{${entries.map(([k, x]) => `${JSON.stringify(k)}:${canonical(x)}`).join(",")}}`;
}
var sha256 = (s) => createHash2("sha256").update(s).digest("hex");
function targetName(t) {
  const u = parseHttpUrl(t);
  return u ? u.href : path2.basename(t);
}
function commitment(t) {
  return sha256(
    canonical({ sites: t.sites.map(targetName).sort(), outputs: t.outputs.map(targetName).sort() })
  );
}
function readToken(token) {
  const bad = () => new CliError({
    code: "BAD_TOKEN",
    cause: "the token is not one okgate's checkout page issued",
    fix: `copy the whole token from the page Stripe returned you to after paying (${buyUrl()}/paid)`,
    retryable: false
  });
  const [payload, mac] = token.trim().split(".");
  if (!payload || !mac) throw bad();
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof claims.c !== "string" || typeof claims.exp !== "number") throw bad();
    return claims;
  } catch {
    throw bad();
  }
}
function cacheDir(deps) {
  return deps.cacheDir ?? path2.join(process.env["XDG_CACHE_HOME"] || path2.join(homedir(), ".cache"), "agent-disclosure");
}
function checkLimits(t) {
  if (t.sites.length + t.outputs.length === 0)
    throw usage("report needs at least one --site or --output", `run \`${INSTALL} report --help\``);
  if (t.sites.length > LIMITS.sites || t.outputs.length > LIMITS.outputs)
    throw usage(
      `a report covers up to ${LIMITS.sites} URLs and ${LIMITS.outputs} artefacts; this names ${t.sites.length} and ${t.outputs.length}`,
      "split the targets into two reports"
    );
}
async function reportCommand(rest, values, deps, cwd, now) {
  if (rest.length)
    throw usage(
      `report takes --site and --output, not "${rest[0]}"`,
      `run \`${INSTALL} report --help\``
    );
  let targets = { sites: values.site ?? [], outputs: values.output ?? [] };
  const dir = cacheDir(deps);
  if (!values.token) {
    checkLimits(targets);
    for (const s of targets.sites)
      if (!parseHttpUrl(s)) {
        await readTarget(s, deps, cwd, "page");
      }
    for (const o of targets.outputs)
      if (!parseHttpUrl(o)) await readTarget(o, deps, cwd, "artefact");
    const commit2 = commitment(targets);
    const abs = {
      sites: targets.sites.map((s) => parseHttpUrl(s) ? s : path2.resolve(cwd, s)),
      outputs: targets.outputs.map((o) => parseHttpUrl(o) ? o : path2.resolve(cwd, o))
    };
    try {
      await mkdir(dir, { recursive: true });
      await writeFile(path2.join(dir, `${commit2}.json`), JSON.stringify(abs, null, 2));
    } catch {
    }
    const link = `${buyUrl()}?commit=${commit2}&sites=${targets.sites.length}&outputs=${targets.outputs.length}&ref=agent-disclosure`;
    if (values.json) {
      deps.stdout(
        `${JSON.stringify({ commit: commit2, sites: targets.sites.length, outputs: targets.outputs.length, checkout: link, price: PRICE, next: `${INSTALL} report --token <token>` }, null, 2)}
`
      );
      return 0;
    }
    deps.stdout(
      [
        `A signed readiness report for ${targets.sites.length} URL${targets.sites.length === 1 ? "" : "s"} and ${targets.outputs.length} artefact${targets.outputs.length === 1 ? "" : "s"} (${PRICE}, one-time, no account):`,
        "",
        `  ${link}`,
        "",
        "Nothing was read or sent. After paying, the page shows a token; then run",
        "",
        `  ${INSTALL} report --token <token>`,
        "",
        "on this machine (the targets are remembered), or with the same --site and --output flags.",
        "The free checks stay free: site and output print the same findings, unsigned.",
        ""
      ].join("\n")
    );
    return 0;
  }
  const claims = readToken(values.token);
  if (claims.exp * 1e3 < now.getTime())
    throw new CliError({
      code: "TOKEN_EXPIRED",
      cause: `the token expired on ${new Date(claims.exp * 1e3).toISOString().slice(0, 10)}`,
      fix: `buy a new report at ${buyUrl()}`,
      retryable: false
    });
  if (targets.sites.length + targets.outputs.length === 0) {
    try {
      targets = JSON.parse(await readFile2(path2.join(dir, `${claims.c}.json`), "utf8"));
    } catch {
      throw new CliError({
        code: "TARGETS_NOT_FOUND",
        cause: "no --site or --output was given, and this machine has no record of the targets this token was bought for",
        fix: "run the command again with the same --site and --output flags you bought the report for",
        retryable: false
      });
    }
  }
  checkLimits(targets);
  const commit = commitment(targets);
  if (commit !== claims.c)
    throw new CliError({
      code: "TOKEN_FOR_OTHER_TARGETS",
      cause: "this token was bought for a different set of URLs and file names",
      fix: "pass exactly the --site and --output targets you bought the report for (same URLs, same file names)",
      retryable: false
    });
  const today = now.toISOString().slice(0, 10);
  const sites = [];
  const outputs = [];
  const texts = [];
  for (const s of targets.sites) {
    const name2 = targetName(s);
    try {
      const r = await siteReport(s, deps, cwd);
      r.target.name = name2;
      sites.push(r);
      texts.push({ title: `Site: ${name2}`, text: renderSiteText(r, today) });
    } catch (e) {
      if (!(e instanceof CliError)) throw e;
      sites.push({ target: { name: name2 }, error: e.toJSON() });
      texts.push({ title: `Site: ${name2}`, text: `Not checked: ${e.code}: ${e.cause}
` });
    }
  }
  for (const o of targets.outputs) {
    try {
      const r = await outputReport(o, deps, cwd);
      r.target.name = targetName(o);
      outputs.push(r);
      texts.push({ title: `Artefact: ${targetName(o)}`, text: renderOutputText(r, today) });
    } catch (e) {
      if (!(e instanceof CliError)) throw e;
      outputs.push({ target: { name: targetName(o) }, error: e.toJSON() });
      texts.push({
        title: `Artefact: ${targetName(o)}`,
        text: `Not checked: ${e.code}: ${e.cause}
`
      });
    }
  }
  const report = {
    type: "agent-disclosure readiness report",
    version: 1,
    tool: `agent-disclosure ${version()}`,
    generated_at: now.toISOString(),
    not_legal_advice: NOT_ADVICE,
    commit,
    targets: { sites: targets.sites.map(targetName), outputs: targets.outputs.map(targetName) },
    sites,
    outputs,
    sources: Object.values(SOURCES).map((s) => ({ ...s, read: SEEN }))
  };
  const hash = sha256(canonical(report));
  const signature = await requestSignature(deps, {
    token: values.token.trim(),
    sha256: hash,
    commit,
    sites: targets.sites.length,
    outputs: targets.outputs.length
  });
  if (signature.statement.sha256 !== hash || signature.statement.commit !== commit)
    throw new CliError({
      code: "SIGNATURE_MISMATCH",
      cause: "the signature returned is for another report",
      fix: "run the command again",
      retryable: true
    });
  const signed = {
    report,
    sha256: hash,
    signature: { ...signature, verify: keyUrl() }
  };
  const outDir = path2.resolve(cwd, values.out ?? ".");
  const base = `agent-disclosure-report-${today}-${commit.slice(0, 8)}`;
  await mkdir(outDir, { recursive: true });
  const jsonPath = path2.join(outDir, `${base}.json`);
  const pdfPath = path2.join(outDir, `${base}.pdf`);
  await writeFile(jsonPath, `${JSON.stringify(signed, null, 2)}
`);
  await writeFile(pdfPath, reportPdf(signed, texts, now));
  if (values.json) {
    deps.stdout(
      `${JSON.stringify({ json: jsonPath, pdf: pdfPath, sha256: hash, signed_at: signature.statement.signed_at, key_id: signature.key_id }, null, 2)}
`
    );
  } else {
    deps.stdout(
      [
        `Signed readiness report, ${signature.statement.signed_at}`,
        `  JSON  ${jsonPath}`,
        `  PDF   ${pdfPath}`,
        `  SHA-256 of the report: ${hash}`,
        `  Ed25519 signature by key ${signature.key_id}; check it any time with \`${INSTALL} verify ${path2.basename(jsonPath)}\``,
        ""
      ].join("\n")
    );
  }
  return 0;
}
async function requestSignature(deps, body) {
  const doFetch = deps.fetch ?? fetch;
  let res;
  try {
    res = await doFetch(signUrl(), {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": USER_AGENT() },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(2e4)
    });
  } catch (e) {
    throw new CliError({
      code: "SIGNING_UNREACHABLE",
      cause: `okgate's signing endpoint did not answer: ${e instanceof Error ? e.message : String(e)}`,
      fix: "try again in a minute; the token stays valid for 30 days",
      retryable: true
    });
  }
  let payload;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }
  const err = payload?.error;
  if (!res.ok || err) {
    throw new CliError({
      code: err?.code ?? `SIGNING_HTTP_${res.status}`,
      cause: err?.cause ?? `the signing endpoint answered ${res.status}`,
      fix: err?.fix ?? "try again in a minute; the token stays valid for 30 days",
      retryable: err?.retryable ?? res.status >= 500
    });
  }
  const sig = payload;
  if (!sig?.statement || typeof sig.signature !== "string" || typeof sig.public_key !== "string")
    throw new CliError({
      code: "SIGNING_BAD_ANSWER",
      cause: "the signing endpoint's answer has no signature",
      fix: "try again in a minute",
      retryable: true
    });
  return sig;
}
function signatureValid(sig) {
  try {
    const key = createPublicKey({
      key: { kty: "OKP", crv: "Ed25519", x: sig.public_key },
      format: "jwk"
    });
    return verifySig(
      null,
      Buffer.from(canonical(sig.statement)),
      key,
      Buffer.from(sig.signature, "base64url")
    );
  } catch {
    return false;
  }
}
function reportPdf(signed, texts, now) {
  const s = signed.signature;
  const lines = [
    { text: "EU AI Act Article 50 readiness report", style: "title" },
    {
      text: `${texts.length} target${texts.length === 1 ? "" : "s"} checked by agent-disclosure ${version()} on ${now.toISOString()}`,
      style: "body"
    },
    { text: NOT_ADVICE, style: "body" },
    { text: "", style: "body" },
    { text: "Signature", style: "heading" },
    { text: `Signed at ${s.statement.signed_at} with Ed25519 key ${s.key_id}.`, style: "body" },
    {
      text: `SHA-256 of the report (the JSON file's "report" object, keys sorted, no whitespace): ${signed.sha256}`,
      style: "body"
    },
    { text: `Signature: ${s.signature}`, style: "mono" },
    { text: `Public key: ${s.public_key}  (published at ${keyUrl()})`, style: "mono" },
    {
      text: `The signed record is the JSON file; this PDF shows the same findings. Check it: ${INSTALL} verify <the .json file>. The signature shows the report has not changed since it was signed; the checks ran on the buyer's machine.`,
      style: "small"
    },
    { text: "", style: "body" },
    { text: "Targets", style: "heading" },
    ...texts.map((t) => ({ text: t.title, style: "body" })),
    { text: "", style: "body" },
    { text: "Sources (each read on 8 October 2026)", style: "heading" },
    ...Object.values(SOURCES).map((src) => ({
      text: `${src.name}: ${src.url}`,
      style: "small"
    }))
  ];
  for (const t of texts) {
    lines.push({ text: "", style: "body" }, { text: t.title, style: "heading" });
    for (const l of t.text.trimEnd().split("\n")) lines.push({ text: l, style: "mono" });
  }
  return renderPdf(lines, {
    title: "EU AI Act Article 50 readiness report",
    footer: `agent-disclosure readiness report \xB7 SHA-256 ${signed.sha256.slice(0, 16)}\u2026 \xB7 not legal advice`,
    created: now
  });
}
async function verifyCommand(rest, values, deps, cwd) {
  if (rest.length !== 1)
    throw usage(
      "verify takes one report.json",
      `run \`${INSTALL} verify agent-disclosure-report-\u2026.json\``
    );
  let signed;
  try {
    signed = JSON.parse(await readFile2(path2.resolve(cwd, rest[0]), "utf8"));
  } catch {
    throw new CliError({
      code: "REPORT_UNREADABLE",
      cause: `${rest[0]} is not a readable report JSON`,
      fix: "pass the .json file the report command wrote",
      retryable: false
    });
  }
  const hash = sha256(canonical(signed.report ?? null));
  const checks = [];
  checks.push({
    name: "hash",
    ok: hash === signed.sha256 && hash === signed.signature?.statement?.sha256,
    detail: hash
  });
  checks.push({
    name: "signature",
    ok: Boolean(signed.signature && signatureValid(signed.signature)),
    detail: `Ed25519, key ${signed.signature?.key_id ?? "?"}`
  });
  if (values.offline)
    checks.push({ name: "published key", ok: null, detail: "not checked (--offline)" });
  else {
    let ok = null;
    let detail = keyUrl();
    try {
      const res = await (deps.fetch ?? fetch)(keyUrl(), {
        headers: { "user-agent": USER_AGENT() },
        signal: AbortSignal.timeout(2e4)
      });
      const body = await res.json();
      ok = Boolean(
        body.keys?.some(
          (k) => k.key_id === signed.signature?.key_id && k.public_key === signed.signature?.public_key
        )
      );
    } catch {
      detail = `${keyUrl()} did not answer; run again or use --offline`;
    }
    checks.push({ name: "published key", ok, detail });
  }
  const valid = checks.every((c) => c.ok !== false);
  if (values.json)
    deps.stdout(
      `${JSON.stringify({ valid, signed_at: signed.signature?.statement?.signed_at ?? null, checks }, null, 2)}
`
    );
  else {
    deps.stdout(
      `${valid ? "Valid" : "NOT valid"}: ${rest[0]}${signed.signature?.statement?.signed_at ? `, signed ${signed.signature.statement.signed_at}` : ""}
`
    );
    for (const c of checks)
      deps.stdout(
        `  ${c.ok === null ? "-" : c.ok ? "ok " : "BAD"} ${c.name.padEnd(14)} ${c.detail}
`
      );
  }
  return valid ? 0 : 1;
}

// src/main.ts
var HELP = `agent-disclosure ${version()} \u2014 an EU AI Act Article 50 readiness check, from outside

Usage
  ${INSTALL} site <url|saved-page.html>...
      does the page's chat widget or assistant tell people they are talking to an AI, before or
      at the first exchange? Reads the text, aria labels, titles and placeholders, and the inline
      settings of the chat vendors it can name (Intercom, Zendesk, Drift, HubSpot, Crisp, Tidio,
      Ada, Botpress, Voiceflow, Dialogflow, Copilot Studio, Salesforce and more)
  ${INSTALL} output <file|url>...
      is a generated image, audio, video or text file marked in a machine-readable way? C2PA
      Content Credentials (JPEG, PNG, WebP, GIF, TIFF, HEIF, AVIF, MP4, MOV, M4A, WAV, MP3, FLAC,
      Ogg, PDF, SVG, HTML, ZIP documents and plain text), IPTC and XMP AI fields, a declared
      watermark, and California's latent-disclosure fields
  ${INSTALL} report --site <url> --output <file>...
      a signed, dated readiness report of both checks for up to 10 URLs and 25 artefacts, as PDF
      and JSON: $49, one-time, no account (see \`report --help\`)
  ${INSTALL} verify <report.json>
      check a report's hash and signature
  ${INSTALL} demo
      both checks on synthetic files shipped with this package: reads nothing of yours, no request

Options
  --json      the same, as JSON
  --strict    exit 3 when a site shows no disclosure or a file carries no signed metadata
              (for CI; the GitHub Action uses it)

Each URL is fetched once; nothing else is fetched (not the page's scripts, not a vendor's
settings, not a manifest a file points to). Files are read on this machine and never uploaded.
No account, no LLM calls, no telemetry. Not legal advice: it reports what it found against what
the law says, quoting Regulation (EU) 2024/1689 Art. 50, Regulation (EU) 2026/1744, the
Commission's code of practice and guidelines, and California's and Utah's codes.
Each obligation, with its dates: ${PAGES_URL}
`;
var defaultDeps = {
  stdout: (s) => process.stdout.write(s),
  stderr: (s) => process.stderr.write(s)
};
async function main(argv, deps = defaultDeps) {
  const json = argv.includes("--json");
  try {
    return await run(argv, deps);
  } catch (e) {
    if (e instanceof CliError) {
      (json ? deps.stdout : deps.stderr)(renderError(e.toJSON(), json));
      return e.exitCode;
    }
    throw e;
  }
}
var COMMANDS = ["site", "output", "report", "verify", "demo"];
var PACKAGE_ROOT = fileURLToPath(new URL("..", import.meta.url));
async function run(argv, deps) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        json: { type: "boolean" },
        strict: { type: "boolean" },
        site: { type: "string", multiple: true },
        output: { type: "string", multiple: true },
        token: { type: "string" },
        out: { type: "string" },
        offline: { type: "boolean" },
        help: { type: "boolean", short: "h" },
        version: { type: "boolean", short: "v" }
      }
    });
  } catch (e) {
    throw usage(
      e instanceof Error ? e.message : String(e),
      `run \`${INSTALL} --help\` for the options`
    );
  }
  const { values, positionals } = parsed;
  if (values.version) {
    deps.stdout(`${version()}
`);
    return 0;
  }
  const [command, ...rest] = positionals;
  if (command === "report" && values.help) {
    deps.stdout(REPORT_HELP);
    return 0;
  }
  if (values.help || command === void 0 || command === "help") {
    deps.stdout(HELP);
    return 0;
  }
  if (!COMMANDS.includes(command))
    throw usage(
      `unknown command "${command}"`,
      `the commands are ${COMMANDS.join(", ")}; run \`${INSTALL} --help\``
    );
  const cwd = deps.cwd ?? process.cwd();
  const now = deps.now?.() ?? /* @__PURE__ */ new Date();
  const today = now.toISOString().slice(0, 10);
  if (command === "report") return reportCommand(rest, values, deps, cwd, now);
  if (command === "verify") return verifyCommand(rest, values, deps, cwd);
  if (command === "demo") {
    if (rest.length > 0) throw usage("demo takes no arguments", `run \`${INSTALL} demo\``);
    if (!values.json)
      deps.stdout("Synthetic files, written for this demo: not anyone's site or output.\n\n");
    const site = await runSite(
      ["examples/demo-site/index.html"],
      deps,
      PACKAGE_ROOT,
      today,
      Boolean(values.json)
    );
    const output = await runOutput(
      ["examples/unmarked.png", "examples/iptc-only.png"],
      deps,
      PACKAGE_ROOT,
      today,
      Boolean(values.json)
    );
    return Math.max(site.code, output.code);
  }
  if (rest.length === 0)
    throw usage(
      `${command} needs at least one ${command === "site" ? "URL or saved page" : "file or URL"}`,
      `run \`${INSTALL} ${command} ${command === "site" ? "https://example.com/" : "image.png"}\``
    );
  const result = command === "site" ? await runSite(rest, deps, cwd, today, Boolean(values.json)) : await runOutput(rest, deps, cwd, today, Boolean(values.json));
  if (result.code !== 0) return result.code;
  return values.strict && result.missing ? 3 : 0;
}
async function runSite(targets, deps, cwd, today, json) {
  const reports = [];
  let code = 0;
  let missing = false;
  for (const target of targets) {
    try {
      const r = await siteReport(target, deps, cwd);
      if (!r.disclosure.found) missing = true;
      if (json) reports.push(r);
      else deps.stdout(renderSiteText(r, today) + (targets.length > 1 ? "\n" : ""));
    } catch (e) {
      if (!(e instanceof CliError)) throw e;
      if (targets.length === 1) throw e;
      code = 1;
      if (json) reports.push({ target: { name: target }, error: e.toJSON() });
      else deps.stderr(renderError(e.toJSON(), false));
    }
  }
  if (json) deps.stdout(envelope("site", today, reports));
  return { code, missing };
}
async function runOutput(targets, deps, cwd, today, json) {
  const reports = [];
  let code = 0;
  let missing = false;
  for (const target of targets) {
    try {
      const r = await outputReport(target, deps, cwd);
      if (r.marking.signed_metadata !== "found" && !(r.media === "text" && r.format !== "html"))
        missing = true;
      if (json) reports.push(r);
      else deps.stdout(renderOutputText(r, today) + (targets.length > 1 ? "\n" : ""));
    } catch (e) {
      if (!(e instanceof CliError)) throw e;
      if (targets.length === 1) throw e;
      code = 1;
      if (json) reports.push({ target: { name: target }, error: e.toJSON() });
      else deps.stderr(renderError(e.toJSON(), false));
    }
  }
  if (json) deps.stdout(envelope("output", today, reports));
  return { code, missing };
}

// src/cli.ts
main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (err) => {
    process.stderr.write(`agent-disclosure: ${err instanceof Error ? err.message : String(err)}
`);
    process.exitCode = 1;
  }
);
//# sourceMappingURL=cli.js.map