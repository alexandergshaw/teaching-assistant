"use client";

import { useRef, useState } from "react";
import type React from "react";
import { createSyllabusAckQuizAction, generateAndInsertSyllabusAction } from "../../../actions";
import type { LlmProvider } from "@/lib/llm";
import { readFileBase64, templateNameFromFileName } from "@/lib/courses-tab-helpers";

export type LmsSyllabusButtonsBusy = "" | "quiz" | "syllabus";

export interface UseLmsSyllabusButtonsReturn {
  /** Which of the two buttons (if any) has its own write in flight - matches
   * GithubSyncPanel.tsx's own `busy: "" | "load" | ...` idiom (AC S4), so
   * each button can show its own progress label and neither can be
   * double-fired. */
  busy: LmsSyllabusButtonsBusy;
  createAckQuiz: () => void;
  generateSyllabus: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handleTemplateFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

/**
 * Local state + handlers for the two one-click LMS-tab syllabus buttons
 * (docs/lms-tab-syllabus-buttons-acceptance-criteria.md, AC S3/S4). Also sets
 * the outer ModulesView `busy` flag while either write runs, so these two new
 * Canvas writes are gated the same "don't open a new write while another is
 * in flight" way every other control in this toolbar already is, and calls
 * `reload()` after a successful write so the module list reflects it.
 */
export function useLmsSyllabusButtons(
  courseUrl: string,
  acronym: string | undefined,
  provider: LlmProvider,
  setNote: (n: { kind: "success" | "error"; text: string } | null) => void,
  setBusy: (b: boolean) => void,
  reload: () => void
): UseLmsSyllabusButtonsReturn {
  const [busy, setLocalBusy] = useState<LmsSyllabusButtonsBusy>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const runCreateAckQuiz = async () => {
    setLocalBusy("quiz");
    setBusy(true);
    setNote(null);
    const result = await createSyllabusAckQuizAction(courseUrl, acronym);
    setBusy(false);
    setLocalBusy("");
    if ("error" in result) {
      setNote({ kind: "error", text: result.error });
      return;
    }
    setNote({ kind: "success", text: result.message });
    reload();
  };

  const runGenerateSyllabus = async (newTemplate?: { name: string; fileName: string; base64: string }) => {
    setLocalBusy("syllabus");
    setBusy(true);
    setNote(null);
    const result = await generateAndInsertSyllabusAction(courseUrl, acronym, newTemplate, provider);
    setBusy(false);
    setLocalBusy("");
    if ("error" in result) {
      setNote({ kind: "error", text: result.error });
      return;
    }
    if ("needsTemplate" in result) {
      // AC B2-1/B2-3: the one case that costs extra interaction. Prompt
      // immediately for a .docx - picking one re-invokes this same flow with
      // the upload attached (handleTemplateFileChange below), so this stays
      // one extra click, never a separate form or confirmation.
      setNote({
        kind: "success",
        text: "No syllabus template is set for this course or its institution. Choose a .docx to use as the template.",
      });
      fileInputRef.current?.click();
      return;
    }
    setNote({ kind: "success", text: result.message });
    reload();
  };

  const handleTemplateFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0];
    // Reset immediately so re-selecting the SAME file after a failed attempt
    // still fires a change event (a browser file input otherwise treats an
    // unchanged selection as a no-op).
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!file) return;
    void (async () => {
      try {
        const base64 = await readFileBase64(file);
        await runGenerateSyllabus({ name: templateNameFromFileName(file.name), fileName: file.name, base64 });
      } catch (err) {
        setNote({ kind: "error", text: err instanceof Error ? err.message : "Could not read the uploaded file." });
      }
    })();
  };

  return {
    busy,
    createAckQuiz: () => void runCreateAckQuiz(),
    generateSyllabus: () => void runGenerateSyllabus(),
    fileInputRef,
    handleTemplateFileChange,
  };
}
