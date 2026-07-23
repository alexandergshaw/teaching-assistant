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
import { addContentToModule } from "./moduleContentActions";

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
  const [confirmDeleteModules, setConfirmDeleteModules] = useState(false);
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
  const [bulkAddRubricId, setBulkAddRubricId] = useState<number | "">("");
  // Description / page body and (for quizzes) the questions written into each
  // item that "Add to each" creates. Questions are composed in a modal.
  const [bulkAddDescription, setBulkAddDescription] = useState("");
  const [bulkAddQuestions, setBulkAddQuestions] = useState<EditableQuestion[]>([]);
  const [bulkQuestionsOpen, setBulkQuestionsOpen] = useState(false);
  // For the "File" type: an existing course file to add to each module, or AI-
  // generated content built into a new file (docx or pptx) per module.
  const [bulkAddFileId, setBulkAddFileId] = useState<number | "">("");
  const [bulkAddFileContent, setBulkAddFileContent] = useState("");
  const [bulkAddFileFormat, setBulkAddFileFormat] = useState<"docx" | "pptx">("docx");
  // Submission type for assignments created via bulk add; persisted across reloads.
  const [bulkAddSubType, setBulkAddSubType] = useState<string>(() => {
    if (typeof window === "undefined") return "online_text_entry";
    const n = localStorage.getItem("ta-modules-bulkadd-stype");
    return n && ["online_text_entry", "online_upload", "online_url", "on_paper", "none"].includes(n) ? n : "online_text_entry";
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("ta-modules-bulkadd-stype", bulkAddSubType);
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
      setConfirmDeleteModules(true);
      return;
    }
    setConfirmDeleteModules(false);
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
        const ok = await addContentToModule(courseUrl, acronym, type, mod.id, fillNamePattern(pattern, mod.name, n), {
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
        if (ok) added += 1;
        else failed += 1;
      }
      setOpBusy(false);
      setNote({
        kind: failed ? "error" : "success",
        text: `Added to modules: ${added} done${failed ? `, ${failed} failed` : ""}.`,
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
