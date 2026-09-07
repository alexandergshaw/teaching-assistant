// NAMED FOR WHAT IT PRODUCES, not for what it reads, and that was a rename.
// It landed as announcement-exemplar.ts (singular), one character away from
// announcement-exemplars.ts (plural) - the Supabase store for the table that
// holds these things. Two different agents flagged the collision
// independently within minutes of each other, which is about as clear a
// signal as a naming problem ever gives. An import of the wrong one would
// type-check in neither direction, so it would not ship silently, but it
// would waste a reader every single time.
//
// This file now pairs with announcement-outline-types.ts, which defines the
// shape it returns.

// Derives a structural OUTLINE from a pasted announcement, per
// docs/announcement-from-walkthrough-acceptance-criteria.md AC2.
//
// This is a pure function, importing nothing but the shared types
// (announcement-outline-types.ts). No React, no DOM, no "use server", no
// clock, no randomness - see that file's own header for why: the deriver and
// the prompt composers that will consume its output are built concurrently,
// and a leaf that imports nothing cannot create the import cycle that
// yields `undefined` at runtime while tsc stays quiet.
//
// INPUT IS ALWAYS PLAIN TEXT (decision P12 in the acceptance doc). No HTML
// parser is imported here and none should be - a React textarea only ever
// hands this function `text/plain`, so there is no raw markup to strip.
//
// THE LINE THIS FILE MUST NOT CROSS (P11 in the acceptance doc): the
// exemplar is untrusted, arbitrary text that may contain last term's dates,
// last term's URLs, or a sentence written to look like an instruction to
// whatever reads it next. This module only ever returns SHAPE - never a
// substring of the input long enough to carry any of that. The one
// deliberate exception is `heading`, bounded in length below, because
// reproducing an instructor's own section names is most of what "the same
// format" means to them; every other field is a boolean, an enum, an index,
// or a numeric range.

import {
  type AnnouncementOutline,
  type OutlineListKind,
  type OutlineSection,
  EMPTY_ANNOUNCEMENT_OUTLINE,
} from "@/lib/announcement-outline-types";

/**
 * Longest a heading is allowed to be, in characters, before it is treated as
 * a paragraph instead. Chosen from real section headings ("Due This Week",
 * "What To Do This Week", "## Readings") - all comfortably under 30
 * characters - with generous headroom so a slightly longer heading still
 * passes, while a full sentence someone wrote on its own line does not.
 * Exported so the test file can construct a boundary case without the bound
 * being duplicated (and silently drifting) between the two files.
 */
export const HEADING_MAX_CHARS = 60;

/**
 * How far a sentence-count RANGE spreads around the estimated count. AC2
 * asks for a range specifically so this can be approximate rather than
 * pretending a one-document reading supports an exact number; a fixed pad
 * of 1 on each side is the simplest way to express "about this many,
 * plus or minus one" without building anything resembling a tokenizer.
 */
const SENTENCE_RANGE_PAD = 1;

// A line that opens with a common salutation and ends in a comma, with
// nothing else on the line. The trailing comma is the load-bearing part of
// this pattern: it is what separates "Hi everyone," (a greeting) from "Hi-
// fidelity mockups are due Friday" (a sentence that happens to start with
// the same word). Deliberately narrow - a missed greeting produces a
// slightly-off draft; a false positive would strip real content.
const GREETING_RE = /^(hi|hello|hey|dear|greetings|good morning|good afternoon|good evening)\b[^,]*,\s*$/i;

// A line that is nothing but a sign-off phrase, optionally followed by a
// trailing comma. Matches "Best," "Thanks," "Sincerely," etc. on their own
// line - the conventional shape of a sign-off - not a sentence that happens
// to contain one of these words.
const SIGNOFF_RE = /^(best regards|warm regards|kind regards|best|thanks|thank you|sincerely|regards|cheers|take care)[\s,]*$/i;

// Keyword-based, not date-parsing: this only ever answers "is there a
// due-date block here", never "what is the date". A block or heading
// mentioning "due" or "deadline" is treated as a due-date block regardless
// of whether an actual date follows, which is exactly the containment this
// feature needs - the detector cannot leak what it never reads.
const DUE_DATE_RE = /\b(due|deadline)\b/i;

// Two keyword sets, not one, for the "what to do this week" block - and the
// split is deliberate, found by running this file's own realistic test
// fixture through the first version and watching it misfire. "This week" is
// exactly the phrase a real todo-block heading uses ("What To Do This
// Week"), but it is also generic filler that shows up in ordinary
// scene-setting prose ("This week we are covering functions and scope").
// Matched against a HEADING, "this week" is a deliberate, reliable label; a
// bare word search across an announcement's entire body text is not.
// TODO_HEADING_RE is checked only against a section's own heading text;
// TODO_BODY_RE is the stricter set checked against body text (used both as
// the sole check when a section has no heading, and alongside the heading
// check when it does).
const TODO_HEADING_RE = /\b(this week|to-do|to do|action items?|next steps?)\b/i;
const TODO_BODY_RE = /\b(to-do|to-dos?|action items?|next steps?|checklist)\b/i;

// Matches a bare URL, a www.-prefixed host, or a markdown link - enough to
// answer "does this exemplar contain a link" without ever capturing which
// link. hasLinks is a boolean in the type for exactly this reason (see
// announcement-outline-types.ts): last term's URLs are content, and
// reproducing them would send students to last term's pages.
const LINK_RE = /(https?:\/\/\S+)|(\bwww\.\S+)|(\[[^\]]+\]\([^)]+\))/i;

const UNORDERED_LIST_RE = /^[-*]\s+\S/;
const ORDERED_LIST_RE = /^\d+[.)]\s+\S/;
const LIST_MARKER_RE = /^(?:[-*]|\d+[.)])\s+/;
const MARKDOWN_HEADING_RE = /^#{1,6}\s+(.*)$/;
const TERMINAL_PUNCTUATION_RE = /[.!?]$/;
const SENTENCE_END_RE = /[.!?]+(?:\s|$)/g;

function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function isListLine(line: string): boolean {
  return UNORDERED_LIST_RE.test(line) || ORDERED_LIST_RE.test(line);
}

/**
 * Groups the document into blocks of consecutive non-blank lines, one or
 * more blank lines apart - the plain-text stand-in for "paragraphs" that a
 * textarea's plain-text paste actually gives us. Every line is trimmed on
 * the way in: nothing downstream needs to preserve original whitespace, and
 * trimming once here means every later regex can assume a clean line.
 */
function buildBlocks(text: string): string[][] {
  const lines = normalizeLineEndings(text).split("\n");
  const blocks: string[][] = [];
  let current: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.length === 0) {
      if (current.length > 0) {
        blocks.push(current);
        current = [];
      }
      continue;
    }
    current.push(line);
  }
  if (current.length > 0) blocks.push(current);

  return blocks;
}

/** The heading's own text, with a leading markdown `#` marker (if any)
 * stripped - the marker is a formatting hint, not part of the label. */
function headingTextOf(line: string): string {
  const md = line.match(MARKDOWN_HEADING_RE);
  return (md ? md[1] : line).trim();
}

/**
 * Whether `line`, taken alone, reads as a heading rather than a sentence:
 * short, not a list item, and not ending in sentence-terminal punctuation.
 * A markdown `#` marker does not exempt a line from the length or
 * punctuation checks - a stray "#" in front of a full sentence should not
 * be able to smuggle a paragraph through as a heading.
 */
function looksLikeHeadingLine(line: string): boolean {
  if (isListLine(line)) return false;
  const text = headingTextOf(line);
  if (text.length === 0 || text.length > HEADING_MAX_CHARS) return false;
  if (TERMINAL_PUNCTUATION_RE.test(text)) return false;
  return true;
}

function isHeadingCandidateBlock(block: string[]): boolean {
  return block.length === 1 && looksLikeHeadingLine(block[0]);
}

/**
 * Decides whether `block` is a heading for the block that follows it, and
 * if so returns the heading text; otherwise returns null.
 *
 * Requires a following block to attach to - a heading-shaped line with
 * nothing after it is ambiguous (is it a heading with a missing body, or
 * just a short final remark?), and the conservative reading is to leave it
 * as its own paragraph rather than invent a section with no content.
 *
 * Also requires the FOLLOWING block not to itself be heading-shaped. Two
 * consecutive short, unpunctuated lines are ambiguous about which one is
 * the real heading - promoting the first would attach the second (which
 * might be its own heading for something further down) to it as prose,
 * silently losing a section. Neither line is promoted in that case; both
 * fall through to being reported as their own paragraph-break sections.
 * This is the conservative direction the acceptance criteria ask for: a
 * section wrongly reported as prose produces a slightly-off draft, while a
 * heading absorbing content that belonged to the next section actively
 * misplaces it.
 */
function tryExtractHeading(block: string[], nextBlock: string[] | undefined): string | null {
  if (!nextBlock) return null;
  if (!isHeadingCandidateBlock(block)) return null;
  if (isHeadingCandidateBlock(nextBlock)) return null;
  return headingTextOf(block[0]);
}

/** Whether `block` reads as a greeting, and its opening line, so the caller
 * can either drop the whole block or keep the remainder. */
function stripGreeting(blocks: string[][]): { blocks: string[][]; hasGreeting: boolean } {
  if (blocks.length === 0) return { blocks, hasGreeting: false };

  const [first, ...rest] = blocks;
  if (!GREETING_RE.test(first[0])) return { blocks, hasGreeting: false };

  const remainder = first.slice(1);
  const newBlocks = remainder.length > 0 ? [remainder, ...rest] : rest;
  return { blocks: newBlocks, hasGreeting: true };
}

/** Mirror of stripGreeting for the closing sign-off, scanning the LAST
 * block for the first line that reads as a sign-off phrase and dropping
 * everything from there to the end of that block. */
function stripSignOff(blocks: string[][]): { blocks: string[][]; hasSignOff: boolean } {
  if (blocks.length === 0) return { blocks, hasSignOff: false };

  const lastIndex = blocks.length - 1;
  const last = blocks[lastIndex];
  const matchIndex = last.findIndex((line) => SIGNOFF_RE.test(line));
  if (matchIndex === -1) return { blocks, hasSignOff: false };

  const kept = last.slice(0, matchIndex);
  const newBlocks = kept.length > 0 ? [...blocks.slice(0, lastIndex), kept] : blocks.slice(0, lastIndex);
  return { blocks: newBlocks, hasSignOff: true };
}

interface BlockAnalysis {
  listKind: OutlineListKind;
  sentenceRange: readonly [number, number];
}

/**
 * Reads a content block's SHAPE only - never its text past what is needed
 * to classify it. A block counts as a list only when every one of its
 * (already blank-line-delimited) lines is a list item; a single line
 * starting with "-" is left as prose, since one bulleted sentence is not
 * the same format signal as a run of list items. The sentence count is a
 * rough proxy - punctuation density for prose, item count for a list when
 * that outnumbers the punctuation (list items often skip terminal
 * punctuation entirely, e.g. "- Homework 3 (due Friday)") - and is always
 * turned into a [min, max] range via SENTENCE_RANGE_PAD rather than
 * reported as a single number.
 */
function analyzeBlock(block: string[]): BlockAnalysis {
  const listLineCount = block.filter(isListLine).length;
  const listKind: OutlineListKind =
    block.length >= 2 && listLineCount === block.length
      ? ORDERED_LIST_RE.test(block[0])
        ? "ordered"
        : "unordered"
      : null;

  // An ordered list's own "1." "2." markers match the sentence-end pattern
  // just as well as a real sentence terminator does, which would inflate
  // the count on marker noise alone - so markers are stripped before
  // counting, for both list kinds (unordered markers do not end in
  // terminal punctuation, but stripping them uniformly costs nothing).
  const textForCounting = listKind ? block.map((line) => line.replace(LIST_MARKER_RE, "")) : block;
  const joined = textForCounting.join(" ");
  const sentenceMatches = joined.match(SENTENCE_END_RE)?.length ?? 0;
  const base = listKind ? Math.max(sentenceMatches, block.length) : Math.max(sentenceMatches, 1);

  const min = Math.max(1, base - SENTENCE_RANGE_PAD);
  const max = base + SENTENCE_RANGE_PAD;
  return { listKind, sentenceRange: [min, max] };
}

/**
 * Reads a pasted announcement and returns its structural outline: section
 * shapes, greeting/sign-off presence, and the location of a due-date block
 * and a "this week" block, if either exists. See this file's header for the
 * containment rule this function must never violate: nothing that reaches
 * the return value is long enough, or specific enough, to carry the
 * exemplar's actual content - except `heading`, bounded above.
 */
export function deriveAnnouncementOutline(text: string): AnnouncementOutline {
  const rawBlocks = buildBlocks(text);
  if (rawBlocks.length === 0) return EMPTY_ANNOUNCEMENT_OUTLINE;

  const afterGreeting = stripGreeting(rawBlocks);
  const afterSignOff = stripSignOff(afterGreeting.blocks);
  const blocks = afterSignOff.blocks;
  const hasGreeting = afterGreeting.hasGreeting;
  const hasSignOff = afterSignOff.hasSignOff;

  const sections: OutlineSection[] = [];
  let dueDateSectionIndex: number | null = null;
  let todoSectionIndex: number | null = null;

  let i = 0;
  while (i < blocks.length) {
    const block = blocks[i];
    const nextBlock = blocks[i + 1];
    const headingText = tryExtractHeading(block, nextBlock);

    const bodyBlock = headingText !== null ? nextBlock! : block;
    const { listKind, sentenceRange } = analyzeBlock(bodyBlock);

    const section: OutlineSection = {
      index: sections.length + 1,
      heading: headingText,
      break: headingText !== null ? "heading" : "paragraph-break",
      listKind,
      sentenceRange,
    };
    sections.push(section);

    const bodyText = bodyBlock.join(" ");
    const searchText = `${headingText ?? ""} ${bodyText}`;
    if (dueDateSectionIndex === null && DUE_DATE_RE.test(searchText)) {
      dueDateSectionIndex = section.index;
    }
    if (todoSectionIndex === null) {
      const headingMatches = headingText !== null && TODO_HEADING_RE.test(headingText);
      const bodyMatches = TODO_BODY_RE.test(bodyText);
      if (headingMatches || bodyMatches) todoSectionIndex = section.index;
    }

    i += headingText !== null ? 2 : 1;
  }

  const hasLinks = LINK_RE.test(text);

  // A single, unheaded, otherwise-uninteresting paragraph carries no
  // structure worth reporting - collapse it to the canonical empty value
  // rather than a one-section look-alike, so every consumer compares
  // against one value instead of several that happen to be shaped the
  // same. Every other field must also be at its default: a lone paragraph
  // that mentions a due date, a link, or reads as a "this week" block is
  // real signal and must not be discarded.
  const isTriviallyEmpty =
    sections.length === 1 &&
    sections[0].heading === null &&
    !hasGreeting &&
    !hasSignOff &&
    dueDateSectionIndex === null &&
    todoSectionIndex === null &&
    !hasLinks;
  if (isTriviallyEmpty) return EMPTY_ANNOUNCEMENT_OUTLINE;

  return {
    sections,
    hasGreeting,
    hasSignOff,
    dueDateSectionIndex,
    todoSectionIndex,
    hasLinks,
  };
}
