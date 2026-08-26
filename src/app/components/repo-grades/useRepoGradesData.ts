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
import type { Course } from "@/lib/supabase/courses";
import { courseToInput } from "@/lib/courses-tab-helpers";
import { parseCanvasCourseId } from "@/lib/canvas-url";
import type { OrgRepoTreesResult } from "@/lib/repo-grade-tree-scan";
import type { RepoBindingRosterEntry } from "@/lib/repo-student-bindings";
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
   * Null when the "Link GitHub usernames" action can run; otherwise the
   * reason it cannot, worded to match this view's existing missingInstitution
   * / missingOrg banners (index.tsx) - named-course, states-what-is-missing,
   * states-what-that-breaks. Derived on every render from `course`/
   * `institution`/`canvasCourseId` (the same values the roster/assignments
   * loads below already compute), never stored, so it can never go stale
   * relative to the tile actually selected.
   */
  linkBlockedReason: string | null;
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
          data: result.students.map((s) => ({ id: s.id, name: s.name, loginId: s.loginId })),
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

  // ---- link GitHub usernames from a Canvas assignment's submissions ------
  // Same institution/canvasCourseId gate the roster/assignments loads above
  // already computed - reusing those exact values (rather than re-deriving)
  // so this action degrades identically to the rest of the view for a tile
  // missing either one.
  const linkBlockedReason: string | null = !course
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
    if (linkBlockedReason) return { error: linkBlockedReason };
    const trimmedAssignmentId = assignmentId.trim();
    if (!trimmedAssignmentId) return { error: "Choose the assignment students submitted their GitHub username to." };

    // linkBlockedReason === null guarantees course, institution and
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
    reloadScan,
    acceptBinding,
    linkBlockedReason,
    linkGithubUsernames,
    confirmSuggestedBindings,
  };
}
