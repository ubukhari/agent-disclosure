/**
 * A CBOR decoder (RFC 8949) for what a C2PA manifest stores: the claim, the assertions and the
 * COSE signature. Maps become plain objects (non-text keys are stringified), byte strings
 * Uint8Arrays, tags `Tagged`. Bounded: it refuses deep nesting and lengths past the input.
 */

export class Tagged {
  constructor(
    readonly tag: number,
    readonly value: CborValue,
  ) {}
}
export type CborValue =
  | number
  | bigint
  | string
  | boolean
  | null
  | undefined
  | Uint8Array
  | CborValue[]
  | { [key: string]: CborValue }
  | Tagged;

export class CborError extends Error {}

export function decodeCbor(bytes: Uint8Array): CborValue {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 0;
  const need = (n: number) => {
    if (n < 0 || pos + n > bytes.length) throw new CborError("CBOR runs past its end");
  };
  const readArg = (info: number): number | bigint | null => {
    if (info < 24) return info;
    if (info === 24) {
      need(1);
      return bytes[pos++]!;
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
    if (info === 31) return null; // indefinite
    throw new CborError(`reserved additional info ${info}`);
  };
  const text = new TextDecoder("utf-8", { fatal: false });

  const item = (depth: number): CborValue => {
    if (depth > 64) throw new CborError("CBOR nested too deeply");
    need(1);
    const first = bytes[pos++]!;
    const major = first >> 5;
    const info = first & 0x1f;
    if (major === 7) {
      if (info === 20) return false;
      if (info === 21) return true;
      if (info === 22) return null;
      if (info === 23) return undefined;
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
        return bytes[pos++]!;
      }
      throw new CborError("unexpected break");
    }
    const arg = readArg(info);
    switch (major) {
      case 0:
        return arg as number | bigint;
      case 1:
        return typeof arg === "bigint" ? -1n - arg : -1 - (arg as number);
      case 2:
      case 3: {
        let out: Uint8Array;
        if (arg === null) {
          const parts: Uint8Array[] = [];
          for (;;) {
            need(1);
            if (bytes[pos] === 0xff) {
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
        const arr: CborValue[] = [];
        if (arg === null) {
          for (;;) {
            need(1);
            if (bytes[pos] === 0xff) {
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
        const obj: { [key: string]: CborValue } = {};
        const entry = () => {
          const k = item(depth + 1);
          const v = item(depth + 1);
          obj[typeof k === "string" ? k : String(k)] = v;
        };
        if (arg === null) {
          for (;;) {
            need(1);
            if (bytes[pos] === 0xff) {
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

function halfToNumber(h: number): number {
  const s = h & 0x8000 ? -1 : 1;
  const e = (h >> 10) & 0x1f;
  const f = h & 0x3ff;
  if (e === 0) return s * 2 ** -14 * (f / 1024);
  if (e === 31) return f ? NaN : s * Infinity;
  return s * 2 ** (e - 15) * (1 + f / 1024);
}

export function isTagged(v: CborValue): v is Tagged {
  return v instanceof Tagged;
}

export function asMap(v: CborValue): { [key: string]: CborValue } | undefined {
  return typeof v === "object" &&
    v !== null &&
    !Array.isArray(v) &&
    !(v instanceof Uint8Array) &&
    !isTagged(v)
    ? v
    : undefined;
}

export function asString(v: CborValue): string | undefined {
  return typeof v === "string" ? v : undefined;
}

/** A tiny encoder for the tests and the examples script: maps with text keys, arrays, text, bytes, ints. */
export function encodeCbor(v: CborValue): Uint8Array {
  const out: number[] = [];
  const head = (major: number, n: number) => {
    if (n < 24) out.push((major << 5) | n);
    else if (n < 0x100) out.push((major << 5) | 24, n);
    else if (n < 0x10000) out.push((major << 5) | 25, n >> 8, n & 0xff);
    else
      out.push((major << 5) | 26, (n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff);
  };
  const enc = (x: CborValue) => {
    if (x === null) out.push(0xf6);
    else if (x === undefined) out.push(0xf7);
    else if (x === true) out.push(0xf5);
    else if (x === false) out.push(0xf4);
    else if (typeof x === "number") {
      if (Number.isInteger(x) && x >= 0) head(0, x);
      else if (Number.isInteger(x)) head(1, -1 - x);
      else throw new Error("floats are not encoded here");
    } else if (typeof x === "bigint") throw new Error("bigints are not encoded here");
    else if (typeof x === "string") {
      const b = new TextEncoder().encode(x);
      head(3, b.length);
      out.push(...b);
    } else if (x instanceof Uint8Array) {
      head(2, x.length);
      for (const b of x) out.push(b);
    } else if (Array.isArray(x)) {
      head(4, x.length);
      x.forEach(enc);
    } else if (isTagged(x)) {
      head(6, x.tag);
      enc(x.value);
    } else {
      const entries = Object.entries(x);
      head(5, entries.length);
      for (const [k, val] of entries) {
        if (/^-?\d+$/.test(k)) enc(Number(k));
        else enc(k);
        enc(val);
      }
    }
  };
  enc(v);
  return Uint8Array.from(out);
}
