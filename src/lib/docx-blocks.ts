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
//     to branch 2 as their own independent bare-URL candidates. This url is
//     an explicit, authored `(url)` target, not sniffed out of prose, so it
//     is left greedy — it stops only at whitespace or ")", exactly as
//     before. A malformed target with no scheme still falls through to
//     ordinary text (see `tokenizeInline`'s doc comment).
//   branch 2 - a bare `https://` or `http://` URL, sniffed out of ordinary
//     prose, tried only where branch 1 did not match. Unlike branch 1, this
//     one must not swallow the sentence punctuation that follows it in
//     running text ("...see https://example.com/guide." must not capture
//     the trailing "."), so its greedy `[^\s)]*` run is required to end on a
//     character that is not a trailing `.` `,` `;` `:` `!` or `?` — the
//     regex engine backtracks off the run one character at a time until it
//     finds one, so a whole trailing punctuation cluster ("...guide?!") is
//     stripped, not just its last character. ")" is excluded from the run
//     entirely (as it always has been), so the match also always stops
//     before a closing paren, balanced or not.
const INLINE_LINK_RE =
  /\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s)]*[^\s).,;:!?])/g;

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
 *
 * A bare URL never carries trailing sentence punctuation (`.` `,` `;` `:`
 * `!` `?`) into its link target or its display text — "see https://x.com/y."
 * links only `https://x.com/y`, leaving the period as ordinary text right
 * after it, so the rendered hyperlink target is never a dead link one
 * character too long. A markdown-link `(url)` target is unaffected: it is an
 * explicit, authored target rather than one sniffed out of prose, so it is
 * taken verbatim.
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

// ── Markdown pipe tables ────────────────────────────────────────────────
//
// A generator emits a markdown table as ordinary "| a | b |" lines mixed into
// its plain text; buildDocxFromPlainText used to pass those lines straight
// through as literal paragraph text, so a student opened the finished .docx
// and saw raw pipe syntax instead of a table. The functions below turn that
// line shape into structured data (header cells, body rows); docx.ts is
// responsible for turning that structured data into a real Word table.

// A private-use character, chosen because it can never appear in real
// markdown source text, used to hide an escaped pipe ("\|") from the
// cell-splitting pass in splitTableRow so it is never mistaken for a column
// delimiter - restored to a literal "|" in the finished cell text afterward.
const ESCAPED_PIPE_PLACEHOLDER = "";

/**
 * Split one already-trimmed markdown table row into its cell strings.
 * Handles a leading and/or trailing "|" (either is optional - GFM allows
 * both a "boxed" `| a | b |` row and a bare `a | b` row) and a `\|` escape
 * inside a cell, which survives as a literal "|" in that cell's text rather
 * than being treated as a delimiter.
 */
export function splitTableRow(line: string): string[] {
  let working = line.trim().split("\\|").join(ESCAPED_PIPE_PLACEHOLDER);
  if (working.startsWith("|")) working = working.slice(1);
  if (working.endsWith("|")) working = working.slice(0, -1);
  return working.split("|").map((cell) => cell.trim().split(ESCAPED_PIPE_PLACEHOLDER).join("|"));
}

/** True when `line` has at least one "|" that is not escaped with a "\". */
function hasUnescapedPipe(line: string): boolean {
  for (let i = 0; i < line.length; i++) {
    if (line[i] === "|" && line[i - 1] !== "\\") return true;
  }
  return false;
}

// A markdown table's required second line: every cell made of only "-", with
// an optional leading/trailing ":" for alignment (accepted but ignored -
// every generated table renders left-aligned). This is what distinguishes an
// actual table from an unrelated line of prose that happens to contain a "|"
// (a bitwise-OR code example, say) sitting directly above it - without this
// check, ordinary text could be misread as a table header.
const SEPARATOR_CELL_RE = /^:?-+:?$/;

/** True when `line` is a valid markdown table separator row (`| --- | --- |`). */
export function isTableSeparatorRow(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || !hasUnescapedPipe(trimmed)) return false;
  const cells = splitTableRow(trimmed);
  return cells.length > 0 && cells.every((cell) => SEPARATOR_CELL_RE.test(cell));
}

/**
 * A parsed markdown pipe table: header cells, zero or more body rows (each
 * exactly as split - never padded, see `normalizeTableRowWidth`), and how
 * many source lines (header + separator + every body row) it consumed.
 */
export interface ParsedMarkdownTable {
  headerCells: string[];
  bodyRows: string[][];
  lineCount: number;
}

/**
 * Try to parse a markdown pipe table starting at `lines[startIndex]`. Returns
 * null - never throws - when the line at `startIndex` is not a plausible
 * header (no unescaped "|") or the very next line is not a valid separator
 * row (see `isTableSeparatorRow`). The caller then renders `lines[startIndex]`
 * as ordinary text exactly as it would without this function existing - that
 * is what "a malformed table degrades to the original text" means in
 * practice: this function simply declines to claim the line, and every path
 * that already existed for plain text handles it from there.
 *
 * On success, keeps consuming subsequent lines as body rows for as long as
 * each one is non-blank, contains an unescaped "|", and is not itself a
 * markdown heading line (guards a heading that happens to contain a literal
 * "|" - "## A | B comparison" - sitting directly under a table with no blank
 * line between them: it stays a heading, never gets swallowed as a row). A
 * blank line, a heading line, or a line with no "|" ends the table, so a
 * table at the very end of the document ends cleanly at end-of-input, and a
 * table at the very start works the same as one anywhere else - `startIndex`
 * is just wherever the caller is scanning from.
 */
export function parseMarkdownTable(lines: string[], startIndex: number): ParsedMarkdownTable | null {
  const headerLine = lines[startIndex];
  if (headerLine === undefined) return null;
  const headerTrimmed = headerLine.trim();
  if (!headerTrimmed || !hasUnescapedPipe(headerTrimmed)) return null;

  const separatorLine = lines[startIndex + 1];
  if (separatorLine === undefined || !isTableSeparatorRow(separatorLine)) return null;

  const headerCells = splitTableRow(headerTrimmed);
  if (headerCells.length === 0) return null;

  const bodyRows: string[][] = [];
  let i = startIndex + 2;
  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (!trimmed || !hasUnescapedPipe(trimmed) || MARKDOWN_HEADING_RE.test(trimmed)) break;
    bodyRows.push(splitTableRow(trimmed));
    i++;
  }

  return { headerCells, bodyRows, lineCount: i - startIndex };
}

/**
 * Pad or trim `cells` to exactly `columnCount` entries, so every row in a
 * rendered table lines up with the header even when the source markdown was
 * ragged. Fewer cells than the header pads with empty strings at the end
 * (content is never dropped or shifted - a short row just leaves its
 * trailing columns blank); more cells than the header truncates the extras
 * rather than growing the table past its own header row.
 */
export function normalizeTableRowWidth(cells: string[], columnCount: number): string[] {
  if (cells.length === columnCount) return cells;
  if (cells.length > columnCount) return cells.slice(0, columnCount);
  return [...cells, ...Array(columnCount - cells.length).fill("")];
}
