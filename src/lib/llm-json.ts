// The one shared "ask a model for JSON and validate it" helper - there was
// none. Six independently-written local `extractJsonObject` functions
// already exist, and this file replaces none of them (that conversion is a
// separate chunk); it exists so the llm-command-interface feature does not
// become a seventh.
//
// SURVEY (read before writing this, per the brief - all six opened directly):
//   - grade/rubric.ts:31, grade/parsing.ts:16, grade/prompts.ts:3,
//     calendar-parser.ts:130, decks/sequence.ts:439 are the SAME function,
//     copy-pasted five times, byte-for-byte:
//       const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
//       const candidate = fencedMatch?.[1]?.trim() ?? trimmed;
//       const start = candidate.indexOf("{");
//       const end = candidate.lastIndexOf("}");
//       if (start === -1 || end === -1 || end <= start) return null;
//       return candidate.slice(start, end + 1);
//   - app/actions/shared.ts:162 differs in TWO ways: it returns an already
//     -parsed `Record<string, unknown> | null` (JSON.parse + try/catch baked
//     in) rather than a string, and it delegates the slicing to a
//     `jsonObjectSlice` helper in that same file rather than inlining
//     indexOf/lastIndexOf - but the slicing rule itself is the same
//     first-brace/last-brace approach.
//
// WHAT ALL SIX GET WRONG, AND WHAT THIS FILE DOES INSTEAD:
//   1. `indexOf("{")` / `lastIndexOf("}")` is not bracket-matching, it is
//      "first open brace anywhere, last close brace anywhere". Two failure
//      modes follow directly: (a) trailing prose after the JSON that happens
//      to contain a brace ("...let me know if that {format} works") extends
//      the slice past the real end and JSON.parse then fails on the whole
//      thing where a bracket-aware scan would have stopped at the JSON's true
//      close; (b) none of the six can extract a top-level JSON ARRAY, only an
//      object, because they only ever look for `{`/`}`.
//   2. None of the six treats a brace INSIDE a JSON string value specially,
//      so a proposed description containing a literal "}" character (a code
//      sample, a citation) can prematurely end the naive scan. This file
//      tracks string state (with escape handling) while scanning so a brace
//      inside a quoted string never counts toward bracket depth.
//   3. The fence regex all six share is unanchored and non-greedy to the
//      FIRST closing fence, which is exactly the shape of bug entry 335
//      documents against llm-fence.ts's old regex - fine here only because
//      our target really is "the JSON, wherever a fence marks it", not "the
//      whole document" (llm-fence.ts's problem was unwrapping a whole PROSE
//      document because it merely contained an unrelated code sample inside
//      it). To stay honest about that difference and still reuse the
//      conservative, already-proven discipline where it overlaps, this file
//      tries `unwrapDocumentFence` from llm-fence.ts FIRST (llm-fence.ts's
//      own contract: touch nothing unless the ENTIRE response is wrapped by
//      one recognized fence) and only falls back to this file's own
//      json-tagged fence-finder when that conservative pass declines to
//      change anything - see `parseLlmJson` below for the exact order.
//      `unwrapDocumentFence` does not recognize a `json` language tag (by
//      design - see that file's header), so it is a genuine complement here,
//      not a redundant first step.
//   4. None of the six has a way to report WHY parsing failed - they all
//      return `null` (or throw, at the calendar-parser.ts call site) with no
//      distinction between "no JSON-shaped text found at all" and "found
//      something bracket-shaped but JSON.parse rejected it". This file
//      returns a discriminated result carrying a `reason` string instead, so
//      a caller (the command-proposal apply path, which has no separate
//      per-row-failure channel for "the model's reply was not JSON") can
//      surface something better than a silent no-op.
//
// This file NEVER throws and NEVER returns a partially-parsed fragment: the
// bracket scanner in `sliceOutermostJsonValue` only returns a slice once
// depth has returned to exactly zero (a genuinely balanced, complete value),
// and returns null - never a truncated string - when the text ends with
// depth still open. `parseLlmJson` only ever hands `JSON.parse` a slice that
// scanner produced, so "parsed" and "not parsed" are the only two outcomes;
// there is no third "sort of parsed" state to leak to a caller.
//
// Pure: no I/O, no Date, no randomness.

import { unwrapDocumentFence } from "./llm-fence";

export type LlmJsonParseResult<T = unknown> =
  | { ok: true; value: T }
  | { ok: false; reason: string };

/**
 * Parse a model response that is expected to contain exactly one JSON value
 * (object or array), tolerating: a bare value, a value wrapped in a
 * ```json fence, a value wrapped in an untagged/markdown/text fence, and a
 * value surrounded by prose before and/or after it in any of those cases.
 *
 * Never throws. Never returns a partial fragment - either a fully-formed
 * value round-trips through `JSON.parse`, or this returns `{ ok: false }`
 * with a reason.
 */
export function parseLlmJson<T = unknown>(text: string): LlmJsonParseResult<T> {
  if (typeof text !== "string") {
    return { ok: false, reason: "response was not a string" };
  }
  const trimmed = text.trim();
  if (trimmed === "") {
    return { ok: false, reason: "empty response" };
  }

  // Candidate regions to search, tried in order. Each is independently run
  // through the bracket-matching scanner below - none of these strings is
  // trusted as JSON on its own, they are only narrower places to look.
  const candidates: string[] = [];

  // 1. llm-fence.ts's conservative "wholly wrapped" unwrap. A no-op (returns
  // the input unchanged) unless the ENTIRE trimmed response is one fence, so
  // this can only ever narrow the search, never corrupt it. Covers the
  // untagged/markdown/text/txt fence cases; a `json` tag falls through
  // unchanged here (see header) and is picked up by step 2.
  const wholeDocumentUnwrapped = unwrapDocumentFence(trimmed);
  if (wholeDocumentUnwrapped !== trimmed) {
    candidates.push(wholeDocumentUnwrapped);
  }

  // 2. The first ```json (or untagged ```) fence anywhere in the response,
  // non-greedy to its nearest closing fence - matches the house pattern the
  // six existing call sites already use, kept here ONLY as a narrower search
  // region: the actual object/array boundaries inside it are still found by
  // the bracket scanner in step 3/4, not trusted from the fence match alone.
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch?.[1] !== undefined) {
    candidates.push(fenceMatch[1].trim());
  }

  // 3. The raw response, in case there was no fence at all (a bare object or
  // array, with or without surrounding prose).
  candidates.push(trimmed);

  for (const candidate of candidates) {
    const sliced = sliceOutermostJsonValue(candidate);
    if (sliced === null) continue;
    try {
      return { ok: true, value: JSON.parse(sliced) as T };
    } catch {
      // Try the next candidate region rather than failing outright - a
      // fenced region that turned out not to be valid JSON should not stop
      // the raw-text fallback from being tried.
      continue;
    }
  }

  return { ok: false, reason: "no parseable JSON object or array found in response" };
}

/**
 * Find the first `{` or `[` in `text` and return the exact substring from
 * there to ITS matching close bracket - true bracket-depth matching, aware
 * of JSON string literals (so a brace or bracket character inside a quoted
 * string never affects depth) and escape sequences (so a `\"` inside a
 * string never ends it early).
 *
 * Returns null - never a truncated slice - when no opening bracket exists,
 * when depth never returns to zero (the value is cut off), or when a closer
 * appears with no matching opener (malformed).
 */
function sliceOutermostJsonValue(text: string): string | null {
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{" || ch === "[") {
      start = i;
      break;
    }
  }
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (escapeNext) {
        escapeNext = false;
      } else if (ch === "\\") {
        escapeNext = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === "{" || ch === "[") {
      depth++;
    } else if (ch === "}" || ch === "]") {
      depth--;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
      if (depth < 0) return null; // a closer with no matching opener - malformed
    }
  }

  return null; // ran off the end with depth still open - never return a fragment
}
