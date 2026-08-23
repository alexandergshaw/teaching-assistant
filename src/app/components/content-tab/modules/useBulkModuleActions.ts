"use client";

import type React from "react";
import { useEffect, useState } from "react";
import type { LlmProvider } from "@/lib/llm";
import type { CanvasAddableContent, CanvasModule } from "@/lib/canvas-modules";
import {
  deleteModuleAction,
  generateDocumentTextAction,
  generateSlidesAction,
  revisePageWithAiAction,
  updateModuleAction,
} from "../../../actions";
import type { EditableQuestion } from "../types";
import { slidesToText } from "../utils";
import { isConfirmArmed, selectionSignature } from "./confirmArming";
import { addContentToModuleDetailed } from "./moduleContentActions";

// A single orphaned outcome's identity, stripped of the "orphaned" status tag
// so it can be built up front-end-side (useAddModuleItem.ts's single-item add
// reuses this shape too, for one item at a time) without importing the whole
// ModuleContentResult union.
export type OrphanNote = { kind: string; title: string; contentId?: number | string };

// Render the "created but not linked" clause appended after the existing
// "N done, M failed" note text. Returns "" when there are no orphans, so
// callers can always append the result directly with no extra separator
// logic of their own. Each orphan names its kind and title (and the Canvas
// id, when known) so an instructor can actually go find the leftover object.
export function describeOrphans(orphans: OrphanNote[]): string {
  if (orphans.length === 0) return "";
  const list = orphans
    .map((o) => `${o.kind} "${o.title}"${o.contentId != null ? ` (id ${o.contentId})` : ""}`)
    .join("; ");
  const pronoun = orphans.length === 1 ? "it" : "them";
  return ` ${orphans.length} created but not linked - find ${pronoun} in Canvas: ${list}.`;
}

// AC9 persistence (docs/bulk-bar-reorganization-acceptance-criteria.md
// section 3b, D3): all new `ta-` persistence for this bar's module-side
// controls lives here, in the hook that owns the state, never in
// BulkModulesSection.tsx - a section can be conditionally mounted, and a
// control that never mounts never writes its default.
//
// `bulkAddSubType` ("Submission type for the new assignments") is one of the
// bar's three ALREADY-WORKING persisted controls named in AC9 itself
// ("ta-modules-bulkadd-stype"). It is extracted into these two pure
// functions - unchanged in behaviour - for exactly the reason
// scriptMinutesKey's own doc comment states for its sibling: vitest here is
// node-env with no `window` (vitest.config.ts: environment: "node"), so the
// read-on-init/write-on-change effect below is unexercisable end to end in a
// test file, and the key + the tolerant resolver are the only halves a
// node-environment test can actually reach.
//
// CATALOG DRIFT - RESOLVED. This hook does not own bulkBarGroupCatalog.ts,
// but the drift once reported here is closed: the catalog's
// `moduleAddSubTypeSelect` entry used to declare `persistKey: null` with the
// shared `COMPOSE_FIELD_UNPERSISTED` reason ("free-text scratch content ...
// consumed by the very next click"), which was inaccurate on two counts -
// this control is a `select`, not free text, and it already persisted,
// unchanged, right here. The catalog's owner corrected the entry to declare
// `persistKey: "ta-modules-bulkadd-stype"` (matching this file's real key)
// rather than "fixing" this hook to match a wrong spec. See
// bulkActionsPersistence.test.ts's "catalog <-> implementation persistence
// canary" describe block for the test that now pins the two sides' agreement
// directly, so a future drift in either direction fails loudly instead of
// being rediscovered by hand.
//
// Also note (reported, not changed): unlike its newer Generate-row siblings
// (scriptMinutes, deckTemplate - both `ta-lms-*-${courseUrl}`), this key is
// NOT interpolated per course; it predates that convention. Changing the key
// shape would change behaviour (a value set in one course would stop
// leaking into another), which is out of scope for a persistence-only
// chunk that must not alter any control's behaviour.
const BULK_ADD_SUBTYPE_STORAGE_KEY = "ta-modules-bulkadd-stype";
const BULK_ADD_SUBTYPE_OPTIONS = ["online_text_entry", "online_upload", "online_url", "on_paper", "none"] as const;
const BULK_ADD_SUBTYPE_DEFAULT: (typeof BULK_ADD_SUBTYPE_OPTIONS)[number] = "online_text_entry";

/** The literal storage key "Add to each"'s submission-type select persists
 * under. A function (rather than a bare exported constant) only so its
 * shape matches every other `*Key` helper in this tab (scriptMinutesKey,
 * deckTemplateKey, discussionCheckpointsKey) - none of which take a
 * `courseUrl` here, per the note above. */
export function bulkAddSubTypeStorageKey(): string {
  return BULK_ADD_SUBTYPE_STORAGE_KEY;
}

/**
 * Coerce anything read back out of localStorage - a valid option, a stale
 * value naming a submission type no longer offered, a malformed string, an
 * empty string, or null/undefined - to one of BULK_ADD_SUBTYPE_OPTIONS.
 * Same membership-not-shape idiom as resolveScriptMinutes
 * (src/lib/lms-generation/script-length.ts): a stored value that no longer
 * matches an offered option must degrade to the default rather than
 * rendering an unselectable option or sending a dead value to Canvas.
 */
export function resolveBulkAddSubType(raw: unknown): string {
  if (typeof raw !== "string") return BULK_ADD_SUBTYPE_DEFAULT;
  const value = raw.trim();
  return (BULK_ADD_SUBTYPE_OPTIONS as readonly string[]).includes(value) ? value : BULK_ADD_SUBTYPE_DEFAULT;
}

export interface UseBulkModuleActionsReturn {
  confirmDeleteModules: boolean;
  bulkPublishModules: (published: boolean) => void;
  bulkDeleteModules: () => void;
  bulkAddType: string;
  setBulkAddType: (v: string) => void;
  bulkAddPattern: string;
  setBulkAddPattern: (v: string) => void;
  bulkAddDue: string;
  setBulkAddDue: (v: string) => void;
  bulkAddStaggerOffset: number;
  setBulkAddStaggerOffset: (v: number) => void;
  bulkAddStaggerUnit: "weeks" | "days";
  setBulkAddStaggerUnit: (v: "weeks" | "days") => void;
  bulkAddPoints: string;
  setBulkAddPoints: (v: string) => void;
  bulkAddRubricId: number | "";
  setBulkAddRubricId: (v: number | "") => void;
  bulkAddDescription: string;
  setBulkAddDescription: (v: string) => void;
  bulkAddQuestions: EditableQuestion[];
  setBulkAddQuestions: React.Dispatch<React.SetStateAction<EditableQuestion[]>>;
  bulkQuestionsOpen: boolean;
  setBulkQuestionsOpen: (v: boolean) => void;
  bulkAddFileId: number | "";
  setBulkAddFileId: (v: number | "") => void;
  bulkAddFileContent: string;
  setBulkAddFileContent: (v: string) => void;
  bulkAddFileFormat: "docx" | "pptx";
  setBulkAddFileFormat: (v: "docx" | "pptx") => void;
  bulkAddSubType: string;
  setBulkAddSubType: (v: string) => void;
  bulkAiPrompt: string;
  setBulkAiPrompt: (v: string) => void;
  bulkAiBusy: boolean;
  bulkAddToModules: () => void;
  bulkAiGenerate: () => Promise<void>;
  bulkFileOptions: () => Array<{ value: string; label: string }>;
}

// Whole-module bulk operations: publish/unpublish/delete the selected modules,
// and "Add to each" — creating one new (optionally AI-drafted) item per
// selected module from a shared name pattern.
export function useBulkModuleActions(
  courseUrl: string,
  acronym: string | undefined,
  provider: LlmProvider,
  modules: CanvasModule[],
  selectedModules: Set<number>,
  setSelectedModules: React.Dispatch<React.SetStateAction<Set<number>>>,
  targets: CanvasAddableContent | null,
  setOpBusy: (b: boolean) => void,
  setNote: (n: { kind: "success" | "error"; text: string } | null) => void,
  reload: () => void
): UseBulkModuleActionsReturn {
  // Two-click "Confirm delete" arming for the module selection. Armed state
  // records the signature of the selection it was armed for (see
  // confirmArming.ts), so changing the selection after arming invalidates the
  // confirmation instead of leaving a stale "Confirm delete" label pointed at
  // a different set of modules.
  const [deleteArmedFor, setDeleteArmedFor] = useState<string | null>(null);
  const moduleSelectionSig = selectionSignature(selectedModules);
  const confirmDeleteModules = isConfirmArmed(deleteArmedFor, moduleSelectionSig);
  // "Add to selected modules": the content type to create in each module, and
  // the naming pattern (supports {module} and {n}) used to title each new item.
  const [bulkAddType, setBulkAddType] = useState("Assignment");
  const [bulkAddPattern, setBulkAddPattern] = useState("");
  // Optional details applied to each item created by "Add to each": a first due
  // date (staggered per module by the interval below), points, and a rubric.
  const [bulkAddDue, setBulkAddDue] = useState("");
  const [bulkAddStaggerOffset, setBulkAddStaggerOffset] = useState(1);
  const [bulkAddStaggerUnit, setBulkAddStaggerUnit] = useState<"weeks" | "days">("weeks");
  const [bulkAddPoints, setBulkAddPoints] = useState("");
  // NO `ta-` LOCALSTORAGE KEY HERE for the rubric to associate with newly
  // created items - same reasoning as lmsGenerationModuleTarget.ts's "NO NEW
  // ta- LOCALSTORAGE KEY FOR THE POST TARGET" and useVisualizerCoverage.ts:447:
  // a remembered rubric id is an identifier into a list (`rubrics`) that can
  // shrink between sessions. A value restored from a previous course, or a
  // rubric since deleted from this one, would either silently associate the
  // wrong rubric with brand-new content or render as an unselectable option -
  // worse than starting from "none selected" every time. Matches the
  // catalog's `moduleAddRubricSelect` unpersistedReason.
  const [bulkAddRubricId, setBulkAddRubricId] = useState<number | "">("");
  // Description / page body and (for quizzes) the questions written into each
  // item that "Add to each" creates. Questions are composed in a modal.
  const [bulkAddDescription, setBulkAddDescription] = useState("");
  const [bulkAddQuestions, setBulkAddQuestions] = useState<EditableQuestion[]>([]);
  const [bulkQuestionsOpen, setBulkQuestionsOpen] = useState(false);
  // NO `ta-` LOCALSTORAGE KEY HERE for the existing file to add - same
  // reasoning as bulkAddRubricId just above: `bulkAddFileId` names an entry
  // in `targets.files`, which can be renamed, replaced or deleted between
  // sessions. A restored id could silently attach the wrong file, or one that
  // no longer exists, to every selected module. Matches the catalog's
  // `moduleAddFileExistingSelect` unpersistedReason.
  // For the "File" type: an existing course file to add to each module, or AI-
  // generated content built into a new file (docx or pptx) per module.
  const [bulkAddFileId, setBulkAddFileId] = useState<number | "">("");
  const [bulkAddFileContent, setBulkAddFileContent] = useState("");
  const [bulkAddFileFormat, setBulkAddFileFormat] = useState<"docx" | "pptx">("docx");
  // Submission type for assignments created via bulk add; persisted across
  // reloads under bulkAddSubTypeStorageKey() via resolveBulkAddSubType() -
  // see both functions' doc comments above for the AC9 context and the
  // catalog-drift note.
  const [bulkAddSubType, setBulkAddSubType] = useState<string>(() =>
    resolveBulkAddSubType(typeof window === "undefined" ? null : localStorage.getItem(bulkAddSubTypeStorageKey()))
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(bulkAddSubTypeStorageKey(), bulkAddSubType);
  }, [bulkAddSubType]);
  // AI prompt + busy flag for generating the item's content (description/body/file).
  const [bulkAiPrompt, setBulkAiPrompt] = useState("");
  const [bulkAiBusy, setBulkAiBusy] = useState(false);

  const bulkPublishModules = (published: boolean) => {
    const moduleIds = [...selectedModules];
    if (moduleIds.length === 0) return;
    void (async () => {
      setOpBusy(true);
      setNote(null);
      let updated = 0;
      let failed = 0;
      for (const id of moduleIds) {
        const result = await updateModuleAction(courseUrl, id, { published }, acronym);
        if ("error" in result) failed += 1;
        else updated += 1;
      }
      setOpBusy(false);
      setNote({
        kind: failed ? "error" : "success",
        text: `${published ? "Published" : "Unpublished"} modules: ${updated} done${failed ? `, ${failed} failed` : ""}.`,
      });
      reload();
    })();
  };

  const bulkDeleteModules = () => {
    if (!confirmDeleteModules) {
      setDeleteArmedFor(moduleSelectionSig);
      return;
    }
    setDeleteArmedFor(null);
    const moduleIds = [...selectedModules];
    if (moduleIds.length === 0) return;
    void (async () => {
      setOpBusy(true);
      setNote(null);
      let updated = 0;
      let failed = 0;
      for (const id of moduleIds) {
        const result = await deleteModuleAction(courseUrl, id, acronym);
        if ("error" in result) failed += 1;
        else updated += 1;
      }
      setOpBusy(false);
      setNote({
        kind: failed ? "error" : "success",
        text: `Deleted modules: ${updated} done${failed ? `, ${failed} failed` : ""}.`,
      });
      setSelectedModules(new Set());
      reload();
    })();
  };

  // Fill a naming pattern for one module: {module} -> module name, {n} -> the
  // week/module number read from the module's title (e.g. "Week 5" -> 5, "Unit
  // 12: Foo" -> 12). Prefers a number that follows a week/module-ish word so a
  // leading year like "2024 Fall Week 3" still resolves to 3; otherwise uses the
  // first number in the title, and finally the 1-based selection index when the
  // title has no number at all.
  const fillNamePattern = (pattern: string, moduleName: string, fallbackN: number): string => {
    const labeled = moduleName.match(/(?:week|module|unit|chapter|wk|mod)\s*#?\s*(\d+)/i);
    const anyNumber = moduleName.match(/\d+/);
    const n = labeled ? labeled[1] : anyNumber ? anyNumber[0] : String(fallbackN);
    return pattern.replace(/\{module\}/g, moduleName).replace(/\{n\}/g, n).trim() || `Item ${n}`;
  };

  // Add one new item (named via the pattern) of the chosen type to every
  // selected module, in module order. New content is unpublished by default.
  const bulkAddToModules = () => {
    const targetMods = modules.filter((mod) => selectedModules.has(mod.id));
    if (targetMods.length === 0) return;
    const type = bulkAddType;
    const pattern = bulkAddPattern.trim();
    const fileId = type === "File" && bulkAddFileId !== "" ? Number(bulkAddFileId) : undefined;
    const fileContent = type === "File" && bulkAddFileContent.trim() !== "" ? bulkAddFileContent : undefined;
    if (type === "File") {
      if (fileContent === undefined && fileId === undefined) {
        setNote({ kind: "error", text: "Pick a file to add, or generate one with AI first." });
        return;
      }
      if (fileContent !== undefined && !pattern) {
        setNote({ kind: "error", text: "Enter a name pattern for the generated file." });
        return;
      }
    } else if (!pattern) {
      setNote({ kind: "error", text: "Enter a name pattern for the new items." });
      return;
    }
    const isGradable = ["Assignment", "Quiz", "Discussion"].includes(type);
    // Gather the optional details; each only applies to the types that support it.
    const points =
      ["Assignment", "Quiz"].includes(type) && bulkAddPoints.trim() !== "" && Number.isFinite(Number(bulkAddPoints))
        ? Number(bulkAddPoints)
        : undefined;
    const rubricId = type === "Assignment" && bulkAddRubricId !== "" ? Number(bulkAddRubricId) : undefined;
    const baseDue =
      isGradable && bulkAddDue && !Number.isNaN(new Date(bulkAddDue).getTime()) ? new Date(bulkAddDue) : null;
    const stepDays = Math.max(0, Math.trunc(bulkAddStaggerOffset || 0)) * (bulkAddStaggerUnit === "weeks" ? 7 : 1);
    // Description applies to pages (as the body) and gradables; questions only to quizzes.
    const description =
      ["Assignment", "Quiz", "Discussion", "Page"].includes(type) && bulkAddDescription.trim() !== ""
        ? bulkAddDescription
        : undefined;
    const questions = type === "Quiz" && bulkAddQuestions.length > 0 ? bulkAddQuestions : undefined;
    void (async () => {
      setOpBusy(true);
      setNote(null);
      let added = 0;
      let failed = 0;
      let n = 0;
      const orphans: OrphanNote[] = [];
      for (const mod of targetMods) {
        n += 1;
        // The first selected module gets the base due date; each later one is
        // pushed out by the stagger interval (0 = same date for all).
        let dueAt: string | null = null;
        if (baseDue) {
          const d = new Date(baseDue);
          d.setDate(d.getDate() + (n - 1) * stepDays);
          dueAt = d.toISOString();
        }
        const result = await addContentToModuleDetailed(courseUrl, acronym, type, mod.id, fillNamePattern(pattern, mod.name, n), {
          dueAt,
          points,
          rubricId,
          description,
          questions,
          fileId,
          fileContent,
          fileFormat: bulkAddFileFormat,
          submissionType: type === "Assignment" ? bulkAddSubType : undefined,
        });
        if (result.status === "success") {
          added += 1;
        } else {
          // An orphan (content created in Canvas, module link failed) is not
          // visible in the module - it must still count as failed here, same
          // as an outright failure, not as a success.
          failed += 1;
          if (result.status === "orphaned") {
            orphans.push({ kind: result.kind, title: result.title, contentId: result.contentId });
          }
        }
      }
      setOpBusy(false);
      setNote({
        kind: failed ? "error" : "success",
        text: `Added to modules: ${added} done${failed ? `, ${failed} failed` : ""}.${describeOrphans(orphans)}`,
      });
      reload();
    })();
  };

  // Generate the "Add to each" content with AI: an HTML description/body for
  // gradables and pages, or HTML file content when adding a File. The result fills
  // the matching field for review before the items are created.
  const bulkAiGenerate = async () => {
    if (!bulkAiPrompt.trim()) {
      setNote({ kind: "error", text: "Describe what to generate first." });
      return;
    }
    setBulkAiBusy(true);
    setNote(null);
    if (bulkAddType === "File") {
      // Files become a branded .docx or .pptx. For slides, generate a structured
      // deck and keep it as editable text; for documents, markdown-ish text.
      if (bulkAddFileFormat === "pptx") {
        const result = await generateSlidesAction(bulkAiPrompt.trim(), provider);
        setBulkAiBusy(false);
        if ("error" in result) {
          setNote({ kind: "error", text: result.error });
          return;
        }
        setBulkAddFileContent(slidesToText(result));
        setNote({ kind: "success", text: "Generated slides — review them below, then Add to build a .pptx per module." });
        return;
      }
      const result = await generateDocumentTextAction(bulkAiPrompt.trim(), provider);
      setBulkAiBusy(false);
      if ("error" in result) {
        setNote({ kind: "error", text: result.error });
        return;
      }
      setBulkAddFileContent(result.text);
      setNote({ kind: "success", text: "Generated document text — review it below, then Add to build a .docx per module." });
      return;
    }
    // Other types take an HTML description/body.
    const instruction = `Write the full HTML body for a ${bulkAddType.toLowerCase()} in a course. ${bulkAiPrompt.trim()}`;
    const result = await revisePageWithAiAction("", instruction, provider);
    setBulkAiBusy(false);
    if ("error" in result) {
      setNote({ kind: "error", text: result.error });
      return;
    }
    setBulkAddDescription(result.html);
    setNote({ kind: "success", text: "Generated content — review it above, then Add." });
  };

  // For bulk operations: get list of existing files.
  const bulkFileOptions = (): Array<{ value: string; label: string }> => {
    if (!targets) return [];
    return targets.files.map((f) => ({ value: String(f.id), label: f.title }));
  };

  return {
    confirmDeleteModules, bulkPublishModules, bulkDeleteModules,
    bulkAddType, setBulkAddType, bulkAddPattern, setBulkAddPattern,
    bulkAddDue, setBulkAddDue, bulkAddStaggerOffset, setBulkAddStaggerOffset,
    bulkAddStaggerUnit, setBulkAddStaggerUnit, bulkAddPoints, setBulkAddPoints,
    bulkAddRubricId, setBulkAddRubricId, bulkAddDescription, setBulkAddDescription,
    bulkAddQuestions, setBulkAddQuestions, bulkQuestionsOpen, setBulkQuestionsOpen,
    bulkAddFileId, setBulkAddFileId, bulkAddFileContent, setBulkAddFileContent,
    bulkAddFileFormat, setBulkAddFileFormat, bulkAddSubType, setBulkAddSubType,
    bulkAiPrompt, setBulkAiPrompt, bulkAiBusy,
    bulkAddToModules, bulkAiGenerate, bulkFileOptions,
  };
}
