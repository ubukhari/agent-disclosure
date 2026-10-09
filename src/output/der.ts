/**
 * Read the subject of an X.509 certificate (DER): who a C2PA manifest says signed it. This reads a
 * name; it does not validate the certificate, its chain or the signature.
 */

interface Tlv {
  tag: number;
  start: number; // first content byte
  end: number; // one past the last content byte
}

function readTlv(b: Uint8Array, at: number): Tlv | null {
  if (at + 2 > b.length) return null;
  const tag = b[at]!;
  let len = b[at + 1]!;
  let p = at + 2;
  if (len & 0x80) {
    const n = len & 0x7f;
    if (n === 0 || n > 4 || p + n > b.length) return null;
    len = 0;
    for (let i = 0; i < n; i++) len = len * 256 + b[p + i]!;
    p += n;
  }
  if (p + len > b.length) return null;
  return { tag, start: p, end: p + len };
}

function children(b: Uint8Array, t: Tlv): Tlv[] {
  const out: Tlv[] = [];
  let at = t.start;
  while (at < t.end) {
    const c = readTlv(b, at);
    if (!c) break;
    out.push(c);
    at = c.end;
  }
  return out;
}

const OIDS: Record<string, "CN" | "O" | "C" | "OU"> = {
  "2.5.4.3": "CN",
  "2.5.4.10": "O",
  "2.5.4.6": "C",
  "2.5.4.11": "OU",
};

function oid(b: Uint8Array, t: Tlv): string {
  const bytes = b.subarray(t.start, t.end);
  if (bytes.length === 0) return "";
  const parts = [Math.floor(bytes[0]! / 40), bytes[0]! % 40];
  let v = 0;
  for (let i = 1; i < bytes.length; i++) {
    v = v * 128 + (bytes[i]! & 0x7f);
    if (!(bytes[i]! & 0x80)) {
      parts.push(v);
      v = 0;
    }
  }
  return parts.join(".");
}

export interface CertName {
  CN?: string;
  O?: string;
  OU?: string;
  C?: string;
}

/** The subject (and issuer) names of a DER certificate, or null if it is not one. */
export function certificateNames(der: Uint8Array): { subject: CertName; issuer: CertName } | null {
  const cert = readTlv(der, 0);
  if (!cert || cert.tag !== 0x30) return null;
  const [tbs] = children(der, cert);
  if (!tbs || tbs.tag !== 0x30) return null;
  const fields = children(der, tbs);
  // [0] version is optional; then serial, signature algorithm, issuer, validity, subject
  const offset = fields[0]?.tag === 0xa0 ? 1 : 0;
  const issuer = fields[offset + 2];
  const subject = fields[offset + 4];
  if (!issuer || !subject) return null;
  return { subject: readName(der, subject), issuer: readName(der, issuer) };
}

function readName(b: Uint8Array, name: Tlv): CertName {
  const out: CertName = {};
  for (const set of children(b, name)) {
    for (const atv of children(b, set)) {
      const [o, value] = children(b, atv);
      if (!o || !value || o.tag !== 0x06) continue;
      const key = OIDS[oid(b, o)];
      if (!key || out[key]) continue;
      out[key] = new TextDecoder().decode(b.subarray(value.start, value.end));
    }
  }
  return out;
}
