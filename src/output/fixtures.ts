/**
 * Synthetic C2PA Manifest Stores and containers for the tests: built here from the C2PA 2.4 box
 * layout, never taken from a real generator. The certificate is a throwaway self-signed one
 * (O=Example Generator Inc.) made for these tests; its signature bytes are zeros, because this
 * tool reads manifests and never validates them.
 */
import { crc32, deflateSync } from "node:zlib";
import { encodeCbor, Tagged } from "./cbor.js";
import { box, C2PA_UUID, jumbBox } from "./jumbf.js";

export const TEST_CERT = new Uint8Array(
  Buffer.from(
    "MIIB+zCCAaGgAwIBAgIUVZiaqGUD8EkZNp0OInVkdybXbgIwCgYIKoZIzj0EAwIwUzELMAkGA1UEBhMCVVMxHzAdBgNVBAoMFkV4YW1wbGUgR2VuZXJhdG9yIEluYy4xIzAhBgNVBAMMGkV4YW1wbGUgSW1hZ2UgTW9kZWwgc2lnbmVyMB4XDTI2MTAwOTA1NTY1OVoXDTM2MTAwNjA1NTY1OVowUzELMAkGA1UEBhMCVVMxHzAdBgNVBAoMFkV4YW1wbGUgR2VuZXJhdG9yIEluYy4xIzAhBgNVBAMMGkV4YW1wbGUgSW1hZ2UgTW9kZWwgc2lnbmVyMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEHapaeRzdBJpc9ImtdgriZesVhedBgMtD0OlI8GlVziw0/iZSgYtJwxnRcmS9bP0i4507Ennc6J7mVDTjjjmpQKNTMFEwHQYDVR0OBBYEFBeoR/M7pnhSCrF2men5wRHfrYBzMB8GA1UdIwQYMBaAFBeoR/M7pnhSCrF2men5wRHfrYBzMA8GA1UdEwEB/wQFMAMBAf8wCgYIKoZIzj0EAwIDSAAwRQIgG4ciL8sHdcGYrwqPPE3zz7ixHOPgCrZwy5hZxK9mz9ECIQC1kB9pd0FgabeLlos+QV/MdDlTYJESRrHOr0vkBOYWlw==",
    "base64",
  ),
);

const CBOR_UUID = "63626f7200110010800000aa00389b71";
const cborAssertion = (label: string, value: Parameters<typeof encodeCbor>[0]) =>
  jumbBox(CBOR_UUID, label, [box("cbor", [encodeCbor(value)])]);

export interface StoreOptions {
  digitalSourceType?: string;
  generator?: { name: string; version: string };
  softBinding?: string;
  aiDisclosure?: { modelType: string; modelName: string };
  label?: string;
}

export const TRAINED = "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia";

export function syntheticStore(o: StoreOptions = {}): Uint8Array {
  const assertions = [
    cborAssertion("c2pa.actions.v2", {
      actions: [
        {
          action: "c2pa.created",
          digitalSourceType: o.digitalSourceType ?? TRAINED,
          softwareAgent: o.generator ?? { name: "Example Image Model", version: "3.1" },
          when: "2026-10-08T12:00:00Z",
        },
      ],
    }),
    cborAssertion("c2pa.hash.data", {
      alg: "sha256",
      hash: new Uint8Array(32),
      name: "jumbf manifest",
    }),
  ];
  if (o.softBinding)
    assertions.push(cborAssertion("c2pa.soft-binding", { alg: o.softBinding, blocks: [] }));
  if (o.aiDisclosure)
    assertions.push(
      cborAssertion("c2pa.ai-disclosure", {
        modelType: o.aiDisclosure.modelType,
        modelName: o.aiDisclosure.modelName,
        contentProfile: { humanOversightLevel: "prompt_guided" },
      }),
    );
  const claim = jumbBox(C2PA_UUID.claim, "c2pa.claim.v2", [
    box("cbor", [
      encodeCbor({
        claim_generator_info: o.generator ?? { name: "Example Image Model", version: "3.1" },
        instanceID: "xmp:iid:00000000-0000-4000-8000-000000000001",
        alg: "sha256",
      }),
    ]),
  ]);
  const signature = jumbBox(C2PA_UUID.signature, "c2pa.signature", [
    box("cbor", [
      encodeCbor(
        new Tagged(18, [
          encodeCbor({ "1": -7 }),
          { "33": [TEST_CERT], sigTst2: {} },
          null,
          new Uint8Array(64),
        ]),
      ),
    ]),
  ]);
  const manifest = jumbBox(
    C2PA_UUID.manifest,
    o.label ?? "urn:c2pa:00000000-0000-4000-8000-0000000000aa",
    [jumbBox(C2PA_UUID.assertions, "c2pa.assertions", assertions), claim, signature],
  );
  return jumbBox(C2PA_UUID.store, "c2pa", [manifest]);
}

// ——— containers ———

function u32be(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return b;
}

export function pngChunk(type: string, data: Uint8Array): Buffer {
  const body = Buffer.concat([Buffer.from(type, "latin1"), Buffer.from(data)]);
  return Buffer.concat([u32be(data.length), body, u32be(crc32(body))]);
}

/** A 1×1 PNG with extra chunks after IHDR. */
export function pngWith(...chunks: Buffer[]): Uint8Array {
  const ihdr = Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]);
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      pngChunk("IHDR", ihdr),
      ...chunks,
      pngChunk("IDAT", deflateSync(Buffer.from([0, 0, 0, 0]))),
      pngChunk("IEND", new Uint8Array(0)),
    ]),
  );
}

export function itxtChunk(keyword: string, text: string): Buffer {
  return pngChunk(
    "iTXt",
    Buffer.concat([
      Buffer.from(keyword, "latin1"),
      Buffer.from([0, 0, 0, 0, 0]),
      Buffer.from(text, "utf8"),
    ]),
  );
}

function jpegSegment(marker: number, payload: Uint8Array): Buffer {
  const len = Buffer.alloc(2);
  len.writeUInt16BE(payload.length + 2);
  return Buffer.concat([Buffer.from([0xff, marker]), len, Buffer.from(payload)]);
}

/** A JPEG skeleton whose C2PA store is split over APP11 segments of at most `chunk` bytes (JPEG XT). */
export function jpegWith(
  store: Uint8Array | null,
  opts: { chunk?: number; xmp?: string } = {},
): Uint8Array {
  const segs: Buffer[] = [Buffer.from([0xff, 0xd8])];
  if (opts.xmp)
    segs.push(
      jpegSegment(
        0xe1,
        Buffer.concat([
          Buffer.from("http://ns.adobe.com/xap/1.0/\0", "latin1"),
          Buffer.from(opts.xmp, "utf8"),
        ]),
      ),
    );
  if (store) {
    const header = store.subarray(0, 8); // LBox + TBox, repeated in each segment
    const body = store.subarray(8);
    const size = opts.chunk ?? 60_000;
    let seq = 1;
    for (let at = 0; at < body.length || seq === 1; at += size) {
      const ci = Buffer.from([0x4a, 0x50, 0x00, 0x01]);
      const z = u32be(seq++);
      segs.push(jpegSegment(0xeb, Buffer.concat([ci, z, header, body.subarray(at, at + size)])));
      if (at + size >= body.length) break;
    }
  }
  segs.push(Buffer.from([0xff, 0xda, 0x00, 0x02, 0x00, 0xff, 0xd9]));
  return new Uint8Array(Buffer.concat(segs));
}

export function riffWith(form: "WEBP" | "WAVE", chunks: [string, Uint8Array][]): Uint8Array {
  const parts = chunks.map(([id, d]) => {
    const size = Buffer.alloc(4);
    size.writeUInt32LE(d.length);
    return Buffer.concat([
      Buffer.from(id, "latin1"),
      size,
      Buffer.from(d),
      d.length & 1 ? Buffer.from([0]) : Buffer.alloc(0),
    ]);
  });
  const body = Buffer.concat([Buffer.from(form, "latin1"), ...parts]);
  const size = Buffer.alloc(4);
  size.writeUInt32LE(body.length);
  return new Uint8Array(Buffer.concat([Buffer.from("RIFF", "latin1"), size, body]));
}

const C2PA_BMFF_UUID = Buffer.from("d8fec3d61b0e483c92975828877ec481", "hex");

export function mp4With(store: Uint8Array): Uint8Array {
  const ftyp = box("ftyp", [Buffer.from("isom\0\0\x02\0isomiso2mp41", "latin1")]);
  const uuid = box("uuid", [
    C2PA_BMFF_UUID,
    Buffer.from([0, 0, 0, 0]),
    Buffer.from("manifest\0", "latin1"),
    Buffer.alloc(8),
    store,
  ]);
  const mdat = box("mdat", [Buffer.alloc(16)]);
  return new Uint8Array(Buffer.concat([ftyp, uuid, mdat]));
}

function syncsafe(n: number): Buffer {
  return Buffer.from([(n >> 21) & 0x7f, (n >> 14) & 0x7f, (n >> 7) & 0x7f, n & 0x7f]);
}

export function mp3With(store: Uint8Array): Uint8Array {
  const geob = Buffer.concat([
    Buffer.from([0]),
    Buffer.from("application/c2pa\0", "latin1"),
    Buffer.from("manifest.c2pa\0", "latin1"),
    Buffer.from("C2PA manifest store\0", "latin1"),
    Buffer.from(store),
  ]);
  const frame = Buffer.concat([
    Buffer.from("GEOB", "latin1"),
    syncsafe(geob.length),
    Buffer.from([0, 0]),
    geob,
  ]);
  const header = Buffer.concat([
    Buffer.from("ID3", "latin1"),
    Buffer.from([4, 0, 0]),
    syncsafe(frame.length),
  ]);
  return new Uint8Array(
    Buffer.concat([header, frame, Buffer.from([0xff, 0xfb, 0x90, 0x00]), Buffer.alloc(64)]),
  );
}

/** A PDF whose C2PA store is an embedded file stream, named by a Filespec with AFRelationship C2PA_Manifest. */
export function pdfWith(store: Uint8Array): Uint8Array {
  const z = deflateSync(Buffer.from(store));
  const parts: (string | Buffer)[] = [
    "%PDF-1.7\n",
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R /AF [4 0 R] >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\n",
    `3 0 obj\n<< /Type /EmbeddedFile /Length ${z.length} /Filter /FlateDecode >>\nstream\n`,
    z,
    "\nendstream\nendobj\n",
    "4 0 obj\n<< /Type /Filespec /F (manifest.c2pa) /AFRelationship /C2PA_Manifest /EF << /F 3 0 R >> >>\nendobj\n",
    "5 0 obj\n<< /Producer (Example PDF Writer) >>\nendobj\ntrailer\n<< /Root 1 0 R /Info 5 0 R >>\n%%EOF\n",
  ];
  return new Uint8Array(
    Buffer.concat(parts.map((p) => (typeof p === "string" ? Buffer.from(p, "latin1") : p))),
  );
}
