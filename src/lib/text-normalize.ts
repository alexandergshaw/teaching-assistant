// Shared text-normalization helper applied at the point every generated
// document is BUILT: buildDocxFromPlainText (./docx.ts) and buildSlidesPptx
// (./pptx.ts) each run the whole text/slide payload through normalizeTypography
// before any per-format rendering starts. That is deliberate - a single choke
// point that covers every generator which flows through either builder,
// rather than a fix bolted onto each individual generator's prompt (there are
// dozens of those; asking each one to stop emitting this punctuation would be
// unenforceable and would still miss whatever the model does next).
//
// A real generated course was measured shipping hundreds of em/en dashes and
// curly quotes in the finished .docx/.pptx files - typography an LLM produces
// by default that a plain-text pipeline never asked for. This module strips
// it back to plain ASCII. Every target character below is built from its
// numeric code point (String.fromCharCode) rather than typed as a literal, so
// none of this typography sits directly in the codebase itself (matching the
// house rule that only ASCII hyphens belong in code and comments).
import { CodeFenceTracker } from "./docx-blocks";

const EM_DASH = String.fromCharCode(0x2014); // EM DASH
const EN_DASH = String.fromCharCode(0x2013); // EN DASH
const LEFT_SINGLE_QUOTE = String.fromCharCode(0x2018); // LEFT SINGLE QUOTATION MARK
const RIGHT_SINGLE_QUOTE = String.fromCharCode(0x2019); // RIGHT SINGLE QUOTATION MARK - also the common curly apostrophe
const LEFT_DOUBLE_QUOTE = String.fromCharCode(0x201c); // LEFT DOUBLE QUOTATION MARK
const RIGHT_DOUBLE_QUOTE = String.fromCharCode(0x201d); // RIGHT DOUBLE QUOTATION MARK

// Fast-path check: does this text contain any character this module touches
// at all? Cheap single regex test that lets normalizeTypography return its
// input unchanged (no line-splitting, no fence tracking) for the common case
// of a document that already carries none of this punctuation.
const HAS_TARGET_CHAR_RE = new RegExp(
  `[${EM_DASH}${EN_DASH}${LEFT_SINGLE_QUOTE}${RIGHT_SINGLE_QUOTE}${LEFT_DOUBLE_QUOTE}${RIGHT_DOUBLE_QUOTE}]`
);

// A bare http(s) URL, matched generously (through to the next whitespace or
// closing paren - the same boundary docx-blocks.ts's own bare-URL detection
// uses) so a dash or quote character sitting inside a URL - a real, if rare,
// occurrence in article slugs and query strings - is always left alone. Being
// generous only means a same-line character just past the true URL boundary
// also goes untouched, which is harmless; the failure mode this guards
// against is corrupting a URL, not under-normalizing a sentence.
const URL_SPAN_RE = /https?:\/\/[^\s)]+/g;

// A numeric range ("2013-2016", "10-20") always collapses to a plain ASCII
// hyphen with no surrounding spaces, even when the source has incidental
// whitespace around the dash ("2013 - 2016"). This must run before the
// generic dash rule below so its own output (a plain "-") is never re-matched
// by it.
const NUMERIC_EN_DASH_RANGE_RE = new RegExp(`(\\d)\\s*${EN_DASH}\\s*(\\d)`, "g");

// Any dash left after the numeric-range pass is a parenthetical/appositive
// aside - an em dash always is; an en dash used outside a numeric range reads
// the same way in practice. It is never a hyphenated word: a compound word is
// already written with a plain ASCII "-", and this pattern only ever matches
// the two Unicode dash characters, so "well-known" or "co-founder" is never
// touched. Collapses any surrounding whitespace to exactly one space on each
// side, so a tightly-set em dash and a loosely-spaced one both land on the
// same "word - word".
const PARENTHETICAL_DASH_RE = new RegExp(`\\s*[${EM_DASH}${EN_DASH}]\\s*`, "g");

// Curly quotes/apostrophes collapse to their ASCII equivalent in place - no
// spacing changes, unlike the dash rule - so a name typed with a curly
// apostrophe comes out with a plain ASCII apostrophe and nothing else
// disturbed.
const SINGLE_QUOTE_RE = new RegExp(`[${LEFT_SINGLE_QUOTE}${RIGHT_SINGLE_QUOTE}]`, "g");
const DOUBLE_QUOTE_RE = new RegExp(`[${LEFT_DOUBLE_QUOTE}${RIGHT_DOUBLE_QUOTE}]`, "g");

/** Apply every substitution to one already fence-resolved, non-URL segment. */
function normalizeProseSegment(segment: string): string {
  return segment
    .replace(NUMERIC_EN_DASH_RANGE_RE, "$1-$2")
    .replace(PARENTHETICAL_DASH_RE, " - ")
    .replace(SINGLE_QUOTE_RE, "'")
    .replace(DOUBLE_QUOTE_RE, '"');
}

/** Normalize one already fence-resolved line, skipping any bare URL span. */
function normalizeLine(line: string): string {
  URL_SPAN_RE.lastIndex = 0;
  let cursor = 0;
  let out = "";
  let match: RegExpExecArray | null;
  while ((match = URL_SPAN_RE.exec(line))) {
    if (match.index > cursor) out += normalizeProseSegment(line.slice(cursor, match.index));
    out += match[0]; // URL span: never touched
    cursor = match.index + match[0].length;
  }
  if (cursor < line.length) out += normalizeProseSegment(line.slice(cursor));
  return out;
}

/**
 * Replace non-ASCII "smart" typography an LLM commonly emits with plain ASCII
 * equivalents:
 *
 * - An em dash or en dash used as a numeric range ("2013-2016") collapses to
 *   a plain hyphen with no surrounding spaces.
 * - Every other em dash or en dash (a parenthetical/appositive aside, the
 *   common case: "TJX Companies-the parent company...-suffered") becomes
 *   " - " with exactly one space on each side. A pre-existing ASCII hyphen
 *   inside a hyphenated word ("well-known") is never touched - this only
 *   matches the two Unicode dash characters, never "-" itself.
 * - A curly single quote/apostrophe or double quote collapses to its ASCII
 *   equivalent ("'" or a straight double quote) in place, with no spacing
 *   changes - a name with a curly apostrophe reads clean afterward.
 *
 * Fence-aware and URL-aware: a line inside a ``` fenced code block (tracked
 * the same way the .docx renderer itself tracks fences - see
 * CodeFenceTracker in ./docx-blocks) is passed through completely unchanged,
 * and so is any bare http(s) URL substring within an otherwise-normalized
 * line. Safe to call on a whole multi-line document or on a single field (a
 * slide title, one bullet, speaker notes) - a string with no ``` fence
 * behaves identically to a fence-free line, and an already-plain-ASCII string
 * is returned unchanged via a fast-path check.
 */
export function normalizeTypography(text: string): string {
  if (!HAS_TARGET_CHAR_RE.test(text)) return text;
  const lines = text.split("\n");
  const fence = new CodeFenceTracker();
  return lines
    .map((rawLine) => (fence.consume(rawLine.trim()) === "normal" ? normalizeLine(rawLine) : rawLine))
    .join("\n");
}
