"use client";

import type React from "react";
import { useState } from "react";
import type { LlmProvider } from "@/lib/llm";
import type { CanvasModule } from "@/lib/canvas-modules";
import { createCourseAssignmentAction, createModuleItemAction, generateDocumentTextAction, generateSlidesAction } from "../../../actions";
import { slidesToText, uploadFileToModule } from "../utils";
import { addContentToModule } from "./moduleContentActions";

const NEW_ASG_DEFAULT = { name: "", points: "100", due: "", stype: "online_text_entry", publish: true };

export interface UseAddModuleItemReturn {
  addType: Record<number, string>;
  setAddType: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  addUrl: Record<number, string>;
  setAddUrl: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  addTitle: Record<number, string>;
  setAddTitle: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  addFileFormat: Record<number, "docx" | "pptx">;
  setAddFileFormat: React.Dispatch<React.SetStateAction<Record<number, "docx" | "pptx">>>;
  addFileContent: Record<number, string>;
  setAddFileContent: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  addAiPrompt: Record<number, string>;
  setAddAiPrompt: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  addAiBusy: Record<number, boolean>;
  uploads: Record<number, Array<{ name: string; status: "uploading" | "done" | "error"; error?: string }>>;
  newAsg: Record<number, { name: string; points: string; due: string; stype: string; publish: boolean }>;
  asgOf: (id: number) => typeof NEW_ASG_DEFAULT;
  patchAsg: (id: number, patch: Partial<typeof NEW_ASG_DEFAULT>) => void;
  canAdd: (m: CanvasModule) => boolean;
  addAiGenerate: (m: CanvasModule) => Promise<void>;
  addItem: (m: CanvasModule) => Promise<void>;
  handleModuleFiles: (m: CanvasModule, list: FileList | File[]) => Promise<void>;
}

// Per-module "Add item" row: new-assignment mini-form, external URL / text
// header inputs, and an AI-generated .docx/.pptx file builder, plus dropped/
// picked file uploads straight into the module.
export function useAddModuleItem(
  courseUrl: string,
  acronym: string | undefined,
  provider: LlmProvider,
  setBusy: (b: boolean) => void,
  setNote: (n: { kind: "success" | "error"; text: string } | null) => void,
  reload: () => void,
  run: (fn: () => Promise<{ error: string } | unknown>, fallbackMsg: string) => Promise<void>
): UseAddModuleItemReturn {
  // Per-module "add item" controls: chosen type, and the external-url / header-text inputs.
  const [addType, setAddType] = useState<Record<number, string>>({});
  const [addUrl, setAddUrl] = useState<Record<number, string>>({});
  const [addTitle, setAddTitle] = useState<Record<number, string>>({});
  // Per-module "File" creation: docx/pptx format, AI prompt, generated content.
  const [addFileFormat, setAddFileFormat] = useState<Record<number, "docx" | "pptx">>({});
  const [addFileContent, setAddFileContent] = useState<Record<number, string>>({});
  const [addAiPrompt, setAddAiPrompt] = useState<Record<number, string>>({});
  const [addAiBusy, setAddAiBusy] = useState<Record<number, boolean>>({});
  // Per-module "New Assignment" creation: name, points, due date, submission type, published.
  const [newAsg, setNewAsg] = useState<Record<number, { name: string; points: string; due: string; stype: string; publish: boolean }>>({});
  const [uploads, setUploads] = useState<
    Record<number, Array<{ name: string; status: "uploading" | "done" | "error"; error?: string }>>
  >({});

  const asgOf = (id: number) => newAsg[id] ?? NEW_ASG_DEFAULT;
  const patchAsg = (id: number, patch: Partial<typeof NEW_ASG_DEFAULT>) =>
    setNewAsg((p) => ({ ...p, [id]: { ...asgOf(id), ...patch } }));

  const canAdd = (m: CanvasModule): boolean => {
    const type = addType[m.id] ?? "NewAssignment";
    if (type === "NewAssignment") return !!asgOf(m.id).name.trim();
    if (type === "ExternalUrl") return !!(addUrl[m.id] ?? "").trim();
    if (type === "SubHeader") return !!(addTitle[m.id] ?? "").trim();
    if (type === "File") return (addFileContent[m.id] ?? "").trim() !== "";
    if (type === "VideoLibrary") return false;
    if (type === "RepoLink") return false;
    return false;
  };

  // A file name derived from the generated content's first heading/line.
  const titleFromText = (text: string): string => {
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      const h = line.match(/^#{1,2}\s+(.*)$/);
      return ((h ? h[1] : line).trim() || "Document").slice(0, 80);
    }
    return "Document";
  };

  // Generate the per-module file's content with AI (docx text or a slide deck).
  const addAiGenerate = async (m: CanvasModule) => {
    const prompt = (addAiPrompt[m.id] ?? "").trim();
    if (!prompt) {
      setNote({ kind: "error", text: "Describe what to generate first." });
      return;
    }
    const format = addFileFormat[m.id] ?? "docx";
    setAddAiBusy((p) => ({ ...p, [m.id]: true }));
    setNote(null);
    if (format === "pptx") {
      const result = await generateSlidesAction(prompt, provider);
      setAddAiBusy((p) => ({ ...p, [m.id]: false }));
      if ("error" in result) {
        setNote({ kind: "error", text: result.error });
        return;
      }
      setAddFileContent((p) => ({ ...p, [m.id]: slidesToText(result) }));
      setNote({ kind: "success", text: "Generated slides — review them, then Add." });
      return;
    }
    const result = await generateDocumentTextAction(prompt, provider);
    setAddAiBusy((p) => ({ ...p, [m.id]: false }));
    if ("error" in result) {
      setNote({ kind: "error", text: result.error });
      return;
    }
    setAddFileContent((p) => ({ ...p, [m.id]: result.text }));
    setNote({ kind: "success", text: "Generated document — review it, then Add." });
  };

  const addItem = async (m: CanvasModule) => {
    const type = addType[m.id] ?? "NewAssignment";
    if (type === "NewAssignment") {
      const a = asgOf(m.id);
      setBusy(true);
      setNote(null);
      const r = await createCourseAssignmentAction(
        courseUrl,
        { name: a.name, description: "", pointsPossible: a.points.trim() ? Number(a.points) : null, dueAt: a.due, submissionType: a.stype, published: a.publish },
        m.id,
        acronym
      );
      setBusy(false);
      if ("error" in r) { setNote({ kind: "error", text: r.error }); return; }
      setNote({ kind: "success", text: `Created "${r.name}" in ${m.name}.` });
      setNewAsg((p) => ({ ...p, [m.id]: { ...NEW_ASG_DEFAULT } }));
      reload();
      return;
    }
    // AI-generated file: build a .docx/.pptx and upload it into this module.
    if (type === "File" && (addFileContent[m.id] ?? "").trim() !== "") {
      const content = addFileContent[m.id];
      const format = addFileFormat[m.id] ?? "docx";
      setBusy(true);
      setNote(null);
      const ok = await addContentToModule(courseUrl, acronym, "File", m.id, titleFromText(content), {
        fileContent: content,
        fileFormat: format,
      });
      setBusy(false);
      if (!ok) {
        setNote({ kind: "error", text: "Could not generate and add the file." });
        return;
      }
      setAddFileContent((p) => ({ ...p, [m.id]: "" }));
      setAddAiPrompt((p) => ({ ...p, [m.id]: "" }));
      setNote({ kind: "success", text: `Added the generated .${format} to "${m.name}".` });
      reload();
      return;
    }
    if (type === "ExternalUrl") {
      const externalUrl = (addUrl[m.id] ?? "").trim();
      const title = (addTitle[m.id] ?? "").trim();
      if (!externalUrl) return;
      setAddUrl((p) => ({ ...p, [m.id]: "" }));
      setAddTitle((p) => ({ ...p, [m.id]: "" }));
      await run(() => createModuleItemAction(courseUrl, m.id, { type: "ExternalUrl", externalUrl, title: title || externalUrl }, acronym), "Could not add the item.");
      reload();
      return;
    }
    if (type === "SubHeader") {
      const title = (addTitle[m.id] ?? "").trim();
      if (!title) return;
      setAddTitle((p) => ({ ...p, [m.id]: "" }));
      await run(() => createModuleItemAction(courseUrl, m.id, { type: "SubHeader", title }, acronym), "Could not add the item.");
      reload();
      return;
    }
  };

  // Upload dropped/picked files straight into a module, tracking each file's
  // status, then refresh so the new File items appear.
  const handleModuleFiles = async (m: CanvasModule, list: FileList | File[]) => {
    const arr = Array.from(list);
    if (arr.length === 0) return;
    setUploads((u) => ({ ...u, [m.id]: arr.map((f) => ({ name: f.name, status: "uploading" as const })) }));
    for (let i = 0; i < arr.length; i++) {
      try {
        await uploadFileToModule(courseUrl, acronym, m.id, arr[i]);
        setUploads((u) => ({
          ...u,
          [m.id]: (u[m.id] ?? []).map((row, idx) => (idx === i ? { ...row, status: "done" } : row)),
        }));
      } catch (err) {
        setUploads((u) => ({
          ...u,
          [m.id]: (u[m.id] ?? []).map((row, idx) =>
            idx === i ? { ...row, status: "error", error: err instanceof Error ? err.message : "Failed" } : row
          ),
        }));
      }
    }
    reload();
  };

  return {
    addType, setAddType, addUrl, setAddUrl, addTitle, setAddTitle,
    addFileFormat, setAddFileFormat, addFileContent, setAddFileContent,
    addAiPrompt, setAddAiPrompt, addAiBusy, uploads, newAsg,
    asgOf, patchAsg, canAdd, addAiGenerate, addItem, handleModuleFiles,
  };
}
