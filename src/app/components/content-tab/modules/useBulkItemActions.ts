"use client";

import type React from "react";
import { useEffect, useRef, useState } from "react";
import type { BulkKind, CanvasModule, CanvasModuleItem, CanvasRubric, GradableKind } from "@/lib/canvas-modules";
import {
  bulkAssociateRubricAction,
  bulkDeleteAction,
  bulkUpdateAction,
  createQuizQuestionAction,
  deleteCourseFileAction,
  deleteModuleItemAction,
  getGradableAction,
  setModuleDueDatesAction,
  updateGradableAction,
  updateModuleItemAction,
  updatePageAction,
} from "../../../actions";
import {
  generateAndAssociateRubricAction,
  type RubricTargetItem,
  type RubricTargetOutcome,
} from "@/app/actions/rubric-bulk";
import type { EditableQuestion } from "../types";
import { itemKey, quizQuestionToInput, toLocalInput } from "../utils";
import { isConfirmArmed, selectionSignature } from "./confirmArming";
import type { RubricBuilderTarget } from "./useRubrics";
import {
  buildRubricGenerationInstructions,
  classifyAssignmentDetailFetch,
  describeRubricGenerateNote,
  detailFetchFailureOutcome,
  mapWithConcurrency,
  RUBRIC_DETAIL_FETCH_CONCURRENCY,
  summarizeRubricGenerateOutcomes,
  type BulkRubricGenerateReport,
} from "./bulkRubricGenerateSummary";
import { planModuleShiftMoves, planMoveToModulePositions } from "./bulkItemModulePlacementPlan";
import { computeSelectedGradables, groupIdsByKind } from "./bulkItemSelectionQueries";
import { createBulkOpRunners } from "./bulkOpRunners";
import { classifyDescriptionShare, type DescSharedState } from "./descSharedState";
import type { RubricRunLogEntry } from "@/lib/rubric-run-log";
// The run-log concern (state, persistence, recordRubricRunLog/
// clearRubricRunLog) moved to ./useRubricRunLog.ts to keep this file under
// the repo's 1000-line ceiling - a STRUCTURAL split only, no behaviour
// change. See that file's own header for why the run log is a real,
// pre-existing boundary (its own acceptance-criteria document, its own
// dedicated store module) rather than an arbitrary slice.
// `bulkGenerateAndAssociateRubric` below - the pinned wiring
// useBulkItemActions.test.ts scans by source text - stays here unmoved and
// simply calls the returned `recordRubricRunLog` the same way it always did.
import { useRubricRunLog } from "./useRubricRunLog";

// docs/rubric-bulk-action-acceptance-criteria.md, chunk H, agent 2B's slice
// (AC4/AC5): "Generate & associate rubric" is the grading group's own new
// control (bulkBarGroupCatalog.ts's `itemsGenerateAssociateRubric`). Its pure
// core (instructions text, outcome summarisation, the instructor-facing
// note) lives in ./bulkRubricGenerateSummary.ts - re-exported below so every
// existing importer of the type (BulkItemsSection.tsx) keeps working
// unchanged - and is exercised directly by bulkRubricGenerateSummary.test.ts.
// `bulkGenerateAndAssociateRubric` below stays here because it is stateful
// (useState/async); its own wiring is checked by source text in
// useBulkItemActions.test.ts.
//
// AC4 IS THE PART MOST LIKELY TO BE GOT WRONG, AND THE BAD PRECEDENT SITS
// RIGHT NEXT TO THIS CODE: `bulkRubric` below (the shipped "Associate"
// button) silently drops every non-Assignment / no-contentId item from its
// own `.filter(...)` and carries no New Quiz guard at all. That is
// pre-existing, explicitly NOT inherited here per the chunk's own brief, and
// NOT fixed here either (out of scope) - `bulkGenerateAndAssociateRubric`
// below does not reuse `bulkRubric`'s filtering and must not be made to
// resemble it later without re-reading this comment.
export type { BulkRubricGenerateReport } from "./bulkRubricGenerateSummary";

export interface UseBulkItemActionsReturn {
  opBusy: boolean;
  bulkDue: string;
  setBulkDue: (v: string) => void;
  bulkShift: number;
  setBulkShift: (v: number) => void;
  bulkStaggerOffset: number;
  setBulkStaggerOffset: (v: number) => void;
  bulkStaggerUnit: "weeks" | "days";
  setBulkStaggerUnit: (v: "weeks" | "days") => void;
  bulkModuleShift: number;
  setBulkModuleShift: (v: number) => void;
  bulkTargetModule: number | "";
  setBulkTargetModule: (v: number | "") => void;
  bulkItemsDescription: string;
  setBulkItemsDescription: (v: string) => void;
  bulkItemsQuestions: EditableQuestion[];
  setBulkItemsQuestions: React.Dispatch<React.SetStateAction<EditableQuestion[]>>;
  bulkItemsQuestionsOpen: boolean;
  setBulkItemsQuestionsOpen: (v: boolean) => void;
  descSharedState: DescSharedState;
  /** Populated only while descSharedState === "partial" - see that state's
   * own comment above. */
  descPartialCounts: { uncheckedCount: number; totalCount: number } | null;
  bulkPoints: string;
  setBulkPoints: (v: string) => void;
  bulkRubricId: number | "";
  setBulkRubricId: (v: number | "") => void;
  bulkRubricGenerateReport: BulkRubricGenerateReport | null;
  bulkGenerateAndAssociateRubric: () => void;
  /** docs/rubric-bulk-log-acceptance-criteria.md - the durable, per-course
   * record `bulkRubricGenerateReport` above does not survive past the next
   * run or a reload. See RubricRunLogPanel.tsx, the only renderer. */
  rubricRunLog: readonly RubricRunLogEntry[];
  clearRubricRunLog: () => void;
  bulkSubType: string;
  setBulkSubType: (v: string) => void;
  confirmDeleteContent: boolean;
  bulkPublish: (published: boolean) => void;
  bulkSetDue: () => void;
  bulkShiftDue: () => void;
  bulkStaggerDue: () => void;
  bulkShiftModules: (dir: -1 | 1) => void;
  bulkMoveToModule: () => void;
  bulkSetPoints: () => void;
  bulkRubric: () => void;
  openRubricBuilder: () => void;
  selectedAssignmentCount: () => number;
  bulkUpdateSubmissionType: () => void;
  bulkSetDescription: () => void;
  bulkAddQuestionsToQuizzes: () => void;
  bulkRemoveFromModule: () => void;
  /** B2: whether the NEXT bulkRemoveFromModule() call will actually remove -
   * armed for the current selection's signature, same shape as
   * confirmDeleteContent above but tracked independently. */
  confirmRemoveFromModule: boolean;
  bulkDeleteContent: () => void;
}

// Bulk operations over the currently-selected items: due dates, points,
// rubrics, submission type, description/questions, cross-module moves, and
// removal/deletion. Also pre-fills the bulk fields from the selection when it
// shares a single value (deadline / points / rubric / description).
export function useBulkItemActions(
  courseUrl: string,
  acronym: string | undefined,
  modules: CanvasModule[],
  selected: Set<string>,
  selectedItems: () => Array<{ item: CanvasModuleItem; moduleId: number }>,
  clearSelection: () => void,
  rubrics: CanvasRubric[],
  setRubricBuilder: React.Dispatch<React.SetStateAction<RubricBuilderTarget | null>>,
  opBusy: boolean,
  setOpBusy: (b: boolean) => void,
  setNote: (n: { kind: "success" | "error"; text: string } | null) => void,
  reload: () => void
): UseBulkItemActionsReturn {
  const [bulkDue, setBulkDue] = useState("");
  const [bulkShift, setBulkShift] = useState(7);
  // Staggered due dates: the earliest selected module gets the base date above,
  // and each later module's items are pushed out by this interval per step.
  const [bulkStaggerOffset, setBulkStaggerOffset] = useState(1);
  const [bulkStaggerUnit, setBulkStaggerUnit] = useState<"weeks" | "days">("weeks");
  // How many modules a "Shift up/down" moves the selected items by.
  const [bulkModuleShift, setBulkModuleShift] = useState(1);
  // The module selected items are moved into by the "Move to module" control.
  //
  // NO `ta-` LOCALSTORAGE KEY HERE (AC9, docs/bulk-bar-reorganization-
  // acceptance-criteria.md "WHAT NOT TO DO"). This is the textbook case the
  // repo's own precedent names directly: lmsGenerationModuleTarget.ts's "NO
  // NEW ta- LOCALSTORAGE KEY FOR THE POST TARGET" and
  // useVisualizerCoverage.ts:447's identical reasoning for its own "link
  // into module" select. A remembered "move to module X" is a function of
  // the CURRENT selection and the CURRENT module list, not a preference - a
  // value restored from a previous session could point at a module that no
  // longer exists, or silently move today's very different selection into a
  // module chosen for an unrelated one. No memory is strictly safer than a
  // stale-but-answered-looking default here. Matches the catalog's
  // `itemsTargetModuleSelect` unpersistedReason.
  const [bulkTargetModule, setBulkTargetModule] = useState<number | "">("");
  // Editing the description / quiz questions of the items already selected.
  const [bulkItemsDescription, setBulkItemsDescription] = useState("");
  const [bulkItemsQuestions, setBulkItemsQuestions] = useState<EditableQuestion[]>([]);
  const [bulkItemsQuestionsOpen, setBulkItemsQuestionsOpen] = useState(false);
  // Whether the selected gradables share a description (loaded into the
  // field) - "partial" (S2) is set whenever one or more of the selected
  // gradables' description fetches failed, so the claim never outruns what
  // was actually read. See descSharedState.ts's classifyDescriptionShare.
  const [descSharedState, setDescSharedState] = useState<DescSharedState>("idle");
  // How many selected gradables' current description could not be read,
  // out of how many were considered - only meaningful (both nonzero) when
  // descSharedState === "partial". Rendered by BulkItemsSection.tsx so the
  // instructor sees the honest count, not just "some failed".
  const [descPartialCounts, setDescPartialCounts] = useState<{ uncheckedCount: number; totalCount: number } | null>(null);
  const [bulkPoints, setBulkPoints] = useState("");
  // NO `ta-` LOCALSTORAGE KEY HERE - same reasoning as bulkTargetModule
  // above, and the identical shape as bulkAddRubricId in
  // useBulkModuleActions.ts: `bulkRubricId` is also actively RE-DERIVED from
  // the current selection by the pre-fill effect below (only when every
  // selected assignment shares one rubric that still exists), so a value
  // read from storage on mount would be overwritten the moment that effect
  // runs anyway - there is nothing for a stored value to usefully survive
  // between. Matches the catalog's `itemsRubricSelect` unpersistedReason.
  const [bulkRubricId, setBulkRubricId] = useState<number | "">("");
  // Output-only report from the last "Generate & associate rubric" run
  // (AC4) - never restored from storage and never fed back into a control's
  // own value, so it carries no persistence concern of its own; it is reset
  // to null at the start of every new run (see bulkGenerateAndAssociateRubric
  // below) so a stale report from a previous, different selection can never
  // be mistaken for the current run's outcome.
  const [bulkRubricGenerateReport, setBulkRubricGenerateReport] = useState<BulkRubricGenerateReport | null>(null);

  // docs/rubric-bulk-log-acceptance-criteria.md (B1/B2): the durable,
  // per-course run-log state/persistence/mutators live in useRubricRunLog.ts
  // now (see this file's own import comment above for why) - `rubricRunLog`/
  // `clearRubricRunLog` are returned unchanged under the same names every
  // existing caller (RubricRunLogPanel.tsx, via this hook's own return
  // object below) already uses, and `recordRubricRunLog` is called by
  // `bulkGenerateAndAssociateRubric` below exactly as it always was.
  const { rubricRunLog, clearRubricRunLog, recordRubricRunLog } = useRubricRunLog(courseUrl);

  const [bulkSubType, setBulkSubType] = useState("");
  // Two-click "Confirm delete" arming for the item selection. `selected` is
  // already the raw item-key Set (moduleId:itemId, the same shape `itemKey`
  // produces) passed in as a hook parameter, so it is signed directly rather
  // than re-derived from `selectedItems()`. Armed state records the signature
  // of the selection it was armed for (see confirmArming.ts), so changing the
  // selection after arming invalidates the confirmation instead of leaving a
  // stale "Confirm delete" label pointed at a different set of items.
  const [deleteArmedFor, setDeleteArmedFor] = useState<string | null>(null);
  const itemSelectionSig = selectionSignature(selected);
  const confirmDeleteContent = isConfirmArmed(deleteArmedFor, itemSelectionSig);
  // B2: "Remove from module" used to fire on the first click with no arming
  // at all, immediately to the left of the fully-armed Delete above - one
  // click destroyed every selected item's module placement, position,
  // indent and title override. Independent signature state (not shared with
  // deleteArmedFor) so arming one never arms the other, matching the
  // per-row version of this same call (ModuleItemRow.tsx's confirmId).
  const [removeArmedFor, setRemoveArmedFor] = useState<string | null>(null);
  const confirmRemoveFromModule = isConfirmArmed(removeArmedFor, itemSelectionSig);

  // The selected gradable items plus the data needed to pre-fill the bulk
  // fields (computeSelectedGradables, ./bulkItemSelectionQueries.ts).
  const selGradables = computeSelectedGradables(modules, selected);
  // Sorted "kind:id" signature, so the effect only re-runs when the set changes.
  const gradableSelSig = selGradables.map((g) => `${g.type}:${g.contentId}`).sort().join("|");
  // Latest data read by the effect without widening its dependencies.
  const selGradablesRef = useRef(selGradables);
  useEffect(() => {
    selGradablesRef.current = selGradables;
  }, [selGradables]);
  const rubricsRef = useRef(rubrics);
  useEffect(() => {
    rubricsRef.current = rubrics;
  }, [rubrics]);

  // When the selected gradables share a deadline / points / rubric / description,
  // pre-fill the matching bulk field so the current value loads in for editing;
  // when they differ (or none is selected), clear it. Runs only when the selection
  // changes. Deadline + points come from the item data; description + rubric need
  // a fetch (run in parallel).
  useEffect(() => {
    const gradables = selGradablesRef.current;
    if (gradables.length === 0) {
      setDescSharedState("idle");
      setDescPartialCounts(null);
      return;
    }
    // Deadline (all gradables) and points (assignments + quizzes) from item data.
    const dueSame = gradables.every((g) => g.dueAt === gradables[0].dueAt);
    setBulkDue(dueSame && gradables[0].dueAt ? toLocalInput(gradables[0].dueAt) : "");
    const pointed = gradables.filter((g) => g.type === "Assignment" || g.type === "Quiz");
    const pointsSame = pointed.length > 0 && pointed.every((g) => g.pointsPossible === pointed[0].pointsPossible);
    setBulkPoints(pointsSame && pointed[0].pointsPossible != null ? String(pointed[0].pointsPossible) : "");

    let cancelled = false;
    setDescSharedState("loading");
    (async () => {
      const results = await Promise.all(
        gradables.map((g) => getGradableAction(courseUrl, g.type as GradableKind, g.contentId, acronym))
      );
      if (cancelled) return;
      const detailPairs = gradables
        .map((g, i) => ({ type: g.type, res: results[i] }))
        .filter((p) => !("error" in p.res))
        .map((p) => ({ type: p.type, detail: (p.res as { detail: { description: string; rubricId?: number } }).detail }));
      if (detailPairs.length === 0) {
        setDescSharedState("idle");
        setDescPartialCounts(null);
        return;
      }
      // Description (all gradables). classifyDescriptionShare (S2,
      // ./descSharedState.ts) is what stops a partial fetch from being
      // reported as "shared" - `descs` here holds ONLY the successful
      // fetches, and `gradables.length` (not `descs.length`) is the true
      // total, so a fetch failure shows up as descs.length < gradables.length
      // rather than silently vanishing.
      const descs = detailPairs.map((p) => p.detail.description);
      const share = classifyDescriptionShare(descs, gradables.length);
      setBulkItemsDescription(share.description);
      setDescSharedState(share.state);
      setDescPartialCounts(share.state === "partial" ? { uncheckedCount: share.uncheckedCount, totalCount: share.totalCount } : null);
      // Rubric (assignments only): pre-fill when they all share one that exists
      // in the course's rubric list; otherwise clear.
      const assignmentRubrics = detailPairs.filter((p) => p.type === "Assignment").map((p) => p.detail.rubricId);
      const sharedRubric = assignmentRubrics[0];
      if (
        assignmentRubrics.length > 0 &&
        typeof sharedRubric === "number" &&
        assignmentRubrics.every((id) => id === sharedRubric) &&
        rubricsRef.current.some((r) => r.id === sharedRubric)
      ) {
        setBulkRubricId(sharedRubric);
      } else {
        setBulkRubricId("");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [gradableSelSig, courseUrl, acronym]);

  // Group selected items' ids by kind for the per-kind bulk endpoints
  // (groupIdsByKind, ./bulkItemSelectionQueries.ts).
  const idsByKind = (kinds: BulkKind[], usePageSlug = false): Record<string, string[]> =>
    groupIdsByKind(selectedItems(), kinds, usePageSlug);

  // The generic "run an op over the current selection, then report and
  // refresh" plumbing every simple bulk action below delegates to - moved to
  // ./bulkOpRunners.ts to keep this file under the repo's 1000-line ceiling
  // (a STRUCTURAL split only, no behaviour change). See that file's own
  // header for why this is a real boundary distinct from the specific action
  // definitions that call it.
  const { runBulkSummary, runPerItem } = createBulkOpRunners(setOpBusy, setNote, reload);

  const bulkPublish = (published: boolean) => {
    const items = selectedItems();
    if (items.length === 0) return;
    void runPerItem(
      items,
      (it, moduleId) => updateModuleItemAction(courseUrl, moduleId, it.id, { published }, acronym),
      published ? "Published" : "Unpublished"
    );
  };

  const bulkSetDue = () => {
    if (!bulkDue || Number.isNaN(new Date(bulkDue).getTime())) {
      setNote({ kind: "error", text: "Pick a valid due date first." });
      return;
    }
    const iso = new Date(bulkDue).toISOString();
    const updates = selectedItems()
      .filter(({ item }) => ["Assignment", "Quiz", "Discussion"].includes(item.type) && typeof item.contentId === "number")
      .map(({ item }) => ({ type: item.type, contentId: item.contentId as number, dueAt: iso }));
    if (updates.length === 0) {
      setNote({ kind: "error", text: "No selected items can take a due date." });
      return;
    }
    void runBulkSummary(() => setModuleDueDatesAction(courseUrl, updates, acronym), "Due date set");
  };

  const bulkShiftDue = () => {
    const updates = selectedItems()
      .filter(
        ({ item }) =>
          ["Assignment", "Quiz", "Discussion"].includes(item.type) && typeof item.contentId === "number" && item.dueAt
      )
      .map(({ item }) => {
        const d = new Date(item.dueAt!);
        d.setDate(d.getDate() + bulkShift);
        return { type: item.type, contentId: item.contentId as number, dueAt: d.toISOString() };
      });
    if (updates.length === 0) {
      setNote({ kind: "error", text: "No selected items have a due date to shift." });
      return;
    }
    void runBulkSummary(() => setModuleDueDatesAction(courseUrl, updates, acronym), "Due dates shifted");
  };

  // Stagger due dates by module: the earliest selected module's gradables get the
  // base date, the next module's get base + 1 interval, the next base + 2, and so
  // on. Rank is by module list order over only the modules that have a selected
  // gradable, so gaps in the selection don't create gaps in the schedule. Items
  // in the same module share a due date.
  const bulkStaggerDue = () => {
    if (!bulkDue || Number.isNaN(new Date(bulkDue).getTime())) {
      setNote({ kind: "error", text: "Pick a base due date first." });
      return;
    }
    const items = selectedItems().filter(
      ({ item }) => ["Assignment", "Quiz", "Discussion"].includes(item.type) && typeof item.contentId === "number"
    );
    if (items.length === 0) {
      setNote({ kind: "error", text: "No selected items can take a due date." });
      return;
    }
    const perStepDays = Math.trunc(bulkStaggerOffset || 0) * (bulkStaggerUnit === "weeks" ? 7 : 1);
    const rank = new Map<number, number>();
    modules
      .filter((mod) => items.some(({ moduleId }) => moduleId === mod.id))
      .forEach((mod, idx) => rank.set(mod.id, idx));
    const base = new Date(bulkDue);
    const updates = items.map(({ item, moduleId }) => {
      const d = new Date(base);
      d.setDate(d.getDate() + (rank.get(moduleId) ?? 0) * perStepDays);
      return { type: item.type, contentId: item.contentId as number, dueAt: d.toISOString() };
    });
    void runBulkSummary(() => setModuleDueDatesAction(courseUrl, updates, acronym), "Due dates staggered");
  };

  // Move every selected item `dir * bulkModuleShift` modules along the module
  // list (negative = toward the top). Each item's target is clamped to the first
  // and last module, so items already at the edge in that direction stay put.
  // Items land at the end of their target module; when several move into the same
  // module their selection order is preserved.
  const bulkShiftModules = (dir: -1 | 1) => {
    const items = selectedItems();
    if (items.length === 0) return;
    const steps = Math.abs(Math.trunc(bulkModuleShift || 0));
    if (steps === 0) {
      setNote({ kind: "error", text: "Enter how many modules to shift by." });
      return;
    }
    if (modules.length < 2) {
      setNote({ kind: "error", text: "There is only one module to move items between." });
      return;
    }
    const delta = dir * steps;

    // Plan each move: source module + target module + the 1-based position the
    // item should take at the end of that target (planModuleShiftMoves,
    // ./bulkItemModulePlacementPlan.ts).
    const plan = planModuleShiftMoves(items, modules, delta);

    const moveItems = items.filter(({ item }) => plan.has(item.id));
    if (moveItems.length === 0) {
      setNote({ kind: "error", text: `Selected items are already at the ${dir < 0 ? "top" : "bottom"} module.` });
      return;
    }

    void (async () => {
      await runPerItem(
        moveItems,
        (it, moduleId) => {
          const p = plan.get(it.id)!;
          return updateModuleItemAction(
            courseUrl,
            moduleId,
            it.id,
            { targetModuleId: p.targetModuleId, position: p.position },
            acronym
          );
        },
        dir < 0 ? "Shifted up" : "Shifted down"
      );
      clearSelection();
    })();
  };

  // Move every selected item into one chosen module, appended to its end in
  // selection order. Items already in that module are left alone.
  const bulkMoveToModule = () => {
    if (bulkTargetModule === "") {
      setNote({ kind: "error", text: "Pick a module to move the items into." });
      return;
    }
    const targetId = bulkTargetModule;
    const target = modules.find((mod) => mod.id === targetId);
    if (!target) return;
    const items = selectedItems();
    if (items.length === 0) return;

    // Position each moved item at the end of the target, after any already there
    // plus the others moving in ahead of it in this batch
    // (planMoveToModulePositions, ./bulkItemModulePlacementPlan.ts).
    const plan = planMoveToModulePositions(items, targetId, target.items.length);

    const moveItems = items.filter(({ item }) => plan.has(item.id));
    if (moveItems.length === 0) {
      setNote({ kind: "error", text: `Selected items are already in "${target.name}".` });
      return;
    }

    void (async () => {
      await runPerItem(
        moveItems,
        (it, moduleId) =>
          updateModuleItemAction(
            courseUrl,
            moduleId,
            it.id,
            { targetModuleId: targetId, position: plan.get(it.id)! },
            acronym
          ),
        `Moved to "${target.name}"`
      );
      clearSelection();
    })();
  };

  const bulkSetPoints = () => {
    const p = Number(bulkPoints);
    if (bulkPoints.trim() === "" || !Number.isFinite(p)) {
      setNote({ kind: "error", text: "Enter a points value." });
      return;
    }
    const byKind = idsByKind(["Assignment", "Quiz"]);
    const kinds = Object.keys(byKind);
    if (kinds.length === 0) {
      setNote({ kind: "error", text: "No selected assignments or quizzes." });
      return;
    }
    void (async () => {
      setOpBusy(true);
      setNote(null);
      let updated = 0;
      let failed = 0;
      for (const k of kinds) {
        const result = await bulkUpdateAction(courseUrl, k as BulkKind, byKind[k], { pointsPossible: p }, acronym);
        if ("error" in result) failed += byKind[k].length;
        else {
          updated += result.updated;
          failed += result.failures.length;
        }
      }
      setOpBusy(false);
      setNote({ kind: failed ? "error" : "success", text: `Points set: ${updated} done${failed ? `, ${failed} failed` : ""}.` });
      reload();
    })();
  };

  const bulkRubric = () => {
    if (bulkRubricId === "") {
      setNote({ kind: "error", text: "Pick a rubric first." });
      return;
    }
    const ids = selectedItems()
      .filter(({ item }) => item.type === "Assignment" && typeof item.contentId === "number")
      .map(({ item }) => String(item.contentId));
    if (ids.length === 0) {
      setNote({ kind: "error", text: "No selected assignments." });
      return;
    }
    void runBulkSummary(() => bulkAssociateRubricAction(courseUrl, Number(bulkRubricId), ids, acronym), "Rubric associated");
  };

  // docs/rubric-bulk-action-acceptance-criteria.md AC1/AC4/AC5: generate ONE
  // point-agnostic rubric spec and associate it to every ELIGIBLE selected
  // item, creating one Canvas rubric per distinct point total. Every item is
  // reported (AC4) - the report is left for BulkItemsSection to render, not
  // decided here.
  //
  // REACHABILITY, hop by hop: this function is the button's own onClick
  // (BulkItemsSection.tsx's "Generate & associate rubric") ->
  // generateAndAssociateRubricAction (src/app/actions/rubric-bulk.ts) ->
  // runGenerateSpecs (one generateRubric call) -> runMaterialize (createRubric
  // once per distinct point total, then bulkAssociateRubric per group) ->
  // real Canvas writes. Nothing in this chain is a dead end: the button is
  // wired directly to this function (no intermediate handler that could
  // silently no-op), and this function always calls the server action when
  // there is a selection, never merely opening a modal or composing state
  // for a later click.
  const bulkGenerateAndAssociateRubric = () => {
    const items = selectedItems();
    if (items.length === 0) return;
    void (async () => {
      setOpBusy(true);
      setNote(null);
      setBulkRubricGenerateReport(null);

      // Only "Assignment" module items with a real contentId can ever be
      // eligible (AC4's own extension: a Quiz/Discussion module item's
      // contentId is the quiz's/discussion topic's own id, never its shadow
      // assignment's - see rubric-bulk-plan.ts's classifyRubricEligibility
      // header for the full citation). Every other kind is still included in
      // `targets` below, unchanged, so the server's own classification
      // reports it as ineligible rather than this hook silently dropping it
      // - the exact defect AC4 calls out in the shipped `bulkRubric` above.
      const assignmentEntries = items.filter(
        ({ item }) => item.type === "Assignment" && typeof item.contentId === "number"
      );

      // AC4 / new-quiz.ts: New Quiz detection is now entirely the server
      // action's own job (rubric-bulk.ts's resolveNewQuizFlags makes ONE
      // course-level fetch and its value always wins whenever it has a row).
      // This hook used to make an identical, second course-level fetch here
      // purely to fill RubricTargetItem.isNewQuiz - a redundant round trip
      // whose result the server discarded whenever it had its own answer
      // (step-10 review, C7 - "the action always prefers its own value").
      // Deleted rather than kept "just in case": `isNewQuiz` is simply left
      // unset on every target below, which the server reads as "unknown,
      // fall back to its own fetch" - exactly the fallback path
      // RubricTargetItem.isNewQuiz's own doc comment describes.

      // Per-assignment detail (existing rubric id, for AC3's idempotency key;
      // description, doubling as the generation source text), fetched with
      // BOUNDED concurrency (C7: a bare Promise.all here used to issue one
      // Canvas GET per selected assignment with no throttle budget at all -
      // forty selected assignments, forty concurrent GETs - and the throttle
      // failures that produced fed straight into the C3 defect below).
      // mapWithConcurrency (bulkRubricGenerateSummary.ts) caps this fan-out.
      const detailByKey = new Map<string, { existingRubricId?: number; description: string }>();
      // C3: a fetch that failed tells us nothing about whether the item
      // already has a rubric - it must never be read as "no rubric" (see
      // classifyAssignmentDetailFetch's own header for the full argument).
      // Collected here as real RubricTargetOutcome "failed" entries, carrying
      // the fetch's own error text, and merged into every report below so
      // the instructor is told which item could not be checked and that
      // nothing was written to it - never silently dropped, never silently
      // treated as eligible.
      const detailFetchFailures: RubricTargetOutcome[] = [];
      if (assignmentEntries.length > 0) {
        const details = await mapWithConcurrency(assignmentEntries, RUBRIC_DETAIL_FETCH_CONCURRENCY, ({ item }) =>
          getGradableAction(courseUrl, "Assignment", item.contentId as number, acronym)
        );
        assignmentEntries.forEach(({ item, moduleId }, i) => {
          const key = itemKey(moduleId, item.id);
          const outcome = classifyAssignmentDetailFetch(key, details[i]);
          if (outcome.status === "fetch-failed") {
            detailFetchFailures.push(detailFetchFailureOutcome(outcome));
          } else {
            detailByKey.set(key, { existingRubricId: outcome.existingRubricId, description: outcome.description });
          }
        });
      }
      const detailFetchFailureKeys = new Set(detailFetchFailures.map((f) => f.itemId));

      const descriptionParts: string[] = [];
      const targets: RubricTargetItem[] = items
        // C3: drop exactly the assignments whose own detail fetch failed -
        // every other item (including every non-Assignment kind) passes
        // through unchanged so the server's own classification still reports
        // it, per AC4.
        .filter(({ item, moduleId }) => !detailFetchFailureKeys.has(itemKey(moduleId, item.id)))
        .map(({ item, moduleId }) => {
          const key = itemKey(moduleId, item.id);
          const detail = detailByKey.get(key);
          if (!detail) {
            // Not an Assignment module item at all (Page/File/SubHeader/
            // ExternalUrl/ExternalTool), or a Quiz/Discussion module item -
            // passed through as-is so the server's own kind check reports it
            // "ineligible-kind" rather than this hook dropping it.
            return { itemId: key, kind: item.type, contentId: item.contentId, pointsPossible: item.pointsPossible };
          }
          if (detail.description.trim()) {
            descriptionParts.push(`${item.title}\n${detail.description}`);
          }
          return {
            itemId: key,
            kind: item.type,
            contentId: item.contentId,
            pointsPossible: item.pointsPossible,
            existingRubricId: detail.existingRubricId,
          };
        });

      const instructions = buildRubricGenerationInstructions(descriptionParts);

      // provider/courseKind deliberately left `undefined` rather than
      // hard-coded here: generateAndAssociateRubricAction already defaults
      // both ("gemini" / "coding"), and passing `undefined` explicitly lets
      // this call site track that default instead of duplicating it as a
      // second literal that could drift from the action's own.
      const result = await generateAndAssociateRubricAction(
        courseUrl,
        instructions,
        targets,
        "Generated Rubric",
        undefined,
        undefined,
        acronym
      );
      setOpBusy(false);

      if ("error" in result) {
        const report: BulkRubricGenerateReport = {
          ...summarizeRubricGenerateOutcomes(detailFetchFailures, []),
          actionError: result.error,
        };
        setBulkRubricGenerateReport(report);
        setNote(describeRubricGenerateNote(report));
        recordRubricRunLog(detailFetchFailures, [], { actionError: result.error });
        return;
      }
      if (result.phase === "generation-failed") {
        const report: BulkRubricGenerateReport = {
          ...summarizeRubricGenerateOutcomes(detailFetchFailures, []),
          generationFailedReason: result.reason,
        };
        setBulkRubricGenerateReport(report);
        setNote(describeRubricGenerateNote(report));
        recordRubricRunLog(detailFetchFailures, [], { generationFailedReason: result.reason });
        return;
      }

      // C3: the detail-fetch failures merge into the SAME report the
      // server's own outcomes populate - one code path, one instructor-
      // facing count, never a second parallel "some items were never
      // checked" mechanism.
      const report = summarizeRubricGenerateOutcomes(
        [...detailFetchFailures, ...result.result.outcomes],
        result.result.orphans
      );
      setBulkRubricGenerateReport(report);
      setNote(describeRubricGenerateNote(report));
      // docs/rubric-bulk-log-acceptance-criteria.md B1.2: the SAME two
      // arrays just passed to summarizeRubricGenerateOutcomes above, not a
      // second read of `report` - the log and the instructor-facing report
      // are built from one shared source of truth, not from each other.
      recordRubricRunLog([...detailFetchFailures, ...result.result.outcomes], result.result.orphans, {});
      reload();
    })();
  };

  // Open the rubric builder, pre-targeting the selected assignments to associate.
  const openRubricBuilder = () => {
    const assignments = selectedItems()
      .filter(({ item }) => item.type === "Assignment" && typeof item.contentId === "number")
      .map(({ item }) => ({ id: String(item.contentId), title: item.title, points: item.pointsPossible }));
    setRubricBuilder({ assignments });
  };

  // Count the number of selected assignment items.
  const selectedAssignmentCount = (): number => {
    return selectedItems().filter(({ item }) => item.type === "Assignment" && typeof item.contentId === "number").length;
  };

  // Update submission type on all selected assignments.
  const bulkUpdateSubmissionType = () => {
    if (bulkSubType === "") {
      setNote({ kind: "error", text: "Pick a submission type first." });
      return;
    }
    const ids = selectedItems()
      .filter(({ item }) => item.type === "Assignment" && typeof item.contentId === "number")
      .map(({ item }) => String(item.contentId));
    if (ids.length === 0) {
      setNote({ kind: "error", text: "No selected assignments." });
      return;
    }
    void (async () => {
      setOpBusy(true);
      setNote(null);
      const result = await bulkUpdateAction(courseUrl, "Assignment", ids, { submissionType: bulkSubType }, acronym);
      setOpBusy(false);
      if ("error" in result) {
        setNote({ kind: "error", text: result.error });
        return;
      }
      const failed = result.failures.length;
      setNote({
        kind: failed > 0 ? "error" : "success",
        text: `Submission type updated on ${result.updated} assignment${result.updated === 1 ? "" : "s"}${failed > 0 ? `, ${failed} failed` : ""}`,
      });
      reload();
    })();
  };

  // Replace the description on every selected gradable, and the body on selected
  // pages, with the text from the bulk "Content" field.
  const bulkSetDescription = () => {
    if (bulkItemsDescription.trim() === "") {
      setNote({ kind: "error", text: "Type a description to set (this replaces the existing one)." });
      return;
    }
    const items = selectedItems();
    const gradables = items.filter(
      ({ item }) => ["Assignment", "Quiz", "Discussion"].includes(item.type) && typeof item.contentId === "number"
    );
    const pages = items.filter(({ item }) => item.type === "Page" && item.pageUrl);
    if (gradables.length === 0 && pages.length === 0) {
      setNote({ kind: "error", text: "No selected items have a description to set." });
      return;
    }
    const desc = bulkItemsDescription;
    void (async () => {
      setOpBusy(true);
      setNote(null);
      let updated = 0;
      let failed = 0;
      for (const { item } of gradables) {
        const r = await updateGradableAction(courseUrl, item.type as GradableKind, item.contentId as number, { description: desc }, acronym);
        if ("error" in r) failed += 1;
        else updated += 1;
      }
      for (const { item } of pages) {
        const r = await updatePageAction(courseUrl, item.pageUrl as string, { body: desc }, acronym);
        if ("error" in r) failed += 1;
        else updated += 1;
      }
      setOpBusy(false);
      setNote({ kind: failed ? "error" : "success", text: `Description set: ${updated} done${failed ? `, ${failed} failed` : ""}.` });
      reload();
    })();
  };

  // Append the composed questions to every selected quiz.
  const bulkAddQuestionsToQuizzes = () => {
    if (bulkItemsQuestions.length === 0) {
      setNote({ kind: "error", text: "Add at least one question first." });
      return;
    }
    const quizzes = selectedItems().filter(({ item }) => item.type === "Quiz" && typeof item.contentId === "number");
    if (quizzes.length === 0) {
      setNote({ kind: "error", text: "No selected quizzes." });
      return;
    }
    void (async () => {
      setOpBusy(true);
      setNote(null);
      let added = 0;
      let failed = 0;
      for (const { item } of quizzes) {
        for (const q of bulkItemsQuestions) {
          const r = await createQuizQuestionAction(courseUrl, item.contentId as number, quizQuestionToInput(q), acronym);
          if ("error" in r) failed += 1;
          else added += 1;
        }
      }
      setOpBusy(false);
      setNote({ kind: failed ? "error" : "success", text: `Questions added: ${added} done${failed ? `, ${failed} failed` : ""}.` });
      reload();
    })();
  };

  const bulkRemoveFromModule = () => {
    const items = selectedItems();
    if (items.length === 0) return;
    if (!confirmRemoveFromModule) {
      setRemoveArmedFor(itemSelectionSig);
      return;
    }
    setRemoveArmedFor(null);
    void (async () => {
      await runPerItem(items, (it, moduleId) => deleteModuleItemAction(courseUrl, moduleId, it.id, acronym), "Removed from module");
      clearSelection();
    })();
  };

  const bulkDeleteContent = () => {
    if (!confirmDeleteContent) {
      setDeleteArmedFor(itemSelectionSig);
      return;
    }
    setDeleteArmedFor(null);
    const items = selectedItems();
    // Assignments/quizzes/discussions/pages go through the per-kind bulk endpoint;
    // files have their own delete; text headers and external URLs only exist as
    // module items, so removing the item is the only "delete" there is.
    const byKind = idsByKind(["Assignment", "Quiz", "Discussion", "Page"], true);
    const kinds = Object.keys(byKind);
    const fileIds = items
      .filter(({ item }) => item.type === "File" && typeof item.contentId === "number")
      .map(({ item }) => item.contentId as number);
    const moduleOnly = items.filter(({ item }) =>
      ["SubHeader", "ExternalUrl", "ExternalTool"].includes(item.type)
    );
    if (kinds.length === 0 && fileIds.length === 0 && moduleOnly.length === 0) {
      setNote({ kind: "error", text: "No selected items can be deleted from Canvas (try Remove from module)." });
      return;
    }
    void (async () => {
      setOpBusy(true);
      setNote(null);
      let deleted = 0;
      let failed = 0;
      for (const k of kinds) {
        const result = await bulkDeleteAction(courseUrl, k as BulkKind, byKind[k], acronym);
        if ("error" in result) failed += byKind[k].length;
        else {
          deleted += result.updated;
          failed += result.failures.length;
        }
      }
      for (const fileId of fileIds) {
        const result = await deleteCourseFileAction(courseUrl, fileId, acronym);
        if ("error" in result) failed += 1;
        else deleted += 1;
      }
      for (const { item, moduleId } of moduleOnly) {
        const result = await deleteModuleItemAction(courseUrl, moduleId, item.id, acronym);
        if ("error" in result) failed += 1;
        else deleted += 1;
      }
      setOpBusy(false);
      setNote({ kind: failed ? "error" : "success", text: `Deleted from Canvas: ${deleted} done${failed ? `, ${failed} failed` : ""}.` });
      clearSelection();
      reload();
    })();
  };

  return {
    opBusy, bulkDue, setBulkDue, bulkShift, setBulkShift, bulkStaggerOffset, setBulkStaggerOffset,
    bulkStaggerUnit, setBulkStaggerUnit, bulkModuleShift, setBulkModuleShift, bulkTargetModule, setBulkTargetModule,
    bulkItemsDescription, setBulkItemsDescription, bulkItemsQuestions, setBulkItemsQuestions,
    bulkItemsQuestionsOpen, setBulkItemsQuestionsOpen, descSharedState, descPartialCounts,
    bulkPoints, setBulkPoints, bulkRubricId, setBulkRubricId,
    bulkRubricGenerateReport, bulkGenerateAndAssociateRubric,
    rubricRunLog, clearRubricRunLog,
    bulkSubType, setBulkSubType,
    confirmDeleteContent,
    bulkPublish, bulkSetDue, bulkShiftDue, bulkStaggerDue, bulkShiftModules, bulkMoveToModule,
    bulkSetPoints, bulkRubric, openRubricBuilder, selectedAssignmentCount, bulkUpdateSubmissionType,
    bulkSetDescription, bulkAddQuestionsToQuizzes, bulkRemoveFromModule, confirmRemoveFromModule, bulkDeleteContent,
  };
}
