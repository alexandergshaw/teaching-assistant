"use client";

import { useEffect, useRef, useState } from "react";
import type React from "react";
import { createSyllabusAckQuizAction, generateAndInsertSyllabusAction } from "../../../actions";
import type { LlmProvider } from "@/lib/llm";
import type { CanvasModule } from "@/lib/canvas-modules";
import { readFileBase64, templateNameFromFileName } from "@/lib/courses-tab-helpers";
import { initialModuleChoice, type ModuleOption } from "@/lib/syllabus-ack-quiz-target";
import type { ModuleTarget } from "@/lib/lms-generation/commit-plan";
import { resolvePostModuleTarget } from "./useLmsGeneration";

export type LmsSyllabusButtonsBusy = "" | "quiz" | "syllabus";

/**
 * The "Into module" choice, resolved into what the next "Syllabus quiz"
 * press will actually do. "" ("Not linked") is this button's long-standing,
 * valid "create it unlinked" floor (AC2) - never treated as incomplete - so
 * resolvePostModuleTarget (which treats a blank CHOICE as an error; see its
 * own doc comment in useLmsGeneration.ts) is only consulted once a real
 * choice was made. The one case it can still refuse is "New module..."
 * picked with a blank/whitespace-only name.
 *
 * One function, two call sites, so there is exactly one place that decides
 * what counts as resolved: runCreateAckQuiz below uses it to decide whether
 * to proceed with the write, and ModulesHeaderBar.tsx uses its `.ok` to keep
 * the "Syllabus quiz" button disabled until the target is resolvable - the
 * same precedent GeneratedPreviewModal.tsx's `postTargetResolved` already
 * sets for its own "Post to Canvas" button, so a click never costs a round
 * trip for something already visible as incomplete on screen.
 */
export function resolveSyllabusQuizTarget(
  moduleChoice: string,
  newModuleName: string
): { ok: true; target: ModuleTarget | null } | { ok: false; reason: string } {
  if (moduleChoice === "") return { ok: true, target: null };
  return resolvePostModuleTarget(moduleChoice, newModuleName);
}

/** AC3: PER COURSE, following BulkCreateModulesModal's own read-on-init /
 * write-on-change `ta-` idiom - `courseUrl` (the Canvas URL) is what
 * uniquely identifies a course here, the same key resolveLmsCourseRowAction
 * itself matches on, so no extra course-id round trip is needed just to
 * namespace this control. */
function moduleChoiceKey(courseUrl: string): string {
  return `ta-syllabus-quiz-module-${courseUrl}`;
}
function newModuleNameKey(courseUrl: string): string {
  return `ta-syllabus-quiz-new-module-name-${courseUrl}`;
}
function readStored(key: string): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(key);
}

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
  /** AC1-AC3: the "Into module" select's own state - which module the next
   * Syllabus Acknowledgement quiz press should link into, persisted per
   * course. ModulesHeaderBar.tsx renders the control from these; this hook
   * owns the state/persistence, the same split every other picker in this
   * tab already uses (useRubrics, useBulkModuleActions, ...). */
  moduleOptions: ModuleOption[];
  moduleChoice: string;
  setModuleChoice: (v: string) => void;
  newModuleName: string;
  setNewModuleName: (v: string) => void;
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
  /** The tab's already-loaded live module tree - source for the "Into
   * module" picker's options (docs/syllabus-ack-quiz-module-target-
   * acceptance-criteria.md AC1-AC3). By the time ModulesView (and this hook)
   * ever mounts, ContentTab has already finished loading it (`!loaded ?
   * null : ...` gates the render), so the lazy useState initializers below
   * validate a restored choice against real data, never an empty
   * placeholder - and ModulesView remounts this hook entirely on a course
   * change (its own `key={contentSelectionKey(selection)}`), so there is no
   * later "modules arrived after mount" case to react to either. */
  modules: CanvasModule[],
  setNote: (n: { kind: "success" | "error"; text: string } | null) => void,
  setBusy: (b: boolean) => void,
  reload: () => void
): UseLmsSyllabusButtonsReturn {
  const [busy, setLocalBusy] = useState<LmsSyllabusButtonsBusy>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const moduleOptions: ModuleOption[] = modules.map((m) => ({ id: m.id, name: m.name }));

  const [moduleChoice, setModuleChoice] = useState<string>(() =>
    initialModuleChoice(moduleOptions, readStored(moduleChoiceKey(courseUrl)))
  );
  const [newModuleName, setNewModuleName] = useState<string>(() => readStored(newModuleNameKey(courseUrl)) ?? "");

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(moduleChoiceKey(courseUrl), moduleChoice);
  }, [courseUrl, moduleChoice]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(newModuleNameKey(courseUrl), newModuleName);
  }, [courseUrl, newModuleName]);

  const runCreateAckQuiz = async () => {
    // See resolveSyllabusQuizTarget's own doc comment above for the "" vs.
    // blank-new-module-name distinction - this is the same check the
    // "Syllabus quiz" button's own `disabled` now runs before this handler
    // is ever reachable, so a refusal here should only happen if that guard
    // was somehow bypassed.
    const resolvedTarget = resolveSyllabusQuizTarget(moduleChoice, newModuleName);
    if (!resolvedTarget.ok) {
      setNote({ kind: "error", text: resolvedTarget.reason });
      return;
    }
    const target: ModuleTarget | null = resolvedTarget.target;

    setLocalBusy("quiz");
    setBusy(true);
    setNote(null);
    const result = await createSyllabusAckQuizAction(courseUrl, acronym, target);
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
    moduleOptions,
    moduleChoice,
    setModuleChoice,
    newModuleName,
    setNewModuleName,
  };
}
