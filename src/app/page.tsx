"use client";

import type { ChangeEvent } from "react";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { Tab, Tabs } from "@mui/material";
import { gradeAction, testGeminiAction, generateLessonPlanAction, generateAssignmentAction, generateAssignmentRubricAction, generateModuleIntroAction, parseSyllabusAction, generateSyllabusSectionAction, generateSyllabusRemainingSectionsAction, reviseSyllabusAction, type GradeActionState, type TestGeminiState, type GenerateLessonPlanResult, type AssignmentData, type ModuleIntroData, type SyllabusSection } from "./actions";
import LessonPlanPreview from "./components/LessonPlanPreview";
import FilePreviewModal, { type PreviewFile } from "./components/FilePreviewModal";
import LessonPlanningForm from "./components/LessonPlanningForm";
import styles from "./page.module.css";
import { parseGeneratedRubric } from "./utils/rubric";



const initialState: GradeActionState = { run: null, error: null };
const initialTestState: TestGeminiState = { result: null, error: null };

type SortDirection = "asc" | "desc";
type ActiveTab = "grading" | "lesson-planning" | "course-planning";

type SortColumn =
  | { kind: "student" }
  | { kind: "files" }
  | { kind: "rubric"; area: string }
  | { kind: "total" }
  | { kind: "overall" };

const DEFAULT_SORT: { column: SortColumn; direction: SortDirection } = {
  column: { kind: "student" },
  direction: "asc",
};

function sortColumnKey(column: SortColumn): string {
  if (column.kind === "rubric") {
    return `rubric:${column.area}`;
  }

  return column.kind;
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });
}

function parseScoreValue(value: string): number | null {
  const match = value.match(/-?\d+(?:\.\d+)?/);
  if (!match) {
    return null;
  }

  const parsed = Number.parseFloat(match[0]);
  return Number.isNaN(parsed) ? null : parsed;
}

function hasDeduction(score: string): boolean {
  const match = score.match(/(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)/)
  if (!match) return false;
  const earned = Number.parseFloat(match[1]);
  const possible = Number.parseFloat(match[2]);
  return Number.isFinite(earned) && Number.isFinite(possible) && possible > 0 && earned < possible;
}

function formatFeedback(text: string): string {
  return text.replace(/\s*[\u2013\u2014]\s*/g, ", ");
}

function escapeCsvCell(value: string): string {
  const sanitized = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return `"${sanitized.replace(/"/g, '""')}"`;
}

function buildCsvContent(state: GradeActionState): string {
  if (!state.run) {
    return "";
  }

  const header = ["Student"];

  for (const area of state.run.rubricAreaNames) {
    header.push(`${area} Score`);
    header.push(`${area} Comment`);
  }

  header.push("Total Score");
  header.push("Overall Comment");
  header.push("Submitted Files");
  header.push("Submitted Extensions");

  const rows = [header.map((cell) => escapeCsvCell(cell)).join(",")];

  for (const result of state.run.results) {
    const row: string[] = [result.student];
    const areaMap = new Map(result.rubricAreas.map((area) => [area.area, area]));

    for (const areaName of state.run.rubricAreaNames) {
      const area = areaMap.get(areaName);
      row.push(area?.score ?? "");
      row.push(area?.comment ?? "");
    }

    row.push(result.totalScore);
    row.push(result.overallComment);
    row.push(result.submittedFiles.map((file) => file.name).join("; "));
    row.push(
      Array.from(new Set(result.submittedFiles.map((file) => file.extension))).join(
        "; "
      )
    );
    rows.push(row.map((cell) => escapeCsvCell(cell)).join(","));
  }

  return rows.join("\n");
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M7 3.5A2.5 2.5 0 0 1 9.5 1h6A2.5 2.5 0 0 1 18 3.5v8A2.5 2.5 0 0 1 15.5 14h-6A2.5 2.5 0 0 1 7 11.5v-8Zm2.5-1a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-6Z" />
      <path d="M2 7.5A2.5 2.5 0 0 1 4.5 5h.75a.75.75 0 0 1 0 1.5H4.5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-.75a.75.75 0 0 1 1.5 0v.75A2.5 2.5 0 0 1 10.5 18h-6A2.5 2.5 0 0 1 2 15.5v-8Z" />
    </svg>
  );
}

function LockClosedIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path fillRule="evenodd" d="M5.75 8V6a4.25 4.25 0 1 1 8.5 0v2h.25A2.75 2.75 0 0 1 17.25 10.75v5.5A2.75 2.75 0 0 1 14.5 19h-9A2.75 2.75 0 0 1 2.75 16.25v-5.5A2.75 2.75 0 0 1 5.5 8h.25Zm7 0V6a2.75 2.75 0 1 0-5.5 0v2h5.5Zm-4.25 3a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-.75 1.298v1.452a.75.75 0 0 1-1.5 0v-1.452A1.5 1.5 0 0 1 8.5 11Z" clipRule="evenodd" />
    </svg>
  );
}

function LockOpenIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path fillRule="evenodd" d="M7.25 8V6a2.75 2.75 0 0 1 5.164-1.31.75.75 0 0 0 1.323-.706A4.25 4.25 0 0 0 5.75 6v2H5.5a2.75 2.75 0 0 0-2.75 2.75v5.5A2.75 2.75 0 0 0 5.5 19h9a2.75 2.75 0 0 0 2.75-2.75v-5.5A2.75 2.75 0 0 0 14.5 8h-7.25Zm2.75 3a1.5 1.5 0 0 0-.75 2.798v1.452a.75.75 0 0 0 1.5 0v-1.452A1.5 1.5 0 0 0 10 11Z" clipRule="evenodd" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="m5.433 13.917 1.262-3.155A4 4 0 0 1 7.58 9.42l6.92-6.918a2.121 2.121 0 0 1 3 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 0 1-.65-.65Z" />
      <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0 0 10 3H4.75A2.75 2.75 0 0 0 2 5.75v9.5A2.75 2.75 0 0 0 4.75 18h9.5A2.75 2.75 0 0 0 17 15.25V10a.75.75 0 0 0-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5Z" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M10.75 2.75a.75.75 0 0 0-1.5 0v8.614L6.295 8.235a.75.75 0 1 0-1.09 1.03l4.25 4.5a.75.75 0 0 0 1.09 0l4.25-4.5a.75.75 0 0 0-1.09-1.03l-2.955 3.129V2.75Z" />
      <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
      <path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 0 1 0-1.186A10.004 10.004 0 0 1 10 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0 1 10 17c-4.257 0-7.893-2.66-9.336-6.41ZM14 10a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" clipRule="evenodd" />
    </svg>
  );
}

export default function Home() {
  const [state, formAction, pending] = useActionState(gradeAction, initialState);
  const [testState, testAction, testPending] = useActionState(testGeminiAction, initialTestState);
  const [assignmentInstructions, setAssignmentInstructions] = useState("");
  const [rubric, setRubric] = useState("");
  const [sortState, setSortState] = useState(DEFAULT_SORT);
  const [activeTab, setActiveTab] = useState<ActiveTab>(() => {
    if (typeof window === "undefined") return "lesson-planning";
    const saved = localStorage.getItem("ta-active-tab");
    return saved === "grading" || saved === "lesson-planning" || saved === "course-planning" ? saved : "lesson-planning";
  });
  const [selectedPreview, setSelectedPreview] = useState<PreviewFile | null>(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const copyResetTimerRef = useRef<number | null>(null);
  const [moduleObjectives, setModuleObjectives] = useState("");
  const [lessonContext, setLessonContext] = useState("");
  const [isGeneratingLesson, setIsGeneratingLesson] = useState(false);
  const [lessonError, setLessonError] = useState<string | null>(null);
  const [lessonPlanPreview, setLessonPlanPreview] = useState<GenerateLessonPlanResult | null>(null);
  const [assignmentPreview, setAssignmentPreview] = useState<AssignmentData | null>(null);
  const [rubricPreview, setRubricPreview] = useState<string | null>(null);
  const [introPreview, setIntroPreview] = useState<ModuleIntroData | null>(null);
  const [savedLessonFiles, setSavedLessonFiles] = useState<Array<{ name: string; base64: string; mimeType: string }>>([]);
  const lessonContextFileRef = useRef<HTMLInputElement>(null);
  const syllabusFileRef = useRef<HTMLInputElement>(null);
  const [courseTitle, setCourseTitle] = useState("");
  const [coursePlanningContext, setCoursePlanningContext] = useState("");
  const [coursePlanningContextFiles, setCoursePlanningContextFiles] = useState<Array<{ name: string; base64: string; mimeType: string }>>([]);
  type CoursePlanningStep = "form" | "wizard" | "preview";
  const [coursePlanningStep, setCoursePlanningStep] = useState<CoursePlanningStep>("form");
  const [parsedSections, setParsedSections] = useState<SyllabusSection[]>([]);
  const [syllabusTemplateText, setSyllabusTemplateText] = useState("");
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const [sectionContents, setSectionContents] = useState<string[]>([]);
  const [currentSectionInput, setCurrentSectionInput] = useState("");
  const [isParsingTemplate, setIsParsingTemplate] = useState(false);
  const [isGeneratingSection, setIsGeneratingSection] = useState(false);
  const [coursePlanningError, setCoursePlanningError] = useState<string | null>(null);
  const [syllabusRevisionPrompt, setSyllabusRevisionPrompt] = useState("");
  const [syllabusRevisionFiles, setSyllabusRevisionFiles] = useState<Array<{ name: string; base64: string; mimeType: string }>>([]);
  const [lockedSyllabusSections, setLockedSyllabusSections] = useState<boolean[]>([]);
  const [isRevisingSyllabus, setIsRevisingSyllabus] = useState(false);
  const syllabusRevisionFileRef = useRef<HTMLInputElement>(null);
  const [editingSyllabusSection, setEditingSyllabusSection] = useState<number | null>(null);
  const [syllabusSectionDraft, setSyllabusSectionDraft] = useState<string>("");
  const run = state.run;

  const sortedResults = useMemo(() => {
    if (!run) {
      return [];
    }

    const directionMultiplier = sortState.direction === "asc" ? 1 : -1;
    const results = [...run.results];

    results.sort((a, b) => {
      const column = sortState.column;
      let comparison = 0;

      if (column.kind === "student") {
        comparison = compareText(a.student, b.student);
      }

      if (column.kind === "files") {
        const aFiles = a.submittedFiles.map((file) => file.name).join(", ");
        const bFiles = b.submittedFiles.map((file) => file.name).join(", ");
        comparison = compareText(aFiles, bFiles);
      }

      if (column.kind === "rubric") {
        const aArea = a.rubricAreas.find((area) => area.area === column.area);
        const bArea = b.rubricAreas.find((area) => area.area === column.area);
        const aNumeric = parseScoreValue(aArea?.score ?? "");
        const bNumeric = parseScoreValue(bArea?.score ?? "");

        if (aNumeric !== null && bNumeric !== null) {
          comparison = aNumeric - bNumeric;
        } else {
          comparison = compareText(aArea?.score ?? "", bArea?.score ?? "");
        }

        if (comparison === 0) {
          comparison = compareText(aArea?.comment ?? "", bArea?.comment ?? "");
        }
      }

      if (column.kind === "total") {
        const aNumeric = parseScoreValue(a.totalScore);
        const bNumeric = parseScoreValue(b.totalScore);

        if (aNumeric !== null && bNumeric !== null) {
          comparison = aNumeric - bNumeric;
        } else {
          comparison = compareText(a.totalScore, b.totalScore);
        }
      }

      if (column.kind === "overall") {
        comparison = compareText(a.overallComment, b.overallComment);
      }

      if (comparison === 0) {
        comparison = compareText(a.student, b.student);
      }

      return comparison * directionMultiplier;
    });

    return results;
  }, [run, sortState]);

  const handleDownloadFile = (name: string, extension: string, rawBase64: string, mimeType: string) => {
    const byteChars = atob(rawBase64);
    const byteArray = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) {
      byteArray[i] = byteChars.charCodeAt(i);
    }
    const blob = new Blob([byteArray], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name.toLowerCase().endsWith(`.${extension.toLowerCase()}`) ? name : `${name}.${extension}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSort = (column: SortColumn) => {
    const nextKey = sortColumnKey(column);
    const currentKey = sortColumnKey(sortState.column);

    if (nextKey === currentKey) {
      setSortState((current) => ({
        ...current,
        direction: current.direction === "asc" ? "desc" : "asc",
      }));
      return;
    }

    setSortState({ column, direction: "asc" });
  };

  const sortLabel = (column: SortColumn) => {
    const nextKey = sortColumnKey(column);
    const currentKey = sortColumnKey(sortState.column);

    if (nextKey !== currentKey) {
      return "↕";
    }

    return sortState.direction === "asc" ? "↑" : "↓";
  };

  useEffect(() => {
    localStorage.setItem("ta-active-tab", activeTab);
  }, [activeTab]);

  useEffect(() => {
    return () => {
      if (copyResetTimerRef.current !== null) {
        window.clearTimeout(copyResetTimerRef.current);
      }
    };
  }, []);

  const handleAssignmentInstructionsChange = (
    event: ChangeEvent<HTMLTextAreaElement>
  ) => {
    setAssignmentInstructions(event.target.value);
  };

  const handleRubricChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setRubric(event.target.value);
  };

  const handleExportCsv = () => {
    if (!state.run) {
      return;
    }

    const csvContent = buildCsvContent(state);
    if (!csvContent) {
      return;
    }

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = "grading-results.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleOpenPreview = (student: string, file: PreviewFile) => {
    setSelectedPreview({ ...file, student });
    if (file.rawBase64 && file.mimeType) {
      const byteChars = atob(file.rawBase64);
      const byteArray = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteArray[i] = byteChars.charCodeAt(i);
      const blob = new Blob([byteArray], { type: file.mimeType });
      setPreviewBlobUrl(URL.createObjectURL(blob));
    } else {
      setPreviewBlobUrl(null);
    }
  };

  const handleClosePreview = () => {
    setSelectedPreview(null);
    if (previewBlobUrl) {
      URL.revokeObjectURL(previewBlobUrl);
      setPreviewBlobUrl(null);
    }
  };

  const handleGenerateLesson = async () => {
    if (!moduleObjectives.trim()) {
      setLessonError("Please enter module objectives before generating.");
      return;
    }
    setIsGeneratingLesson(true);
    setLessonError(null);
    try {
      const fileList = lessonContextFileRef.current?.files;
      const files: Array<{ name: string; base64: string; mimeType: string }> = [];
      if (fileList) {
        for (const file of Array.from(fileList)) {
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const result = reader.result as string;
              resolve(result.split(",")[1] ?? "");
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          files.push({ name: file.name, base64, mimeType: file.type || "application/octet-stream" });
        }
      }

      setSavedLessonFiles(files);

      const [slideResult, assignmentResult, rubricResult, introResult] = await Promise.all([
        generateLessonPlanAction(moduleObjectives, lessonContext, files),
        generateAssignmentAction(moduleObjectives, lessonContext, files),
        generateAssignmentRubricAction(moduleObjectives, lessonContext),
        generateModuleIntroAction(moduleObjectives, lessonContext),
      ]);

      if ("error" in slideResult) {
        setLessonError(slideResult.error);
        return;
      }

      setLessonPlanPreview(slideResult);
      setAssignmentPreview("error" in assignmentResult ? null : assignmentResult);
      setRubricPreview(typeof rubricResult === "string" ? rubricResult : null);
      setIntroPreview("error" in introResult ? null : introResult);
    } catch (err) {
      setLessonError(err instanceof Error ? err.message : "Generation failed.");
    } finally {
      setIsGeneratingLesson(false);
    }
  };

  const handleRegenerateLesson = async (revisionPrompt: string): Promise<boolean> => {
    if (!lessonPlanPreview) return false;
    setLessonError(null);
    try {
      const result = await generateLessonPlanAction(
        moduleObjectives,
        lessonContext,
        savedLessonFiles,
        revisionPrompt.trim() || undefined,
        lessonPlanPreview.slides
      );
      if ("error" in result) {
        setLessonError(result.error);
        return false;
      }
      setLessonPlanPreview(result);
      return true;
    } catch (err) {
      setLessonError(err instanceof Error ? err.message : "Regeneration failed.");
      return false;
    }
  };

  const handleDownloadLessonPlan = async () => {
    if (!lessonPlanPreview) return;
    try {
      const [{ default: PptxGenJS }, { default: JSZip }] = await Promise.all([
        import("pptxgenjs"),
        import("jszip"),
      ]);

      // ── Build PPTX ──────────────────────────────────────────────────
      const prs = new PptxGenJS();
      prs.layout = "LAYOUT_WIDE";

      const titleSlide = prs.addSlide();
      titleSlide.addText(lessonPlanPreview.presentationTitle, {
        x: 0.5, y: 2.2, w: "90%", h: 1.8,
        fontSize: 40, bold: true, align: "center", color: "1a1a2e",
      });

      for (const slide of lessonPlanPreview.slides) {
        const s = prs.addSlide();
        s.addText(slide.title, {
          x: 0.5, y: 0.3, w: "90%", h: 1,
          fontSize: 28, bold: true, color: "1a1a2e",
        });
        if (slide.bullets.length > 0) {
          s.addText(
            slide.bullets.map((b) => ({ text: b, options: { bullet: true, paraSpaceBefore: 8 } })),
            { x: 0.5, y: 1.55, w: "90%", h: 4, fontSize: 18, color: "2d2d2d", valign: "top" }
          );
        }
      }

      const pptxData = await prs.write({ outputType: "arraybuffer" }) as ArrayBuffer;

      // ── Build introduction.txt ───────────────────────────────────────
      let introText = "";
      if (introPreview) {
        introText = [
          "MODULE INTRODUCTION",
          "===================",
          "",
          "WHERE THIS FITS",
          "---------------",
          introPreview.overview,
          "",
          "KEY TERMS",
          "---------",
          introPreview.keyTerms,
        ].join("\n");
      }

      // ── Build assignment.txt ─────────────────────────────────────────
      let assignmentText = "";
      if (assignmentPreview) {
        const header = `ASSIGNMENT: ${assignmentPreview.title}`;
        assignmentText = [
          header,
          "=".repeat(header.length),
          "",
          "OVERVIEW",
          "--------",
          assignmentPreview.overview,
          "",
          "STEPS",
          "-----",
          ...assignmentPreview.steps.map((s, i) => `${i + 1}. ${s.stepTitle}\n   ${s.description}`),
          "",
          "FREE TOOLS",
          "----------",
          ...assignmentPreview.tools.map((t) => `- ${t}`),
          "",
          "DELIVERABLES",
          "------------",
          ...assignmentPreview.deliverables.map((d) => `- ${d}`),
        ].join("\n");
      }

      // ── Build rubric.txt ─────────────────────────────────────────────
      let rubricText = "";
      if (rubricPreview) {
        const rows = parseGeneratedRubric(rubricPreview);
        if (rows) {
          const lines: string[] = ["GRADING RUBRIC", "==============", ""];
          for (const row of rows) {
            const w = row.weight.endsWith("%") ? row.weight : `${row.weight}%`;
            lines.push(`${row.area} (${w}): ${row.description}`);
            for (const sub of row.subcategories) {
              lines.push(`  ${sub.label}: ${sub.description}`);
            }
            lines.push("");
          }
          rubricText = lines.join("\n");
        } else {
          rubricText = `GRADING RUBRIC\n==============\n\n${rubricPreview}`;
        }
      }

      // ── Assemble ZIP ─────────────────────────────────────────────────
      const zip = new JSZip();
      if (introText) zip.file("introduction.txt", introText);
      zip.file("slides.pptx", pptxData);
      if (assignmentText) zip.file("assignment.txt", assignmentText);
      if (rubricText) zip.file("rubric.txt", rubricText);

      const safeName = lessonPlanPreview.presentationTitle.replace(/[^a-z0-9]/gi, "_").replace(/_+/g, "_");
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${safeName}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setLessonError(err instanceof Error ? err.message : "Download failed.");
    }
  };

  const handleStartCoursePlanning = async () => {
    if (!syllabusFileRef.current?.files?.length) {
      setCoursePlanningError("Please upload a syllabus template to continue.");
      return;
    }
    if (!courseTitle.trim()) {
      setCoursePlanningError("Please enter a course title.");
      return;
    }
    const file = syllabusFileRef.current.files[0];
    setIsParsingTemplate(true);
    setCoursePlanningError(null);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const result = await parseSyllabusAction(courseTitle, {
        name: file.name,
        base64,
        mimeType: file.type || "application/octet-stream",
      }, coursePlanningContext.trim() || undefined, coursePlanningContextFiles);
      if ("error" in result) { setCoursePlanningError(result.error); return; }
      setParsedSections(result.sections);
      setSyllabusTemplateText(result.templateText);
      setSectionContents(new Array(result.sections.length).fill(""));
      setLockedSyllabusSections(new Array(result.sections.length).fill(false));
      setCurrentSectionIndex(0);
      setCurrentSectionInput("");
      setCoursePlanningStep("wizard");
    } catch (err) {
      setCoursePlanningError(err instanceof Error ? err.message : "Failed to parse template.");
    } finally {
      setIsParsingTemplate(false);
    }
  };

  const handleSectionNext = async () => {
    setCoursePlanningError(null);
    const typed = currentSectionInput.trim();
    let content = typed;
    if (!typed) {
      setIsGeneratingSection(true);
      try {
        const completedSections = parsedSections
          .slice(0, currentSectionIndex)
          .map((s, i) => ({ heading: s.heading, content: sectionContents[i] }))
          .filter((s) => s.content);
        const result = await generateSyllabusSectionAction(
          courseTitle,
          parsedSections[currentSectionIndex],
          completedSections,
          syllabusTemplateText || undefined,
          coursePlanningContext.trim() || undefined,
          coursePlanningContextFiles
        );
        if (typeof result !== "string") { setCoursePlanningError(result.error); return; }
        content = result;
      } finally {
        setIsGeneratingSection(false);
      }
    }
    const updated = [...sectionContents];
    updated[currentSectionIndex] = content;
    setSectionContents(updated);
    if (currentSectionIndex + 1 < parsedSections.length) {
      setCurrentSectionIndex(currentSectionIndex + 1);
      setCurrentSectionInput("");
    } else {
      setCoursePlanningStep("preview");
    }
  };

  const handleSectionSkip = () => {
    const updated = [...sectionContents];
    updated[currentSectionIndex] = "";
    setSectionContents(updated);
    if (currentSectionIndex + 1 < parsedSections.length) {
      setCurrentSectionIndex(currentSectionIndex + 1);
      setCurrentSectionInput("");
    } else {
      setCoursePlanningStep("preview");
    }
  };

  const handleGenerateRemaining = async () => {
    setCoursePlanningError(null);
    setIsGeneratingSection(true);
    const updated = [...sectionContents];
    // Save whatever the user typed in the current field first
    const typedCurrent = currentSectionInput.trim();
    if (typedCurrent) {
      updated[currentSectionIndex] = typedCurrent;
    }
    try {
      const startIndex = currentSectionIndex + (typedCurrent ? 1 : 0);
      if (startIndex >= parsedSections.length) {
        setSectionContents(updated);
        setCoursePlanningStep("preview");
        return;
      }

      const result = await generateSyllabusRemainingSectionsAction(
        courseTitle,
        parsedSections,
        updated,
        startIndex,
        syllabusTemplateText || undefined,
        coursePlanningContext.trim() || undefined,
        coursePlanningContextFiles
      );

      if ("error" in result) {
        setCoursePlanningError(result.error);
        setSectionContents(updated);
        return;
      }

      setSectionContents(result.contents);
      setCoursePlanningStep("preview");
    } finally {
      setIsGeneratingSection(false);
    }
  };

  const handleSyllabusRevisionFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = Array.from(e.target.files ?? []);
    const encoded = await Promise.all(
      fileList.map(async (file) => {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        return { name: file.name, base64, mimeType: file.type || "application/octet-stream" };
      })
    );
    setSyllabusRevisionFiles((prev) => [...prev, ...encoded]);
    e.target.value = "";
  };

  const handleReviseSyllabus = async () => {
    if (!syllabusRevisionPrompt.trim() && syllabusRevisionFiles.length === 0) return;
    setIsRevisingSyllabus(true);
    setCoursePlanningError(null);
    try {
      const result = await reviseSyllabusAction(
        courseTitle,
        parsedSections,
        sectionContents,
        syllabusTemplateText,
        syllabusRevisionPrompt.trim(),
        syllabusRevisionFiles,
        coursePlanningContext.trim() || undefined,
        coursePlanningContextFiles,
        lockedSyllabusSections
      );
      if ("error" in result) { setCoursePlanningError(result.error); return; }
      setSectionContents(result.contents);
      setSyllabusRevisionPrompt("");
      setSyllabusRevisionFiles([]);
    } finally {
      setIsRevisingSyllabus(false);
    }
  };

  const resetCoursePlanning = () => {
    setCoursePlanningStep("form");
    setParsedSections([]);
    setSectionContents([]);
    setCurrentSectionIndex(0);
    setCurrentSectionInput("");
    setCoursePlanningError(null);
    setSyllabusRevisionPrompt("");
    setSyllabusRevisionFiles([]);
    setLockedSyllabusSections([]);
  };

  const handleCoursePlanningContextFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []);
    if (selected.length === 0) return;

    const files = await Promise.all(
      selected.map(async (file) => {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        return { name: file.name, base64, mimeType: file.type || "application/octet-stream" };
      })
    );

    setCoursePlanningContextFiles((prev) => [...prev, ...files]);
    e.target.value = "";
  };

  const handleDownloadSyllabus = () => {
    const lines: string[] = [];
    for (let i = 0; i < parsedSections.length; i++) {
      const content = sectionContents[i];
      if (!content) continue;
      const h = parsedSections[i].heading;
      lines.push(h, "=".repeat(h.length), "", content, "", "");
    }
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${courseTitle.replace(/[^a-z0-9]/gi, "_").replace(/_+/g, "_")}_syllabus.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const saveLessonFieldEdit = (key: string, draft: string) => {
    if (key === "lesson-title") {
      setLessonPlanPreview((prev) => prev ? { ...prev, presentationTitle: draft } : prev);
    } else if (key === "intro-overview") {
      setIntroPreview((prev) => prev ? { ...prev, overview: draft } : prev);
    } else if (key === "intro-keyTerms") {
      setIntroPreview((prev) => prev ? { ...prev, keyTerms: draft } : prev);
    } else if (key.startsWith("slide-")) {
      const idx = parseInt(key.slice(6), 10);
      const lines = draft.split("\n");
      const title = lines[0] ?? "";
      const bullets = lines.slice(1).map((l) => l.trim()).filter(Boolean);
      setLessonPlanPreview((prev) => {
        if (!prev) return prev;
        const slides = [...prev.slides];
        slides[idx] = { title, bullets };
        return { ...prev, slides };
      });
    } else if (key === "assignment-overview") {
      setAssignmentPreview((prev) => prev ? { ...prev, overview: draft } : prev);
    } else if (key.startsWith("assignment-step-")) {
      const idx = parseInt(key.slice(16), 10);
      const lines = draft.split("\n");
      const stepTitle = lines[0] ?? "";
      const description = lines.slice(1).join("\n").trim();
      setAssignmentPreview((prev) => {
        if (!prev) return prev;
        const steps = [...prev.steps];
        steps[idx] = { stepTitle, description };
        return { ...prev, steps };
      });
    } else if (key === "assignment-tools") {
      const tools = draft.split("\n").map((l) => l.trim()).filter(Boolean);
      setAssignmentPreview((prev) => prev ? { ...prev, tools } : prev);
    } else if (key === "assignment-deliverables") {
      const deliverables = draft.split("\n").map((l) => l.trim()).filter(Boolean);
      setAssignmentPreview((prev) => prev ? { ...prev, deliverables } : prev);
    } else if (key === "rubric") {
      setRubricPreview(draft);
    }
  };

  const startEditSyllabusSection = (i: number) => {
    setEditingSyllabusSection(i);
    setSyllabusSectionDraft(sectionContents[i] ?? "");
  };

  const saveEditSyllabusSection = (i: number) => {
    setSectionContents((prev) => {
      const next = [...prev];
      next[i] = syllabusSectionDraft;
      return next;
    });
    setEditingSyllabusSection(null);
  };

  const cancelEditSyllabusSection = () => setEditingSyllabusSection(null);

  const handleCopy = async (copyKey: string, value: string) => {
    const text = value.trim();
    if (!text) {
      return;
    }

    const copyViaFallback = () => {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "absolute";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    };

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        copyViaFallback();
      }
    } catch {
      copyViaFallback();
    }

    setCopiedKey(copyKey);

    if (copyResetTimerRef.current !== null) {
      window.clearTimeout(copyResetTimerRef.current);
    }

    copyResetTimerRef.current = window.setTimeout(() => {
      setCopiedKey(null);
      copyResetTimerRef.current = null;
    }, 1600);
  };

  return (
    <main className={styles.page}>
      <div className={styles.tabContainer}>
        <Tabs
          value={activeTab}
          onChange={(_, v: ActiveTab) => setActiveTab(v)}
          sx={{
            borderBottom: "1px solid var(--field-border)",
            marginBottom: "0",
            "& .MuiTabs-indicator": { backgroundColor: "var(--accent)" },
            "& .MuiTab-root": {
              fontFamily: "inherit",
              fontSize: "0.9rem",
              fontWeight: 500,
              textTransform: "none",
              color: "var(--text-secondary)",
              minHeight: 44,
              padding: "10px 20px",
            },
            "& .Mui-selected": {
              color: "var(--accent) !important",
              fontWeight: 600,
            },
            minHeight: 44,
          }}
        >
          <Tab label="Course Planning" value="course-planning" disableRipple />
          <Tab label="Lesson Planning" value="lesson-planning" disableRipple />
          <Tab label="Grading" value="grading" disableRipple />
        </Tabs>

        {activeTab === "grading" && (
          <section className={styles.card}>
        <div className={styles.header}>
          <h1>Grading</h1>
          <p>
            Add the student submissions and the grading context needed to review
            an assignment.
          </p>
        </div>

        <form className={styles.form} action={formAction}>
          {pending && (
            <div className={styles.loadingState} role="status" aria-live="polite">
              <span className={styles.spinner} aria-hidden="true" />
              <div>
                <p className={styles.loadingTitle}>Grading In Progress</p>
                <p className={styles.loadingText}>
                  Reviewing submissions now. This can take a moment for larger archives.
                </p>
              </div>
            </div>
          )}

          <div className={styles.field}>
            <label htmlFor="student-submissions">Student Submissions</label>
            <div className={styles.fileField}>
              <input
                id="student-submissions"
                name="studentSubmissions"
                type="file"
                accept=".zip,application/zip"
              />
              <p>Upload a zip archive that contains the student submissions.</p>
            </div>
          </div>

          <div className={styles.field}>
            <label htmlFor="assignment-instructions">Assignment Instructions</label>
            <textarea
              id="assignment-instructions"
              name="assignmentInstructions"
              rows={10}
              value={assignmentInstructions}
              onChange={handleAssignmentInstructionsChange}
              placeholder="Paste the assignment brief, requirements, and any special directions."
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="rubric">Rubric</label>
            <textarea
              id="rubric"
              name="rubric"
              rows={10}
              value={rubric}
              onChange={handleRubricChange}
              placeholder="Paste the grading rubric, expectations, and scoring guidance."
            />
          </div>

          {state.error && (
            <p role="alert" className={styles.error}>
              {state.error}
            </p>
          )}

          <button className={styles.submitButton} type="submit" disabled={pending}>
            {pending ? "Grading..." : "Start Review"}
          </button>
        </form>
        {testState.result && (
          <p style={{ marginTop: "0.5rem", color: "green" }}>Gemini responded: {testState.result}</p>
        )}
        {testState.error && (
          <p style={{ marginTop: "0.5rem", color: "red" }}>Gemini error: {testState.error}</p>
        )}

        {run && run.results.length === 0 && (
          <p className={styles.emptyState}>
            No supported submission files were found in the zip archive.
          </p>
        )}

        {state.generatedRubric && (() => {
          const rows = parseGeneratedRubric(state.generatedRubric);
          return (
            <details className={styles.generatedRubricCard}>
              <summary>Rubric was auto-generated from assignment instructions</summary>
              {rows ? (
                <table className={styles.generatedRubricTable}>
                  <thead>
                    <tr>
                      <th>Criterion</th>
                      <th>Weight</th>
                      <th>Performance Levels</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.area}>
                        <td>{row.area}</td>
                        <td>{row.weight.endsWith("%") ? row.weight : `${row.weight}%`}</td>
                        <td>
                          {row.subcategories.length > 0 ? (
                            <ul className={styles.rubricSubcategoryList}>
                              {row.subcategories.map((sub) => (
                                <li key={sub.label}><strong>{sub.label}:</strong> {sub.description}</li>
                              ))}
                            </ul>
                          ) : row.description}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <pre className={styles.generatedRubricBody}>{state.generatedRubric}</pre>
              )}
            </details>
          );
        })()}

        {run && run.fullCreditChecklist.length > 0 && (
          <section className={styles.checklistCard}>
            <h2>Full Credit Checklist</h2>
            <ul>
              {run.fullCreditChecklist.map((item, index) => (
                <li key={`full-credit-${index + 1}`}>{item}</li>
              ))}
            </ul>
          </section>
        )}

        {run && run.results.length > 0 && (
          <section className={styles.results}>
            <div className={styles.resultsHeader}>
              <h2>Grading Results</h2>
              <button
                className={styles.downloadButton}
                type="button"
                onClick={handleExportCsv}
              >
                Export CSV
              </button>
            </div>

            <div className={styles.matrixWrap}>
              <table className={styles.matrix}>
                <thead>
                  <tr>
                    <th>
                      <button
                        type="button"
                        className={styles.sortButton}
                        onClick={() => handleSort({ kind: "student" })}
                      >
                        Student <span>{sortLabel({ kind: "student" })}</span>
                      </button>
                    </th>
                    <th>
                      <button
                        type="button"
                        className={styles.sortButton}
                        onClick={() => handleSort({ kind: "files" })}
                      >
                        Files <span>{sortLabel({ kind: "files" })}</span>
                      </button>
                    </th>
                    {run.rubricAreaNames.map((area) => (
                      <th key={area}>
                        <button
                          type="button"
                          className={styles.sortButton}
                          onClick={() => handleSort({ kind: "rubric", area })}
                        >
                          {area} <span>{sortLabel({ kind: "rubric", area })}</span>
                        </button>
                      </th>
                    ))}
                    <th>
                      <button
                        type="button"
                        className={styles.sortButton}
                        onClick={() => handleSort({ kind: "total" })}
                      >
                        Total <span>{sortLabel({ kind: "total" })}</span>
                      </button>
                    </th>
                    <th>
                      <button
                        type="button"
                        className={styles.sortButton}
                        onClick={() => handleSort({ kind: "overall" })}
                      >
                        Overall Feedback <span>{sortLabel({ kind: "overall" })}</span>
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedResults.map((result) => {
                    const areaMap = new Map(
                      result.rubricAreas.map((area) => [area.area, area])
                    );

                    return (
                      <tr key={`${result.student}-matrix`}>
                        <td>{result.student}</td>
                        <td>
                          {result.submittedFiles.length > 0 ? (
                            <ul className={styles.matrixFileList}>
                              {result.submittedFiles.map((file) => (
                                <li
                                  key={`${result.student}-file-name-${file.name}`}
                                  className={styles.matrixFileItem}
                                >
                                  <span className={styles.matrixFileName}>
                                    {file.extension && file.extension !== "(none)" && !file.name.toLowerCase().endsWith(`.${file.extension.toLowerCase()}`)
                                      ? `${file.name}.${file.extension}`
                                      : file.name}
                                  </span>
                                  <div className={styles.fileIconGroup}>
                                    <button
                                      type="button"
                                      className={styles.fileIconButton}
                                      title={`Preview ${file.name}`}
                                      aria-label={`Preview ${file.name}`}
                                      onClick={() =>
                                        handleOpenPreview(result.student, {
                                          student: result.student,
                                          name: file.name,
                                          extension: file.extension,
                                          content:
                                            file.previewContent ||
                                            "No extracted text available for this file.",
                                          truncated: file.previewTruncated,
                                          rawBase64: file.rawBase64,
                                          mimeType: file.mimeType,
                                        })
                                      }
                                    >
                                      <EyeIcon />
                                    </button>
                                    {file.rawBase64 && (
                                      <button
                                        type="button"
                                        className={styles.fileIconButton}
                                        title={`Download ${file.name}`}
                                        aria-label={`Download ${file.name}`}
                                        onClick={() => handleDownloadFile(file.name, file.extension, file.rawBase64!, file.mimeType ?? "application/octet-stream")}
                                      >
                                        <DownloadIcon />
                                      </button>
                                    )}
                                  </div>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            "-"
                          )}
                        </td>
                        {run.rubricAreaNames.map((areaName) => {
                          const area = areaMap.get(areaName);

                          return (
                            <td
                              key={`${result.student}-${areaName}`}
                            >
                              {area ? (
                                <div className={styles.matrixCellDetail}>
                                  <button
                                    type="button"
                                    className={styles.copyIconButton}
                                    title={
                                      copiedKey === `${result.student}-${areaName}-comment`
                                        ? "Copied"
                                        : "Copy Feedback"
                                    }
                                    aria-label={
                                      copiedKey === `${result.student}-${areaName}-comment`
                                        ? "Copied"
                                        : `Copy feedback for ${result.student} - ${areaName}`
                                    }
                                    onClick={() =>
                                      handleCopy(
                                        `${result.student}-${areaName}-comment`,
                                        formatFeedback(area.comment || "No feedback provided.")
                                      )
                                    }
                                  >
                                    <CopyIcon />
                                  </button>
                                  <span className={`${styles.scoreBadge}${area && hasDeduction(area.score) ? ` ${styles.scoreBadgeDeducted}` : ''}`}>
                                    Score: {area.score || "-"}
                                  </span>
                                  <p>{formatFeedback(area.comment || "No feedback provided.")}</p>
                                </div>
                              ) : (
                                "-"
                              )}
                            </td>
                          );
                        })}
                        <td>{result.totalScore || "-"}</td>
                        <td>
                          <div className={styles.overallFeedbackWrap}>
                            <button
                              type="button"
                              className={styles.copyIconButton}
                              title={
                                copiedKey === `${result.student}-overall-comment`
                                  ? "Copied"
                                  : "Copy Overall Feedback"
                              }
                              aria-label={
                                copiedKey === `${result.student}-overall-comment`
                                  ? "Copied"
                                  : `Copy overall feedback for ${result.student}`
                              }
                              onClick={() =>
                                handleCopy(
                                  `${result.student}-overall-comment`,
                                  formatFeedback(result.overallComment || "No overall feedback provided.")
                                )
                              }
                            >
                              <CopyIcon />
                            </button>
                            <p className={styles.overallFeedbackCell}>
                              {formatFeedback(result.overallComment || "No overall feedback provided.")}
                            </p>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
          </section>
        )}

        {activeTab === "course-planning" && (
          <>
            {coursePlanningStep === "form" && (
              <section className={styles.card}>
                <div className={styles.header}>
                  <h1>Course Planning</h1>
                  <p>Upload a syllabus template and we will walk through each section together, letting you write or generate content for each one.</p>
                </div>
                <div className={styles.field}>
                  <label htmlFor="courseTitle">Course Title</label>
                  <input
                    id="courseTitle"
                    type="text"
                    className={styles.textInput}
                    placeholder="e.g. Introduction to Data Science"
                    value={courseTitle}
                    onChange={(e) => setCourseTitle(e.target.value)}
                  />
                </div>
                <div className={styles.field}>
                  <label htmlFor="coursePlanningContext">Additional Context</label>
                  <textarea
                    id="coursePlanningContext"
                    placeholder="Optional context to guide syllabus generation (program goals, institution policies, audience details, tone, etc.)"
                    value={coursePlanningContext}
                    onChange={(e) => setCoursePlanningContext(e.target.value)}
                  />
                </div>
                <div className={styles.field}>
                  <label htmlFor="coursePlanningContextFiles">Additional Context Files</label>
                  <div className={styles.fileField}>
                    <input
                      id="coursePlanningContextFiles"
                      type="file"
                      multiple
                      onChange={handleCoursePlanningContextFiles}
                    />
                    <p>Attach multiple supporting files (optional). Text, PDF, image, and DOCX files are used as extra context.</p>
                    {coursePlanningContextFiles.length > 0 && (
                      <p>{coursePlanningContextFiles.length} context file(s) selected.</p>
                    )}
                  </div>
                </div>
                <div className={styles.field}>
                  <label htmlFor="syllabusFile">Syllabus Template</label>
                  <div className={styles.fileField}>
                    <input id="syllabusFile" type="file" ref={syllabusFileRef} />
                    <p>Upload a syllabus template (.txt, .pdf, .docx, etc.) to use as a starting point.</p>
                  </div>
                </div>
                {coursePlanningError && <p className={styles.error}>{coursePlanningError}</p>}
                <button
                  type="button"
                  className={styles.submitButton}
                  onClick={handleStartCoursePlanning}
                  disabled={isParsingTemplate || !courseTitle.trim()}
                >
                  {isParsingTemplate ? "Parsing template…" : "Begin"}
                </button>
              </section>
            )}

            {coursePlanningStep === "wizard" && parsedSections[currentSectionIndex] && (
              <section className={styles.card}>
                <div className={styles.header}>
                  <p className={styles.eyebrow}>Section {currentSectionIndex + 1} of {parsedSections.length}</p>
                  <h1>{parsedSections[currentSectionIndex].heading}</h1>
                  {parsedSections[currentSectionIndex].hint && (
                    <p>{parsedSections[currentSectionIndex].hint}</p>
                  )}
                </div>
                <div className={styles.field}>
                  <label htmlFor="sectionInput">Your Content</label>
                  <textarea
                    id="sectionInput"
                    placeholder="Paste your content here, or leave blank to generate with AI…"
                    value={currentSectionInput}
                    onChange={(e) => setCurrentSectionInput(e.target.value)}
                    disabled={isGeneratingSection}
                  />
                </div>
                {coursePlanningError && <p className={styles.error}>{coursePlanningError}</p>}
                <div className={styles.lessonPreviewFooter}>
                  <button
                    type="button"
                    className={styles.downloadButton}
                    onClick={resetCoursePlanning}
                    disabled={isGeneratingSection}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className={styles.downloadButton}
                    onClick={handleSectionSkip}
                    disabled={isGeneratingSection}
                  >
                    Skip
                  </button>
                  {currentSectionIndex + 1 < parsedSections.length && (
                    <button
                      type="button"
                      className={styles.downloadButton}
                      onClick={handleGenerateRemaining}
                      disabled={isGeneratingSection}
                    >
                      {isGeneratingSection ? "Generating…" : "Generate All"}
                    </button>
                  )}
                  <button
                    type="button"
                    className={styles.submitButton}
                    onClick={handleSectionNext}
                    disabled={isGeneratingSection}
                  >
                    {isGeneratingSection
                      ? "Generating…"
                      : currentSectionIndex + 1 < parsedSections.length
                        ? "Next"
                        : "Finish"}
                  </button>
                </div>
              </section>
            )}

            {coursePlanningStep === "preview" && null}
          </>
        )}

        {activeTab === "lesson-planning" && (
          <LessonPlanningForm
            moduleObjectives={moduleObjectives}
            onModuleObjectivesChange={setModuleObjectives}
            lessonContext={lessonContext}
            onLessonContextChange={setLessonContext}
            contextFileRef={lessonContextFileRef}
            lessonError={lessonError}
            isGeneratingLesson={isGeneratingLesson}
            onGenerate={handleGenerateLesson}
          />
        )}
      </div>

      {coursePlanningStep === "preview" && (
        <div className={styles.previewBackdrop} onClick={resetCoursePlanning}>
          <section
            className={styles.lessonPreviewModal}
            role="dialog"
            aria-modal="true"
            aria-label="Syllabus preview"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.previewHeader}>
              <div>
                <h3>{courseTitle}</h3>
                <p className={styles.previewMeta}>
                  {sectionContents.filter(Boolean).length} of {parsedSections.length} sections compiled
                </p>
              </div>
              <button
                type="button"
                className={styles.previewCloseButton}
                onClick={resetCoursePlanning}
              >
                Close
              </button>
            </div>

            <div className={styles.assignmentContent}>
              {parsedSections.map((section, i) =>
                sectionContents[i] ? (
                  <div key={i} className={styles.syllabusSectionCard}>
                    <div className={styles.syllabusSectionTopRow}>
                      <p className={styles.syllabusSectionHeading}>{section.heading}</p>
                      <div className={styles.syllabusSectionActions}>
                        <button
                          type="button"
                          className={styles.syllabusSectionActionButton}
                          title={
                            copiedKey === `syllabus-section-${i}`
                              ? "Copied"
                              : "Copy section content"
                          }
                          aria-label={
                            copiedKey === `syllabus-section-${i}`
                              ? "Copied"
                              : `Copy ${section.heading} section`
                          }
                          onClick={() => handleCopy(`syllabus-section-${i}`, sectionContents[i])}
                        >
                          <CopyIcon />
                        </button>
                        <button
                          type="button"
                          className={`${styles.syllabusSectionActionButton}${lockedSyllabusSections[i] ? ` ${styles.syllabusSectionActionButtonActive}` : ""}`}
                          title={lockedSyllabusSections[i] ? "Locked for revisions" : "Unlocked for revisions"}
                          aria-label={lockedSyllabusSections[i] ? `Unlock ${section.heading}` : `Lock ${section.heading}`}
                          onClick={() => {
                            setLockedSyllabusSections((prev) => {
                              const next = [...prev];
                              next[i] = !next[i];
                              return next;
                            });
                          }}
                        >
                          {lockedSyllabusSections[i] ? <LockClosedIcon /> : <LockOpenIcon />}
                        </button>
                        <button
                          type="button"
                          className={`${styles.syllabusSectionActionButton}${editingSyllabusSection === i ? ` ${styles.syllabusSectionActionButtonActive}` : ""}`}
                          title={editingSyllabusSection === i ? "Editing" : "Edit section"}
                          aria-label={editingSyllabusSection === i ? `Stop editing ${section.heading}` : `Edit ${section.heading}`}
                          onClick={() => editingSyllabusSection === i ? cancelEditSyllabusSection() : startEditSyllabusSection(i)}
                        >
                          <PencilIcon />
                        </button>
                      </div>
                    </div>
                    {editingSyllabusSection === i ? (
                      <div className={styles.fieldEditWrap}>
                        <textarea
                          className={styles.fieldEditArea}
                          value={syllabusSectionDraft}
                          onChange={(e) => setSyllabusSectionDraft(e.target.value)}
                          rows={Math.max(5, syllabusSectionDraft.split("\n").length + 2)}
                          autoFocus
                        />
                        <div className={styles.fieldEditActions}>
                          <button type="button" className={styles.fieldEditSaveBtn} onClick={() => saveEditSyllabusSection(i)}>Save</button>
                          <button type="button" className={styles.fieldEditCancelBtn} onClick={cancelEditSyllabusSection}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <p className={styles.syllabusSectionContent}>{sectionContents[i]}</p>
                    )}
                  </div>
                ) : null
              )}
            </div>

            {coursePlanningError && <p className={styles.error}>{coursePlanningError}</p>}

            <div className={styles.lessonRevisionRow}>
              <input
                ref={syllabusRevisionFileRef}
                type="file"
                multiple
                style={{ display: "none" }}
                onChange={handleSyllabusRevisionFileChange}
              />
              <textarea
                className={styles.lessonRevisionArea}
                placeholder="Revision instructions — e.g. make the grading policy stricter, add a late work policy, shorten the course description…"
                value={syllabusRevisionPrompt}
                onChange={(e) => setSyllabusRevisionPrompt(e.target.value)}
                rows={2}
                disabled={isRevisingSyllabus}
              />
              <button
                type="button"
                className={styles.downloadButton}
                onClick={() => syllabusRevisionFileRef.current?.click()}
                disabled={isRevisingSyllabus}
                title="Attach additional context files"
              >
                {syllabusRevisionFiles.length > 0 ? `Files (${syllabusRevisionFiles.length})` : "Attach"}
              </button>
              <button
                type="button"
                className={styles.submitButton}
                onClick={handleReviseSyllabus}
                disabled={isRevisingSyllabus || (!syllabusRevisionPrompt.trim() && syllabusRevisionFiles.length === 0)}
              >
                {isRevisingSyllabus ? "Revising…" : "Revise"}
              </button>
            </div>

            <div className={styles.lessonPreviewFooter}>
              <button type="button" className={styles.submitButton} onClick={handleDownloadSyllabus}>
                Download Syllabus
              </button>
              <button type="button" className={styles.downloadButton} onClick={resetCoursePlanning}>
                Start Over
              </button>
            </div>
          </section>
        </div>
      )}

      {lessonPlanPreview && (
        <LessonPlanPreview
          lessonPlanPreview={lessonPlanPreview}
          assignmentPreview={assignmentPreview}
          introPreview={introPreview}
          rubricPreview={rubricPreview}
          copiedKey={copiedKey}
          onClose={() => setLessonPlanPreview(null)}
          onCopy={handleCopy}
          onSaveField={saveLessonFieldEdit}
          onRegenerate={handleRegenerateLesson}
          onDownload={handleDownloadLessonPlan}
          icons={{ CopyIcon, LockClosedIcon, LockOpenIcon, PencilIcon }}
        />
      )}

      {selectedPreview && (
        <FilePreviewModal
          selectedPreview={selectedPreview}
          previewBlobUrl={previewBlobUrl}
          onClose={handleClosePreview}
        />
      )}
    </main>
  );
}
