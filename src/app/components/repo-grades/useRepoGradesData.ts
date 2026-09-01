"use client";

// Repo Grades view - AC3 items 12, 16, 17, 18 (docs/repo-grades-view-acceptance-criteria.md).
// Owns every piece of data this view needs: the owner's course tiles
// (listCourseHubAction), the chosen tile's GitHub org scan
// (loadOrgRepoTreesAction, which already does the bounded-concurrency,
// per-repo-isolated, rate-limit-classified work - AC3 items 17a-17c - inside
// scanOrgRepoTrees), and that tile's Canvas roster (listCourseRosterAction),
// plus the one write path that accepts a binding (AC2 item 10).
//
// Follows this codebase's data idiom exactly, per the wave brief's pointer to
// src/app/components/ContentTab.tsx:134-155: a useEffect with a `let
// cancelled = false`, an async IIFE that AWAITS FIRST, an `if (cancelled)
// return` guard, and cleanup setting `cancelled = true`. Crucially, this
// means no effect below may call setState SYNCHRONOUSLY before its first
// await - eslint's react-hooks/set-state-in-effect forbids exactly that (see
// AGENTS memory: set-state-in-effect-idiom.md). Loading state is therefore
// never a separate setLoading(true) call; it is DERIVED by comparing "the key
// of the request currently in flight" against "the key the last completed
// result belongs to", the same pattern
// src/app/components/artifact-design/hooks.ts's useArtifactTemplates already
// uses (loadedKind !== kind), generalized here to a composite key so a course
// switch, an org-prefix edit, or a manual reload all correctly restart the
// derived-loading state without any effect ever writing "loading" itself.
import { useEffect, useState } from "react";
import {
  listAssignmentTextSubmissionsAction,
  listCourseAssignmentsAction,
  listCourseHubAction,
  listCourseRosterAction,
  loadOrgRepoTreesAction,
  updateCourseHubAction,
} from "@/app/actions";
import type { Course, CourseStudentRepo } from "@/lib/supabase/courses";
import { courseToInput } from "@/lib/courses-tab-helpers";
import { parseCanvasCourseId } from "@/lib/canvas-url";
import type { OrgRepoTreesResult } from "@/lib/repo-grade-tree-scan";
import type { RepoBindingRosterEntry } from "@/lib/repo-student-bindings";
import { useSupabase } from "@/context/SupabaseProvider";
// lmsRenderSourcesFor is the SAME "does this course tile actually have a live
// Canvas connection / a stored export" gate useLmsAssignmentPull.ts already
// uses (courses-table-helpers.ts, not the similarly-named courses-tab-
// helpers.ts above) - reused here rather than re-derived so the export-
// assignments load below makes no request, and reports no error, for a
// course with no stored export at all, exactly like that hook's own
// exportKey does.
import { lmsRenderSourcesFor } from "@/lib/courses-table-helpers";
import { readExportCourseContentById, type ExportCourseContent } from "@/lib/lms-export-source";
import { exportAssignmentOptions } from "@/lib/lms-export-source/export-assignments";
// overlayRosterUsernames folds the Courses tab's hand-maintained roster text
// (course.roster, "Student Name | username" per line) onto studentRepos -
// see effectiveStudentRepos/rosterOverlay below for why this is the point of
// the wave. buildRepoGradeAssignmentOptions merges the live Canvas
// assignment list with the export's flattened assignment items into one
// picker-ready list (item 4 below).
import { overlayRosterUsernames, type RosterUsernameOverlayResult } from "./rosterUsernameOverlay";
import { buildRepoGradeAssignmentOptions, type RepoGradeAssignmentOption } from "./repoGradesAssignmentSources";
// Type-only import (erased at build time - safe from a "use client" module
// even though src/lib/canvas/listings.ts, where CanvasAssignmentBrief is
// actually defined, is only ever reached at runtime through the "use server"
// listCourseAssignmentsAction above). Matches how `Course` above is imported
// the same way from src/lib/supabase/courses.ts.
import type { CanvasAssignmentBrief } from "@/lib/canvas";
import { applyRepoGradeBinding } from "./repoGradesRows";
// buildRosterUpdate is the exact merge the "Link GitHub usernames to roster"
// workflow step (steps.course-setup.rosters.ts:70-173) uses to fold accepted
// {student, canvasUserId, username} submissions into studentRepos/roster -
// reused here rather than re-implemented so the two entry points (the
// workflow step and this view) can never drift on dedup/disambiguation/merge
// rules. partitionGithubUsernameSubmissions is the sibling pure formatter
// that turns raw Canvas text submissions into that same ok/ambiguous split
// (mirroring the workflow step's own extractGithubHandle loop).
import { buildRosterUpdate } from "@/lib/workflows/roster-merge";
import { partitionGithubUsernameSubmissions, type LinkUsernamesOutcome } from "./linkRepoUsernames";

interface KeyedResult<T> {
  key: string;
  data: T;
  error: string | null;
}

/** courses: loaded once on mount, no key needed - `null` means "the mount
 * effect has not resolved yet", which is the only "loading" state possible
 * for a fetch with no parameters to key on. */
function useCourses(): { courses: Course[]; loading: boolean; error: string | null; setCourses: (updater: (prev: Course[]) => Course[]) => void } {
  const [result, setResult] = useState<{ data: Course[]; error: string | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await listCourseHubAction();
      if (cancelled) return;
      if ("error" in res) {
        setResult({ data: [], error: res.error });
      } else {
        setResult({ data: res.courses, error: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setCourses = (updater: (prev: Course[]) => Course[]) => {
    setResult((prev) => (prev ? { ...prev, data: updater(prev.data) } : prev));
  };

  return { courses: result?.data ?? [], loading: result === null, error: result?.error ?? null, setCourses };
}

export interface UseRepoGradesDataResult {
  courses: Course[];
  coursesLoading: boolean;
  coursesError: string | null;
  course: Course | null;
  scan: OrgRepoTreesResult | null;
  scanLoading: boolean;
  scanError: string | null;
  roster: RepoBindingRosterEntry[];
  rosterLoading: boolean;
  rosterError: string | null;
  /** The course's Canvas assignments, for the per-column assignment mapping
   * picker (AC5 items 25-26). Loaded the same way the roster is - keyed on
   * institution + the Canvas course id parsed from the tile's canvasUrl - so
   * both share the exact same "not configured yet" degradation instead of
   * two different guards drifting apart. */
  assignments: CanvasAssignmentBrief[];
  assignmentsLoading: boolean;
  assignmentsError: string | null;
  /**
   * U4.19d/19e - non-null exactly when `rosterKey`/`assignmentsKey` above are
   * both null (the SAME institution+canvasCourseId gate, never a wider one),
   * naming which of the three causes applies - no institution, no Canvas
   * URL, or a Canvas URL with no `/courses/<id>` in it - and, in one place,
   * every consequence: the assignment picker stays empty, the roster stays
   * empty (which is what makes RepoBindingControl.tsx's student picker read
   * "No roster loaded"), and posting is unreachable (no way to reach a
   * CONFIRMED binding with a numeric Canvas user id). Purely derived from
   * `course`/`institution`/`canvasUrl`/`canvasCourseId` on every render,
   * never stored, so it can never go stale relative to the tile actually
   * selected - the same reasoning `liveLinkBlockedReason` below already
   * documents for itself.
   */
  canvasGateBlockedReason: string | null;
  /**
   * `overlayRosterUsernames(course.studentRepos, course.roster).rows` -
   * computed on every render (pure, cheap, no I/O) rather than stored, so it
   * can never go stale relative to the tile actually selected. THIS IS THE
   * POINT OF THIS WAVE: index.tsx feeds THIS - not `course.studentRepos` -
   * into `buildRepoGradeGridModel` as the binder's `stored` input, so the
   * GitHub usernames an instructor already typed into the Courses tab's
   * Roster tile (course.roster, a plain "Student Name | username" text field
   * with no Canvas dependency) finally reach tier 1 of
   * `suggestRepoStudentBindings`'s match instead of being invisible to it.
   * `course.studentRepos` itself is never mutated to produce this - see the
   * comment on `rosterOverlay` below for why both derive from ONE overlay
   * call.
   */
  effectiveStudentRepos: CourseStudentRepo[];
  /**
   * The full result of the SAME overlay call `effectiveStudentRepos` reads
   * `.rows` from - computed exactly once per render, never called twice, so
   * the two can never disagree. Lets the panel report matched/added/
   * withoutCanvasId/conflicts honestly instead of just silently swapping in
   * different rows.
   */
  rosterOverlay: RosterUsernameOverlayResult;
  /**
   * Persists `rosterOverlay.rows` onto the tile's `studentRepos` - the same
   * `updateCourseHubAction(course.id, {...courseToInput(course),
   * studentRepos: ...})` / `setCourses` write shape `acceptBinding`,
   * `confirmSuggestedBindings`, and `linkGithubUsernames` all use. Makes NO
   * Canvas call anywhere in its body and is never gated on
   * `liveLinkBlockedReason`: unlike `linkGithubUsernames` below, this reads
   * only `course.roster`, a plain instructor-typed field, so it must work for
   * a tile with no institution and no Canvas URL at all - that is the entire
   * requirement this function exists to satisfy. Never writes `course.roster`
   * itself back - that text stays the instructor's own field; this only
   * fills in the studentRepos the roster's usernames were missing from.
   * Returns `{ error }` (never throws) when there is no course selected, or
   * when the overlay found nothing new to add (`matched === 0 && added ===
   * 0`), naming the Courses tab Roster tile as where to add usernames.
   */
  linkFromCourseRoster: () => Promise<
    { matched: number; added: number; withoutCanvasId: number; conflicts: string[] } | { error: string }
  >;
  /**
   * The course's live Canvas assignments and its saved export's assignment-
   * like module items, merged into one picker list by
   * `buildRepoGradeAssignmentOptions` (repoGradesAssignmentSources.ts). The
   * export half needs no student roster at all (an export carries no
   * students - see `exportAssignmentsLoading`/`exportAssignmentsError`
   * below), which is exactly why it can offer assignments a tile with no
   * Canvas roster still cannot get from `assignments` above.
   */
  assignmentOptions: RepoGradeAssignmentOption[];
  /**
   * Derived-loading for the export-content load feeding `assignmentOptions`'
   * export half - same "request key vs. last-completed key" idiom every
   * other load in this file uses (see the file header comment). `false`
   * whenever the chosen course has no stored export at all
   * (`lmsRenderSourcesFor(course).export` is false), since that case makes no
   * request in the first place.
   */
  exportAssignmentsLoading: boolean;
  /**
   * The export-content load's error, or `null` on success or when the chosen
   * course has no stored export (in which case no request was ever made, so
   * there is nothing to report as an error).
   */
  exportAssignmentsError: string | null;
  /**
   * The course's stored export's rubric list (`ExportCourseContent.rubrics`,
   * a `CartridgeRubric[]`) - the rubric picker's `export` source (docs/repo-
   * grades-rubric-picker-acceptance-criteria.md). This is the SAME
   * `exportContent` load that already feeds `assignmentOptions`' export half
   * above, not a second fetch - `.rubrics` is simply the field that load was
   * not yet returning. Always an array, never `undefined`, even when there is
   * no export at all (`exportContent` is `null`): `ExportCourseContent.rubrics`
   * is itself always an array by its own doc comment (lms-export-source/
   * types.ts), and `exportContent?.rubrics ?? []` degrades a missing export
   * to that same empty array rather than needing a separate guard.
   */
  exportRubrics: ExportCourseContent["rubrics"];
  /** Manually re-runs the org scan for the current course/prefix (e.g. a
   * "Refresh" button after the instructor pushes new repos). */
  reloadScan: () => void;
  /**
   * Accepts a binding for one repo (AC2 items 6, 10): writes
   * applyRepoGradeBinding's patch through updateCourseHubAction - the EXISTING
   * course-update action, merged with courseToInput(course) so every other
   * field on the tile is preserved - and folds the returned row back into
   * local state so suggestRepoStudentBindings re-derives as "confirmed" on
   * the next render, with no full reload and no re-scan of GitHub. Never
   * called automatically; every call site in this view is a user's explicit
   * per-row click (see RepoGradesGrid.tsx / RepoBindingControl.tsx).
   */
  acceptBinding: (repo: string, canvasUserId: string, student: string, username: string | null) => Promise<{ ok: true } | { error: string }>;
  /**
   * RENAMED from `linkBlockedReason` this wave (its meaning narrowed - see
   * below). Null when the LIVE-Canvas "Link GitHub usernames" action
   * (`linkGithubUsernames`, which reads a Canvas assignment's text
   * submissions) can run; otherwise the reason it cannot, worded to match
   * this view's existing missingOrg banner and the `canvasGateBlockedReason`
   * above (index.tsx) - named-course, states-what-is-missing, states-what-
   * that-breaks. Governs
   * ONLY the live-Canvas submissions source. It must NOT block
   * `linkFromCourseRoster` (the course-table roster source above, which needs
   * no institution or Canvas course id at all) or `assignmentOptions`' export
   * half (which needs a stored export, not a live Canvas connection).
   * Derived on every render from `course`/`institution`/`canvasCourseId` (the
   * same values the roster/assignments loads below already compute), never
   * stored, so it can never go stale relative to the tile actually selected.
   */
  liveLinkBlockedReason: string | null;
  /**
   * Mirrors the "Link GitHub usernames to roster" workflow step
   * (steps.course-setup.rosters.ts:70-173) inline in this view: reads one
   * Canvas assignment's text submissions, extracts a GitHub username from
   * each, and folds the clean ones into the tile's roster/studentRepos
   * through the SAME updateCourseHubAction save path acceptBinding uses.
   * Returns `{ error }` rather than throwing for every failure mode (missing
   * course/institution/course id, blank assignment, the submissions read, or
   * the write) so the panel can show the reason inline instead of crashing.
   */
  linkGithubUsernames: (
    assignmentId: string,
    assignmentName: string
  ) => Promise<LinkUsernamesOutcome | { error: string }>;
  /**
   * Confirms a batch of previously-"suggested" bindings in ONE write. See
   * this function's own body below for why a loop calling `acceptBinding`
   * once per binding would silently keep only the LAST one.
   */
  confirmSuggestedBindings: (
    bindings: ReadonlyArray<{ repo: string; canvasUserId: string; student: string }>
  ) => Promise<{ confirmed: number } | { error: string }>;
}

export function useRepoGradesData(courseId: string, orgPrefix: string): UseRepoGradesDataResult {
  const { courses, loading: coursesLoading, error: coursesError, setCourses } = useCourses();
  const course = courses.find((c) => c.id === courseId) ?? null;

  // ---- org repo tree scan (AC3) ------------------------------------------
  const trimmedOrg = (course?.githubOrg ?? "").trim();
  const trimmedPrefix = orgPrefix.trim();
  const [scanNonce, setScanNonce] = useState(0);
  const scanKey = course && trimmedOrg ? `${course.id}:${trimmedOrg}:${trimmedPrefix}:${scanNonce}` : null;
  const [scanResult, setScanResult] = useState<KeyedResult<OrgRepoTreesResult | null> | null>(null);

  useEffect(() => {
    if (scanKey === null) return;
    let cancelled = false;
    (async () => {
      // trimmedOrg is captured by scanKey's own dependency, so re-reading
      // course/trimmedOrg here (rather than parsing them back out of
      // scanKey) is safe: this effect only runs when scanKey is non-null,
      // which requires course && trimmedOrg to have been truthy at the time
      // the key was computed, and both are stable across the async gap
      // because a course/org/prefix change would itself produce a new
      // scanKey and thus a fresh effect run.
      const result = await loadOrgRepoTreesAction(trimmedOrg, trimmedPrefix || undefined, undefined);
      if (cancelled) return;
      if ("error" in result) {
        setScanResult({ key: scanKey, data: null, error: result.error });
      } else {
        setScanResult({ key: scanKey, data: result, error: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scanKey, trimmedOrg, trimmedPrefix]);

  const scanMatches = scanKey !== null && scanResult?.key === scanKey;
  const scan = scanMatches ? scanResult!.data : null;
  const scanError = scanMatches ? scanResult!.error : null;
  const scanLoading = scanKey !== null && !scanMatches;

  // ---- roster (needed for binding suggestions) ---------------------------
  const institution = (course?.institution ?? "").trim();
  const canvasUrl = (course?.canvasUrl ?? "").trim();
  const canvasCourseId = course?.canvasUrl ? parseCanvasCourseId(course.canvasUrl) : null;
  const rosterKey = course && institution && canvasCourseId ? `${course.id}:${institution}:${canvasCourseId}` : null;
  const [rosterResult, setRosterResult] = useState<KeyedResult<RepoBindingRosterEntry[]> | null>(null);

  useEffect(() => {
    if (rosterKey === null) return;
    let cancelled = false;
    (async () => {
      // See the scan effect's comment above for why re-reading institution/
      // canvasCourseId here (rather than parsing rosterKey) is safe.
      const result = await listCourseRosterAction(institution, canvasCourseId!);
      if (cancelled) return;
      if ("error" in result) {
        setRosterResult({ key: rosterKey, data: [], error: result.error });
      } else {
        setRosterResult({
          key: rosterKey,
          // docs/repo-grades-name-columns-and-sorting-acceptance-criteria.md
          // N2 item 6: `sortableName` (Canvas's own "Last, First") used to be
          // dropped here even though listCourseRosterAction already returns
          // it - threading it through lets suggestRepoStudentBindings prefer
          // Canvas's real split over any name derived from the plain display
          // name, with no second lookup anywhere else in this view.
          data: result.students.map((s) => ({ id: s.id, name: s.name, loginId: s.loginId, sortableName: s.sortableName })),
          error: null,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rosterKey, institution, canvasCourseId]);

  const rosterMatches = rosterKey !== null && rosterResult?.key === rosterKey;
  const roster = rosterMatches ? rosterResult!.data : [];
  const rosterError = rosterMatches ? rosterResult!.error : null;
  const rosterLoading = rosterKey !== null && !rosterMatches;

  // ---- Canvas assignments (needed for the per-column mapping picker, AC5
  // items 25-26) - same institution/canvasCourseId gate as the roster above,
  // reusing those two already-computed values rather than re-deriving them,
  // so a course with no institution or no parseable Canvas URL degrades
  // identically for both loads. ------------------------------------------
  const assignmentsKey = course && institution && canvasCourseId ? `${course.id}:${institution}:${canvasCourseId}` : null;
  const [assignmentsResult, setAssignmentsResult] = useState<KeyedResult<CanvasAssignmentBrief[]> | null>(null);

  useEffect(() => {
    if (assignmentsKey === null) return;
    let cancelled = false;
    (async () => {
      // See the scan effect's comment above for why re-reading institution/
      // canvasCourseId here (rather than parsing assignmentsKey) is safe.
      const result = await listCourseAssignmentsAction(institution, canvasCourseId!);
      if (cancelled) return;
      if ("error" in result) {
        setAssignmentsResult({ key: assignmentsKey, data: [], error: result.error });
      } else {
        setAssignmentsResult({ key: assignmentsKey, data: result.assignments, error: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [assignmentsKey, institution, canvasCourseId]);

  const assignmentsMatches = assignmentsKey !== null && assignmentsResult?.key === assignmentsKey;
  const assignments = assignmentsMatches ? assignmentsResult!.data : [];
  const assignmentsError = assignmentsMatches ? assignmentsResult!.error : null;
  const assignmentsLoading = assignmentsKey !== null && !assignmentsMatches;

  // ---- U4.19d/19e: the reason `rosterKey`/`assignmentsKey` above are both
  // null, named for a person rather than left to read as two silent empty
  // lists. This is the SAME gate those two keys already use
  // (`institution && canvasCourseId`) - not a new or wider one, so it never
  // changes WHEN either load runs, only whether the instructor is TOLD why
  // nothing loaded. Reported by the owner: "the assignments drop down on the
  // repo grade view doesn't actually populate. i can't choose anything from
  // there." - traced to exactly this gate producing assignmentsLoading=false
  // and assignmentsError=null (both defined above from assignmentsMatches),
  // which is indistinguishable from "no assignments configured" in every
  // banner that only checks those two fields. Three distinct causes collapse
  // into that one silent gate today, so this reason distinguishes all three
  // in its own text instead of reporting one blended non-answer:
  //   (a) institution blank,
  //   (b) canvasUrl blank,
  //   (c) canvasUrl set but parseCanvasCourseId (imported above) found no
  //       "/courses/<digits>" segment in it - the single most likely real
  //       cause, since pasting the institution's Canvas ROOT address (e.g.
  //       "https://school.instructure.com") instead of a specific course's
  //       URL parses to null with no error thrown anywhere.
  // U4.19e: named ONCE here (not per-consequence in each of the three
  // controls it affects), listing every consequence together - the
  // assignment picker (this hook's own `assignments` staying `[]`), the
  // roster (`roster` below staying `[]`, which is what makes
  // RepoBindingControl.tsx's student picker read "No roster loaded"), and
  // posting (repo-grade-postability.ts's `postable` requires a CONFIRMED
  // binding with a numeric canvasUserId - unreachable with no roster to bind
  // against and no live-Canvas submissions read to supply one, since
  // `liveLinkBlockedReason` below is gated on this identical condition) -
  // rather than leaving the instructor to discover the same one cause
  // separately in three different places on this page.
  const canvasGateBlockedReason: string | null = !course
    ? null
    : !institution
      ? `"${course.name}" has no institution set, so neither its Canvas roster nor its Canvas assignments can be loaded - set one on the course tile first. Until then the assignment picker stays empty, each row's student picker reads "No roster loaded", and posting to the gradebook is unreachable.`
      : !canvasUrl
        ? `"${course.name}" has no Canvas course URL set, so neither its Canvas roster nor its Canvas assignments can be loaded - set one on the course tile first. Until then the assignment picker stays empty, each row's student picker reads "No roster loaded", and posting to the gradebook is unreachable.`
        : !canvasCourseId
          ? `"${course.name}"'s Canvas course URL does not contain a Canvas course id ("/courses/<number>"), so neither its Canvas roster nor its Canvas assignments can be loaded - paste the course's own URL (for example "https://<school>.instructure.com/courses/12345"), not the institution's general Canvas address, on the course tile. Until then the assignment picker stays empty, each row's student picker reads "No roster loaded", and posting to the gradebook is unreachable.`
          : null;

  // ---- course-table roster overlay (course.roster's "Student | username"
  // lines folded onto studentRepos) - see effectiveStudentRepos/rosterOverlay
  // on UseRepoGradesDataResult above for why this is the point of the wave.
  // overlayRosterUsernames is pure and does no I/O, so it is computed
  // directly here on every render rather than behind a keyed load like the
  // scan/roster/assignments above - there is no async gap to key against.
  // Computed ONCE: both `rosterOverlay` (the full result) and
  // `effectiveStudentRepos` (just its rows) read from this one call, never
  // two separate calls that could disagree.
  const rosterOverlay: RosterUsernameOverlayResult = overlayRosterUsernames(course?.studentRepos ?? [], course?.roster ?? null);
  const effectiveStudentRepos: CourseStudentRepo[] = rosterOverlay.rows;

  // ---- export assignments (merged with live below into assignmentOptions) -
  // Same institution-free precedent useLmsAssignmentPull.ts's own exportKey/
  // exportResult pair sets: gated on lmsRenderSourcesFor(course).export
  // (courses-table-helpers.ts) rather than institution/canvasCourseId, so a
  // course with no stored export makes no request and reports no error, and
  // a course with an export but no live Canvas connection at all still gets
  // an assignment list. Same KeyedResult idiom as scan/roster/assignments
  // above - an effect with `let cancelled = false`, an async IIFE that AWAITS
  // BEFORE any setState, an `if (cancelled) return` guard, cleanup setting
  // `cancelled = true`, and DERIVED loading state - never a synchronous
  // setLoading(true), which react-hooks/set-state-in-effect forbids.
  const { supabase } = useSupabase();
  const courseSources = course ? lmsRenderSourcesFor(course) : { live: false, export: false };
  const exportContentKey = course && courseSources.export ? course.id : null;
  const [exportContentResult, setExportContentResult] = useState<KeyedResult<ExportCourseContent | null> | null>(null);

  useEffect(() => {
    if (exportContentKey === null) return;
    let cancelled = false;
    (async () => {
      const result = await readExportCourseContentById(supabase, exportContentKey);
      if (cancelled) return;
      if ("error" in result) {
        setExportContentResult({ key: exportContentKey, data: null, error: result.error });
      } else {
        setExportContentResult({ key: exportContentKey, data: result, error: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [exportContentKey, supabase]);

  const exportContentMatches = exportContentKey !== null && exportContentResult?.key === exportContentKey;
  const exportContent = exportContentMatches ? exportContentResult!.data : null;
  const exportAssignmentsError = exportContentMatches ? exportContentResult!.error : null;
  const exportAssignmentsLoading = exportContentKey !== null && !exportContentMatches;

  // exportAssignmentOptions flattens the export's modules into
  // {moduleTitle, itemTitle, key, body, hasBody} items (export-assignments.ts).
  // buildRepoGradeAssignmentOptions' `export` parameter is typed as
  // {key, itemTitle} (repoGradesAssignmentSources.ts), matching those two
  // fields exactly, so ExportAssignmentOption satisfies it structurally with
  // no adapting - passed straight through rather than remapped.
  const exportAssignmentItems = exportContent ? exportAssignmentOptions(exportContent.modules) : [];
  const assignmentOptions: RepoGradeAssignmentOption[] = buildRepoGradeAssignmentOptions({
    live: assignments,
    export: exportAssignmentItems,
  });

  const reloadScan = () => setScanNonce((n) => n + 1);

  const acceptBinding = async (
    repo: string,
    canvasUserId: string,
    student: string,
    username: string | null
  ): Promise<{ ok: true } | { error: string }> => {
    if (!course) return { error: "Choose a course tile first." };
    const nextStudentRepos = applyRepoGradeBinding(course.studentRepos, repo, canvasUserId, student, username);
    const result = await updateCourseHubAction(course.id, {
      ...courseToInput(course),
      studentRepos: nextStudentRepos,
    });
    if ("error" in result) return { error: result.error };
    setCourses((prev) => prev.map((c) => (c.id === result.course.id ? result.course : c)));
    return { ok: true };
  };

  // ---- link from the Courses tab's own roster text (no Canvas call) ------
  // Persists `rosterOverlay` (computed above, once, alongside
  // effectiveStudentRepos) onto the tile's studentRepos - the same
  // updateCourseHubAction/setCourses write shape acceptBinding above and
  // confirmSuggestedBindings/linkGithubUsernames below all use. Deliberately
  // makes NO Canvas call anywhere in its body and is never gated on
  // liveLinkBlockedReason: course.roster is a plain instructor-typed field
  // with no institution or Canvas-course-id dependency, so this must work
  // for a tile with no institution and no Canvas URL at all - that is the
  // entire requirement this function exists to satisfy. Never writes
  // course.roster itself back - that text stays the instructor's own field;
  // this only fills in the studentRepos rows the roster's usernames were
  // missing from.
  const linkFromCourseRoster = async (): Promise<
    { matched: number; added: number; withoutCanvasId: number; conflicts: string[] } | { error: string }
  > => {
    if (!course) return { error: "Choose a course tile first." };
    // Nothing changed: report it plainly rather than writing a no-op update,
    // and point at exactly where to add usernames - mirrors linkGithubUsernames'
    // own "ok.length === 0" no-write-on-no-change branch below.
    if (rosterOverlay.matched === 0 && rosterOverlay.added === 0) {
      return {
        error: `The Courses tab roster for "${course.name}" has no GitHub usernames this grid was missing. Add "Student Name | username" lines to its Roster tile on the Courses tab.`,
      };
    }
    const writeResult = await updateCourseHubAction(course.id, {
      ...courseToInput(course),
      studentRepos: rosterOverlay.rows,
    });
    if ("error" in writeResult) return { error: writeResult.error };
    setCourses((prev) => prev.map((c) => (c.id === writeResult.course.id ? writeResult.course : c)));
    return {
      matched: rosterOverlay.matched,
      added: rosterOverlay.added,
      withoutCanvasId: rosterOverlay.withoutCanvasId,
      conflicts: rosterOverlay.conflicts,
    };
  };

  // ---- link GitHub usernames from a Canvas assignment's submissions ------
  // Same institution/canvasCourseId gate the roster/assignments loads above
  // already computed - reusing those exact values (rather than re-deriving)
  // so this action degrades identically to the rest of the view for a tile
  // missing either one. RENAMED from `linkBlockedReason` to
  // `liveLinkBlockedReason` this wave: its meaning narrowed to "the LIVE
  // Canvas submissions source cannot run" now that `linkFromCourseRoster` and
  // `assignmentOptions`' export half exist as sources that need neither
  // institution nor a Canvas course id - see the doc comment on
  // UseRepoGradesDataResult.liveLinkBlockedReason above.
  const liveLinkBlockedReason: string | null = !course
    ? "Choose a course tile above first."
    : !institution
      ? `"${course.name}" has no institution set, so its Canvas assignment submissions cannot be read until one is set on the course tile.`
      : !canvasCourseId
        ? `"${course.name}"'s Canvas course URL has no course id, so its Canvas assignment submissions cannot be read until one is set on the course tile.`
        : null;

  const linkGithubUsernames = async (
    assignmentId: string,
    assignmentName: string
  ): Promise<LinkUsernamesOutcome | { error: string }> => {
    if (liveLinkBlockedReason) return { error: liveLinkBlockedReason };
    const trimmedAssignmentId = assignmentId.trim();
    if (!trimmedAssignmentId) return { error: "Choose the assignment students submitted their GitHub username to." };

    // liveLinkBlockedReason === null guarantees course, institution and
    // canvasCourseId are all non-null/non-empty at this point.
    const result = await listAssignmentTextSubmissionsAction(institution, canvasCourseId!, trimmedAssignmentId);
    if ("error" in result) return { error: result.error };

    const { ok, ambiguous } = partitionGithubUsernameSubmissions(result.submissions);

    // No clean usernames found: report it without writing anything, exactly
    // like the workflow step does (steps.course-setup.rosters.ts:135-144) -
    // an unchanged tile has nothing worth saving.
    if (ok.length === 0) {
      return { assignmentId: trimmedAssignmentId, assignmentName, linked: 0, ambiguous, conflicts: [], changed: false };
    }

    const update = buildRosterUpdate({
      submissions: ok,
      existingStudentRepos: course!.studentRepos ?? [],
      existingRoster: course!.roster ?? "",
    });

    const writeResult = await updateCourseHubAction(course!.id, {
      ...courseToInput(course!),
      roster: update.roster,
      studentRepos: update.studentRepos,
    });
    if ("error" in writeResult) return { error: writeResult.error };
    setCourses((prev) => prev.map((c) => (c.id === writeResult.course.id ? writeResult.course : c)));

    return {
      assignmentId: trimmedAssignmentId,
      assignmentName,
      linked: update.linked,
      ambiguous,
      conflicts: update.conflicts,
      changed: true,
    };
  };

  // ---- confirm a batch of suggested bindings in one write -----------------
  const confirmSuggestedBindings = async (
    bindings: ReadonlyArray<{ repo: string; canvasUserId: string; student: string }>
  ): Promise<{ confirmed: number } | { error: string }> => {
    if (!course) return { error: "Choose a course tile first." };
    if (bindings.length === 0) return { error: "No bindings to confirm." };

    // ONE reduce over ALL bindings, ONE write - never a loop calling
    // acceptBinding once per binding. acceptBinding computes its patch from
    // the `course` captured in this render's closure, which does not change
    // between iterations of a loop inside a single handler; N sequential
    // acceptBinding calls would each build their patch from the SAME stale
    // course.studentRepos, so only the LAST binding would actually survive
    // the last write. Folding every binding into one array first and issuing
    // exactly one updateCourseHubAction avoids that entirely.
    const next = bindings.reduce(
      (acc, b) => applyRepoGradeBinding(acc, b.repo, b.canvasUserId, b.student, null),
      course.studentRepos
    );

    const writeResult = await updateCourseHubAction(course.id, {
      ...courseToInput(course),
      studentRepos: next,
    });
    if ("error" in writeResult) return { error: writeResult.error };
    setCourses((prev) => prev.map((c) => (c.id === writeResult.course.id ? writeResult.course : c)));
    return { confirmed: bindings.length };
  };

  return {
    courses,
    coursesLoading,
    coursesError,
    course,
    scan,
    scanLoading,
    scanError,
    roster,
    rosterLoading,
    rosterError,
    assignments,
    assignmentsLoading,
    assignmentsError,
    canvasGateBlockedReason,
    effectiveStudentRepos,
    rosterOverlay,
    linkFromCourseRoster,
    assignmentOptions,
    exportAssignmentsLoading,
    exportAssignmentsError,
    exportRubrics: exportContent?.rubrics ?? [],
    reloadScan,
    acceptBinding,
    liveLinkBlockedReason,
    linkGithubUsernames,
    confirmSuggestedBindings,
  };
}
