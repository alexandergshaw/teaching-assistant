"use server";

// The "use server" boundary for scheduled publishing from Modules
// (docs/scheduled-publishing-from-modules-acceptance-criteria.md - the "Post-
// design corrections" section is the final contract, and F10 (its last
// entry, decided 2026-08-24) governs everything in this file: releases
// target BOTH modules and items, and F4's unpublish-refusal question is
// decided there - a target Canvas refuses to hide is still surfaced in the
// PLAN (below) and still SCHEDULED at commit (also below); it is never a
// reason to refuse the whole operation).
//
// TWO ACTIONS, DRAFT-THEN-COMMIT (AC3, and the same idiom entries 331/337
// already use for a live-course write this app will not be watching fire):
//   - planScheduledReleaseAction: READ-ONLY. Reads the whole module tree
//     ONCE (never once per target - entry 337 defect 1 and entry 339's own
//     follow-up are both this exact mistake at a different scope), plus,
//     only when at least one target could need it, the course's assignments
//     and quizzes ONCE (for Canvas's own `unpublishable` field), and hands
//     the facts to release-plan.ts's pure classifier
//     (classifyReleaseHideState / buildReleasePlanRows) rather than deciding
//     hide-state itself - this file owns the Canvas I/O, release-plan.ts
//     owns the decision, and neither re-implements the other's half.
//   - commitScheduledReleaseAction: THE ONLY ACTION THAT WRITES. Per target,
//     STRICTLY IN THIS ORDER: (1) attempt to unpublish it on Canvas right
//     now (F4 - "students see nothing at all until the release time"), (2)
//     write its `scheduled_releases` row via the existing `scheduleRelease`
//     (src/lib/scheduled-releases.ts), (3) patch that row's `module_id`
//     (F10) as a SEPARATE follow-up update - see the comment on
//     patchScheduledReleaseModuleId below for exactly why step 3 cannot be
//     folded into step 2's own payload. F10's refusal decision means step
//     1's failure NEVER aborts steps 2-3: the instructor already saw this
//     target's refusal in the plan built by planScheduledReleaseAction and
//     chose to commit anyway, so "publishing later is harmless" - only a
//     failure in step 2 (or, currently, step 3 - see that function's own
//     header) marks the target `failed`. PER-TARGET ISOLATION throughout:
//     each target gets its own try/catch, so one Canvas refusal or one
//     database hiccup can never abort the remaining targets - the exact
//     property REGRESSION entry 338's "ONE ROW PER TARGET" design exists to
//     give, applied here to the commit loop that writes those rows.
//
// EVERY DECISION LIVES IN src/lib/release-commit.ts, NOT HERE. Which targets
// to attempt (selectCommitTargets's defensive re-dedupe), how a per-target
// failure is classified (classifyCommitFailure), what the summary says
// (summarizeCommitResults), and how to narrow a rich ReleaseTargetRef down to
// the row-write shape (buildCommitRowInput) are all pure functions imported
// from there and tested independently in node-env vitest - this file is a
// thin, mostly mechanical driver around them plus the actual Canvas/Supabase
// I/O, following requireOwner()/try-catch-returns-error idiom every action in
// this directory already uses (see rubric-bulk.ts, carry-module-pattern.ts).
//
// release-plan.ts IS A SIBLING FILE THIS ACTION IMPORTS FROM AND NEVER
// EDITS. Its `ReleaseTargetRef` (kind, id, moduleId, displayName,
// selectionKey) is the one both this file and the bulk-bar catalog code
// against - see that file's own header, "two sibling agents ... code
// directly against these."
//
// TWO MORE ACTIONS, F11 (cancel and list): cancelScheduledReleaseAction is
// the honest inverse of commit - see its own doc comment below for why
// cancelling must RESTORE the published state commit changed, per F11.1 -
// and listScheduledReleasesAction is the Automations hub's read (F11.4).
// Every DECISION behind cancel (which outcome it produced, whether a restore
// should be attempted, how the result reads) lives in src/lib/release-
// cancel.ts, mirroring release-commit.ts's own split for the commit half.
//
// scheduled-releases.ts (the durable layer - row shape, state machine,
// scheduleRelease/listDueScheduledReleases/...) IS ALSO NOT EDITED BY THIS
// FILE. Its own migration-column guard test
// (scheduled-releases.test.ts, "every write payload key is a real migration
// column") is scoped to 20261008000000_scheduled_releases.sql specifically,
// so widening scheduleRelease's own insert/update payload to carry
// `module_id` (added by 20261009000000_scheduled_releases_module_id.sql)
// would either desync that guard from reality or require editing a test file
// this chunk does not own either. `module_id` is instead written by THIS
// file as an immediate, separate follow-up update on the row scheduleRelease
// just created/reused - see patchScheduledReleaseModuleId below.

import { requireOwner } from "@/lib/supabase/auth";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import {
  scheduleRelease,
  cancelScheduledRelease,
  listScheduledReleasesForUser,
  type ReleaseTargetRef as ScheduledReleaseTargetRef,
  type ScheduledRelease,
} from "@/lib/scheduled-releases";
import { listModules, updateModule, updateModuleItem, type CanvasModule, type CanvasModuleItem } from "@/lib/canvas-modules";
import { fetchAll } from "@/lib/canvas-modules/fetch-helpers";
import { resolveCourse } from "@/lib/canvas-core";
import {
  buildReleasePlanRows,
  validateReleaseInstant,
  type ReleaseTargetRef,
  type ReleaseHideFacts,
  type ReleasePlanRow,
  type ReleasePlanRowInput,
} from "@/lib/release-plan";
import {
  selectCommitTargets,
  classifyCommitFailure,
  describeUnpublishOutcome,
  summarizeCommitResults,
  buildCommitRowInput,
  type CommitTargetOutcome,
  type CommitSummary,
} from "@/lib/release-commit";
import {
  couldNotCancelOutcome,
  shouldAttemptRestore,
  cancelledWithoutRestoreOutcome,
  cancelledAndRestoredOutcome,
  cancelledButRestoreFailedOutcome,
  type CancelReleaseResult,
} from "@/lib/release-cancel";

// ---------------------------------------------------------------------------
// Plan (read-only).
// ---------------------------------------------------------------------------

/** Raw shape read off Canvas's own assignments/quizzes index endpoints - only
 * the two fields this file actually uses. Both endpoints return
 * `unpublishable` on every row by default (no include[] needed), per F4's
 * own citation in docs/scheduled-publishing-from-modules-acceptance-
 * criteria.md ("Canvas exposes `unpublishable` on assignments and quizzes").
 * Fetched here with a raw request (via the same fetchAll/resolveCourse
 * canvas-modules already builds its own endpoints on) rather than through
 * listBulkItems/BulkItem, which does not carry this field and is not this
 * chunk's file to widen. */
interface RawUnpublishableRow {
  id?: number;
  unpublishable?: boolean;
}

/** Canvas's own unpublishable flag for every assignment and every (classic
 * or new) quiz in the course, keyed by the underlying content id - read
 * ONCE per plan call, never once per target (this function's only caller,
 * planScheduledReleaseAction, calls it at most once regardless of how many
 * targets are in the request). Kept as two separate maps (rather than one
 * merged by id) because an assignment id and a quiz id are independent
 * numbering spaces in Canvas - merging them risks one masking the other for
 * the same numeric id. */
async function fetchUnpublishableFlags(
  courseUrl: string,
  code: string | undefined
): Promise<{ assignments: Map<number, boolean>; quizzes: Map<number, boolean> }> {
  const ctx = resolveCourse(courseUrl, code);
  const base = `${ctx.baseUrl}/api/v1/courses/${ctx.courseId}`;
  const [rawAssignments, rawQuizzes] = await Promise.all([
    fetchAll<RawUnpublishableRow>(`${base}/assignments?per_page=100`, ctx),
    fetchAll<RawUnpublishableRow>(`${base}/quizzes?per_page=100`, ctx),
  ]);
  const assignments = new Map<number, boolean>();
  for (const row of rawAssignments) {
    if (typeof row.id === "number" && typeof row.unpublishable === "boolean") assignments.set(row.id, row.unpublishable);
  }
  const quizzes = new Map<number, boolean>();
  for (const row of rawQuizzes) {
    if (typeof row.id === "number" && typeof row.unpublishable === "boolean") quizzes.set(row.id, row.unpublishable);
  }
  return { assignments, quizzes };
}

/** Whether any target in the request is a module_item whose underlying
 * content kind actually exposes `unpublishable` at all (Assignment/Quiz
 * only, per F4) - so an all-module, all-Page, all-Discussion selection never
 * pays for the assignments/quizzes fetch. */
function needsUnpublishableFetch(targets: readonly ReleaseTargetRef[], itemById: Map<number, CanvasModuleItem>): boolean {
  return targets.some((target) => {
    if (target.kind !== "module_item") return false;
    const item = itemById.get(target.id);
    return item !== undefined && (item.type === "Assignment" || item.type === "Quiz");
  });
}

/**
 * Read one target's hide-facts from the already-loaded module tree (and,
 * only for an Assignment/Quiz module_item, the already-fetched unpublishable
 * maps) - never a Canvas call of its own. A module ALWAYS accepts an
 * unpublish (release-plan.ts's own ReleaseHideFacts doc comment: "a module
 * always accepts an unpublish"), so a module target's canUnpublish is always
 * `true` with no lookup. A module_item whose id is no longer present in the
 * tree (moved or deleted since the selection was made) reports both facts as
 * `null` - release-plan.ts's classifyReleaseHideState turns that into
 * "unknown", never a guessed "hideable".
 */
function buildHideFacts(
  target: ReleaseTargetRef,
  moduleById: Map<number, CanvasModule>,
  itemById: Map<number, CanvasModuleItem>,
  unpublishable: { assignments: Map<number, boolean>; quizzes: Map<number, boolean> } | null
): ReleaseHideFacts {
  if (target.kind === "module") {
    const moduleNode = moduleById.get(target.id);
    return { published: moduleNode ? moduleNode.published : null, canUnpublish: true };
  }

  const item = itemById.get(target.id);
  if (!item) return { published: null, canUnpublish: null };

  let canUnpublish: boolean | null = true;
  if (item.type === "Assignment") {
    canUnpublish = item.contentId !== null && unpublishable ? (unpublishable.assignments.get(item.contentId) ?? null) : null;
  } else if (item.type === "Quiz") {
    canUnpublish = item.contentId !== null && unpublishable ? (unpublishable.quizzes.get(item.contentId) ?? null) : null;
  }
  return { published: item.published, canUnpublish };
}

/**
 * Build the per-target review plan (F10's "surfaced before the instructor
 * commits" step). Read-only - never unpublishes, never writes a row.
 * requireOwner() runs exactly once regardless of how many targets are
 * requested; the module tree and the unpublishable maps are each read at
 * most once for the whole call.
 */
/**
 * F11.2: the plan already reads each target's published state to classify
 * hide-ability - this is the exact fact a future cancel needs to restore on,
 * so the plan action hands it back alongside each row rather than making
 * commit re-derive it from hideState (which would be lossy: "unknown" covers
 * both "published state itself unreadable" AND "published=true but
 * canUnpublish unreadable" - the latter case DOES know published was true,
 * and collapsing it through hideState would silently discard that fact).
 * Kept as an inline return-type widening (not a named exported type) because
 * this is a "use server" file and may export only async functions.
 */
export async function planScheduledReleaseAction(input: {
  courseUrl: string;
  code?: string;
  targets: ReleaseTargetRef[];
}): Promise<{ rows: ReleasePlanRow[] } | { error: string }> {
  try {
    await requireOwner();
    if (input.targets.length === 0) return { rows: [] };

    const modules = await listModules(input.courseUrl, input.code);
    const moduleById = new Map(modules.map((moduleNode) => [moduleNode.id, moduleNode]));
    const itemById = new Map<number, CanvasModuleItem>();
    for (const moduleNode of modules) {
      for (const item of moduleNode.items) itemById.set(item.id, item);
    }

    const unpublishable = needsUnpublishableFetch(input.targets, itemById)
      ? await fetchUnpublishableFlags(input.courseUrl, input.code)
      : null;

    const rowInputs: ReleasePlanRowInput[] = input.targets.map((target) => ({
      target,
      facts: buildHideFacts(target, moduleById, itemById, unpublishable),
    }));

    const rows = buildReleasePlanRows(rowInputs);
    // Same order as rowInputs (buildReleasePlanRows/planReleaseRow is a plain
    // .map), so zipping by index is safe.
    // No widening: ReleasePlanRow carries `wasPublished` as a first-class
    // field (F11.2), set by planReleaseRow from the same facts hideState is
    // classified from. It used to be bolted on here, which type-erased at the
    // boundary and left the caller unable to read it - the seam that broke the
    // commit call site.
    return { rows };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not build the release plan." };
  }
}

// ---------------------------------------------------------------------------
// Commit (the only action that writes).
// ---------------------------------------------------------------------------

/**
 * Attempt to unpublish one target on Canvas right now (F4). Never throws
 * upward past its own caller's catch being irrelevant here - callers of THIS
 * function are expected to catch it themselves (see commitOneTarget below)
 * and turn a failure into a `describeUnpublishOutcome`, never into a reason
 * to skip scheduling.
 */
async function unpublishTargetNow(courseUrl: string, code: string | undefined, target: ReleaseTargetRef): Promise<void> {
  if (target.kind === "module") {
    await updateModule(courseUrl, target.id, { published: false }, code);
    return;
  }
  if (typeof target.moduleId !== "number") {
    throw new Error(`"${target.displayName}" has no known owning module, so it could not be unpublished.`);
  }
  await updateModuleItem(courseUrl, target.moduleId, target.id, { published: false }, code);
}

/**
 * Commit one target: unpublish now (failure recorded, never fatal - F10),
 * then write its scheduled_releases row (module_id included, one write).
 * Throws only for the step that DOES gate the outcome - the row write - so
 * the caller's per-target try/catch turns that into this target's own
 * "failed" entry without touching any other target.
 */
async function commitOneTarget(
  supabase: SupabaseClient<Database>,
  userId: string,
  courseUrl: string,
  code: string | undefined,
  courseAcronym: string | null,
  releaseAt: string,
  target: ReleaseTargetRef,
  wasPublished: boolean | null
): Promise<void> {
  try {
    await unpublishTargetNow(courseUrl, code, target);
  } catch (unpublishErr) {
    // F10: a refused or failed unpublish never stops the schedule - the
    // instructor already saw this in the plan review. Recorded (via
    // describeUnpublishOutcome) for potential future logging only.
    describeUnpublishOutcome(unpublishErr);
  }

  // F11.2: wasPublished is the pre-commit published fact the plan already
  // read for this target - carried through so a later cancel can restore on
  // fact, never a guess.
  const rowInput = buildCommitRowInput(target, releaseAt, courseUrl, courseAcronym, wasPublished);
  // One write: scheduleRelease carries module_id (and wasPublished) in its
  // own insert/update.
  await scheduleRelease(supabase, userId, rowInput);
}

/**
 * F4 + F10's commit: for every (defensively re-deduped) target, unpublish it
 * now and schedule its release. Per-target isolation throughout - one
 * target's failure lands in `failed` with its own reason and never aborts
 * the rest (entry 338's "ONE ROW PER TARGET" property, applied to this
 * commit loop). requireOwner() and the release-time validation each run
 * exactly once for the whole call, regardless of how many targets commit.
 */
export async function commitScheduledReleaseAction(input: {
  courseUrl: string;
  code?: string;
  releaseAt: string;
  // F11.2: each target carries the pre-commit published fact the plan
  // already read for it (planScheduledReleaseAction's own widened row -
  // `wasPublished`), so this action can persist it on the row rather than
  // re-reading Canvas or guessing. `wasPublished` is a plain field alongside
  // release-plan.ts's ReleaseTargetRef rather than a change to that shared
  // type, since release-plan.ts is a sibling file this action never edits.
  targets: Array<ReleaseTargetRef & { wasPublished: boolean | null }>;
}): Promise<CommitSummary | { error: string }> {
  try {
    const user = await requireOwner();

    const validation = validateReleaseInstant(input.releaseAt, new Date());
    if (!validation.valid) {
      return { error: validation.reason ?? "The release time is invalid." };
    }

    const targets = selectCommitTargets(input.targets);
    if (targets.length === 0) return { committed: 0, failed: [] };

    const supabase = await createServerSupabaseClient();
    const courseAcronym = input.code ?? null;

    const outcomes: CommitTargetOutcome[] = [];
    for (const target of targets) {
      try {
        await commitOneTarget(
          supabase,
          user.id,
          input.courseUrl,
          input.code,
          courseAcronym,
          input.releaseAt,
          target,
          target.wasPublished
        );
        outcomes.push({ selectionKey: target.selectionKey, status: "committed" });
      } catch (err) {
        outcomes.push({ selectionKey: target.selectionKey, status: "failed", reason: classifyCommitFailure(err) });
      }
    }

    return summarizeCommitResults(outcomes);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not commit the scheduled release(s)." };
  }
}

// ---------------------------------------------------------------------------
// Cancel (F11). The honest inverse of commit: cancelling a pending release
// RESTORES the published state commit changed (F11.1), never merely deletes
// the row. Every DECISION here - which outcome a cancel produced, whether a
// restore should be attempted, how the result reads - lives in
// src/lib/release-cancel.ts and is imported, not re-decided inline; this
// action is the thin I/O driver around those pure functions, mirroring
// commitScheduledReleaseAction's own split against release-commit.ts.

/**
 * Restore one target's visibility on Canvas (the inverse of
 * unpublishTargetNow above). Reuses updateModule/updateModuleItem - no new
 * Canvas wrappers. Never called unless shouldAttemptRestore(wasPublished) is
 * true (F11.2) - a caller that skips that check is not this function's
 * problem to guard against a second time.
 */
async function restoreTargetNow(courseUrl: string, code: string | undefined, target: ScheduledReleaseTargetRef): Promise<void> {
  if (target.kind === "module") {
    await updateModule(courseUrl, target.id, { published: true }, code);
    return;
  }
  if (typeof target.moduleId !== "number") {
    throw new Error("This item's owning module is unknown, so its visibility could not be restored.");
  }
  await updateModuleItem(courseUrl, target.moduleId, target.id, { published: true }, code);
}

/**
 * F11: cancel a pending scheduled release. Returns `CancelReleaseResult`
 * DIRECTLY - never a `{ error: string }` alternative - because the
 * consuming panel (ScheduledReleasesPanel.tsx's `handleCancel`, via
 * scheduledReleasesPanelLogic.ts's `describeCancelOutcome`) calls this with
 * no separate error branch. Every failure mode this action can hit (a lost
 * CAS race, a row that does not exist, an unexpected exception) is therefore
 * modeled as the "could-not-cancel" case with an honest `reason`.
 *
 * ORDER MATTERS, and it is deliberate: (1) CAS pending -> cancelled via
 * cancelScheduledRelease FIRST - its own result carries the row (with
 * target/course/wasPublished) on success, and the row's CURRENT state on a
 * lost race, so there is no separate read needed before it, and NEVER a
 * restore attempt against a row this call did not win the race for; (2) only
 * once the CAS is won, decide whether to restore (shouldAttemptRestore over
 * the row's persisted wasPublished - `null` means "written before this
 * column existed", cancelled WITHOUT a restore attempt, and said so, never
 * guessed).
 *
 * A restore failure AFTER a successful cancel is reported as its OWN outcome
 * (cancelledButRestoreFailedOutcome - `status: "cancelled-without-restore"`,
 * the failure folded into `reason`), never as "could-not-cancel" - the row IS
 * cancelled at that point, and entry 340 already recorded why conflating an
 * unrelated write's failure with the write that gates the outcome is a real
 * defect, not a nicety.
 */
export async function cancelScheduledReleaseAction(input: { id: string }): Promise<CancelReleaseResult> {
  try {
    const user = await requireOwner();
    const supabase = await createServerSupabaseClient();
    const now = new Date();

    const result = await cancelScheduledRelease(supabase, user.id, input.id, now);
    if (!result.cancelled || !result.release) {
      // F11.3: a lost race (already claimed, or already terminal), or no
      // such row at all - reported honestly via the row's own current
      // status (or null if it does not exist), never a silent no-op.
      return couldNotCancelOutcome(result.release?.status ?? null);
    }

    const release: ScheduledRelease = result.release;
    if (!shouldAttemptRestore(release.wasPublished)) {
      // F11.2: wasPublished false (nothing to restore) or null (cannot tell,
      // never guess) - the row is cancelled either way, without an attempt.
      return cancelledWithoutRestoreOutcome(release.wasPublished);
    }

    try {
      await restoreTargetNow(release.courseUrl, release.courseAcronym ?? undefined, release.target);
      return cancelledAndRestoredOutcome();
    } catch (restoreErr) {
      // The cancel already succeeded (the CAS was won above) - a restore
      // failure here must never be reported as a failed cancel.
      return cancelledButRestoreFailedOutcome(classifyCommitFailure(restoreErr));
    }
  } catch (err) {
    // An unexpected exception (auth failure, database error) - still modeled
    // as "could-not-cancel" rather than a separate error shape, per this
    // function's own doc comment.
    return { status: "could-not-cancel", reason: err instanceof Error ? err.message : "Could not cancel the scheduled release." };
  }
}

// ---------------------------------------------------------------------------
// List (F11.4/F11.5): the Automations hub's read of every scheduled release
// this instructor owns. Returns the raw rows - ScheduledReleasesPanel.tsx and
// its scheduledReleasesPanelLogic.ts (sibling UI files, written concurrently)
// derive every displayed fact (target label, course label, locale-formatted
// instant, status text, restore preview) directly from `ScheduledRelease`'s
// own fields via their own pure functions, so this action is a thin
// pass-through - no separate row-shaping type to keep in sync with theirs.
export async function listScheduledReleasesAction(): Promise<{ releases: ScheduledRelease[] } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = await createServerSupabaseClient();
    const releases = await listScheduledReleasesForUser(supabase, user.id);
    return { releases };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load scheduled releases." };
  }
}
