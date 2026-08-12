"use client";

// AC B: pull instructions/rubric from a course assignment (a live Canvas
// assignment or a saved course export) into GithubGradingPanel.tsx's
// instructions/rubric fields. Split out of GithubGradingPanel.tsx - which had
// grown past this project's 1000-line ceiling - as a pure mechanical
// extraction: this hook owns every piece of state, persistence, and network
// call the feature needs, INCLUDING AC A's persisted grading-folder value
// (the two share a single persisted githubGradingUiState.ts object, so the
// folder's storage moves here too even though its scan/Autocomplete UI stays
// in the panel). GithubGradingPanel.tsx hands this hook `instructions`/
// `rubric` (their current values, needed only for the "you're about to
// overwrite this" confirm() checks below) and `setInstructions`/`setRubric`
// (the two pieces of panel state this feature writes back into - that
// write-back is the entire point of the feature); it reads back
// `gradingFolder`/`updateUiState` for the AC A folder field and the
// rubric-generation/grading calls that still live in the panel. Everything
// else is private to this hook and its presentational half,
// LmsAssignmentPullSection.tsx.

import { useEffect, useState } from "react";
import { listCourseHubAction, listCourseAssignmentsAction, fetchCanvasMetaAction } from "../../actions";
import { useSupabase } from "@/context/SupabaseProvider";
import { parseCanvasCourseId } from "@/lib/canvas-url";
import { lmsRenderSourcesFor, type LmsRenderSources } from "@/lib/courses-table-helpers";
import { readExportCourseContentById, type ExportCourseContent } from "@/lib/lms-export-source";
import {
  exportAssignmentOptions,
  findExportAssignment,
  type ExportAssignmentOption,
} from "@/lib/lms-export-source/export-assignments";
import { repoGradeAssignmentUrl } from "../repo-grades/repoGradesPosting";
import {
  loadGithubGradingUiState,
  persistGithubGradingUiState,
  type GithubGradingUiState,
  type GithubGradingPullSource,
} from "./githubGradingUiState";
import type { Course } from "@/lib/supabase/courses";
import type { CanvasAssignmentBrief } from "@/lib/canvas";
import type { CartridgeRubric } from "@/lib/cartridge-import-shared";

/**
 * Render an export cartridge's rubric (AC B5) as the same kind of plain
 * rubric text a pasted/generated rubric already is, so it drops straight
 * into the existing Rubric textarea. Deliberately a local, non-exported
 * helper (this feature's file set is UI-only - see the acceptance-criteria
 * doc's file list) rather than a new src/lib/** module: it is a thin
 * field-name adapter over CartridgeRubricCriterion/CartridgeRubricRating
 * (cartridge-import-shared.ts), structurally the same shape
 * src/lib/canvas/metadata.ts's formatRubric already renders for a Canvas
 * rubric, just with camelCase field names instead of Canvas's snake_case.
 */
function cartridgeRubricToText(rubric: CartridgeRubric): string {
  const lines: string[] = [];
  for (const criterion of rubric.criteria) {
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

export interface UseLmsAssignmentPullParams {
  /** GithubGradingPanel.tsx's current instructions box value - read-only here, used only to decide whether a pull needs a "replace?" confirm(). */
  instructions: string;
  /** GithubGradingPanel.tsx's current rubric box value - same, read-only. */
  rubric: string;
  /** Writes GithubGradingPanel.tsx's instructions state. */
  setInstructions: (value: string) => void;
  /** Writes GithubGradingPanel.tsx's rubric state. */
  setRubric: (value: string) => void;
}

export interface UseLmsAssignmentPullResult {
  // AC A: the common grading folder shares githubGradingUiState.ts's single
  // persisted object with this feature's own fields (see the header comment
  // above), so the panel reads/writes it through this hook too.
  gradingFolder: string;
  updateUiState: (patch: Partial<GithubGradingUiState>) => void;

  hubCourses: Course[];
  hubCoursesState: "loading" | "ready" | "error";
  pullCourseId: string;
  pullSource: GithubGradingPullSource;
  selectedLiveAssignmentId: string;
  selectedExportAssignmentKey: string;
  selectedExportRubricTitle: string;
  pullCourse: Course | null;
  pullCourseSources: LmsRenderSources;
  selectPullCourse: (id: string) => void;

  liveAssignments: CanvasAssignmentBrief[];
  liveAssignmentsLoading: boolean;
  liveAssignmentsError: string | null;
  pullFromLive: () => Promise<void>;
  livePulling: boolean;
  livePullNote: string | null;

  exportAssignmentOptionList: ExportAssignmentOption[];
  exportContentLoading: boolean;
  exportContentError: string | null;
  pullFromExport: () => void;
  exportPullNote: string | null;

  exportRubricOptions: CartridgeRubric[];
  pullExportRubric: () => void;
  exportRubricNote: string | null;
}

/**
 * Owns AC A's persisted grading-folder value (shared storage only - the
 * scan/Autocomplete UI for it stays in GithubGradingPanel.tsx) and
 * everything AC B (pull instructions/rubric from a live Canvas assignment or
 * a saved course export) needs: the persisted `uiState`, the course-hub
 * tiles, the live Canvas assignment list, the export content, and the three
 * explicit pull handlers.
 */
export function useLmsAssignmentPull({
  instructions,
  rubric,
  setInstructions,
  setRubric,
}: UseLmsAssignmentPullParams): UseLmsAssignmentPullResult {
  // ---------------------------------------------------------------------
  // AC C1: every control this feature (common grading folder + pull from an
  // LMS assignment) adds is persisted under its own ta- key via
  // githubGradingUiState.ts, restored synchronously in the useState
  // initializer below (so, unlike `selected`/`assignmentMapping` in
  // repo-grades/index.tsx, there is no async gap for a later effect to race)
  // and re-persisted through updateUiState, called at every explicit
  // mutation site below - never via a blanket `useEffect(() =>
  // persist(uiState), [uiState])`. `next` is computed OUTSIDE setUiState
  // (never inside a setState updater function) and persisted as that exact
  // value, mirroring repo-grades/index.tsx's toggleSelected: an updater can
  // run more than once for one commit, which would double-fire the
  // localStorage write.
  const [uiState, setUiState] = useState<GithubGradingUiState>(() => loadGithubGradingUiState());
  const updateUiState = (patch: Partial<GithubGradingUiState>) => {
    const next = { ...uiState, ...patch };
    setUiState(next);
    persistGithubGradingUiState(next);
  };
  const gradingFolder = uiState.gradingFolder;
  const pullCourseId = uiState.courseId;
  const pullSource = uiState.source;
  const selectedLiveAssignmentId = uiState.liveAssignmentId;
  const selectedExportAssignmentKey = uiState.exportAssignmentKey;
  const selectedExportRubricTitle = uiState.exportRubricTitle;

  // ---- AC B: pull instructions/rubric from an LMS assignment ------------
  const { supabase } = useSupabase();
  const [hubCourses, setHubCourses] = useState<Course[]>([]);
  const [hubCoursesState, setHubCoursesState] = useState<"loading" | "ready" | "error">("loading");
  const [livePulling, setLivePulling] = useState(false);
  const [livePullNote, setLivePullNote] = useState<string | null>(null);
  const [exportPullNote, setExportPullNote] = useState<string | null>(null);
  const [exportRubricNote, setExportRubricNote] = useState<string | null>(null);

  // Course-hub tiles (AC B1): the only course concept this feature needs,
  // since a tile already carries BOTH institution + a full Canvas URL (for
  // the live path's fetchCanvasMetaAction/repoGradeAssignmentUrl, which need
  // a real host - a bare CoursePicker-style "/courses/<id>" path cannot
  // resolve an institution) and its own id (for readExportCourseContentById).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await listCourseHubAction();
      if (cancelled) return;
      if ("error" in r) {
        setHubCoursesState("error");
        return;
      }
      setHubCourses(r.courses);
      setHubCoursesState("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const pullCourse = hubCourses.find((c) => c.id === pullCourseId) ?? null;
  const pullCourseSources = pullCourse ? lmsRenderSourcesFor(pullCourse) : { live: false, export: false };

  // Once the chosen course's real sources are known, correct a persisted
  // `source` that no longer applies to it (e.g. the export was removed, or a
  // different course with only one source was picked while restoring a
  // stale value) - a render-phase compare-and-adjust keyed on the course id,
  // the same idiom CoursePicker.tsx's own prevInstitution reset and
  // repo-grades/index.tsx's assignmentMapping restore both use, rather than
  // a `useEffect` (which would need an extra render to fire and would risk
  // the set-state-in-effect lint rule for a synchronous correction like
  // this).
  const [sourceCheckedForCourse, setSourceCheckedForCourse] = useState<string | null>(null);
  if (hubCoursesState === "ready" && pullCourse && sourceCheckedForCourse !== pullCourse.id) {
    setSourceCheckedForCourse(pullCourse.id);
    const validForCurrent = (pullSource === "live" && pullCourseSources.live) || (pullSource === "export" && pullCourseSources.export);
    if (!validForCurrent) {
      const corrected: GithubGradingPullSource = pullCourseSources.live ? "live" : pullCourseSources.export ? "export" : pullSource;
      if (corrected !== pullSource) updateUiState({ source: corrected });
    }
  }

  const selectPullCourse = (id: string) => {
    const course = hubCourses.find((c) => c.id === id) ?? null;
    const sources = course ? lmsRenderSourcesFor(course) : { live: false, export: false };
    const nextSource: GithubGradingPullSource = sources.live ? "live" : sources.export ? "export" : pullSource;
    updateUiState({ courseId: id, source: nextSource, liveAssignmentId: "", exportAssignmentKey: "", exportRubricTitle: "" });
    setLivePullNote(null);
    setExportPullNote(null);
    setExportRubricNote(null);
  };

  // ---- AC B2: live Canvas assignments for the chosen course --------------
  // Derived-loading (no separate setLoading call) exactly like
  // useRepoGradesData.ts's own assignments load: `loading` is "a request is
  // in flight whose key does not match the latest completed result", never a
  // state written synchronously at the top of the effect (which would trip
  // react-hooks/set-state-in-effect).
  const liveInstitution = (pullCourse?.institution ?? "").trim();
  const liveCanvasCourseId = pullCourse?.canvasUrl ? parseCanvasCourseId(pullCourse.canvasUrl) : null;
  const liveKey =
    pullCourse && pullSource === "live" && liveInstitution && liveCanvasCourseId
      ? `${pullCourse.id}:${liveInstitution}:${liveCanvasCourseId}`
      : null;
  const [liveAssignmentsResult, setLiveAssignmentsResult] = useState<{
    key: string;
    assignments: CanvasAssignmentBrief[];
    error: string | null;
  } | null>(null);

  useEffect(() => {
    if (liveKey === null) return;
    let cancelled = false;
    (async () => {
      const r = await listCourseAssignmentsAction(liveInstitution, liveCanvasCourseId!);
      if (cancelled) return;
      if ("error" in r) setLiveAssignmentsResult({ key: liveKey, assignments: [], error: r.error });
      else setLiveAssignmentsResult({ key: liveKey, assignments: r.assignments, error: null });
    })();
    return () => {
      cancelled = true;
    };
  }, [liveKey, liveInstitution, liveCanvasCourseId]);

  const liveAssignmentsMatch = liveKey !== null && liveAssignmentsResult?.key === liveKey;
  const liveAssignments = liveAssignmentsMatch ? liveAssignmentsResult!.assignments : [];
  const liveAssignmentsError = liveAssignmentsMatch ? liveAssignmentsResult!.error : null;
  const liveAssignmentsLoading = liveKey !== null && !liveAssignmentsMatch;

  // Explicit only (AC B6): rebuilds the assignment URL from the course
  // tile's own Canvas URL (repoGradeAssignmentUrl - the same precedent
  // repo-grades/index.tsx:290 uses), then fills instructions/rubric from
  // fetchCanvasMetaAction. Warns before overwriting either box if either
  // already has content; never synthesizes a rubric when Canvas has none
  // (AC B3 - reuses GradingTab.tsx's own wording for that case).
  const pullFromLive = async () => {
    if (!pullCourse || !selectedLiveAssignmentId) return;
    const url = repoGradeAssignmentUrl(pullCourse.canvasUrl ?? "", selectedLiveAssignmentId);
    if (!url) {
      setLivePullNote(`Could not build a Canvas assignment URL for "${pullCourse.name}" - check its Canvas URL on the course tile.`);
      return;
    }
    if (
      (instructions.trim() || rubric.trim()) &&
      !window.confirm("Replace the current assignment instructions and rubric with content pulled from Canvas?")
    ) {
      return;
    }
    setLivePulling(true);
    setLivePullNote(null);
    const r = await fetchCanvasMetaAction(url);
    setLivePulling(false);
    if ("error" in r) {
      setLivePullNote(r.error);
      return;
    }
    setInstructions(r.description);
    if (r.rubricText) setRubric(r.rubricText);
    const parts: string[] = [];
    if (r.description) parts.push("instructions");
    if (r.rubricText) parts.push("rubric");
    const base = parts.length ? `Pulled ${parts.join(" + ")} from Canvas.` : "Pulled from Canvas.";
    const noRubric = r.rubricText
      ? ""
      : " No rubric was found in Canvas; none will be synthesized. Grading uses the assignment instructions only (attach a rubric in Canvas for per-criterion scoring).";
    setLivePullNote(base + noRubric);
  };

  // ---- AC B4/B5: export content (assignment items + course-level rubrics) ----
  const exportKey = pullCourse && pullSource === "export" ? pullCourse.id : null;
  const [exportResult, setExportResult] = useState<{
    key: string;
    content: ExportCourseContent | null;
    error: string | null;
  } | null>(null);

  useEffect(() => {
    if (exportKey === null) return;
    let cancelled = false;
    (async () => {
      const r = await readExportCourseContentById(supabase, exportKey);
      if (cancelled) return;
      if ("error" in r) setExportResult({ key: exportKey, content: null, error: r.error });
      else setExportResult({ key: exportKey, content: r, error: null });
    })();
    return () => {
      cancelled = true;
    };
  }, [exportKey, supabase]);

  const exportMatch = exportKey !== null && exportResult?.key === exportKey;
  const exportContent = exportMatch ? exportResult!.content : null;
  const exportContentError = exportMatch ? exportResult!.error : null;
  const exportContentLoading = exportKey !== null && !exportMatch;
  const exportAssignmentOptionList = exportContent ? exportAssignmentOptions(exportContent.modules) : [];
  const exportRubricOptions = exportContent?.rubrics ?? [];

  // Explicit only (AC B6): fills instructions from the picked item's body.
  // When the export never resolved a body for this item (AC B4), the box is
  // left untouched and a plain note says so - the title is never substituted
  // in as if it were instructions.
  const pullFromExport = () => {
    const option = findExportAssignment(exportAssignmentOptionList, selectedExportAssignmentKey);
    if (!option) return;
    if (!option.hasBody) {
      setExportPullNote(`"${option.itemTitle}" has no instructions text in this export. Nothing was pulled - type the instructions manually.`);
      return;
    }
    if (instructions.trim() && !window.confirm("Replace the current assignment instructions with content pulled from the export?")) {
      return;
    }
    setInstructions(option.body!);
    setExportPullNote(`Pulled instructions for "${option.itemTitle}" from the export.`);
  };

  // Explicit only (AC B5/B6): a SEPARATE by-title pick, never presented as
  // "this assignment's rubric" - a cartridge carries no rubric-to-assignment
  // association at all, so the note below says so every time a rubric is
  // applied this way.
  const pullExportRubric = () => {
    const found = exportRubricOptions.find((r) => r.title === selectedExportRubricTitle);
    if (!found) return;
    if (rubric.trim() && !window.confirm("Replace the current rubric with this export rubric?")) {
      return;
    }
    setRubric(cartridgeRubricToText(found));
    setExportRubricNote(`Using "${found.title}" from the export - a course-level rubric, not one the export associates with this assignment specifically.`);
  };

  return {
    gradingFolder,
    updateUiState,
    hubCourses,
    hubCoursesState,
    pullCourseId,
    pullSource,
    selectedLiveAssignmentId,
    selectedExportAssignmentKey,
    selectedExportRubricTitle,
    pullCourse,
    pullCourseSources,
    selectPullCourse,
    liveAssignments,
    liveAssignmentsLoading,
    liveAssignmentsError,
    pullFromLive,
    livePulling,
    livePullNote,
    exportAssignmentOptionList,
    exportContentLoading,
    exportContentError,
    pullFromExport,
    exportPullNote,
    exportRubricOptions,
    pullExportRubric,
    exportRubricNote,
  };
}
