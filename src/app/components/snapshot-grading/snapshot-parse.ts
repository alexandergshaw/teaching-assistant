// Snapshot grading, WAVE 5 (docs/snapshot-grading-acceptance-criteria.md).
// Parsing for both server-action responses (the read pass and the grade
// pass), and the A7e server-side MIME validation both actions need before
// any shot reaches the model. Pure, DOM-free, React-free - vitest here is
// node-env and renders nothing, so this is where every parsing/validation
// decision that needs a unit test has to live.
//
// N1 (item 2/AC-2): normalizeReadEntry below maps any unrecognised or
// absent roleSuggestion value to NO suggestion (undefined) - never to
// "other", and never to a default role. This is the ONLY place the model's
// raw string is validated against the closed SnapshotRole set, so it is the
// one place a forced choice or a silent default could be smuggled in.

import { SNAPSHOT_ROLES, type SnapshotRole } from "./snapshot-shot";

/**
 * A7e: `isGeminiInlineSupported` (src/lib/llm-files.ts) is NOT a MIME check
 * for this path - it is `mimeType.startsWith("image/")`, which accepts
 * `image/svg+xml`, a script-bearing document. This feature validates against
 * the DECODED BYTES' magic number, never a client-supplied MIME string or
 * file extension, and only these three formats are ever accepted.
 */
export type AllowedSnapshotMime = "image/jpeg" | "image/png" | "image/webp";

const STRICT_BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * A7f: `Buffer.from(b64, "base64")` silently discards invalid characters
 * rather than throwing, so a malformed payload would otherwise surface only
 * as an opaque provider 400 later. Reject anything that is not strictly
 * base64 BEFORE decoding.
 */
export function isStrictBase64(value: string): boolean {
  return value.length > 0 && value.length % 4 === 0 && STRICT_BASE64.test(value);
}

/**
 * Re-derives the image type from the DECODED BYTES' magic number. Returns
 * null for anything that is not strict base64, cannot be decoded, or does
 * not match one of the three allowed magic numbers - never trusts a
 * client-supplied mimeType or file extension.
 */
export function detectImageMimeFromBase64(base64: string): AllowedSnapshotMime | null {
  if (!isStrictBase64(base64)) return null;
  let buf: Buffer;
  try {
    buf = Buffer.from(base64, "base64");
  } catch {
    return null;
  }
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

// ---------------------------------------------------------------------------
// Shared JSON extraction - the same fenced-code-block-or-braces heuristic
// prompts.ts's own extractJsonObject uses (that function is not exported, so
// this is a deliberate small duplicate rather than a cross-module reach into
// a file this feature does not own).
// ---------------------------------------------------------------------------

function extractJsonObject(raw: string): string | null {
  const trimmed = raw.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch?.[1]?.trim() ?? trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return candidate.slice(start, end + 1);
}

// ---------------------------------------------------------------------------
// The read pass response.
// ---------------------------------------------------------------------------

export interface SnapshotReadResult {
  shotIndex: number;
  readable: boolean;
  transcript: string;
  unreadableReason?: string;
  /** N1 (suggest-and-confirm shot roles): a SUGGESTION only - never applied
   *  to a shot's actual role by anything in this file or its callers. Set
   *  only when the model named one of the six closed SnapshotRole values;
   *  "unsure", an unrecognised string, or a missing field all normalize to
   *  undefined below. */
  roleSuggestion?: SnapshotRole;
}

function normalizeRoleSuggestion(value: unknown): SnapshotRole | undefined {
  if (typeof value !== "string") return undefined;
  return (SNAPSHOT_ROLES as readonly string[]).includes(value) ? (value as SnapshotRole) : undefined;
}

function normalizeReadEntry(value: unknown): SnapshotReadResult | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const shotIndex = typeof v.shotIndex === "number" ? v.shotIndex : Number(v.shotIndex);
  if (!Number.isFinite(shotIndex)) return null;
  const readable = v.readable === true;
  const transcript = typeof v.transcript === "string" ? v.transcript : "";
  const unreadableReason = typeof v.unreadableReason === "string" && v.unreadableReason.trim() ? v.unreadableReason.trim() : undefined;
  const roleSuggestion = normalizeRoleSuggestion(v.roleSuggestion);
  return { shotIndex, readable, transcript, unreadableReason, roleSuggestion };
}

/**
 * Returns null on any parse failure (not a thrown exception) - the caller
 * (snapshot-read.ts) reports this as "the read pass returned a response
 * that could not be parsed" rather than crashing the request.
 */
export function parseSnapshotReadResponse(raw: string): SnapshotReadResult[] | null {
  const json = extractJsonObject(raw);
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as { shots?: unknown };
    if (!Array.isArray(parsed.shots)) return null;
    const entries = parsed.shots.map(normalizeReadEntry).filter((e): e is SnapshotReadResult => e !== null);
    return entries.length > 0 ? entries : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// The grade pass response.
// ---------------------------------------------------------------------------

export interface SnapshotRubricAreaAnswer {
  area: string;
  score: string;
  quote: string;
  shotIndex: number;
  /** RULING A: classified from the RAW shotIndex value before any coercion,
   *  so a missing or non-numeric field (e.g. "shot 3") can never become
   *  indistinguishable from a genuinely sanctioned pasted-text citation
   *  (snapshot-grade-prompt.ts:43's explicit shotIndex: 0 contract). Coercing
   *  first and branching on the coerced number was the exact defect this
   *  field exists to close - see coercion-changes-set-membership.md. */
  source: "shot" | "pasted" | "unknown";
}

export interface SnapshotGradeAnswer {
  overallComment: string;
  improvements: string;
  rubricResults: SnapshotRubricAreaAnswer[];
  instructionLikeContent: boolean;
  instructionLikeContentQuote?: string;
  missingRoles: string[];
}

function normalizeRubricArea(
  score: { area: string; score: string },
  evidence: ReadonlyMap<string, { quote: string; shotIndex: number; source: "shot" | "pasted" | "unknown" }>
): SnapshotRubricAreaAnswer {
  const found = evidence.get(score.area);
  return {
    area: score.area,
    score: score.score,
    quote: found?.quote ?? "",
    shotIndex: found?.shotIndex ?? 0,
    source: found?.source ?? "unknown",
  };
}

export function parseSnapshotGradeResponse(raw: string): SnapshotGradeAnswer | null {
  const json = extractJsonObject(raw);
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as {
      overallComment?: unknown;
      improvements?: unknown;
      rubricResults?: unknown;
      rubricAreaEvidence?: unknown;
      instructionLikeContent?: unknown;
      instructionLikeContentQuote?: unknown;
      missingRoles?: unknown;
    };

    const rawResults = Array.isArray(parsed.rubricResults) ? parsed.rubricResults : [];
    const scores = rawResults
      .filter((r): r is Record<string, unknown> => Boolean(r) && typeof r === "object")
      .map((r) => ({
        area: typeof r.area === "string" ? r.area : "",
        score: typeof r.score === "string" ? r.score : String(r.score ?? ""),
      }))
      .filter((r) => r.area !== "");

    const evidenceList = Array.isArray(parsed.rubricAreaEvidence) ? parsed.rubricAreaEvidence : [];
    const evidence = new Map<string, { quote: string; shotIndex: number; source: "shot" | "pasted" | "unknown" }>();
    for (const e of evidenceList) {
      if (!e || typeof e !== "object") continue;
      const rec = e as Record<string, unknown>;
      if (typeof rec.area !== "string") continue;
      const rawShotIndex = rec.shotIndex;
      let shotIndex = 0;
      let source: "shot" | "pasted" | "unknown" = "unknown";
      if (typeof rawShotIndex === "number" && Number.isFinite(rawShotIndex)) {
        if (rawShotIndex === 0) {
          source = "pasted";
        } else if (rawShotIndex > 0) {
          source = "shot";
          shotIndex = rawShotIndex;
        }
      }
      evidence.set(rec.area, {
        quote: typeof rec.quote === "string" ? rec.quote : "",
        shotIndex,
        source,
      });
    }

    const missingRoles = Array.isArray(parsed.missingRoles)
      ? parsed.missingRoles.filter((r): r is string => typeof r === "string")
      : [];

    if (scores.length === 0) return null;

    return {
      overallComment: typeof parsed.overallComment === "string" ? parsed.overallComment : "",
      improvements: typeof parsed.improvements === "string" ? parsed.improvements : "",
      rubricResults: scores.map((s) => normalizeRubricArea(s, evidence)),
      instructionLikeContent: parsed.instructionLikeContent === true,
      instructionLikeContentQuote:
        typeof parsed.instructionLikeContentQuote === "string" && parsed.instructionLikeContentQuote.trim()
          ? parsed.instructionLikeContentQuote.trim()
          : undefined,
      missingRoles,
    };
  } catch {
    return null;
  }
}
