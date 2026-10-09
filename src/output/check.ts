/**
 * `output`: what machine-readable marking a generated image, audio, video or text artefact carries,
 * set against what Article 50(2), the Commission's code of practice and California's latent
 * disclosure ask for. Reports what is present, never whether the artefact or its provider complies.
 */
import { createHash } from "node:crypto";
import { CATA_FIELD_NAMES, CATA_FIELDS, QUOTES, SOURCES, type QuoteId } from "../law.js";
import { extract, generatorIn, type Hint, type Media } from "./containers.js";
import { summariseStore, type ActionSummary, type ManifestSummary } from "./jumbf.js";
import { checkText, invisibleTotal, type InvisibleCount } from "./text.js";
import { readXmp } from "./xmp.js";

/** IPTC's names for its digital source types (cv.iptc.org/newscodes/digitalsourcetype, read 8 Oct 2026). */
export const DIGITAL_SOURCE_TYPES: Record<string, string> = {
  trainedAlgorithmicMedia: "Created using Generative AI",
  compositeWithTrainedAlgorithmicMedia: "Edited using Generative AI",
  compositeSynthetic: "Composite including generative AI elements",
  algorithmicMedia: "Pure algorithmic media",
  algorithmicallyEnhanced: "Algorithmically-altered media",
  digitalCapture: "Digital capture sampled from real life",
  computationalCapture: "Multi-frame computational capture sampled from real life",
  digitalCreation: "Digital creation",
  digitalArt: "Digital art",
  dataDrivenMedia: "Data-driven media",
  humanEdits: "Human-edited media",
  minorHumanEdits: "Original media with minor human edits",
  composite: "Composite of elements",
  compositeCapture: "Composite of captured elements",
  screenCapture: "Screen capture",
  softwareImage: "Created by software",
  virtualRecording: "Virtual event recording",
  negativeFilm: "Digitised from a transparent negative",
  positiveFilm: "Digitised from a transparent positive",
  print: "Digitised from a non-transparent medium",
  trainedAlgorithmicData: "Trained algorithmic data",
};

/** The digital source types that say generative AI made or changed the content. */
const AI_TYPES = new Set([
  "trainedAlgorithmicMedia",
  "compositeWithTrainedAlgorithmicMedia",
  "compositeSynthetic",
  "trainedAlgorithmicData",
]);

export interface SourceType {
  uri: string;
  name: string;
  /** the type says generative AI made or changed the content */
  ai: boolean;
}

export function sourceType(uri: string): SourceType {
  const code = uri.replace(/\/+$/, "").split("/").pop() ?? uri;
  return { uri, name: DIGITAL_SOURCE_TYPES[code] ?? code, ai: AI_TYPES.has(code) };
}

export interface Expectation {
  cite: string;
  quote: string;
  source: string;
  applies?: string;
}

export interface OutputReport {
  target: {
    source: "file" | "url";
    name: string;
    final_url?: string;
    status?: number;
    content_type?: string;
    bytes: number;
    sha256: string;
    truncated?: boolean;
  };
  format: string;
  label: string;
  media: Media;
  c2pa: {
    found: boolean;
    location: string | null;
    looked_in: string[];
    unread: string | null;
    references: { location: string; uri: string }[];
    manifests: number;
    active: null | {
      label: string;
      claim_generator: string | null;
      title: string | null;
      signature: {
        present: boolean;
        alg: string | null;
        signer: string | null;
        issuer: string | null;
        time_stamped: boolean;
      };
      assertions: string[];
      actions: ActionSummary[];
      digital_source_types: SourceType[];
      ai_disclosure: ManifestSummary["aiDisclosure"] | null;
      soft_bindings: string[];
      watermark_declared: boolean;
    };
    /** this tool reads manifests; it never validates them */
    validated: false;
    problems: string[];
  };
  xmp: {
    packets: number;
    digital_source_types: SourceType[];
    ai_system_used: string | null;
    ai_system_version_used: string | null;
    ai_prompt_information: boolean;
    ai_prompt_writer_name: boolean;
    provenance_reference: string | null;
    creator_tool: string | null;
    credit: string | null;
  };
  text: null | { characters: number; invisible: InvisibleCount; c2pa_text_wrapper: boolean };
  /** unsigned fields that name a generator or the software (not marking under the code) */
  hints: (Hint & { names_ai_generator: boolean })[];
  marking: {
    /** a C2PA manifest: digitally signed metadata (code, Sub-measure 1.1.1) */
    signed_metadata: "found" | "not found" | "present, not opened";
    /** where AI generation or manipulation is declared, in words */
    ai_declared_in: string[];
    /** a watermark or soft binding the manifest declares */
    watermark: "declared in the manifest" | "not declared";
  };
  expects: Expectation[];
  california: null | {
    fields: { field: string; name: string; seen: boolean; from: string | null }[];
  };
  cannot_check: string[];
}

function name(cn: { CN?: string; O?: string } | undefined): string | null {
  if (!cn) return null;
  return (
    [cn.O, cn.CN]
      .filter(Boolean)
      .filter((v, i, a) => a.indexOf(v) === i)
      .join(" / ") || null
  );
}

const expect = (id: QuoteId): Expectation => {
  const q = QUOTES[id];
  return {
    cite: q.cite,
    quote: q.text,
    source: SOURCES[q.source].url,
    ...("applies" in q ? { applies: q.applies } : {}),
  };
};

export interface OutputInput {
  source: "file" | "url";
  name: string;
  bytes: Uint8Array;
  finalUrl?: string;
  status?: number;
  contentType?: string;
  truncated?: boolean;
  /** an HTTP Link header, for rel="c2pa-manifest" */
  link?: string | null;
}

export function checkOutput(input: OutputInput): OutputReport {
  const x = extract(input.bytes, input.name, input.contentType);
  const problems: string[] = [];
  let textReport: OutputReport["text"] = null;
  if (x.media === "text" && x.text !== undefined) {
    const t = checkText(x.text);
    if (t.c2paStore) x.stores.push({ location: "C2PA text manifest wrapper", bytes: t.c2paStore });
    if (t.c2paProblem) problems.push(t.c2paProblem);
    textReport = {
      characters: t.characters,
      invisible: t.invisible,
      c2pa_text_wrapper: Boolean(t.c2paStore),
    };
  }
  if (input.link) {
    for (const part of input.link.split(",")) {
      const m = /<([^>]+)>\s*;(.*)/.exec(part.trim());
      if (m && /rel\s*=\s*"?c2pa-manifest/i.test(m[2]!))
        x.references.push({ location: "HTTP Link header", uri: m[1]! });
    }
  }
  const store = x.stores[0];
  const summary = store ? summariseStore(store.bytes) : null;
  if (summary) problems.push(...summary.problems);
  const active = summary?.active;
  const xmp = readXmp(x.xmp);
  // C2PA 1.x also wrote dcterms:provenance for an embedded manifest ("self#jumbf=…"): not external
  if (xmp.provenance && !xmp.provenance.startsWith("self#jumbf="))
    x.references.push({ location: "XMP dcterms:provenance", uri: xmp.provenance });

  const c2paTypes = (active?.digitalSourceTypes ?? []).map(sourceType);
  const xmpTypes = xmp.digitalSourceTypes.map(sourceType);
  const hints = x.hints.map((h) => ({
    ...h,
    names_ai_generator: generatorIn(`${h.field} ${h.value}`) !== undefined,
  }));

  const declared: string[] = [];
  const aiC2pa = c2paTypes.filter((t) => t.ai);
  if (aiC2pa.length)
    declared.push(
      `C2PA manifest: ${aiC2pa.map((t) => `${t.name} (${t.uri.split("/").pop()})`).join(", ")}`,
    );
  if (active?.aiDisclosure)
    declared.push(
      `C2PA AI disclosure assertion${active.aiDisclosure.modelName ? `: ${active.aiDisclosure.modelName}` : ""}`,
    );
  const aiXmp = xmpTypes.filter((t) => t.ai);
  if (aiXmp.length)
    declared.push(
      `IPTC DigitalSourceType in XMP (unsigned): ${aiXmp.map((t) => t.name).join(", ")}`,
    );
  if (xmp.aiSystemUsed) declared.push(`IPTC AISystemUsed in XMP (unsigned): ${xmp.aiSystemUsed}`);
  for (const h of hints.filter((h) => h.names_ai_generator))
    declared.push(`${h.field} (unsigned): ${h.value}`);

  const signed: OutputReport["marking"]["signed_metadata"] = active
    ? "found"
    : store || x.unreadStore
      ? "present, not opened"
      : "not found";
  const watermarkDeclared = Boolean(active?.watermarkDeclared);

  const freeText = x.media === "text" && x.format !== "html";
  const expects = [expect("art50_2"), expect("art111_4"), expect("code_layers")];
  if (freeText) expects.push(expect("code_text"));
  else expects.push(expect("code_signed"));
  expects.push(expect("code_watermark"));

  let california: OutputReport["california"] = null;
  if (x.media === "image" || x.media === "video" || x.media === "audio") {
    expects.push(expect("cata_latent"));
    const when = active?.actions.find((a) => a.when)?.when;
    const created = active?.actions.find((a) =>
      /c2pa\.(created|edited|converted|placed)/.test(a.action),
    );
    california = {
      fields: [
        {
          field: CATA_FIELDS[0],
          name: CATA_FIELD_NAMES[0],
          seen: Boolean(active?.signature.signer),
          from: active?.signature.signer
            ? `C2PA signer certificate: ${name(active.signature.signer)}`
            : null,
        },
        {
          field: CATA_FIELDS[1],
          name: CATA_FIELD_NAMES[1],
          seen: Boolean(active?.claimGenerator || active?.aiDisclosure?.modelName),
          from: active?.claimGenerator
            ? `C2PA claim generator: ${active.claimGenerator}`
            : active?.aiDisclosure?.modelName
              ? `C2PA AI disclosure: ${active.aiDisclosure.modelName}`
              : null,
        },
        {
          field: CATA_FIELDS[2],
          name: CATA_FIELD_NAMES[2],
          seen: Boolean(when || active?.signature.timeStamped),
          from: when
            ? `C2PA action time: ${when}`
            : active?.signature.timeStamped
              ? "C2PA signature time-stamp"
              : null,
        },
        {
          field: CATA_FIELDS[3],
          name: CATA_FIELD_NAMES[3],
          seen: Boolean(active?.label || active?.instanceId),
          from: active?.label
            ? `C2PA manifest label: ${active.label}`
            : active?.instanceId
              ? `C2PA instanceID: ${active.instanceId}`
              : null,
        },
        {
          field: CATA_FIELDS[4],
          name: CATA_FIELD_NAMES[4],
          seen: Boolean(created || aiC2pa.length),
          from: created
            ? `C2PA action: ${created.action}${created.digitalSourceType ? ` (${sourceType(created.digitalSourceType).name})` : ""}`
            : aiC2pa.length
              ? `C2PA digital source type: ${aiC2pa[0]!.name}`
              : null,
        },
      ],
    };
  }

  const cannot = [
    "whether the C2PA signature, certificate chain and content hashes are valid (this tool reads manifests; validate with c2patool or https://contentcredentials.org/verify)",
    "an imperceptible watermark in the pixels, samples or wording: only the generator's own detector can find one",
    "whether the artefact is in scope of Article 50(2) (who provides the system, whether an exception applies)",
  ];
  if (x.references.length)
    cannot.unshift(
      "the external manifest a reference points to (not fetched: one request per check)",
    );

  return {
    target: {
      source: input.source,
      name: input.name,
      ...(input.finalUrl && input.finalUrl !== input.name ? { final_url: input.finalUrl } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.contentType ? { content_type: input.contentType } : {}),
      bytes: input.bytes.length,
      sha256: createHash("sha256").update(input.bytes).digest("hex"),
      ...(input.truncated ? { truncated: true } : {}),
    },
    format: x.format,
    label: x.label,
    media: x.media,
    c2pa: {
      found: Boolean(active),
      location: store?.location ?? null,
      looked_in: x.looked.filter((l) => !l.startsWith("XMP")),
      unread: x.unreadStore ?? null,
      references: x.references,
      manifests: summary?.manifests.length ?? 0,
      active: active
        ? {
            label: active.label,
            claim_generator: active.claimGenerator ?? null,
            title: active.title ?? null,
            signature: {
              present: active.signature.present,
              alg: active.signature.alg ?? null,
              signer: name(active.signature.signer),
              issuer: name(active.signature.issuer),
              time_stamped: active.signature.timeStamped,
            },
            assertions: active.assertions,
            actions: active.actions,
            digital_source_types: c2paTypes,
            ai_disclosure: active.aiDisclosure ?? null,
            soft_bindings: active.softBindings,
            watermark_declared: active.watermarkDeclared,
          }
        : null,
      validated: false,
      problems,
    },
    xmp: {
      packets: xmp.packets,
      digital_source_types: xmpTypes,
      ai_system_used: xmp.aiSystemUsed ?? null,
      ai_system_version_used: xmp.aiSystemVersionUsed ?? null,
      ai_prompt_information: xmp.aiPromptInformation,
      ai_prompt_writer_name: xmp.aiPromptWriterName,
      provenance_reference: xmp.provenance ?? null,
      creator_tool: xmp.creatorTool ?? null,
      credit: xmp.credit ?? null,
    },
    text: textReport,
    hints,
    marking: {
      signed_metadata: signed,
      ai_declared_in: declared,
      watermark: watermarkDeclared ? "declared in the manifest" : "not declared",
    },
    expects,
    california,
    cannot_check: cannot,
  };
}

export { invisibleTotal };
