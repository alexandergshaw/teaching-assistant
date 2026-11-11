"use client";

// Repo Grades: a Manual subtab that lists every student repo in a course
// tile's GitHub org, helps bind each repo to the roster student it belongs
// to, enumerates each repo's assignment folders as grid columns, grades a
// folder on demand, and posts the results to the Canvas gradebook. Full
// spec: docs/repo-grades-view-acceptance-criteria.md.
//
// THIS WAVE (per the acceptance-criteria doc's wave brief) completes the
// feature: per-column Canvas assignment mapping (AC5 items 25-26), per-cell
// grading (AC4 item 21) and editable score/comment (AC4 item 20), and
// posting to the gradebook (AC5). This is the wave that WRITES TO A LIVE
// GRADEBOOK - postCanvasGradesAction has no undo, no audit table and no
// dry-run - so every decision (which rows are postable, what the payload
// contains, how a post's result maps back to each row) is made by pure,
// independently-tested functions in repoGradesPosting.ts /
// repoGradesAssignmentMapping.ts / repoGradesCellEdits.ts; this file only
// calls them and renders what they returned, plus the plain React-state
// wiring (whose cell is mid-edit, which column is mid-post) that has no
// decision of its own to make.
//
// All data loading follows this codebase's idiom (ContentTab.tsx:134-155):
// useRepoGradesData owns every effect, each with a `cancelled` guard and an
// async body that awaits before any setState. This file only reads that
// hook's derived state and the pure repoGradesRows.ts/repoGradesPosting.ts/
// repoGradesAssignmentMapping.ts functions, and renders.
import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from "react";
import { Accordion, AccordionDetails, AccordionSummary, Alert, Box, Checkbox, CircularProgress, FormControlLabel, InputBase, Stack, SvgIcon, Typography } from "@mui/material";
import Button from "@mui/material/Button";
import { useSupabase } from "@/context/SupabaseProvider";
import { isOwnerDecision } from "@/lib/access";
import { useLlmProvider } from "@/lib/llm-provider";
import TabHeader from "../TabHeader";
import { RepoGradeReservationRecovery } from "../repo-grades-dashboard/RepoGradeReservationRecovery";
import { RepoGradesStartupBrief, RepoGradesStartupStatus, useRepoGradesStartupHistoryRevision, useRepoGradesTargetedGrading } from "../repo-grades-dashboard/RepoGradesStartup";
import { useRepoGradeTargetRequests, type TargetCommand } from "./useRepoGradeTargetRequests";
import { useRepoChangedSubmissions } from "./useRepoChangedSubmissions";
import { gradeSelectionKey, gradeSelectionRectangle, toggleGradeSelection, type GradeSelection } from "./repoGradeSelection";
import { useRepoGradesAutomaticBlocks } from "../repo-grades-dashboard/useRepoGradesAutomaticBlocks";
import RepoGradesGithubQuota from "./RepoGradesGithubQuota";
import { useRepoGradesData } from "./useRepoGradesData";
import {
  clearRepoGradeCells,
  loadAssignmentMapping,
  loadFolderSelection,
  loadRepoGradeCells,
  loadRepoGradesUiState,
  DEFAULT_TARGET_BRANCH,
  loadTargetBranch,
  loadSelectedRepoIds,
  persistAssignmentMapping,
  persistFolderSelection,
  persistRepoGradeCells,
  persistRepoGradesUiState,
  persistSelectedRepoIds,
  persistTargetBranch,
  type RepoGradesUiState,
} from "./repoGradesUiState";
import {
  ALL_FOLDERS,
  buildFolderOptions,
  resolveSelectedFolder,
  shouldPersistFolderDrop,
} from "./repoGradesFolderSelection";
import RepoGradesControls from "./RepoGradesControls";
import RepoGradeCourseFilters from "./RepoGradeCourseFilters";
import { courseIdToAutoSelect, effectiveOpen } from "./repoGradesCoursePicker";
import RepoGradesStatusBanners, { RepoGradesFolderHint } from "./RepoGradesStatusBanners";
import { RepoGradesColumnProgress, RepoGradesLoadingStatus } from "./RepoGradesLoadingStatus";
import {
  buildRepoGradeGridModel,
  sortRepoGradeRows,
} from "./repoGradesRows";
import {
  applyRepoGradeAssignmentMapping,
  filterRepoGradeAssignmentMapping,
  setRepoGradeAssignmentMapping,
  type RepoGradeAssignmentMap,
} from "./repoGradesAssignmentMapping";
import { EMPTY_REPO_GRADE_CELL_EDITS } from "./repoGradesCellEdits";
import { createRepoGradesDraftController } from "./repoGradesDraftController";
import RepoGradesDashboard, { RepoGradeAutomaticBlockNotice } from "./RepoGradesDashboard";
import { buildRepoGradeMatrix, buildRepoGradesDashboard, visibleRepoGradebookRows } from "./repoGradesDashboardModel";
import { useRepoGradeMatrixResults } from "./useRepoGradeMatrixResults";
import RepoGradesGrid from "./RepoGradesGrid";
import RepoGradesStickyHeader from "./RepoGradesStickyHeader";
import { selectionFilterSummary, visibleRepoRows } from "./repoGradesVisibleRows";
import { toggleRepoInGradeSet } from "./repoGradesGradeSet";
import RepoGradesGradeSetTypeahead from "./RepoGradesGradeSetTypeahead";
import RepoGradesFolderPicker from "./RepoGradesFolderPicker";
import { useRepoGradesGradingActions } from "./useRepoGradesGradingActions";
// A16 wave 3: mounts this run's trends above the grid - see
// classTrendsFolderEntry.ts's header for why the leaf lives in this
// directory rather than importing the recording surface's own cohort.
import ClassTrendsPanel from "../drafted-grades/ClassTrendsPanel";
import { repoRunTrendsLabel } from "./classTrendsFolderEntry";
import { REPO_TRENDS_SUBSET_UNAVAILABLE_REASON } from "./classTrendsFolderEntry";
import { useRepoGradesRubricSource } from "./useRepoGradesRubricSource";
import { lmsRenderSourcesFor } from "@/lib/courses-table-helpers";
import gridStyles from "./repo-grades.module.css";
import pageStyles from "../../page.module.css";
import styles from "./repo-grades.module.css";

const NO_GRADE_SET: ReadonlySet<string> = new Set();

export default function RepoGradesTab() {
  const { user, loading } = useSupabase();
  return !loading && user ? <AccountRepoGradesTab key={user.id} accountId={user.id} /> : null;
}

function AccountRepoGradesTab({ accountId }: { accountId: string }) {
  const { accessDecision } = useSupabase();

  const [uiState, setUiState] = useState<RepoGradesUiState>(() => loadRepoGradesUiState());
  const [provider] = useLlmProvider();
  const handleCourseIdChange = (courseId: string) => setUiState((prev) => ({ ...prev, courseId }));

  useEffect(() => {
    persistRepoGradesUiState(uiState);
  }, [uiState]);

  const {
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
    // U4.19d/19e: the one reason `assignments`/`roster` both stay empty with
    // no other signal - see useRepoGradesData.ts's doc comment on this field.
    canvasGateBlockedReason,
    reloadScan,
    // Renamed from `linkBlockedReason` - it only ever blocked the LIVE
    // Canvas-submissions link below, never the course-table one.
    // This wave's fix (full explanation at the `model` comment below): the
    // course tile's hand-maintained roster link, folded in as a derived
    // overlay on top of course.studentRepos.
    effectiveStudentRepos,
    // LinkUsernamesPanel's merged live-Canvas-plus-saved-export assignment
    // options, plus the export list's own loading/error state.
    exportAssignmentsLoading,
    exportAssignmentsError,
    // The course's stored-export rubric list - the rubric picker's `export`
    // source below. Already loaded by useRepoGradesData for assignmentOptions'
    // export half; this is the same load, not a second fetch.
    exportRubrics,
  } = useRepoGradesData(uiState.courseId, uiState.orgPrefix);

  // A7 W2 single-course default: with exactly one course and nothing written,
  // select it. A written id is never changed (a stale one yields null).
  const autoCourseId = coursesLoading ? null : courseIdToAutoSelect(courses, uiState.courseId || null);
  if (autoCourseId && autoCourseId !== uiState.courseId) setUiState((prev) => ({ ...prev, courseId: autoCourseId }));

  // THE BUG THIS WAVE FIXES: the course tile already carries a student-to-
  // GitHub-username link the instructor maintains BY HAND in the Courses
  // tab's Roster tile, but this binder used to match only against
  // `course?.studentRepos ?? []`, which nothing but a live Canvas link or a
  // per-row accept ever wrote to - so thirty hand-typed usernames still left
  // every repo unbound. `effectiveStudentRepos` (useRepoGradesData.ts, backed
  // by rosterUsernameOverlay.ts) folds that table's usernames in as
  // additional rows; passing it here instead is THE fix - do NOT "simplify"
  // this back to `course?.studentRepos ?? []`, that reintroduces the bug.
  //
  // Consequence: `effectiveStudentRepos` is a DERIVED view, not saved data. A
  // row it adds is not written to the tile until the instructor presses
  // "Apply usernames from the course table" (or confirms the row) in
  // LinkUsernamesPanel, so the grid can show a SUGGESTED binding sourced
  // purely from the roster table before anything is actually saved. That is
  // intended - the same "suggested first, confirm second" honesty this view
  // already applies to a live Canvas link.
  const [drafts] = useState(() => createRepoGradesDraftController(accountId, {
    restore: loadRepoGradeCells,
    save: (courseId, edits, expected) => persistRepoGradeCells(courseId, edits, "current", expected),
    discard: clearRepoGradeCells,
  }));
  const selectedCourseId = course?.id ?? null;
  const ownerId = selectedCourseId && isOwnerDecision(accessDecision) ? accountId : null;
  const historyRevision = useRepoGradesStartupHistoryRevision(ownerId ?? "", selectedCourseId ?? "");
  const targetedGrading = useRepoGradesTargetedGrading();
  const targetRequests = useRepoGradeTargetRequests(ownerId || null);
  const automaticBlocks = useRepoGradesAutomaticBlocks(ownerId, selectedCourseId);
  const saved = useRepoGradeMatrixResults(selectedCourseId ?? "", ownerId, historyRevision);
  const draftSnapshot = useSyncExternalStore(drafts.subscribe, drafts.getSnapshot, () => null);
  const cellDraft = draftSnapshot?.courseId === selectedCourseId ? draftSnapshot : null;
  const cellEdits = cellDraft?.edits ?? EMPTY_REPO_GRADE_CELL_EDITS;
  const cellScope = cellDraft?.scope ?? null;
  useLayoutEffect(() => () => drafts.reset(), [drafts]);
  useLayoutEffect(() => {
    if (selectedCourseId) drafts.select(selectedCourseId);
    else drafts.leave();
  }, [drafts, selectedCourseId]);
  useEffect(() => {
    if (cellDraft?.saveDue) void drafts.save(cellDraft.scope);
  }, [drafts, cellDraft]);
  const model = scan ? buildRepoGradeGridModel(scan.repos, roster, effectiveStudentRepos, uiState.orgPrefix) : null;
  // docs/repo-grades-name-columns-and-sorting-acceptance-criteria.md N5 item
  // 17: `cellEdits`/`model.columns` let sortRepoGradeRows sort by a folder
  // column's live score and resolve a stale persisted folder sort against
  // this course's actual columns - both threaded straight through, no
  // decision made here.
  const sortedRows = model ? sortRepoGradeRows(model.rows, uiState.sort, cellEdits, model.columns) : [];
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [showAll, setShowAll] = useState(false); // ephemeral show-all override (no ta- key)

  // AC4 item 23: the persisted selection is restored (and filtered against
  // currently-valid repo ids) once this course's rows are known, not before -
  // done as a render-phase compare-and-adjust (matching CoursePicker.tsx's
  // own prevInstitution pattern) rather than inside a useEffect, since
  // setting state synchronously inside an effect is what
  // react-hooks/set-state-in-effect forbids.
  const [selectionLoadedForKey, setSelectionLoadedForKey] = useState<string | null>(null);
  const selectionKey = model ? `${uiState.courseId}:${model.rows.length}` : null;
  // AC4 items 23-24: persistence of `selected` happens ONLY at the two spots
  // that actually change it - this restore branch, and toggleSelected below -
  // never via a blanket `useEffect(() => persistSelectedRepoIds(selected), [selected])`.
  // That effect shape is exactly the bug this view shipped with: `selected`
  // starts as `new Set()` (the useState initializer two lines up), so such an
  // effect fires on the very first commit with that empty default and
  // overwrites localStorage's SELECTED_KEY with `[]` - immediately, before
  // `model` has ever gone non-null (it stays null until the async org scan
  // and roster resolve in useRepoGradesData.ts complete). This restore branch
  // then runs later, once `model` exists, and reads back the `[]` the effect
  // just wrote - so a persisted selection could never survive a reload; AC4
  // items 23-24 ("every control persists across reload", "a stale selection
  // must never resurrect a row that no longer exists") were defeated because
  // there was never a real value to restore. Persisting from the explicit
  // mutators instead is the SAME pattern `assignmentMapping` below already
  // uses for the identical reason (see that block's comment) - persist is
  // triggered by "this value was just deliberately computed", never by "this
  // state happened to change on some commit", so there is no first-commit-
  // with-the-default write to race the restore. Also persists the FILTERED
  // value loadSelectedRepoIds just computed (not the raw stored one), so a
  // stale id dropped by the filter is also dropped from storage rather than
  // being re-read forever - mirroring filterRepoGradeAssignmentMapping's own
  // restore-time write-back. repoGrades.wiring.test.ts's "index.tsx does not
  // persist the repo-selection Set from a blanket useEffect keyed on the
  // selection alone" guard, with its canary pair (proven against the exact
  // old buggy line, the fixed shape, and the buggy line appearing only in a
  // comment), is what stops this class of bug from coming back.
  if (model && selectionKey !== selectionLoadedForKey) {
    setSelectionLoadedForKey(selectionKey);
    const restored = loadSelectedRepoIds(model.rows.map((row) => row.repo));
    setSelected(restored);
    persistSelectedRepoIds(restored);
  }

  // `next` is computed OUTSIDE the setSelected updater and persisted as that
  // same value, rather than calling persistSelectedRepoIds from inside
  // `setSelected((prev) => ...)`. A setState updater function is required to
  // stay pure - React can invoke it more than once for a single commit (Strict
  // Mode's dev-time double-invoke exists specifically to surface an impure
  // updater), which would double-fire a localStorage write and, under a
  // future concurrent-rendering path, could persist a value for a render that
  // is later discarded. Reading `selected` directly here (rather than through
  // the updater's `prev`) is safe because toggleSelected is a plain function
  // redefined on every render (not memoized against a stale dependency list)
  // and is only ever invoked synchronously from a single user click
  // (RepoGradesGrid.tsx's checkbox onChange) - there is no batched-multiple-
  // toggles-in-one-tick scenario here for the functional-updater form to
  // guard against.
  const toggleSelected = (repo: string) => {
    const next = toggleRepoInGradeSet(selected, repo);
    setSelected(next);
    persistSelectedRepoIds(next);
  };

  // ---- AC5 items 25-26: per-column assignment mapping, restored/filtered
  // once BOTH this course's columns (from the scan) and this course's Canvas
  // assignments have actually loaded. Gating on `!assignmentsLoading &&
  // !assignmentsError` (rather than restoring the instant `model` exists) is
  // deliberate: filterRepoGradeAssignmentMapping needs the REAL assignment
  // id list to tell a still-valid mapping from a stale one, and restoring
  // against an empty/not-yet-loaded list would misclassify every entry as
  // stale and silently wipe a good mapping. Persistence of the restore's own
  // trimmed result, and of every subsequent explicit change
  // (handleAssignmentChange), happens directly at the point of each change -
  // deliberately NOT via a blanket `useEffect(() => persist(mapping), [mapping])` -
  // because such an effect would fire on the very first commit with
  // `assignmentMapping`'s untouched initial value ({}), before this restore
  // branch has ever run (courses/scan/assignments all load asynchronously,
  // strictly after that first commit), and would overwrite a real stored
  // mapping with nothing. ---------------------------------------------------
  const [assignmentMapping, setAssignmentMapping] = useState<RepoGradeAssignmentMap>({});
  const [mappingLoadedForKey, setMappingLoadedForKey] = useState<string | null>(null);
  const mappingReady = !!model && !assignmentsLoading && !assignmentsError;
  const mappingKey = mappingReady
    ? `${uiState.courseId}:${model!.columns.map((c) => c.folder).join(",")}:${assignments.map((a) => a.id).join(",")}`
    : null;
  if (mappingReady && mappingKey !== mappingLoadedForKey) {
    setMappingLoadedForKey(mappingKey);
    const stored = loadAssignmentMapping(uiState.courseId);
    const filtered = filterRepoGradeAssignmentMapping(stored, model!.columns, assignments);
    setAssignmentMapping(filtered);
    if (filtered !== stored) persistAssignmentMapping(uiState.courseId, filtered);
  }
  const columnsWithMapping = model ? applyRepoGradeAssignmentMapping(model.columns, assignmentMapping) : [];
  // `model.columns`/`columnsWithMapping` above are the FULL column set -
  // every folder in the scan - and must keep feeding `mappingKey` above,
  // the mapping restore above, and `filterRepoGradeAssignmentMapping` above
  // exactly as they do today. NEVER pass the DISPLAYED, folder-scoped set
  // (below) into any of those three: U9.41 -
  // filterRepoGradeAssignmentMapping drops every folder not present in the
  // array it is given, and the restore branch above writes that filtered
  // result back to storage a few lines up - so scoping the array before it
  // reaches that filter would silently erase every OTHER folder's saved
  // Canvas assignment mapping the instant the instructor picked one folder
  // to view, invisible until a reload. `columnsWithMapping` stays the FULL
  // set for exactly this reason.

  // ---- U1.1-U1.6d, section 5 ("Data engineering pass and architect
  // revision 3", which overrides sections 3/4 where they conflict) - the
  // folder chooser the instructor asked for, twice: "i should be able to
  // choose which assignment folder i want graded from this view" / "i don't
  // want to select an assignment from the lms, i want to select a folder
  // from the repo in the drop down to grade". `selectedFolder` is the
  // PERSISTED-CONCEPT choice - "" (nothing chosen yet), a raw folder name,
  // or repoGradesFolderSelection.ts's ALL_FOLDERS sentinel - and is only
  // ever changed by: an explicit dropdown pick (handleFolderChange below), a
  // genuine write-back drop (this block), or a course switch (folded into
  // the existing per-course reset block further down, which is this idiom's
  // OTHER trigger - see that block's own comment on which one wins if both
  // could fire in the same render). `currentSelectedFolder` is a PURE, cheap
  // re-derivation via resolveSelectedFolder on every render - never itself
  // stored - so a scan that is loading or has failed (`model` null,
  // `folderCensus.options` empty) always reads as "All folders" for display
  // without ever touching `selectedFolder` state (U1.6d: a folder must not
  // be dropped merely because a scan is in flight or failed).
  const [selectedFolder, setSelectedFolder] = useState<string>("");
  const [folderResolvedForKey, setFolderResolvedForKey] = useState<string | null>(null);
  const [folderDropNotice, setFolderDropNotice] = useState<string | null>(null);
  // Branch-merge check target (per course, ta-repo-grades-target-branch). Raw
  // text as typed; trimmed only at the grading call boundary below.
  const [targetBranch, setTargetBranch] = useState<string>(DEFAULT_TARGET_BRANCH);
  const folderCensus = scan ? buildFolderOptions(scan.repos) : { options: [], scannedRepos: 0, unknownRepos: 0 };
  const currentSelectedFolder = model ? resolveSelectedFolder(folderCensus.options, selectedFolder) : ALL_FOLDERS;
  // Keyed on the course AND the resolved folder set, so a narrower PREFIXED
  // re-scan (every keystroke into the org-prefix filter re-keys the scan -
  // RepoGradesControls.tsx's onOrgPrefixChange, useRepoGradesData.ts's
  // scanKey) is evaluated too, without ever persisting anything from it -
  // shouldPersistFolderDrop (not this key) is what decides that (section 5:
  // "the folder write-back must not fire on a filtered scan" - a folder
  // missing from a PREFIXED scan is merely hidden, not gone).
  const folderScanKey = model ? `${uiState.courseId}:${folderCensus.options.map((o) => o.folder).join(",")}` : null;
  if (folderScanKey !== null && folderScanKey !== folderResolvedForKey) {
    setFolderResolvedForKey(folderScanKey);
    if (
      currentSelectedFolder !== selectedFolder &&
      shouldPersistFolderDrop({ persisted: selectedFolder, resolved: currentSelectedFolder, orgPrefix: uiState.orgPrefix })
    ) {
      // U1.6b: explain the drop before overwriting it - `selectedFolder`
      // here is still the PRE-drop value (this branch's own condition above
      // already proved it differs from `currentSelectedFolder`), so this is
      // exactly the folder that just vanished from an unfiltered scan.
      setFolderDropNotice(
        `"${selectedFolder}" is no longer in this course's scanned repos, so this view now shows All folders.`
      );
      // U1.6c: write the drop back, so the stale folder cannot resurrect if
      // it reappears in a LATER scan later this same session.
      setSelectedFolder(currentSelectedFolder);
      persistFolderSelection(uiState.courseId, currentSelectedFolder);
    }
  }

  const handleFolderChange = (value: string) => {
    setSelectedFolder(value);
    setFolderDropNotice(null);
    persistFolderSelection(uiState.courseId, value);
  };

  // U1.3/U1.3b - the columns and rows the GRID actually renders, scoped to
  // `currentSelectedFolder`. DISPLAY ONLY: `displayedRows` never reaches
  // buildBulkGradePlan - useRepoGradesGradingActions below is still built
  // from `sortedRows` (the FULL row list), and that plan already skips
  // `missing-folder`/`scan-error` rows internally
  // (repoGradesBulkGrade.ts:95-110), so scoping rows here changes only what
  // is SHOWN, never what a bulk run covers (section 5: "row scoping is
  // DISPLAY-ONLY", AC U1.3b).
  const displayedColumns =
    currentSelectedFolder === ALL_FOLDERS
      ? columnsWithMapping
      : columnsWithMapping.filter((column) => column.folder === currentSelectedFolder);
  const displayedRows =
    currentSelectedFolder === ALL_FOLDERS
      ? sortedRows
      : sortedRows.filter((row) => row.cells[currentSelectedFolder]?.status === "ungraded");
  // RG-SEARCH-STICKY Wave B: the search query narrows ONLY the table body.
  // `displayedRows` above stays query-free and feeds every plan surface.
  const bodyRows = visibleRepoRows(displayedRows, uiState.searchQuery, showAll ? NO_GRADE_SET : selected);
  const matrix = buildRepoGradeMatrix(
    buildRepoGradesDashboard(cellEdits, scan, targetBranch),
    cellEdits, saved.results, columnsWithMapping, assignments, roster, effectiveStudentRepos, automaticBlocks.targets,
  );
  const changedSubmissions = useRepoChangedSubmissions(ownerId, selectedCourseId, scan, targetBranch,
    saved.results, !!targetedGrading && !scanLoading && !saved.pending && !saved.incomplete,
    targetedGrading?.status?.status === "loaded" && targetedGrading.status.enabled);
  const selectionFiltered = selectionFilterSummary({
    folderScopedCount: displayedRows.length,
    selectedShownCount: displayedRows.filter(({ repo }) => selected.has(repo)).length,
    showAll,
  })?.mode === "filtered";
  const gradebookRows = visibleRepoGradebookRows(
    matrix, sortedRows, bodyRows, currentSelectedFolder, uiState.searchQuery, selectionFiltered, uiState.sort,
  );
  const [gradeSelection, setGradeSelection] = useState<{ courseId: string | null; keys: Set<string> }>({ courseId: null, keys: new Set() });
  const selectedGradeCells = gradeSelection.courseId === selectedCourseId ? gradeSelection.keys : new Set<string>();
  const visibleFolders = currentSelectedFolder === ALL_FOLDERS ? matrix.columns : matrix.columns.filter(({ folder }) => folder === currentSelectedFolder);
  const visibleGradeCells = gradebookRows.flatMap(({ repos }) => repos.flatMap(({ name }) => visibleFolders
    .filter(({ folder }) => !!folder).map(({ folder }) => ({ repo: name, folder }))));
  const selectedVisibleCells = visibleGradeCells.filter(({ repo, folder }) => selectedGradeCells.has(gradeSelectionKey(repo, folder)));
  const toggleGradeCells = (targets: GradeSelection[]) => setGradeSelection((previous) => ({
    courseId: selectedCourseId,
    keys: toggleGradeSelection(previous.courseId === selectedCourseId ? previous.keys : new Set(), targets),
  }));
  const folderMissingCount =
    currentSelectedFolder === ALL_FOLDERS
      ? 0
      : sortedRows.filter((row) => row.cells[currentSelectedFolder]?.status === "missing-folder").length;
  const folderScanErrorCount =
    currentSelectedFolder === ALL_FOLDERS
      ? 0
      : sortedRows.filter((row) => row.cells[currentSelectedFolder]?.status === "scan-error").length;
  const folderEmptyStateMessage =
    currentSelectedFolder !== ALL_FOLDERS && sortedRows.length > 0 && displayedRows.length === 0
      ? `None of the scanned repos have a "${currentSelectedFolder}" folder.`
      : undefined;

  const handleAssignmentChange = (folder: string, assignmentId: string | null) => {
    const next = setRepoGradeAssignmentMapping(assignmentMapping, folder, assignmentId);
    setAssignmentMapping(next);
    persistAssignmentMapping(uiState.courseId, next);
  };

  const [postSummary, setPostSummary] = useState("");
  const [controlsCourseId, setControlsCourseId] = useState<string | null>(null);
  if (uiState.courseId !== controlsCourseId) {
    setControlsCourseId(uiState.courseId);
    setPostSummary("");
    setSelectedFolder(loadFolderSelection(uiState.courseId));
    setFolderDropNotice(null);
    setTargetBranch(loadTargetBranch(uiState.courseId));
  }

  const handleDiscardSavedResults = () => {
    if (!cellDraft || cellDraft.savePending) return;
    if (!window.confirm("Discard all saved grading results for this course? Graded scores and feedback on screen will be cleared. This cannot be undone.")) return;
    setPostSummary(drafts.discard(cellDraft.scope) ? "Saved results discarded for this course." : "");
  };

  // Rubric picker (docs/repo-grades-rubric-picker-acceptance-criteria.md) -
  // ONE hook instance, shared by RepoGradesControls' picker below and every
  // grading call in useRepoGradesGradingActions (item 16: two grading paths
  // must never resolve a rubric two different ways). `lmsRenderSourcesFor`
  // is the SAME live/export availability gate useRepoGradesData.ts already
  // uses for its own export-assignments load - reused here, not re-derived,
  // so this reads no state useRepoGradesData does not already compute from
  // `course` alone. `exportRubrics` is useRepoGradesData's own already-loaded
  // export content's rubric list (no second fetch); `onAnnounce` routes this
  // feature's one announcement channel (UX notes 3.3) through the SAME
  // action-outcome region LinkUsernamesPanel already uses
  // below, not a new live region.
  const lmsSources = course ? lmsRenderSourcesFor(course) : { live: false, export: false };
  const rubricSource = useRepoGradesRubricSource({
    courseId: uiState.courseId,
    course,
    exportRubrics,
    exportAvailable: lmsSources.export,
    exportLoading: exportAssignmentsLoading,
    exportError: exportAssignmentsError,
    liveAvailable: lmsSources.live,
    onAnnounce: setPostSummary,
  });

  // AC4 items 20-21 and AC5 (docs/repo-grades-view-acceptance-criteria.md):
  // per-cell score/comment edits, on-demand and bulk grading, and posting to
  // the live Canvas gradebook. Extracted into this hook once this file hit
  // the codebase's 1000-line cap - see that hook's own header comment for
  // the full rationale and the exact param surface.
  const {
    handleScoreChange,
    handleFeedbackFieldChange,
    handlePostColumn,
    handlePostOneCell,
    columnPosting,
    bulkRunningFolder,
    bulkProgress,
    bulkQueue,
    controlGradeColumn,
    controlGradeCell,
    trendsEntry,
  } = useRepoGradesGradingActions({
    accountId,
    cellScope,
    isCellScopeCurrent: () => drafts.isCurrent(cellScope),
    rows: sortedRows,
    cellEdits,
    setCellEdits: (update) => drafts.edit(cellScope, update),
    selected,
    instructions: uiState.instructions,
    resolveRubricForColumn: rubricSource.resolveRubricForColumn,
    columns: columnsWithMapping,
    useReadmeInstructions: uiState.useReadmeInstructions,
    bulkSelectionOnly: uiState.bulkSelectionOnly,
    runCodeScoring: uiState.runCodeScoring,
    applyNamingDeduction: uiState.applyNamingDeduction,
    targetBranch: targetBranch.trim() || undefined,
    courseId: uiState.courseId,
    course,
    provider,
    setPostSummary,
  });

  const startSavedGrade = async (folder: string, repo: string | null) => {
    if (!ownerId || !selectedCourseId || !targetedGrading || !targetRequests.ready) {
      setPostSummary("Saved repository grading is unavailable.");
      return;
    }
    const result = await targetedGrading.startTargeted(selectedCourseId, folder, repo);
    await targetRequests.refresh();
    setPostSummary(result.status === "started"
      ? "Saved repository grading queued for the background worker. Progress is shown in Startup repository checks; saved results refresh as grading finishes. Previously completed or uncertain attempts are not automatically regraded."
      : result.status === "busy"
        ? "This assignment or repository is already queued for grading."
        : "Saved repository grading could not be started.");
  };

  const controlTargetGrade = async (id: number, command: TargetCommand) => {
    if (!targetRequests.ready) {
      setPostSummary("Grading queue status is unavailable. Retry before changing a request.");
      return;
    }
    if (!await targetRequests.control(id, command)) setPostSummary("The grading request could not be updated. Refresh and try again.");
  };

  const gradeSelectedCells = async (cells: GradeSelection[]) => {
    if (!ownerId || !selectedCourseId || !targetedGrading || !targetRequests.ready) return;
    const rectangle = gradeSelectionRectangle(cells);
    if (cells.length > 1000) {
      setPostSummary("Select up to 1,000 cells at a time.");
      return;
    }
    const result = rectangle
      ? await targetedGrading.startBulk(selectedCourseId, rectangle.folders, rectangle.repos)
      : await targetedGrading.startCells(selectedCourseId, cells);
    await targetRequests.refresh();
    setPostSummary(result.status === "started" ? "Selected grades queued. Previously completed or uncertain attempts are not automatically regraded."
      : result.status === "busy" ? "This selection is already queued for grading."
        : result.status === "too-many" ? "Select up to 1,000 cells at a time."
        : "The selected grades could not be queued.");
  };

  const missingOrg = !!course && !(course.githubOrg ?? "").trim();
  // U4.19d state (f): the assignments load succeeded, cleanly, with nothing
  // in it - distinct from still-loading, errored, or blocked-by-the-gate,
  // each of which RepoGradesStatusBanners already renders from its own prop.
  const assignmentsEmpty = !canvasGateBlockedReason && !assignmentsLoading && !assignmentsError && assignments.length === 0;

  return (
    // U0c/U6.26a: no nested container here. page.tsx:238 already wraps every
    // tab panel in styles.tabContainer, and page.tsx:385-387 wraps this view
    // in <TabShell>, which supplies .card (gap: 28px; padding: 36px) - so
    // this view already gets its padding and inter-section gap from the two
    // shells around it. Rendering a THIRD `styles.tabContainer` here (as this
    // file used to) sets `gap: 0` on top of that, which is what removed every
    // vertical gap between the header, controls, banners, link panel, grid
    // below. A plain fragment adds no frame and no gap override.
    <>
      <TabHeader
        eyebrow="Grading"
        title="Repo Grades"
        subtitle="Review repository grades and feedback by class."
      />
      <RepoGradesGithubQuota />
      <Accordion disableGutters elevation={0}>
        <AccordionSummary expandIcon={<SvgIcon><path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z" /></SvgIcon>}>
          <Stack spacing={0.5}>
            <Typography variant="subtitle2">Grading settings and status</Typography>
            <RepoGradesStartupBrief />
            {(coursesError || missingOrg || scanError || rosterError || assignmentsError || canvasGateBlockedReason || assignmentsEmpty || scan?.truncated || scan?.rateLimit) &&
              <Typography component="span" variant="body2" color="warning.main" role="status">Run setup needs attention</Typography>}
          </Stack>
        </AccordionSummary>
        <AccordionDetails sx={{ display: "grid", gap: 2 }}>
          <RepoGradesStartupStatus />
          <RepoGradeReservationRecovery />
      {(course && cellDraft || trendsEntry) && <Box component="section">
          <Typography variant="subtitle2">Grading profiles and saved data</Typography>
          {course && cellDraft && <RepoGradesDashboard key={course.id} courseId={course.id} gradeColumns={columnsWithMapping} />}
          {trendsEntry && <div>
            <p className={pageStyles.fieldHint}>{repoRunTrendsLabel(trendsEntry)}</p>
            <ClassTrendsPanel entry={trendsEntry} defaultExpanded
              identity={{ kind: "unavailable", reason: REPO_TRENDS_SUBSET_UNAVAILABLE_REASON }} />
          </div>}
          {cellDraft && <div>
            {cellDraft.restoredNotice && <p className={pageStyles.fieldHint}>{cellDraft.restoredNotice}</p>}
            {(cellDraft.discardNotice || cellDraft.saveNotice) && <p className={pageStyles.fieldHint} role="status">
              {[cellDraft.discardNotice, cellDraft.saveNotice].filter(Boolean).join(" ")}
            </p>}
            <Button type="button" size="small" disabled={cellDraft.savePending} onClick={handleDiscardSavedResults}>
              Discard saved results for this course
            </Button>
          </div>}
        </Box>}

      <Box component="section" sx={{ display: "grid", gap: 2 }}>
        <Typography variant="subtitle2">Run setup</Typography>
      <RepoGradesControls
        courses={courses}
        coursesLoading={coursesLoading}
        coursesError={coursesError}
        courseId={uiState.courseId}
        onCourseIdChange={handleCourseIdChange}
        showOrgPrefixFilter={!!course && !missingOrg}
        orgPrefix={uiState.orgPrefix}
        onOrgPrefixChange={(value) => setUiState((prev) => ({ ...prev, orgPrefix: value }))}
        showRowDependentFields={!!model && model.rows.length > 0}
        instructions={uiState.instructions}
        onInstructionsChange={(value) => setUiState((prev) => ({ ...prev, instructions: value }))}
        rubricSourceValue={rubricSource.value}
        rubricSourceOptions={rubricSource.options}
        onRubricSourceChange={rubricSource.onChange}
        rubricTextareaValue={rubricSource.textareaValue}
        rubricTextareaReadOnly={rubricSource.textareaReadOnly}
        rubricResolving={rubricSource.resolving}
        onRubricTextChange={rubricSource.onManualTextChange}
        onRestoreManualRubric={rubricSource.restoreManualText}
        rubricStaleNote={rubricSource.staleChoiceNote}
        rubricLiveHint={rubricSource.liveRubricHint}
        rubricExportHint={rubricSource.exportRubricHint}
        useReadmeInstructions={uiState.useReadmeInstructions}
        onUseReadmeInstructionsChange={(value) => setUiState((prev) => ({ ...prev, useReadmeInstructions: value }))}
        bulkSelectionOnly={uiState.bulkSelectionOnly}
        onBulkSelectionOnlyChange={(value) => setUiState((prev) => ({ ...prev, bulkSelectionOnly: value }))}
        runCodeScoring={uiState.runCodeScoring}
        onRunCodeScoringChange={(value) => setUiState((prev) => ({ ...prev, runCodeScoring: value }))}
        applyNamingDeduction={uiState.applyNamingDeduction}
        onApplyNamingDeductionChange={(value) => setUiState((prev) => ({ ...prev, applyNamingDeduction: value }))}
        settingsOpen={effectiveOpen(uiState.settingsOpen, currentSelectedFolder === ALL_FOLDERS)}
        onSettingsOpenChange={(value) => setUiState((prev) => ({ ...prev, settingsOpen: value }))}
      />
      <RepoGradesStatusBanners
        hasCourse={!!course} coursesLoading={coursesLoading} courseName={course?.name ?? ""}
        canvasGateBlockedReason={canvasGateBlockedReason} missingOrg={missingOrg} scanError={scanError}
        rosterLoading={rosterLoading} rosterError={rosterError} assignmentsLoading={assignmentsLoading}
        assignmentsError={assignmentsError} assignmentsEmpty={assignmentsEmpty} scanTruncated={!!scan?.truncated}
        rateLimitMessage={scan?.rateLimit?.message ?? null} />
      </Box>
        </AccordionDetails>
      </Accordion>
      <RepoGradeCourseFilters
        courses={courses}
        courseId={uiState.courseId}
        onCourseIdChange={handleCourseIdChange}
      />
      <RepoGradesLoadingStatus label={coursesLoading ? "Loading classes…"
        : course && scanLoading ? `Scanning ${course.githubOrg?.trim()} on GitHub for ${course.name}…` : null} />
      {changedSubmissions.count > 0 && <Button size="small" disabled={changedSubmissions.pending}
        onClick={() => void changedSubmissions.enqueue()}>Grade changed submissions ({changedSubmissions.count})</Button>}
      {changedSubmissions.notice && <Alert severity="info" role="status">{changedSubmissions.notice}</Alert>}
      {scan?.repos.some((repo) => repo.partial) && <Alert severity="warning" role="status">
        Some repositories contain submodules or unsupported entries that were not scanned. Listed folders may be incomplete.
      </Alert>}

      {/* AC5 item 31 / U5.20: results are announced through a role="status"
          aria-live="polite" region, matching TasksTab.tsx:717. This is the
          ONLY region that reports post outcomes - per-cell status text is
          also visible directly in the grid, but this is the one a screen
          reader user does not have to go hunting through the table for.
          U5.20's fix: this region must be VISIBLE, not only reachable via
          assistive tech - a sighted instructor who clicks "Grade all" on an
          already-graded column previously saw nothing happen, because the
          only render of postSummary sat inside gridStyles.srOnly (clip-path:
          inset(50%), a 1x1px box). Keeping the region screen-reader-only
          while adding a separate visible copy would be an ARIA inversion (two
          live regions racing for the same announcement); this is the single
          region, moved to a visible surface, styled with existing tokens
          only - a quiet inline notice, not a modal. Rendered only when there
          is something to say, so it never occupies space with an empty
          box. */}
      {postSummary && (
        <p role="status" aria-live="polite" className={gridStyles.statusBanner}>
          {postSummary}
        </p>
      )}

      {/* A16 wave 3 (docs/a16-wave3-scope.md section 7.4): the last "Grade
          all" run's trends, gated on trendsEntry alone - no role/aria-live,
          matching classTrendsFolderEntry.ts's own header on why this is a
          reachability change, not a second live region. */}

      {/* U1.3b - named counts, DISPLAY ONLY (see RepoGradesFolderHint). */}
      {model && currentSelectedFolder !== ALL_FOLDERS && (
        <RepoGradesFolderHint
          folder={currentSelectedFolder}
          shown={displayedRows.length}
          missing={folderMissingCount}
          scanErrors={folderScanErrorCount}
        />
      )}
      {/* A5 (Ruling A5-6/A5-9) - the only place this page states that a row's
          GitHub link opens the branch RECORDED AT SCAN TIME. Gated on a
          specific folder: in the ALL_FOLDERS view the link pins no branch, so
          this sentence would be false there. */}
      {model && currentSelectedFolder !== ALL_FOLDERS && (
        <p className={pageStyles.fieldHint}>Links open the branch recorded when the repos were scanned.</p>
      )}

      {/* RG-SEARCH-STICKY Wave A: one shell encloses the sticky working header
          (the column header below it owns Grade/Post) and the grid. */}
      <RepoGradesStickyHeader
        searchQuery={uiState.searchQuery}
        rescanControl={course && (!missingOrg || ownerId) ? (
          <Button type="button" size="small" aria-disabled={scanLoading || saved.pending}
            startIcon={scanLoading || saved.pending ? <CircularProgress size={16} color="inherit" aria-hidden="true" /> : undefined}
            onClick={() => {
              if (scanLoading || saved.pending) return;
              if (!missingOrg) reloadScan();
              if (ownerId) saved.refresh();
            }}>
            {scanLoading ? "Scanning GitHub…" : saved.pending ? "Loading saved results…" : "Refresh gradebook"}
          </Button>
        ) : null}
        folderControl={model && model.rows.length > 0 ? <RepoGradesFolderPicker folderOptions={folderCensus.options} folderCensus={{ scannedRepos: folderCensus.scannedRepos, unknownRepos: folderCensus.unknownRepos }} selectedFolder={currentSelectedFolder} onSelectedFolderChange={handleFolderChange} folderDropNotice={folderDropNotice} /> : null}
        statusBanner={bulkRunningFolder ? (
          <RepoGradesColumnProgress folder={bulkRunningFolder} progress={bulkProgress} state={bulkQueue?.folderState} />
        ) : null}
        targetBranchControl={
          <label className={styles.headerField}>
            <span className={styles.headerInputLabel}>Target branch</span>
            <InputBase
              type="text"
              fullWidth
              slots={{ root: "span" }}
              slotProps={{ input: { className: styles.headerInput, "aria-label": "Target branch (merged to)" } }}
              placeholder="Blank = each repo's default branch"
              value={targetBranch}
              onChange={(e) => {
                setTargetBranch(e.target.value);
                persistTargetBranch(uiState.courseId, e.target.value);
              }}
            />
          </label>
        }
        gradeSetControl={model ? <RepoGradesGradeSetTypeahead rows={displayedRows} selected={selected} onToggleRepo={toggleSelected} onClearSelection={() => { setSelected(new Set()); persistSelectedRepoIds(new Set()); }} showAll={showAll} onShowAllChange={setShowAll} /> : null}
        onSearchChange={(value) => setUiState((prev) => ({ ...prev, searchQuery: value }))}
      >
      <RepoGradeAutomaticBlockNotice discoveryExplanation={automaticBlocks.discoveryExplanation}
        pastRunStartedAt={automaticBlocks.pastRunStartedAt} unavailable={automaticBlocks.unavailable}
        reloading={automaticBlocks.reloading} reloadReasons={automaticBlocks.reloadReasons} />
      {course && cellDraft && (
        <>
        {targetRequests.unavailable && <Alert severity="warning" action={<Button size="small" onClick={() => { void targetRequests.refresh(); }}>Retry</Button>}>
          Grading queue status is unavailable. Displayed request statuses may be out of date; grading controls are disabled until status is restored.
        </Alert>}
        {ownerId && !targetRequests.ready && !targetRequests.unavailable && <Typography variant="caption" role="status">Loading grading queue…</Typography>}
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }} role="toolbar" aria-label="Gradebook bulk actions">
          <FormControlLabel label="Select all visible cells" control={<Checkbox size="small"
            checked={visibleGradeCells.length > 0 && selectedVisibleCells.length === visibleGradeCells.length}
            indeterminate={selectedVisibleCells.length > 0 && selectedVisibleCells.length < visibleGradeCells.length}
            disabled={!visibleGradeCells.length} onChange={() => toggleGradeCells(visibleGradeCells)} />} />
          <Button size="small" disabled={!targetedGrading || !targetRequests.ready || !visibleGradeCells.length || targetedGrading.pending}
            onClick={() => { void gradeSelectedCells(visibleGradeCells); }}>Grade all visible</Button>
          <Button size="small" disabled={!targetedGrading || !targetRequests.ready || !selectedVisibleCells.length || targetedGrading.pending}
            onClick={() => { void gradeSelectedCells(selectedVisibleCells); }}>Grade selected ({selectedVisibleCells.length})</Button>
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
          {visibleFolders.some(({ folder }) => !folder) && "Repository root assignments are excluded from bulk grading. "}
          Previously completed or uncertain attempts are not automatically regraded.
        </Typography>
        <RepoGradesGrid
          columns={displayedColumns}
          rows={displayedRows}
          resultColumns={matrix.columns}
          gradebookRows={gradebookRows}
          selectedFolder={currentSelectedFolder}
          sort={uiState.sort}
          onSortChange={(value) => setUiState((prev) => ({ ...prev, sort: value }))}
          selected={selected}
          onToggleSelected={toggleSelected}
          assignments={assignments}
          cellEdits={cellEdits}
          onScoreChange={handleScoreChange}
          onFeedbackFieldChange={handleFeedbackFieldChange}
          onGradeCell={(row, column) => { void startSavedGrade(column.folder, row.repo); }}
          onGradeTarget={(repo, folder) => { void startSavedGrade(folder, repo); }}
          onAssignmentChange={handleAssignmentChange}
          onPostColumn={handlePostColumn}
          onPostOneCell={handlePostOneCell}
          columnPosting={columnPosting}
          onGradeColumn={(folder) => { void startSavedGrade(folder, null); }}
          durableGradeAvailable={!!targetedGrading && !!ownerId && !!selectedCourseId && targetRequests.ready}
          durableGradePending={!!targetedGrading?.pending || !targetRequests.ready}
          targetRequests={targetRequests.requests}
          targetCourseId={selectedCourseId ?? ""}
          onControlTarget={(id, command) => { void controlTargetGrade(id, command); }}
          selectedGradeCells={selectedGradeCells}
          onToggleGradeCells={toggleGradeCells}
          describeColumnRubric={rubricSource.describeColumn}
          bulkRunningFolder={bulkRunningFolder}
          bulkProgress={bulkProgress}
          bulkQueue={bulkQueue}
          onControlGradeColumn={controlGradeColumn}
          onControlGradeCell={controlGradeCell}
          bulkSelectionOnly={uiState.bulkSelectionOnly}
          scanTruncated={!!scan?.truncated}
          emptyStateMessage={folderEmptyStateMessage}
          loading={scanLoading || saved.pending}
          // Task B: the disclosure only applies to the embedded engine's own
          // "Code runs" criterion (canvas/grades.ts:88-89 skips any rubric
          // area with no matching Canvas criterion) - the LLM engine never
          // adds one, so this is false whenever `provider` is not "embedded"
          // even if the toggle itself is on.
          codeScoringDisclosure={provider === "embedded" && uiState.runCodeScoring}
        />
        </>
      )}
      </RepoGradesStickyHeader>

      {saved.incomplete && (
        <p className={pageStyles.fieldHint} role="status">Saved results are incomplete. Older or unavailable attempts may be missing.</p>
      )}
      {(saved.hasOlder || saved.olderComplete) && (
        <Button type="button" size="small" aria-disabled={saved.pending || saved.olderComplete} onClick={saved.loadOlder}>
          {saved.olderComplete ? "All saved results loaded"
            : saved.pending ? "Loading saved results…" : "Load older results"}
        </Button>
      )}
    </>
  );
}
