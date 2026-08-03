// URL primitives shared by more than one caller. Pure: no React, no Node
// built-ins, no "use server" - importable from a server action, a workflow
// step, or a plain unit test alike.
//
// THE DESIGN DECISION THAT MATTERS MOST: CODE RESOLVES LINKS, THE MODEL NEVER
// EMITS THEM. A real generated course (MGT 422, run 512bbdbf) shipped 73
// unique URLs across its assignments and openers; 37 of them (51%) were dead
// on a curl check - punctuation baked into the href, fabricated deep links
// into PMI and third-party sites, even a literal placeholder
// "canvas.uw.edu/courses/1234567/...". A model asked to "give the URL" will
// sometimes fabricate one, and even a real one it types out is easy to
// mangle with trailing prose punctuation. So the model is asked to name
// resources (title + why, plain text, no links - see the "the model writes
// NO URLs" instruction in generateAssignmentInstructionsForAssignment) and
// every link a student actually sees is looked up by CODE against a curated
// map (see resource-links.ts) or stripped outright. stripModelUrls below is
// the last line of defense - applied to model output regardless of whether
// the prompt was followed - and sanitizeResourceUrl is the guard at the
// point a CODE-resolved URL is rendered, so a mangled trailing character can
// never reach a student either.
//
// stripModelUrls originates in src/lib/live-class/links.ts (the live-class
// answer pipeline); it now lives here so it has exactly one implementation
// shared by every caller, and links.ts re-exports it under the same name so
// every existing import - and every assertion in links.test.ts - keeps
// working unchanged.
//
// FENCE AWARENESS (added after a real generated "Class Opener" .docx shipped
// unrunnable Python - every line flush left - while the SAME code in that
// run's .pptx deck kept its indentation; see docx.fenced-code-indentation.test.ts
// for the full defect trace). The whitespace-collapse-and-trim below exists to
// clean up the gap a removed URL leaves behind in PROSE; a fenced ``` code
// block is not prose; its leading whitespace is syntax (Python) or at minimum
// meaningful formatting, so it must never be touched. CodeFenceTracker
// (./docx-blocks, already used by normalizeTypography for the identical
// problem) tracks fence state line by line; stripModelUrls below reuses it to
// split the input into contiguous runs of "verbatim" lines (a ``` delimiter or
// anything inside a fence) and "normal" lines (ordinary prose), then applies
// today's unchanged collapse-and-trim algorithm to each normal run in
// isolation while copying every verbatim run through byte-for-byte untouched
// - no URL stripped, no whitespace collapsed, matching buildCodeParagraph's
// own "no URL linkification" treatment of fenced lines in docx.ts. For an
// input with no fence at all, this is mathematically the same as running the
// old algorithm once over the whole string (a single "normal" run covering
// every line) - see stripModelUrls.test.ts's no-op proof.
//
// Two deliberate decisions on the ugly cases:
// - An unterminated fence (opened, never closed) is handled exactly the way
//   CodeFenceTracker already documents for every other caller: it stays
//   "active" through end of input, so every line from the opening ``` to EOF
//   is one verbatim run. This is not a new risk - it is the same fallback
//   docx.ts and normalizeTypography already rely on - and it is the safer
//   direction: a malformed fence loses URL-cleanup on the remainder of the
//   document rather than risking a broken fence silently flattening code.
// - Something that looks like a URL INSIDE a fence (a real URL in a code
//   comment or string literal, say) is left completely alone, for the same
//   reason indentation is: it is source text, not prose with a dead link to
//   clean up, and stripping it would corrupt the code sample same as the
//   original bug did.

import { CodeFenceTracker } from "./docx-blocks";

// Markdown link syntax the model might emit anyway, despite the prompt's
// explicit instruction not to - tried first (mirrors docx-blocks.ts's own
// INLINE_LINK_RE precedence: a markdown link always wins over a bare-URL
// match at the same position) so its url portion is never left behind to be
// caught a second time by BARE_URL_RE below. Restricted to an explicit
// http(s):// or www. target, same scope as the bare-URL pattern.
const MARKDOWN_LINK_RE = /\[([^\]]*)\]\(\s*((?:https?:\/\/|www\.)[^\s)]+)\s*\)/gi;

// A bare URL the model might emit: an explicit http(s):// scheme, or a
// www.-prefixed domain (the exact shape of the fabricated citations that
// motivated this module - see the header comment). Stops at whitespace or a
// closing bracket/paren, mirroring the app's existing bare-URL convention
// (docx-blocks.ts's INLINE_LINK_RE).
//
// Deliberately NOT tightened to stop before trailing sentence punctuation the
// way docx-blocks.ts's INLINE_LINK_RE and LecturePlanPreviewModal.tsx's
// renderInline are (entry 159 AC1/AC1.1) - this is not an oversight, and the
// two must not be made symmetric. Those two are LINKERS: leaving trailing
// punctuation in the match turns it into a dead hyperlink target one
// character too long. BARE_URL_RE feeds stripModelUrls, a REMOVER: it deletes
// the match outright rather than turning it into a link, so there is no
// dead-href consequence, and tightening it would leave the punctuation
// orphaned in the sentence ("See . Next") instead of removed cleanly along
// with the URL ("See  Next"), which reads worse. A remover should stay
// greedy; a linker must not. Do not "fix" this for symmetry with the other two.
const BARE_URL_RE = /(?:https?:\/\/|www\.)[^\s)\]]+/gi;

/**
 * Strip URLs and collapse whitespace across one contiguous run of ordinary
 * PROSE lines (never a fenced code line - see segmentByFence): a markdown
 * `[text](url)` link collapses to just its text (the link's "text left
 * behind" - the whole point is a student still reads a coherent sentence,
 * not a hole where a link used to be); a bare URL is removed outright, since
 * there is no associated text to keep. Whitespace left behind by a removal is
 * collapsed (runs of spaces/tabs on a line become one space, each line is
 * trimmed) - line breaks themselves are preserved, since the answer is
 * sometimes a bulleted list. This is the exact algorithm stripModelUrls used
 * before it became fence-aware, now scoped to a single run of lines instead
 * of the whole document (see the module-header comment above for why).
 */
function collapseUrlsAndWhitespace(segmentText: string): string {
  let result = segmentText.replace(MARKDOWN_LINK_RE, (_match, label: string) => (label ?? "").trim());
  result = result.replace(BARE_URL_RE, "");
  return result
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

/** One contiguous run of lines, all classified the same way by CodeFenceTracker:
 * `verbatim` covers both a ``` delimiter line and every line inside a fence
 * (CodeFenceTracker's "delimiter" and "code" states); anything else is a
 * `normal` prose run. */
interface FenceSegment {
  verbatim: boolean;
  lines: string[];
}

/**
 * Split `lines` into contiguous runs, alternating between fenced/delimiter
 * ("verbatim") and ordinary ("normal") lines, in original order. Rejoining
 * every segment's lines with "\n" and then joining the segments themselves
 * with "\n" reconstructs the exact original interleaving of newlines - the
 * partition never drops or reorders a line.
 */
function segmentByFence(lines: string[]): FenceSegment[] {
  const fence = new CodeFenceTracker();
  const segments: FenceSegment[] = [];
  let current: FenceSegment | null = null;

  for (const rawLine of lines) {
    const verbatim = fence.consume(rawLine.trim()) !== "normal";
    if (!current || current.verbatim !== verbatim) {
      current = { verbatim, lines: [] };
      segments.push(current);
    }
    current.lines.push(rawLine);
  }

  return segments;
}

/**
 * Strip any URL the model emitted anyway: a markdown `[text](url)` link
 * collapses to just its text; a bare URL is removed outright. Whitespace left
 * behind by a removal is collapsed (runs of spaces/tabs on a line become one
 * space, each line is trimmed) - line breaks themselves are preserved.
 *
 * Fence-aware: a line inside a ``` fenced code block, and the ``` delimiter
 * lines themselves, pass through completely unchanged - no URL stripped, no
 * whitespace touched, leading indentation intact - because that text is
 * source code, not prose with a dead link to clean up (see the module-header
 * comment above for the full rationale and the unterminated-fence /
 * URL-shaped-code-content decisions). Outside any fence, behavior is
 * byte-for-byte identical to before this function was fence-aware: a
 * fence-free input is always a single "normal" run, and running the
 * collapse-and-trim algorithm on that one run is the same computation the old
 * whole-document version performed.
 *
 * Never throws - a non-string input degrades to an empty string.
 */
export function stripModelUrls(text: string): string {
  const input = typeof text === "string" ? text : "";
  try {
    const segments = segmentByFence(input.split("\n"));
    return segments
      .map((segment) => {
        const joined = segment.lines.join("\n");
        return segment.verbatim ? joined : collapseUrlsAndWhitespace(joined);
      })
      .join("\n");
  } catch {
    return input;
  }
}

// Trailing sentence punctuation a model (or a human pasting into a prompt)
// bakes into an href when the link ends a sentence - "...the PMI guide." -
// the single largest cause (14 of 37) of the dead-link rate this module
// exists to prevent.
const TRAILING_PUNCTUATION_RE = /[.,;:!?]+$/;

// A trailing closing bracket is stripped only when it is UNMATCHED (no
// corresponding opening bracket earlier in the same URL) - a real URL can
// legitimately end in a balanced paren, e.g. Wikipedia's
// ".../Critical_path_method_(disambiguation)". Only an unmatched one is the
// punctuation-in-prose artifact ("see the PMI guide (pmi.org/...)").
const BRACKET_PAIRS: Record<string, string> = { ")": "(", "]": "[", "}": "{" };

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  for (const ch of haystack) {
    if (ch === needle) count++;
  }
  return count;
}

function stripUnmatchedTrailingBrackets(url: string): string {
  let result = url;
  while (result.length > 0) {
    const last = result[result.length - 1];
    const open = BRACKET_PAIRS[last];
    if (!open) break;
    const opens = countOccurrences(result, open);
    const closes = countOccurrences(result, last);
    if (closes <= opens) break;
    result = result.slice(0, -1);
  }
  return result;
}

/**
 * Clean up a resource URL at the point it is about to be rendered:
 * trims whitespace, then repeatedly strips trailing `.,;:!?` and any
 * trailing closing bracket that has no matching opening bracket in the same
 * URL, until nothing more can be removed. Returns "" for anything that is
 * not an `http://` or `https://` URL after cleanup (never a relative path,
 * a bare domain with no scheme, or a non-URL string) - a caller renders a
 * link only when this returns non-empty. Never throws.
 */
export function sanitizeResourceUrl(raw: string): string {
  let url = typeof raw === "string" ? raw.trim() : "";
  if (!url) return "";

  let previous: string;
  do {
    previous = url;
    url = url.replace(TRAILING_PUNCTUATION_RE, "");
    url = stripUnmatchedTrailingBrackets(url);
  } while (url !== previous && url.length > 0);

  if (!/^https?:\/\//i.test(url)) return "";
  return url;
}
