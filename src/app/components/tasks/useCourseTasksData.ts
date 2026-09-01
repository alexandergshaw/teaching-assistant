"use client";

// Data hook for the Tasks tab: loads the owner's courses, per-course task
// status maps, and per-user task-definition overrides, and exposes the
// write operations the grid needs (single-cell edit, per-course bulk patch,
// task-definition save/delete).
//
// Deliberately does NOT reuse useCoursesData (src/app/components/courses/
// useCoursesData.ts) - that hook also fires listFinalizedSyllabiAction,
// listMyOrgsAction, listSyllabusTemplatesAction, listGithubReposAction,
// getGoogleCalendarStatusAction, and one getCourseNotificationsAction PER
// COURSE (N live Canvas calls). This tab needs courses and nothing else, so
// it calls listCourseHubAction directly and maps down to the small
// structural TaskRowCourse shape course-tasks-view.ts already defines,
// rather than carrying the app's full Course type (and its own bundle
// weight) any further than this hook.
//
// Every course_tasks.statuses value is untrusted jsonb - see
// coerceTaskCellMap's own doc comment in course-tasks.ts. It is coerced on
// every read, WITHOUT a knownIds filter (amendment 120 in
// AC-tasks-tab-AMENDMENTS.md): filtering by the resolved catalog's ids here
// would silently drop a retired task's history the next time the row is
// saved, which is exactly the data loss AC9 item 46 forbids.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  listCourseHubAction,
  listCourseTasksAction,
  setCourseTaskCellsAction,
  listCourseTaskDefsAction,
  saveCourseTaskDefAction,
  saveCourseTaskDefsAction,
  deleteCourseTaskDefAction,
} from "@/app/actions";
// Not re-exported through the "@/app/actions" barrel (src/app/actions.ts) -
// that file is out of this wave's file budget (docs/task-institution-
// instructions-acceptance-criteria.md's file list), so this imports the
// action module directly, same as any other "use server" module this repo
// calls without going through actions.ts.
import { listTaskInstructionsAction, saveTaskInstructionAction } from "@/app/actions/task-institution-instructions";
// Not re-exported through the "@/app/actions" barrel either (same reason as
// the instructions import above) - docs/task-cell-attachments-acceptance-
// criteria.md AC4 item 18.
import { listTaskAttachmentsAction } from "@/app/actions/course-task-attachments";
import { indexTaskAttachments, type TaskAttachmentIndex } from "@/lib/course-task-attachments";
import type { CourseTaskDef } from "@/lib/supabase/course-tasks";
import {
  coerceTaskCellMap,
  applyTaskCell,
  isEmptyTaskCell,
  type TaskCadence,
  type TaskCell,
  type TaskCellMap,
  type TaskGroupId,
  type TaskView,
} from "@/lib/course-tasks";
import { buildTaskInstructionMap, type TaskInstructionMap } from "@/lib/task-institution-instructions";
import { applyInstructionEdit } from "./taskInstructionEdit";
import type { TaskCatalogOverride, TaskRowCourse } from "@/lib/course-tasks-view";
import { registerOwnerScopedCache } from "@/lib/workflows/run-form-options-cache";

const EMPTY_CELL_MAP: TaskCellMap = Object.freeze({}) as TaskCellMap;
// AC3 item 11: TaskInstructionMap is keyed by taskInstructionMapKey, which
// this hook never builds itself - buildTaskInstructionMap (below) is the
// only place a listTaskInstructionsAction row becomes a map entry.
const EMPTY_INSTRUCTION_MAP: TaskInstructionMap = Object.freeze({}) as TaskInstructionMap;
// docs/task-cell-attachments-acceptance-criteria.md AC4 item 18: indexed the
// same way EMPTY_INSTRUCTION_MAP is above - a frozen, empty index every
// cell's taskAttachmentsAt lookup already treats as "no attachments"
// (course-task-attachments.ts's own "absence reads as empty" convention).
// Object.freeze({}), the SAME shape EMPTY_INSTRUCTION_MAP uses, not the
// null-prototype object coerceTaskCellMap builds (course-tasks.ts) - this one
// still carries Object.prototype. Harmless: every real key comes from
// taskAttachmentKey and always contains a colon, which no inherited
// Object.prototype property name ever does, so a lookup can never
// accidentally resolve one.
const EMPTY_ATTACHMENT_INDEX: TaskAttachmentIndex = Object.freeze({}) as TaskAttachmentIndex;

const VALID_VIEWS: ReadonlySet<string> = new Set<TaskView>(["term", "recurring"]);
const VALID_GROUPS: ReadonlySet<string> = new Set<TaskGroupId>(["dependent", "independent", "daily", "weekly"]);
const VALID_CADENCES: ReadonlySet<string> = new Set<TaskCadence>(["once", "daily", "weekly"]);

/**
 * Converts the loosely-typed persistence row (CourseTaskDef - view/group/
 * cadence are plain `string`/`string | null`, since that is all the jsonb-
 * agnostic supabase layer knows) into the app's own validated
 * TaskCatalogOverride shape that resolveTaskCatalog (course-tasks-view.ts)
 * expects. A value that does not name a real TaskView/TaskGroupId/
 * TaskCadence becomes null rather than being force-cast - resolveTaskCatalog
 * already treats a null/non-matching override field as "no override", so a
 * corrupted or hand-edited def row degrades to the built-in default instead
 * of throwing or silently miscategorizing a task.
 */
function toOverride(def: CourseTaskDef): TaskCatalogOverride {
  return {
    taskId: def.taskId,
    view: VALID_VIEWS.has(def.view) ? (def.view as TaskView) : null,
    group: VALID_GROUPS.has(def.group) ? (def.group as TaskGroupId) : null,
    label: def.label,
    cadence: def.cadence && VALID_CADENCES.has(def.cadence) ? (def.cadence as TaskCadence) : null,
    position: def.position,
    retired: def.retired,
    custom: def.custom,
  };
}

/** The inverse of toOverride, for the one call site (saveDef) that writes a
 * def back to the server - the persistence row always needs a concrete
 * view/group string (even though the in-memory override may carry null for
 * "no change from the built-in"), so callers of saveDef must supply the
 * task's real view/group either way. */
function fromOverride(override: TaskCatalogOverride): CourseTaskDef {
  return {
    taskId: override.taskId,
    view: override.view ?? "",
    group: override.group ?? "",
    label: override.label,
    cadence: override.cadence,
    position: override.position,
    retired: override.retired,
    custom: override.custom,
  };
}

export interface WriteResult {
  ok: boolean;
  error?: string;
}

export interface UseCourseTasksDataReturn {
  courses: TaskRowCourse[];
  /** Every course's cell map, coerced. A course with no stored row (or not
   * yet loaded) reads as an empty map - taskCellAt already treats a missing
   * key as EMPTY_TASK_CELL, so callers never need to special-case this. */
  cellsByCourse: Record<string, TaskCellMap>;
  overrides: TaskCatalogOverride[];
  /**
   * Per-(institution, task) instruction text (AC3 item 12 - docs/task-
   * institution-instructions-acceptance-criteria.md): loaded ONCE per Tasks
   * tab mount alongside courses/cells/overrides, scoped to the signed-in
   * user - never per row, never per cell. Keyed by taskInstructionMapKey;
   * callers resolve a single value through resolveTaskInstruction
   * (src/lib/task-institution-instructions.ts) rather than reading this map
   * directly, so the institution-casing normalization (AC2 item 6) always
   * happens at the point of lookup.
   */
  instructions: TaskInstructionMap;
  /**
   * Per-cell attachment index (docs/task-cell-attachments-acceptance-
   * criteria.md AC4 item 18): loaded ONCE per Tasks tab mount, in the SAME
   * Promise.all as courses/cells/defs/instructions - never per course, per
   * row or per cell, the identical posture `instructions` above already
   * documents. Keyed by taskAttachmentKey; callers resolve one cell's list
   * through taskAttachmentsAt (src/lib/course-task-attachments.ts) rather
   * than reading this map directly.
   */
  attachments: TaskAttachmentIndex;
  /**
   * Saves (or, given a blank body, deletes) one (institution, task)
   * instruction (docs/task-institution-instructions-acceptance-criteria.md
   * AC5 items 23/25/26). Optimistic with revert on failure, following
   * `setCell` below exactly - the only difference is that ONE edit here
   * fans out to every row at that institution's display, rather than a
   * single cell's, since `instructions` is a flat map every row reads from.
   */
  setInstruction: (institution: string, taskId: string, body: string) => Promise<WriteResult>;
  state: "loading" | "idle" | "error";
  refreshing: boolean;
  error: string | null;
  reload: (opts?: { silent?: boolean }) => Promise<void>;
  /**
   * Sets one (course, task) cell. Optimistic: the local map updates
   * immediately, and reverts to the prior value if the save fails. Writes
   * for the SAME course are serialized (see runSerialized below); writes for
   * different courses run concurrently.
   */
  setCell: (courseId: string, taskId: string, nextCell: TaskCell) => Promise<WriteResult>;
  /**
   * Applies a patch of several cells to ONE course in a single round trip
   * (AC6 item 32) - used for "set every visible task in this row" and as the
   * per-course primitive bulk column-set/fill-down call each course through.
   * `null` deletes a key (matching applyTaskCell/mergeStatusMap's own
   * "null deletes" convention).
   */
  setCourseCells: (courseId: string, patch: Record<string, TaskCell | null>) => Promise<WriteResult>;
  saveDef: (override: TaskCatalogOverride) => Promise<WriteResult>;
  /**
   * Bulk-saves several overrides in ONE upsert (tasks-column-reorder AC2
   * items 6/9) - a column reorder's whole-group renumbering, applied
   * optimistically and rolled back AS A UNIT (never per-row) if the write
   * fails, so a partial reorder can never land in local state even though
   * the server-side write already lands atomically via
   * upsertCourseTaskDefs.
   */
  saveDefs: (overrides: TaskCatalogOverride[]) => Promise<WriteResult>;
  deleteDef: (taskId: string) => Promise<WriteResult>;
}

/**
 * Serializes writes to the SAME course onto a private per-course promise
 * chain (a Map<courseId, Promise<unknown>>), so at most one
 * setCourseTaskCellsAction request per course is ever in flight - closing
 * the gap AC5 item 29's server-side read-merge-write leaves open on its own:
 * two requests for the SAME course in flight at once can still interleave
 * (read A, read B, write A, write B), and B's write would carry a map that
 * predates A's. Writes for DIFFERENT courses are NOT serialized against each
 * other - each gets its own chain entry, so a bulk column-set across 30
 * courses still fires 30 concurrent requests rather than crawling through
 * them one at a time.
 *
 * Residual, documented rather than silently left unfixed (amendment 134):
 * this only serializes requests issued by THIS hook instance. Two browser
 * tabs (or two instances of this app) editing the SAME course in the same
 * instant can still last-write-wins on the overlapping keys, because each
 * tab runs its own independent chain against the server's read-merge-write.
 * That is acceptable here - a single-owner app, and the loser is one cell -
 * and closing it fully would need an atomic jsonb merge statement in SQL
 * (e.g. Postgres's `statuses || patch`), not a client-side queue.
 */
function useWriteChain() {
  const chainRef = useRef<Map<string, Promise<unknown>>>(new Map());
  return useCallback(<T,>(courseId: string, fn: () => Promise<T>): Promise<T> => {
    const chain = chainRef.current;
    const prior = chain.get(courseId) ?? Promise.resolve();
    const run = prior.then(fn, fn);
    // The stored tail never rejects, so a failed write never poisons the
    // NEXT write queued for this course - only the caller of THIS write
    // (via the returned `run`) sees its rejection/error.
    chain.set(
      courseId,
      run.then(
        () => undefined,
        () => undefined
      )
    );
    return run;
  }, []);
}

let hubCache: {
  courses: TaskRowCourse[];
  cellsByCourse: Record<string, TaskCellMap>;
  overrides: TaskCatalogOverride[];
  instructions: TaskInstructionMap;
  attachments: TaskAttachmentIndex;
} | null = null;

// OWNERSHIP - this Map-shaped cache is module-scope, so (like
// run-form-options-cache.ts's Map, regression entry 189) it survives a
// client-side sign-out: TopBar.tsx's handleSignOut is signOut() followed by
// router.refresh()/router.push("/login"), neither of which tears down the
// JS module registry. Without this, user B signing in in the same tab would
// mount straight from user A's cached courses/task-status/overrides for one
// round trip, until the effect below reloads. Registered with
// run-form-options-cache.ts's setCacheOwner chokepoint - the SAME mechanism
// entry 189 introduced - rather than a second, parallel invalidation scheme:
// one setCacheOwner call (from every auth event in SupabaseProvider.tsx) now
// clears both caches. Called once, at module scope, never from inside the
// hook body below (see registerOwnerScopedCache's own doc comment for why).
registerOwnerScopedCache(() => {
  hubCache = null;
});

export function useCourseTasksData(): UseCourseTasksDataReturn {
  const [courses, setCourses] = useState<TaskRowCourse[]>(() => hubCache?.courses ?? []);
  const [cellsByCourse, setCellsByCourse] = useState<Record<string, TaskCellMap>>(() => hubCache?.cellsByCourse ?? {});
  const [overrides, setOverrides] = useState<TaskCatalogOverride[]>(() => hubCache?.overrides ?? []);
  const [instructions, setInstructions] = useState<TaskInstructionMap>(() => hubCache?.instructions ?? EMPTY_INSTRUCTION_MAP);
  const [attachments, setAttachments] = useState<TaskAttachmentIndex>(() => hubCache?.attachments ?? EMPTY_ATTACHMENT_INDEX);
  const [state, setState] = useState<"loading" | "idle" | "error">(hubCache ? "idle" : "loading");
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runSerialized = useWriteChain();

  const reload = useCallback(async (opts?: { silent?: boolean }) => {
    if (opts?.silent) setRefreshing(true);
    else setState("loading");

    // AC3 item 12 / docs/task-cell-attachments-acceptance-criteria.md AC4
    // item 18: fetched in the SAME Promise.all as courses/cells/defs, so
    // instructions and attachments both load once per mount alongside the
    // rest of the tab's data rather than on a separate round trip.
    const [coursesResult, tasksResult, defsResult, instructionsResult, attachmentsResult] = await Promise.all([
      listCourseHubAction(),
      listCourseTasksAction(),
      listCourseTaskDefsAction(),
      listTaskInstructionsAction(),
      listTaskAttachmentsAction(),
    ]);

    if ("error" in coursesResult) {
      setRefreshing(false);
      // SHOULD 8 (Tasks-tab UX audit): a SILENT reload (the mount effect
      // below when hubCache is already warm, or the attachments dialog's
      // onChanged) used to fail completely silently on this branch - it
      // returned without ever calling setState or setError, so an
      // instructor reading cached data over a dead network got no
      // indication at all that anything was wrong. `error` is now recorded
      // either way; only a NON-silent reload also flips `state` to "error"
      // (which would otherwise replace the whole tab's content with the
      // error banner - wrong for a background refresh that still has good
      // stale data to show). taskLoadState.ts's errorBannerText is what
      // turns this into the right banner wording for each case.
      setError(coursesResult.error);
      if (!opts?.silent) {
        setState("error");
      }
      return;
    }

    const nextCourses: TaskRowCourse[] = coursesResult.courses.map((c) => ({
      id: c.id,
      name: c.name,
      institution: c.institution,
      term: c.term,
    }));

    const nextCells: Record<string, TaskCellMap> = {};
    if (!("error" in tasksResult)) {
      for (const record of tasksResult.records) {
        nextCells[record.courseId] = coerceTaskCellMap(record.statuses);
      }
    }

    const nextOverrides: TaskCatalogOverride[] = "error" in defsResult ? [] : defsResult.defs.map(toOverride);

    // A failed instructions fetch degrades to "no instructions this load" -
    // same posture as a failed defsResult above - rather than failing the
    // whole tab; a missing instruction is never an error condition (A4), so
    // silently showing zero of them on a transient failure is consistent
    // with that, not a data-loss risk (nothing here is ever written from
    // this map).
    const nextInstructions: TaskInstructionMap =
      "error" in instructionsResult ? EMPTY_INSTRUCTION_MAP : buildTaskInstructionMap(instructionsResult.instructions);

    // A failed attachments fetch degrades to "no attachments this load" -
    // the identical posture nextInstructions above takes on its own failure
    // - rather than failing the whole tab; the fetched rows are indexed and
    // stored, never dropped, on the success path (docs/task-cell-
    // attachments-acceptance-criteria.md AC4 item 18).
    const nextAttachments: TaskAttachmentIndex =
      "error" in attachmentsResult ? EMPTY_ATTACHMENT_INDEX : indexTaskAttachments(attachmentsResult.attachments);

    hubCache = {
      courses: nextCourses,
      cellsByCourse: nextCells,
      overrides: nextOverrides,
      instructions: nextInstructions,
      attachments: nextAttachments,
    };
    setCourses(nextCourses);
    setCellsByCourse(nextCells);
    setOverrides(nextOverrides);
    setInstructions(nextInstructions);
    setAttachments(nextAttachments);
    setState("idle");
    setRefreshing(false);
    setError(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await reload({ silent: hubCache != null });
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const setCell = useCallback(
    async (courseId: string, taskId: string, nextCell: TaskCell): Promise<WriteResult> => {
      const previousMap = cellsByCourse[courseId] ?? EMPTY_CELL_MAP;
      const previousCell = previousMap[taskId] ?? null;

      setCellsByCourse((prev) => ({
        ...prev,
        [courseId]: applyTaskCell(prev[courseId] ?? EMPTY_CELL_MAP, taskId, nextCell),
      }));

      const patchValue = isEmptyTaskCell(nextCell) ? null : nextCell;
      const result = await runSerialized(courseId, () => setCourseTaskCellsAction(courseId, { [taskId]: patchValue }));

      if ("error" in result) {
        // Revert: restore exactly the prior cell (or delete the key if there
        // was none) rather than the whole map, so a revert here can never
        // clobber a different cell edited in the meantime.
        setCellsByCourse((prev) => ({
          ...prev,
          [courseId]: applyTaskCell(prev[courseId] ?? EMPTY_CELL_MAP, taskId, previousCell ?? { status: "open", note: "", doneAt: null }),
        }));
        return { ok: false, error: result.error };
      }
      return { ok: true };
    },
    [cellsByCourse, runSerialized]
  );

  const setCourseCells = useCallback(
    async (courseId: string, patch: Record<string, TaskCell | null>): Promise<WriteResult> => {
      const previousMap = cellsByCourse[courseId] ?? EMPTY_CELL_MAP;

      setCellsByCourse((prev) => {
        let map = prev[courseId] ?? EMPTY_CELL_MAP;
        for (const [taskId, cell] of Object.entries(patch)) {
          map = applyTaskCell(map, taskId, cell ?? { status: "open", note: "", doneAt: null });
        }
        return { ...prev, [courseId]: map };
      });

      const serverPatch: Record<string, unknown | null> = {};
      for (const [taskId, cell] of Object.entries(patch)) {
        serverPatch[taskId] = cell && !isEmptyTaskCell(cell) ? cell : null;
      }

      const result = await runSerialized(courseId, () => setCourseTaskCellsAction(courseId, serverPatch));

      if ("error" in result) {
        setCellsByCourse((prev) => ({ ...prev, [courseId]: previousMap }));
        return { ok: false, error: result.error };
      }
      return { ok: true };
    },
    [cellsByCourse, runSerialized]
  );

  /**
   * AC5 items 23/25/26: optimistic with revert on failure, mirroring
   * setCell/setCourseCells above exactly - the only real difference is what
   * gets updated: `instructions` is ONE flat map every row's cell resolves
   * its own instruction from (TaskGridRow, via resolveTaskInstruction), so
   * one call here changes what every course at `institution` shows in
   * `taskId`'s column at once, not a single row's own data. The pure
   * optimistic-update math (delete on blank, trim+cap otherwise) lives in
   * applyInstructionEdit (taskInstructionEdit.ts) rather than inline here,
   * so it is unit-testable without rendering this hook.
   */
  const setInstruction = useCallback(async (institution: string, taskId: string, body: string): Promise<WriteResult> => {
    const previous = hubCache?.instructions ?? EMPTY_INSTRUCTION_MAP;

    setInstructions((prev) => {
      const next = applyInstructionEdit(prev, institution, taskId, body);
      if (hubCache) hubCache = { ...hubCache, instructions: next };
      return next;
    });

    const result = await saveTaskInstructionAction(institution, taskId, body);
    if ("error" in result) {
      // Reverted to the exact pre-edit snapshot, never silently - the
      // caller (TasksTab.tsx) is the one that surfaces `result.error`
      // through the shared live region (AC5 item 26).
      setInstructions(previous);
      if (hubCache) hubCache = { ...hubCache, instructions: previous };
      return { ok: false, error: result.error };
    }
    return { ok: true };
  }, []);

  const saveDef = useCallback(async (override: TaskCatalogOverride): Promise<WriteResult> => {
    const previous = hubCache?.overrides ?? [];
    setOverrides((prev) => {
      const next = prev.filter((o) => o.taskId !== override.taskId);
      next.push(override);
      if (hubCache) hubCache = { ...hubCache, overrides: next };
      return next;
    });

    const result = await saveCourseTaskDefAction(fromOverride(override));
    if ("error" in result) {
      setOverrides(previous);
      if (hubCache) hubCache = { ...hubCache, overrides: previous };
      return { ok: false, error: result.error };
    }
    return { ok: true };
  }, []);

  const saveDefs = useCallback(async (overrides: TaskCatalogOverride[]): Promise<WriteResult> => {
    if (overrides.length === 0) return { ok: true };
    const previous = hubCache?.overrides ?? [];
    setOverrides((prev) => {
      // Merge by taskId (each assignment replaces any prior override for
      // that task, the rest of the list is untouched) - a group reorder
      // touches every task in the group in one state update, not one
      // setOverrides call per task.
      const byId = new Map(prev.map((o) => [o.taskId, o] as const));
      for (const o of overrides) byId.set(o.taskId, o);
      const next = [...byId.values()];
      if (hubCache) hubCache = { ...hubCache, overrides: next };
      return next;
    });

    const result = await saveCourseTaskDefsAction(overrides.map(fromOverride));
    if ("error" in result) {
      // AC2 item 9: rolled back AS A UNIT - the whole pre-write snapshot,
      // never a per-task revert, so a failed group reorder can never leave
      // local state half-applied even though only some rows may have
      // actually failed server-side.
      setOverrides(previous);
      if (hubCache) hubCache = { ...hubCache, overrides: previous };
      return { ok: false, error: result.error };
    }
    return { ok: true };
  }, []);

  const deleteDef = useCallback(async (taskId: string): Promise<WriteResult> => {
    const previous = hubCache?.overrides ?? [];
    setOverrides((prev) => {
      const next = prev.filter((o) => o.taskId !== taskId);
      if (hubCache) hubCache = { ...hubCache, overrides: next };
      return next;
    });

    const result = await deleteCourseTaskDefAction(taskId);
    if ("error" in result) {
      setOverrides(previous);
      if (hubCache) hubCache = { ...hubCache, overrides: previous };
      return { ok: false, error: result.error };
    }
    return { ok: true };
  }, []);

  return {
    courses,
    cellsByCourse,
    overrides,
    instructions,
    attachments,
    setInstruction,
    state,
    refreshing,
    error,
    reload,
    setCell,
    setCourseCells,
    saveDef,
    saveDefs,
    deleteDef,
  };
}
