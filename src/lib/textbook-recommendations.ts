// Pure helpers for the "Recommend textbooks" (F1) and "Extract from photo"
// (F2) courses-table features - types, JSON parsing/normalization, URL
// corroboration, and the ONE shared formatter (F5) both features write
// through. No "use client"/"use server" directive: a Server Actions module
// may only export async functions (see src/lib/use-server-exports.test.ts),
// so every type, constant, and pure function these two actions need lives
// here instead, exactly like current-events-report.ts sits beside
// current-events.ts.
import { jsonObjectSlice } from "@/lib/json-slice";
import { verifyItemUrls, type ParsedTopicItem } from "@/lib/workflows/current-events-report";
import type { Source } from "@/lib/llm";

export interface TextbookFields {
  title: string;
  authors: string;
  edition: string;
  isbn: string;
  publisher: string;
  year: string;
  url: string;
}

export type TextbookRecommendation = TextbookFields & {
  whyItFits: string;
  /** True until applyUrlCorroboration confirms the url against real grounding
   *  sources (D3). parseTextbookRecommendations always sets this true. */
  unverified: boolean;
};

/** Canonical field order for both the formatted textbook value (AC43) and
 *  the extraction JSON contract (AC46). Never reordered. */
export const TEXTBOOK_FIELD_ORDER: readonly (keyof TextbookFields)[] = [
  "title",
  "authors",
  "edition",
  "isbn",
  "publisher",
  "year",
  "url",
];

/**
 * Single shared source for the textbook field labels (BUG-4 fix). Previously
 * TextbookPhotoModal.tsx restated this exact map as its own private
 * constant to label its form fields - two copies meant renaming a label here
 * silently left the modal's form reading the old name, the same class of
 * drift the repo already fixed once for the LMS options (see
 * course-lms-options.ts's header comment for that precedent). Both
 * formatTextbookValue below and TextbookPhotoModal's form now read this one
 * map, so they cannot diverge again.
 */
export const TEXTBOOK_FIELD_LABELS: Record<keyof TextbookFields, string> = {
  title: "Title",
  authors: "Authors",
  edition: "Edition",
  isbn: "ISBN",
  publisher: "Publisher",
  year: "Year",
  url: "URL",
};

/** All-blank TextbookFields literal (BUG-5 fix: single shared source, no
 *  longer duplicated in TextbookPhotoModal.tsx). */
export function emptyFields(): TextbookFields {
  return { title: "", authors: "", edition: "", isbn: "", publisher: "", year: "", url: "" };
}

/**
 * D1 coercion: a string passes through trimmed; a finite number is
 * stringified ("12" from 12); null, undefined, booleans, arrays, and objects
 * all become "". Never returns null/undefined.
 */
function coerceFieldString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

/**
 * AC42/AC43/AC44/D2 - the ONE formatter both F1's "Use this textbook" and
 * F2's "Save to textbook" go through. Fixed field order and labels, one
 * labelled line per non-empty field, values trimmed with internal whitespace
 * collapsed to a single space, joined with "\n" and no trailing newline.
 * Extra keys on the input (whyItFits, unverified) are ignored, so a
 * TextbookRecommendation formats identically to its bare TextbookFields.
 */
export function formatTextbookValue(fields: Partial<TextbookFields>): string {
  const lines: string[] = [];
  for (const key of TEXTBOOK_FIELD_ORDER) {
    const raw = fields[key];
    if (typeof raw !== "string") continue;
    const collapsed = raw.trim().replace(/\s+/g, " ");
    if (!collapsed) continue;
    lines.push(`${TEXTBOOK_FIELD_LABELS[key]}: ${collapsed}`);
  }
  return lines.join("\n");
}

/**
 * AC46/D1 - parse the seven-field extraction JSON contract out of a model
 * response (tolerating a chatty/fenced reply via jsonObjectSlice). Any
 * failure to find/parse a JSON object degrades to all-empty fields rather
 * than throwing; every value is coerced per coerceFieldString.
 */
export function parseTextbookFields(text: string): TextbookFields {
  const empty = emptyFields();
  const jsonText = jsonObjectSlice(text);
  if (!jsonText) return empty;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonText) as Record<string, unknown>;
  } catch {
    return empty;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return empty;

  const result = emptyFields();
  for (const key of TEXTBOOK_FIELD_ORDER) {
    result[key] = coerceFieldString(parsed[key]);
  }
  return result;
}

/**
 * AC5/AC7/D4 - parse the {"textbooks":[...]} structuring-call JSON into up
 * to 3 recommendations, each marked unverified until applyUrlCorroboration
 * runs. Entries with no title are dropped rather than emitted as a blank
 * card. Never filters by publisher (D4) - that constraint is prompt-level
 * only. Malformed JSON, a missing "textbooks" key, or no entries all degrade
 * to [] rather than throwing.
 */
export function parseTextbookRecommendations(text: string): TextbookRecommendation[] {
  const MAX_RESULTS = 3;
  const jsonText = jsonObjectSlice(text);
  if (!jsonText) return [];

  let parsed: { textbooks?: unknown };
  try {
    parsed = JSON.parse(jsonText) as { textbooks?: unknown };
  } catch {
    return [];
  }
  if (!Array.isArray(parsed.textbooks)) return [];

  const recommendations: TextbookRecommendation[] = [];
  for (const raw of parsed.textbooks) {
    if (recommendations.length >= MAX_RESULTS) break;
    if (!raw || typeof raw !== "object") continue;

    const obj = raw as Record<string, unknown>;
    const fields = emptyFields();
    for (const key of TEXTBOOK_FIELD_ORDER) {
      fields[key] = coerceFieldString(obj[key]);
    }
    if (!fields.title) continue;

    recommendations.push({
      ...fields,
      whyItFits: coerceFieldString(obj.whyItFits),
      unverified: true,
    });
  }
  return recommendations;
}

/**
 * AC6/D3 - keep a recommendation's url only when its host is corroborated by
 * one of call 1's own grounding sources; otherwise blank the url and mark
 * the recommendation unverified. Nothing is ever dropped - every input
 * recommendation survives, in order, only its url/unverified fields change.
 *
 * Reuses verifyItemUrls (current-events-report.ts) rather than
 * reimplementing host-corroboration logic: each recommendation is mapped
 * into a ParsedTopicItem (only .url goes in, only .url/.unverified come back
 * out - every other ParsedTopicItem field is filled with a reasonable
 * stand-in that verifyItemUrls never reads for this purpose).
 */
export function applyUrlCorroboration(
  recs: TextbookRecommendation[],
  sources: Source[]
): TextbookRecommendation[] {
  const items: ParsedTopicItem[] = recs.map((rec) => ({
    headline: rec.title,
    date: "",
    angle: "textbook",
    whyItMatters: rec.whyItFits,
    url: rec.url,
    background: false,
  }));

  const verified = verifyItemUrls(items, sources);

  return recs.map((rec, i) => ({
    ...rec,
    url: verified[i].url,
    unverified: verified[i].unverified === true,
  }));
}
