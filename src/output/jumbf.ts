/**
 * Read a C2PA Manifest Store (a JUMBF superbox, ISO 19566-5) and summarise what it declares: each
 * manifest's claim generator, signer, assertions, the IPTC digital source type of its actions, an
 * AI disclosure assertion, and any soft binding (a watermark or fingerprint) it declares.
 *
 * Read, not validated: no hash is checked, no signature verified, no certificate chain built.
 * Validating takes a C2PA validator (c2patool, or contentcredentials.org/verify), and every report
 * says so.
 */
import { brotliDecompressSync } from "node:zlib";
import { asMap, asString, decodeCbor, isTagged, type CborValue } from "./cbor.js";
import { certificateNames, type CertName } from "./der.js";

export interface Box {
  type: string;
  /** the box's content, after its header */
  data: Uint8Array;
}

const LATIN1 = new TextDecoder("latin1");
const latin1 = (b: Uint8Array) => LATIN1.decode(b);

/** The boxes in `b`, in order. Stops at the first malformed header. */
export function readBoxes(b: Uint8Array): Box[] {
  const out: Box[] = [];
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let at = 0;
  while (at + 8 <= b.length) {
    let size = view.getUint32(at);
    const type = latin1(b.subarray(at + 4, at + 8));
    let header = 8;
    if (size === 1) {
      if (at + 16 > b.length) break;
      const big = view.getBigUint64(at + 8);
      if (big > BigInt(b.length)) break;
      size = Number(big);
      header = 16;
    } else if (size === 0) size = b.length - at;
    if (size < header || at + size > b.length) break;
    out.push({ type, data: b.subarray(at + header, at + size) });
    at += size;
  }
  return out;
}

export interface Superbox {
  uuid: string;
  label: string;
  children: Box[];
}

/** A 'jumb' superbox: its description (UUID and label) and the boxes after it. */
export function readSuperbox(data: Uint8Array): Superbox | null {
  const boxes = readBoxes(data);
  const desc = boxes[0];
  if (!desc || desc.type !== "jumd" || desc.data.length < 17) return null;
  const uuid = [...desc.data.subarray(0, 16)].map((x) => x.toString(16).padStart(2, "0")).join("");
  const toggles = desc.data[16]!;
  let label = "";
  if (toggles & 0x02) {
    const rest = desc.data.subarray(17);
    const nul = rest.indexOf(0);
    label = new TextDecoder().decode(nul < 0 ? rest : rest.subarray(0, nul));
  }
  return { uuid, label, children: boxes.slice(1) };
}

/** The C2PA JUMBF UUIDs: four ASCII letters and a fixed tail (C2PA 2.4, 11.1.4). */
const TAIL = "00110010800000aa00389b71";
const UUID = {
  store: `63327061${TAIL}`, // c2pa
  manifest: `63326d61${TAIL}`, // c2ma
  update: `6332756d${TAIL}`, // c2um
  assertions: `63326173${TAIL}`, // c2as
  claim: `6332636c${TAIL}`, // c2cl
  signature: `63326373${TAIL}`, // c2cs
} as const;

/** The bytes of the description box that opens every C2PA Manifest Store, for a raw scan. */
export const STORE_SIGNATURE = Uint8Array.from([
  0x6a, 0x75, 0x6d, 0x64, 0x63, 0x32, 0x70, 0x61, 0x00, 0x11, 0x00, 0x10, 0x80, 0x00, 0x00, 0xaa,
  0x00, 0x38, 0x9b, 0x71,
]);

export interface ActionSummary {
  action: string;
  digitalSourceType?: string;
  softwareAgent?: string;
  when?: string;
}

export interface ManifestSummary {
  label: string;
  update: boolean;
  claimGenerator?: string;
  instanceId?: string;
  title?: string;
  signature: {
    present: boolean;
    alg?: string;
    signer?: CertName;
    issuer?: CertName;
    timeStamped: boolean;
  };
  assertions: string[];
  actions: ActionSummary[];
  digitalSourceTypes: string[];
  aiDisclosure?: {
    modelType?: string;
    modelName?: string;
    modelIdentifier?: string;
    humanOversightLevel?: string;
  };
  softBindings: string[];
  watermarkDeclared: boolean;
  /** a compressed ('brob') manifest this reader could not open */
  compressed: boolean;
}

export interface StoreSummary {
  manifests: ManifestSummary[];
  /** the last manifest in the store (C2PA: the active manifest) */
  active?: ManifestSummary;
  problems: string[];
}

const ALGS: Record<string, string> = {
  "-7": "ES256",
  "-35": "ES384",
  "-36": "ES512",
  "-37": "PS256",
  "-38": "PS384",
  "-39": "PS512",
  "-8": "Ed25519",
};

const DST = /^https?:\/\/cv\.iptc\.org\/newscodes\/digitalsourcetype\/[A-Za-z]+$/;

function generatorName(v: CborValue): string | undefined {
  if (typeof v === "string") return v;
  const m = asMap(v);
  if (m) {
    const name = asString(m["name"]);
    const ver = asString(m["version"]);
    return name ? (ver ? `${name} ${ver}` : name) : undefined;
  }
  if (Array.isArray(v)) return v.map(generatorName).filter(Boolean).join(", ") || undefined;
  return undefined;
}

function contentOf(sb: Superbox): CborValue | undefined {
  for (const c of sb.children) {
    try {
      if (c.type === "cbor") return decodeCbor(c.data);
      if (c.type === "json") return JSON.parse(new TextDecoder().decode(c.data)) as CborValue;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** Every IPTC digital source type URI anywhere in an assertion's decoded value. */
function sourceTypesIn(v: CborValue | undefined, out: Set<string>, depth = 0): void {
  if (v === undefined || v === null || depth > 20) return;
  if (typeof v === "string") {
    if (DST.test(v)) out.add(v);
  } else if (Array.isArray(v)) for (const x of v) sourceTypesIn(x, out, depth + 1);
  else if (isTagged(v)) sourceTypesIn(v.value, out, depth + 1);
  else if (typeof v === "object" && !(v instanceof Uint8Array))
    for (const x of Object.values(v)) sourceTypesIn(x, out, depth + 1);
}

function readSignature(sb: Superbox): ManifestSummary["signature"] {
  const out: ManifestSummary["signature"] = { present: true, timeStamped: false };
  let v: CborValue | undefined;
  try {
    v = contentOf(sb);
  } catch {
    return out;
  }
  const arr = isTagged(v ?? null) ? (v as { value: CborValue }).value : v;
  if (!Array.isArray(arr) || arr.length < 4) return out;
  const headers: Record<string, CborValue>[] = [];
  if (arr[0] instanceof Uint8Array && arr[0].length > 0) {
    try {
      const m = asMap(decodeCbor(arr[0]));
      if (m) headers.push(m);
    } catch {
      /* unreadable protected header */
    }
  }
  const unprotected = asMap(arr[1] ?? null);
  if (unprotected) headers.push(unprotected);
  for (const h of headers) {
    if (h["1"] !== undefined && out.alg === undefined)
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
    if (h["sigTst"] !== undefined || h["sigTst2"] !== undefined) out.timeStamped = true;
  }
  return out;
}

function readManifest(sb: Superbox): ManifestSummary {
  const m: ManifestSummary = {
    label: sb.label,
    update: sb.uuid === UUID.update,
    signature: { present: false, timeStamped: false },
    assertions: [],
    actions: [],
    digitalSourceTypes: [],
    softBindings: [],
    watermarkDeclared: false,
    compressed: false,
  };
  let children = sb.children;
  const brob = children.find((c) => c.type === "brob");
  if (brob) {
    try {
      children = readBoxes(new Uint8Array(brotliDecompressSync(brob.data.subarray(4))));
    } catch {
      m.compressed = true;
      return m;
    }
  }
  const dst = new Set<string>();
  for (const c of children) {
    if (c.type !== "jumb") continue;
    const child = readSuperbox(c.data);
    if (!child) continue;
    if (child.uuid === UUID.claim) {
      const claim = asMap(contentOf(child) ?? null);
      if (claim) {
        m.claimGenerator =
          generatorName(claim["claim_generator_info"] ?? null) ??
          asString(claim["claim_generator"]);
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
          const actions = Array.isArray(value?.["actions"])
            ? (value["actions"] as CborValue[])
            : [];
          for (const raw of actions.slice(0, 50)) {
            const act = asMap(raw);
            if (!act) continue;
            const action = asString(act["action"]) ?? "";
            const summary: ActionSummary = { action };
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
            humanOversightLevel: asString(profile?.["humanOversightLevel"] ?? null),
          };
        }
      }
    }
  }
  m.digitalSourceTypes = [...dst];
  return m;
}

/** Summarise a C2PA Manifest Store from its bytes (the whole 'jumb' box, header included). */
export function summariseStore(bytes: Uint8Array): StoreSummary {
  const problems: string[] = [];
  const top = readBoxes(bytes).find((b) => b.type === "jumb");
  const store = top ? readSuperbox(top.data) : null;
  if (!store || store.uuid !== UUID.store) {
    return { manifests: [], problems: ["the C2PA box could not be read as a Manifest Store"] };
  }
  const manifests: ManifestSummary[] = [];
  for (const c of store.children) {
    if (c.type !== "jumb") continue;
    const sb = readSuperbox(c.data);
    if (!sb || (sb.uuid !== UUID.manifest && sb.uuid !== UUID.update)) continue;
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

/** Build a JUMBF superbox: for the tests and the examples script. */
export function jumbBox(uuidHex: string, label: string, children: Uint8Array[]): Uint8Array {
  const labelBytes = new TextEncoder().encode(label);
  const jumdData = new Uint8Array(16 + 1 + labelBytes.length + 1);
  for (let i = 0; i < 16; i++) jumdData[i] = parseInt(uuidHex.slice(i * 2, i * 2 + 2), 16);
  jumdData[16] = 0x03; // requestable, label present
  jumdData.set(labelBytes, 17);
  return box("jumb", [box("jumd", [jumdData]), ...children]);
}

export function box(type: string, parts: Uint8Array[]): Uint8Array {
  const size = 8 + parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(size);
  new DataView(out.buffer).setUint32(0, size);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  let at = 8;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

export const C2PA_UUID = UUID;
