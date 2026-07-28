// Pure, docx-library-free line-classification helpers for the shared .docx
// renderer (see ./docx.ts). Kept separate so the fence state machine, heading
// depth mapping, and bullet-level math can be unit-tested directly without
// building an actual Word document.

/** The four Word heading styles this renderer produces. */
export type HeadingKind = "TITLE" | "HEADING_1" | "HEADING_2" | "HEADING_3";

/** A markdown heading line: 1-6 leading "#"s, a space, then the heading text. */
export const MARKDOWN_HEADING_RE = /^(#{1,6})\s+(.*)$/;

/** A list item line: "- text", "* text", or "1. text" (numbering is always stripped). */
const LIST_ITEM_RE = /^(?:\d+\.|[-•*])\s+(.*)$/;

/**
 * Map a markdown heading's "#" count to the Word heading it renders as. A
 * single "#" is always the Title; "##"/"###"/"####" map to Heading 1/2/3; a
 * stray "#####"/"######" also collapses to Heading 3, the deepest heading
 * style this renderer defines.
 */
export function markdownHeadingKind(hashCount: number): HeadingKind {
  if (hashCount <= 1) return "TITLE";
  if (hashCount === 2) return "HEADING_1";
  if (hashCount === 3) return "HEADING_2";
  return "HEADING_3";
}

/**
 * Derive a bullet nesting level (0, 1, or 2) from a source line's leading
 * whitespace. A tab counts as 4 spaces: 0-1 leading spaces -> level 0, 2-3 ->
 * level 1, 4 or more -> level 2 (the deepest level this renderer defines).
 */
export function bulletLevelFromIndent(rawLine: string): number {
  let width = 0;
  for (const char of rawLine) {
    if (char === " ") width += 1;
    else if (char === "\t") width += 4;
    else break;
  }
  if (width >= 4) return 2;
  if (width >= 2) return 1;
  return 0;
}

/**
 * Strip a leading list marker ("-", "*", "1.") from an already-trimmed line,
 * returning the remaining content. Returns null when the line is not a list
 * item, in which case it is not a list at all.
 */
export function stripListMarker(trimmed: string): string | null {
  const match = trimmed.match(LIST_ITEM_RE);
  return match ? match[1] : null;
}

/**
 * One piece of an inline-parsed line: either plain text, or a link (a bare
 * URL or a markdown `[text](url)` link) with its display text and target.
 */
export type InlineToken = { kind: "text"; text: string } | { kind: "link"; text: string; url: string };

// A single alternation, walked once, left to right, with `exec`'s own
// lastIndex advancing past whatever it just matched:
//   branch 1 - a markdown link `[display text](https://url)`. Tried first at
//     every position, so it always wins over the bare-URL branch when both
//     could start at the same "[" — that is what gives markdown links
//     precedence, and it also means the url and the display text inside a
//     matched link are consumed as part of that one match and never handed
//     to branch 2 as their own independent bare-URL candidates.
//   branch 2 - a bare `https://` or `http://` URL, tried only where branch 1
//     did not match.
// The display-text class excludes "]" (not "["), so a nested "[" inside the
// text is tolerated, but the match can never span past the first "]" it
// finds — the shortest well-formed span, never an over-greedy one. The URL
// in both branches stops at whitespace or ")" (matching the app's existing
// bare-URL convention) so a link doesn't swallow a trailing sentence or a
// closing paren that belongs to the surrounding prose.
const INLINE_LINK_RE = /\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s)]+)/g;

/**
 * Walk a single line of already-fence-free, already-list-marker-stripped
 * content and split it into an ordered sequence of plain-text and link
 * tokens. A single combined pattern does the whole walk in one pass (see
 * `INLINE_LINK_RE`), so markdown links and bare URLs can never end up
 * reordered or double-matched the way stitching together two independent
 * `.split()` passes over the same string could.
 *
 * Malformed markdown-link syntax (`[text]` with no `(url)`, an unterminated
 * `[text](`, a `(url)` with no recognized `http(s)` scheme, unbalanced or
 * nested brackets with no matching close) never matches the markdown-link
 * branch, so it is carried through as ordinary text — never dropped, never
 * thrown. An empty display text (`[](url)`) still produces a link token, with
 * the url itself standing in as the display text (an empty hyperlink run
 * would otherwise be unclickable in Word).
 */
export function tokenizeInline(content: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let cursor = 0;
  INLINE_LINK_RE.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = INLINE_LINK_RE.exec(content))) {
    if (match.index > cursor) tokens.push({ kind: "text", text: content.slice(cursor, match.index) });

    const [full, markdownText, markdownUrl, bareUrl] = match;
    if (markdownUrl !== undefined) {
      tokens.push({ kind: "link", text: markdownText || markdownUrl, url: markdownUrl });
    } else {
      tokens.push({ kind: "link", text: bareUrl, url: bareUrl });
    }
    cursor = match.index + full.length;
  }

  if (cursor < content.length) tokens.push({ kind: "text", text: content.slice(cursor) });
  return tokens;
}

/** The result of feeding one line through a `CodeFenceTracker`. */
export type FenceLineKind =
  | "delimiter" // this line itself is a ``` fence marker and must not render
  | "code" // this line is inside a fence and should render verbatim
  | "normal"; // this line is outside any fence and gets normal treatment

/**
 * Tracks whether the renderer is currently inside a ``` fenced code block.
 * Feed it every source line's trimmed form, in order. The tracker never
 * throws — an unterminated fence simply stays open through the end of input,
 * so every line inside it still gets classified as "code".
 */
export class CodeFenceTracker {
  private active = false;

  consume(trimmedLine: string): FenceLineKind {
    if (trimmedLine.startsWith("```")) {
      this.active = !this.active;
      return "delimiter";
    }
    return this.active ? "code" : "normal";
  }

  get inFence(): boolean {
    return this.active;
  }
}

/**
 * True when at least one line in the document (outside a fenced ``` code
 * block) is a markdown heading line (see `MARKDOWN_HEADING_RE`). This is a
 * document-level pre-pass, run over every line before any rendering starts,
 * so a heading appearing late in the document still counts - the caller
 * (`buildDocxFromPlainText`) uses the result to decide, for the WHOLE
 * document up front, whether the length/blank-line heading heuristic may run
 * at all: when the document already uses explicit markdown headings, every
 * non-`#` line outside a fence is body text, full stop - never guessed into
 * a heading. Fence-aware: a "#" line inside a ``` block is code, not a
 * heading, and does not count.
 */
export function hasMarkdownHeading(lines: string[]): boolean {
  const fence = new CodeFenceTracker();
  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (fence.consume(trimmed) !== "normal") continue;
    if (MARKDOWN_HEADING_RE.test(trimmed)) return true;
  }
  return false;
}
