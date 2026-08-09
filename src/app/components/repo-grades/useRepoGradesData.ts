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
  };
}
