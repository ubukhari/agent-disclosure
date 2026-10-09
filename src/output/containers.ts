/**
 * Where each file format keeps its marking (C2PA 2.4, Appendix A; XMP; the text chunks generators
 * write), read from the bytes: JPEG APP11 and APP1, PNG caBX and text chunks, RIFF (WebP, WAV, AVI)
 * C2PA and XMP chunks, GIF application extensions, TIFF tag 52545, ISO BMFF (MP4, MOV, M4A, HEIF,
 * AVIF) C2PA uuid boxes, ID3 (MP3, FLAC) GEOB frames, Ogg streams, PDF embedded files, ZIP-based
 * documents, SVG, HTML and plain text. A raw scan for the Manifest Store's description box catches
 * a store in a place this reader does not parse.
 */
import { inflateSync } from "node:zlib";
import { decodeEntities } from "../html.js";
import { readBoxes, STORE_SIGNATURE } from "./jumbf.js";
import { findXmpPackets } from "./xmp.js";

export type Media = "image" | "video" | "audio" | "text" | "document" | "unknown";

export interface Hint {
  field: string;
  value: string;
}

export interface Extracted {
  format: string;
  label: string;
  media: Media;
  stores: { location: string; bytes: Uint8Array }[];
  /** an embedded Manifest Store this reader saw but could not take out (e.g. inside a PDF stream) */
  unreadStore?: string;
  /** URIs that point to an external C2PA manifest */
  references: { location: string; uri: string }[];
  xmp: string[];
  hints: Hint[];
  /** where a C2PA Manifest Store was looked for, in words */
  looked: string[];
  /** the decoded text, for text-like formats */
  text?: string;
}

const LATIN1 = new TextDecoder("latin1");
const UTF8 = new TextDecoder();
const ascii = (b: Uint8Array, at: number, n: number) => LATIN1.decode(b.subarray(at, at + n));
const starts = (b: Uint8Array, s: string, at = 0) => {
  if (at + s.length > b.length) return false;
  for (let i = 0; i < s.length; i++) if (b[at + i] !== s.charCodeAt(i)) return false;
  return true;
};

export function indexOfBytes(hay: Uint8Array, needle: Uint8Array, from = 0): number {
  outer: for (let i = from; i <= hay.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

function trimHint(field: string, raw: string): Hint {
  const value = raw.replace(/\0+$/, "").replace(/\s+/g, " ").trim();
  // prompts and workflows: say what is there, not the prompt itself
  if (/^(parameters|prompt|workflow|comment|usercomment)$/i.test(field) && value.length > 80)
    return {
      field,
      value: `${value.length} characters${generatorIn(value) ? `, naming ${generatorIn(value)}` : ""}`,
    };
  return { field, value: value.length > 120 ? `${value.slice(0, 117)}…` : value };
}

const GENERATORS =
  /midjourney|dall[·\-\s]?e|stable[ -]?diffusion|sdxl|comfyui|automatic1111|novelai|firefly|imagen|gemini|made with google ai|google ai|openai|chatgpt|gpt-image|sora|veo|runway|pika|luma|flux|black forest labs|ideogram|leonardo|kling|hailuo|elevenlabs|suno|udio|synthesia|heygen|grok|aurora|recraft|krea|playground/i;

/** The AI generator a free-text field names, if any. */
export function generatorIn(value: string): string | undefined {
  return GENERATORS.exec(value)?.[0];
}

// ——— TIFF and EXIF ———

interface Ifd {
  entries: Map<number, Uint8Array>;
  next: number;
  sub: number[];
}

function readTiff(b: Uint8Array, base = 0): { ifds: Ifd[] } | null {
  if (b.length < base + 8) return null;
  const le = starts(b, "II", base);
  if (!le && !starts(b, "MM", base)) return null;
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const u16 = (at: number) => view.getUint16(base + at, le);
  const u32 = (at: number) => view.getUint32(base + at, le);
  if (u16(2) !== 42) return null;
  const SIZES: Record<number, number> = {
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
    13: 4,
  };
  const ifds: Ifd[] = [];
  const read = (off: number): Ifd | null => {
    if (off <= 0 || base + off + 2 > b.length) return null;
    const n = u16(off);
    if (n > 1000 || base + off + 2 + n * 12 + 4 > b.length) return null;
    const entries = new Map<number, Uint8Array>();
    const sub: number[] = [];
    for (let i = 0; i < n; i++) {
      const e = off + 2 + i * 12;
      const tag = u16(e);
      const type = u16(e + 2);
      const count = u32(e + 4);
      const size = (SIZES[type] ?? 1) * count;
      const at = size <= 4 ? e + 8 : u32(e + 8);
      if (base + at + size > b.length || size > b.length) continue;
      entries.set(tag, b.subarray(base + at, base + at + size));
      if (tag === 0x8769 && count === 1) sub.push(u32(e + 8));
    }
    return { entries, next: u32(off + 2 + n * 12), sub };
  };
  let off = u32(4);
  const seen = new Set<number>();
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

const TIFF_TEXT: Record<number, string> = {
  0x0131: "Software",
  0x010e: "ImageDescription",
  0x013b: "Artist",
  0x9286: "UserComment",
};

function tiffFindings(b: Uint8Array, base: number, x: Extracted, where: string): void {
  const t = readTiff(b, base);
  if (!t) return;
  for (const ifd of t.ifds) {
    const c2pa = ifd.entries.get(0xcd41);
    if (c2pa) x.stores.push({ location: `${where} tag 52545`, bytes: c2pa });
    const xmp = ifd.entries.get(0x02bc);
    if (xmp) x.xmp.push(UTF8.decode(xmp));
    for (const [tag, field] of Object.entries(TIFF_TEXT)) {
      const v = ifd.entries.get(Number(tag));
      if (!v) continue;
      const text = Number(tag) === 0x9286 ? UTF8.decode(v.subarray(8)) : LATIN1.decode(v);
      if (text.replace(/\0/g, "").trim()) x.hints.push(trimHint(field, text));
    }
  }
}

// ——— the formats ———

function jpeg(b: Uint8Array, x: Extracted): void {
  x.looked.push("JPEG APP11 segments");
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const app11 = new Map<number, { seq: number; data: Uint8Array }[]>();
  const extended: Uint8Array[] = [];
  let at = 2;
  while (at + 4 <= b.length && b[at] === 0xff) {
    const marker = b[at + 1]!;
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0xff) {
      at += marker === 0xff ? 1 : 2;
      continue;
    }
    const len = view.getUint16(at + 2);
    const p = b.subarray(at + 4, at + 2 + len);
    if (marker === 0xeb && p.length > 8 && p[0] === 0x4a && p[1] === 0x50) {
      const en = (p[2]! << 8) | p[3]!;
      const seq = new DataView(p.buffer, p.byteOffset, p.byteLength).getUint32(4);
      const list = app11.get(en) ?? [];
      list.push({ seq, data: p.subarray(8) });
      app11.set(en, list);
    } else if (marker === 0xe1) {
      const xmpHead = "http://ns.adobe.com/xap/1.0/\0";
      const extHead = "http://ns.adobe.com/xmp/extension/\0";
      if (starts(p, xmpHead)) x.xmp.push(UTF8.decode(p.subarray(xmpHead.length)));
      else if (starts(p, extHead)) extended.push(p.subarray(extHead.length + 32 + 8));
      else if (starts(p, "Exif\0\0")) tiffFindings(p, 6, x, "EXIF");
    } else if (marker === 0xfe) {
      const text = LATIN1.decode(p);
      if (text.trim()) x.hints.push(trimHint("Comment", text));
    }
    at += 2 + len;
  }
  if (extended.length) x.xmp.push(UTF8.decode(concat(extended)));
  for (const [, parts] of app11) {
    parts.sort((a, c) => a.seq - c.seq);
    const first = parts[0]!.data;
    const lbox = first.length >= 8 ? new DataView(first.buffer, first.byteOffset).getUint32(0) : 0;
    const headerLen = lbox === 1 ? 16 : 8;
    const bytes = concat([first, ...parts.slice(1).map((s) => s.data.subarray(headerLen))]);
    if (ascii(bytes, 4, 4) === "jumb") x.stores.push({ location: "JPEG APP11 segments", bytes });
  }
}

function png(b: Uint8Array, x: Extracted): void {
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
      const keyword = LATIN1.decode(d.subarray(0, nul < 0 ? d.length : nul));
      let text: string;
      try {
        if (type === "tEXt") text = LATIN1.decode(d.subarray(nul + 1));
        else if (type === "zTXt") text = LATIN1.decode(inflateSync(d.subarray(nul + 2)));
        else {
          const compressed = d[nul + 1] === 1;
          let p = nul + 3;
          p = d.indexOf(0, p) + 1; // language tag
          p = d.indexOf(0, p) + 1; // translated keyword
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

function riff(b: Uint8Array, x: Extracted): void {
  x.looked.push("RIFF C2PA chunk");
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const walk = (start: number, end: number, depth: number) => {
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
        x.hints.push(trimHint(id === "ISFT" ? "Software" : "Comment", LATIN1.decode(d)));
      at += 8 + size + (size & 1);
    }
  };
  walk(12, b.length, 0);
}

function gif(b: Uint8Array, x: Extracted): void {
  x.looked.push("GIF C2PA_GIF application extension");
  let at = 13;
  const flags = b[10] ?? 0;
  if (flags & 0x80) at += 3 * 2 ** ((flags & 7) + 1);
  while (at < b.length) {
    const intro = b[at];
    if (intro !== 0x21) break; // an image descriptor or the trailer: the C2PA block comes before both
    const label = b[at + 1];
    at += 2;
    let appId = "";
    if (label === 0xff && b[at] === 11) {
      appId = ascii(b, at + 1, 8);
      at += 12;
    }
    const blocks: Uint8Array[] = [];
    while (at < b.length && b[at] !== 0) {
      const n = b[at]!;
      blocks.push(b.subarray(at + 1, at + 1 + n));
      at += 1 + n;
    }
    at += 1;
    if (appId === "C2PA_GIF")
      x.stores.push({ location: "GIF C2PA_GIF application extension", bytes: concat(blocks) });
    else if (label === 0xfe) x.hints.push(trimHint("Comment", LATIN1.decode(concat(blocks))));
  }
}

const C2PA_UUID_BMFF = "d8fec3d61b0e483c92975828877ec481";
const XMP_UUID_BMFF = "be7acfcb97a942e89c71999491e3afac";

function bmff(b: Uint8Array, x: Extracted): void {
  x.looked.push("ISO BMFF C2PA uuid box");
  for (const box of readBoxes(b)) {
    if (box.type !== "uuid" || box.data.length < 16) continue;
    const id = [...box.data.subarray(0, 16)].map((v) => v.toString(16).padStart(2, "0")).join("");
    const rest = box.data.subarray(16);
    if (id === XMP_UUID_BMFF) x.xmp.push(UTF8.decode(rest));
    if (id !== C2PA_UUID_BMFF || rest.length < 5) continue;
    const afterFlags = rest.subarray(4);
    const nul = afterFlags.indexOf(0);
    const purpose = LATIN1.decode(afterFlags.subarray(0, nul < 0 ? 0 : nul));
    let data = afterFlags.subarray(nul + 1);
    if (purpose === "manifest" || purpose === "original") data = data.subarray(8);
    if (purpose === "manifest" || purpose === "original" || purpose === "update")
      x.stores.push({ location: `ISO BMFF uuid box (${purpose})`, bytes: data });
  }
}

function id3(b: Uint8Array, x: Extracted): number {
  x.looked.push("ID3 GEOB frame");
  if (!starts(b, "ID3") || b.length < 10) return 0;
  const major = b[3]!;
  const syncsafe = (at: number) =>
    ((b[at]! & 0x7f) << 21) |
    ((b[at + 1]! & 0x7f) << 14) |
    ((b[at + 2]! & 0x7f) << 7) |
    (b[at + 3]! & 0x7f);
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
      const enc = d[0]!;
      const mimeEnd = d.indexOf(0, 1);
      const mime = LATIN1.decode(d.subarray(1, mimeEnd));
      const terminator = (from: number) => {
        if (enc === 1 || enc === 2) {
          for (let i = from; i + 1 < d.length; i += 2)
            if (d[i] === 0 && d[i + 1] === 0) return i + 2;
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
      const text =
        d[0] === 1 || d[0] === 2
          ? new TextDecoder("utf-16").decode(d.subarray(1))
          : UTF8.decode(d.subarray(1));
      if (text.replace(/\0/g, "").trim())
        x.hints.push(
          trimHint(id === "TSSE" || id === "TENC" ? "Encoder" : id, text.replace(/\0/g, " ")),
        );
    }
    at += 10 + len;
  }
  return end;
}

function ogg(b: Uint8Array, x: Extracted): void {
  x.looked.push("Ogg C2PA logical stream");
  const streams = new Map<number, Uint8Array[]>();
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let at = 0;
  while (at + 27 <= b.length && starts(b, "OggS", at)) {
    const serial = view.getUint32(at + 14, true);
    const segs = b[at + 26]!;
    let len = 0;
    for (let i = 0; i < segs; i++) len += b[at + 27 + i]!;
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

/** The decoded data of PDF object `n`'s stream, or null. Only unfiltered and FlateDecode streams. */
function pdfStream(b: Uint8Array, text: string, n: number): Uint8Array | null {
  const objRe = new RegExp(`(?:^|[\\s>])${n}\\s+0\\s+obj\\b`, "g");
  const found = objRe.exec(text);
  if (!found) return null;
  const objStart = found.index;
  const streamAt = text.indexOf("stream", objStart);
  const endObj = text.indexOf("endobj", objStart);
  if (streamAt < 0 || (endObj >= 0 && streamAt > endObj)) return null;
  const dict = text.slice(objStart, streamAt);
  let start = streamAt + "stream".length;
  if (text[start] === "\r") start++;
  if (text[start] === "\n") start++;
  let length: number | undefined;
  const direct = /\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(dict);
  const indirect = /\/Length\s+(\d+)\s+0\s+R/.exec(dict);
  if (direct) length = Number(direct[1]);
  else if (indirect) {
    const ref = new RegExp(`(?:^|\\s)${indirect[1]}\\s+0\\s+obj\\s*(\\d+)`).exec(text);
    if (ref) length = Number(ref[1]);
  }
  const end = length !== undefined ? start + length : text.indexOf("endstream", start);
  if (end <= start || end > b.length) return null;
  const raw = b.subarray(start, end);
  try {
    if (/\/FlateDecode/.test(dict)) return new Uint8Array(inflateSync(raw));
    return /\/Filter/.test(dict) ? null : raw;
  } catch {
    return null;
  }
}

function pdf(b: Uint8Array, x: Extracted): void {
  x.looked.push("PDF embedded file (AFRelationship C2PA_Manifest)");
  const text = LATIN1.decode(b);
  for (const m of text.matchAll(/\/(Producer|Creator)\s*\(([^)]{1,200})\)/g))
    x.hints.push(trimHint(m[1]!, m[2]!));
  // the file specification names the embedded file stream: `/AFRelationship /C2PA_Manifest … /EF << /F n 0 R >>`
  const objects = new Set<number>();
  for (const m of text.matchAll(/\/AFRelationship\s*\/C2PA_Manifest/g)) {
    const dictStart = text.lastIndexOf("obj", m.index);
    const dictEnd = text.indexOf("endobj", m.index);
    const dict = text.slice(dictStart, dictEnd < 0 ? undefined : dictEnd);
    const ef = /\/EF\s*<<[^>]*?\/(?:UF|F)\s+(\d+)\s+0\s+R/.exec(dict);
    if (ef) objects.add(Number(ef[1]));
  }
  // or the stream says what it is: `<< /Subtype /application#2Fc2pa … >> stream`
  for (const m of text.matchAll(/\/Subtype\s*\/application#2[Ff]c2pa/g)) {
    const head = /(\d+)\s+0\s+obj\b(?![\s\S]*\bobj\b)/.exec(
      text.slice(Math.max(0, m.index - 2000), m.index),
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
    x.unreadStore =
      "a PDF embedded file marked as a C2PA Manifest Store (not opened by this reader)";
}

function zip(b: Uint8Array, x: Extracted): void {
  x.looked.push("ZIP META-INF/content_credential.c2pa");
  const name = new TextEncoder().encode("META-INF/content_credential.c2pa");
  const sig = Uint8Array.from([0x50, 0x4b, 0x03, 0x04]);
  let at = 0;
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  while ((at = indexOfBytes(b, sig, at)) >= 0 && at + 30 <= b.length) {
    const method = view.getUint16(at + 8, true);
    const size = view.getUint32(at + 18, true);
    const nameLen = view.getUint16(at + 26, true);
    const extraLen = view.getUint16(at + 28, true);
    const fname = b.subarray(at + 30, at + 30 + nameLen);
    if (fname.length === name.length && indexOfBytes(fname, name) === 0) {
      const start = at + 30 + nameLen + extraLen;
      if (method === 0 && size > 0)
        x.stores.push({
          location: "ZIP META-INF/content_credential.c2pa",
          bytes: b.subarray(start, start + size),
        });
      else
        x.unreadStore =
          "META-INF/content_credential.c2pa is in the archive but compressed or sized by a data descriptor";
      break;
    }
    at += 4;
  }
}

function base64(s: string): Uint8Array | null {
  try {
    return new Uint8Array(Buffer.from(s.replace(/\s+/g, ""), "base64"));
  } catch {
    return null;
  }
}

function markup(text: string, x: Extracted, kind: "svg" | "html"): void {
  if (kind === "svg") {
    x.looked.push("SVG c2pa:manifest element");
    const m = /<(?:[\w-]+:)?manifest\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?manifest>/.exec(text);
    const bytes = m ? base64(m[1]!) : null;
    if (bytes?.length) x.stores.push({ location: "SVG c2pa:manifest element", bytes });
  } else {
    x.looked.push('HTML <script type="application/c2pa"> and <link rel="c2pa-manifest">');
    const s = /<script\b[^>]*type\s*=\s*["']application\/c2pa["'][^>]*>([\s\S]*?)<\/script>/i.exec(
      text,
    );
    const bytes = s ? base64(s[1]!) : null;
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

/** Binary files carry control characters that text does not (tab, newlines and form feed aside). */
function hasControlCharacters(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x09 || (c > 0x0d && c < 0x20)) return true;
  }
  return false;
}

const TEXT_EXT = /\.(txt|md|markdown|csv|json|jsonl|yaml|yml|xml|rtf|log|srt|vtt)$/i;

/** Identify the format and take out everything a marking check reads. */
export function extract(b: Uint8Array, name: string, contentType = ""): Extracted {
  const x: Extracted = {
    format: "unknown",
    label: "file",
    media: "unknown",
    stores: [],
    references: [],
    xmp: [],
    hints: [],
    looked: [],
  };
  const set = (format: string, label: string, media: Media) =>
    Object.assign(x, { format, label, media });
  const head = ascii(b, 0, 16);
  if (b[0] === 0xff && b[1] === 0xd8) {
    set("jpeg", "JPEG image", "image");
    jpeg(b, x);
  } else if (starts(b, "\x89PNG\r\n\x1a\n")) {
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
  } else if (starts(b, "ID3") || (b[0] === 0xff && ((b[1] ?? 0) & 0xe0) === 0xe0)) {
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
  } else if (starts(b, "PK\x03\x04")) {
    const lower = name.toLowerCase();
    set(
      "zip",
      /\.docx$/.test(lower)
        ? "Word document"
        : /\.epub$/.test(lower)
          ? "EPUB book"
          : /\.(pptx|xlsx|odt|ods|odp)$/.test(lower)
            ? "office document"
            : "ZIP archive",
      "document",
    );
    zip(b, x);
  } else {
    const text = UTF8.decode(b);
    const trimmed = text
      .replace(/^\uFEFF/, "")
      .trimStart()
      .slice(0, 600)
      .toLowerCase();
    if (trimmed.includes("<svg")) {
      set("svg", "SVG image", "image");
      markup(text, x, "svg");
    } else if (/^<!doctype html|^<html|<head|<body/.test(trimmed) || /html/.test(contentType)) {
      set("html", "HTML document", "text");
      markup(text, x, "html");
    } else if (
      TEXT_EXT.test(name) ||
      /^text\/|json|xml/.test(contentType) ||
      !hasControlCharacters(text.slice(0, 2000))
    ) {
      set("text", "text", "text");
      x.looked.push("C2PA text manifest wrapper (U+FEFF + variation selectors)");
    }
    if (x.media === "text") x.text = text;
  }
  // a Manifest Store somewhere this reader does not parse
  if (x.stores.length === 0 && !x.unreadStore) {
    const at = indexOfBytes(b, STORE_SIGNATURE);
    // `at` is the description box's type; the superbox header (size, "jumb") and the description
    // box's own size come before it
    const start = at - 12;
    if (start >= 0 && ascii(b, at - 8, 4) === "jumb") {
      const size = new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(start);
      if (size > 0 && start + size <= b.length)
        x.stores.push({
          location: `a raw scan (byte ${start}; the container was not parsed)`,
          bytes: b.subarray(start, start + size),
        });
    }
  }
  x.looked.push("XMP dcterms:provenance");
  for (const p of findXmpPackets(b)) if (!x.xmp.some((q) => q.includes(p))) x.xmp.push(p);
  return x;
}
