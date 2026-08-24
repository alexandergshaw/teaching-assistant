// Pure core for chunk H's "generate and associate a rubric to all selected
// items" bulk action (docs/rubric-bulk-action-acceptance-criteria.md).
//
// This file owns AC1/AC1b/AC1c/AC2/AC4: one point-agnostic percentage spec,
// materialised into one Canvas rubric PER DISTINCT point total across the
// selection, plus the eligibility classifier that decides which selected
// items can take a rubric at all. Nothing here calls Canvas, touches React,
// or reads the clock - every function is a plain, synchronous transform so
// it can be exercised directly by rubric-bulk-plan.test.ts (this repo's
// vitest never renders a component - see docs/DEV_LOOP.md).
//
// AC2 in this file's terms: callers must build `RubricPlanItem.pointsPossible`
// from the already-loaded module tree (`CanvasModuleItem.pointsPossible`,
// populated because `listModules` requests `include[]=content_details` - see
// src/lib/canvas-modules/mappers.ts:18 and modules.ts:28), never from a
// per-item detail fetch (`getGradable`, src/lib/canvas-modules/gradables.ts,
// reads only title/description/rubricId/submissionTypes - verified by
// reading its response mapping at gradables.ts:39-44, no points field at
// all). This file has no way to enforce that at the type level - it can only
// documented the contract its input shape assumes.

import type { RubricCriterionInput } from "@/lib/canvas-modules";
import type { RubricRow } from "@/app/utils/rubric";

// ---------------------------------------------------------------------------
// AC1: the point-agnostic spec model (criteria as PERCENTAGES).
// ---------------------------------------------------------------------------

/** One rating tier within a percent-mode criterion. `percent` is relative to
 *  THIS CRITERION's own eventual point value, not the assignment total - e.g.
 *  a 100 percent tier means "full marks for this criterion", not "100 percent
 *  of the whole rubric". */
export interface RubricPercentRating {
  description: string;
  longDescription?: string;
  percent: number;
}

/** One grading area, weighted as a percentage of the whole rubric (AC1b: the
 *  reason this is a percentage and not a point value is that the SAME spec
 *  must scale correctly to every distinct point total in the selection). */
export interface RubricPercentCriterion {
  description: string;
  longDescription?: string;
  percent: number;
  ratings: RubricPercentRating[];
}

/** A whole rubric, still independent of any assignment's point total. */
export interface RubricPercentSpec {
  title: string;
  criteria: RubricPercentCriterion[];
}

/** Sum of every criterion's percent. Exported so callers/tests can express
 *  the AC1b invariant ("criteria sum to the assignment total") without
 *  reaching into private rounding details. */
export function percentSum(spec: RubricPercentSpec): number {
  return spec.criteria.reduce((sum, c) => sum + c.percent, 0);
}

/**
 * How far a spec's percentages may drift from exactly 100 and still be
 * accepted. Not zero: `generateRubric` (src/lib/grade/rubric.ts:194) asks the
 * model to divide 100 percent evenly across 3-5 areas, which is exact for 4
 * areas (25 each) but only repeating-decimal-exact for 3 (33.33... each) -
 * three areas reported as "33%, 33%, 33%" (the model rounding its own prose)
 * sum to 99, not 100. A tolerance of 1 percentage point absorbs that
 * legitimate rounding while still catching the failure risk 2 describes: one
 * area line silently dropped by `parseGeneratedRubric`'s row-parsing `if
 * (!match) continue` leaves at most 3 of 4 areas, i.e. at most 75 percent -
 * far outside a 1-point band.
 */
const PERCENT_SUM_TOLERANCE = 1;

/**
 * Build a percent spec from parsed rubric rows (the SHAPE `parseGeneratedRubric`,
 * src/app/utils/rubric.ts:11, already emits from `generateRubric`'s prose,
 * src/lib/grade/rubric.ts:156). Refuses loudly - returns `{ error }` rather
 * than a spec - when the rows' percentages do not sum to ~100, because a
 * spec built from a short sum is the exact defect AC1b exists to prevent: it
 * would scale into a rubric whose criteria under- or over-count the
 * assignment's real point total.
 *
 * `parseGeneratedRubric` itself never validates this (it `continue`s past
 * any line it cannot parse and returns whatever rows it managed to build),
 * so this validation has nowhere else to live.
 *
 * CRITERION LONG DESCRIPTION: `row.description` is the prose after the area's
 * own "Area Name (25%): ..." colon - the sentence explaining what the area
 * assesses. It is carried onto `RubricPercentCriterion.longDescription` here
 * (and from there through `scaleSpecToPoints`, unchanged, onto
 * `RubricCriterionInput.longDescription` - see that function's own criteria
 * map, which already read `c.longDescription` before this fix but had
 * nothing populating it). This is a DISTINCT field from each rating tier's
 * own `longDescription`, which `buildRatingsFromSubcategories` below sets
 * from `sub.description` (the text after a SUBCATEGORY line's colon, e.g.
 * "Excellent (100%...): Thesis is specific..."). One is the criterion's own
 * explanatory sentence; the other explains one rating tier. They live on
 * different objects (the criterion vs. one entry in its `ratings` array) and
 * neither assignment can overwrite the other.
 */
export function buildPercentSpecFromRows(
  rows: RubricRow[],
  title: string
): { spec: RubricPercentSpec } | { error: string } {
  if (rows.length === 0) {
    return { error: "The generated rubric has no grading areas to build a spec from." };
  }

  const criteria: RubricPercentCriterion[] = rows.map((row) => ({
    description: row.area,
    longDescription: row.description.trim() || undefined,
    percent: parsePercentValue(row.weight),
    ratings: buildRatingsFromSubcategories(row.subcategories),
  }));

  const spec: RubricPercentSpec = { title, criteria };
  const sum = percentSum(spec);

  if (!Number.isFinite(sum) || Math.abs(sum - 100) > PERCENT_SUM_TOLERANCE) {
    return {
      error: `The generated rubric's areas sum to ${sum} percent, not 100 - refusing to build a spec that would misgrade the assignment (${rows.length} area(s) parsed).`,
    };
  }

  return { spec };
}

/** Pull the leading number out of a weight string like "25%", "25", or
 *  "33.5 %". Non-numeric input (a malformed row) becomes 0, which is what
 *  pushes the overall sum outside PERCENT_SUM_TOLERANCE and triggers the
 *  refusal above - it never silently disappears the way a `continue` would. */
function parsePercentValue(weight: string): number {
  const match = String(weight).match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

/** Default deduction-tier percentages, in `generateRubric`'s own fixed order
 *  (Excellent/Meets Expectations/Needs Improvement - src/lib/grade/rubric.ts:
 *  197-200). Used whenever a subcategory's own label does not carry a
 *  parseable percentage (e.g. a model that departs from the requested
 *  wording), so a rubric still materialises with a sane rating ladder rather
 *  than refusing outright over presentation-only text - unlike the area-sum
 *  check above, a rating-tier label is not the invariant AC1b protects. */
const DEFAULT_TIER_PERCENTS = [100, 75, 50];

function buildRatingsFromSubcategories(
  subcategories: RubricRow["subcategories"]
): RubricPercentRating[] {
  if (subcategories.length === 0) {
    return DEFAULT_TIER_PERCENTS.map((percent) => ({
      description: `${percent}%`,
      percent,
    }));
  }

  return subcategories.map((sub, i) => {
    const match = sub.label.match(/(\d+(?:\.\d+)?)\s*%/);
    const percent = match ? Number(match[1]) : DEFAULT_TIER_PERCENTS[i] ?? 0;
    return {
      description: sub.label,
      longDescription: sub.description || undefined,
      percent,
    };
  });
}

// ---------------------------------------------------------------------------
// AC1/AC1b: percentage -> points scaling for one specific total.
// ---------------------------------------------------------------------------

/**
 * Ceiling on the apportionment precision below (C1): two decimal places.
 *
 * WHERE THIS NUMBER COMES FROM, STATED HONESTLY. It matches
 * `RUBRIC_POINTS_DECIMALS` in src/lib/cartridge-import-blackboard-rubrics.ts,
 * which rounds a percentage-converted Blackboard rubric to the same grain for
 * a related reason. That module's comment DOES say "verified interactively" -
 * but read it carefully: the phrase attaches to an IEEE754 artifact
 * (12 * 40 / 100 landing on 4.800000000000001), NOT to Canvas's own
 * granularity. Its two-decimal claim is a reasonable assumption nobody has
 * checked against a live Canvas, and so is this one. An earlier draft of this
 * comment cited it as an already-verified external fact; that was wrong, in
 * the file that owns the grading arithmetic, which is the worst place for it.
 *
 * Consequence-free today: this is only a CEILING on `pointPrecisionScale`, and
 * a realistic `points_possible` never reaches it - a total needing three
 * decimals would clamp here, and none exists in practice. If a real course
 * ever produces one, verify against Canvas before raising this rather than
 * assuming the direction.
 */
const MAX_POINTS_PRECISION_SCALE = 100;

/**
 * The smallest power of ten (1, 10, or 100) that turns `total` into a whole
 * number, capped at `MAX_POINTS_PRECISION_SCALE`. An integer total (the
 * common case - every existing caller before C1 only ever passed one) needs
 * no scaling at all, so this returns 1 and the apportionment below runs
 * exactly as it always has, in whole points. A fractional total (C1's
 * 7.5-point worksheet) needs just enough scale to make the total exact in
 * that many whole UNITS - never more than Canvas's own two-decimal ceiling,
 * and never less than the total actually needs, so an integer total's
 * criteria stay integers (unchanged behaviour, unchanged tests) and only a
 * genuinely fractional total gets fractional criteria points.
 */
function pointPrecisionScale(total: number): number {
  for (const scale of [1, 10, MAX_POINTS_PRECISION_SCALE]) {
    const scaled = total * scale;
    if (Math.abs(scaled - Math.round(scaled)) < 1e-6) return scale;
  }
  return MAX_POINTS_PRECISION_SCALE;
}

/**
 * Scale a percent spec into Canvas-ready criteria for ONE assignment's point
 * total. Reuses the approach `RubricBuilderModal`'s percent mode already
 * ships (src/app/components/content-tab/RubricBuilderModal.tsx:161-184:
 * `scale = (pct) => Math.round((pct / 100) * total)`, falling back to 100
 * when points are null/zero) rather than inventing a second one - imported
 * as a value would pull a React component into this pure file, so the
 * agreement is pinned by a frozen-literal-oracle test instead
 * (rubric-bulk-plan.test.ts), per this chunk's brief.
 *
 * ROUNDING DECISION (the hazard AC1b calls out by name): scaling each
 * criterion's percent independently with `Math.round` does not, in general,
 * sum back to `totalPoints` - four criteria at 33/33/33/1 percent of 90
 * round to 30/30/30/0 = 90 (fine) but 33/33/34 percent of 7 rounds to
 * 2/2/2 = 6, one point short. This function corrects that with the largest-
 * remainder method (a standard apportionment algorithm, not invented here):
 * floor every criterion's exact share, then hand the leftover whole UNITS
 * (the total minus the sum of floors) one each to the criteria with the
 * largest fractional remainder, ties broken by the criterion's original
 * index so the result is deterministic. This is the one correction that
 * matters for AC1b - a rubric whose criteria do not sum to the assignment's
 * own point total grades it wrong - so it is the one place this file departs
 * from RubricBuilderModal's plain `Math.round` (which does not carry this
 * guarantee, and does not need to for its own single-parent-total use).
 *
 * C1 (fractional totals are unreachable): the largest-remainder loop used to
 * distribute a REMAINDER that was always assumed to be a whole number of
 * points (`Math.round(safeTotal - flooredSum)`). For an integer total that
 * assumption holds; for a fractional total (a 7.5-point lab worksheet) it
 * does not, and rounding the remainder to the nearest whole point is exactly
 * what made every fractional total unreachable - `[25,25,25,25]` at 7.5
 * floored to `[1,1,1,1]`, leaving a remainder of `3.5`, rounded to `4`, and
 * handed out one whole point at a time until the total overshot by 0.5. The
 * fix apportions in the total's OWN precision instead of always whole
 * points: `pointPrecisionScale` above picks the smallest scale (1, 10, or
 * 100) that makes `totalPoints` exact in that many whole units, the same
 * largest-remainder loop runs on those units (which are always integers, so
 * `Math.round` on the unit remainder is exact, not a rounding hazard), and
 * the result is divided back down at the end. An integer total scales by 1
 * and reproduces the pre-fix arithmetic bit for bit.
 *
 * C2 (a within-tolerance percent spec can over-sum the assignment's total):
 * this function used to divide each criterion's percent by the literal 100,
 * trusting that `buildPercentSpecFromRows`'s `PERCENT_SUM_TOLERANCE` check
 * meant "close enough to 100 that dividing by 100 is fine." It is not: a
 * spec summing to 101 (e.g. "34%, 34%, 33%", the tolerance's own intended
 * catch) divided by 100 produces exact shares that themselves sum to 101
 * percent of the total, and the correction loop above only ever ADDS a unit
 * to the largest remainders - it has no branch that takes one back - so an
 * over-sum spec comes out over-sum. The fix normalises against the spec's
 * REAL percent sum (`percentSum(spec)`, clamped away from zero) rather than
 * the literal 100: `exact_i = (percent_i / percentSum) * scaledTotal`. Floors
 * of shares that individually sum to `scaledTotal` (by construction, because
 * they are now fractions of 1 of the total, not fractions of a
 * possibly-101-percent whole) always sum to `<= scaledTotal`, so the
 * remainder is always `>= 0` - the loop's one-directional "only ever add"
 * shape becomes correct BECAUSE of the input it receives, not by accident.
 * This does NOT relax `buildPercentSpecFromRows`'s refusal: that function
 * still refuses any spec whose raw percent sum falls outside
 * `PERCENT_SUM_TOLERANCE` of 100 before a spec ever reaches this function,
 * so a spec that lost a whole area to a parser miss (summing to 75) is still
 * rejected outright, never silently renormalised up to 100 here - refusal
 * happens on the UNNORMALISED sum at construction time, and normalisation
 * only ever nudges an already-accepted (near-100) sum the rest of the way to
 * exact, so the two do not cancel each other out.
 *
 * Rating-tier points are NOT run through this correction: a tier is a
 * standalone alternate score for its criterion (e.g. "75 percent = partial
 * credit"), not one of several shares that must add up to something, so a
 * plain `Math.round` of `criterionPoints * tierPercent / 100` is exact for
 * this file's purpose and matches `RubricBuilderModal`'s own treatment of
 * ratings (ratings scaled through the identical `scale` callback as the
 * criterion they belong to).
 */
export function scaleSpecToPoints(spec: RubricPercentSpec, totalPoints: number): RubricCriterionInput[] {
  const safeTotal = Number.isFinite(totalPoints) && totalPoints > 0 ? totalPoints : 100;
  const n = spec.criteria.length;
  if (n === 0) return [];

  // C2: normalise against the spec's REAL percent sum, not the literal 100 -
  // see this function's own doc comment above for why that is what makes the
  // largest-remainder loop's "only ever add" shape correct rather than
  // accidentally correct.
  const pctSum = percentSum(spec);
  const safePctSum = pctSum > 0 ? pctSum : 100;

  // C1: apportion in the total's own precision, not always whole points -
  // see this function's own doc comment above.
  const scale = pointPrecisionScale(safeTotal);
  const scaledTotal = Math.round(safeTotal * scale);

  const exact = spec.criteria.map((c) => (c.percent / safePctSum) * scaledTotal);
  const floors = exact.map((v) => Math.floor(v));
  const flooredSum = floors.reduce((a, b) => a + b, 0);
  let remainder = Math.round(scaledTotal - flooredSum);

  const order = exact
    .map((v, i) => ({ i, frac: v - floors[i] }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);

  const scaledPoints = [...floors];
  for (let k = 0; k < order.length && remainder > 0; k += 1) {
    scaledPoints[order[k].i] += 1;
    remainder -= 1;
  }
  const points = scaledPoints.map((p) => p / scale);

  return spec.criteria.map((c, i) => ({
    description: c.description.trim() || `Criterion ${i + 1}`,
    longDescription: c.longDescription?.trim() || undefined,
    points: points[i],
    ratings: c.ratings.map((r) => ({
      description: r.description.trim() || `${r.percent}%`,
      longDescription: r.longDescription?.trim() || undefined,
      points: Math.round((points[i] * r.percent) / 100),
    })),
  }));
}

// ---------------------------------------------------------------------------
// AC4: the eligibility classifier.
// ---------------------------------------------------------------------------

/** The subset of a selected module item this file needs to classify it and
 *  group it by point total. Deliberately narrower than `CanvasModuleItem`
 *  (src/lib/canvas-modules/types.ts:2) so a caller can pass either that type
 *  directly or a lighter-weight shape assembled elsewhere; `key` is an
 *  opaque caller-supplied identifier (e.g. the `moduleId:itemId` pairing
 *  `itemKey` already produces in useBulkItemActions.ts) round-tripped
 *  verbatim into this file's output, never parsed or reconstructed here. */
export interface RubricPlanItem {
  key: string;
  /** Canvas module item type: "Assignment", "Quiz", "Discussion", "Page",
   *  "File", "SubHeader", "ExternalUrl", "ExternalTool", etc. */
  type: string;
  /** Underlying content id. Null for item types with no backing content
   *  (e.g. SubHeader) - see CanvasModuleItem.contentId's own doc comment. */
  contentId: number | null;
  /** From the already-loaded module tree (AC2) - never from a detail fetch. */
  pointsPossible: number | null;
  /** Set when the caller already knows this item carries a rubric (AC3's
   *  idempotency key candidate - out of this file's scope to determine, but
   *  in scope to report distinctly once known: AC4 requires "already has a
   *  rubric" and "can never have one" to be different outcomes). */
  existingRubricId?: number | null;
  /** Set when the caller has already run the New Quiz discriminator
   *  (`isNewQuizAssignment`, src/lib/canvas-modules/new-quiz.ts:70) against
   *  this item. THIS FILE CANNOT COMPUTE THIS ITSELF: New Quiz detection
   *  needs `is_quiz_assignment`/`submission_types`/`quiz_id`, none of which
   *  `CanvasModuleItem` carries (verified against mappers.ts:6-23's full
   *  field list - the module-items endpoint's `include[]=content_details`
   *  surfaces due dates and points, not assignment submission metadata).
   *  Getting this signal means a course-level `/assignments` fetch like
   *  `listBulkItems` already makes (src/lib/canvas-modules/bulk.ts:39-48),
   *  not a per-item detail fetch, so it does not conflict with AC2 - but it
   *  is the calling server action's job to supply it, not this file's.
   *  Undefined means "unknown", and is treated as "not a New Quiz" (see
   *  `classifyRubricEligibility`'s doc comment for why that default is safe
   *  here, unlike new-quiz.ts's own conservatism, which runs the other way). */
  isNewQuiz?: boolean;
}

export type RubricIneligibleReason =
  | "unsupported-type"
  | "new-quiz"
  | "missing-content-id"
  | "missing-points";

export type RubricEligibility =
  | { kind: "eligible" }
  | { kind: "already-has-rubric"; rubricId: number }
  | { kind: "ineligible"; reason: RubricIneligibleReason };

/**
 * AC4's classifier. Only a module item of type "Assignment" can be
 * materialised against by this pipeline: `bulkAssociateRubric`
 * (src/lib/canvas-modules/rubrics.ts:285) hardcodes
 * `rubric_association[association_type] = "Assignment"` and sends the
 * item's own `contentId` as the association id, so this only lands correctly
 * when `contentId` really IS a Canvas assignment id. That is true for
 * "Assignment"-type module items (verified: CanvasModuleItem.contentId comes
 * straight off the module item's own `content_id`, mappers.ts:16) but NOT
 * for "Quiz" or "Discussion"-type items, whose `contentId` is the quiz's or
 * discussion topic's own id, not their grading shadow assignment's id (see
 * bulk.ts:96-108's `shadowQuizId`/`shadowDiscussionTopicId`, which exist
 * precisely because that mapping is not free - it takes a second lookup this
 * file has no access to). So alongside the AC's explicitly named Page/File/
 * SubHeader/ExternalUrl/ExternalTool, "Quiz" and "Discussion" module items
 * are also `"unsupported-type"` here - not because they cannot ever carry a
 * rubric in Canvas, but because this pipeline has no correct id to send for
 * them without a fetch this chunk's scope does not include.
 *
 * `isNewQuiz` defaults to "not a New Quiz" when unknown, which is the
 * OPPOSITE direction from new-quiz.ts's own conservatism (which defaults
 * unknown signals to "not a New Quiz" specifically so an ordinary assignment
 * is never mislabelled as a quiz for DISPLAY purposes). Here the risk runs
 * the other way in consequence but the same way in shape: AC4 says the
 * shipped `bulkRubric` control's missing New Quiz guard must not be
 * "aligned down" to, i.e. a real New Quiz must be excluded whenever it is
 * actually known - but this file cannot invent a signal its input does not
 * carry, and refusing every item whenever the caller omits the flag would
 * make the whole feature unusable the moment a caller has not wired New Quiz
 * detection through yet. The obligation to actually supply `isNewQuiz` for
 * every real assignment belongs to the caller assembling `RubricPlanItem`
 * (the sibling server action), not to this classifier.
 */
export function classifyRubricEligibility(item: RubricPlanItem): RubricEligibility {
  if (item.type !== "Assignment") {
    return { kind: "ineligible", reason: "unsupported-type" };
  }
  if (typeof item.contentId !== "number") {
    return { kind: "ineligible", reason: "missing-content-id" };
  }
  if (item.isNewQuiz === true) {
    return { kind: "ineligible", reason: "new-quiz" };
  }
  if (typeof item.existingRubricId === "number") {
    return { kind: "already-has-rubric", rubricId: item.existingRubricId };
  }
  if (typeof item.pointsPossible !== "number" || !(item.pointsPossible > 0)) {
    return { kind: "ineligible", reason: "missing-points" };
  }
  return { kind: "eligible" };
}

// ---------------------------------------------------------------------------
// AC1: distinct-total grouping.
// ---------------------------------------------------------------------------

export interface RubricMaterializationGroup {
  pointsTotal: number;
  items: RubricPlanItem[];
}

export interface RubricPlan {
  /** One entry per DISTINCT point total among the eligible items, in the
   *  order each total was first seen in the input - ten 100-point items
   *  anywhere in the selection collapse into the SAME group (AC1). */
  groups: RubricMaterializationGroup[];
  alreadyHasRubric: Array<{ item: RubricPlanItem; rubricId: number }>;
  ineligible: Array<{ item: RubricPlanItem; reason: RubricIneligibleReason }>;
}

/**
 * Classify and group a whole selection (AC1 + AC4 together): every item is
 * placed into exactly one of `groups` (by its point total), `alreadyHasRubric`,
 * or `ineligible` - never dropped, and never counted in more than one bucket,
 * so a caller can report every selected item's outcome (AC4's "never
 * silently dropped").
 */
export function planRubricMaterialization(items: RubricPlanItem[]): RubricPlan {
  const groups: RubricMaterializationGroup[] = [];
  const groupIndexByTotal = new Map<number, number>();
  const alreadyHasRubric: RubricPlan["alreadyHasRubric"] = [];
  const ineligible: RubricPlan["ineligible"] = [];

  for (const item of items) {
    const outcome = classifyRubricEligibility(item);
    if (outcome.kind === "ineligible") {
      ineligible.push({ item, reason: outcome.reason });
      continue;
    }
    if (outcome.kind === "already-has-rubric") {
      alreadyHasRubric.push({ item, rubricId: outcome.rubricId });
      continue;
    }
    // "eligible" guarantees pointsPossible is a positive number - see
    // classifyRubricEligibility's own "missing-points" branch above.
    const total = item.pointsPossible as number;
    const existingIndex = groupIndexByTotal.get(total);
    if (existingIndex === undefined) {
      groupIndexByTotal.set(total, groups.length);
      groups.push({ pointsTotal: total, items: [item] });
    } else {
      groups[existingIndex].items.push(item);
    }
  }

  return { groups, alreadyHasRubric, ineligible };
}

// ---------------------------------------------------------------------------
// The end-to-end pure plan: one spec, N materialisations.
// ---------------------------------------------------------------------------

export interface RubricMaterialization {
  pointsTotal: number;
  title: string;
  criteria: RubricCriterionInput[];
  items: RubricPlanItem[];
}

// NOTE: a composed `buildRubricBulkPlan(items, spec)` wrapper lived here and was
// DELETED on 2026-08-24. C5's fix required inspecting the grouping BEFORE a spec
// exists to scale, so that a re-run where every item already has a rubric costs
// no model call. The action therefore calls planRubricMaterialization and
// scaleSpecToPoints separately, and the wrapper was left with no production
// caller - reached only by its own tests, which is a green suite covering a path
// production does not take. Compose the two directly rather than reviving it.
