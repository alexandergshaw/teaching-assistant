import type { CourseKind } from "@/lib/course-kind";

// Closed graphic vocabulary for this app's generated decks - both course
// kinds (CourseKind: "applied" and "coding").
//
// An applied deck's Artifact slide shows the REAL document or output a
// practitioner produces - a register, a charter, a matrix, a worked
// calculation. A coding deck's own structural slides (its Agenda, each
// concept's introduction, its Terminology recap) have the same underlying
// need: OOP, in particular, is a subject ABOUT structure and relationships
// (a class hierarchy, a comparison between two related constructs, a
// term/definition glossary) that prose bullets are exactly the wrong shape
// for. pptxgenjs draws these as real PowerPoint shapes/tables (never an
// image), so the deck stays editable in PowerPoint and prints cleanly.
//
// Deliberately three kinds and NO chart/plot kind:
// - matrix2x2: two axis labels plus four quadrants (power/interest grids,
//   risk matrices, priority grids). APPLIED-ONLY: no coding slide asks for
//   it (see CODING_GRAPHIC_REQUIRED_PREFIXES below) - a 2x2 tradeoff grid
//   has a natural home in an applied Judgment Call, but no coding structural
//   slide poses a two-axis tradeoff the same way, so it stays out of the
//   coding vocabulary rather than being reused for a shape it doesn't fit.
// - process: an ordered list of steps (lifecycles, workflows, approval
//   chains, an algorithm's stages, a request/data lifecycle).
// - table: headers plus rows (a register, a charter's fields, a comparison,
//   a worked calculation, a term/definition glossary, a class/relationship
//   comparison).
// A bar/line/pie chart would need the model to invent numbers - a category
// axis, a value axis, data points - and the no-fabrication rules that govern
// the rest of the deck contract (src/lib/slide-prompt.ts) exist specifically
// to stop the model from making up figures. A table, a matrix, or a process
// box can only ever restate content the slide's own bullets already ground;
// a chart cannot make that promise, so it isn't offered as an option. This
// reasoning is why a coding deck reuses "process" and "table" rather than
// gaining a fourth, coding-specific kind: both already existing shapes can
// be filled entirely from content the slide's own bullets already ground (a
// concept's own steps, a term's own definition), so extending the closed
// vocabulary by REUSE costs nothing new to the no-fabrication guarantee,
// while a new kind would cost a coercion path, a layout path, and a
// pptxgenjs rendering path for no reasoning benefit over what already exists.
//
// Pure module: no I/O, no pptxgenjs import, no Date/Math.random/crypto. Both
// the coercion (coerceSlideGraphic) and the pptx layout arithmetic below are
// unit-tested directly here; the pptxgenjs rendering itself lives in
// src/lib/pptx.ts, which imports the pure helpers from this file.

export interface MatrixQuadrant {
  label: string;
  items: string[];
}

export interface Matrix2x2Graphic {
  kind: "matrix2x2";
  xAxisLabel: string;
  yAxisLabel: string;
  quadrants: {
    topLeft: MatrixQuadrant;
    topRight: MatrixQuadrant;
    bottomLeft: MatrixQuadrant;
    bottomRight: MatrixQuadrant;
  };
}

export interface ProcessStep {
  label: string;
  caption?: string;
}

export interface ProcessGraphic {
  kind: "process";
  steps: ProcessStep[];
}

export interface TableGraphic {
  kind: "table";
  headers: string[];
  rows: string[][];
}

export type SlideGraphic = Matrix2x2Graphic | ProcessGraphic | TableGraphic;

// ── Hard caps: keep the layout from ever overflowing a slide ───────────────

export const MATRIX_MAX_ITEMS_PER_QUADRANT = 4;
export const PROCESS_MIN_STEPS = 3;
export const PROCESS_MAX_STEPS = 6;
export const TABLE_MAX_COLUMNS = 5;
export const TABLE_MAX_ROWS = 6;

// ── Coercion ─────────────────────────────────────────────────────────────
// Follows the defensive-coercion style of src/lib/artifact-templates/types.ts:
// never throws, every unknown/missing/malformed field is dropped rather than
// propagated, and a graphic that can't be made whole degrades to undefined
// (no graphic on the slide) rather than a half-rendered one.

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function trimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function trimmedList(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const text = trimmed(item);
    if (text) out.push(text);
    if (out.length >= max) break;
  }
  return out;
}

function coerceQuadrant(raw: unknown): MatrixQuadrant | undefined {
  const obj = asRecord(raw);
  if (!obj) return undefined;
  const label = trimmed(obj.label);
  if (!label) return undefined;
  return { label, items: trimmedList(obj.items, MATRIX_MAX_ITEMS_PER_QUADRANT) };
}

function coerceMatrix2x2(obj: Record<string, unknown>): Matrix2x2Graphic | undefined {
  const xAxisLabel = trimmed(obj.xAxisLabel);
  const yAxisLabel = trimmed(obj.yAxisLabel);
  if (!xAxisLabel || !yAxisLabel) return undefined;

  const quadrantsRaw = asRecord(obj.quadrants);
  if (!quadrantsRaw) return undefined;

  const topLeft = coerceQuadrant(quadrantsRaw.topLeft);
  const topRight = coerceQuadrant(quadrantsRaw.topRight);
  const bottomLeft = coerceQuadrant(quadrantsRaw.bottomLeft);
  const bottomRight = coerceQuadrant(quadrantsRaw.bottomRight);
  // A matrix with a missing quadrant renders as a broken grid - so any one
  // missing/malformed quadrant invalidates the whole graphic rather than
  // shipping three quadrants and a hole.
  if (!topLeft || !topRight || !bottomLeft || !bottomRight) return undefined;

  return {
    kind: "matrix2x2",
    xAxisLabel,
    yAxisLabel,
    quadrants: { topLeft, topRight, bottomLeft, bottomRight },
  };
}

function coerceProcessStep(raw: unknown): ProcessStep | undefined {
  const obj = asRecord(raw);
  if (!obj) return undefined;
  const label = trimmed(obj.label);
  if (!label) return undefined;
  const caption = trimmed(obj.caption);
  return caption ? { label, caption } : { label };
}

function coerceProcess(obj: Record<string, unknown>): ProcessGraphic | undefined {
  if (!Array.isArray(obj.steps)) return undefined;
  const steps: ProcessStep[] = [];
  for (const raw of obj.steps) {
    if (steps.length >= PROCESS_MAX_STEPS) break;
    const step = coerceProcessStep(raw);
    if (step) steps.push(step);
  }
  // Fewer than 3 real steps isn't a process, it's a couple of bullets - not
  // worth the graphic's screen real estate over plain prose.
  return steps.length >= PROCESS_MIN_STEPS ? { kind: "process", steps } : undefined;
}

// A blank header cell drops that entire column - both the header and the
// same-index cell in every row - rather than rendering an unlabeled column;
// an unlabeled column is exactly as broken as a missing one. Rows shorter
// than the surviving header count are padded with "" at the missing indices
// (via the map below); rows are never rendered ragged.
function coerceTable(obj: Record<string, unknown>): TableGraphic | undefined {
  if (!Array.isArray(obj.headers) || !Array.isArray(obj.rows)) return undefined;

  const keptColumns: number[] = [];
  const headers: string[] = [];
  for (let i = 0; i < obj.headers.length && headers.length < TABLE_MAX_COLUMNS; i++) {
    const text = trimmed(obj.headers[i]);
    if (text) {
      keptColumns.push(i);
      headers.push(text);
    }
  }
  if (headers.length === 0) return undefined;

  const rows: string[][] = [];
  for (const rawRow of obj.rows) {
    if (rows.length >= TABLE_MAX_ROWS) break;
    if (!Array.isArray(rawRow)) continue;
    rows.push(keptColumns.map((col) => trimmed(rawRow[col])));
  }
  if (rows.length === 0) return undefined;

  return { kind: "table", headers, rows };
}

/**
 * Coerce an unknown value (typically parsed straight from the model's JSON)
 * into a SlideGraphic, or undefined when it is missing, malformed, or names a
 * kind this app doesn't support. Never throws - a broken graphic degrades to
 * no graphic at all rather than a half-rendered slide.
 */
export function coerceSlideGraphic(raw: unknown): SlideGraphic | undefined {
  const obj = asRecord(raw);
  if (!obj) return undefined;
  switch (obj.kind) {
    case "matrix2x2":
      return coerceMatrix2x2(obj);
    case "process":
      return coerceProcess(obj);
    case "table":
      return coerceTable(obj);
    default:
      return undefined;
  }
}

// ── Data-layer graphics guard (P3-AC1, extended to coding decks) ────────
// Mirrors enforceNoCodeForApplied's role for code (src/lib/slide-prompt.ts):
// the applied contract SAYING every Artifact/Judgment Call/Agenda slide
// must carry a graphic is not enough on its own - a real generated course
// (MGT 422, 16 weeks) shipped 38/80 Artifact slides with no graphic despite
// the prompt saying EVERY one must, and 0/80 Judgment Call slides carried
// one at all.
//
// The SAME lesson turned out to apply to coding decks, just one step
// earlier: enforceGraphicsForApplied used to be a hard no-op for
// `kind !== "applied"` (see this file's git history), on the theory that
// "graphics are an applied-only concept". A real generated 50-slide coding
// deck (INFO 1020, "Object-Oriented Programming" - a subject that is
// LITERALLY about structure and relationships) proved that theory wrong: it
// shipped with zero graphics of any kind anywhere in the file - no
// <p:graphicFrame>, no <a:tbl>, no <p:pic> - because the vocabulary
// (matrix2x2/process/table) was gated to `kind === "applied"` at this exact
// choke point, so a coding deck could never carry one no matter what the
// prompt asked for. The fix below is the same shape as the applied guard
// above it: name required slides by title (or, for the one coding slide
// with no fixed title prefix, by position), find the gaps, let
// fillMissingGraphics repair them, then recheck.
//
// This function does not invent or repair a graphic itself - that is
// fillMissingGraphics (src/app/actions/slide-graphics-repair.ts), kept out
// of this file because it makes an LLM call and this module must stay pure
// (no I/O, no fetch, no Date, no Math.random). It only NAMES the gap so a
// caller can decide what to do about it - detect, repair, then detect again
// to see what survived the repair.

/** Slide titles that MUST carry a graphic in an APPLIED deck. Exported so
 * the deck-level .pptx audit (src/lib/pptx-graphics-audit.ts, AC4) can
 * classify a finished file's slides against the SAME vocabulary this
 * in-memory guard uses for applied, rather than restating the three
 * prefixes a second place they could drift apart.
 *
 * Deliberately NOT shared with the coding requirement below (see
 * CODING_GRAPHIC_REQUIRED_PREFIXES) even though "Agenda:" and "Terminology:"
 * are titles BOTH course kinds can produce: "Terminology:" is a closing
 * section in BOTH contracts (APPLIED_STRUCTURE_REQUIREMENTS's own closing
 * section C, and SLIDE_STRUCTURE_REQUIREMENTS's, src/lib/slide-prompt.ts),
 * but only the CODING contract requires a graphic on it - applied's
 * Terminology slide stays optional. Folding "Terminology:" into this shared,
 * kind-agnostic array would make the .pptx audit (which reads this array
 * with no notion of course kind at all) start misreporting an applied
 * deck's Terminology slide as a defect it was never meant to be. */
export const GRAPHIC_REQUIRED_PREFIXES = ["Artifact:", "Judgment Call:", "Agenda:"];

/**
 * Slide title prefixes that MUST carry a graphic in a CODING deck - the
 * coding mirror of GRAPHIC_REQUIRED_PREFIXES above, kept as a SEPARATE
 * array (rather than merged into it) for the reason given on that
 * constant's own comment.
 *   - "Agenda:" - mirrors applied's own mandatory Agenda graphic exactly
 *     (see AGENDA SLIDE, src/lib/slide-prompt.ts): a "process" graphic
 *     mapping the lecture's concepts as steps at 3-6 concepts, a "table"
 *     otherwise. Guarantees at least one real visual in every coding deck,
 *     same as applied.
 *   - "Terminology:" - a term/definition list is, structurally, a
 *     two-column table before any graphic is even added: every bullet on
 *     this slide already reads "term: precise definition" (see the
 *     TERMINOLOGY closing section, slide-prompt.ts). Restating it as a
 *     "table" graphic (headers "Term"/"Definition") needs the model to
 *     invent nothing new - the exact no-fabrication bar this file's header
 *     comment sets for every graphic kind.
 * The third coding-only requirement - each concept's own introduction
 * slide, immediately after its "Section <n>:" divider - has NO fixed title
 * prefix to match on: its title is the concept's own claim (e.g.
 * "Inheritance lets a child class reuse a parent's behavior" - see
 * ASSERTION TITLES, slide-prompt.ts), not a fixed label, so it cannot live
 * in a prefix array. It is detected POSITIONALLY instead, by
 * isCodingConceptIntroSlide below - still enforced by the same function,
 * just not the same detection mechanism.
 */
export const CODING_GRAPHIC_REQUIRED_PREFIXES = ["Agenda:", "Terminology:"];

/** Matches a coding deck's "Section <n>: <concept>" divider title (SECTION
 * DIVIDERS, slide-prompt.ts) - the one fixed, reliable anchor that always
 * immediately precedes each concept's own introduction slide, per that same
 * rule ("including the very first concept"). */
const CODING_SECTION_DIVIDER_TITLE = /^Section \d+:/;

export interface SlideGraphicGap {
  /** The slide's position in the deck (0-based, matches the slides array). */
  index: number;
  title: string;
}

/**
 * The minimal shape enforceGraphicsForApplied needs from a slide. A generic
 * constraint rather than importing SlideData from src/app/actions-types.ts:
 * that file itself imports SlideGraphic FROM this module, so importing
 * SlideData back here would create a circular module dependency between the
 * two. Every real caller passes SlideData[], which already satisfies this
 * shape structurally.
 *
 * `code` is optional so every existing caller/test fixture (most of which
 * never had a reason to carry it) keeps compiling unchanged - it exists so
 * isCodingConceptIntroSlide below can rule out a code-bearing slide even if
 * one lands directly after a "Section <n>:" divider, which should never
 * happen per the coding contract's own SECTION DIVIDERS rule but is
 * defended against here rather than assumed away (see that function's own
 * comment).
 */
export interface GraphicGapSlide {
  title: string;
  graphic?: SlideGraphic;
  code?: string;
}

/**
 * True for a coding deck's per-concept introduction slide: the slide
 * immediately after a "Section <n>:" divider, and the only slide in that
 * concept's cycle with no code and no fixed title prefix of its own (CODING
 * CONCEPTS, slide-prompt.ts: the cycle is concept-intro -> Example ->
 * Walkthrough -> Practice -> Answer). The other four are ineligible for a
 * graphic anyway - buildSlidesPptx (src/lib/pptx.ts) only renders a slide's
 * "graphic" when it has no "code", since the code panel already occupies
 * that space - so requiring one on the concept-intro slide is the ONE place
 * in that cycle a required graphic can actually render.
 *
 * The `!slide.code` guard defends against a malformed deck where the model
 * skipped the concept-intro slide and an Example slide landed directly
 * after the Section divider instead: without it, that Example slide would
 * be wrongly flagged as missing a graphic, and any repair would render
 * invisibly (pptx.ts ignores "graphic" whenever "code" is present) - a
 * wasted repair call reporting success for a fix nobody will ever see.
 *
 * Positional rather than prefix-based because this slide's title is the
 * concept's own claim, not a fixed label - see CODING_GRAPHIC_REQUIRED_
 * PREFIXES's own comment above for why that rules out a prefix match here.
 */
function isCodingConceptIntroSlide<T extends GraphicGapSlide>(slides: T[], index: number): boolean {
  const slide = slides[index];
  if (slide.code) return false;
  const previous = slides[index - 1];
  return previous !== undefined && CODING_SECTION_DIVIDER_TITLE.test(previous.title);
}

/**
 * Find every slide that was REQUIRED to carry a graphic but has none.
 *
 * For an APPLIED deck: any slide whose title starts with "Artifact:",
 * "Judgment Call:", or "Agenda:" (GRAPHIC_REQUIRED_PREFIXES - see AGENDA
 * SLIDE / SLIDE GRAPHICS in src/lib/slide-prompt.ts).
 *
 * For a CODING deck: any slide whose title starts with "Agenda:" or
 * "Terminology:" (CODING_GRAPHIC_REQUIRED_PREFIXES above), OR is that
 * concept's own introduction slide (isCodingConceptIntroSlide above) - see
 * this section's header comment for why this used to be a hard no-op for
 * coding and no longer is.
 *
 * Never mutates or drops a slide - `slides` comes back exactly as it went
 * in, generic over the caller's own slide type so a caller keeps whatever
 * richer type it started with (SlideData, or the minimal test fixture
 * shape).
 *
 * Despite the "ForApplied" name, this function is no longer applied-only -
 * see this section's header comment for why. The name survives unchanged
 * (rather than being renamed to something kind-neutral) because every real
 * caller (src/app/actions/course-planning-grounding.ts, src/lib/workflows/
 * registry-helpers.ts, and their own test files) sits OUTSIDE this fix's
 * file allowlist - a rename would require editing every one of those call
 * sites too, which risks colliding with concurrent work on the very same
 * files. That stays a follow-up, not a blocker: every real caller already
 * passes `kind` straight through with no branching of its own, so the new
 * per-kind behavior below takes effect at every call site with no caller
 * edit required.
 *
 * Called TWICE in the real pipeline: once to find gaps before the repair
 * pass (fillMissingGraphics), and again afterward to see what survived it -
 * this function has no memory of its own, so recomputing is exactly as
 * correct as tracking state across the two calls would be.
 */
export function enforceGraphicsForApplied<T extends GraphicGapSlide>(
  slides: T[],
  kind: CourseKind
): { slides: T[]; missing: SlideGraphicGap[] } {
  const requiredPrefixes = kind === "applied" ? GRAPHIC_REQUIRED_PREFIXES : CODING_GRAPHIC_REQUIRED_PREFIXES;

  const missing: SlideGraphicGap[] = [];
  slides.forEach((slide, index) => {
    const requiresGraphic =
      requiredPrefixes.some((prefix) => slide.title.startsWith(prefix)) ||
      (kind === "coding" && isCodingConceptIntroSlide(slides, index));
    if (requiresGraphic && !slide.graphic) {
      missing.push({ index, title: slide.title });
    }
  });

  return { slides, missing };
}

// ── Pure layout arithmetic ──────────────────────────────────────────────
// Kept separate from the pptxgenjs rendering (src/lib/pptx.ts) so the
// arithmetic is unit-testable without pptxgenjs or a browser.

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Split a slide's content region into a short bullets band above and a
 * graphic band below, separated by `gap` inches. A slide carrying a graphic
 * keeps its bullets to 2 (see APPLIED_STRUCTURE_REQUIREMENTS in
 * src/lib/slide-prompt.ts), so the top band only needs enough height for two
 * short lines - the rest goes to the graphic.
 */
export function graphicSlideLayout(
  content: Rect,
  bulletsHeight: number,
  gap = 0.15
): { bulletsArea: Rect; graphicArea: Rect } {
  const graphicY = content.y + bulletsHeight + gap;
  return {
    bulletsArea: { x: content.x, y: content.y, w: content.w, h: bulletsHeight },
    graphicArea: {
      x: content.x,
      y: graphicY,
      w: content.w,
      h: Math.max(0, content.h - bulletsHeight - gap),
    },
  };
}

/**
 * The four quadrant rectangles for a matrix2x2 graphic, tiling `area` into a
 * 2x2 grid with a `gap`-inch gutter between quadrants.
 */
export function matrix2x2QuadrantRects(
  area: Rect,
  gap = 0.08
): { topLeft: Rect; topRight: Rect; bottomLeft: Rect; bottomRight: Rect } {
  const halfW = Math.max(0, (area.w - gap) / 2);
  const halfH = Math.max(0, (area.h - gap) / 2);
  return {
    topLeft: { x: area.x, y: area.y, w: halfW, h: halfH },
    topRight: { x: area.x + halfW + gap, y: area.y, w: halfW, h: halfH },
    bottomLeft: { x: area.x, y: area.y + halfH + gap, w: halfW, h: halfH },
    bottomRight: { x: area.x + halfW + gap, y: area.y + halfH + gap, w: halfW, h: halfH },
  };
}

/**
 * `count` equal-width step boxes laid out left-to-right across `area`,
 * separated by `gap` inches. Returns [] for count <= 0.
 */
export function processStepRects(area: Rect, count: number, gap = 0.15): Rect[] {
  if (count <= 0) return [];
  const stepW = Math.max(0, (area.w - gap * (count - 1)) / count);
  return Array.from({ length: count }, (_, i) => ({
    x: area.x + i * (stepW + gap),
    y: area.y,
    w: stepW,
    h: area.h,
  }));
}
