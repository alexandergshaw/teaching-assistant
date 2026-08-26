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
import { useEffect, useRef, useState } from "react";
import { useLlmProvider } from "@/lib/llm-provider";
import TabHeader from "../TabHeader";
import { useRepoGradesData } from "./useRepoGradesData";
import {
  loadAssignmentMapping,
  loadFolderSelection,
  loadRepoGradeLog,
  loadRepoGradesUiState,
  loadSelectedRepoIds,
  persistAssignmentMapping,
  persistFolderSelection,
  persistRepoGradeLog,
  persistRepoGradesUiState,
  persistSelectedRepoIds,
  type RepoGradesUiState,
} from "./repoGradesUiState";
import {
  ALL_FOLDERS,
  buildFolderOptions,
  resolveSelectedFolder,
  shouldPersistFolderDrop,
} from "./repoGradesFolderSelection";
import {
  appendRepoGradeLogEntries,
  type RepoGradeLogEntry,
  type RepoGradeLogEventKind,
} from "./repoGradesLog";
import RepoGradesLogPanel from "./RepoGradesLogPanel";
import RepoGradesControls from "./RepoGradesControls";
import RepoGradesStatusBanners from "./RepoGradesStatusBanners";
import LinkUsernamesPanel from "./LinkUsernamesPanel";
import { linkUsernamesLogDetail } from "./linkRepoUsernames";
import { confirmableBindingSummary, partitionConfirmableBindings } from "./repoGradesBindingConfirm";
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
import {
  EMPTY_REPO_GRADE_CELL_EDITS,
  type RepoGradeCellEditsByRepo,
} from "./repoGradesCellEdits";
import RepoGradesGrid from "./RepoGradesGrid";
import { useRepoGradesGradingActions } from "./useRepoGradesGradingActions";
import gridStyles from "./repo-grades.module.css";
import pageStyles from "../../page.module.css";

// AC2 item 7 (reframed by this wave): the instructor complaint this wave
// fixes is that the grid's own empty state used to NAME this workflow step
// and tell the instructor to go run it on a different screen, instead of
// putting the mechanism on this page. LinkUsernamesPanel (rendered above the
// grid below, gated on `course` alone) now IS that mechanism, and its own
// copy already owns the literal "No repos are confirmed-bound to a roster
// student yet." empty-state sentence (LinkUsernamesPanel.tsx, gated on the
// same `noConfirmedRows` value this file computes) - so the banner further
// below deliberately does NOT repeat that sentence a second time; that
// surface-ownership decision is called out again at the banner itself. This
// constant still exists only so the step's exact UI label
// (steps.course-setup.rosters.ts:35's `name` field) appears verbatim in the
// banner's own copy too, not a paraphrase - a support-doc or screenshot
// search for the step's real name should still find this text even though
// the banner no longer instructs anyone to go run that step elsewhere.
const LINK_GITHUB_USERNAMES_STEP_LABEL = "Link GitHub usernames to roster";

export default function RepoGradesTab() {
  const [uiState, setUiState] = useState<RepoGradesUiState>(() => loadRepoGradesUiState());
  const [provider] = useLlmProvider();

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
    acceptBinding,
    // Renamed from `linkBlockedReason` - it only ever blocked the LIVE
    // Canvas-submissions link below, never the course-table one.
    liveLinkBlockedReason,
    linkGithubUsernames,
    confirmSuggestedBindings,
    // This wave's fix (full explanation at the `model` comment below): the
    // course tile's hand-maintained roster link, folded in as a derived
    // overlay on top of course.studentRepos.
    effectiveStudentRepos,
    rosterOverlay,
    linkFromCourseRoster,
    // LinkUsernamesPanel's merged live-Canvas-plus-saved-export assignment
    // options, plus the export list's own loading/error state.
    assignmentOptions,
    exportAssignmentsLoading,
    exportAssignmentsError,
  } = useRepoGradesData(uiState.courseId, uiState.orgPrefix);

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
  const model = scan ? buildRepoGradeGridModel(scan.repos, roster, effectiveStudentRepos, uiState.orgPrefix) : null;
  const sortedRows = model ? sortRepoGradeRows(model.rows, uiState.sort) : [];
  // AC2 item 7 sibling: rows currently in the "suggested" binding state - a
  // link just produced one, or the grid's own name-based guess did, and the
  // two are indistinguishable here on purpose (confirmSuggestedBindings and
  // RepoBindingControl.tsx's own per-row "Confirm binding" button treat them
  // identically). Read off `sortedRows`, not `model.rows`: the count shown to
  // the instructor and the actual confirm-all payload must both be built from
  // EXACTLY the rows the grid currently displays, in the order the
  // instructor sees them - `model.rows`'s order can differ once a sort is
  // applied, and a batch action should never disagree with what is on screen
  // when it runs.
  const suggestedRows = sortedRows.filter((row) => row.binding.state === "suggested");
  // U9.36/U9.37: not every "suggested" row can safely be confirmed - the
  // course-table roster link (rosterUsernameOverlay.ts:144-147) produces
  // suggested rows whose candidate carries no Canvas user id at all, and
  // confirming one writes a binding that re-derives as UNBOUND on the next
  // render (repo-student-bindings.ts:156-159). `confirmableBindingSummary`
  // is the SAME computation `handleConfirmAllSuggested` below partitions
  // its payload from, so the batch button's label (rendered by
  // LinkUsernamesPanel) and the write it triggers can never disagree.
  const suggestedBindingCandidates = suggestedRows.map((row) => ({
    repo: row.repo,
    candidate: row.binding.candidates[0],
  }));
  const confirmableSummary = confirmableBindingSummary(suggestedBindingCandidates);

  const [selected, setSelected] = useState<Set<string>>(() => new Set());
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
    const next = new Set(selected);
    if (next.has(repo)) next.delete(repo);
    else next.add(repo);
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
    // L1 item 8: which assignment a column posts to is the single setting
    // most able to send a whole column's grades to the wrong place, so the
    // change is recorded with the assignment's NAME as well as its id - an id
    // alone is unreadable months later, and the name is only resolvable while
    // `assignments` is still loaded.
    const assignmentName = assignmentId ? (assignments.find((a) => a.id === assignmentId)?.name ?? assignmentId) : "";
    recordLog([
      buildLogEntry("assignment-mapped", {
        folder,
        assignmentId: assignmentId ?? "",
        detail: assignmentId ? `Mapped to "${assignmentName}"` : "Mapping cleared",
      }),
    ]);
  };

  // L1 item 7: a binding decides WHICH student a later post lands on, so it
  // belongs in the same trail as the grades themselves. This wrapper only
  // observes - it forwards useRepoGradesData's own acceptBinding result
  // through unchanged, and records nothing when that call reports an error,
  // so the log never claims a binding that did not actually persist.
  const handleAcceptBinding = async (repo: string, canvasUserId: string, student: string, username: string | null) => {
    const result = await acceptBinding(repo, canvasUserId, student, username);
    if ("ok" in result) {
      recordLog([
        buildLogEntry("binding-confirmed", {
          repo,
          detail: `Bound to ${student}${username ? ` (${username})` : ""}, Canvas user ${canvasUserId}`,
        }),
      ]);
    }
    return result;
  };

  // Companion to handleAcceptBinding above, same spirit: linking usernames
  // decides which repos become SUGGESTED bindings (never confirmed ones - see
  // LinkUsernamesPanel.tsx's header comment on the "honest two-step"), and
  // the Canvas assignment read that grounds it is worth a durable record for
  // the same reason a binding accept is. Forwards useRepoGradesData's own
  // linkGithubUsernames result UNCHANGED and records nothing when it reports
  // an error, so the log can never claim a link that did not actually
  // persist - the same rule handleAcceptBinding follows above.
  const handleLinkUsernames = async (assignmentId: string, assignmentName: string) => {
    const result = await linkGithubUsernames(assignmentId, assignmentName);
    if (!("error" in result)) {
      recordLog([
        buildLogEntry("usernames-linked", {
          assignmentId: result.assignmentId,
          detail: linkUsernamesLogDetail(result),
        }),
      ]);
    }
    return result;
  };

  // Confirms every currently-suggested row in one write - the "Confirm all"
  // half of the two-step LinkUsernamesPanel.tsx describes, since linking only
  // ever produces suggested rows. Built from each row's own top candidate -
  // the SAME candidate RepoBindingControl.tsx's per-row "Confirm binding"
  // button would use for that exact row - so a batch confirm can never bind a
  // repo to a student the per-row control would not also have offered. A row
  // whose candidate is missing (should not happen for a "suggested" row, but
  // the type does not guarantee it) is dropped rather than sent as a
  // malformed binding. The dangerous-count window.confirm for this action
  // lives in LinkUsernamesPanel.tsx itself, not here - a second confirm here
  // would double-prompt for the same click.
  const handleConfirmAllSuggested = async () => {
    // U9.37: never send a candidate the confirm-binding guard would reject -
    // partitionConfirmableBindings is the single source of truth for which
    // rows may be written, shared with RepoBindingControl.tsx's own per-row
    // guard (U9.36) so the batch path and the single-row path can never
    // disagree about what counts as confirmable.
    const { confirmable } = partitionConfirmableBindings(suggestedBindingCandidates);
    const bindings = confirmable.map((entry) => ({
      repo: entry.repo,
      canvasUserId: entry.canvasUserId,
      student: entry.student,
    }));
    const result = await confirmSuggestedBindings(bindings);
    if (!("error" in result)) {
      // One entry PER binding, same detail shape handleAcceptBinding uses
      // above (minus the optional username, which a suggested candidate does
      // not carry) - so the log reads a batch confirm as N individual
      // confirmations, indistinguishable from N per-row clicks.
      recordLog(
        bindings.map((binding) =>
          buildLogEntry("binding-confirmed", {
            repo: binding.repo,
            detail: `Bound to ${binding.student}, Canvas user ${binding.canvasUserId}`,
          })
        )
      );
    }
    return result;
  };

  // Companion to handleLinkUsernames above, for the OTHER source this wave
  // adds: applying usernames already saved in the course table's Roster tile
  // instead of reading them fresh off Canvas (see the `model` comment above
  // for the actual fix). Forwards linkFromCourseRoster's result UNCHANGED and
  // records nothing on error - the same rule handleAcceptBinding and
  // handleLinkUsernames both follow. Reuses the SAME "usernames-linked" log
  // kind (another way a repo becomes SUGGESTED via a linked username, not a
  // new event kind), with detail text naming the course table as the source.
  const handleLinkFromCourseRoster = async () => {
    const result = await linkFromCourseRoster();
    if (!("error" in result)) {
      recordLog([
        buildLogEntry("usernames-linked", {
          detail:
            `Linked from the course table roster - matched ${result.matched}, added ${result.added}` +
            (result.withoutCanvasId > 0 ? `, ${result.withoutCanvasId} without a Canvas user id` : "") +
            ".",
        }),
      ]);
    }
    return result;
  };

  // ---- per-cell editable state (AC4 items 20-21) - ephemeral UI memory,
  // never persisted to localStorage (a typed but un-posted score surviving a
  // reload would be surprising, and this codebase's own precedent -
  // GradingResults.tsx's `edits`/`postStatus` - does not persist these
  // either). Reset whenever the selected course changes, via the same
  // render-phase compare-and-adjust idiom the selection Set above uses, so
  // switching courses cannot leave a prior course's in-progress edits
  // visible against a different course's repos. The per-column posting busy
  // state (`columnPosting`) lives in useRepoGradesGradingActions now - it
  // gets the SAME courseId and does its OWN render-phase reset in lockstep
  // with this branch (see that hook's header comment). --------------------
  const [cellEdits, setCellEdits] = useState<RepoGradeCellEditsByRepo>(EMPTY_REPO_GRADE_CELL_EDITS);
  const [postSummary, setPostSummary] = useState("");
  // ---- the activity log (docs/repo-grades-activity-log-acceptance-criteria.md).
  // Unlike cellEdits above this one DOES persist (L3): it is the record of
  // what this view did to a live gradebook, and postCanvasGradesAction keeps
  // no such record anywhere else - not in Canvas's own UI beyond the final
  // score, and not on our server at all. It is restored per course in the
  // very same compare-and-adjust branch that resets the ephemeral cell state,
  // so a course switch always swaps BOTH together and one course's log can
  // never be shown, appended to, or persisted under another course's id.
  const [log, setLog] = useState<readonly RepoGradeLogEntry[]>([]);
  const [cellStateResetForCourse, setCellStateResetForCourse] = useState<string | null>(null);
  if (uiState.courseId !== cellStateResetForCourse) {
    setCellStateResetForCourse(uiState.courseId);
    setCellEdits(EMPTY_REPO_GRADE_CELL_EDITS);
    setPostSummary("");
    setLog(loadRepoGradeLog(uiState.courseId));
    // U1.5/U1.6 - folded in here rather than a separate branch, per this
    // feature's own design note above: this block IS index.tsx's "the course
    // changed" trigger already (it resets cellEdits/postSummary/log
    // together for the identical reason). The folder restore's OTHER
    // trigger - the scan settling, above near `model` - runs EARLIER in this
    // file's top-to-bottom render order, so if both could ever fire in the
    // SAME render, this course-switch write runs LAST and is authoritative
    // for what is displayed starting next render. In practice the two never
    // act on stale data in the same render: `model` only ever reflects the
    // CURRENT `uiState.courseId` (useRepoGradesData's scanKey embeds it), so
    // a courseId change nulls `model` synchronously in THIS SAME render
    // (scanMatches becomes false against the new scanKey) - the scan-settle
    // branch above therefore sees `model === null` and does nothing until a
    // later render, by which point this reset has already run.
    setSelectedFolder(loadFolderSelection(uiState.courseId));
    setFolderDropNotice(null);
  }

  // The log is the ONE piece of state in this file persisted from an effect
  // rather than from its explicit mutators, and the reason is concurrency,
  // not convenience: two "Grade" calls (or a column post and a grade) can be
  // in flight at once, and each resolves with a closure over the `log` value
  // from ITS render - so computing `next` at each call site and persisting
  // that would let the slower handler write a log missing the faster one's
  // entries. Appending inside the setState updater (pure array math, safe to
  // re-run) is what keeps concurrent appends correct, and this effect then
  // persists whatever those appends actually produced.
  //
  // The first-commit hazard this file's other comments warn about
  // (an effect firing with an untouched default and overwriting real stored
  // data before the restore branch has run) is closed by the
  // `cellStateResetForCourse !== courseId` guard: that branch above runs
  // during render and is what makes the two equal, so this effect cannot fire
  // with `log`'s pre-restore `[]` for a course whose stored log has not been
  // read yet.
  useEffect(() => {
    if (cellStateResetForCourse !== uiState.courseId) return;
    persistRepoGradeLog(uiState.courseId, log);
  }, [log, uiState.courseId, cellStateResetForCourse]);

  /** Builds one entry, stamped now, already carrying this view's course
   * identity - callers only supply what is specific to their event. Every
   * field defaults to "" (never null/absent) so a CSV row always has the same
   * column count (L2 item 10). */
  const buildLogEntry = (
    kind: RepoGradeLogEventKind,
    fields: Partial<Omit<RepoGradeLogEntry, "kind" | "at" | "courseId" | "courseName">> = {}
  ): RepoGradeLogEntry => ({
    at: new Date().toISOString(),
    kind,
    courseId: uiState.courseId,
    courseName: course?.name ?? "",
    repo: "",
    folder: "",
    assignmentId: "",
    score: "",
    detail: "",
    ...fields,
  });

  const recordLog = (entries: readonly RepoGradeLogEntry[]) => {
    if (entries.length === 0) return;
    setLog((prev) => appendRepoGradeLogEntries(prev, entries));
  };

  // L1 item 9: a failed org scan is recorded ONCE per distinct message, never
  // once per render - `scanError` is a value that survives re-renders, so
  // appending it unconditionally from an effect keyed on it would still be
  // safe, but a re-scan that fails the same way twice deserves a second
  // entry while a re-render deserves none. A ref (not state) holds the
  // last-recorded message: writing state here is exactly what
  // react-hooks/set-state-in-effect forbids, and this value is bookkeeping
  // that must never itself trigger a render.
  const lastLoggedScanError = useRef<string | null>(null);
  useEffect(() => {
    if (!scanError) {
      lastLoggedScanError.current = null;
      return;
    }
    if (lastLoggedScanError.current === scanError) return;
    lastLoggedScanError.current = scanError;
    recordLog([buildLogEntry("scan-failed", { detail: scanError })]);
    // recordLog/buildLogEntry are redefined every render by design (they close
    // over the current course); depending on them here would re-run this
    // effect constantly. The ref guard above is what makes that safe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanError]);

  // AC4 items 20-21 and AC5 (docs/repo-grades-view-acceptance-criteria.md):
  // per-cell score/comment edits, on-demand and bulk grading, and posting to
  // the live Canvas gradebook. Extracted into this hook once this file hit
  // the codebase's 1000-line cap - see that hook's own header comment for
  // the full rationale and the exact param surface.
  const {
    handleScoreChange,
    handleCommentChange,
    handleGradeCell,
    handlePostColumn,
    handlePostOneCell,
    columnPosting,
    handleGradeColumn,
    bulkRunningFolder,
    bulkProgress,
  } = useRepoGradesGradingActions({
    rows: sortedRows,
    cellEdits,
    setCellEdits,
    selected,
    instructions: uiState.instructions,
    rubric: uiState.rubric,
    useReadmeInstructions: uiState.useReadmeInstructions,
    bulkSelectionOnly: uiState.bulkSelectionOnly,
    courseId: uiState.courseId,
    course,
    provider,
    recordLog,
    buildLogEntry,
    setPostSummary,
  });

  const missingOrg = !!course && !(course.githubOrg ?? "").trim();
  const noConfirmedRows = !!model && model.rows.length > 0 && model.rows.every((row) => row.binding.state !== "confirmed");
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
    // and log below. A plain fragment adds no frame and no gap override.
    <>
      <TabHeader
        eyebrow="Grading"
        title="Repo Grades"
        subtitle="Grade every student's GitHub repo folder by folder and post the results to the Canvas gradebook."
      />

      <RepoGradesControls
        courses={courses}
        coursesLoading={coursesLoading}
        coursesError={coursesError}
        courseId={uiState.courseId}
        onCourseIdChange={(value) => setUiState((prev) => ({ ...prev, courseId: value }))}
        showOrgPrefixFilter={!!course && !missingOrg}
        orgPrefix={uiState.orgPrefix}
        onOrgPrefixChange={(value) => setUiState((prev) => ({ ...prev, orgPrefix: value }))}
        scanLoading={scanLoading}
        onRefreshScan={() => reloadScan()}
        showRowDependentFields={!!model && model.rows.length > 0}
        sort={uiState.sort}
        onSortChange={(value) => setUiState((prev) => ({ ...prev, sort: value }))}
        folderOptions={folderCensus.options}
        folderCensus={{ scannedRepos: folderCensus.scannedRepos, unknownRepos: folderCensus.unknownRepos }}
        selectedFolder={currentSelectedFolder}
        onSelectedFolderChange={handleFolderChange}
        folderDropNotice={folderDropNotice}
        instructions={uiState.instructions}
        onInstructionsChange={(value) => setUiState((prev) => ({ ...prev, instructions: value }))}
        rubric={uiState.rubric}
        onRubricChange={(value) => setUiState((prev) => ({ ...prev, rubric: value }))}
        useReadmeInstructions={uiState.useReadmeInstructions}
        onUseReadmeInstructionsChange={(value) => setUiState((prev) => ({ ...prev, useReadmeInstructions: value }))}
        bulkSelectionOnly={uiState.bulkSelectionOnly}
        onBulkSelectionOnlyChange={(value) => setUiState((prev) => ({ ...prev, bulkSelectionOnly: value }))}
      />

      <RepoGradesStatusBanners
        hasCourse={!!course}
        coursesLoading={coursesLoading}
        courseName={course?.name ?? ""}
        canvasGateBlockedReason={canvasGateBlockedReason}
        missingOrg={missingOrg}
        githubOrg={course?.githubOrg ?? ""}
        scanLoading={scanLoading}
        scanError={scanError}
        rosterLoading={rosterLoading}
        rosterError={rosterError}
        assignmentsLoading={assignmentsLoading}
        assignmentsError={assignmentsError}
        assignmentsEmpty={assignmentsEmpty}
        scanTruncated={!!scan?.truncated}
        rateLimitMessage={scan?.rateLimit?.message ?? null}
      />

      {/* Instructor complaint this wave fixes: the mechanism used to live only
          in a workflow step elsewhere in the app, and this exact spot used to
          just NAME that step and send the instructor to go run it there.
          LinkUsernamesPanel puts the same mechanism - reading a Canvas
          assignment's own text submissions, not an inferred name-based guess
          - directly on this page. Gated on `course` alone (matching
          RepoGradesLogPanel below), not on `model && noConfirmedRows` the way
          the banner beneath it still is: an instructor whose org scan failed
          or whose org is unset has the LEAST other way to get repos bound, so
          this is exactly the state the panel must not disappear in. Placed
          here, above the grid: an instructor who cannot bind anything needs
          the fix before the table, not under it. */}
      {course && (
        <LinkUsernamesPanel
          assignmentOptions={assignmentOptions}
          assignmentsLoading={assignmentsLoading}
          assignmentsError={assignmentsError}
          exportAssignmentsLoading={exportAssignmentsLoading}
          exportAssignmentsError={exportAssignmentsError}
          assignmentId={uiState.linkAssignmentId}
          onAssignmentIdChange={(id) => setUiState((prev) => ({ ...prev, linkAssignmentId: id }))}
          linkSource={uiState.linkSource}
          onLinkSourceChange={(value) => setUiState((prev) => ({ ...prev, linkSource: value }))}
          liveLinkBlockedReason={liveLinkBlockedReason}
          rosterOverlay={rosterOverlay}
          onLinkFromCourseRoster={handleLinkFromCourseRoster}
          noConfirmedRows={noConfirmedRows}
          confirmableSummary={confirmableSummary}
          onLink={handleLinkUsernames}
          onConfirmAllSuggested={handleConfirmAllSuggested}
          onAnnounce={setPostSummary}
        />
      )}

      {/* Surface-ownership decision (see the LINK_GITHUB_USERNAMES_STEP_LABEL
          comment near the top of this file): LinkUsernamesPanel.tsx already
          prints the literal "No repos are confirmed-bound to a roster student
          yet." sentence when `noConfirmedRows` is true, so this banner does
          NOT repeat it - it only points at the panel just above and keeps the
          workflow step's exact label searchable, reframed as "available right
          here" rather than as an instruction to leave this page. */}
      {model && noConfirmedRows && (
        <p className={gridStyles.banner} role="status">
          The panel above uses the same mechanism the &quot;{LINK_GITHUB_USERNAMES_STEP_LABEL}&quot; workflow step
          uses - each student&apos;s own Canvas submission, not an inferred match - so there is no need to leave this
          page to populate bindings.
        </p>
      )}

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

      {/* U1.3b - rows follow columns, DISPLAY ONLY (section 5: buildBulkGradePlan
          already skips missing-folder/scan-error rows internally, so this
          never changes what a bulk run covers). Named counts rather than
          silently rendering fewer rows with no explanation. */}
      {model && currentSelectedFolder !== ALL_FOLDERS && (folderMissingCount > 0 || folderScanErrorCount > 0) && (
        <p className={pageStyles.fieldHint}>
          {displayedRows.length} repo{displayedRows.length === 1 ? "" : "s"} shown with a &quot;{currentSelectedFolder}
          &quot; folder
          {folderMissingCount > 0
            ? `; ${folderMissingCount} repo${folderMissingCount === 1 ? "" : "s"} do not have it`
            : ""}
          {folderScanErrorCount > 0
            ? `; ${folderScanErrorCount} repo${folderScanErrorCount === 1 ? "" : "s"} could not be scanned`
            : ""}
          .
        </p>
      )}

      {model && (
        <RepoGradesGrid
          columns={displayedColumns}
          rows={displayedRows}
          roster={roster}
          selected={selected}
          onToggleSelected={toggleSelected}
          onAcceptBinding={handleAcceptBinding}
          assignments={assignments}
          cellEdits={cellEdits}
          onScoreChange={handleScoreChange}
          onCommentChange={handleCommentChange}
          onGradeCell={handleGradeCell}
          onAssignmentChange={handleAssignmentChange}
          onPostColumn={handlePostColumn}
          onPostOneCell={handlePostOneCell}
          columnPosting={columnPosting}
          onGradeColumn={handleGradeColumn}
          bulkRunningFolder={bulkRunningFolder}
          bulkProgress={bulkProgress}
          bulkSelectionOnly={uiState.bulkSelectionOnly}
          scanTruncated={!!scan?.truncated}
          emptyStateMessage={folderEmptyStateMessage}
        />
      )}

      {/* L4 item 17: shown for any chosen course, including one whose scan
          failed or whose org is unset - a log of what went wrong is most
          useful exactly when the grid itself has nothing to render. It
          announces through setPostSummary, the view's existing role="status"
          region above, rather than adding a second live region (item 21). */}
      {course && (
        <RepoGradesLogPanel
          log={log}
          courseId={uiState.courseId}
          courseName={course.name}
          onClear={() => setLog([])}
          onAnnounce={setPostSummary}
        />
      )}
    </>
  );
}
