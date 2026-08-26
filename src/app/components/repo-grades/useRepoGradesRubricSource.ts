"use client";

// Repo Grades view - the rubric picker's client hook
// (docs/repo-grades-rubric-picker-acceptance-criteria.md, wave 2 contract).
// Wave 1 built every PURE decision this feature needs: rendering a picked
// rubric object into text (src/lib/rubric-render.ts), assembling/parsing/
// degrading the select's option list (repoGradesRubricSource.ts), the
// per-column resolution cache's key derivation and read/write
// (repoGradesRubricCache.ts), and the per-course persisted-choice/manual-text
// storage (repoGradesUiState.ts's rubric-choice functions). This hook is the
// ONLY place that composes those four modules with real I/O: it loads the
// course's live Canvas rubric list, restores a persisted choice against the
// current option list, owns the `useRef<Map>` cache, and exposes the ONE
// `resolveRubricForColumn` function both grading paths
// (useRepoGradesGradingActions.ts's handleGradeCell,
// useRepoGradesBulkGrade.ts's runBulkGrade) call and nothing else - AC item
// 16's "two different code paths must not resolve the rubric two different
// ways".
//
// THE SHARED RESOLVER IS LITERALLY SHARED, NOT MERELY SIMILAR: the effect
// below that keeps the textarea's live/export preview in sync calls
// `resolveRubricForColumn(null)` itself (assignmentId is unused by the
// live/export branches) rather than a second, parallel resolution path - so
// what the textarea shows for a live/export choice (AC item 14: "what feeds
// grading is exactly what is on screen") can never diverge from what a grade
// click actually sends, by construction rather than by two implementations
// happening to agree.
//
// eslint's react-hooks/set-state-in-effect rule (this codebase's own
// AGENTS-memory idiom: set-state-in-effect-idiom.md) forbids a useEffect body
// from calling setState before an awaited expression. Both effects below
// follow the exact shape useRepoGradesData.ts:443-458 already established:
// an inline async IIFE with a local `cancelled` flag, every setState call
// placed textually after an `await`, and a cleanup function that flips
// `cancelled` rather than aborting the in-flight request. Every OTHER state
// update in this hook - restoring a persisted choice, dropping the cache on a
// course switch, `onChange`, `onManualTextChange` - runs either during the
// render-phase compare-and-adjust idiom (see the two `if` blocks right after
// the useState calls below, mirroring useRepoGradesGradingActions.ts:147-151)
// or synchronously inside a real event handler, never inside an effect body,
// so the lint rule never has anything to flag outside those two effects.

import { useEffect, useRef, useState } from "react";
import type { Course } from "@/lib/supabase/courses";
import type { CanvasRubric } from "@/lib/canvas-modules";
import { fetchCanvasMetaAction, getRubricAction, listRubricsAction } from "@/app/actions";
import { renderPickedRubricText, rubricHasUsablePoints, type RenderableRubric } from "@/lib/rubric-render";
import {
  buildRepoGradeRubricOptions,
  describeRepoGradeColumnRubric,
  describeRepoGradeExportRubricEmptiness,
  describeRepoGradeLiveRubricEmptiness,
  parseRepoGradeRubricValue,
  resolveStoredRepoGradeRubricChoice,
  type RepoGradeRubricOption,
} from "./repoGradesRubricSource";
import {
  createRepoGradeRubricCacheStore,
  dropRepoGradeRubricCacheForOtherCourses,
  failedRubricLookup,
  readRepoGradeRubricCacheEntry,
  resolvedRubric,
  writeRepoGradeRubricCacheEntry,
  type RepoGradeRubricCacheStore,
  type RepoGradeRubricResolution,
} from "./repoGradesRubricCache";
import {
  defaultRepoGradeRubricChoice,
  loadRepoGradeManualRubricText,
  loadRepoGradeRubricChoice,
  persistRepoGradeManualRubricText,
  persistRepoGradeRubricChoice,
  type RepoGradeRubricChoice,
  type RepoGradeRubricSourceKind,
} from "./repoGradesUiState";
import { repoGradeAssignmentUrl } from "./repoGradesPosting";

/** The exact five sentinel/prefix strings repoGradesRubricSource.ts's own
 * RULE 2 defines as the encoding for a select value - that module keeps them
 * module-private (only the functions that use them are exported), so this
 * hook redeclares the two bare-token ones it needs to construct rather than
 * only parse. This is intentionally the SAME literal text, not a
 * reinterpretation of it: repoGradesRubricSource.ts's own doc comment states
 * these five constants and their values verbatim, so they are stable,
 * documented API surface even though the identifiers themselves are private. */
const GENERATE_SELECT_VALUE = "generate";
const MANUAL_SELECT_VALUE = "manual";

/** The exact string shape THE HOOK section of the wave 2 contract fixes. */
export interface ResolvedRubric {
  text: string;
  source: RepoGradeRubricSourceKind;
  identity: string;
  failureReason: string | null;
}

export interface UseRepoGradesRubricSourceParams {
  courseId: string;
  course: Course | null;
  exportRubrics: readonly { title: string; criteria: readonly unknown[] }[];
  exportAvailable: boolean;
  /** Whether the export-content load `exportRubrics` is sourced from is
   * still in flight, for the picker's own "loading the saved export's
   * rubrics" hint (UX notes 1.5) - distinct from `exportAvailable`, which is
   * about whether the course HAS a stored export at all. */
  exportLoading: boolean;
  exportError: string | null;
  liveAvailable: boolean;
  /** Routes this feature's one announcement channel (UX notes 3.3) through
   * the SAME action-outcome region every other control on this page already
   * uses - the caller passes `setPostSummary` (index.tsx), matching
   * `LinkUsernamesPanel`'s and `RepoGradesLogPanel`'s own `onAnnounce` wiring.
   * This hook adds no `role="status"`/`aria-live` region of its own. */
  onAnnounce: (message: string) => void;
}

/** Why a rubric list's `<optgroup>` is absent or worth a note (UX notes 1.5) -
 * `tone` picks the class the caller renders it with (`pageStyles.fieldHint`
 * for a loading/absent/empty explanation, `pageStyles.error` for an outright
 * load failure), `text` is the exact string to show. `null` means the list
 * has options and needs no hint at all. */
export interface RepoGradeRubricListHint {
  tone: "hint" | "error";
  text: string;
}

export interface UseRepoGradesRubricSourceResult {
  value: string;
  options: readonly RepoGradeRubricOption[];
  onChange: (value: string) => void;
  manualText: string;
  onManualTextChange: (value: string) => void;
  textareaValue: string;
  textareaReadOnly: boolean;
  restoreManualText: (() => void) | null;
  resolving: boolean;
  resolveRubricForColumn: (assignmentId: string | null) => Promise<ResolvedRubric>;
  describeColumn: (assignmentId: string | null) => string;
  staleChoiceNote: string | null;
  /** Why the "Rubrics in Canvas" optgroup is absent or worth a note, or
   * `null` when it has options and needs none - loading/not-connected/
   * failed/empty (UX notes 1.5), computed here since this hook already holds
   * every input the four-way distinction needs. */
  liveRubricHint: RepoGradeRubricListHint | null;
  /** Same as `liveRubricHint`, for the "Rubrics in the saved course export"
   * optgroup. */
  exportRubricHint: RepoGradeRubricListHint | null;
}

/**
 * Converts a per-course persisted choice (repoGradesUiState.ts's
 * `RepoGradeRubricChoice`, `{source, identity}`) into the select-value string
 * repoGradesRubricSource.ts's `parseRepoGradeRubricValue` understands.
 *
 * NOT the same as repoGradesUiState.ts's own `encodeRepoGradeRubricChoice`:
 * that function always emits `${source}:${identity}` (even
 * `"generate:"`/`"assignment:"`/`"manual:"` with a trailing empty identity),
 * which is the right shape for a single localStorage string but the WRONG
 * shape for `parseRepoGradeRubricValue` - that parser matches the three
 * fixed sources only against the bare tokens `"generate"`/`"assignment"`/
 * `"manual"` (repoGradesRubricSource.ts's RULE 2), so feeding it
 * `"generate:"` would silently fail to parse and every persisted
 * `assignment`/`manual` choice would degrade to `generate` on every reload -
 * a real bug this conversion exists to avoid, not a style choice.
 */
export function choiceToSelectValue(choice: RepoGradeRubricChoice): string {
  switch (choice.source) {
    case "live":
      return `live:${choice.identity}`;
    case "export":
      return `export:${choice.identity}`;
    default:
      return choice.source;
  }
}

/** Finds the export rubric a persisted/select `export` value names, using the
 * IDENTICAL occurrence-counting algorithm buildRepoGradeRubricOptions applies
 * to `input.export` (repoGradesRubricSource.ts RULE 4: counted in the
 * ORIGINAL order, before that module's own display sort) - so a value this
 * hook parsed out of the select is guaranteed to find the same rubric the
 * option list was built from, never an off-by-one neighbor. */
export function findExportRubricByIdentity<T extends { title: string }>(
  items: readonly T[],
  occurrence: number,
  title: string
): T | null {
  let seen = 0;
  for (const item of items) {
    if (item.title !== title) continue;
    if (seen === occurrence) return item;
    seen += 1;
  }
  return null;
}

/** Converts a cache resolution into the contract's ResolvedRubric shape - the
 * one place that translates repoGradesRubricCache.ts's two-status union into
 * the `{text, failureReason}` pair every caller (both grading paths, the
 * textarea-preview effect) actually reads. Shared by every source below so
 * "resolved" and "failed" are only ever translated one way. */
export function resolutionToResolvedRubric(
  resolution: RepoGradeRubricResolution,
  source: RepoGradeRubricSourceKind,
  identity: string
): ResolvedRubric {
  if (resolution.status === "failed") {
    return { text: "", source, identity, failureReason: resolution.reason };
  }
  return { text: resolution.rubricText, source, identity, failureReason: null };
}

export function useRepoGradesRubricSource(params: UseRepoGradesRubricSourceParams): UseRepoGradesRubricSourceResult {
  const { courseId, course, exportRubrics, liveAvailable, onAnnounce } = params;

  // ---------------------------------------------------------------------
  // The per-column/per-selection resolution cache (AC item 10, item 54's
  // "the client hook ... owning ... the useRef<Map> cache"). Lazily
  // initialized so `createRepoGradeRubricCacheStore()` (a plain `new Map()`)
  // runs once, not on every render.
  const cacheRef = useRef<RepoGradeRubricCacheStore | null>(null);
  if (cacheRef.current === null) cacheRef.current = createRepoGradeRubricCacheStore();

  // ---------------------------------------------------------------------
  // Live Canvas rubric list (title + id only - listRubricsAction/
  // CanvasRubric, item 66: criteria need a SECOND call, getRubricAction,
  // made lazily per rubric inside resolveLiveChoice below, never here).
  // Same KeyedResult idiom useRepoGradesData.ts:441-458 already uses for this
  // exact page's export-content load: a `{key, ...}` result compared against
  // the CURRENT courseId, so a slow response for a course the instructor has
  // already navigated away from is silently discarded rather than painted
  // onto the wrong course.
  // Captured as primitives BEFORE the effect (rather than reading `course`
  // inside it) for two reasons: depending on the `course` object reference
  // would refire this effect on every parent re-render that happens to
  // construct a new, structurally identical Course object, not only on an
  // actual course change; and eslint's exhaustive-deps otherwise cannot tell
  // that the effect only ever reads these two fields off it, and asks for
  // the whole object as a dependency.
  const courseCanvasUrl = course?.canvasUrl ?? null;
  const courseInstitution = course?.institution ?? null;
  const canFetchLive = liveAvailable && !!courseCanvasUrl && courseId !== "";
  const [liveRubricsResult, setLiveRubricsResult] = useState<{
    key: string;
    rubrics: CanvasRubric[];
    error: string | null;
  } | null>(null);

  useEffect(() => {
    if (!canFetchLive || !courseCanvasUrl) return;
    const key = courseId;
    let cancelled = false;
    (async () => {
      const result = await listRubricsAction(courseCanvasUrl, courseInstitution ?? undefined);
      if (cancelled) return;
      // RULE 7 (repoGradesRubricSource.ts): narrow on the SUCCESS key
      // ("rubrics" in result), never the bare "error" key - a partial load
      // (course-level rubrics loaded, account-level failed, or vice versa)
      // still carries `rubrics` and must still populate the picker (AC item
      // 24), the exact bug already fixed once on CourseItemsView.tsx.
      if (!("rubrics" in result)) {
        setLiveRubricsResult({ key, rubrics: [], error: result.error });
      } else {
        setLiveRubricsResult({ key, rubrics: result.rubrics, error: result.error ?? null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canFetchLive, courseId, courseCanvasUrl, courseInstitution]);

  const liveResultMatches = liveRubricsResult !== null && liveRubricsResult.key === courseId;
  const liveItems: CanvasRubric[] = liveResultMatches ? liveRubricsResult!.rubrics : [];
  // "Settled" = either there is nothing to fetch (no live connection), or the
  // fetch for THIS course has landed. Gates the persisted-choice restore
  // below so a `live:123` choice is never judged "stale" merely because the
  // fetch that would prove it still exists has not returned yet - see that
  // block's own comment for why validating against an incomplete option list
  // would be a real bug, not a style nit.
  const liveSettled = !canFetchLive || liveResultMatches;

  // buildRepoGradeRubricOptions' `export` parameter only reads `.title`
  // (repoGradesRubricSource.ts RULE 0) - exportRubrics is intentionally typed
  // structurally in this hook's own params (item 48/59: it stays decoupled
  // from CartridgeRubric's type chain), so this map is the only place that
  // narrows it before handing it to Wave 1's pure option builder.
  const options: RepoGradeRubricOption[] = buildRepoGradeRubricOptions({
    live: liveItems,
    export: exportRubrics.map((r) => ({ title: r.title })),
  });

  // ---------------------------------------------------------------------
  // Empty-state hints (UX notes 1.5) - "loading" is computed here (there is
  // no pure function for it, since describeRepoGrade*RubricEmptiness assume
  // a settled load); every other reason reuses those two Wave 1 functions
  // verbatim rather than re-deriving their wording (AC items 22/23/44/52).
  const liveLoading = canFetchLive && !liveResultMatches;
  const liveRubricHint: RepoGradeRubricListHint | null = liveLoading
    ? { tone: "hint", text: "Loading this course's Canvas rubrics..." }
    : (() => {
        const described = describeRepoGradeLiveRubricEmptiness({
          hasConnection: liveAvailable,
          error: liveResultMatches ? liveRubricsResult!.error : null,
          items: liveItems,
        });
        return described ? { tone: described.reason === "load-failed" ? "error" : "hint", text: described.text } : null;
      })();

  const exportLoading = params.exportAvailable && params.exportLoading;
  const exportRubricHint: RepoGradeRubricListHint | null = exportLoading
    ? { tone: "hint", text: "Loading the saved export's rubrics..." }
    : (() => {
        const described = describeRepoGradeExportRubricEmptiness({
          hasExport: params.exportAvailable,
          error: params.exportError,
          items: exportRubrics.map((r) => ({ title: r.title })),
        });
        return described ? { tone: described.reason === "load-failed" ? "error" : "hint", text: described.text } : null;
      })();

  // ---------------------------------------------------------------------
  // Selection state. `selectedValue` is the select's raw value string
  // (repoGradesRubricSource.ts's encoding); `manualText` is the per-course
  // typed rubric (AC item 73, RUBRIC_MANUAL_TEXT_KEY) - a SEPARATE piece of
  // state from `selectedValue` on purpose (AC item 51: the textarea is a
  // DERIVED value, never the thing switching sources overwrites).
  const [selectedValue, setSelectedValue] = useState<string>(GENERATE_SELECT_VALUE);
  const [manualText, setManualText] = useState<string>("");
  const [staleNote, setStaleNote] = useState<string | null>(null);
  // True once the instructor has made an explicit choice (select or typed
  // text) THIS course - guards the persisted-choice restore below from ever
  // overwriting a choice the instructor already made while the live list was
  // still loading (see that block's comment for the race this closes).
  const [hasUserChosen, setHasUserChosen] = useState(false);
  // The live/export textarea preview - see the effect below. Read alongside
  // `selectedValue` so a response for a choice the instructor has since
  // changed away from is never painted into the box.
  const [displayResolved, setDisplayResolved] = useState<{ key: string; resolved: ResolvedRubric } | null>(null);
  // In-flight resolveRubricForColumn network calls (assignment/live/export
  // only - generate/manual never touch it). A simple counter, not a per-key
  // Set: AC item 45 deliberately disables EVERY column's Grade button while
  // ANY resolve is in flight, page-wide, not just the column that triggered
  // it - "costs nothing in the steady state" per that item's own text.
  const [pendingResolves, setPendingResolves] = useState(0);

  // ---- Course-switch reset (render-phase compare-and-adjust, matching
  // useRepoGradesGradingActions.ts:147-151's columnPostingResetForCourse -
  // never a useEffect). Runs the instant `courseId` changes, before any
  // network settles: drops every OTHER course's cache entries (AC item 10:
  // "dropped on a course switch, matching how columnPosting and cellEdits
  // already reset"), restores this course's per-course manual text, and
  // resets the select back to the byte-for-byte default (AC item 4) until
  // the block below can validate the real persisted choice.
  const [resolvedForCourseId, setResolvedForCourseId] = useState<string | null>(null);
  if (courseId !== resolvedForCourseId) {
    setResolvedForCourseId(courseId);
    setManualText(loadRepoGradeManualRubricText(courseId));
    setSelectedValue(GENERATE_SELECT_VALUE);
    setStaleNote(null);
    setHasUserChosen(false);
    setDisplayResolved(null);
  }
  // Dropping the OTHER courses' cache entries is a ref mutation, not a
  // state update - eslint's react-hooks/refs rule (render must stay pure for
  // React Compiler compatibility) forbids reading or writing `cacheRef.current`
  // during render, even inside the render-phase compare-and-adjust block
  // above, so this one side effect is pulled into a genuine (synchronous,
  // setState-free) effect instead. It still runs before any resolve for the
  // new course can be requested - both this effect and the block above are
  // keyed on the same `courseId` change and React flushes effects after the
  // render they belong to commits, ahead of any click handler the instructor
  // could fire next.
  useEffect(() => {
    dropRepoGradeRubricCacheForOtherCourses(cacheRef.current!, courseId);
  }, [courseId]);
  // AC item 45's second half: "resolving" while the cache does not yet
  // belong to the current course. In this implementation the drop above is a
  // synchronous Map mutation with no async gap, so React's render-phase
  // update re-invokes this function body and `resolvedForCourseId` already
  // reads back as `courseId` before anything is returned to a caller - the
  // mismatch is real (it is what makes the drop happen at all) but never
  // externally observable, which is the "structurally impossible" AC item 45
  // asks for, at zero steady-state cost. The comparison is kept in
  // `resolving`'s expression anyway rather than dropped, both because it is
  // what the contract's own doc comment says to check and because it is a
  // free defensive read, not because this render is ever expected to commit
  // with it true.
  const resolving = pendingResolves > 0 || resolvedForCourseId !== courseId;

  // ---- Persisted-choice restore (render-phase compare-and-adjust, gated on
  // `liveSettled`). AC item 21: a stale live/export choice degrades to
  // `generate` with a note - but that degradation can ONLY be judged once
  // the live list this course's choice might reference has actually loaded.
  // Running this unconditionally on every courseId change (as the block
  // above does) would, for a course whose live rubric list is still
  // in-flight, see an EMPTY live option group, judge any persisted `live:...`
  // choice "not found", and permanently overwrite it with `generate` - not
  // because the rubric was deleted, but because this hook asked too early.
  // Gating on `liveSettled` closes that false-positive.
  //
  // `!hasUserChosen` closes the complementary race: if the instructor picks a
  // non-live option (or types manual text) WHILE the live list is still
  // loading, this block must never later fire and stomp that real choice
  // with whatever was on disk before the click.
  const [restoredForCourseId, setRestoredForCourseId] = useState<string | null>(null);
  if (liveSettled && !hasUserChosen && restoredForCourseId !== courseId) {
    setRestoredForCourseId(courseId);
    const stored = loadRepoGradeRubricChoice(courseId);
    const resolvedChoice = resolveStoredRepoGradeRubricChoice(choiceToSelectValue(stored), options);
    setSelectedValue(resolvedChoice.value);
    setStaleNote(resolvedChoice.degradedReason);
    if (resolvedChoice.degradedReason) {
      // Write the degradation back so a reload does not keep re-discovering
      // (and re-announcing) the same gone rubric forever - matches AC item
      // 21's "degrades to generate" as a real, persisted outcome.
      persistRepoGradeRubricChoice(courseId, defaultRepoGradeRubricChoice());
      // UX notes 3.3 event 2 ("a stale identity degraded to generate") -
      // announced once, through the SAME action-outcome channel every other
      // control on this page uses (`onAnnounce`, wired to `setPostSummary`),
      // not a new live region. This is a distinct, shorter sentence from
      // `staleChoiceNote`'s own inline text (rendered under the select) -
      // the announcement is for a screen-reader/visible-banner user who may
      // not be looking at the select at all; the inline note is for someone
      // who is. Called during render, not inside an effect: this whole block
      // is the render-phase compare-and-adjust idiom, and `onAnnounce` here
      // is `setPostSummary`, owned by the SAME component (RepoGradesTab) this
      // hook is called from - the same "adjust state during this render"
      // pattern the `setSelectedFolder`/`setFolderDropNotice` block in
      // index.tsx already uses for its own drop notice.
      onAnnounce("The saved rubric for this course is gone, so grading will generate one from the instructions.");
    }
  }

  const parsedSelection = parseRepoGradeRubricValue(selectedValue);
  const currentSource: RepoGradeRubricSourceKind = parsedSelection?.source ?? "generate";

  // ---- UX notes 3.3 event 3 ("a rubric list failed to load and the
  // instructor has that source selected") - a ref-guarded fire-once effect,
  // the same idiom index.tsx's own `lastLoggedScanError` effect already uses
  // (a direct, synchronous announce call with no async wrapper - safe
  // because `onAnnounce` is an opaque prop callback, not a local useState
  // setter this hook owns, so it is not what react-hooks/set-state-in-effect
  // or this folder's own idiom note are guarding against). Keyed on plain
  // strings (never the `liveRubricHint`/`exportRubricHint` OBJECTS, which are
  // fresh literals every render) so the effect only re-fires on an actual
  // change of which failure, if any, is currently active for the selected
  // source.
  const liveFailureText = liveRubricHint && liveRubricHint.tone === "error" ? liveRubricHint.text : null;
  const exportFailureText = exportRubricHint && exportRubricHint.tone === "error" ? exportRubricHint.text : null;
  const activeListFailureKey =
    currentSource === "live" && liveFailureText
      ? `live:${liveFailureText}`
      : currentSource === "export" && exportFailureText
        ? `export:${exportFailureText}`
        : null;
  const lastAnnouncedListFailure = useRef<string | null>(null);
  useEffect(() => {
    if (activeListFailureKey === lastAnnouncedListFailure.current) return;
    lastAnnouncedListFailure.current = activeListFailureKey;
    if (!activeListFailureKey) return;
    onAnnounce(
      currentSource === "live"
        ? "Canvas rubrics could not be loaded, so grading will generate a rubric from the instructions."
        : "The saved export's rubrics could not be loaded, so grading will generate a rubric from the instructions."
    );
  }, [activeListFailureKey, currentSource, onAnnounce]);

  /** The chosen rubric's bare title (no "(from export)" suffix - see
   * describeRepoGradeColumnRubric's own doc comment on `chosenLabel` for why
   * that suffix must not be double-applied), or null for a source with no
   * single title. A live option's `label` is already the bare title
   * (repoGradesRubricSource.ts's buildRepoGradeRubricOptions never suffixes
   * it), so reading it off `options` is safe; an export value's title is
   * already carried in `parsedSelection` itself. */
  function selectedTitle(): string | null {
    if (!parsedSelection) return null;
    if (parsedSelection.source === "live") {
      return options.find((o) => o.value === selectedValue)?.label ?? null;
    }
    if (parsedSelection.source === "export") {
      return parsedSelection.title;
    }
    return null;
  }

  // -----------------------------------------------------------------------
  // Per-source resolution. Each function below reads the cache first
  // (courseId + a source-specific key - see each function's own comment for
  // what that key is), and on a miss performs exactly the network/lookup the
  // acceptance criteria specify, then writes the outcome back before
  // returning. None of these throw: every awaited call already returns
  // `{error}` rather than throwing (this codebase's server-action
  // convention), and resolveRubricForColumn's own try/catch below is the
  // final backstop regardless.

  /** `assignment` source (AC item 9): resolves PER COLUMN, keyed by the
   * column's own Canvas assignment id - the one source that can differ
   * column to column, so its cache key is the real assignmentId, in the same
   * Map every other source's synthetic key lives in (repoGradeRubricCacheKey
   * namespaces by (courseId, key) already, so a numeric assignment id can
   * never collide with the "live:"/"export:"-prefixed keys below). */
  async function resolveAssignment(assignmentId: string): Promise<ResolvedRubric> {
    const cached = readRepoGradeRubricCacheEntry(cacheRef.current!, courseId, assignmentId);
    if (cached) return resolutionToResolvedRubric(cached, "assignment", assignmentId);

    if (!course) {
      const resolution = failedRubricLookup("No course is selected, so this assignment's rubric could not be loaded.");
      writeRepoGradeRubricCacheEntry(cacheRef.current!, courseId, assignmentId, resolution);
      return resolutionToResolvedRubric(resolution, "assignment", assignmentId);
    }
    const url = repoGradeAssignmentUrl(course.canvasUrl ?? "", assignmentId);
    if (!url) {
      const resolution = failedRubricLookup(
        `Could not build a Canvas assignment URL for "${course.name}" - check the course's Canvas URL.`
      );
      writeRepoGradeRubricCacheEntry(cacheRef.current!, courseId, assignmentId, resolution);
      return resolutionToResolvedRubric(resolution, "assignment", assignmentId);
    }

    setPendingResolves((c) => c + 1);
    try {
      const result = await fetchCanvasMetaAction(url);
      let resolution: RepoGradeRubricResolution;
      if ("error" in result) {
        resolution = failedRubricLookup(result.error);
      } else if (!result.rubricText || result.rubricText.trim() === "") {
        // AC item 13: an assignment with no rubric attached is a legitimate,
        // non-exceptional outcome, not a network failure - but it still gets
        // a stated reason so the log explains the blank rubric rather than
        // leaving the instructor to guess.
        resolution = failedRubricLookup("This assignment has no rubric attached in Canvas - a rubric will be generated instead.");
      } else {
        resolution = resolvedRubric(result.rubricText);
      }
      writeRepoGradeRubricCacheEntry(cacheRef.current!, courseId, assignmentId, resolution);
      return resolutionToResolvedRubric(resolution, "assignment", assignmentId);
    } finally {
      setPendingResolves((c) => c - 1);
    }
  }

  /** `live` source: ONE rubric for the whole page (unlike `assignment`), so
   * the cache key is the encoded select value itself (`live:<id>`) rather
   * than anything per-column - every column reuses the same cached entry. */
  async function resolveLiveChoice(id: string): Promise<ResolvedRubric> {
    const cacheKey = `live:${id}`;
    const identity = liveItems.find((r) => String(r.id) === id)?.title ?? "";
    const cached = readRepoGradeRubricCacheEntry(cacheRef.current!, courseId, cacheKey);
    if (cached) return resolutionToResolvedRubric(cached, "live", identity);

    if (!course?.canvasUrl) {
      const resolution = failedRubricLookup(
        `"${course?.name ?? "This course"}" has no Canvas course URL set, so its rubrics cannot be read.`
      );
      writeRepoGradeRubricCacheEntry(cacheRef.current!, courseId, cacheKey, resolution);
      return resolutionToResolvedRubric(resolution, "live", identity);
    }
    const numericId = Number(id);
    if (!Number.isFinite(numericId)) {
      const resolution = failedRubricLookup("This rubric's id could not be read.");
      writeRepoGradeRubricCacheEntry(cacheRef.current!, courseId, cacheKey, resolution);
      return resolutionToResolvedRubric(resolution, "live", identity);
    }

    setPendingResolves((c) => c + 1);
    try {
      const result = await getRubricAction(course.canvasUrl, numericId, course.institution ?? undefined);
      let resolution: RepoGradeRubricResolution;
      if ("error" in result) {
        // AC item 52: this is exactly where an account-level rubric's id
        // 404s against the course-scoped getRubric endpoint - listRubrics
        // merges "account" rubrics into the same array it returns
        // course-level ones in, but getRubric cannot read one back
        // (canvas-modules/types.ts:214-218). A real, expected failure path,
        // handled by the same generic branch as any other lookup failure -
        // no special-casing needed, the degradation is identical either way.
        resolution = failedRubricLookup(result.error);
      } else if (!rubricHasUsablePoints(result.rubric)) {
        // AC item 68: a rubric worth zero points anywhere would render valid
        // lines that parse but sum to a blank score for every graded
        // submission in the column - refuse it here, before it ever reaches
        // a grading call, rather than after silently blanking a column.
        resolution = failedRubricLookup(
          `"${result.rubric.title}" has no criteria worth any points, so grading against it would leave every score in this column blank - a rubric will be generated instead.`
        );
      } else {
        resolution = resolvedRubric(renderPickedRubricText(result.rubric));
      }
      writeRepoGradeRubricCacheEntry(cacheRef.current!, courseId, cacheKey, resolution);
      return resolutionToResolvedRubric(resolution, "live", identity);
    } finally {
      setPendingResolves((c) => c - 1);
    }
  }

  /** `export` source: also one rubric for the whole page, keyed the same way
   * as `live` above (`export:<occurrence>:<title>`, i.e. the encoded select
   * value). No network call at all - the export's rubrics are already in
   * memory (`exportRubrics`, loaded once by useRepoGradesData - item 70: "no
   * database work... read-only against existing stores") - so this never
   * touches `pendingResolves`; there is nothing to wait on. Still routed
   * through the same cache as every other source so a repeated lookup (a
   * second column's grade click, or the textarea-preview effect below) never
   * re-renders the same rubric text twice. */
  async function resolveExportChoice(occurrence: number, title: string): Promise<ResolvedRubric> {
    const cacheKey = `export:${occurrence}:${title}`;
    const cached = readRepoGradeRubricCacheEntry(cacheRef.current!, courseId, cacheKey);
    if (cached) return resolutionToResolvedRubric(cached, "export", title);

    const found = findExportRubricByIdentity(exportRubrics, occurrence, title);
    let resolution: RepoGradeRubricResolution;
    if (!found) {
      resolution = failedRubricLookup(
        `"${title}" is no longer in this course's saved export (the export may have been replaced) - a rubric will be generated instead.`
      );
    } else {
      // exportRubrics is deliberately typed structurally in this hook's own
      // params (`criteria: readonly unknown[]`, matching item 48/59's "stays
      // decoupled from the CartridgeRubric type chain"); at runtime it is
      // always ExportCourseContent.rubrics (CartridgeRubric[]), which
      // structurally satisfies RenderableRubric. Cast, not re-validate:
      // re-checking each field here would duplicate cartridge-import.ts's
      // own parsing without adding any safety renderPickedRubricText/
      // rubricHasUsablePoints do not already provide - both read only the
      // fields they need and tolerate extras.
      const renderable = found as unknown as RenderableRubric;
      if (!rubricHasUsablePoints(renderable)) {
        // AC item 68 again, for the export path: a cartridge criterion's
        // `points` defaults to 0 on missing XML (cartridge-import.ts:199),
        // so "absent" and "genuinely zero" are indistinguishable once the
        // data reaches this module - refuse rather than blank a column.
        resolution = failedRubricLookup(
          `"${title}" has no criteria worth any points, so grading against it would leave every score in this column blank - a rubric will be generated instead.`
        );
      } else {
        resolution = resolvedRubric(renderPickedRubricText(renderable));
      }
    }
    writeRepoGradeRubricCacheEntry(cacheRef.current!, courseId, cacheKey, resolution);
    return resolutionToResolvedRubric(resolution, "export", title);
  }

  /** THE shared resolver (AC item 16) - both handleGradeCell and
   * runBulkGrade call this and nothing else. Never throws (AC item 13): the
   * outer try/catch is the final backstop beyond each branch's own
   * `{error}`-returning server actions, so an unexpected exception anywhere
   * in this chain still degrades to a generated rubric with a stated reason
   * instead of aborting a grading run. */
  const resolveRubricForColumn = async (assignmentId: string | null): Promise<ResolvedRubric> => {
    try {
      switch (currentSource) {
        case "generate":
          return { text: "", source: "generate", identity: "", failureReason: null };
        case "manual":
          return { text: manualText, source: "manual", identity: "", failureReason: null };
        case "assignment":
          if (!assignmentId) {
            // AC item 12: no mapped assignment for this column - the
            // effective rubric is "", never another column's or another
            // source's rubric.
            return {
              text: "",
              source: "assignment",
              identity: "",
              failureReason:
                "No Canvas assignment is mapped to this column, so no rubric could be resolved - a rubric will be generated instead.",
            };
          }
          return await resolveAssignment(assignmentId);
        case "live":
          if (parsedSelection?.source === "live") return await resolveLiveChoice(parsedSelection.id);
          break;
        case "export":
          if (parsedSelection?.source === "export") {
            return await resolveExportChoice(parsedSelection.occurrence, parsedSelection.title);
          }
          break;
      }
      // Unreachable given parseRepoGradeRubricValue's own union - `switch`
      // narrowed on `currentSource` while the `if` above re-checks
      // `parsedSelection.source` for its identity fields, so a value that
      // somehow disagrees between the two (never trust stored/selected data)
      // falls through here rather than throwing.
      return { text: "", source: "generate", identity: "", failureReason: null };
    } catch (err) {
      return {
        text: "",
        source: currentSource,
        identity: "",
        failureReason: err instanceof Error ? `Unexpected error resolving the rubric: ${err.message}` : "Unexpected error resolving the rubric.",
      };
    }
  };

  // ---- Live/export textarea preview (AC item 14: "the textarea always
  // shows the EFFECTIVE rubric text for the current source"). Calls the
  // SAME resolveRubricForColumn a grade click would (assignmentId is unused
  // by the live/export branches, so `null` is exactly as correct as any real
  // column id) - see this file's header comment for why that is a
  // correctness property, not an implementation convenience.
  useEffect(() => {
    if (currentSource !== "live" && currentSource !== "export") return;
    const key = selectedValue;
    let cancelled = false;
    (async () => {
      const resolved = await resolveRubricForColumn(null);
      if (cancelled) return;
      setDisplayResolved({ key, resolved });
      // UX notes 3.3 event 1 ("a pick resolved to usable text") - announced
      // once per distinct selection (the effect only re-runs when
      // `selectedValue` itself changes), through the same `onAnnounce`
      // channel as the other two events above. A failed resolve is NOT
      // announced here - that is either the stale-choice event above (a
      // persisted choice that no longer exists) or the list-load-failure
      // event above (a live/export list that never loaded at all); a
      // per-rubric failure with no list failure (e.g. AC item 68's
      // zero-points refusal) is left to the visible "Could not load this
      // rubric: ..." text `currentTextareaValue` already renders, matching
      // "do not announce on... a keystroke" - this is not a keystroke, but
      // it is also not one of the three named events.
      if (!resolved.failureReason) {
        onAnnounce(
          currentSource === "live"
            ? `Grading will use the Canvas rubric "${resolved.identity || "this rubric"}".`
            : `Grading will use the export rubric "${resolved.identity || "this rubric"}".`
        );
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resolveRubricForColumn is a fresh closure every render (matches this folder's un-memoized handler convention, e.g. useRepoGradesGradingActions.ts's handleGradeCell); selectedValue/courseId/course's two read fields are the real, primitive triggers for re-resolving. onAnnounce is a stable-enough prop callback (setPostSummary) not worth adding as a dep for the same reason.
  }, [selectedValue, currentSource, courseId, course?.canvasUrl, course?.institution]);

  function currentTextareaValue(): string {
    if (currentSource === "assignment") {
      return "Resolved per column when you grade - each column reads its own mapped Canvas assignment's rubric. A column with no mapped assignment will have a rubric generated instead.";
    }
    if (currentSource === "live" || currentSource === "export") {
      if (!displayResolved || displayResolved.key !== selectedValue) {
        return "Loading this rubric's text...";
      }
      if (displayResolved.resolved.failureReason) {
        return `Could not load this rubric: ${displayResolved.resolved.failureReason}`;
      }
      return displayResolved.resolved.text;
    }
    // generate / manual: the editable box, exactly as today (AC item 14).
    return manualText;
  }

  const onChange = (value: string) => {
    const parsed = parseRepoGradeRubricValue(value);
    // A real <select> only ever emits a value buildRepoGradeRubricOptions
    // produced, but never trust input regardless (RULE 5's posture, applied
    // at every boundary this hook touches).
    if (!parsed) return;
    setSelectedValue(value);
    setHasUserChosen(true);
    setStaleNote(null);
    const identity = parsed.source === "live" ? parsed.id : parsed.source === "export" ? `${parsed.occurrence}:${parsed.title}` : "";
    persistRepoGradeRubricChoice(courseId, { source: parsed.source, identity });
  };

  const onManualTextChange = (value: string) => {
    setManualText(value);
    persistRepoGradeManualRubricText(courseId, value);
    setHasUserChosen(true);
    setStaleNote(null);
    // AC item 39: typing ALWAYS promotes the source to manual, even if the
    // box was showing the `assignment` note (readOnly is false there - see
    // textareaReadOnly below - by the contract's own wording) or was already
    // manual. Only persist the source change when it is actually a change,
    // matching onChange's own single write-per-real-change posture.
    if (selectedValue !== MANUAL_SELECT_VALUE) {
      setSelectedValue(MANUAL_SELECT_VALUE);
      persistRepoGradeRubricChoice(courseId, { source: "manual", identity: "" });
    }
  };

  // AC item 40: renders only on a real collision - the current source would
  // otherwise be showing something other than the instructor's own typed
  // text, AND that typed text is not empty (nothing to lose). Derived
  // directly from state rather than tracked as a separate "did we just
  // switch" flag, so it is correct regardless of how many times the
  // instructor flips between live/export options while manualText stays
  // put - it should stay available the whole time, not just on the first
  // switch.
  const restoreManualText: (() => void) | null =
    (currentSource === "live" || currentSource === "export") && manualText.trim() !== ""
      ? () => onChange(MANUAL_SELECT_VALUE)
      : null;

  const describeColumn = (assignmentId: string | null): string =>
    describeRepoGradeColumnRubric({
      source: currentSource,
      chosenLabel: selectedTitle(),
      columnHasMappedAssignment: assignmentId !== null,
    });

  return {
    value: selectedValue,
    options,
    onChange,
    manualText,
    onManualTextChange,
    textareaValue: currentTextareaValue(),
    // Contract's own wording: read-only for live/export only. `assignment`'s
    // note and `generate`/`manual`'s box both stay editable - typing over
    // the `assignment` note is exactly how AC item 39's "typing always
    // promotes to manual" reaches that source too.
    textareaReadOnly: currentSource === "live" || currentSource === "export",
    restoreManualText,
    resolving,
    resolveRubricForColumn,
    describeColumn,
    staleChoiceNote: staleNote,
    liveRubricHint,
    exportRubricHint,
  };
}
