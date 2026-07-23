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
import type { EditableQuestion } from "../types";
import { itemKey, quizQuestionToInput, toLocalInput } from "../utils";
import type { RubricBuilderTarget } from "./useRubrics";

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
  descSharedState: "idle" | "loading" | "same" | "mixed";
  bulkPoints: string;
  setBulkPoints: (v: string) => void;
  bulkRubricId: number | "";
  setBulkRubricId: (v: number | "") => void;
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
  const [bulkTargetModule, setBulkTargetModule] = useState<number | "">("");
  // Editing the description / quiz questions of the items already selected.
  const [bulkItemsDescription, setBulkItemsDescription] = useState("");
  const [bulkItemsQuestions, setBulkItemsQuestions] = useState<EditableQuestion[]>([]);
  const [bulkItemsQuestionsOpen, setBulkItemsQuestionsOpen] = useState(false);
  // Whether the selected gradables share a description (loaded into the field).
  const [descSharedState, setDescSharedState] = useState<"idle" | "loading" | "same" | "mixed">("idle");
  const [bulkPoints, setBulkPoints] = useState("");
  const [bulkRubricId, setBulkRubricId] = useState<number | "">("");
  const [bulkSubType, setBulkSubType] = useState("");
  const [confirmDeleteContent, setConfirmDeleteContent] = useState(false);

  // The selected gradable items plus the data needed to pre-fill the bulk fields.
  const selGradables = (() => {
    const arr: Array<{ type: string; contentId: number; dueAt: string | null; pointsPossible: number | null }> = [];
    for (const mod of modules) {
      for (const it of mod.items) {
        if (
          selected.has(itemKey(mod.id, it.id)) &&
          ["Assignment", "Quiz", "Discussion"].includes(it.type) &&
          typeof it.contentId === "number"
        ) {
          arr.push({ type: it.type, contentId: it.contentId, dueAt: it.dueAt, pointsPossible: it.pointsPossible });
        }
      }
    }
    return arr;
  })();
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
        return;
      }
      // Description (all gradables).
      const descs = detailPairs.map((p) => p.detail.description);
      if (descs.every((d) => d === descs[0])) {
        setBulkItemsDescription(descs[0]);
        setDescSharedState("same");
      } else {
        setBulkItemsDescription("");
        setDescSharedState("mixed");
      }
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

  // Group selected items' ids by kind for the per-kind bulk endpoints.
  const idsByKind = (kinds: BulkKind[], usePageSlug = false): Record<string, string[]> => {
    const map: Record<string, string[]> = {};
    for (const { item } of selectedItems()) {
      if (!kinds.includes(item.type as BulkKind)) continue;
      const id =
        item.type === "Page"
          ? usePageSlug
            ? item.pageUrl
            : null
          : item.contentId != null
            ? String(item.contentId)
            : null;
      if (id) (map[item.type] ??= []).push(id);
    }
    return map;
  };

  // Run a bulk op that returns an {updated, failures} summary; report + refresh.
  const runBulkSummary = async (
    fn: () => Promise<{ updated: number; failures: unknown[] } | { error: string }>,
    label: string
  ) => {
    setOpBusy(true);
    setNote(null);
    const result = await fn();
    setOpBusy(false);
    if ("error" in result) {
      setNote({ kind: "error", text: result.error });
      return;
    }
    setNote({
      kind: result.failures.length ? "error" : "success",
      text: `${label}: ${result.updated} done${result.failures.length ? `, ${result.failures.length} failed` : ""}.`,
    });
    reload();
  };

  // Run a per-item op (publish, remove) over the current selection.
  const runPerItem = async (
    items: Array<{ item: CanvasModuleItem; moduleId: number }>,
    fn: (item: CanvasModuleItem, moduleId: number) => Promise<{ ok: true } | { error: string }>,
    label: string
  ) => {
    setOpBusy(true);
    setNote(null);
    let updated = 0;
    let failed = 0;
    for (const { item, moduleId } of items) {
      const result = await fn(item, moduleId);
      if ("error" in result) failed += 1;
      else updated += 1;
    }
    setOpBusy(false);
    setNote({
      kind: failed ? "error" : "success",
      text: `${label}: ${updated} done${failed ? `, ${failed} failed` : ""}.`,
    });
    reload();
  };

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

    const moduleIndex = new Map<number, number>();
    modules.forEach((mod, idx) => moduleIndex.set(mod.id, idx));

    // Plan each move: source module + target module + the 1-based position the
    // item should take at the end of that target (accounting for others moving
    // into the same module ahead of it in this batch).
    const appended = new Map<number, number>();
    const plan = new Map<number, { srcModuleId: number; targetModuleId: number; position: number }>();
    for (const { item, moduleId } of items) {
      const srcIdx = moduleIndex.get(moduleId);
      if (srcIdx === undefined) continue;
      const targetIdx = Math.min(modules.length - 1, Math.max(0, srcIdx + delta));
      if (targetIdx === srcIdx) continue; // already at the top/bottom in this direction
      const target = modules[targetIdx];
      const n = appended.get(target.id) ?? 0;
      plan.set(item.id, { srcModuleId: moduleId, targetModuleId: target.id, position: target.items.length + n + 1 });
      appended.set(target.id, n + 1);
    }

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
    // plus the others moving in ahead of it in this batch.
    let appended = 0;
    const plan = new Map<number, number>();
    for (const { item, moduleId } of items) {
      if (moduleId === targetId) continue; // already in the target module
      plan.set(item.id, target.items.length + appended + 1);
      appended += 1;
    }

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
    void (async () => {
      await runPerItem(items, (it, moduleId) => deleteModuleItemAction(courseUrl, moduleId, it.id, acronym), "Removed from module");
      clearSelection();
    })();
  };

  const bulkDeleteContent = () => {
    if (!confirmDeleteContent) {
      setConfirmDeleteContent(true);
      return;
    }
    setConfirmDeleteContent(false);
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
    bulkItemsQuestionsOpen, setBulkItemsQuestionsOpen, descSharedState,
    bulkPoints, setBulkPoints, bulkRubricId, setBulkRubricId, bulkSubType, setBulkSubType,
    confirmDeleteContent,
    bulkPublish, bulkSetDue, bulkShiftDue, bulkStaggerDue, bulkShiftModules, bulkMoveToModule,
    bulkSetPoints, bulkRubric, openRubricBuilder, selectedAssignmentCount, bulkUpdateSubmissionType,
    bulkSetDescription, bulkAddQuestionsToQuizzes, bulkRemoveFromModule, bulkDeleteContent,
  };
}
