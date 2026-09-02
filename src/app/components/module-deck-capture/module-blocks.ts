// Module walkthrough capture - block accumulation, chrome suppression and
// materials rendering. The React-free, DOM-free pure module for this feature
// (docs/module-walkthrough-deck-acceptance-criteria.md section 7, DE1-DE21 -
// MEASURED, and overrides sections 5/6 wherever they conflict). Following
// discussion-capture.ts's own precedent: this file has NO React, no hooks, no
// `document`, no `window`, no clock reads - every timestamp a caller might
// want logged is passed in as data, never read here, so this stays unit
// testable in a repo where vitest is node-env and renders nothing.
//
// This file owns the hardest data problem in the feature: turning a
// scrolling capture's dozens-of-consecutive-frames-of-the-same-heading
// output into deck materials text. Two "obvious" implementations are
// measurably wrong and are explicitly REJECTED below - see each function's
// own header for the specific trap and why it was rejected.
//
// `ExtractedBlock`/`ModuleBlockKind` are owned by the sibling file
// `module-extraction-prompt.ts` (a concurrent group's file, same directory).
// The LANDED shape there is:
//   type ModuleBlockKind = "prose" | "list" | "table" | "code" | "caption" | "objectives" | "activity"
//   interface ExtractedBlock { heading: string; text: string; kind: ModuleBlockKind; illegible?: boolean }
// Two things worth calling out because the brief this file was built from
// described a slightly different shape:
//  1. There is NO "heading"/"subheading" block kind at all - `heading` is a
//     plain string FIELD every block carries, naming the section it belongs
//     to, not a block of its own. `## heading` rendering below therefore
//     fires on a HEADING-FIELD TRANSITION between consecutive blocks, not on
//     a block kind. There is only one heading level in this data model, so
//     there is no corresponding "### subheading" output - a second level was
//     never landed to render.
//  2. The extraction prompt's own OUTPUT contract joins multiple list items
//     or multiple table rows into ONE block's `text` with "\n" between them
//     ("kind":"list"/"table" blocks are not one-item-per-block) - so
//     `renderMaterialsText` splits a block's own text on "\n" to find the
//     individual items/rows it must prefix, rather than assuming one
//     ExtractedBlock is always one line.
//
// DE13's actual requirement (headings are exact-normalized only, and act as
// segment boundaries that block cross-block merging) is enforced via that
// same `heading` field: the seam-merge step in appendBatchBlocks refuses to
// fire across two blocks whose `heading` differs, and the window join in the
// same function requires heading equality in addition to text equality per
// matched pair - see that function's own comment for why (a real repeat
// under a DIFFERENT heading must never be treated as a scroll-duplicate of
// the same line under the first heading).

import { normalizeForMatch } from "@/app/components/recording/discussion-capture";
import type { ExtractedBlock, ModuleBlockKind } from "./module-extraction-prompt";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** AM-H: the suffix/prefix seam-join window. Two consecutive batches overlap
 * because the last frame of batch n and the first of n+1 are ~1.5s apart on
 * the same scroll - this is how many trailing/leading blocks are checked for
 * a contiguous exact-match run before giving up. */
export const OVERLAP_WINDOW = 12;

/** DE12: any normalized line appearing in more than this fraction of batches
 * is page furniture (nav rail, breadcrumb, footer), not content. Measured:
 * 182 chars in EVERY frame, 146,000 characters over a 20-minute run - 7x the
 * entire materials cap, of pure noise. */
export const FURNITURE_FREQUENCY_THRESHOLD = 0.6;

/** DE14: the cap for rendered materials text handed to the deck generator.
 * ~30K tokens, under 3% of the 1,048,576-token context window, leaving room
 * for the deck prompt and its maxOutputTokens; the repo's own precedent at
 * gemini.ts:59 sets 400,000 characters for a single graded submission,
 * explicitly because a smaller cap there "silently discarded up to ~95%" of
 * its input. This number is UNMEASURED and reasoned, not observed - the run
 * log records before/after character counts so it becomes a measured number
 * after the first real walkthrough. */
export const DECK_MATERIALS_CAP = 120_000;

/** Never let a downsampled segment shrink to nothing - DE16 requires every
 * part of the module to survive at reduced depth, not vanish. */
const MIN_SEGMENT_CHARS = 200;

function normalizedTextOf(block: { text: string }): string {
  return normalizeForMatch(block.text);
}

function isListLikeKind(kind: ModuleBlockKind): boolean {
  return kind === "list" || kind === "objectives";
}

function isTableKind(kind: ModuleBlockKind): boolean {
  return kind === "table";
}

function isCodeKind(kind: ModuleBlockKind): boolean {
  return kind === "code";
}

// ---------------------------------------------------------------------------
// suppressPageFurniture - DE12: do this FIRST, the single biggest win.
//
// Nothing in this repo does this today. A normalized line's FREQUENCY across
// batches (not its raw occurrence count - a nav rail rendered twice in one
// screenshot must not inflate its own frequency past what one batch
// contributes) is compared against FURNITURE_FREQUENCY_THRESHOLD. Anything
// over the line is chrome and is stripped from every batch it appears in.
// This is a belt-and-suspenders safety net: the extraction prompt itself
// (module-extraction-prompt.ts) already instructs the model to never return
// furniture as a block at all - this function exists for whatever slips
// past that instruction, the way DE12 measured a naive reuse doing.
//
// Lossless and counted: nothing here silently vanishes without a number the
// caller can put in the run log - `charsRemoved`/`blocksRemoved` count
// exactly what left, and `furnitureLineCount` says how many DISTINCT
// normalized lines were classified as chrome.
// ---------------------------------------------------------------------------

export interface SuppressFurnitureResult {
  /** Same batch shape as the input, with furniture blocks removed. */
  batches: ExtractedBlock[][];
  /** Sum of `.text.length` over every removed block (real characters, not
   * normalized-string length) - what the run log reports as removed at this
   * stage. */
  charsRemoved: number;
  blocksRemoved: number;
  /** How many DISTINCT normalized lines were classified as furniture. */
  furnitureLineCount: number;
}

export function suppressPageFurniture(blocksByFrameBatch: ReadonlyArray<ReadonlyArray<ExtractedBlock>>): SuppressFurnitureResult {
  const totalBatches = blocksByFrameBatch.length;
  if (totalBatches === 0) {
    return { batches: [], charsRemoved: 0, blocksRemoved: 0, furnitureLineCount: 0 };
  }

  // Presence per batch, not occurrence count within a batch.
  const batchPresenceCount = new Map<string, number>();
  for (const batch of blocksByFrameBatch) {
    const seenThisBatch = new Set<string>();
    for (const block of batch) {
      const norm = normalizedTextOf(block);
      if (!norm || seenThisBatch.has(norm)) continue;
      seenThisBatch.add(norm);
      batchPresenceCount.set(norm, (batchPresenceCount.get(norm) ?? 0) + 1);
    }
  }

  const furnitureLines = new Set<string>();
  for (const [norm, count] of batchPresenceCount) {
    if (count / totalBatches > FURNITURE_FREQUENCY_THRESHOLD) furnitureLines.add(norm);
  }

  let charsRemoved = 0;
  let blocksRemoved = 0;
  const batches = blocksByFrameBatch.map((batch) =>
    batch.filter((block) => {
      const norm = normalizedTextOf(block);
      if (norm && furnitureLines.has(norm)) {
        charsRemoved += block.text.length;
        blocksRemoved += 1;
        return false;
      }
      return true;
    })
  );

  return { batches, charsRemoved, blocksRemoved, furnitureLineCount: furnitureLines.size };
}

// ---------------------------------------------------------------------------
// appendBatchBlocks - AM-H: a SEAM OVERLAP-JOIN, never a global set.
//
// REJECTED, and this is the trap: a global Set<normalizedText> of everything
// seen across the whole run. It is the obvious implementation, and it is
// wrong - a module legitimately repeats short lines ("Learning objective",
// "Read the following", "Due Sunday", a repeated table value), and a global
// set silently deletes the second and third REAL occurrences with no record,
// surfacing only as a deck missing a section. Nothing in this file keeps a
// set of everything seen; the join below only ever compares the SEAM between
// two adjacent batches.
//
// Two stages, run in order:
//  1. Suffix/prefix join: try the largest k (up to OVERLAP_WINDOW) such that
//     the last k blocks of `accumulated` match the first k blocks of
//     `incoming` - both normalized TEXT equal AND `heading` field equal per
//     pair (a real repeat of the same line under a DIFFERENT heading is a
//     genuine second occurrence, not a scroll-duplicate, and must not be
//     eaten by a same-text match alone) - and drop that many blocks off the
//     front of `incoming` before appending. LARGEST match wins deliberately -
//     a smaller match would leave duplicated text sitting behind it
//     unremoved.
//  2. A SEAM-ONLY near-duplicate merge: after the join above, compare the
//     new seam - the last surviving block of `accumulated` against the first
//     surviving block of `incoming` - and if one normalized text is a prefix
//     of the other AND both carry the SAME `heading`, keep the LONGER
//     reading as one block. This is the "paragraph read half in one batch
//     and fully in the next" case, using the same longer-text-wins rule
//     mergeCapturedPosts already applies (discussion-capture.ts). One
//     comparison, no window - deliberately narrower than stage 1, so it can
//     only ever collide with a real repeat that happens to land EXACTLY on a
//     batch seam, not with every occurrence anywhere in the document (the
//     global-set trap above).
//
// The `heading` equality requirement in BOTH stages is what satisfies DE13's
// segment-boundary rule here: two blocks under different headings are never
// treated as the same content regardless of how similar their text is, and
// two different headings ("Week 4: ..." vs "Week 5: ...") are compared for
// EQUALITY only, never a prefix/similarity check - one being a normalized
// prefix of the other is exactly the DE13 danger case, and this design never
// runs a prefix test on the heading itself, only on body text once the
// headings already match exactly.
// ---------------------------------------------------------------------------

function blocksMatchForJoin(a: ExtractedBlock, b: ExtractedBlock): boolean {
  const at = normalizedTextOf(a);
  const bt = normalizedTextOf(b);
  if (!at || at !== bt) return false;
  return normalizeForMatch(a.heading) === normalizeForMatch(b.heading);
}

function suffixPrefixJoin(accumulated: ReadonlyArray<ExtractedBlock>, incoming: ReadonlyArray<ExtractedBlock>): ExtractedBlock[] {
  const maxK = Math.min(OVERLAP_WINDOW, accumulated.length, incoming.length);
  for (let k = maxK; k >= 1; k--) {
    let matches = true;
    for (let i = 0; i < k; i++) {
      if (!blocksMatchForJoin(accumulated[accumulated.length - k + i], incoming[i])) {
        matches = false;
        break;
      }
    }
    if (matches) {
      return [...accumulated, ...incoming.slice(k)];
    }
  }
  return [...accumulated, ...incoming];
}

export function appendBatchBlocks(
  accumulated: ReadonlyArray<ExtractedBlock>,
  incoming: ReadonlyArray<ExtractedBlock>,
  batchIndex: number
): ExtractedBlock[] {
  // First batch (or either side empty): nothing to join against yet.
  if (batchIndex <= 0 || accumulated.length === 0 || incoming.length === 0) {
    return [...accumulated, ...incoming];
  }

  const joined = suffixPrefixJoin(accumulated, incoming);
  const boundaryIndex = accumulated.length;
  if (boundaryIndex <= 0 || boundaryIndex >= joined.length) return joined;

  const left = joined[boundaryIndex - 1];
  const right = joined[boundaryIndex];

  // Segment boundary: different headings never merge, regardless of text.
  if (normalizeForMatch(left.heading) !== normalizeForMatch(right.heading)) return joined;

  const nLeft = normalizedTextOf(left);
  const nRight = normalizedTextOf(right);
  if (!nLeft || !nRight) return joined;
  if (nLeft !== nRight && !nRight.startsWith(nLeft) && !nLeft.startsWith(nRight)) return joined;

  const keep = right.text.length >= left.text.length ? right : left;
  return [...joined.slice(0, boundaryIndex - 1), keep, ...joined.slice(boundaryIndex + 1)];
}

// ---------------------------------------------------------------------------
// renderMaterialsText - block-kind-driven Markdown-ish rendering.
//
// "## " for a heading-field transition, "- " for objectives/list items,
// fenced code, "| " for table rows, plain otherwise; parts joined with
// "\n\n", EXCEPT consecutive list-like blocks under the same heading, which
// join with a single "\n" so a list spanning more than one block still reads
// as one list rather than as several separated paragraphs. Illegible blocks
// are dropped and COUNTED, never rendered - a block whose text is "the
// paragraph below is too blurred to read" must never become a bullet in the
// materials handed to the deck generator.
//
// The extraction prompt's own output contract joins multiple list items or
// multiple table rows into ONE block's `text` with "\n" between them - a
// "list"/"table"-kind ExtractedBlock is not guaranteed to be a single line -
// so each block's text is itself split on "\n" to find the individual items
// or rows that need their own prefix.
// ---------------------------------------------------------------------------

export interface RenderMaterialsResult {
  text: string;
  /** Blocks dropped because `illegible` was true - counted, never rendered. */
  illegibleDropped: number;
}

function renderBlockBody(block: ExtractedBlock): string {
  if (isListLikeKind(block.kind)) {
    return block.text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => `- ${line}`)
      .join("\n");
  }
  if (isTableKind(block.kind)) {
    return block.text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => `| ${line}`)
      .join("\n");
  }
  if (isCodeKind(block.kind)) {
    return "```\n" + block.text + "\n```";
  }
  // "prose", "caption", "activity", and anything unrecognized: plain.
  return block.text;
}

export function renderMaterialsText(blocks: ReadonlyArray<ExtractedBlock>): RenderMaterialsResult {
  const kept = blocks.filter((b) => !b.illegible);
  const illegibleDropped = blocks.length - kept.length;

  const parts: string[] = [];
  let previousHeading: string | null = null;
  let previousWasList = false;

  for (const block of kept) {
    const heading = block.heading.trim();
    if (heading && heading !== previousHeading) {
      parts.push(`## ${heading}`);
      previousHeading = heading;
      previousWasList = false;
    }

    const isList = isListLikeKind(block.kind);
    const body = renderBlockBody(block);

    if (isList && previousWasList && parts.length > 0) {
      parts[parts.length - 1] = `${parts[parts.length - 1]}\n${body}`;
    } else {
      parts.push(body);
    }
    previousWasList = isList;
  }

  return { text: parts.join("\n\n"), illegibleDropped };
}

// ---------------------------------------------------------------------------
// capMaterialsText - DE16: NEVER tail-truncate.
//
// `gatherSelectionMaterials` uses `joined.slice(0, MATERIALS_CAP)` - head-keep,
// tail-drop - which for a walkthrough means silently discarding the END of
// the module: verbatim the complaint AC9 exists to answer. Drop in this
// order instead, each stage's count reported separately so the run log can
// show exactly what left and why:
//   (by the time this function runs, stages "repeated chrome" and "exact/
//   near-duplicate blocks" have already happened losslessly, upstream, via
//   suppressPageFurniture and appendBatchBlocks - both counted on their own)
//   3. non-content control text (a small, conservative denylist of standalone
//      navigation/boilerplate lines - "next", "skip to main content", and
//      similar - that slipped past the 60% chrome threshold because they do
//      not appear in enough batches to qualify as furniture there);
//   4. only then proportional downsampling across the whole run: split the
//      text into heading-anchored segments (this function's own rendering
//      contract with renderMaterialsText - a segment starts at each "## "
//      line and runs to the next one) and keep the first N characters of
//      EVERY segment, with N scaled to fit the remaining budget - so every
//      part of the module survives at reduced depth and no part vanishes,
//      down to a MIN_SEGMENT_CHARS floor.
// Appends one explicit line naming what was cut when anything was.
// ---------------------------------------------------------------------------

export interface CapMaterialsResult {
  text: string;
  controlTextCharsRemoved: number;
  downsampledCharsRemoved: number;
  cut: boolean;
}

const CONTROL_TEXT_LINES = new Set([
  "next",
  "previous",
  "back to top",
  "skip to main content",
  "skip to content",
  "table of contents",
  "print this page",
  "share this page",
]);

function splitIntoHeadingAnchoredSegments(text: string): string[] {
  const lines = text.split("\n");
  const segments: string[] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (line.startsWith("## ") && current.length > 0) {
      segments.push(current.join("\n"));
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) segments.push(current.join("\n"));
  return segments;
}

export function capMaterialsText(text: string, cap: number = DECK_MATERIALS_CAP): CapMaterialsResult {
  if (text.length <= cap) {
    return { text, controlTextCharsRemoved: 0, downsampledCharsRemoved: 0, cut: false };
  }

  // Stage 3: strip conservative non-content control lines.
  let controlTextCharsRemoved = 0;
  const filteredLines = text.split("\n").filter((line) => {
    const norm = normalizeForMatch(line);
    if (norm && CONTROL_TEXT_LINES.has(norm)) {
      controlTextCharsRemoved += line.length + 1; // +1 for the joining newline
      return false;
    }
    return true;
  });
  const afterControlStrip = filteredLines.join("\n");

  if (afterControlStrip.length <= cap) {
    return { text: afterControlStrip, controlTextCharsRemoved, downsampledCharsRemoved: 0, cut: controlTextCharsRemoved > 0 };
  }

  // Stage 4: proportional downsampling across heading-anchored segments.
  const notice = "\n\n[materials capped: content trimmed proportionally across the module]";
  const budget = Math.max(0, cap - notice.length);
  const segments = splitIntoHeadingAnchoredSegments(afterControlStrip);
  const totalLen = segments.reduce((sum, seg) => sum + seg.length, 0);

  let downsampledCharsRemoved = 0;
  const keptSegments = segments.map((seg) => {
    const share = totalLen > 0 ? seg.length / totalLen : 0;
    const targetLen = Math.max(MIN_SEGMENT_CHARS, Math.floor(budget * share));
    if (seg.length <= targetLen) return seg;
    downsampledCharsRemoved += seg.length - targetLen;
    return seg.slice(0, targetLen);
  });

  const result = `${keptSegments.join("\n\n")}${notice}`;
  return { text: result, controlTextCharsRemoved, downsampledCharsRemoved, cut: true };
}
