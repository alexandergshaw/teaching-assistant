"use client";

// Data layer for the chat composer's "From LMS" segment (LMS-SUBMISSIONS-ZIP-INTAKE).
// Three dependent dropdowns: institution -> course -> assignment. The cascade
// and the persisted selection are pure and live in lmsPickerState.ts. Loading is
// derived (a request is in flight whose key does not match the latest completed
// result), mirroring useLmsAssignmentPull.ts, so no effect sets loading itself.
import { useEffect, useState } from "react";
import { listConfiguredInstitutionsAction, listCoursesAction, listCourseAssignmentsAction } from "@/app/actions";
import type { CanvasAssignmentBrief, CanvasCourse } from "@/lib/canvas";
import { chatSeamNowMs, classifyChatSeamFailure, recordChatSeamSettled } from "./chatSeamDiagnostic";
import {
  EMPTY_LMS_PICKER_SELECTION,
  canSubmitLmsSelection,
  loadLmsPickerSelection,
  persistLmsPickerSelection,
  selectLmsAssignment,
  selectLmsCourse,
  selectLmsInstitution,
  valueIfPresent,
  type LmsPickerSelection,
} from "./lmsPickerState";

interface KeyedResult<T> {
  readonly key: string;
  readonly items: T[];
  readonly error: string | null;
}

export interface LmsPickerState {
  readonly institutions: string[];
  /** Why the institution list is empty, when the server could say; null otherwise. */
  readonly emptyReason: string | null;
  readonly institution: string;
  readonly courses: CanvasCourse[];
  readonly courseId: string;
  readonly assignments: CanvasAssignmentBrief[];
  readonly assignmentId: string;
  readonly loading: { institutions: boolean; courses: boolean; assignments: boolean };
  readonly errors: { institutions: string | null; courses: string | null; assignments: string | null };
  readonly error: string | null;
  readonly selectInstitution: (code: string) => void;
  readonly selectCourse: (id: string) => void;
  readonly selectAssignment: (id: string) => void;
  readonly canSubmit: boolean;
}

export function useLmsSubmissionPicker(): LmsPickerState {
  const [sel, setSel] = useState<LmsPickerSelection>(EMPTY_LMS_PICKER_SELECTION);
  const [restored, setRestored] = useState(false);
  const [instResult, setInstResult] = useState<{ items: string[]; error: string | null; emptyReason: string | null } | null>(null);
  const [courseResult, setCourseResult] = useState<KeyedResult<CanvasCourse> | null>(null);
  const [assignmentResult, setAssignmentResult] = useState<KeyedResult<CanvasAssignmentBrief> | null>(null);

  // The stored selection is restored in a mount effect, not a state initializer:
  // the server HTML has no selection, so an initializer would mismatch on hydrate.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await Promise.resolve(loadLmsPickerSelection());
      if (cancelled) return;
      setSel(stored);
      setRestored(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // The action's result carries the list under acronyms, not institutions.
      const r = await listConfiguredInstitutionsAction();
      if (cancelled) return;
      if ("error" in r) setInstResult({ items: [], error: r.error, emptyReason: null });
      else setInstResult({ items: r.acronyms, error: null, emptyReason: r.emptyReason ?? null });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const courseKey = restored && sel.institution ? sel.institution : null;
  useEffect(() => {
    if (courseKey === null) return;
    let cancelled = false;
    void (async () => {
      const startedAtMs = chatSeamNowMs();
      const r = await listCoursesAction(courseKey);
      recordChatSeamSettled({
        operation: "list_lms_courses",
        startedAtMs,
        failureClass: "error" in r ? classifyChatSeamFailure(r.error) : null,
        institution: courseKey,
        host: "error" in r ? r.attemptedHost : undefined,
        cause: "error" in r ? r.networkFailure?.cause : undefined,
        code: "error" in r ? r.networkFailure?.code : undefined,
        serverMs: "error" in r ? r.serverMs : undefined,
      });
      if (cancelled) return;
      if ("error" in r) setCourseResult({ key: courseKey, items: [], error: r.error });
      else setCourseResult({ key: courseKey, items: r.courses, error: null });
    })();
    return () => {
      cancelled = true;
    };
  }, [courseKey]);

  const assignmentKey = courseKey !== null && sel.courseId ? `${sel.institution}:${sel.courseId}` : null;
  useEffect(() => {
    if (assignmentKey === null) return;
    let cancelled = false;
    void (async () => {
      const startedAtMs = chatSeamNowMs();
      const r = await listCourseAssignmentsAction(sel.institution, sel.courseId);
      recordChatSeamSettled({
        operation: "list_lms_assignments",
        startedAtMs,
        failureClass: "error" in r ? classifyChatSeamFailure(r.error) : null,
        institution: sel.institution,
        host: "error" in r ? r.attemptedHost : undefined,
        cause: "error" in r ? r.networkFailure?.cause : undefined,
        code: "error" in r ? r.networkFailure?.code : undefined,
        serverMs: "error" in r ? r.serverMs : undefined,
      });
      if (cancelled) return;
      if ("error" in r) setAssignmentResult({ key: assignmentKey, items: [], error: r.error });
      else setAssignmentResult({ key: assignmentKey, items: r.assignments, error: null });
    })();
    return () => {
      cancelled = true;
    };
    // The key encodes institution + course; the effect re-runs exactly when it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentKey]);

  const courseMatch = courseKey !== null && courseResult?.key === courseKey;
  const assignmentMatch = assignmentKey !== null && assignmentResult?.key === assignmentKey;
  const institutions = instResult?.items ?? [];
  const courses = courseMatch ? courseResult!.items : [];
  const assignments = assignmentMatch ? assignmentResult!.items : [];

  const apply = (next: LmsPickerSelection) => {
    setSel(next);
    persistLmsPickerSelection(next);
  };

  const institution = instResult ? valueIfPresent(sel.institution, institutions) : sel.institution;
  const courseId = courseMatch ? valueIfPresent(sel.courseId, courses.map((c) => c.id)) : sel.courseId;
  const assignmentId = assignmentMatch ? valueIfPresent(sel.assignmentId, assignments.map((a) => a.id)) : sel.assignmentId;

  return {
    institutions,
    emptyReason: institutions.length === 0 ? (instResult?.emptyReason ?? null) : null,
    institution,
    courses,
    courseId,
    assignments,
    assignmentId,
    loading: {
      institutions: instResult === null,
      courses: courseKey !== null && !courseMatch,
      assignments: assignmentKey !== null && !assignmentMatch,
    },
    errors: {
      institutions: instResult?.error ?? null,
      courses: courseMatch ? courseResult!.error : null,
      assignments: assignmentMatch ? assignmentResult!.error : null,
    },
    error: (instResult?.error ?? null) || (courseMatch ? courseResult!.error : null) || (assignmentMatch ? assignmentResult!.error : null),
    selectInstitution: (code) => apply(selectLmsInstitution(sel, code)),
    selectCourse: (id) => apply(selectLmsCourse(sel, id)),
    selectAssignment: (id) => apply(selectLmsAssignment(sel, id)),
    canSubmit: canSubmitLmsSelection({ institution, courseId, assignmentId }),
  };
}
