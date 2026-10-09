import { describe, expect, it } from "vitest";
import { decodeCbor, encodeCbor, Tagged } from "./cbor.js";
import { checkOutput } from "./check.js";
import { certificateNames } from "./der.js";
import {
  itxtChunk,
  jpegWith,
  mp3With,
  mp4With,
  pdfWith,
  pngChunk,
  pngWith,
  riffWith,
  syntheticStore,
  TEST_CERT,
  TRAINED,
} from "./fixtures.js";
import { summariseStore } from "./jumbf.js";
import { checkText, wrapText } from "./text.js";
import { readXmp, xmpPacket } from "./xmp.js";

const check = (bytes: Uint8Array, name = "file.bin") =>
  checkOutput({ source: "file", name, bytes });

describe("CBOR", () => {
  it("round-trips what a manifest stores", () => {
    const value = { a: 1, b: "two", c: [true, null, new Uint8Array([1, 2])], d: { e: -5 } };
    expect(decodeCbor(encodeCbor(value))).toEqual(value);
  });

  it("keeps tags apart from maps that happen to have tag and value keys", () => {
    expect(decodeCbor(encodeCbor(new Tagged(18, [1])))).toBeInstanceOf(Tagged);
    expect(decodeCbor(encodeCbor({ tag: 1, value: 2 }))).toEqual({ tag: 1, value: 2 });
  });

  it("refuses input that runs past its end", () => {
    expect(() => decodeCbor(Uint8Array.from([0x5a, 0xff, 0xff, 0xff, 0xff]))).toThrow(
      /past its end/,
    );
  });
});

describe("certificate names", () => {
  it("reads the subject and issuer of a DER certificate", () => {
    expect(certificateNames(TEST_CERT)).toEqual({
      subject: { C: "US", O: "Example Generator Inc.", CN: "Example Image Model signer" },
      issuer: { C: "US", O: "Example Generator Inc.", CN: "Example Image Model signer" },
    });
    expect(certificateNames(Uint8Array.from([1, 2, 3]))).toBeNull();
  });
});

describe("a C2PA Manifest Store", () => {
  it("is summarised: generator, signer, actions, digital source type, AI disclosure, soft binding", () => {
    const s = summariseStore(
      syntheticStore({
        softBinding: "com.example.watermark.1",
        aiDisclosure: { modelType: "c2pa.types.model", modelName: "Example Image Model" },
      }),
    );
    expect(s.problems).toEqual([]);
    expect(s.manifests).toHaveLength(1);
    const m = s.active!;
    expect(m.claimGenerator).toBe("Example Image Model 3.1");
    expect(m.signature).toMatchObject({
      present: true,
      alg: "ES256",
      timeStamped: true,
      signer: { O: "Example Generator Inc." },
    });
    expect(m.digitalSourceTypes).toEqual([TRAINED]);
    expect(m.actions[0]).toMatchObject({ action: "c2pa.created", when: "2026-10-08T12:00:00Z" });
    expect(m.softBindings).toEqual(["com.example.watermark.1"]);
    expect(m.watermarkDeclared).toBe(true);
    expect(m.aiDisclosure).toMatchObject({
      modelName: "Example Image Model",
      humanOversightLevel: "prompt_guided",
    });
    expect(m.assertions).toEqual([
      "c2pa.actions.v2",
      "c2pa.hash.data",
      "c2pa.soft-binding",
      "c2pa.ai-disclosure",
    ]);
  });

  it("says so when the box is not a Manifest Store", () => {
    expect(
      summariseStore(Uint8Array.from([0, 0, 0, 8, 0x6a, 0x75, 0x6d, 0x62])).problems[0],
    ).toMatch(/could not be read/);
  });
});

describe("where each format keeps its manifest", () => {
  const store = syntheticStore();

  it.each([
    ["PNG caBX chunk", "png", pngWith(pngChunk("caBX", store))],
    ["JPEG APP11 segments", "jpeg", jpegWith(store, { chunk: 100 })],
    [
      "RIFF C2PA chunk",
      "webp",
      riffWith("WEBP", [
        ["VP8 ", new Uint8Array(10)],
        ["C2PA", store],
      ]),
    ],
    [
      "RIFF C2PA chunk",
      "wav",
      riffWith("WAVE", [
        ["fmt ", new Uint8Array(16)],
        ["C2PA", store],
      ]),
    ],
    ["ISO BMFF uuid box (manifest)", "mp4", mp4With(store)],
    ["ID3 GEOB frame", "mp3", mp3With(store)],
    ["PDF embedded file (C2PA_Manifest)", "pdf", pdfWith(store)],
  ])("%s (%s)", (location, format, bytes) => {
    const r = check(bytes);
    expect(r.format).toBe(format);
    expect(r.c2pa.found).toBe(true);
    expect(r.c2pa.location).toBe(location);
    expect(r.c2pa.active?.signature.signer).toBe(
      "Example Generator Inc. / Example Image Model signer",
    );
    expect(r.marking.signed_metadata).toBe("found");
    expect(r.marking.ai_declared_in[0]).toMatch(/^C2PA manifest: Created using Generative AI/);
  });

  it("a JPEG split over many APP11 segments reassembles in sequence order", () => {
    const r = check(jpegWith(store, { chunk: 37 }));
    expect(r.c2pa.manifests).toBe(1);
    expect(r.c2pa.problems).toEqual([]);
  });

  it("text: a C2PA text manifest wrapper after the visible text (C2PA 2.4, A.8)", () => {
    const text = `A generated paragraph.${wrapText(store)}`;
    const r = check(new TextEncoder().encode(text), "answer.txt");
    expect(r.media).toBe("text");
    expect(r.c2pa.location).toBe("C2PA text manifest wrapper");
    expect(r.text).toMatchObject({ c2pa_text_wrapper: true });
    expect(r.expects.map((e) => e.cite)).toContain("Code of Practice, Measure 1.1");
  });

  it("HTML: an inline application/c2pa script, or a link to an external manifest", () => {
    const inline = `<!doctype html><html><head><script type="application/c2pa">${Buffer.from(store).toString("base64")}</script></head><body>x</body></html>`;
    expect(check(new TextEncoder().encode(inline), "a.html").c2pa.found).toBe(true);
    const linked = `<!doctype html><html><head><link rel="c2pa-manifest" href="https://example.com/m.c2pa"></head></html>`;
    expect(check(new TextEncoder().encode(linked), "b.html").c2pa.references).toEqual([
      { location: '<link rel="c2pa-manifest">', uri: "https://example.com/m.c2pa" },
    ]);
  });

  it("a store in a container this reader does not parse is still found by a raw scan", () => {
    const r = check(
      new Uint8Array(Buffer.concat([Buffer.from("XYZ!\0\0\0\0\x01\x02\x03\x04", "latin1"), store])),
    );
    expect(r.c2pa.found).toBe(true);
    expect(r.c2pa.location).toMatch(/^a raw scan/);
  });
});

describe("unsigned AI fields", () => {
  it("IPTC DigitalSourceType and AISystemUsed in XMP, from a PNG iTXt chunk and a JPEG APP1 segment", () => {
    const xmp = xmpPacket({ digitalSourceType: TRAINED, aiSystemUsed: "Example Image Model" });
    for (const bytes of [pngWith(itxtChunk("XML:com.adobe.xmp", xmp)), jpegWith(null, { xmp })]) {
      const r = check(bytes);
      expect(r.c2pa.found).toBe(false);
      expect(r.xmp.digital_source_types).toEqual([
        { uri: TRAINED, name: "Created using Generative AI", ai: true },
      ]);
      expect(r.xmp.ai_system_used).toBe("Example Image Model");
      expect(r.marking.signed_metadata).toBe("not found");
      expect(r.marking.ai_declared_in).toEqual([
        "IPTC DigitalSourceType in XMP (unsigned): Created using Generative AI",
        "IPTC AISystemUsed in XMP (unsigned): Example Image Model",
      ]);
    }
  });

  it("reads element and rdf:resource forms, and any prefix bound to the IPTC namespace", () => {
    const xml = `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="r"><rdf:Description xmlns:ie="http://iptc.org/std/Iptc4xmpExt/2008-02-29/"><ie:DigitalSourceType rdf:resource="${TRAINED}"/><ie:AISystemUsed>Model X</ie:AISystemUsed></rdf:Description></rdf:RDF></x:xmpmeta>`;
    expect(readXmp([xml])).toMatchObject({
      digitalSourceTypes: [TRAINED],
      aiSystemUsed: "Model X",
    });
  });

  it("a Stable Diffusion parameters chunk is a hint that names a generator, not the prompt", () => {
    const prompt = `a red bicycle, ${"detailed, ".repeat(10)}Steps: 30, Sampler: Euler a, Model: sdxl_base`;
    const r = check(pngWith(pngChunk("tEXt", Buffer.from(`parameters\0${prompt}`, "latin1"))));
    expect(r.hints).toEqual([
      {
        field: "parameters",
        value: `${prompt.length} characters, naming sdxl`,
        names_ai_generator: true,
      },
    ]);
  });

  it("an image with nothing at all", () => {
    const r = check(pngWith());
    expect(r.marking).toEqual({
      signed_metadata: "not found",
      ai_declared_in: [],
      watermark: "not declared",
    });
    expect(r.california?.fields.every((f) => !f.seen)).toBe(true);
  });
});

describe("text", () => {
  it("counts invisible characters and finds no wrapper in plain text", () => {
    const t = checkText("plain​ text⁠ with\u{e0041} marks‮");
    expect(t.invisible).toEqual({
      zeroWidth: 2,
      byteOrderMarks: 0,
      variationSelectors: 0,
      tagCharacters: 1,
      bidiControls: 1,
    });
    expect(t.c2paStore).toBeUndefined();
  });

  it("reports a wrapper shorter than it says", () => {
    const wrapped = wrapText(new Uint8Array(40));
    const cut = Array.from(wrapped).slice(0, 30).join("");
    expect(checkText(cut).c2paProblem).toMatch(/shorter than the length/);
  });
});

describe("what the report says it cannot check", () => {
  it("never claims a manifest was validated, and names the watermark limit", () => {
    const r = check(pngWith(pngChunk("caBX", syntheticStore())));
    expect(r.c2pa.validated).toBe(false);
    expect(r.cannot_check.join(" ")).toMatch(/c2patool|contentcredentials\.org\/verify/);
    expect(r.cannot_check.join(" ")).toMatch(/generator's own detector/);
  });

  it("maps the manifest to California's five latent-disclosure fields", () => {
    const r = check(pngWith(pngChunk("caBX", syntheticStore())));
    expect(r.california?.fields.map((f) => [f.name, f.seen])).toEqual([
      ["(A) provider", true],
      ["(B) system name and version", true],
      ["(C) time and date", true],
      ["(D) unique identifier", true],
      ["(E) created or altered", true],
    ]);
  });
});
