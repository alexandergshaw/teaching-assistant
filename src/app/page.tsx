"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Tab, Tabs } from "@mui/material";
import { gradeAction, testGeminiAction, generateLessonPlanAction, generateAssignmentAction, generateAssignmentRubricAction, generateModuleIntroAction, type GradeActionState, type TestGeminiState, type GenerateLessonPlanResult, type AssignmentData, type ModuleIntroData } from "./actions";
import CoursePlanningTab from "./components/CoursePlanningTab";
import GradingTab from "./components/GradingTab";
import LessonPlanPreview from "./components/LessonPlanPreview";
import FilePreviewModal, { type PreviewFile } from "./components/FilePreviewModal";
import LessonPlanningForm from "./components/LessonPlanningForm";
import styles from "./page.module.css";
import { parseGeneratedRubric } from "./utils/rubric";



const initialState: GradeActionState = { run: null, error: null };
const initialTestState: TestGeminiState = { result: null, error: null };

type ActiveTab = "grading" | "lesson-planning" | "course-planning";

function CopyIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M7 3.5A2.5 2.5 0 0 1 9.5 1h6A2.5 2.5 0 0 1 18 3.5v8A2.5 2.5 0 0 1 15.5 14h-6A2.5 2.5 0 0 1 7 11.5v-8Zm2.5-1a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-6Z" />
      <path d="M2 7.5A2.5 2.5 0 0 1 4.5 5h.75a.75.75 0 0 1 0 1.5H4.5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-.75a.75.75 0 0 1 1.5 0v.75A2.5 2.5 0 0 1 10.5 18h-6A2.5 2.5 0 0 1 2 15.5v-8Z" />
    </svg>
  );
}

// DownloadIcon and EyeIcon moved to GradingTab component

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

export default function Home() {
  const [state, formAction, pending] = useActionState(gradeAction, initialState);
  const [testState] = useActionState(testGeminiAction, initialTestState);
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
          <GradingTab
            formAction={formAction}
            pending={pending}
            state={state}
            testState={testState}
            copiedKey={copiedKey}
            onCopy={handleCopy}
            onOpenPreview={handleOpenPreview}
          />
        )}

        {activeTab === "course-planning" && (
          <CoursePlanningTab
            copiedKey={copiedKey}
            onCopy={handleCopy}
            icons={{ CopyIcon, LockClosedIcon, LockOpenIcon, PencilIcon }}
          />
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
