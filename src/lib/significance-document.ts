// Pure, LLM-free helpers for the per-week "Significance of the Material"
// document's required shape: a SHORT OPENING PARAGRAPH, then exactly THREE
// BULLETS, then a SHORT CLOSING PARAGRAPH - nothing else. Set by the
// instructor; previously the document was "3-5 short paragraphs" with no
// bullets at all.
//
// Kept in its own plain module rather than living inside
// weekly-significance.ts because that file carries "use server", and a "use
// server" module may export only async functions (plus type-only exports) -
// see use-server-exports.test.ts. A sync `export function` or `export const`
// there compiles clean under tsc and passes vitest, then breaks
// `next build`. Everything below is a pure, synchronous function, so it has
// to live here instead.
//
// Three responsibilities live here:
//   - parseSignificanceDocument: split an already-generated document into its
//     title/opening/bullets/closing parts, leniently (never throws).
//   - significanceShapeIssues: validate that a document actually has the
//     required shape, returning a list of human-readable problems (empty
//     when the shape is correct).
//   - buildEmbeddedSignificanceDocument: build the "embedded" provider's
//     document text in code, with no model call - the one branch whose
//     output is fully guaranteed, so it is built to satisfy
//     significanceShapeIssues by construction rather than by hoping a prompt
//     was followed.

/** The document's required bullet count. Referenced by both the shape
 * checker and the embedded builder so the number lives in exactly one place. */
export const SIGNIFICANCE_BULLET_COUNT = 3;

/** A parsed "Significance of the Material" document. `title` is null when
 * the document has no leading "# " heading line - a document is still
 * parseable without one, it just has no title. */
export interface SignificanceDocument {
  title: string | null;
  opening: string;
  bullets: string[];
  closing: string;
}

// A markdown heading line: one or more leading "#"s, a space, then text. Only
// used here to recognize the optional title line - unlike docx-blocks.ts,
// this module never renders the heading, it only reads it off.
const TITLE_LINE_RE = /^#+\s+(.*)$/;

// A bullet line: "-" or "*", a space, then text. Deliberately anchored to the
// START of the (already-trimmed) line, so "Access control - the rule about
// who reaches what - matters." is never mistaken for a bullet just because it
// contains a dash later in the sentence - only a line that actually BEGINS
// with a marker counts.
const BULLET_LINE_RE = /^[-*]\s+(.*)$/;

/**
 * Split `text` into paragraph-or-list "blocks": consecutive non-blank lines,
 * separated by one or more blank lines. Each line is trimmed on the way in,
 * so leading/trailing whitespace on a line (or a run of blank lines with
 * stray spaces on them) never produces a spurious empty block. Leading and
 * trailing blank lines never produce empty blocks either, since a block is
 * only ever pushed when it has at least one line in it.
 */
function splitIntoBlocks(text: string): string[][] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: string[][] = [];
  let current: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "") {
      if (current.length > 0) {
        blocks.push(current);
        current = [];
      }
      continue;
    }
    current.push(trimmed);
  }
  if (current.length > 0) blocks.push(current);
  return blocks;
}

/** True when every line in `block` is a bullet line (see `BULLET_LINE_RE`).
 * An empty block is never a bullet block - `splitIntoBlocks` never produces
 * one, but this keeps the predicate correct even if that ever changed. */
function isBulletBlock(block: string[]): boolean {
  return block.length > 0 && block.every((line) => BULLET_LINE_RE.test(line));
}

/**
 * Parse `text` into title/opening/bullets/closing. Never throws - a
 * malformed document (wrong bullet count, missing opening or closing, extra
 * prose) still parses to its best-effort pieces; call `significanceShapeIssues`
 * separately to find out whether the shape is actually correct. This
 * separation (a lenient parser plus a strict validator) is deliberate: a
 * caller that only wants to READ a document that is already known to be
 * well-formed (e.g. `buildEmbeddedSignificanceDocument`'s own tests) should
 * not have to handle a thrown error, and a caller that wants to VALIDATE an
 * LLM's output needs specific, actionable issues rather than a boolean.
 *
 * The optional title is the first block, but ONLY when that block is a
 * single line matching a markdown heading ("# ..." or deeper) - a one-line
 * block that is not a heading (e.g. "Opening." with no title present at all)
 * is left as the opening paragraph instead, not mistaken for a title.
 *
 * Of the remaining blocks, the first one that is entirely bullet lines (see
 * `isBulletBlock`) is taken as THE bullet list; every block before it is
 * joined together as the opening paragraph, every block after it as the
 * closing paragraph. Blocks are joined with a blank line between them, and
 * a wrapped paragraph's own internal lines are joined with a single space,
 * so a paragraph that wraps across source lines (no blank line between them)
 * still reads as one continuous sentence rather than carrying a stray
 * mid-sentence newline.
 */
export function parseSignificanceDocument(text: string): SignificanceDocument {
  const blocks = splitIntoBlocks(text);

  let title: string | null = null;
  let startIndex = 0;
  if (blocks.length > 0 && blocks[0].length === 1) {
    const match = blocks[0][0].match(TITLE_LINE_RE);
    if (match) {
      title = match[1].trim();
      startIndex = 1;
    }
  }

  const remaining = blocks.slice(startIndex);
  const bulletBlockIndex = remaining.findIndex(isBulletBlock);

  const openingBlocks = bulletBlockIndex === -1 ? remaining : remaining.slice(0, bulletBlockIndex);
  const closingBlocks = bulletBlockIndex === -1 ? [] : remaining.slice(bulletBlockIndex + 1);
  const bullets =
    bulletBlockIndex === -1
      ? []
      : remaining[bulletBlockIndex].map((line) => {
          const match = line.match(BULLET_LINE_RE);
          // Every line in a bullet block matched BULLET_LINE_RE to get here
          // (see isBulletBlock), so `match` is never null in practice - the
          // fallback to the raw line is defensive only.
          return match ? match[1].trim() : line;
        });

  const joinBlocks = (blocksToJoin: string[][]) =>
    blocksToJoin
      .map((block) => block.join(" "))
      .join("\n\n")
      .trim();

  return {
    title,
    opening: joinBlocks(openingBlocks),
    bullets,
    closing: joinBlocks(closingBlocks),
  };
}

/**
 * Validate that `text` has the required shape - a short opening paragraph,
 * exactly `SIGNIFICANCE_BULLET_COUNT` bullets, then a short closing
 * paragraph - and return a list of human-readable problems (empty when the
 * shape is correct). Never throws, including on an empty or whitespace-only
 * document.
 *
 * Deliberately does its own block analysis rather than calling
 * `parseSignificanceDocument` and inspecting the result: a malformed
 * document can have more than one bullet-shaped block, or more than one
 * paragraph on either side of the bullets, and the parser's "first bullet
 * block wins, everything before/after it is one joined paragraph" behavior
 * would silently swallow exactly the problems this function exists to
 * report (e.g. two closing paragraphs would just get joined into one
 * `closing` string, hiding the fact that the shape is wrong).
 */
export function significanceShapeIssues(text: string): string[] {
  const issues: string[] = [];
  const blocks = splitIntoBlocks(text);

  if (blocks.length === 0) {
    issues.push("The document is empty.");
    return issues;
  }

  let startIndex = 0;
  if (blocks[0].length === 1 && TITLE_LINE_RE.test(blocks[0][0])) {
    startIndex = 1;
  }

  const remaining = blocks.slice(startIndex);
  const bulletBlockIndexes: number[] = [];
  remaining.forEach((block, index) => {
    if (isBulletBlock(block)) bulletBlockIndexes.push(index);
  });

  if (bulletBlockIndexes.length === 0) {
    issues.push(
      `No bullet list was found; the document must contain exactly ${SIGNIFICANCE_BULLET_COUNT} bullets.`
    );
    // With no bullet list to anchor on, there is no reliable way to say
    // which remaining block was meant to be the opening and which the
    // closing paragraph - report the one certain problem and stop, rather
    // than guessing and risking a misleading second message.
    return issues;
  }

  if (bulletBlockIndexes.length > 1) {
    issues.push("More than one bullet list was found; the document must contain exactly one list of bullets.");
  }

  const bulletBlockIndex = bulletBlockIndexes[0];
  const bulletCount = remaining[bulletBlockIndex].length;
  if (bulletCount !== SIGNIFICANCE_BULLET_COUNT) {
    issues.push(
      `Found ${bulletCount} bullet(s); the document must contain exactly ${SIGNIFICANCE_BULLET_COUNT} bullets.`
    );
  }

  const openingBlocks = remaining.slice(0, bulletBlockIndex);
  const closingBlocks = remaining.slice(bulletBlockIndex + 1);

  if (openingBlocks.length === 0) {
    issues.push("Missing the short opening paragraph before the bullets.");
  } else if (openingBlocks.length > 1) {
    issues.push("Found extra prose before the bullets; there must be exactly one opening paragraph.");
  }

  if (closingBlocks.length === 0) {
    issues.push("Missing the short closing paragraph after the bullets.");
  } else if (closingBlocks.length > 1) {
    issues.push("Found extra prose after the bullets; there must be exactly one closing paragraph.");
  }

  return issues;
}

/**
 * The case-study facts the embedded builder is allowed to state - a subset
 * of `CaseStudyAssignment` (case-study-prompt.ts) shaped so this pure module
 * never has to import from that file. `period` accepts `string | null |
 * undefined` rather than matching `CaseStudyAssignment.period`'s `string |
 * undefined` exactly, because "no period established" is represented as
 * `null` by this function's own callers/tests and as `undefined` by
 * `CaseStudyAssignment` - both mean the same thing here (omit the period
 * entirely) and both must be accepted without the caller having to convert
 * one into the other first.
 */
export interface EmbeddedSignificanceCaseStudy {
  organization: string;
  period?: string | null;
  hook: string;
}

/**
 * Build the "embedded" provider's Significance-of-the-Material document text
 * in code, with no model call. This is the one branch whose output can
 * actually be GUARANTEED to match the required shape (every other provider
 * goes through an LLM, whose output can only be asked for, never assured) -
 * so unlike the prompt in weekly-significance.ts, this function is built to
 * satisfy `significanceShapeIssues` by construction, and that guarantee is
 * exercised directly in significance-document.test.ts.
 *
 * Only facts already present on `caseStudy` are ever stated - the same
 * no-fabrication rule the LLM prompt is given, but enforced here by
 * construction rather than by instruction: `period` is folded into the
 * organization mention only when present (never a literal "()" or the word
 * "null" when it is not), and no other fact about the case study is
 * invented to pad the bullets out to three - the three bullets below are
 * built from the topic, the organization (with its period when known), and
 * the hook, which is all the caller ever gives this function.
 */
export function buildEmbeddedSignificanceDocument(topic: string, caseStudy: EmbeddedSignificanceCaseStudy): string {
  const cleanTopic = topic.trim();
  const periodLine = caseStudy.period ? ` (${caseStudy.period})` : "";
  const org = `${caseStudy.organization}${periodLine}`;

  const opening = `${cleanTopic} is not just an academic exercise - ${org} shows what is at stake in the real world.`;

  const bullets = [
    `${org} put this week's subject to the test in a real setting, not a hypothetical one.`,
    caseStudy.hook,
    `The gap between knowing this material and applying it under pressure is exactly where ${org} either succeeded or fell short.`,
  ];

  const closing =
    "Understanding this week's material is what separates someone who can only follow a checklist from someone who recognizes this same situation the next time it appears.";

  return [
    "# Why This Week's Material Matters",
    "",
    opening,
    "",
    ...bullets.map((bullet) => `- ${bullet}`),
    "",
    closing,
  ].join("\n");
}
