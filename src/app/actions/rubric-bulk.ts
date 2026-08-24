"use server";

// The "use server" boundary for the "generate and associate a rubric to every
// selected item" bulk control (docs/rubric-bulk-action-acceptance-criteria.md,
// chunk H of the Modules-view backlog). Agent 2A of wave 2.
//
// SEAM CLOSED. This file was written before src/lib/rubric-bulk-plan.ts
// existed, so it used to hold LOCAL copies of the percentage spec model, the
// percent-to-points scaling and the eligibility classifier. That file has now
// landed (wave 1, tested independently in rubric-bulk-plan.test.ts) and this
// file imports its exports instead of keeping a second copy that could drift:
//   - buildPercentSpecFromRows -- replaces the local scaleRowsToPoints's
//     percentage-parsing half (turns parsed rubric rows into a point-agnostic
//     RubricPercentSpec, and REFUSES when the areas do not sum to ~100
//     percent -- a validation this file never had before).
//   - planRubricMaterialization -- replaces the local eligibility-classify +
//     distinct-point-total-grouping loop that used to be inlined at the top
//     of runMaterialize. Composes classifyRubricEligibility internally.
//   - scaleSpecToPoints -- replaces the local scaleRowsToPoints's
//     percent-to-points math, called once per distinct-total group during
//     the write phase (writeMaterializations below).
// (Chunk H step-10 fixer B: this file used to call the two above through
// rubric-bulk-plan.ts's composed `buildRubricBulkPlan` wrapper instead of
// calling them separately. C5 required checking "is there anything eligible
// to write" BEFORE spending a generateRubric call, which means the grouping
// step (planRubricMaterialization) has to run and be inspected before a spec
// even exists to scale -- so this file now calls the two pieces directly and
// no longer imports buildRubricBulkPlan at all.)
// RubricPlanItem / RubricIneligibleReason are imported as types only, to
// build the plan's input and to translate its ineligible reasons back into
// this file's own RubricTargetSkipReason strings.
//
// ROUNDING: the imported scaleSpecToPoints uses largest-remainder
// apportionment, not the local file's old per-criterion Math.round. Plain
// per-criterion rounding does not, in general, sum back to the assignment's
// point total (33/33/34 percent of 7 points rounds to 2/2/2 = 6, one point
// short), and a rubric whose criteria do not sum to the assignment's total is
// exactly AC1b's wrong-grade defect. This file no longer performs its own
// rounding at all.
//
// AC3 - IDEMPOTENCY KEYS ON THE ITEM'S EXISTING rubricId, NOT ON A TITLE.
// listRubrics returns only {id, title, source} -- no criteria, no total -- so
// a name match cannot tell whether a rubric found by title is the one this
// control would have generated. An item that already carries a rubricId is
// reported skipped with that id attached, never silently replaced (AC4). A
// rubric this run creates but fails to associate with ANY of its intended
// items comes back as an OrphanRubric (id, title, points, attempted item
// ids) -- never auto-deleted, matching REGRESSION entry 258 check 11's
// reasoning against deleting ambiguous state a human has not looked at yet.
//
// AC4 - NEVER SILENTLY DROP AN INELIGIBLE ITEM. Only a module item whose own
// `kind` is exactly "Assignment" is eligible -- see
// classifyRubricEligibility's own doc comment in rubric-bulk-plan.ts for why
// Quiz- and Discussion-type items are excluded too (their contentId is the
// quiz's/topic's own id, not their grading shadow assignment's id).
// `bulkRubric` in useBulkItemActions.ts (line ~507) does not carry a New
// Quiz guard and drops ineligible items without reporting them -- that is
// pre-existing, is explicitly NOT inherited by this file, and every
// ineligible item below gets its own reported reason instead. ONE NEW
// REASON versus wave 1's file: "missing-points". The old local code silently
// defaulted a null/zero pointsPossible to 100 (matching
// RubricBuilderModal's single-item percent-mode fallback) and grouped that
// item in with genuinely 100-point items. classifyRubricEligibility does not
// do this -- it refuses an item whose point total is unknown outright. That
// refusal is adopted here, not overridden back to the old fallback: guessing
// a bulk item's total is 100 when Canvas has not actually reported one is
// itself a guess this control's own AC1b principle (never materialise a
// rubric against an unverified total) argues against.
//
// CORRECTION (chunk H step-10 fixer B): an earlier version of this comment
// claimed "grep confirms no other file references RubricTargetItem/
// RubricTargetOutcome/this file's actions yet." That is no longer true --
// useBulkItemActions.ts does reference this file's actions. Left here, not
// silently dropped, because a header that used to be wrong and now says
// nothing is harder to trust than one that names its own past mistake.
//
// THE NEW QUIZ FLAG IS NO LONGER A SILENT DEFAULT. Both wave-1 agents found
// independently that `submission_types` alone is NOT a reliable New Quiz
// discriminator (see src/lib/canvas-modules/new-quiz.ts's own header): the
// reliable classifier (`isNewQuizAssignment`) additionally needs
// `is_quiz_assignment === true` and `quiz_id` absent, and NEITHER field
// exists on `CanvasModuleItem` (verified against mappers.ts:6-23's full field
// list). Previously `RubricTargetItem.isNewQuiz` was an optional
// caller-supplied flag that silently defaulted to "not a New Quiz" whenever
// omitted -- a correct refusal rule that was never actually reachable unless
// some future caller remembered to wire it through by hand. This file now
// derives it itself: `resolveNewQuizFlags` below makes ONE course-level
// `/assignments` fetch via `listBulkItems(courseUrl, "Assignment", acronym)`
// (the exact fetch `listBulkItems` already makes at bulk.ts:39-48, which
// carries `is_quiz_assignment`/`quiz_id`/`submission_types` and runs them
// through the same `isNewQuizAssignment` the Assignments/Quizzes tabs use),
// keyed by assignment id, and merges the result onto every target with a
// numeric contentId before classification ever runs. The fetch happens
// EXACTLY ONCE per action call (inside prepareRubricPlan, which every
// exported action below reaches exactly once -- either directly, or via
// runMaterialize), matching how requireOwner() already runs once regardless
// of how many specs or distinct-total groups fan out inside it -- and it is
// skipped entirely when no target could possibly need it (no
// Assignment-kind target with a numeric contentId in the batch), so an
// all-Page or all-ineligible selection never pays for it. A caller-supplied
// `isNewQuiz` is kept only as a fallback for when the course-level fetch
// itself fails (a network error should not fail the whole bulk operation
// over a classification-only lookup) or does not carry a row for that
// content id; when the fetch succeeds and has a row, ITS value wins, never
// the caller's.
//
// RATING TIER RATIOS: generateRubric's own prompt (src/lib/grade/rubric.ts,
// the "The rubric text must" block) explicitly promises three FIXED
// deduction tiers -- "Excellent (100% -- no deductions)", "Meets
// Expectations (75% -- 25% deducted)", "Needs Improvement (50% -- 50%
// deducted)" -- verified by reading that prompt text directly. This
// confirms this control's earlier choice of (100/75/50) percentages was
// correct against generateRubric's real contract. The pre-existing
// `lms-rubric` workflow step (src/lib/workflows/registry/steps.rubrics.ts,
// ~line 163) instead falls back to a hard-coded "Full marks" / "Partial
// credit" (50%) / "No marks" (0%) ladder when it builds ratings from parsed
// rows -- a (100/50/0) ratio that does NOT match what generateRubric's
// prompt actually promises the instructor. That mismatch is pre-existing in
// a file this chunk does not own; it is recorded here, not fixed, per this
// chunk's explicit non-goals. (In this pipeline the tier percentages are no
// longer a local constant at all -- see buildRatingsFromSubcategories in
// rubric-bulk-plan.ts, which parses each subcategory line's own embedded
// percentage and falls back to [100, 75, 50] only when a line's wording
// departs from the prompt's requested format.)
//
// AC6 - TWO PHASES, NEVER INTERLEAVED. Generation (one LLM call per requested
// spec, fanned out with Promise.allSettled -- the same failure-isolation
// shape current-events-assignments.ts's generateCurrentEventsAssignmentsAction
// uses, and for the identical reason: a single call returning N prompts fails
// as a unit) is fully separate from the Canvas write phase (create one rubric
// per distinct point total, then associate it to every eligible item sharing
// that total), which runs strictly SEQUENTIALLY -- Canvas throttles, and
// bulkAssociateRubric already shares one throttle budget per call. A
// generation failure and a Canvas failure are reported through two
// STRUCTURALLY DIFFERENT shapes (RubricSpecOutcome vs RubricTargetOutcome) so
// they can never be collapsed into one indistinguishable list on the way to
// the note, exactly as entry 330 check 1 requires for its own two-phase split.
//
// requireOwner() runs exactly once per exported action, regardless of how
// many specs, targets or distinct-total groups fan out inside it.
//
// Unverified (reported, not attempted): whether a rubric POSTed with no
// rubric_association appears in the course rubric list at all (the AC's risk
// 1), and whether generateRubric's prose format survives an assignment
// DESCRIPTION as input rather than the repo/schedule text every existing
// caller feeds it (the AC's risk 2 -- though rubric-bulk-plan.test.ts now
// exercises the parser against realistic assignment-description prose and
// pins the percent-sum invariant that risk describes). Nothing in this file
// has run against a real Canvas course.
//
// ASSESSED, NOT DONE (chunk H step-10 fixer B): createRubric already accepts
// `associateAssignmentId` in the same POST, which raised the question of
// whether the FIRST item of each group should be associated that way and
// `bulkAssociateRubric` used only for the rest -- eliminating the orphan
// class for single-item groups. Not done here: createRubric's response
// carries only `{id, title}`, never a signal of whether Canvas actually
// accepted the embedded association (that is exactly the AC's own risk 1,
// still unverified against a real course), so an item "associated" this way
// could only be marked "updated" on faith, not on confirmation -- weaker than
// every other outcome in this file, which is confirmed by a request that
// either succeeded or threw. It would also split one group's items across
// two different success-tracking paths (create-embedded vs
// bulkAssociateRubric's per-item try/catch) for a benefit -- one fewer POST
// per single-item group -- that C10's fix below already delivers for the
// failure case that matters (an orphan is now reported even when the
// association call throws outright, not only when it returns per-item
// failures). Reported as a follow-up rather than half-done.

import { requireOwner } from "@/lib/supabase/auth";
import { generateRubric } from "@/lib/grade/rubric";
import { parseGeneratedRubric, type RubricRow } from "@/app/utils/rubric";
import { createRubric, bulkAssociateRubric, listBulkItems } from "@/lib/canvas-modules";
import {
  buildPercentSpecFromRows,
  planRubricMaterialization,
  scaleSpecToPoints,
  type RubricPlanItem,
  type RubricIneligibleReason,
  type RubricPlan,
  type RubricPercentSpec,
} from "@/lib/rubric-bulk-plan";
import type { LlmProvider } from "@/lib/llm";
import type { CourseKind } from "@/lib/course-kind";

// ---------------------------------------------------------------------------
// Phase 1: generation. Never writes to Canvas.
// ---------------------------------------------------------------------------

/**
 * One requested rubric spec. `key` is caller-chosen and echoed back on the
 * matching outcome -- outcomes are matched by KEY, never by array position,
 * the same discipline generateCurrentEventsAssignmentsAction uses (moduleId)
 * for its own fan-out, because index-matching a Promise.allSettled array
 * silently breaks the moment a caller reorders or filters its own request
 * list. AC1's default resolution (one spec for the whole selection) sends a
 * single request with an arbitrary key such as "selection"; AC1c's
 * unprecluded future (N tailored specs) sends one request per item/group --
 * a change at this one call site, not a new code path.
 */
export interface RubricSpecRequest {
  key: string;
  /** The instructions/description text to generate a rubric from. */
  instructions: string;
}

export type RubricSpecOutcome =
  | { key: string; status: "ok"; rows: RubricRow[] }
  | { key: string; status: "failed"; reason: string };

async function runGenerateSpecs(
  requests: RubricSpecRequest[],
  provider: LlmProvider,
  courseKind: CourseKind
): Promise<RubricSpecOutcome[]> {
  if (requests.length === 0) return [];

  const settled = await Promise.allSettled(
    requests.map((r) => generateRubric(r.instructions, provider, courseKind))
  );

  return settled.map((outcome, index) => {
    const key = requests[index].key;
    if (outcome.status === "rejected") {
      const reason = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
      return { key, status: "failed", reason };
    }
    const rows = parseGeneratedRubric(outcome.value);
    if (!rows || rows.length === 0) {
      return { key, status: "failed", reason: "Could not parse the generated rubric." };
    }
    return { key, status: "ok", rows };
  });
}

/**
 * Phase 1 (AC6): generate N independent rubric specs concurrently via
 * Promise.allSettled -- never a single call returning N prompts, for the
 * same failure-isolation and truncation reasons entry 330 check 1 gives for
 * its own per-module fan-out. Each spec's generated prose is parsed into
 * rows immediately, since a spec whose text fails to parse is exactly as
 * unusable to phase 2 as one whose model call rejected outright, and a
 * caller must not have to parse-check on its own after the fact.
 *
 * requireOwner() runs exactly once regardless of how many specs are
 * requested. Never writes to Canvas.
 */
export async function generateRubricSpecsAction(
  requests: RubricSpecRequest[],
  provider: LlmProvider = "gemini",
  courseKind: CourseKind = "coding"
): Promise<{ outcomes: RubricSpecOutcome[] } | { error: string }> {
  try {
    await requireOwner();
    const outcomes = await runGenerateSpecs(requests, provider, courseKind);
    return { outcomes };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not generate the rubric(s)." };
  }
}

// ---------------------------------------------------------------------------
// Phase 2: materialize + associate. The only phase that writes to Canvas.
// ---------------------------------------------------------------------------

/** Only a module item whose own kind is exactly this is eligible -- see
 *  classifyRubricEligibility's own doc comment (rubric-bulk-plan.ts) for why
 *  every other kind is refused, not just the AC's four named examples. */
const ELIGIBLE_KIND = "Assignment";

/** One item this control was asked to associate a rubric to. Every field is
 *  something the caller already has from the loaded module tree / selection
 *  (AC2's "no extra Canvas call" principle applied here) -- this file never
 *  fetches any of them itself EXCEPT `isNewQuiz`, which it now derives on
 *  the caller's behalf (see resolveNewQuizFlags below) rather than trusting
 *  the caller to have wired it through. */
export interface RubricTargetItem {
  /** Stable id for reporting outcomes back to the selection (a module item
   *  key, not assumed to equal contentId). */
  itemId: string;
  /** Canvas module item type string: "Assignment", "Quiz", "Discussion",
   *  "Page", "File", "SubHeader", "ExternalUrl", "ExternalTool", etc. */
  kind: string;
  /** The underlying Assignment id bulkAssociateRubric needs. Null for every
   *  non-Assignment kind and for an Assignment item Canvas reported with no
   *  content id. */
  contentId: number | null;
  /** pointsPossible from the already-loaded module tree (AC2) -- never
   *  re-fetched here. Null/zero is now treated as INELIGIBLE
   *  ("missing-points"), not defaulted to 100 -- see the file header for why
   *  the earlier fallback was dropped when the eligibility check moved to
   *  rubric-bulk-plan.ts's classifyRubricEligibility. */
  pointsPossible: number | null;
  /** The item's CURRENT rubric id, when the caller already knows it (e.g.
   *  from rubric_settings.id). Undefined/null means "no rubric known" --
   *  AC3's idempotency key. */
  existingRubricId?: number | null;
  /** Caller's own New Quiz signal, if it has one. USED ONLY AS A FALLBACK:
   *  this file's own course-level fetch (resolveNewQuizFlags) overrides this
   *  whenever it has a row for the item's contentId. Supplying nothing here
   *  is fine -- the fetch is this file's own responsibility now, not the
   *  caller's. */
  isNewQuiz?: boolean;
}

export type RubricTargetSkipReason =
  | "ineligible-kind"
  | "no-content-id"
  | "already-has-rubric"
  | "new-quiz"
  | "new-quiz-unverifiable"
  | "missing-points";

export type RubricTargetOutcome =
  | { itemId: string; status: "updated"; rubricId: number; rubricTitle: string; pointsPossible: number }
  | { itemId: string; status: "skipped"; reason: RubricTargetSkipReason; existingRubricId?: number }
  | { itemId: string; status: "failed"; reason: string };

/** A rubric this run created but could not attach to ANY of the items it was
 *  created for (every association for it failed) -- AC3's bounded cost,
 *  stated rather than hidden. Never auto-deleted: REGRESSION entry 258 check
 *  11's reasoning against auto-deleting ambiguous state applies unchanged. A
 *  human can find it by `rubricId` in the course's rubric list and decide
 *  what to do with it. */
export interface OrphanRubric {
  rubricId: number;
  rubricTitle: string;
  pointsPossible: number;
  attemptedItemIds: string[];
}

export interface RubricBulkAssociationResult {
  outcomes: RubricTargetOutcome[];
  orphans: OrphanRubric[];
}

/**
 * ONE course-level `/assignments` fetch (via `listBulkItems`, which already
 * makes it -- src/lib/canvas-modules/bulk.ts:39-48) to source the reliable
 * New Quiz signal (`isNewQuizAssignment`, run inside `listBulkItems` itself)
 * for every Assignment-kind target with a numeric contentId. Runs at most
 * once per `runMaterialize`/`generateAndAssociateRubricAction` call (i.e.
 * once per exported action call, matching requireOwner()'s own "exactly
 * once" discipline), and is skipped entirely when nothing in `targets` could
 * possibly need it (`ok: true`, empty map -- a real "nothing to check", not a
 * failure).
 *
 * C4 FIX: a fetch failure used to degrade to an empty map with no signal of
 * the difference between "checked, found nothing" and "never actually
 * checked" -- every target then silently fell back to `isNewQuiz ?? false`,
 * so ONE Canvas hiccup on `/assignments` turned AC4's New Quiz refusal
 * completely off, with no indication to the instructor. The caller (below)
 * MUST branch on `ok`: when it is false, an Assignment target with no
 * caller-supplied `isNewQuiz` of its own has no verified signal at all and
 * must be refused, not defaulted to "not a New Quiz". `ok: false` always
 * pairs with an empty map, since a failed fetch has nothing to report.
 */
async function resolveNewQuizFlags(
  courseUrl: string,
  targets: RubricTargetItem[],
  acronym: string | undefined
): Promise<{ map: Map<string, boolean>; ok: boolean }> {
  const needsCheck = targets.some((t) => t.kind === ELIGIBLE_KIND && typeof t.contentId === "number");
  if (!needsCheck) return { map: new Map(), ok: true };

  try {
    const assignments = await listBulkItems(courseUrl, "Assignment", acronym);
    return { map: new Map(assignments.map((a) => [a.id, a.isNewQuiz === true])), ok: true };
  } catch {
    return { map: new Map(), ok: false };
  }
}

/** Build rubric-bulk-plan.ts's input shape from this file's own
 *  RubricTargetItem, merging in the Canvas-derived New Quiz flag (winning
 *  over the caller's own `isNewQuiz` whenever the fetch has a row for this
 *  content id). Only called for targets that already cleared the C4
 *  unverifiable-New-Quiz guard (see classifyTargets below) -- by the time a
 *  target reaches here, either the course-level fetch succeeded or the
 *  caller supplied its own `isNewQuiz`, so falling back to `false` when
 *  neither applies can no longer happen silently on a real Assignment. */
function toPlanItem(target: RubricTargetItem, newQuizByContentId: Map<string, boolean>): RubricPlanItem {
  const derivedIsNewQuiz =
    typeof target.contentId === "number" ? newQuizByContentId.get(String(target.contentId)) : undefined;
  return {
    key: target.itemId,
    type: target.kind,
    contentId: target.contentId,
    pointsPossible: target.pointsPossible,
    existingRubricId: target.existingRubricId ?? null,
    isNewQuiz: derivedIsNewQuiz ?? target.isNewQuiz ?? false,
  };
}

/**
 * C4: split `targets` into plan-ready items and items this run must refuse
 * outright because their New Quiz status could not be verified -- an
 * Assignment-kind target with a numeric contentId, where the course-level
 * fetch failed (`!newQuizFetchOk`) AND the caller supplied no `isNewQuiz` of
 * its own. "A guard that cannot verify must refuse, not assume": this is the
 * one place that principle is enforced, before classifyRubricEligibility
 * (rubric-bulk-plan.ts) ever sees the item -- that classifier has no concept
 * of "unverifiable", only "known true" / "known false or absent", so the
 * refusal has to happen here, at the boundary that actually knows whether
 * the fetch behind the flag succeeded.
 */
function classifyTargets(
  targets: RubricTargetItem[],
  newQuizByContentId: Map<string, boolean>,
  newQuizFetchOk: boolean
): { planItems: RubricPlanItem[]; unverifiableOutcomes: RubricTargetOutcome[] } {
  const planItems: RubricPlanItem[] = [];
  const unverifiableOutcomes: RubricTargetOutcome[] = [];

  for (const target of targets) {
    const couldNeedNewQuizCheck = target.kind === ELIGIBLE_KIND && typeof target.contentId === "number";
    if (couldNeedNewQuizCheck && !newQuizFetchOk && target.isNewQuiz === undefined) {
      unverifiableOutcomes.push({ itemId: target.itemId, status: "skipped", reason: "new-quiz-unverifiable" });
      continue;
    }
    planItems.push(toPlanItem(target, newQuizByContentId));
  }

  return { planItems, unverifiableOutcomes };
}

/** Translate rubric-bulk-plan.ts's ineligible reasons into this file's own
 *  RubricTargetSkipReason strings. An exhaustive switch (no default arm) so
 *  a new reason added to RubricIneligibleReason fails this file's own
 *  typecheck instead of silently falling through unmapped. */
function mapIneligibleReason(reason: RubricIneligibleReason): RubricTargetSkipReason {
  switch (reason) {
    case "unsupported-type":
      return "ineligible-kind";
    case "missing-content-id":
      return "no-content-id";
    case "new-quiz":
      return "new-quiz";
    case "missing-points":
      return "missing-points";
  }
}

/** The result of classifying + grouping a whole selection, BEFORE any Canvas
 *  write and (crucially for C5) before any model spend: `outcomes` already
 *  carries every item this run will never write to (unverifiable New Quiz
 *  status, ineligible kind, or already-has-a-rubric), and `plan.groups` is
 *  what remains to actually materialize. A caller can decide whether there
 *  is any writing left to do just from `plan.groups.length`, without waiting
 *  on rubric generation. */
interface PreparedRubricPlan {
  outcomes: RubricTargetOutcome[];
  plan: RubricPlan;
}

/**
 * AC3/AC4/C4/C5: the one course-level New Quiz fetch, the C4 unverifiable
 * guard, and rubric-bulk-plan.ts's own classify-and-group pass -- all of it
 * pure or Canvas-READ-only, none of it a model call and none of it a Canvas
 * WRITE. Shared by both `runMaterialize` (rows already in hand) and
 * `generateAndAssociateRubricAction` (C5: this must run and be checked
 * BEFORE that action spends a `generateRubric` call, not just before its
 * Canvas write).
 */
async function prepareRubricPlan(
  courseUrl: string,
  targets: RubricTargetItem[],
  acronym: string | undefined
): Promise<PreparedRubricPlan> {
  const { map: newQuizByContentId, ok: newQuizFetchOk } = await resolveNewQuizFlags(courseUrl, targets, acronym);
  const { planItems, unverifiableOutcomes } = classifyTargets(targets, newQuizByContentId, newQuizFetchOk);

  // AC1/AC4: classify + group the whole selection in one call. Nothing is
  // silently dropped -- every ineligible or already-has-rubric item below
  // gets its own outcome before the write phase ever runs.
  const plan = planRubricMaterialization(planItems);

  const outcomes: RubricTargetOutcome[] = [...unverifiableOutcomes];
  for (const { item, reason } of plan.ineligible) {
    outcomes.push({ itemId: item.key, status: "skipped", reason: mapIneligibleReason(reason) });
  }
  for (const { item, rubricId } of plan.alreadyHasRubric) {
    outcomes.push({ itemId: item.key, status: "skipped", reason: "already-has-rubric", existingRubricId: rubricId });
  }

  return { outcomes, plan };
}

/**
 * The only phase that writes to Canvas. Scales `spec` to each distinct point
 * total in `prepared.plan.groups` (AC1b) and materializes one rubric per
 * group, STRICTLY SEQUENTIALLY -- Canvas throttles, and bulkAssociateRubric
 * already shares one throttle budget per call; writing two groups
 * concurrently would run two independent throttle budgets against the same
 * course at once.
 */
async function writeMaterializations(
  courseUrl: string,
  spec: RubricPercentSpec,
  prepared: PreparedRubricPlan,
  acronym: string | undefined
): Promise<RubricBulkAssociationResult> {
  const outcomes: RubricTargetOutcome[] = [...prepared.outcomes];
  const orphans: OrphanRubric[] = [];

  for (const group of prepared.plan.groups) {
    const title = `${spec.title} (${group.pointsTotal} pts)`;
    const criteria = scaleSpecToPoints(spec, group.pointsTotal);

    let created: { id: number; title: string };
    try {
      created = await createRubric(courseUrl, { title, criteria }, acronym);
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Could not create the rubric.";
      for (const item of group.items) outcomes.push({ itemId: item.key, status: "failed", reason });
      continue;
    }

    // C9: a Canvas assignment placed in TWO modules produces two module
    // items sharing the SAME contentId. Posting the same association twice
    // would double-count and let `failureById` map one failure onto both
    // keys arbitrarily; de-duplicating the ids sent to Canvas fixes the
    // double-POST while every module item (duplicates included) still looks
    // itself up in `failureById` below and gets the correct outcome, since
    // items sharing a contentId share the exact same association result.
    const ids = Array.from(new Set(group.items.map((item) => String(item.contentId))));

    // C10: this call used to sit outside any try -- a throw from inside it
    // (e.g. resolveCourse rejecting the course URL) unwound straight to
    // runMaterialize's caller, and a rubric this loop had just created was
    // never reported as an orphan. Wrapped now so a throw here reports the
    // same orphan a per-item association failure already would.
    let assoc: { updated: number; failures: Array<{ id: string; error: string }> };
    try {
      assoc = await bulkAssociateRubric(courseUrl, created.id, ids, acronym);
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Could not associate the rubric.";
      for (const item of group.items) outcomes.push({ itemId: item.key, status: "failed", reason });
      orphans.push({
        rubricId: created.id,
        rubricTitle: created.title,
        pointsPossible: group.pointsTotal,
        attemptedItemIds: group.items.map((item) => item.key),
      });
      continue;
    }

    const failureById = new Map(assoc.failures.map((f) => [f.id, f.error]));

    for (const item of group.items) {
      const idStr = String(item.contentId);
      const failure = failureById.get(idStr);
      if (failure !== undefined) {
        outcomes.push({ itemId: item.key, status: "failed", reason: failure });
      } else {
        outcomes.push({
          itemId: item.key,
          status: "updated",
          rubricId: created.id,
          rubricTitle: created.title,
          pointsPossible: group.pointsTotal,
        });
      }
    }

    if (assoc.updated === 0) {
      orphans.push({
        rubricId: created.id,
        rubricTitle: created.title,
        pointsPossible: group.pointsTotal,
        attemptedItemIds: group.items.map((item) => item.key),
      });
    }
  }

  return { outcomes, orphans };
}

async function runMaterialize(
  courseUrl: string,
  rows: RubricRow[],
  targets: RubricTargetItem[],
  titlePrefix: string,
  acronym: string | undefined
): Promise<RubricBulkAssociationResult | { error: string }> {
  // AC1b: refuses (returns {error}, never builds a spec) when the parsed
  // rows' percentages do not sum to ~100 -- see buildPercentSpecFromRows's
  // own doc comment. This also subsumes the old "no rows at all" check.
  const specResult = buildPercentSpecFromRows(rows, titlePrefix);
  if ("error" in specResult) return { error: specResult.error };

  const prepared = await prepareRubricPlan(courseUrl, targets, acronym);
  return await writeMaterializations(courseUrl, specResult.spec, prepared, acronym);
}

/**
 * Phase 2 (AC6): materialize an already-generated spec into one Canvas
 * rubric per distinct point total across `targets`, then associate each
 * rubric to every eligible item sharing that total. Strictly sequential --
 * see runMaterialize's own comment. requireOwner() runs exactly once
 * regardless of how many rubrics fan out.
 */
export async function materializeAndAssociateRubricAction(
  courseUrl: string,
  rows: RubricRow[],
  targets: RubricTargetItem[],
  titlePrefix: string = "Generated Rubric",
  acronym?: string
): Promise<RubricBulkAssociationResult | { error: string }> {
  try {
    await requireOwner();
    return await runMaterialize(courseUrl, rows, targets, titlePrefix, acronym);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create and associate the rubric(s)." };
  }
}

// ---------------------------------------------------------------------------
// Convenience: the common single-spec, one-click flow.
// ---------------------------------------------------------------------------

export type GenerateAndAssociateRubricResult =
  | { phase: "generation-failed"; reason: string }
  | { phase: "done"; result: RubricBulkAssociationResult };

/**
 * The AC1 default in one call: generate ONE point-agnostic spec from
 * `instructions`, then (only if generation succeeded) materialize and
 * associate it across `targets`. requireOwner() runs exactly once for the
 * whole operation -- this does NOT call the two actions above internally
 * (that would run requireOwner() twice for one logical operation); it shares
 * their internal runGenerateSpecs/runMaterialize helpers instead.
 *
 * A generation failure short-circuits before any Canvas write is attempted
 * and is returned as `{ phase: "generation-failed" }`, a shape that can never
 * be confused with a `RubricBulkAssociationResult`'s per-item Canvas
 * failures (AC6: the two failure lists stay separate all the way to the
 * caller). A materialization-level failure (e.g. the generated rows do not
 * sum to ~100 percent) surfaces as the outer `{ error }` variant instead,
 * which is likewise never confusable with either of the other two shapes.
 * Kept as a separate export from generateRubricSpecsAction /
 * materializeAndAssociateRubricAction (rather than replacing them) so a
 * future caller that wants to preview the generated rubric before writing it
 * to Canvas -- or that wants AC1c's N-tailored-specs shape -- can call the
 * two granular actions directly instead.
 *
 * C5 FIX: the AC3 idempotency check (does anything in `targets` actually
 * need a NEW rubric at all?) used to run only inside `runMaterialize`, AFTER
 * `runGenerateSpecs` had already spent a full `generateRubric` model call --
 * so re-running this action on a selection where every item already carries
 * a rubric burned a model call and then reported "0 created". AC3 says the
 * pre-check exists so a re-run costs nothing, and a model call is not
 * nothing. `prepareRubricPlan` (classification + the course-level New Quiz
 * fetch -- Canvas READS, not writes, and no model spend) now runs FIRST; if
 * it leaves zero groups to materialize, this returns immediately with every
 * item's already-computed outcome and never calls `generateRubric` at all.
 */
export async function generateAndAssociateRubricAction(
  courseUrl: string,
  instructions: string,
  targets: RubricTargetItem[],
  titlePrefix: string = "Generated Rubric",
  provider: LlmProvider = "gemini",
  courseKind: CourseKind = "coding",
  acronym?: string
): Promise<GenerateAndAssociateRubricResult | { error: string }> {
  try {
    await requireOwner();

    const prepared = await prepareRubricPlan(courseUrl, targets, acronym);
    if (prepared.plan.groups.length === 0) {
      // Nothing left that would need a newly generated rubric -- every
      // target is already accounted for (ineligible, already-has-rubric, or
      // unverifiable). Short-circuit before the model spend (C5), not just
      // before the Canvas write.
      return { phase: "done", result: { outcomes: prepared.outcomes, orphans: [] } };
    }

    const [outcome] = await runGenerateSpecs([{ key: "selection", instructions }], provider, courseKind);
    if (!outcome || outcome.status === "failed") {
      return { phase: "generation-failed", reason: outcome?.reason ?? "Could not generate the rubric." };
    }

    const specResult = buildPercentSpecFromRows(outcome.rows, titlePrefix);
    if ("error" in specResult) return specResult;

    const result = await writeMaterializations(courseUrl, specResult.spec, prepared, acronym);
    return { phase: "done", result };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not generate and associate the rubric." };
  }
}
