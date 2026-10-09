#!/usr/bin/env node
/**
 * Write the synthetic images `demo` checks, deterministically:
 *
 *   pnpm --filter agent-disclosure examples
 *
 * - examples/unmarked.png: a 32×32 gradient with no metadata at all;
 * - examples/iptc-only.png: the same pixels with an XMP packet carrying IPTC's DigitalSourceType
 *   "trainedAlgorithmicMedia" and AISystemUsed, unsigned, and no C2PA manifest.
 *
 * Neither came from a generator: both are drawn here. src/main.test.ts fails while the files on
 * disk differ from what this script writes.
 */
import { writeFileSync } from "node:fs";
import { crc32, deflateSync } from "node:zlib";

const SIZE = 32;

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

export function png(extraChunks = []) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour
  const rows = [];
  for (let y = 0; y < SIZE; y++) {
    const row = Buffer.alloc(1 + SIZE * 3);
    for (let x = 0; x < SIZE; x++) {
      row[1 + x * 3] = x * 8;
      row[2 + x * 3] = y * 8;
      row[3 + x * 3] = 160;
    }
    rows.push(row);
  }
  const idat = deflateSync(Buffer.concat(rows), { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    ...extraChunks,
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export const XMP = `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/" Iptc4xmpExt:DigitalSourceType="http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia" Iptc4xmpExt:AISystemUsed="Example Image Model (synthetic)"/></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;

export function itxt(keyword, text) {
  return chunk(
    "iTXt",
    Buffer.concat([
      Buffer.from(keyword, "latin1"),
      Buffer.from([0, 0, 0, 0, 0]),
      Buffer.from(text, "utf8"),
    ]),
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = new URL("../examples/", import.meta.url);
  writeFileSync(new URL("unmarked.png", dir), png());
  writeFileSync(new URL("iptc-only.png", dir), png([itxt("XML:com.adobe.xmp", XMP)]));
  console.log("wrote examples/unmarked.png and examples/iptc-only.png");
}
