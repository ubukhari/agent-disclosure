/**
 * The AI fields an XMP packet can carry: IPTC's Digital Source Type and its 2025.1 AI properties
 * (AI System Used, AI System Version Used, AI Prompt Information, AI Prompt Writer Name), a
 * `dcterms:provenance` reference to an external C2PA manifest (C2PA 2.4, 11.5), and the creator
 * tool and credit line. Unsigned metadata: anyone can write or strip it.
 */
import { decodeEntities } from "../html.js";

export const NS = {
  iptcExt: "http://iptc.org/std/Iptc4xmpExt/2008-02-29/",
  dcterms: "http://purl.org/dc/terms/",
  xmp: "http://ns.adobe.com/xap/1.0/",
  photoshop: "http://ns.adobe.com/photoshop/1.0/",
} as const;

export interface XmpFindings {
  packets: number;
  digitalSourceTypes: string[];
  aiSystemUsed?: string;
  aiSystemVersionUsed?: string;
  /** present or not; the prompt itself is not repeated */
  aiPromptInformation: boolean;
  aiPromptWriterName: boolean;
  /** a URI where an external C2PA manifest is said to be */
  provenance?: string;
  creatorTool?: string;
  credit?: string;
}

/** Every XMP packet in the bytes, as text. */
export function findXmpPackets(bytes: Uint8Array): string[] {
  const latin = new TextDecoder("latin1").decode(bytes);
  const out: string[] = [];
  let at = 0;
  while (out.length < 20) {
    const start = latin.indexOf("<x:xmpmeta", at);
    if (start < 0) break;
    const end = latin.indexOf("</x:xmpmeta>", start);
    if (end < 0) break;
    out.push(new TextDecoder().decode(bytes.subarray(start, end + "</x:xmpmeta>".length)));
    at = end + 1;
  }
  // a packet without the x:xmpmeta wrapper still has an rdf:RDF
  if (out.length === 0) {
    const start = latin.indexOf("<rdf:RDF");
    const end = latin.indexOf("</rdf:RDF>", start);
    if (start >= 0 && end > start)
      out.push(new TextDecoder().decode(bytes.subarray(start, end + "</rdf:RDF>".length)));
  }
  return out;
}

function prefixesFor(xml: string, ns: string): string[] {
  const out = new Set<string>();
  for (const m of xml.matchAll(/xmlns:([\w.-]+)\s*=\s*["']([^"']+)["']/g))
    if (m[2] === ns) out.add(m[1]!);
  return [...out];
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Every value of `prefix:name` in the packet: attribute, element text, rdf:resource or rdf:li items. */
export function valuesOf(xml: string, ns: string, name: string): string[] {
  const values: string[] = [];
  for (const p of prefixesFor(xml, ns)) {
    const q = `${esc(p)}:${esc(name)}`;
    for (const m of xml.matchAll(new RegExp(`\\s${q}\\s*=\\s*"([^"]*)"`, "g"))) values.push(m[1]!);
    for (const m of xml.matchAll(new RegExp(`\\s${q}\\s*=\\s*'([^']*)'`, "g"))) values.push(m[1]!);
    for (const m of xml.matchAll(new RegExp(`<${q}\\b([^>]*?)(/?)>`, "g"))) {
      const res = /rdf:resource\s*=\s*["']([^"']*)["']/.exec(m[1]!);
      if (res) {
        values.push(res[1]!);
        continue;
      }
      if (m[2] === "/") continue;
      const startAt = m.index! + m[0].length;
      const end = xml.indexOf(`</${p}:${name}>`, startAt);
      if (end < 0) continue;
      const inner = xml.slice(startAt, end);
      const items = [...inner.matchAll(/<rdf:li\b[^>]*>([\s\S]*?)<\/rdf:li>/g)].map((x) => x[1]!);
      for (const v of items.length ? items : [inner]) values.push(v.replace(/<[^>]+>/g, ""));
    }
  }
  return values.map((v) => decodeEntities(v).trim()).filter(Boolean);
}

export function readXmp(packets: readonly string[]): XmpFindings {
  const out: XmpFindings = {
    packets: packets.length,
    digitalSourceTypes: [],
    aiPromptInformation: false,
    aiPromptWriterName: false,
  };
  const dst = new Set<string>();
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

/** Build an XMP packet carrying IPTC fields: for the tests and the examples script. */
export function xmpPacket(fields: {
  digitalSourceType?: string;
  aiSystemUsed?: string;
  creatorTool?: string;
}): string {
  const attrs = [
    fields.digitalSourceType ? ` Iptc4xmpExt:DigitalSourceType="${fields.digitalSourceType}"` : "",
    fields.aiSystemUsed ? ` Iptc4xmpExt:AISystemUsed="${fields.aiSystemUsed}"` : "",
    fields.creatorTool ? ` xmp:CreatorTool="${fields.creatorTool}"` : "",
  ].join("");
  return `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:Iptc4xmpExt="${NS.iptcExt}" xmlns:xmp="${NS.xmp}"${attrs}/></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;
}
