"use client";

import { useState } from "react";
import type { SyllabusCourseInfo } from "../../actions";
import {
  createFinalizedSyllabusAction,
  placeSyllabusInModuleAction,
  createCourseHubAction,
  listCourseContentAction,
} from "../../actions";
import type { CanvasModule } from "@/lib/canvas-modules";
import { useInstitutionSelection } from "@/lib/institutions";

export function useSaveOptions() {
  const { active: activeInstitution } = useInstitutionSelection();

  // Save to library state
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveNote, setSaveNote] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [savedReloadToken, setSavedReloadToken] = useState(0);

  // Place in Canvas state
  const [placeCourseUrl, setPlaceCourseUrl] = useState<string>(() =>
    typeof window !== "undefined" ? localStorage.getItem("ta-content-course-url") ?? "" : ""
  );
  const [placeModules, setPlaceModules] = useState<CanvasModule[] | null>(null);
  const [placeModuleId, setPlaceModuleId] = useState<number | "">("");
  const [placePosition, setPlacePosition] = useState("");
  const [placeBusy, setPlaceBusy] = useState<"idle" | "loading" | "adding">("idle");
  const [placeNote, setPlaceNote] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  // Save as course state
  const [savingCourse, setSavingCourse] = useState(false);

  const handleSaveFinalized = async (
    name: string,
    adaptedFileName: string,
    base64: string,
    courseCode: string | undefined
  ) => {
    setSaveBusy(true);
    setSaveNote(null);
    try {
      const result = await createFinalizedSyllabusAction(name.trim(), adaptedFileName, base64, courseCode);
      if ("error" in result) {
        setSaveNote({ kind: "error", text: result.error });
        return;
      }
      setSaveNote({ kind: "success", text: `Saved "${name.trim()}" to your finalized syllabi.` });
      setSavedReloadToken((t) => t + 1);
    } catch (err) {
      setSaveNote({ kind: "error", text: err instanceof Error ? err.message : "Could not save the syllabus." });
    } finally {
      setSaveBusy(false);
    }
  };

  const handleLoadPlaceModules = async () => {
    if (!/\/courses\/\d+/.test(placeCourseUrl)) {
      setPlaceNote({ kind: "error", text: "Enter a Canvas course URL like .../courses/123." });
      return;
    }
    setPlaceBusy("loading");
    setPlaceNote(null);
    const result = await listCourseContentAction(placeCourseUrl, activeInstitution || undefined);
    setPlaceBusy("idle");
    if ("error" in result) {
      setPlaceNote({ kind: "error", text: result.error });
      return;
    }
    setPlaceModules(result.modules);
    setPlaceModuleId(result.modules[0]?.id ?? "");
  };

  const handleAddToModule = async (
    base64: string,
    adaptedFileName: string
  ) => {
    if (placeModuleId === "") return;
    setPlaceBusy("adding");
    setPlaceNote(null);
    try {
      const pos = placePosition.trim() ? Number(placePosition) : undefined;
      const result = await placeSyllabusInModuleAction(
        base64,
        placeCourseUrl,
        placeModuleId,
        adaptedFileName,
        Number.isFinite(pos) ? pos : undefined,
        activeInstitution || undefined
      );
      if ("error" in result) {
        setPlaceNote({ kind: "error", text: result.error });
        return;
      }
      const moduleName = placeModules?.find((m) => m.id === placeModuleId)?.name ?? "the module";
      setPlaceNote({ kind: "success", text: `Added the syllabus to ${moduleName}.` });
    } catch (err) {
      setPlaceNote({ kind: "error", text: err instanceof Error ? err.message : "Could not add the syllabus." });
    } finally {
      setPlaceBusy("idle");
    }
  };

  const handleSaveAsCourse = async (
    base64: string,
    adaptedFileName: string,
    courseInfo: SyllabusCourseInfo,
    syllabusName: string,
    textbook: string,
    adaptRepo: string,
    adaptBranch: string
  ) => {
    setSavingCourse(true);
    setSaveNote(null);
    try {
      const courseName = courseInfo.courseName || syllabusName.replace(/\.docx$/i, "") || "Course";
      const syllabusLabel =
        [courseInfo.courseCode, courseInfo.courseName].filter(Boolean).join(" ") || courseName;
      const saved = await createFinalizedSyllabusAction(
        `${syllabusLabel} syllabus`,
        adaptedFileName,
        base64,
        courseInfo.courseCode
      );
      if ("error" in saved) {
        setSaveNote({ kind: "error", text: saved.error });
        return;
      }
      const created = await createCourseHubAction({
        name: courseName,
        courseCode: courseInfo.courseCode,
        canvasUrl: undefined,
        repos: adaptRepo.trim() ? [{ repo: adaptRepo.trim(), branch: adaptBranch.trim() || null }] : [],
        textbook: textbook || undefined,
        syllabusId: saved.syllabus.id,
      });
      if ("error" in created) {
        setSaveNote({ kind: "error", text: created.error });
        return;
      }
      setSavedReloadToken((t) => t + 1);
      setSaveNote({ kind: "success", text: `Saved "${courseName}" to your Courses, with the syllabus linked. Open the Courses tab to add its Canvas link, org, and more.` });
    } catch (err) {
      setSaveNote({ kind: "error", text: err instanceof Error ? err.message : "Could not save the course." });
    } finally {
      setSavingCourse(false);
    }
  };

  return {
    saveBusy,
    setSaveBusy,
    saveNote,
    setSaveNote,
    savedReloadToken,
    placeCourseUrl,
    setPlaceCourseUrl,
    placeModules,
    placeModuleId,
    setPlaceModuleId,
    placePosition,
    setPlacePosition,
    placeBusy,
    placeNote,
    setPlaceNote,
    savingCourse,
    setSavingCourse,
    handleSaveFinalized,
    handleLoadPlaceModules,
    handleAddToModule,
    handleSaveAsCourse,
  };
}
