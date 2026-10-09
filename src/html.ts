/**
 * A small HTML reader: enough to walk a page as served and know, for every piece of text and every
 * attribute, which elements it sits inside. It is not a browser: it runs no script and builds no
 * DOM, and it forgives the markup real pages ship (unclosed tags, stray end tags).
 */

export interface Element {
  name: string;
  attrs: Record<string, string>;
}

export type HtmlEvent =
  | { kind: "open"; el: Element; stack: readonly Element[] }
  | { kind: "text"; text: string; stack: readonly Element[] }
  /** the raw body of a script, style, template or textarea element */
  | { kind: "raw"; el: Element; text: string; stack: readonly Element[] };

const VOID = new Set([
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
  "wbr",
]);
const RAW = new Set(["script", "style", "textarea", "template", "noscript", "title"]);

const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  copy: "©",
  reg: "®",
  trade: "™",
};

export function decodeEntities(s: string): string {
  if (!s.includes("&")) return s;
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, body: string) => {
    if (body[0] === "#") {
      const code =
        body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1));
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return NAMED[body.toLowerCase()] ?? m;
  });
}

const ATTR = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

function parseAttrs(src: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const m of src.matchAll(ATTR)) {
    const name = m[1]!.toLowerCase();
    if (name in attrs) continue;
    attrs[name] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? "");
  }
  return attrs;
}

/** Walk the page in document order. */
export function* walkHtml(html: string): Generator<HtmlEvent> {
  const stack: Element[] = [];
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
      // a "<" that starts no tag is text
      yield { kind: "text", text: "<", stack: [...stack] };
      i = lt + 1;
      continue;
    }
    const name = nameMatch[0].toLowerCase();
    // find the tag's end, skipping ">" inside quoted attribute values
    let j = lt + (close ? 2 : 1) + nameMatch[0].length;
    let quote: string | null = null;
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
      const at = stack.map((e) => e.name).lastIndexOf(name);
      if (at >= 0) stack.length = at;
      continue;
    }
    const selfClosing = inner.trimEnd().endsWith("/");
    const el: Element = {
      name,
      attrs: parseAttrs(selfClosing ? inner.trimEnd().slice(0, -1) : inner),
    };
    yield { kind: "open", el, stack: [...stack] };
    if (RAW.has(name) && !selfClosing) {
      const endRe = new RegExp(`</${name}\\s*>`, "i");
      const rest = html.slice(i);
      const m = endRe.exec(rest);
      const body = m ? rest.slice(0, m.index) : rest;
      yield { kind: "raw", el, text: body, stack: [...stack] };
      i += m ? m.index + m[0].length : rest.length;
      continue;
    }
    if (!VOID.has(name) && !selfClosing) stack.push(el);
  }
}

/** A short CSS-like name for an element, for "where": `button#chat.launcher`. */
export function describe(el: Element): string {
  const id = el.attrs["id"] ? `#${el.attrs["id"]}` : "";
  const cls = (el.attrs["class"] ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((c) => `.${c}`)
    .join("");
  return `${el.name}${id}${cls}`.slice(0, 80);
}
