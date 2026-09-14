// The permitted-URL enforcer for the walkthrough-announcement drafter
// (G3 Ask 2/3, Rulings 2, 18, 18b, 20, 26, 29). Runs INSIDE
// draftWalkthroughAnnouncementAction (Ruling 2) over the model's drafted
// text, after every legitimate carrier of a real URL (course/module label,
// materials text, exemplar heading text, coverage block, notes, style block,
// researched-resource links) has been collected into one permitted set.
//
// THE ENFORCER NEVER MODIFIES THE DOCUMENT (Ruling 20). What it returns is
// the original draft with PER-MATCH splices only - an unpermitted link
// construct's `[text](url)` becomes `text`, an unpermitted bare URL becomes
// "" - and nothing else. Not one byte of surrounding whitespace, heading
// marker, or list bullet changes, because every replacement is scoped to one
// regex match callback's own matched span. A whole-document strip of
// tab/CR/LF (the withdrawn round-3 FIX 5/design) destroys every heading, list
// item and paragraph break in a feature whose whole purpose is a
// one-item-per-paragraph floor - measured there as
// `"# Head\n\n- one\n- two\n\nBye"` collapsing to `"# Head- one- twoBye"`.
// That design is not reproduced here.
//
// Two passes, in order:
//   1. Full markdown link constructs `[text](url)` - mirrors
//      markdownToHtml's own capture shape (src/lib/markdown.ts:186), so a
//      link this enforcer permits is a link the renderer would also permit,
//      and one it strips is one the renderer would also refuse to linkify.
//   2. Bare `https?://` substrings left over after pass 1 (AC3-4 is not
//      scoped to linked URLs only - a fabricated URL sitting in plain prose,
//      never wrapped in `[text](url)`, is still in scope).
//
// Normalization compares PARSED HOSTS, never raw strings (Ruling 18b): a
// target that *reads* as a permitted host but resolves to a different one
// via userinfo smuggling (`https://good.example@evil.example/x` resolves to
// host `evil.example`) is caught the moment `new URL(...)` is asked for its
// real host. Every `new URL()` call is guarded (Ruling 26): a parse failure
// means NOT permitted (fail closed), and never propagates out of this
// module - a model typo must strip a link, not fail the whole Generate.

import type { AnnouncementOutline } from "./announcement-outline-types";
import { sanitizeResourceUrl } from "./urls";

// Matches markdown.ts's own URL_PARSER_STRIPPED class
// (src/lib/markdown.ts:174), minus `\n` - a target captured by
// MARKDOWN_LINK_RE or BARE_URL_RE below can never contain `\n`, since both
// regexes exclude it from the captured span by construction, so there is
// nothing for a `\n` branch of this class to strip here.
const TAB_CR_RE = /[\t\r]/g;

// Mirrors markdownToHtml's own link regex (markdown.ts:186), restricted so
// it can never match across a line break - the renderer never can either,
// since it splits the draft into lines (markdown.ts:200) before this regex
// would ever run over one. The text group excludes `\n` too (Ruling 29):
// unlike the renderer, which only ever sees one line at a time, this
// enforcer runs over the WHOLE multi-line draft, so `[^\]]*` alone would let
// the text group span a line break the renderer's own per-line regex never
// could - rewriting bracket text the renderer would render literally.
const MARKDOWN_LINK_RE = /\[([^\]\n]*)\]\(([^)\n]+)\)/g;

const BARE_URL_RE = /https?:\/\/[^\s)\]"]+/gi;

// The non-http forms markdown.ts's own ALLOWED_LINK_HREF (markdown.ts:180)
// permits: mailto:, attachment: (Canvas's own file-link scheme), an in-page
// `#` anchor, and a relative path (the negative lookahead excludes the
// protocol-relative `//` form). Ruling 29: this enforcer must SKIP a link
// target in any of these forms - leave it byte-identical, and do NOT record
// it in `stripped` - or every relative path, in-page anchor, mail link and
// Canvas attachment link in the draft is silently de-linked and reported to
// the instructor as a removed URL. Normalized the same way (strip tab/CR
// first) as markdown.ts's own normalizeHrefForGuard tests this pattern, so a
// target smuggling a protocol-relative bypass past the lookahead via an
// embedded tab (markdown.ts's own documented bypass) is not mistaken for a
// permitted relative path here either.
const NON_HTTP_ALLOWED_TARGET_RE = /^(mailto:|attachment:|#|\/(?![/\\]))/i;

function isNonHttpAllowedTarget(rawTarget: string): boolean {
  return NON_HTTP_ALLOWED_TARGET_RE.test(rawTarget.replace(TAB_CR_RE, ""));
}

/**
 * Comparison-only normalization: strip tab/CR (matching markdown.ts's own
 * scope), run through sanitizeResourceUrl (trailing punctuation/bracket
 * cleanup, and the http(s)-only gate), then parse with the platform URL
 * parser and compare resolved protocol + lowercased hostname + trailing-
 * slash-trimmed pathname - never a substring or prefix test (Ruling 18b).
 * `new URL(...)` is guarded: a parse failure (a truncated `https://[`, an
 * invalid `https://%`, an out-of-range port) means "cannot vouch for this
 * URL", which this enforcer treats as NOT permitted (Ruling 26) - never as
 * an exception that escapes this module and fails the whole draft.
 */
function normalizeForComparison(raw: string): string {
  const stripped = raw.replace(TAB_CR_RE, "");
  const cleaned = sanitizeResourceUrl(stripped);
  if (!cleaned) return "";
  try {
    const u = new URL(cleaned);
    return `${u.protocol}//${u.hostname.toLowerCase()}${u.pathname.replace(/\/$/, "")}`;
  } catch {
    return "";
  }
}

/**
 * Walks every legitimate carrier of a real URL for one drafting slot -
 * course/module label, materials text, the exemplar outline's own heading
 * strings, the coverage block, instructor notes, the writing-style sample,
 * and the researched-resource links threaded in as a new action-input field
 * (Ruling 2) - and returns the set of normalized URLs the drafted text is
 * permitted to contain. Per-slot, not a single set shared across a whole
 * batch, since `outline` and `researchedResources` both legitimately differ
 * per slot.
 */
export function collectPermittedUrls(args: {
  courseLabel: string;
  moduleLabel: string | null;
  materialsText: string;
  outline: AnnouncementOutline;
  coverageBlock: string;
  notes: string;
  styleBlock: string;
  researchedResources: readonly { url: string }[];
}): ReadonlySet<string> {
  const texts = [
    args.courseLabel,
    args.moduleLabel ?? "",
    args.materialsText,
    ...args.outline.sections.map((s) => s.heading ?? ""),
    args.coverageBlock,
    args.notes,
    args.styleBlock,
  ];
  const permitted = new Set<string>();
  for (const text of texts) {
    for (const raw of text.match(BARE_URL_RE) ?? []) {
      const n = normalizeForComparison(raw);
      if (n) permitted.add(n);
    }
  }
  for (const r of args.researchedResources) {
    const n = normalizeForComparison(r.url);
    if (n) permitted.add(n);
  }
  return permitted;
}

/**
 * Returns the original `draftText` with every unpermitted URL spliced out -
 * per match, never rewriting anything this function did not decide to
 * strip (Ruling 20). A permitted link construct or bare URL survives
 * byte-for-byte, including any stray tab/CR the model wrote inside it; only
 * an UNPERMITTED match is ever touched.
 *
 * Pass 1 (full link constructs): an unpermitted `[text](url)` becomes just
 * `text` - the whole construct, both brackets and parens, is replaced with
 * its own visible link text, mirroring renderInlineMd's own fallback
 * (markdown.ts:187-191) exactly ("rendered as its own plain visible text -
 * content is never dropped, only the dangerous href"). A target in one of
 * the non-http forms markdown.ts's own renderer also allows (mailto:,
 * attachment:, #, a relative path) is left untouched and never recorded in
 * `stripped` (Ruling 29).
 *
 * Pass 2 (bare URL-shaped substrings left over after pass 1): runs on pass
 * 1's OUTPUT, and by construction never sees a URL still sitting inside a
 * `[text](url)` span - pass 1 has already resolved every one of those. An
 * unpermitted bare URL is spliced out entirely (replaced with "").
 */
export function stripUnpermittedUrls(
  draftText: string,
  permitted: ReadonlySet<string>
): { text: string; stripped: string[] } {
  const stripped: string[] = [];

  const afterLinks = draftText.replace(MARKDOWN_LINK_RE, (match, text: string, target: string) => {
    if (isNonHttpAllowedTarget(target)) return match;
    const n = normalizeForComparison(target);
    if (n && permitted.has(n)) return match;
    stripped.push(target);
    return text;
  });

  const text = afterLinks.replace(BARE_URL_RE, (match) => {
    const n = normalizeForComparison(match);
    if (n && permitted.has(n)) return match;
    stripped.push(match);
    return "";
  });

  return { text, stripped };
}
