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
const BARE_URL_RE = /(?:https?:\/\/|www\.)[^\s)\]]+/gi;

/**
 * Strip any URL the model emitted anyway: a markdown `[text](url)` link
 * collapses to just its text (the link's "text left behind" - the whole
 * point is a student still reads a coherent sentence, not a hole where a
 * link used to be); a bare URL is removed outright, since there is no
 * associated text to keep. Whitespace left behind by a removal is collapsed
 * (runs of spaces/tabs on a line become one space, each line is trimmed) -
 * line breaks themselves are preserved, since the answer is a bulleted list.
 * Never throws - a non-string input degrades to an empty string.
 */
export function stripModelUrls(text: string): string {
  const input = typeof text === "string" ? text : "";
  try {
    let result = input.replace(MARKDOWN_LINK_RE, (_match, label: string) => (label ?? "").trim());
    result = result.replace(BARE_URL_RE, "");
    return result
      .split("\n")
      .map((line) => line.replace(/[ \t]+/g, " ").trim())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n");
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
