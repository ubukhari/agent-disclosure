/**
 * Text artefacts: a C2PA manifest embedded in unstructured text (C2PA 2.4, A.8: a U+FEFF followed
 * by Unicode variation selectors that encode "C2PATXT\0", a version, a length and the Manifest
 * Store), and an inventory of the invisible characters text can carry. A statistical watermark in
 * the wording itself cannot be seen without the generator's own detector.
 */

export interface InvisibleCount {
  /** U+200B–U+200D, U+2060 */
  zeroWidth: number;
  /** U+FEFF not at the very start */
  byteOrderMarks: number;
  /** U+FE00–U+FE0F and U+E0100–U+E01EF */
  variationSelectors: number;
  /** U+E0000–U+E007F */
  tagCharacters: number;
  /** U+202A–U+202E, U+2066–U+2069 */
  bidiControls: number;
}

export interface TextFindings {
  characters: number;
  invisible: InvisibleCount;
  /** the Manifest Store bytes, when a C2PATextManifestWrapper was found */
  c2paStore?: Uint8Array;
  c2paProblem?: string;
}

const MAGIC = [0x43, 0x32, 0x50, 0x41, 0x54, 0x58, 0x54, 0x00]; // "C2PATXT\0"

function vsByte(cp: number): number | null {
  if (cp >= 0xfe00 && cp <= 0xfe0f) return cp - 0xfe00;
  if (cp >= 0xe0100 && cp <= 0xe01ef) return cp - 0xe0100 + 16;
  return null;
}

export function checkText(text: string): TextFindings {
  const cps = Array.from(text, (c) => c.codePointAt(0)!);
  const invisible: InvisibleCount = {
    zeroWidth: 0,
    byteOrderMarks: 0,
    variationSelectors: 0,
    tagCharacters: 0,
    bidiControls: 0,
  };
  const out: TextFindings = { characters: cps.length, invisible };
  for (let i = 0; i < cps.length; i++) {
    const cp = cps[i]!;
    if ((cp >= 0x200b && cp <= 0x200d) || cp === 0x2060) invisible.zeroWidth++;
    else if (cp === 0xfeff && i > 0) invisible.byteOrderMarks++;
    else if (vsByte(cp) !== null) invisible.variationSelectors++;
    else if (cp >= 0xe0000 && cp <= 0xe007f) invisible.tagCharacters++;
    else if ((cp >= 0x202a && cp <= 0x202e) || (cp >= 0x2066 && cp <= 0x2069))
      invisible.bidiControls++;
    if (cp !== 0xfeff || out.c2paStore) continue;
    // a potential C2PATextManifestWrapper: the run of variation selectors after U+FEFF
    const bytes: number[] = [];
    for (let j = i + 1; j < cps.length; j++) {
      const b = vsByte(cps[j]!);
      if (b === null) break;
      bytes.push(b);
    }
    if (bytes.length < 13 || !MAGIC.every((m, k) => bytes[k] === m)) continue;
    const version = bytes[8]!;
    const length = ((bytes[9]! << 24) | (bytes[10]! << 16) | (bytes[11]! << 8) | bytes[12]!) >>> 0;
    if (version !== 1)
      out.c2paProblem = `C2PA text wrapper version ${version}; this reader knows version 1`;
    if (13 + length > bytes.length) {
      out.c2paProblem = "the C2PA text wrapper is shorter than the length it declares";
      continue;
    }
    out.c2paStore = Uint8Array.from(bytes.slice(13, 13 + length));
  }
  return out;
}

/** Encode a Manifest Store as a C2PATextManifestWrapper: for the tests. */
export function wrapText(store: Uint8Array): string {
  const head = [
    ...MAGIC,
    1,
    (store.length >>> 24) & 0xff,
    (store.length >>> 16) & 0xff,
    (store.length >>> 8) & 0xff,
    store.length & 0xff,
  ];
  const all = [...head, ...store];
  return (
    "\uFEFF" + all.map((b) => String.fromCodePoint(b < 16 ? 0xfe00 + b : 0xe0100 + b - 16)).join("")
  );
}

export function invisibleTotal(c: InvisibleCount): number {
  return c.zeroWidth + c.byteOrderMarks + c.variationSelectors + c.tagCharacters + c.bidiControls;
}
