/**
 * A minimal PDF writer for the readiness report: A4 pages of text in the standard Helvetica and
 * Courier fonts (no embedded fonts, no dependencies), WinAnsi-encoded, with a footer on each page.
 */

export interface PdfLine {
  text: string;
  style: "title" | "heading" | "body" | "mono" | "small";
}

const STYLE = {
  title: { font: "F2", size: 15, lead: 22, width: 0.56 },
  heading: { font: "F2", size: 10.5, lead: 16, width: 0.56 },
  body: { font: "F1", size: 9, lead: 12.5, width: 0.5 },
  mono: { font: "F3", size: 7.4, lead: 9.2, width: 0.6 },
  small: { font: "F1", size: 7.5, lead: 10, width: 0.5 },
} as const;

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 48;
const TEXT_W = PAGE_W - 2 * MARGIN;

/** Unicode → WinAnsiEncoding (PDF 32000-1, Annex D); anything else becomes "?". */
const WIN: Record<string, number> = {
  "€": 0x80,
  "‚": 0x82,
  "„": 0x84,
  "…": 0x85,
  "‘": 0x91,
  "’": 0x92,
  "“": 0x93,
  "”": 0x94,
  "•": 0x95,
  "–": 0x96,
  "—": 0x97,
  "™": 0x99,
};
const REPLACE: Record<string, string> = {
  "→": "->",
  "←": "<-",
  "≥": ">=",
  "≤": "<=",
  "✓": "v",
  "×": "x",
};

export function winAnsi(s: string): number[] {
  const out: number[] = [];
  for (const ch of s) {
    const r = REPLACE[ch];
    if (r) {
      for (const c of r) out.push(c.charCodeAt(0));
      continue;
    }
    const cp = ch.codePointAt(0)!;
    if (cp >= 0x20 && cp < 0x7f) out.push(cp);
    else if (WIN[ch] !== undefined) out.push(WIN[ch]);
    else if (cp >= 0xa0 && cp <= 0xff) out.push(cp);
    else if (cp === 0x09) out.push(0x20);
    else out.push(0x3f);
  }
  return out;
}

function pdfString(s: string): string {
  return `(${winAnsi(s)
    .map((b) =>
      b === 0x28 || b === 0x29 || b === 0x5c
        ? `\\${String.fromCharCode(b)}`
        : b < 0x20 || b > 0x7e
          ? `\\${b.toString(8).padStart(3, "0")}`
          : String.fromCharCode(b),
    )
    .join("")})`;
}

function wrapTo(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const indent = /^\s*/.exec(text)![0];
  const out: string[] = [];
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

export function renderPdf(
  lines: readonly PdfLine[],
  meta: { title: string; footer: string; created: Date },
): Uint8Array {
  // lay out lines into pages
  const pages: string[][] = [[]];
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
        pages
          .at(-1)!
          .push(
            `BT /${st.font} ${st.size} Tf ${MARGIN} ${y.toFixed(2)} Td ${pdfString(part)} Tj ET`,
          );
    }
  }
  const objects: string[] = [];
  const add = (body: string) => {
    objects.push(body);
    return objects.length;
  };
  const catalog = add("");
  const pagesObj = add("");
  const f1 = add(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  );
  const f2 = add(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  );
  const f3 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>");
  const kids: number[] = [];
  pages.forEach((ops, i) => {
    const foot = `BT /F1 7 Tf ${MARGIN} ${MARGIN - 10} Td ${pdfString(`${meta.footer} · page ${i + 1} of ${pages.length}`)} Tj ET`;
    const stream = [...ops, foot].join("\n");
    const content = add(
      `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`,
    );
    kids.push(
      add(
        `<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R /F3 ${f3} 0 R >> >> /Contents ${content} 0 R >>`,
      ),
    );
  });
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objects[pagesObj - 1] =
    `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;
  const d = meta.created.toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const info = add(
    `<< /Title ${pdfString(meta.title)} /Producer (agent-disclosure) /CreationDate (D:${d}Z) >>`,
  );

  let out = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out, "latin1"));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(out, "latin1"));
}
