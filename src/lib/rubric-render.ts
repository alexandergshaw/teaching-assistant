// Renders a rubric OBJECT (a cartridge export's CartridgeRubric, or a live
// Canvas rubric loaded via getRubricAction's camelCase RubricDetail) into the
// plain rubric TEXT the grading pipeline already parses back with
// extractRubricCriteria (src/lib/grade/rubric.ts:10-29). This module exists
// so a rubric picked from an export or a live rubric list can be handed to
// gradeRepoAction exactly like a hand-typed rubric - see
// docs/repo-grades-rubric-picker-acceptance-criteria.md items 8, 48, 59-61,
// 68-69.
//
// EXTRACTION HISTORY (AC item 59): this was `cartridgeRubricToText`, a
// module-private, untested function in
// src/app/components/github-grading/useLmsAssignmentPull.ts. It already
// worked for CartridgeRubric and, per the architect/reuse passes (AC items
// 48, 60), is structurally close enough to RubricDetail
// (src/app/actions/canvas-files-bulk.ts:275's return type,
// src/lib/canvas-modules/types.ts:230) to serve both without a second
// renderer. Moved here, exported, and widened rather than duplicated.
//
// WHY NOT formatRubric (src/lib/canvas/metadata.ts:52): it reads Canvas's
// RAW snake_case field names (e.g. `long_description`) and cannot be
// imported client-side at all - it reaches canvas-core, which reads Canvas
// API tokens from process.env (AC item 67). RubricDetail is camelCase
// (`longDescription`). Forcing RubricDetail through formatRubric would
// COMPILE and RUN (structurally assignable) while silently dropping every
// long description - the single most dangerous trap the reuse survey found.
// This module is deliberately the only renderer the `live` and `export`
// sources use; `formatRubric` stays confined to the `assignment` source,
// server-side, where it already runs inside fetchCanvasMetaAction.
//
// WHY NOT serializeRubric (src/lib/submission-archive-sniff.ts:40) or the
// inline renderer at src/app/components/courses/useCourseImportActions.ts:
// 494-502 (AC item 61): serializeRubric indents every criterion line (two
// leading spaces are baked into its per-criterion output), and
// extractRubricCriteria treats ANY indented line as a rating/subcategory
// line and skips it (rubric.ts:14) - so serializeRubric's output round-trips
// to ZERO criteria. The useCourseImportActions.ts renderer emits
// `(${points})` with no unit suffix; extractRubricCriteria only assigns
// non-null points when the captured unit starts with "p" (rubric.ts:24-26),
// so every criterion it produces parses back with `points: null` and never
// pins the grading scale. Both are confirmed traps, not merely unused code -
// see this module's test file for the canary that proves the first one.
//
// PURITY: no I/O, no clock, no randomness, and no import of anything
// server-only. In particular this module must NEVER import
// src/lib/canvas/metadata.ts (reaches canvas-core, which reads Canvas
// tokens from env - see above) or src/lib/grade/rubric.ts (pulls in the LLM
// call chain via prompts.ts's sibling exports). The one cross-module import
// below, `normalizeAreaName` from src/lib/grade/prompts.ts, is safe: that
// file imports only a type from ./types (verified by reading it) and is
// itself a pure string function.

import { normalizeAreaName } from "@/lib/grade/prompts";

/**
 * The subset of a rubric rating this module needs to render one line. Kept
 * structural (not imported from cartridge-import-shared.ts or
 * canvas-modules/types.ts) for the same reason
 * repoGradesAssignmentSources.ts:21-35 declares its own input subsets: this
 * module must accept BOTH CartridgeRubricRating (description, points) and
 * RubricDetail's rating shape (description, points, plus an optional
 * longDescription this module does not use) without importing either
 * concrete type, so it stays decoupled from both type chains and trivial to
 * unit test with plain object literals.
 */
export interface RenderableRubricRating {
  readonly description: string;
  readonly points: number;
}

/**
 * The subset of a rubric criterion this module needs. Structurally
 * compatible with both:
 * - CartridgeRubricCriterion (src/lib/cartridge-import-shared.ts:96-101):
 *   `longDescription: string | null` (a cartridge criterion always carries
 *   the field, sometimes as null).
 * - RubricDetail's criterion shape (src/app/actions/canvas-files-bulk.ts:275,
 *   src/lib/canvas-modules/types.ts:230-239): `longDescription?: string`
 *   (the field may be absent entirely).
 * `string | null | undefined` below accepts both without widening either
 * concrete type or importing it.
 */
export interface RenderableRubricCriterion {
  readonly description: string;
  readonly points: number;
  readonly longDescription?: string | null;
  readonly ratings: readonly RenderableRubricRating[];
}

/** The subset of a rubric this module needs: just its criteria list. Titles
 * are not part of the rendered text (extractRubricCriteria has no concept of
 * a rubric title, only criterion lines), so this module never reads one. */
export interface RenderableRubric {
  readonly criteria: readonly RenderableRubricCriterion[];
}

/**
 * Renders a picked rubric (export or live) into the exact line grammar
 * extractRubricCriteria (src/lib/grade/rubric.ts:10-29) parses:
 *
 *   Name (N pts): description
 *     rating text (M pts)
 *
 * Three grammar rules this function must honor, each because getting it
 * wrong makes extractRubricCriteria silently produce the wrong thing rather
 * than fail loudly:
 *
 * 1. A criterion line must start at column 0 - any leading whitespace makes
 *    the parser treat it as a rating/subcategory line and skip it
 *    (rubric.ts:14). Rating lines below a criterion ARE indented two spaces
 *    on purpose (for a human reading the textarea) - the parser already
 *    skips every indented line unconditionally, so indentation only affects
 *    display, never parsing.
 * 2. The unit must be "pts" (or another word starting with "p"), never a
 *    bare number and never "%" - only a "p"-prefixed unit yields non-null
 *    `points` (rubric.ts:24-26), and only non-null points make
 *    buildSystemPrompt pin the grading scale (src/lib/grade/prompts.ts:
 *    36-42). A bare "(5)" or "(5%)" parses back with `points: null`, which
 *    is exactly the useCourseImportActions.ts trap documented above.
 * 3. Duplicate criterion names must be resolved HERE, not left for the
 *    parser to drop invisibly. extractRubricCriteria silently discards a
 *    second criterion whose normalized name repeats an earlier one
 *    (rubric.ts:22) - so if this function emitted both, the rendered text
 *    would show two criteria while grading only ever saw one, with no
 *    signal anywhere that the second was thrown away. This function applies
 *    the IDENTICAL normalization (`normalizeAreaName`, the same function
 *    rubric.ts itself uses) and drops a repeat before rendering it, so what
 *    is on screen already matches what a round-trip through
 *    extractRubricCriteria would keep.
 *
 * Pure: never mutates `rubric` or anything inside it; the same input always
 * produces the same string.
 */
export function renderPickedRubricText(rubric: RenderableRubric): string {
  const lines: string[] = [];
  const seenNames = new Set<string>();
  for (const criterion of rubric.criteria) {
    const key = normalizeAreaName(criterion.description);
    // A blank or already-seen name would round-trip to zero (or a
    // different) criterion anyway (rubric.ts:20-22) - skip rendering it so
    // the textarea never shows a line that grading will not actually use.
    if (!key || seenNames.has(key)) continue;
    seenNames.add(key);

    const points = typeof criterion.points === "number" ? ` (${criterion.points} pts)` : "";
    const detail = (criterion.longDescription ?? "").trim();
    lines.push(`${criterion.description}${points}: ${detail || criterion.description}`);
    for (const rating of criterion.ratings) {
      const ratingPoints = typeof rating.points === "number" ? ` (${rating.points} pts)` : "";
      if (rating.description.trim()) lines.push(`  ${rating.description}${ratingPoints}`);
    }
  }
  return lines.join("\n");
}

/**
 * Reports whether a rubric carries at least one criterion worth more than
 * zero points - the guard AC item 68 requires before a picked rubric is
 * ever handed to renderPickedRubricText for grading.
 *
 * THE FAILURE CHAIN THIS GUARDS AGAINST: a cartridge criterion's `points`
 * field defaults to 0 whenever the source XML omits a <points> tag
 * (src/lib/cartridge-import.ts:199, `tagNumber(critHead, "points") ?? 0`),
 * and the field is a non-optional `number` on CartridgeRubricCriterion - so
 * "the export never recorded points for this criterion" and "this criterion
 * is genuinely worth zero" are indistinguishable once the data reaches this
 * module. If every criterion in a rubric is 0, renderPickedRubricText still
 * renders valid `Name (0 pts): ...` lines, extractRubricCriteria still
 * parses them (0 is a valid finite number), but deriveTotalScore
 * (src/lib/grade/parsing.ts:165-193) sums a `possibleTotal` of 0 across every
 * area and returns `""` for the total (parsing.ts:188-190) rather than
 * throwing or logging anything - so every cell graded against that rubric
 * silently ends up with a blank, unpostable score and nothing in the pipeline
 * says why. The picker must call this function before offering such a
 * rubric and refuse it with a stated reason instead of letting an instructor
 * pick a column-blanking rubric with no warning.
 *
 * A rubric with zero criteria is also reported unusable (vacuously - there
 * is no usable point anywhere in an empty list), matching the same "refuse
 * rather than silently grade to nothing" posture.
 */
export function rubricHasUsablePoints(rubric: RenderableRubric): boolean {
  return rubric.criteria.some((criterion) => typeof criterion.points === "number" && criterion.points > 0);
}
