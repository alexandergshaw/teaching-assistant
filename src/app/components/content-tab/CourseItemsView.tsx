"use client";

// Assignments and Quizzes tabs (Contract 2,
// docs/assignments-quizzes-tabs-acceptance-criteria.md). ONE parameterized
// view over BulkItem[], differing only in `kind`, which bulk operations are
// offered, and New Quiz handling (D2) - not two copies of FilesView, and not
// one view branching everywhere on `kind` in its render.
//
// Built to FilesView.tsx's own template exactly (flat rows, checkboxes,
// select-all, search, a bulk bar, its own load/error/empty state, its own
// reload, its own whole-view source gate) - explicitly NOT reusing
// ModulesView's SELECTION/tree-walking plumbing (useModuleSelection etc,
// D3), which is keyed to synthetic module-scoped ids this flat list does not
// have. This view DOES read the module tree now (listCourseContentAction),
// but only READ-ONLY and only to answer "which module is this item in" for
// display (see the module-association state/effect and
// courseItems-modules.ts below) - it is never walked for selection, ordering,
// or any write.

import { useEffect, useMemo, useState } from "react";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import type { BulkItem, CanvasRubric, DueDateUpdate } from "@/lib/canvas-modules";
import {
  bulkAssociateRubricAction,
  bulkDeleteAction,
  bulkUpdateAction,
  listBulkItemsAction,
  listCourseContentAction,
  listRubricsAction,
  setModuleDueDatesAction,
  updateGradableAction,
} from "../../actions";
import styles from "../../page.module.css";
import { gateOperation, type ContentSourceContext } from "./contentSourceGating";
import { useFlatItemSelection } from "./useFlatItemSelection";
import { isConfirmArmed, selectionSignature } from "./modules/confirmArming";
import { effectiveKindOf, groupSelectedByEffectiveKind } from "./courseItems-routing";
import { buildModuleIndex, modulesForItem } from "./courseItems-modules";
import { ordinaryAssignmentSelection } from "./courseItems-eligibility";
import { CourseItemRow } from "./CourseItemRow";
import { interpretRubricsResult } from "./modules/useRubrics";
import {
  DEFAULT_COURSE_ITEM_FILTERS,
  courseItemFiltersStorageKey,
  parseCourseItemFilters,
  serializeCourseItemFilters,
  filterCourseItems,
  hiddenUnknownModuleCount,
  isFiltersActive,
  type CourseItemFilters,
  type PublishedFilter,
  type ModuleFilter,
  type DueDateFilter,
  type PointsFilter,
  type QuizKindFilter,
} from "./courseItems-filters";

export interface CourseItemsViewProps {
  courseUrl: string;
  acronym?: string;
  /** Which kind this instance lists. */
  kind: "Assignment" | "Quiz";
  sourceContext: ContentSourceContext;
  setNote: (n: { kind: "success" | "error"; text: string } | null) => void;
}

const SUBMISSION_TYPE_OPTIONS = [
  { value: "online_text_entry", label: "Text entry" },
  { value: "online_upload", label: "File upload" },
  { value: "online_url", label: "Website URL" },
  { value: "on_paper", label: "On paper" },
  { value: "none", label: "No submission" },
];

export function CourseItemsView({ courseUrl, acronym, kind, sourceContext, setNote }: CourseItemsViewProps) {
  // D4: gated as ONE unit, exactly like FilesView's `filesGate` - a stored
  // export carries a module tree and announcements, never an assignments or
  // quizzes list, so there is no honest partial view to show. Subject is
  // DERIVED from `kind`, never the shared "items" subject: contentSourceGating.ts
  // deliberately added distinct "assignments"/"quizzes" subjects for this
  // exact whole-view gate (it fires before any list exists, unlike "items",
  // which is worded for a bulk write over an already-rendered selection) -
  // reusing "items" here would misname what is actually missing.
  const gate = gateOperation(sourceContext, kind === "Assignment" ? "assignments" : "quizzes");

  const [items, setItems] = useState<BulkItem[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rubrics, setRubrics] = useState<CanvasRubric[]>([]);

  // Module associations (this feature's own AC): a (module-item type, content
  // id) -> module names index, built ONCE from the module tree alongside the
  // items list (A4) - never walked per row. `null` is the ONE sentinel this
  // view ever puts here, and it deliberately conflates two moments that both
  // mean "we can't say yet": before the tree has loaded at all, and after it
  // has failed to load. courseItems-modules.ts's `modulesForItem` renders
  // both as `known: false` -> "Unknown" (see the row render below), which is
  // exactly the failure-shape distinction A4 asks for: never confused with
  // `known: true, names: []`, the genuinely different fact that the tree DID
  // load and this item simply belongs to no module (A2).
  const [moduleIndex, setModuleIndex] = useState<Map<string, string[]> | null>(null);
  // NIT11: `moduleIndex === null` alone cannot tell the row render apart from
  // three different moments - before the tree has loaded at all (index still
  // its initial null), after it has genuinely failed to load, and export mode
  // (where no module tree is ever fetched, though that state is unreachable
  // here: the whole-view gate above returns early for `source === "export"`
  // before any row - or this state - is ever read). Only the middle one is
  // an actual failure. This flag is set true ONLY on a genuine fetch error
  // and false on every other transition (start of a fetch, a clean load, and
  // the export/no-course early-outs), so the row render below can give the
  // "still loading" moment honest wording instead of claiming a failure that
  // never happened.
  const [moduleIndexFailed, setModuleIndexFailed] = useState(false);

  const kindLower = kind.toLowerCase();
  const kindLabelPlural = kind === "Assignment" ? "assignments" : "quizzes";
  const kindLabelSingular = kind === "Assignment" ? "assignment" : "quiz";
  // Persisted per kind (two independent tabs share this one component), NOT
  // per course - a plain substring filter carries no risk of showing a wrong
  // course's data the way a stale selection or a stale bulk-field value
  // would (see the bulk-field comments below for the controls that are
  // deliberately NOT persisted for that reason).
  const searchKey = `ta-course-items-search-${kindLower}`;
  const [search, setSearch] = useState(() => (typeof window !== "undefined" ? localStorage.getItem(searchKey) ?? "" : ""));
  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem(searchKey, search);
  }, [search, searchKey]);

  // Facet filters (this feature's own AC: filter by published vs not,
  // assigned to a module vs not, etc). All five persist together under ONE
  // ta- key per kind - see courseItems-filters.ts's own "Persistence"
  // section for why grouping (rather than five parallel keys) is the right
  // call here, and why none of the five are excluded the way the one-shot
  // bulk-operation fields below deliberately are: every facet is a standing
  // viewing preference, exactly like the pre-existing `search` above.
  const filtersKey = courseItemFiltersStorageKey(kindLower);
  const [filters, setFilters] = useState<CourseItemFilters>(() =>
    parseCourseItemFilters(typeof window !== "undefined" ? localStorage.getItem(filtersKey) : null)
  );
  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem(filtersKey, serializeCourseItemFilters(filters));
  }, [filters, filtersKey]);
  const filtersActive = isFiltersActive(filters);
  const clearFilters = () => setFilters(DEFAULT_COURSE_ITEM_FILTERS);

  // Bulk-operation input fields. Deliberately NOT persisted, matching
  // BulkItemsSection/useBulkItemActions.ts's own precedent for the identical
  // controls on the Modules view: these are one-shot inputs for whatever is
  // CURRENTLY selected, not standing preferences - a persisted due date or
  // description from a past selection would silently pre-fill the wrong
  // value for a brand new selection the next time this view is opened,
  // which is exactly the "persisted value would be actively wrong" carve-out.
  const [bulkDue, setBulkDue] = useState("");
  const [bulkPoints, setBulkPoints] = useState("");
  const [bulkSubType, setBulkSubType] = useState("");
  const [bulkRubricId, setBulkRubricId] = useState<number | "">("");
  const [bulkDescription, setBulkDescription] = useState("");
  // Two-click "Confirm delete" arming (confirmArming.ts), signed by the
  // current selection so changing the selection after arming invalidates a
  // stale confirmation instead of leaving "Confirm delete" pointed at a
  // different set of rows (see confirmArming.ts's own header comment).
  const [deleteArmedFor, setDeleteArmedFor] = useState<string | null>(null);

  const itemsById = useMemo(() => new Map(items.map((it) => [it.id, it] as const)), [items]);
  // Referentially stable across renders where `items` hasn't changed (see
  // useFlatItemSelection.ts's own comment on why this matters for its
  // compare-and-adjust prune).
  const currentIds = useMemo(() => items.map((it) => it.id), [items]);
  const selection = useFlatItemSelection(currentIds);

  // Filtering input (courseItems-filters.ts's own CourseItemFilterRow shape):
  // pairs every item with its already-looked-up module association, computed
  // ONCE per items/moduleIndex change - never per keystroke in the search
  // box or per facet change, both of which only re-slice this same array.
  const filterRows = useMemo(
    () => items.map((it) => ({ item: it, moduleInfo: modulesForItem(it, kind, moduleIndex) })),
    [items, kind, moduleIndex]
  );
  // Reuses filterRows' own already-computed moduleInfo for the row render
  // below, rather than calling modulesForItem a second time per row per
  // render - the two used to disagree in nothing but cost (same inputs,
  // same pure function), so folding them to one lookup is free.
  const moduleInfoById = useMemo(
    () => new Map(filterRows.map((r) => [r.item.id, r.moduleInfo] as const)),
    [filterRows]
  );

  const reload = async () => {
    // Never hits the live Canvas API while viewing a stored export - see the
    // whole-view gate above.
    if (sourceContext.source === "export") {
      setItems([]);
      setStatus("ready");
      return;
    }
    const result = await listBulkItemsAction(courseUrl, kind, acronym);
    if ("error" in result) {
      setError(result.error);
      setStatus("error");
      return;
    }
    setItems(result.items);
    setStatus("ready");
    // A6: reloading (the Refresh button, or after ANY bulk write - every one
    // of them ends by calling this same `reload()`) also refreshes which
    // modules each item belongs to. Without this, a "move to module" done
    // elsewhere in the app (or here, via delete/publish changing what a New
    // Quiz's underlying assignment looks like) would leave this tab's module
    // column stale until an unrelated full page reload. Fire-and-forget, same
    // as every other call site of this function - a failure here degrades
    // only the module column (see loadModuleIndex), never the items list
    // this function just finished rendering above.
    void loadModuleIndex();
  };

  // Fetches the module tree once and rebuilds the lookup index (A4). Shared
  // by `reload()` above and the mount effect below, so a manual refresh, the
  // initial load, and every post-write reload all keep this in step with the
  // items list - never a second, independently-timed fetch.
  const loadModuleIndex = async () => {
    if (!courseUrl || sourceContext.source === "export") {
      setModuleIndex(null);
      setModuleIndexFailed(false);
      return;
    }
    const result = await listCourseContentAction(courseUrl, acronym);
    if ("error" in result) {
      // A4: a failed module-tree fetch must never lose the items list - it
      // already rendered above (or, on the very first load, is handled by
      // its own independent effect below). This only degrades the module
      // column to "Unknown" (index stays/becomes null) and surfaces the
      // failure through the existing note channel, exactly as A4 requires.
      setModuleIndex(null);
      setModuleIndexFailed(true);
      setNote({ kind: "error", text: `Could not load module associations: ${result.error}` });
      return;
    }
    setModuleIndex(buildModuleIndex(result.modules));
    setModuleIndexFailed(false);
  };

  useEffect(() => {
    // Every setState call below lives inside this async IIFE, including the
    // early-exit branch that fires with no preceding `await` at all - this
    // repo's react-hooks/set-state-in-effect rule flags a setState call made
    // directly in an effect's own top-level body, but not one reached
    // through a nested async function expression (see
    // useCartridgeToCanvas.ts's own AC16 comment for the same idiom, and
    // AGENTS.md's set-state-in-effect-idiom memory).
    let cancelled = false;
    (async () => {
      if (!courseUrl || sourceContext.source === "export") {
        if (!cancelled) {
          setItems([]);
          setStatus("ready");
        }
        return;
      }
      setStatus("loading");
      const result = await listBulkItemsAction(courseUrl, kind, acronym);
      if (cancelled) return;
      if ("error" in result) {
        setError(result.error);
        setStatus("error");
        return;
      }
      setItems(result.items);
      setStatus("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [courseUrl, acronym, kind, sourceContext.source]);

  // Rubrics (Assignment tab only - B1/B3): loaded independently of the main
  // list so a rubric-load failure never blocks the item list itself, only
  // disables the rubric select.
  //
  // BLOCKER FIX: this used to narrow with `if (!("error" in result))`, a
  // runtime KEY check against listRubrics' PARTIAL-load shape
  // (rubrics.ts:130-138 returns `{ rubrics, error }` - both keys present -
  // whenever one of the two sources, course-level or account-level, failed
  // but the other still loaded). `"error" in result` is true on that shape,
  // so the partial-load branch took the `false` path and `setRubrics` was
  // never called - the exact defect this whole feature exists to fix
  // (account-rubric fetch failing silently), reproduced here on a second
  // surface. Narrowing on the SUCCESS key (`"rubrics" in result`) instead,
  // and routing every outcome through `interpretRubricsResult`
  // (useRubrics.ts) - the same pure decision the Modules tab's own bulk
  // rubric picker already uses and already has unit tests for - means a
  // partial load still populates the picker with whatever DID load, while a
  // genuine failure (either shape) reaches the existing note channel instead
  // of failing silently.
  useEffect(() => {
    // Same nested-IIFE placement as the main load effect above, and for the
    // same reason.
    let cancelled = false;
    (async () => {
      if (kind !== "Assignment" || !courseUrl || sourceContext.source === "export") {
        if (!cancelled) setRubrics([]);
        return;
      }
      const result = await listRubricsAction(courseUrl, acronym);
      if (cancelled) return;
      const { rubrics: loaded, note } = interpretRubricsResult(result);
      setRubrics(loaded);
      if (note) setNote(note);
    })();
    return () => {
      cancelled = true;
    };
  }, [kind, courseUrl, acronym, sourceContext.source, setNote]);

  // Module associations (this feature's own AC): fetched independently of the
  // main item list, in parallel with it, exactly like the rubrics effect
  // above - so a failure here never blocks the items list itself (A4), only
  // this column. Same nested-IIFE + cancelled-flag placement as every other
  // effect in this file, for the same eslint reason.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!courseUrl || sourceContext.source === "export") {
        if (!cancelled) {
          setModuleIndex(null);
          setModuleIndexFailed(false);
        }
        return;
      }
      const result = await listCourseContentAction(courseUrl, acronym);
      if (cancelled) return;
      if ("error" in result) {
        setModuleIndex(null);
        setModuleIndexFailed(true);
        setNote({ kind: "error", text: `Could not load module associations: ${result.error}` });
        return;
      }
      setModuleIndex(buildModuleIndex(result.modules));
      setModuleIndexFailed(false);
    })();
    return () => {
      cancelled = true;
    };
    // `setNote` is the parent's raw useState setter (ContentTab.tsx), so it is
    // referentially stable across renders - listing it here satisfies
    // exhaustive-deps without ever causing an extra refetch.
  }, [courseUrl, acronym, sourceContext.source, setNote]);

  // Run a bulk write over every effective-kind group, merging the
  // {updated, failures} summaries (B5: per-item failure is isolated and
  // reported, one failing row never aborts the rest), then reload (B6).
  const runGroupedBulkSummary = async (
    fn: (effKind: "Assignment" | "Quiz", ids: string[]) => Promise<{ updated: number; failures: unknown[] } | { error: string }>,
    label: string
  ) => {
    const groups = groupSelectedByEffectiveKind(selection.selected, itemsById, kind);
    const activeGroups = (Object.entries(groups) as Array<["Assignment" | "Quiz", string[]]>).filter(
      ([, ids]) => ids.length > 0
    );
    if (activeGroups.length === 0) return;
    setBusy(true);
    setNote(null);
    let updated = 0;
    let failed = 0;
    for (const [effKind, ids] of activeGroups) {
      const result = await fn(effKind, ids);
      if ("error" in result) failed += ids.length;
      else {
        updated += result.updated;
        failed += result.failures.length;
      }
    }
    setBusy(false);
    setNote({ kind: failed ? "error" : "success", text: `${label}: ${updated} done${failed ? `, ${failed} failed` : ""}.` });
    void reload();
  };

  // B2: publish/unpublish goes through bulkUpdateAction's existing
  // assignment[published] / quiz[published] support (bulk.ts:107-135) - NOT
  // through the module-item API (updateModuleItemAction), which this file
  // never imports. That path exists and has simply never been exercised by
  // any UI before this view; bulk.test.ts already pins its request shape
  // (B2/E4).
  const bulkPublish = (published: boolean) => {
    if (selection.selected.size === 0) return;
    void runGroupedBulkSummary(
      (effKind, ids) => bulkUpdateAction(courseUrl, effKind, ids, { published }, acronym),
      published ? "Published" : "Unpublished"
    );
  };

  const bulkSetDue = () => {
    if (!bulkDue || Number.isNaN(new Date(bulkDue).getTime())) {
      setNote({ kind: "error", text: "Pick a valid due date first." });
      return;
    }
    if (selection.selected.size === 0) return;
    const iso = new Date(bulkDue).toISOString();
    const updates: DueDateUpdate[] = [...selection.selected]
      .map((id): DueDateUpdate | null => {
        const item = itemsById.get(id);
        return item ? { type: effectiveKindOf(item, kind), contentId: Number(id), dueAt: iso } : null;
      })
      .filter((u): u is DueDateUpdate => u !== null);
    if (updates.length === 0) return;
    void (async () => {
      setBusy(true);
      setNote(null);
      const result = await setModuleDueDatesAction(courseUrl, updates, acronym);
      setBusy(false);
      if ("error" in result) {
        setNote({ kind: "error", text: result.error });
        return;
      }
      setNote({
        kind: result.failures.length ? "error" : "success",
        text: `Due date set: ${result.updated} done${result.failures.length ? `, ${result.failures.length} failed` : ""}.`,
      });
      void reload();
    })();
  };

  const bulkSetPoints = () => {
    const p = Number(bulkPoints);
    if (bulkPoints.trim() === "" || !Number.isFinite(p)) {
      setNote({ kind: "error", text: "Enter a points value." });
      return;
    }
    if (selection.selected.size === 0) return;
    void runGroupedBulkSummary(
      (effKind, ids) => bulkUpdateAction(courseUrl, effKind, ids, { pointsPossible: p }, acronym),
      "Points set"
    );
  };

  // Rubrics (assignments only, B1/B3) - the Quizzes tab never renders the
  // control that calls this. FINDING 1 FIX: gated per ROW, not just per tab -
  // a New Quiz, a classic-quiz shadow row, or a graded-discussion shadow row
  // selected in this tab must never reach this write (a New Quiz's own
  // tooltip already says rubric changes "do not apply"; this is what makes
  // that true). `ordinaryAssignmentSelection` filters the selection down to
  // eligible ids and reports how many were left out, so the note can say so
  // plainly rather than silently dropping them.
  const bulkRubric = () => {
    if (bulkRubricId === "") {
      setNote({ kind: "error", text: "Pick a rubric first." });
      return;
    }
    const { eligible: ids, skipped } = ordinaryAssignmentSelection(selection.selected, itemsById);
    if (ids.length === 0) {
      setNote({
        kind: "error",
        text: "Rubric association only applies to ordinary assignments - none of the selected rows are eligible (New Quizzes, classic quizzes, and graded discussions cannot receive a rubric here).",
      });
      return;
    }
    void (async () => {
      setBusy(true);
      setNote(null);
      const result = await bulkAssociateRubricAction(courseUrl, Number(bulkRubricId), ids, acronym);
      setBusy(false);
      if ("error" in result) {
        setNote({ kind: "error", text: result.error });
        return;
      }
      setNote({
        kind: result.failures.length ? "error" : "success",
        text: `Rubric associated: ${result.updated} done${result.failures.length ? `, ${result.failures.length} failed` : ""}${skipped ? `, ${skipped} skipped (not an ordinary assignment)` : ""}.`,
      });
      void reload();
    })();
  };

  // Submission type (assignments only, B1/B3) - same reasoning and same
  // FINDING 1 per-row eligibility gate as bulkRubric above. This one matters
  // even more: PUT assignment[submission_types][]=... against a New Quiz
  // replaces the `external_tool` submission type that IS the New Quiz,
  // destroying it - not merely mislabeling it.
  const bulkUpdateSubmissionType = () => {
    if (bulkSubType === "") {
      setNote({ kind: "error", text: "Pick a submission type first." });
      return;
    }
    const { eligible: ids, skipped } = ordinaryAssignmentSelection(selection.selected, itemsById);
    if (ids.length === 0) {
      setNote({
        kind: "error",
        text: "Submission type can only be changed on ordinary assignments - none of the selected rows are eligible (New Quizzes, classic quizzes, and graded discussions are not affected).",
      });
      return;
    }
    void (async () => {
      setBusy(true);
      setNote(null);
      const result = await bulkUpdateAction(courseUrl, "Assignment", ids, { submissionType: bulkSubType }, acronym);
      setBusy(false);
      if ("error" in result) {
        setNote({ kind: "error", text: result.error });
        return;
      }
      setNote({
        kind: result.failures.length ? "error" : "success",
        text: `Submission type updated on ${result.updated} assignment${result.updated === 1 ? "" : "s"}${result.failures.length ? `, ${result.failures.length} failed` : ""}${skipped ? `, ${skipped} skipped (not an ordinary assignment)` : ""}.`,
      });
      void reload();
    })();
  };

  const bulkSetDescription = () => {
    if (bulkDescription.trim() === "") {
      setNote({ kind: "error", text: "Type a description to set (this replaces the existing one)." });
      return;
    }
    const ids = [...selection.selected];
    if (ids.length === 0) return;
    void (async () => {
      setBusy(true);
      setNote(null);
      let updated = 0;
      let failed = 0;
      for (const id of ids) {
        const item = itemsById.get(id);
        if (!item) {
          failed += 1;
          continue;
        }
        const result = await updateGradableAction(
          courseUrl,
          effectiveKindOf(item, kind),
          Number(id),
          { description: bulkDescription },
          acronym
        );
        if ("error" in result) failed += 1;
        else updated += 1;
      }
      setBusy(false);
      setNote({ kind: failed ? "error" : "success", text: `Description set: ${updated} done${failed ? `, ${failed} failed` : ""}.` });
      void reload();
    })();
  };

  // FINDING 1: how many of the CURRENTLY selected rows are actually eligible
  // for the rubric/submission-type writes (ordinary assignments only) -
  // drives both button-disabling below and the "none eligible" hint, so the
  // UI communicates ineligibility BEFORE a click, not only after one via the
  // error note in bulkRubric/bulkUpdateSubmissionType above.
  const eligibleAssignmentCount =
    kind === "Assignment" ? ordinaryAssignmentSelection(selection.selected, itemsById).eligible.length : 0;

  const selectionSig = selectionSignature(selection.selected);
  const confirmDelete = isConfirmArmed(deleteArmedFor, selectionSig);

  // B4: two-click arming, with the BUTTON ITSELF changing to show the armed
  // state (its label, directly - see the render below), not only a note
  // rendered alongside it.
  const bulkDeleteContent = () => {
    if (selection.selected.size === 0) return;
    if (!confirmDelete) {
      setDeleteArmedFor(selectionSig);
      return;
    }
    setDeleteArmedFor(null);
    void runGroupedBulkSummary(
      (effKind, ids) => bulkDeleteAction(courseUrl, effKind, ids, acronym),
      "Deleted from Canvas"
    );
    // No explicit selection.clear() here: reload() above replaces `items`,
    // which shrinks `currentIds`, and useFlatItemSelection prunes any
    // deleted id out of the selection on its own (A5) - the bulk bar
    // disappears once nothing selected remains valid.
  };

  if (!gate.allowed) {
    return (
      <div className={styles.form}>
        <p className={styles.emptyState}>{gate.reason}</p>
      </div>
    );
  }

  // DECISION (NIT13): search stays title-only. An earlier version of this
  // file also matched the module name(s), labelled "A7" - but the AC this
  // column was built against (docs/rubric-source-module-column-route-handler-acceptance-criteria.md,
  // M1-M7) says nothing about search at all; that label named a criterion
  // that does not exist. It was also not a purely additive change: "Select
  // all" operates on `shown`, so matching on module name silently expands
  // what a search-then-select-all selects to include rows whose TITLE never
  // matched the query - a real behaviour change to an existing control,
  // introduced without being asked for and without being written down
  // anywhere as a deliberate decision. Dropped rather than kept-and-documented:
  // this view's search box has always been "search by title" (see FilesView's
  // own precedent, which this view was explicitly built to mirror), and nothing
  // in this feature's brief calls for widening that. If module-name search is
  // wanted later, it belongs in the AC doc as its own criterion, with the
  // select-all interaction called out explicitly, not folded silently into
  // the module-column change.
  // F1: title search and every facet combine (filterCourseItems runs the
  // search AND every facet over the same `filterRows`, never one replacing
  // the other). F3: narrowing ANY of them - the search box or a facet below
  // - only ever shrinks `visibleIds`. A row that was already selected before
  // the narrowing stays in `selection.selected` even once it drops out of
  // `shown` - hidden, not deselected - because `selectAllVisible` only ever
  // adds/removes exactly `visibleIds` (mergeOrClearVisible in
  // useFlatItemSelection.ts never touches anything outside that list), so a
  // subsequent bulk action still hits it. It only leaves the selection once
  // it becomes genuinely invalid (deleted, or dropped by a reload) via
  // `pruneSelection` - a filter alone never removes it. This is exactly the
  // pre-existing search behaviour; the facets just widen what "visible" can
  // mean.
  const shown = filterCourseItems(filterRows, filters, search);
  const visibleIds = shown.map((it) => it.id);
  const allShownSelected = selection.allVisibleSelected(visibleIds);
  // F2/F4: how many rows the Module facet alone is holding back because
  // their module status is UNKNOWN, not because they genuinely fail the
  // facet - surfaced as its own hint below rather than left as an
  // unexplained gap between the search count and the shown count.
  const hiddenUnknownModules = hiddenUnknownModuleCount(filterRows, filters);

  return (
    <div className={styles.form}>
      <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
        <Button variant="outlined" size="small" onClick={() => void reload()} disabled={busy}>
          Refresh
        </Button>
        <TextField
          size="small"
          type="search"
          placeholder={`Search ${kindLabelPlural} by title…`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ flex: "1 1 200px", maxWidth: 300 }}
        />
        <span className={styles.fieldHint} style={{ margin: 0 }}>
          {search.trim() || filtersActive ? `${shown.length} of ${items.length}` : items.length}{" "}
          {items.length === 1 ? kindLabelSingular : kindLabelPlural}
        </span>
      </div>

      {/* Facet filters (F1: each independent, and they combine with each
          other and with the title search above rather than replacing it).
          "filtered vs not" from the original request read as PUBLISHED vs
          not - the one boolean every row already shows as PUBLISHED/
          UNPUBLISHED below - since the data has no other "already filtered"
          state to answer; "assigned to a module vs not" is the Module
          select; "etc" is covered by the two facets the row data can
          actually answer (due date, points), plus quiz kind on the Quizzes
          tab only (D1's isNewQuiz), never a facet invented past what a
          BulkItem carries. */}
      <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
        <TextField
          select
          size="small"
          label="Published"
          value={filters.published}
          onChange={(e) => setFilters((f) => ({ ...f, published: e.target.value as PublishedFilter }))}
          sx={{ minWidth: 150 }}
        >
          <MenuItem value="all">All</MenuItem>
          <MenuItem value="published">Published only</MenuItem>
          <MenuItem value="unpublished">Unpublished only</MenuItem>
        </TextField>
        <TextField
          select
          size="small"
          label="Module"
          value={filters.module}
          onChange={(e) => setFilters((f) => ({ ...f, module: e.target.value as ModuleFilter }))}
          sx={{ minWidth: 170 }}
        >
          <MenuItem value="all">All</MenuItem>
          <MenuItem value="in-module">In a module</MenuItem>
          <MenuItem value="no-module">Not in any module</MenuItem>
        </TextField>
        <TextField
          select
          size="small"
          label="Due date"
          value={filters.dueDate}
          onChange={(e) => setFilters((f) => ({ ...f, dueDate: e.target.value as DueDateFilter }))}
          sx={{ minWidth: 150 }}
        >
          <MenuItem value="all">All</MenuItem>
          <MenuItem value="has-due">Has a due date</MenuItem>
          <MenuItem value="no-due">No due date</MenuItem>
        </TextField>
        <TextField
          select
          size="small"
          label="Points"
          value={filters.points}
          onChange={(e) => setFilters((f) => ({ ...f, points: e.target.value as PointsFilter }))}
          sx={{ minWidth: 140 }}
        >
          <MenuItem value="all">All</MenuItem>
          <MenuItem value="has-points">Has points</MenuItem>
          <MenuItem value="no-points">No points</MenuItem>
        </TextField>
        {kind === "Quiz" && (
          <TextField
            select
            size="small"
            label="Quiz kind"
            value={filters.quizKind}
            onChange={(e) => setFilters((f) => ({ ...f, quizKind: e.target.value as QuizKindFilter }))}
            sx={{ minWidth: 140 }}
          >
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="classic">Classic quiz</MenuItem>
            <MenuItem value="new-quiz">New Quiz</MenuItem>
          </TextField>
        )}
        {filtersActive && (
          <Button variant="text" size="small" onClick={clearFilters}>
            Clear filters
          </Button>
        )}
        {filters.module !== "all" && hiddenUnknownModules > 0 && (
          <span className={styles.fieldHint} style={{ margin: 0 }}>
            ({hiddenUnknownModules} with unknown module status excluded)
          </span>
        )}
      </div>

      {selection.selected.size > 0 && (
        <div className={styles.bulkBar}>
          <div className={styles.bulkBarHead}>
            <span className={styles.bulkCount}>
              {selection.selected.size} {selection.selected.size === 1 ? kindLabelSingular : kindLabelPlural} selected
            </span>
            <Button variant="outlined" size="small" onClick={selection.clear}>
              Clear
            </Button>
          </div>

          <div className={styles.bulkRow}>
            <span className={styles.bulkLabel}>Publish</span>
            <Button variant="outlined" size="small" disabled={busy} onClick={() => bulkPublish(true)}>
              Publish
            </Button>
            <Button variant="outlined" size="small" disabled={busy} onClick={() => bulkPublish(false)}>
              Unpublish
            </Button>
          </div>

          <div className={styles.bulkRow}>
            <span className={styles.bulkLabel}>Due date</span>
            <TextField
              type="datetime-local"
              size="small"
              sx={{ width: 188 }}
              value={bulkDue}
              onChange={(e) => setBulkDue(e.target.value)}
              aria-label="Due date"
            />
            <Button variant="contained" size="small" disabled={busy} onClick={bulkSetDue}>
              Set
            </Button>
          </div>

          <div className={styles.bulkRow}>
            <span className={styles.bulkLabel}>Points</span>
            <TextField
              type="number"
              size="small"
              sx={{ width: 74 }}
              placeholder="points"
              value={bulkPoints}
              onChange={(e) => setBulkPoints(e.target.value)}
              aria-label="Points"
            />
            <Button variant="outlined" size="small" disabled={busy} onClick={bulkSetPoints}>
              Set points
            </Button>
          </div>

          {/* FINDING 1: rubric association and submission-type change only
              ever apply to an ORDINARY assignment - never a New Quiz, a
              classic-quiz shadow row, or a graded-discussion shadow row, even
              though all three can now appear in this tab (bulk.ts's own bug
              fix). Both controls below stay gated on kind === "Assignment"
              (the Quizzes tab never renders them at all), but are now ALSO
              disabled whenever the current selection contains zero eligible
              rows - communicated up front, before a click, rather than only
              after one via the error note in bulkRubric/
              bulkUpdateSubmissionType. A selection that mixes eligible and
              ineligible rows still applies to the eligible subset (never
              silently drops the rest without saying so - see those
              functions' own "skipped" wording). */}
          {kind === "Assignment" && selection.selected.size > 0 && eligibleAssignmentCount === 0 && (
            <p className={styles.fieldHint} style={{ margin: 0 }}>
              None of the selected rows are ordinary assignments - New Quizzes, classic quizzes, and graded
              discussions cannot receive a rubric or submission-type change here.
            </p>
          )}

          {kind === "Assignment" && (
            <div className={styles.bulkRow}>
              <span className={styles.bulkLabel}>Rubric</span>
              <TextField
                select
                size="small"
                sx={{ maxWidth: 190 }}
                value={bulkRubricId}
                disabled={rubrics.length === 0}
                onChange={(e) => setBulkRubricId(e.target.value === "" ? "" : Number(e.target.value))}
                aria-label="Rubric"
              >
                <MenuItem value="">{rubrics.length === 0 ? "No rubrics" : "Rubric…"}</MenuItem>
                {rubrics.map((r) => (
                  <MenuItem key={r.id} value={r.id}>
                    {r.title}
                  </MenuItem>
                ))}
              </TextField>
              <Button
                variant="outlined"
                size="small"
                disabled={busy || bulkRubricId === "" || eligibleAssignmentCount === 0}
                onClick={bulkRubric}
              >
                Associate
              </Button>
            </div>
          )}

          {kind === "Assignment" && (
            <div className={styles.bulkRow}>
              <span className={styles.bulkLabel}>Submission type</span>
              <TextField
                select
                size="small"
                sx={{ minWidth: 180 }}
                value={bulkSubType}
                onChange={(e) => setBulkSubType(e.target.value)}
                aria-label="Submission type"
              >
                <MenuItem value="">Change submission type…</MenuItem>
                {SUBMISSION_TYPE_OPTIONS.map((opt) => (
                  <MenuItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </MenuItem>
                ))}
              </TextField>
              <Button
                variant="outlined"
                size="small"
                disabled={busy || bulkSubType === "" || eligibleAssignmentCount === 0}
                onClick={bulkUpdateSubmissionType}
              >
                Apply
              </Button>
            </div>
          )}

          <div className={styles.bulkRow}>
            <span className={styles.bulkLabel}>Description</span>
            <TextField
              multiline
              minRows={4}
              fullWidth
              value={bulkDescription}
              onChange={(e) => setBulkDescription(e.target.value)}
              placeholder="Description (HTML allowed) — replaces the description on selected items"
              aria-label="Description to set on the selected items"
              size="small"
            />
            <Button variant="contained" size="small" disabled={busy} onClick={bulkSetDescription}>
              Set description
            </Button>
          </div>

          <div className={styles.bulkRow}>
            <span className={styles.bulkLabel}>Delete</span>
            <Button variant="outlined" size="small" color="error" disabled={busy} onClick={bulkDeleteContent}>
              {confirmDelete ? "Confirm delete" : "Delete from Canvas"}
            </Button>
          </div>
        </div>
      )}

      {status === "loading" ? (
        <div className={styles.loadingState} role="status" aria-live="polite">
          <span className={styles.spinner} aria-hidden="true" />
          <div>
            <p className={styles.loadingTitle}>Loading {kindLabelPlural}…</p>
          </div>
        </div>
      ) : status === "error" ? (
        <p className={styles.error}>{error}</p>
      ) : items.length === 0 ? (
        <p className={styles.emptyState}>This course has no {kindLabelPlural} yet.</p>
      ) : (
        <div className={styles.ccModule}>
          <FormControlLabel
            className={styles.fieldHint}
            style={{ display: "inline-flex", gap: "var(--space-1)", alignItems: "center", margin: 0, padding: "var(--space-2) var(--space-3)" }}
            control={
              <Checkbox
                size="small"
                checked={allShownSelected}
                onChange={() => selection.selectAllVisible(visibleIds)}
                disabled={shown.length === 0}
              />
            }
            label="Select all"
          />
          <div className={styles.ccItems} style={{ borderTop: "1px solid var(--card-border)" }}>
            {shown.length === 0 && (
              // F6: distinct from the "this course has no X yet" empty state
              // above (that one fires when `items.length === 0` - a genuinely
              // empty course - and this block is never reached in that case).
              // This is the OTHER empty state: the course has items, but the
              // search and/or facets have narrowed them all out - worded
              // according to which is actually active, and pointing straight
              // at the clear-filters affordance when a facet is involved.
              <p className={styles.ccHint} style={{ padding: "var(--space-1) var(--space-2)" }}>
                No {kindLabelPlural} match{" "}
                {search.trim() && filtersActive
                  ? "your search and filters"
                  : filtersActive
                    ? "these filters"
                    : "your search"}
                .
                {filtersActive && (
                  <Button variant="text" size="small" onClick={clearFilters} style={{ marginLeft: "var(--space-2)" }}>
                    Clear filters
                  </Button>
                )}
              </p>
            )}
            {/* Per-row rendering (New Quiz/shadow labels, the four-way
                module cell) lives in CourseItemRow.tsx now - extracted out of
                this file once it approached this repo's 1000-line ceiling.
                `moduleInfoById` (built above from `filterRows`, which already
                computed each row's moduleInfo once) is looked up here rather
                than calling modulesForItem a second time per row per
                render. */}
            {shown.map((it) => (
              <CourseItemRow
                key={it.id}
                item={it}
                selected={selection.selected.has(it.id)}
                onToggle={() => selection.toggle(it.id)}
                moduleInfo={moduleInfoById.get(it.id) ?? { known: false }}
                moduleIndexFailed={moduleIndexFailed}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
