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
import { gradeRepoAction, postCanvasGradesAction } from "@/app/actions";
import { useLlmProvider } from "@/lib/llm-provider";
import TabHeader from "../TabHeader";
import { useRepoGradesData } from "./useRepoGradesData";
import {
  loadAssignmentMapping,
  loadRepoGradeLog,
  loadRepoGradesUiState,
  loadSelectedRepoIds,
  persistAssignmentMapping,
  persistRepoGradeLog,
  persistRepoGradesUiState,
  persistSelectedRepoIds,
  type RepoGradesUiState,
} from "./repoGradesUiState";
import {
  appendRepoGradeLogEntries,
  type RepoGradeLogEntry,
  type RepoGradeLogEventKind,
} from "./repoGradesLog";
import RepoGradesLogPanel from "./RepoGradesLogPanel";
import { buildRepoGradeGridModel, sortRepoGradeRows, type RepoGradeColumn, type RepoGradeRow, type RepoGradeSortField, type SortDirection } from "./repoGradesRows";
import {
  applyRepoGradeAssignmentMapping,
  filterRepoGradeAssignmentMapping,
  setRepoGradeAssignmentMapping,
  type RepoGradeAssignmentMap,
} from "./repoGradesAssignmentMapping";
import {
  EMPTY_REPO_GRADE_CELL_EDITS,
  setRepoGradeCellEdit,
  type RepoGradeCellEditsByRepo,
} from "./repoGradesCellEdits";
import {
  buildRepoGradePostPlan,
  fanOutRepoGradePostResult,
  repoGradeAssignmentUrl,
  repoGradePostCandidateRows,
  scopeRepoGradeRowsToSelection,
} from "./repoGradesPosting";
import RepoGradesGrid from "./RepoGradesGrid";
import styles from "../../page.module.css";
import gridStyles from "./repo-grades.module.css";

// AC2 item 7: the empty state for "no confirmed rows at all" must name this
// step by its exact UI label (steps.course-setup.rosters.ts:35's `name`
// field), not a paraphrase - so a support-doc or screenshot search for the
// step's real name still finds this text.
const LINK_GITHUB_USERNAMES_STEP_LABEL = "Link GitHub usernames to roster";

function parseSortValue(value: string): { field: RepoGradeSortField; direction: SortDirection } {
  const [field, direction] = value.split(":");
  return {
    field: field === "binding" ? "binding" : "repo",
    direction: direction === "desc" ? "desc" : "asc",
  };
}

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
    reloadScan,
    acceptBinding,
  } = useRepoGradesData(uiState.courseId, uiState.orgPrefix);

  const model = scan ? buildRepoGradeGridModel(scan.repos, roster, course?.studentRepos ?? [], uiState.orgPrefix) : null;
  const sortedRows = model ? sortRepoGradeRows(model.rows, uiState.sort) : [];

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

  // ---- per-cell editable state (AC4 items 20-21) and per-column posting
  // (AC5) - ephemeral UI memory, never persisted to localStorage (a typed
  // but un-posted score surviving a reload would be surprising, and this
  // codebase's own precedent - GradingResults.tsx's `edits`/`postStatus` -
  // does not persist these either). Reset whenever the selected course
  // changes, via the same render-phase compare-and-adjust idiom the
  // selection Set above uses, so switching courses cannot leave a prior
  // course's in-progress edits or post statuses visible against a
  // different course's repos. --------------------------------------------
  const [cellEdits, setCellEdits] = useState<RepoGradeCellEditsByRepo>(EMPTY_REPO_GRADE_CELL_EDITS);
  const [columnPosting, setColumnPosting] = useState<Record<string, boolean>>({});
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
    setColumnPosting({});
    setPostSummary("");
    setLog(loadRepoGradeLog(uiState.courseId));
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

  const handleScoreChange = (repo: string, folder: string, score: string) => {
    setCellEdits((prev) => setRepoGradeCellEdit(prev, repo, folder, { score }));
  };

  const handleCommentChange = (repo: string, folder: string, comment: string) => {
    setCellEdits((prev) => setRepoGradeCellEdit(prev, repo, folder, { comment }));
  };

  // AC4 item 21: reuses gradeRepoAction with `folderPath` as the `pathPrefix` -
  // the same call folder-per-module grading already makes - never a new
  // grading engine. Gated behind RepoGradeCellControl's "Grade" button click
  // only (see that file's header and repoGrades.wiring.test.ts's canary-
  // paired guard) - never on render, matching REGRESSION entries 98 and 101.
  //
  // AC "posting and reflow" A3: also records `rubricAreas` and
  // `generatedScore` on the cell edit - the ONLY place either is ever set
  // (never by handleScoreChange/handleCommentChange below) - so
  // repoGradesPosting.ts's repoGradeScoreWasEdited can later tell "the
  // instructor left the AI's score alone" from "the instructor hand-edited
  // it" by comparing the CURRENT score field against `generatedScore`, the
  // score exactly as THIS call produced it.
  const handleGradeCell = async (row: RepoGradeRow, column: RepoGradeColumn) => {
    const cell = row.cells[column.folder];
    // Defensive guard mirroring RepoGradeCellControl's own render condition
    // (it is only ever mounted for an "ungraded" cell) - a stale closure
    // from a re-scan mid-edit should never grade a folder that turned out
    // not to exist.
    if (cell.status !== "ungraded") return;
    setCellEdits((prev) => setRepoGradeCellEdit(prev, row.repo, column.folder, { grading: true, gradeError: null }));
    const result = await gradeRepoAction(row.repo, uiState.instructions, uiState.rubric, provider, undefined, column.folder);
    if ("error" in result) {
      setCellEdits((prev) => setRepoGradeCellEdit(prev, row.repo, column.folder, { grading: false, gradeError: result.error }));
      // L1 item 2. A grading failure otherwise leaves only a per-cell error
      // string that the next attempt overwrites.
      recordLog([buildLogEntry("grade-failed", { repo: row.repo, folder: column.folder, detail: result.error })]);
      return;
    }
    const first = result.run.results[0];
    setCellEdits((prev) =>
      setRepoGradeCellEdit(prev, row.repo, column.folder, {
        grading: false,
        gradeError: null,
        score: first?.totalScore ?? "",
        comment: first?.overallComment ?? "",
        rubricAreas: first?.rubricAreas ?? [],
        generatedScore: first?.totalScore ?? null,
      })
    );
    // L1 item 1: the score AS GENERATED, with the provider that produced it -
    // so a later "why is this score what it is" question can tell an AI
    // result from a hand-typed one even after the instructor has edited the
    // cell (the same distinction repoGradeScoreWasEdited makes at post time).
    // docs/folder-scoped-grading-completeness-acceptance-criteria.md C2: the
    // grading path used to COMPUTE whether the submission was cut and then
    // throw both flags away, so an instructor could not tell "the model read
    // my whole folder" from "it read the first fraction of it". Both are now
    // returned, and this is where they become visible - in the log that is
    // already this view's durable, downloadable record (entry 333), so the
    // fact survives the note and travels in the CSV.
    //
    // `digestTruncated` means the INGEST hit a cap collecting the folder;
    // `submissionTruncated` means the assembled text was cut again before the
    // model saw it. They are different cuts at different layers, so they are
    // named separately rather than merged into one "truncated" - a reader
    // chasing missing code needs to know WHICH budget to raise.
    const cuts: string[] = [];
    if (result.digestTruncated) cuts.push("some folder files were left out of the digest");
    if (first?.submissionTruncated) cuts.push("the submission text was truncated before grading");
    const detail = cuts.length > 0 ? `Graded by ${provider} - ${cuts.join("; ")}` : `Graded by ${provider}`;
    if (cuts.length > 0) {
      setPostSummary(`${row.repo} / ${column.folder}: graded, but ${cuts.join("; ")}.`);
    }

    recordLog([
      buildLogEntry("grade-succeeded", {
        repo: row.repo,
        folder: column.folder,
        score: first?.totalScore ?? "",
        detail,
      }),
    ]);
  };

  // AC5 items 27-32: the dangerous half. ONE postCanvasGradesAction call for
  // this column's postable rows (built by repoGradePostCandidateRows +
  // buildRepoGradePostPlan - the SAME two functions RepoGradesGrid.tsx's
  // column header calls to compute the button's own count/enabled state, so
  // the two can never disagree - AC5 item 28), gated behind an explicit
  // confirm naming the count (AC5 item 29, the exact existing wording from
  // GradingResults.tsx:293), with the userId -> row map built BEFORE posting
  // so every attempted row flips to "posting" first, then
  // fanOutRepoGradePostResult maps the real result back per row after the
  // call resolves (AC5 item 30, copying GradingResults.tsx:300-352's shape).
  //
  // AC "posting and reflow" A1: `selected` now governs which rows this call
  // even CONSIDERS - scopeRepoGradeRowsToSelection (repoGradesPosting.ts)
  // narrows `sortedRows` to the checked repos before candidate assembly when
  // a selection exists, and is a no-op (whole column) when it does not. This
  // is the fix for the real defect the "posting and reflow" AC's A1 names:
  // before this, `selected` gated nothing on the post path at all, so
  // ticking four students and clicking Post silently graded-and-posted every
  // postable row in the column instead.
  //
  // NOTE (flagged plainly, not papered over): RepoGradesGrid.tsx's column
  // header button (ColumnHeaderControls) computes ITS OWN postable count
  // from the UNSCOPED `rows` it was given - it has no `selected` prop wired
  // to it and this implementer's file set excludes RepoGradesGrid.tsx, so
  // that header count/enabled-state can now legitimately disagree with what
  // actually gets posted whenever a selection is active (it will show the
  // whole column's count even though only the selection posts). The confirm
  // dialog below and the "nothing postable in the current scope" summary
  // message always describe the REAL, selection-scoped plan, so the actual
  // write is never mis-stated - only the header's separate, always-visible
  // count can be stale relative to it. Closing that requires threading
  // `selected` into RepoGradesGrid.tsx's ColumnHeaderControls.
  const handlePostColumn = async (column: RepoGradeColumn) => {
    if (!course) return;
    const scopedRows = scopeRepoGradeRowsToSelection(sortedRows, selected);
    const candidates = repoGradePostCandidateRows(scopedRows, cellEdits, column.folder);
    const plan = buildRepoGradePostPlan(candidates, column.assignmentId);
    const usingSelection = selected.size > 0;
    // Now reachable post-A1 (e.g. every selected row is unbound) - say so.
    if (plan.postable.length === 0) {
      const summary = usingSelection
        ? `${column.folder}: none of the ${selected.size} selected row(s) are postable in this column.`
        : `${column.folder}: nothing is postable in this column yet.`;
      setPostSummary(summary);
      // L1 item 5: every skipped row with its OWN reason from the plan, not
      // just the one-line summary - "why was this student not posted" is the
      // question the log exists to answer, and the reasons differ per row
      // (unbound, no folder, no score, no assignment mapped).
      recordLog([
        buildLogEntry("post-skipped", { folder: column.folder, assignmentId: column.assignmentId ?? "", detail: summary }),
        ...plan.skipped.map((skip) =>
          buildLogEntry("post-skipped", {
            repo: skip.repo,
            folder: column.folder,
            assignmentId: column.assignmentId ?? "",
            detail: skip.reason,
          })
        ),
      ]);
      return;
    }

    // A2: base sentence byte-identical to GradingResults.tsx:293-295.
    const scopeSentence = usingSelection
      ? ` This posts only your ${plan.postable.length} selected row(s), not the whole column.`
      : ` No rows are selected, so this posts the whole column (all ${plan.postable.length} postable row(s)).`;
    if (!window.confirm(`Post ${plan.postable.length} grade(s) to Canvas? This writes to the live gradebook.${scopeSentence}`)) {
      // L1 item 6: "nothing happened and I do not remember why" is exactly
      // the question a log exists to answer.
      recordLog([
        buildLogEntry("post-cancelled", {
          folder: column.folder,
          assignmentId: column.assignmentId ?? "",
          detail: `Declined the confirm for ${plan.postable.length} grade(s)`,
        }),
      ]);
      return;
    }

    const assignmentUrl = column.assignmentId ? repoGradeAssignmentUrl(course.canvasUrl ?? "", column.assignmentId) : null;
    if (!assignmentUrl) {
      const summary = `${column.folder}: could not build a Canvas assignment URL for "${course.name}" - check the course's Canvas URL.`;
      setPostSummary(summary);
      recordLog([
        buildLogEntry("post-skipped", { folder: column.folder, assignmentId: column.assignmentId ?? "", detail: summary }),
      ]);
      return;
    }

    setColumnPosting((prev) => ({ ...prev, [column.folder]: true }));
    setCellEdits((prev) => {
      let next = prev;
      for (const item of plan.postable) {
        next = setRepoGradeCellEdit(next, item.repo, column.folder, { postStatus: "posting", postMessage: null });
      }
      return next;
    });

    const result = await postCanvasGradesAction(assignmentUrl, plan.postable.map((p) => p.grade));

    const fanout = fanOutRepoGradePostResult(
      plan.postable.map((p) => ({ repo: p.repo, userId: p.userId })),
      result
    );
    setCellEdits((prev) => {
      let next = prev;
      for (const outcome of fanout) {
        next = setRepoGradeCellEdit(next, outcome.repo, column.folder, {
          postStatus: outcome.postStatus,
          postMessage: outcome.postMessage,
        });
      }
      return next;
    });
    setColumnPosting((prev) => ({ ...prev, [column.folder]: false }));

    // L1 items 3-5: one entry per ATTEMPTED row carrying the exact score that
    // went out (read off the plan, never re-read from the edit state, which
    // the instructor may have kept typing into while the call was in flight),
    // plus one per row the plan dropped before the call.
    const gradeByRepo = new Map(plan.postable.map((item) => [item.repo, item.grade.grade]));
    recordLog([
      ...fanout.map((outcome) =>
        buildLogEntry(outcome.postStatus === "error" ? "post-failed" : "post-succeeded", {
          repo: outcome.repo,
          folder: column.folder,
          assignmentId: column.assignmentId ?? "",
          score: gradeByRepo.get(outcome.repo) ?? "",
          detail: outcome.postMessage ?? "",
        })
      ),
      ...plan.skipped.map((skip) =>
        buildLogEntry("post-skipped", {
          repo: skip.repo,
          folder: column.folder,
          assignmentId: column.assignmentId ?? "",
          detail: skip.reason,
        })
      ),
    ]);

    const failedCount = fanout.filter((f) => f.postStatus === "error").length;
    setPostSummary(
      `${column.folder}: posted ${fanout.length - failedCount}${failedCount ? `, ${failedCount} failed` : ""}.`
    );
  };

  // AC "posting and reflow" A4: retries (or deliberately re-posts) exactly
  // ONE cell - a one-element-array call mirroring GradingResults.tsx:363-390's
  // handlePostOne, reusing the SAME repoGradePostCandidateRows /
  // buildRepoGradePostPlan / fanOutRepoGradePostResult pipeline
  // handlePostColumn uses (scoped to `[row]`), so a retry can never disagree
  // with what a whole-column post would have done for that exact row, and
  // never touches any other row's status. No confirm dialog, by design: this
  // app treats click cost as a first-class factor and a single, already-
  // scoped row is a deliberate enough act on its own (handlePostOne itself
  // has none either).
  //
  // WIRED: passed to RepoGradesGrid as `onPostOneCell`, which forwards it into
  // each cell as RepoGradeCellControl's `onPostOne`. It did not ship switched
  // off - the failure mode docs/REGRESSION.md entry 211 records.
  const handlePostOneCell = async (row: RepoGradeRow, column: RepoGradeColumn) => {
    if (!course) return;
    const candidates = repoGradePostCandidateRows([row], cellEdits, column.folder);
    const plan = buildRepoGradePostPlan(candidates, column.assignmentId);
    if (plan.postable.length === 0) {
      // This path is otherwise completely silent (by design - the button that
      // reaches it is already only rendered for a plausible cell), which is
      // precisely why the log should say the retry did nothing and name the
      // plan's own reason for it.
      recordLog(
        plan.skipped.map((skip) =>
          buildLogEntry("post-skipped", {
            repo: skip.repo,
            folder: column.folder,
            assignmentId: column.assignmentId ?? "",
            detail: skip.reason,
          })
        )
      );
      return;
    }

    const assignmentUrl = column.assignmentId ? repoGradeAssignmentUrl(course.canvasUrl ?? "", column.assignmentId) : null;
    if (!assignmentUrl) {
      const summary = `${column.folder}: could not build a Canvas assignment URL for "${course.name}" - check the course's Canvas URL.`;
      setPostSummary(summary);
      recordLog([
        buildLogEntry("post-skipped", {
          repo: row.repo,
          folder: column.folder,
          assignmentId: column.assignmentId ?? "",
          detail: summary,
        }),
      ]);
      return;
    }

    setCellEdits((prev) => setRepoGradeCellEdit(prev, row.repo, column.folder, { postStatus: "posting", postMessage: null }));

    const result = await postCanvasGradesAction(assignmentUrl, plan.postable.map((p) => p.grade));

    const fanout = fanOutRepoGradePostResult(
      plan.postable.map((p) => ({ repo: p.repo, userId: p.userId })),
      result
    );
    setCellEdits((prev) => {
      let next = prev;
      for (const outcome of fanout) {
        next = setRepoGradeCellEdit(next, outcome.repo, column.folder, {
          postStatus: outcome.postStatus,
          postMessage: outcome.postMessage,
        });
      }
      return next;
    });

    const singleGrade = plan.postable[0]?.grade.grade ?? "";
    recordLog(
      fanout.map((outcome) =>
        buildLogEntry(outcome.postStatus === "error" ? "post-failed" : "post-succeeded", {
          repo: outcome.repo,
          folder: column.folder,
          assignmentId: column.assignmentId ?? "",
          score: singleGrade,
          detail: outcome.postMessage ?? "Single-row retry",
        })
      )
    );

    const failed = fanout.some((f) => f.postStatus === "error");
    setPostSummary(`${row.repo} / ${column.folder}: ${failed ? "failed to post." : "posted."}`);
  };

  const missingInstitution = !!course && !(course.institution ?? "").trim();
  const missingOrg = !!course && !(course.githubOrg ?? "").trim();
  const noConfirmedRows = !!model && model.rows.length > 0 && model.rows.every((row) => row.binding.state !== "confirmed");

  return (
    <div className={styles.tabContainer}>
      <TabHeader
        eyebrow="Grading"
        title="Repo Grades"
        subtitle="Grade every student's GitHub repo folder by folder and post the results to the Canvas gradebook."
      />

      <div className={styles.field}>
        <label htmlFor="repo-grades-course">Course</label>
        <select
          id="repo-grades-course"
          value={uiState.courseId}
          disabled={coursesLoading}
          onChange={(e) => setUiState((prev) => ({ ...prev, courseId: e.target.value }))}
        >
          <option value="">{coursesLoading ? "Loading courses..." : "Choose a course..."}</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {coursesError && (
          <p className={styles.error} role="alert">
            {coursesError}
          </p>
        )}
      </div>

      {course && !missingOrg && (
        <div className={styles.field}>
          <label htmlFor="repo-grades-org-prefix">Repo name filter (optional)</label>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input
              id="repo-grades-org-prefix"
              type="text"
              value={uiState.orgPrefix}
              onChange={(e) => setUiState((prev) => ({ ...prev, orgPrefix: e.target.value }))}
              placeholder="e.g. module"
              style={{ flex: "1 1 220px" }}
            />
            <button type="button" className={styles.linkButton} disabled={scanLoading} onClick={() => reloadScan()}>
              {scanLoading ? "Scanning..." : "Refresh"}
            </button>
          </div>
        </div>
      )}

      {model && model.rows.length > 0 && (
        <div className={styles.field}>
          <label htmlFor="repo-grades-sort">Sort</label>
          <select
            id="repo-grades-sort"
            value={`${uiState.sort.field}:${uiState.sort.direction}`}
            onChange={(e) => setUiState((prev) => ({ ...prev, sort: parseSortValue(e.target.value) }))}
          >
            <option value="repo:asc">Repo name (A to Z)</option>
            <option value="repo:desc">Repo name (Z to A)</option>
            <option value="binding:asc">Needs attention first</option>
            <option value="binding:desc">Confirmed first</option>
          </select>
        </div>
      )}

      {model && model.rows.length > 0 && (
        <>
          <div className={styles.field}>
            <label htmlFor="repo-grades-instructions">Assignment instructions (used by every &quot;Grade&quot; call)</label>
            <textarea
              id="repo-grades-instructions"
              value={uiState.instructions}
              onChange={(e) => setUiState((prev) => ({ ...prev, instructions: e.target.value }))}
              placeholder="Describe what a folder needs to contain to earn full credit."
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="repo-grades-rubric">Rubric (optional - generated from the instructions if left blank)</label>
            <textarea
              id="repo-grades-rubric"
              value={uiState.rubric}
              onChange={(e) => setUiState((prev) => ({ ...prev, rubric: e.target.value }))}
              placeholder="Paste a grading rubric, or leave blank to generate one from the instructions above."
            />
          </div>
        </>
      )}

      {!course && !coursesLoading && <p className={styles.emptyState}>Choose a course tile above to list its repos.</p>}

      {course && missingInstitution && (
        <p className={styles.error} role="alert">
          &quot;{course.name}&quot; has no institution set, so its Canvas roster cannot be loaded for binding - set one on
          the course tile first.
        </p>
      )}

      {course && missingOrg && (
        <p className={styles.error} role="alert">
          &quot;{course.name}&quot; has no GitHub org set, so its repos cannot be listed - set one on the course tile
          first.
        </p>
      )}

      {course && !missingOrg && scanLoading && (
        <div className={styles.loadingState} role="status" aria-live="polite">
          <span className={styles.spinner} aria-hidden="true" />
          <div>
            <p className={styles.loadingTitle}>Scanning {course.githubOrg} for repos...</p>
          </div>
        </div>
      )}

      {course && !missingOrg && scanError && (
        <p className={styles.error} role="alert">
          {scanError}
        </p>
      )}

      {course && !missingInstitution && rosterLoading && (
        <p className={styles.fieldHint} role="status" aria-live="polite">
          Loading the Canvas roster...
        </p>
      )}

      {course && !missingInstitution && rosterError && (
        <p className={styles.error} role="alert">
          Roster: {rosterError}
        </p>
      )}

      {course && !missingInstitution && assignmentsLoading && (
        <p className={styles.fieldHint} role="status" aria-live="polite">
          Loading the course&apos;s Canvas assignments...
        </p>
      )}

      {course && !missingInstitution && assignmentsError && (
        <p className={styles.error} role="alert">
          Assignments: {assignmentsError}
        </p>
      )}

      {scan && scan.truncated && (
        <p className={gridStyles.banner} role="status">
          This org has at least as many repos as this scan&apos;s listing limit - the repos below may be an incomplete
          list, not the full org.
        </p>
      )}

      {scan && scan.rateLimit && (
        <p className={gridStyles.banner} role="status">
          {scan.rateLimit.message}
        </p>
      )}

      {model && noConfirmedRows && (
        <p className={gridStyles.banner} role="status">
          No repos are confirmed-bound to a roster student yet. Running the &quot;{LINK_GITHUB_USERNAMES_STEP_LABEL}&quot;
          workflow step is the reliable way to populate bindings, since it uses each student&apos;s own Canvas submission
          rather than an inferred match.
        </p>
      )}

      {/* AC5 item 31: results are announced through a role="status"
          aria-live="polite" region, matching TasksTab.tsx:717. This is the
          ONLY region that reports post outcomes - per-cell status text is
          also visible directly in the grid, but this is the one a screen
          reader user does not have to go hunting through the table for. */}
      <div role="status" aria-live="polite" className={gridStyles.srOnly}>
        {postSummary}
      </div>

      {model && (
        <RepoGradesGrid
          columns={columnsWithMapping}
          rows={sortedRows}
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
    </div>
  );
}
