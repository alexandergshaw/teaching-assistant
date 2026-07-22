"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Tab, Tabs } from "@mui/material";
import { readUploadFile, downloadBase64File, getCommentPrefix } from "./home-helpers";
import { CopyIcon, LockClosedIcon, LockOpenIcon, PencilIcon, NavTabLabel } from "./components/home/HomeIcons";
import { gradeAction, testGeminiAction, generateLessonPlanAction, generateAssignmentAction, generateAssignmentRubricAction, generateModuleIntroAction, generateExamplesAction, generateLectureDeckAction, listCourseHubAction, setCourseMaterialsAction, type GradeActionState, type TestGeminiState, type GenerateLessonPlanResult, type AssignmentData, type ModuleIntroData, type ExamplesData } from "./actions";
import CoursePlanningTab from "./components/CoursePlanningTab";
import CoursesTab from "./components/CoursesTab";
import VersionControlTab from "./components/VersionControlTab";
import CanvasTab from "./components/CanvasTab";
import ContentTab from "./components/ContentTab";
import GradingTab from "./components/GradingTab";
import RecordingTab from "./components/RecordingTab";
import FilesTab from "./components/FilesTab";
import DraftedGradesTab from "./components/DraftedGradesTab";
import MessageDraftsTab from "./components/MessageDraftsTab";
import PresentationDraftsTab from "./components/PresentationDraftsTab";
import WorkflowsTab from "./components/WorkflowsTab";
import AutomationsTabView from "./components/AutomationsTabView";
import PowerPointDesignTab from "./components/PowerPointDesignTab";
import WorkflowScheduleWatcher from "./components/WorkflowScheduleWatcher";
import WorkflowTriggerWatcher from "./components/WorkflowTriggerWatcher";
import LessonPlanPreview from "./components/LessonPlanPreview";
import FilePreviewModal, { type PreviewFile } from "./components/FilePreviewModal";
import LessonPlanningForm from "./components/LessonPlanningForm";
import TopBar from "./components/TopBar";
import { useInstitutionCounts } from "./components/InstitutionCounts";
import { useVcCounts } from "./components/VcCounts";
import { useFilesInbox } from "./components/FilesInbox";
import { useDraftedGradesInbox } from "./components/DraftedGradesInbox";
import { getStoredProvider, useLlmProvider } from "@/lib/llm-provider";
import { buildSlidesPptx } from "@/lib/pptx";
import { stampDocxAppProperties } from "@/lib/docx";
import { resolveDocumentAuthor } from "@/lib/author";
import { useSupabase } from "@/context/SupabaseProvider";
import { uploadCourseZip, removeCourseZip } from "@/lib/course-files";
import { saveRecordingFile } from "@/lib/recording-files";
import styles from "./page.module.css";
import { parseGeneratedRubric } from "./utils/rubric";
import { VIEW_KEY, type ContentView } from "./components/content-tab/constants";
import { ManualRail } from "./components/manual/ManualRail";
import { resolveStateFromDestinationId } from "./components/manual/manual-rail";



const initialState: GradeActionState = { run: null, error: null };
const initialTestState: TestGeminiState = { result: null, error: null };

type ActiveTab = "courses" | "manual" | "workflows" | "files";
// The Manual tab groups Build Courses, Integrations, and Recording as subtabs.
type ManualView = "course-planning" | "content" | "version-control" | "recording" | "ppt-design";
const MANUAL_VIEW_KEY = "ta-manual-view";
// The Build Courses tab hosts both flows: "new" (New Build) and "prebuilt" (Pre Built).
type BuildView = "new" | "prebuilt";
const BUILD_VIEW_KEY = "ta-build-view";
// The Workflows tab groups Workflows, Automations, and Drafts as subtabs.
type WorkflowsView = "workflows" | "automations" | "drafts";
const WORKFLOWS_VIEW_KEY = "ta-workflows-view";
// The Drafts tab groups Grades, Messages, and Presentations as subtabs.
type DraftsView = "grades" | "messages" | "presentations";
const DRAFTS_VIEW_KEY = "ta-drafts-view";

// The hosted Course Engine runs on Vercel, which caps the request body at
// ~4.5 MB. Reject larger uploads client-side with a clear message rather than
// letting the platform fail the request opaquely.
const COURSE_ENGINE_MAX_UPLOAD_BYTES = 4.5 * 1024 * 1024;

export default function Home() {
  const [state, formAction, pending] = useActionState(gradeAction, initialState);
  const { user } = useSupabase();
  const { totalNeedsGrading, totalUnread } = useInstitutionCounts();
  const { total: vcAttention } = useVcCounts();
  const { count: filesInbox, markSeen: markFilesSeen } = useFilesInbox();
  const { count: draftsInbox, gradesCount: draftsGradesCount, messagesCount: draftsMessagesCount, presentationsCount: draftsPresentationsCount, refresh: refreshDrafts } = useDraftedGradesInbox();
  const [testState] = useActionState(testGeminiAction, initialTestState);
  const [activeTab, setActiveTab] = useState<ActiveTab>(() => {
    if (typeof window === "undefined") return "manual";
    const saved = localStorage.getItem("ta-active-tab");
    // Migrate legacy "grade-drafts" or "drafts" to "workflows".
    if (saved === "grade-drafts" || saved === "drafts") return "workflows";
    // Migrate legacy "ppt-design" to "manual".
    if (saved === "ppt-design") return "manual";
    return saved === "courses" || saved === "workflows" || saved === "files"
      ? saved
      : "manual";
  });
  const [manualView, setManualView] = useState<ManualView>(() => {
    if (typeof window === "undefined") return "course-planning";
    // A user who was viewing Version Control (inside the old Integrations, tracked
    // by VIEW_KEY) lands on the new standalone Version Control subtab; reset the
    // LMS content view so ContentTab does not open on a now-removed VC subtab.
    if (localStorage.getItem(VIEW_KEY) === "version-control") {
      localStorage.setItem(VIEW_KEY, "modules");
      return "version-control";
    }
    const savedManual = localStorage.getItem(MANUAL_VIEW_KEY);
    if (
      savedManual === "course-planning" ||
      savedManual === "content" ||
      savedManual === "version-control" ||
      savedManual === "recording" ||
      savedManual === "ppt-design"
    ) {
      return savedManual;
    }
    const saved = localStorage.getItem("ta-active-tab");
    if (saved === "recording") return "recording";
    if (saved === "version-control") return "version-control";
    if (saved === "ppt-design") return "ppt-design";
    if (saved === "content" || saved === "grading" || saved === "canvas") return "content";
    return "course-planning";
  });
  const [buildView, setBuildViewState] = useState<BuildView>(() => {
    if (typeof window === "undefined") return "prebuilt";
    // Users who last used the old Pre Built Courses tab land on that subtab.
    if (localStorage.getItem("ta-active-tab") === "lesson-planning") return "prebuilt";
    return localStorage.getItem(BUILD_VIEW_KEY) === "new" ? "new" : "prebuilt";
  });
  const setBuildView = (v: BuildView) => {
    setBuildViewState(v);
    if (typeof window !== "undefined") localStorage.setItem(BUILD_VIEW_KEY, v);
  };
  const [contentView, setContentViewState] = useState<ContentView>(() => {
    if (typeof window === "undefined") return "modules";
    const saved = localStorage.getItem(VIEW_KEY);
    return saved === "pages" || saved === "files" || saved === "grading" || saved === "announcements" || saved === "inbox" || saved === "version-control"
      ? (saved as ContentView)
      : "modules";
  });
  const setContentView = (v: ContentView) => {
    setContentViewState(v);
    if (typeof window !== "undefined") localStorage.setItem(VIEW_KEY, v);
  };
  const [workflowsView, setWorkflowsView] = useState<WorkflowsView>(() => {
    if (typeof window === "undefined") return "workflows";
    // Migrate legacy "grade-drafts" or stored "drafts" to "drafts" view.
    const saved = localStorage.getItem("ta-active-tab");
    if (saved === "grade-drafts" || saved === "drafts") return "drafts";
    const savedWorkflows = localStorage.getItem(WORKFLOWS_VIEW_KEY);
    return savedWorkflows === "workflows" || savedWorkflows === "automations" || savedWorkflows === "drafts" ? savedWorkflows : "workflows";
  });
  const [draftsView, setDraftsView] = useState<DraftsView>(() => {
    if (typeof window === "undefined") return "grades";
    const saved = localStorage.getItem(DRAFTS_VIEW_KEY);
    return saved === "grades" || saved === "messages" || saved === "presentations" ? saved : "grades";
  });
  const [selectedPreview, setSelectedPreview] = useState<PreviewFile | null>(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const copyResetTimerRef = useRef<number | null>(null);
  const [moduleObjectives, setModuleObjectives] = useState("");
  const [moduleTitle, setModuleTitle] = useState("");
  const [lessonContext, setLessonContext] = useState("");
  const [provider] = useLlmProvider();
  const [isGeneratingLesson, setIsGeneratingLesson] = useState(false);
  const [lessonError, setLessonError] = useState<string | null>(null);
  const [lessonPlanPreview, setLessonPlanPreview] = useState<GenerateLessonPlanResult | null>(null);
  const [assignmentPreview, setAssignmentPreview] = useState<AssignmentData | null>(null);
  const [rubricPreview, setRubricPreview] = useState<string | null>(null);
  const [introPreview, setIntroPreview] = useState<ModuleIntroData | null>(null);
  const [examplesPreview, setExamplesPreview] = useState<ExamplesData | null>(null);
  const [savedLessonFiles, setSavedLessonFiles] = useState<Array<{ name: string; base64: string; mimeType: string }>>([]);
  const lessonContextFileRef = useRef<HTMLInputElement>(null);
  const [homeworkText, setHomeworkText] = useState("");
  const homeworkFileRef = useRef<HTMLInputElement>(null);
  const [savedHomeworkFiles, setSavedHomeworkFiles] = useState<Array<{ name: string; base64: string; mimeType: string }>>([]);
  const [hubCourses, setHubCourses] = useState<Array<{ id: string; name: string; materialsZipPath: string | null }> | null>(null);
  const [attachBusy, setAttachBusy] = useState(false);
  const [attachNote, setAttachNote] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    localStorage.setItem("ta-active-tab", activeTab);
  }, [activeTab]);

  useEffect(() => {
    localStorage.setItem(MANUAL_VIEW_KEY, manualView);
  }, [manualView]);

  useEffect(() => {
    localStorage.setItem(WORKFLOWS_VIEW_KEY, workflowsView);
  }, [workflowsView]);

  useEffect(() => {
    localStorage.setItem(DRAFTS_VIEW_KEY, draftsView);
  }, [draftsView]);

  useEffect(() => {
    if (activeTab === "files") {
      markFilesSeen();
    }
  }, [activeTab, markFilesSeen]);

  useEffect(() => {
    if (activeTab === "workflows" && workflowsView === "drafts") {
      refreshDrafts();
    }
  }, [activeTab, workflowsView, refreshDrafts]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const total = totalNeedsGrading + totalUnread + vcAttention + filesInbox + draftsInbox;
    document.title = total > 0 ? `(${total}) Teaching Assistant` : "Teaching Assistant";
  }, [totalNeedsGrading, totalUnread, vcAttention, filesInbox, draftsInbox]);

  useEffect(() => {
    return () => {
      if (copyResetTimerRef.current !== null) {
        window.clearTimeout(copyResetTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (lessonPlanPreview && !hubCourses) {
      let cancelled = false;
      (async () => {
        const r = await listCourseHubAction();
        if (cancelled) return;
        if (!("error" in r)) {
          setHubCourses(r.courses.map((c) => ({ id: c.id, name: c.name, materialsZipPath: c.materialsZipPath })));
        }
      })();
      return () => {
        cancelled = true;
      };
    }
  }, [lessonPlanPreview, hubCourses]);

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
    // The Course Engine lecture endpoint accepts a file in place of objectives,
    // so on that provider an attached file alone is enough to generate.
    const isCourseEngine = getStoredProvider() === "other";
    const lectureFileInput = isCourseEngine
      ? lessonContextFileRef.current?.files?.[0]
      : undefined;
    const homeworkFileInput = homeworkFileRef.current?.files?.[0];

    if (!moduleObjectives.trim() && !lectureFileInput) {
      setLessonError(
        isCourseEngine
          ? "Enter module objectives or attach a file to generate the lecture."
          : "Please enter module objectives before generating."
      );
      return;
    }

    // The Course Engine (Vercel) caps the request body at ~4.5 MB; validate the
    // files it will receive up front. The Gemini path extracts text server-side
    // and is not subject to this cap.
    if (isCourseEngine) {
      const oversized = [lectureFileInput, homeworkFileInput].find(
        (f) => f && f.size > COURSE_ENGINE_MAX_UPLOAD_BYTES
      );
      if (oversized) {
        setLessonError(`"${oversized.name}" is too large (max ~4.5 MB). Upload a smaller file or paste the text instead.`);
        return;
      }
    }

    setIsGeneratingLesson(true);
    setLessonError(null);
    try {
      // Course Engine path: it returns a finished .pptx deck, so download it
      // directly and skip the Gemini companion bundle + preview. The attached
      // context file (an existing class deck) seeds the objectives, and the
      // homework (text and/or file) tunes prerequisite coverage.
      if (isCourseEngine) {
        const lectureFile = lectureFileInput
          ? await readUploadFile(lectureFileInput)
          : undefined;
        const homeworkFile = homeworkFileInput
          ? await readUploadFile(homeworkFileInput)
          : undefined;
        const homework =
          homeworkText.trim() || homeworkFile
            ? { text: homeworkText.trim() || undefined, file: homeworkFile }
            : undefined;
        const deck = await generateLectureDeckAction(
          moduleObjectives,
          moduleTitle.trim() || undefined,
          lectureFile,
          homework
        );
        if ("error" in deck) {
          setLessonError(deck.error);
          return;
        }
        downloadBase64File(deck.base64, deck.fileName, deck.mimeType);
        return;
      }

      const fileList = lessonContextFileRef.current?.files;
      const files: Array<{ name: string; base64: string; mimeType: string }> = [];
      if (fileList) {
        for (const file of Array.from(fileList)) {
          files.push(await readUploadFile(file));
        }
      }

      setSavedLessonFiles(files);

      const homeworkFileList = homeworkFileRef.current?.files;
      const homeworkFiles: Array<{ name: string; base64: string; mimeType: string }> = [];
      if (homeworkFileList) {
        for (const file of Array.from(homeworkFileList)) {
          homeworkFiles.push(await readUploadFile(file));
        }
      }
      setSavedHomeworkFiles(homeworkFiles);
      const homework = { text: homeworkText.trim() || undefined, files: homeworkFiles };

      const provider = getStoredProvider();
      const [slideResult, assignmentResult, rubricResult, introResult] = await Promise.all([
        generateLessonPlanAction(moduleObjectives, lessonContext, files, undefined, undefined, provider, homework),
        generateAssignmentAction(moduleObjectives, lessonContext, files, provider),
        generateAssignmentRubricAction(moduleObjectives, lessonContext, provider),
        generateModuleIntroAction(moduleObjectives, lessonContext, provider),
      ]);

      if ("error" in slideResult) {
        setLessonError(slideResult.error);
        return;
      }

      const examplesResult = await generateExamplesAction(
        moduleObjectives,
        lessonContext,
        slideResult.slides,
        provider
      );

      setLessonPlanPreview(slideResult);
      setAssignmentPreview("error" in assignmentResult ? null : assignmentResult);
      setRubricPreview(typeof rubricResult === "string" ? rubricResult : null);
      setIntroPreview("error" in introResult ? null : introResult);
      setExamplesPreview("error" in examplesResult ? null : examplesResult);
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
        lessonPlanPreview.slides,
        getStoredProvider(),
        { text: homeworkText.trim() || undefined, files: savedHomeworkFiles }
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

  const buildLessonZip = async (): Promise<{ blob: Blob; fileName: string } | null> => {
    if (!lessonPlanPreview) return null;
    try {
      const [{ default: JSZip }, docxModule] = await Promise.all([
        import("jszip"),
        import("docx"),
      ]);
      const { Document, Packer, Paragraph, TextRun, HeadingLevel } = docxModule;

      const author = resolveDocumentAuthor(user);

      const pptxData = await buildSlidesPptx({
        presentationTitle: lessonPlanPreview.presentationTitle,
        slides: lessonPlanPreview.slides,
        author,
      });

      let introDocxBuffer: ArrayBuffer | null = null;
      if (introPreview) {
        const introDoc = new Document({
          creator: author,
          lastModifiedBy: author,
          sections: [{
            children: [
              new Paragraph({ text: "Module Introduction", heading: HeadingLevel.HEADING_1 }),
              new Paragraph({ text: "Where This Fits", heading: HeadingLevel.HEADING_2 }),
              new Paragraph({ children: [new TextRun(introPreview.overview)] }),
              new Paragraph({ text: "Key Terms", heading: HeadingLevel.HEADING_2 }),
              new Paragraph({ children: [new TextRun(introPreview.keyTerms)] }),
            ],
          }],
        });
        introDocxBuffer = await stampDocxAppProperties(await Packer.toArrayBuffer(introDoc));
      }

      let assignmentDocxBuffer: ArrayBuffer | null = null;
      if (assignmentPreview) {
        const assignmentChildren = [
          new Paragraph({ text: `Assignment: ${assignmentPreview.title}`, heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ text: "Overview", heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ children: [new TextRun(assignmentPreview.overview)] }),
          new Paragraph({ text: "Steps", heading: HeadingLevel.HEADING_2 }),
          ...assignmentPreview.steps.map((s) => new Paragraph({
            children: [
              new TextRun({ text: `• ${s.stepTitle}`, bold: true }),
              new TextRun({ text: `  ${s.description}` }),
            ],
          })),
          new Paragraph({ text: "Free Tools", heading: HeadingLevel.HEADING_2 }),
          ...assignmentPreview.tools.map((t) => new Paragraph({ children: [new TextRun(`• ${t}`)] })),
          new Paragraph({ text: "Deliverables", heading: HeadingLevel.HEADING_2 }),
          ...assignmentPreview.deliverables.map((d) => new Paragraph({ children: [new TextRun(`• ${d}`)] })),
        ];
        const assignmentDoc = new Document({ creator: author, lastModifiedBy: author, sections: [{ children: assignmentChildren }] });
        assignmentDocxBuffer = await stampDocxAppProperties(await Packer.toArrayBuffer(assignmentDoc));
      }

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

      let examplesText = "";
      if (examplesPreview && examplesPreview.examples.length > 0) {
        const lines: string[] = [];
        examplesPreview.examples.forEach((ex, i) => {
          const prefix = getCommentPrefix(ex.language);
          const commentLine = (text: string) =>
            text === "" ? "" : `${prefix} ${text}`;
          if (i === 0) {
            lines.push(commentLine("IN-CLASS EXAMPLES"));
            lines.push(commentLine("================="));
            lines.push("");
          }
          const heading = `EXAMPLE ${i + 1}: ${ex.title}`;
          lines.push(commentLine(heading));
          lines.push(commentLine("-".repeat(heading.length)));
          lines.push("");
          lines.push(ex.content);
          lines.push("");
          lines.push(commentLine("EXPLANATION:"));
          ex.explanation.split("\n").forEach((expLine) => lines.push(commentLine(expLine)));
          lines.push("");
        });
        examplesText = lines.join("\n");
      }

      const lectureChildren = [
        new Paragraph({ text: lessonPlanPreview.presentationTitle, heading: HeadingLevel.HEADING_1 }),
      ];
      for (const slide of lessonPlanPreview.slides) {
        lectureChildren.push(new Paragraph({ text: slide.title, heading: HeadingLevel.HEADING_2 }));
        for (const bullet of slide.bullets) {
          lectureChildren.push(new Paragraph({ children: [new TextRun(`• ${bullet}`)] }));
        }
      }
      const lectureDoc = new Document({ creator: author, lastModifiedBy: author, sections: [{ children: lectureChildren }] });
      const lectureDocxBuffer = await stampDocxAppProperties(await Packer.toArrayBuffer(lectureDoc));

      const zip = new JSZip();
      if (introDocxBuffer) zip.file("introduction.docx", introDocxBuffer);
      zip.file("slides.pptx", pptxData);
      zip.file("lecture.docx", lectureDocxBuffer);
      if (assignmentDocxBuffer) zip.file("assignment.docx", assignmentDocxBuffer);
      if (rubricText) zip.file("rubric.txt", rubricText);
      if (examplesText) zip.file("examples.txt", examplesText);

      const safeName = lessonPlanPreview.presentationTitle.replace(/[^a-z0-9]/gi, "_").replace(/_+/g, "_");
      const blob = await zip.generateAsync({ type: "blob" });
      return { blob, fileName: `${safeName}.zip` };
    } catch (err) {
      setLessonError(err instanceof Error ? err.message : "Build failed.");
      return null;
    }
  };

  const handleDownloadLessonPlan = async () => {
    const built = await buildLessonZip();
    if (!built) return;
    try {
      const url = URL.createObjectURL(built.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = built.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      if (user) {
        void saveRecordingFile(supabase, user.id, built.blob, {
          name: built.fileName.replace(/\.zip$/i, ""),
          kind: "bundle",
          mimeType: "application/zip",
          durationSec: null,
        }).catch((err) => console.error("Library save failed:", err));
      }
    } catch (err) {
      setLessonError(err instanceof Error ? err.message : "Download failed.");
    }
  };

  const { supabase } = useSupabase();

  const handleAttachToCourse = async (courseId: string) => {
    const built = await buildLessonZip();
    if (!built || !user) {
      setAttachNote({ kind: "error", text: "Could not build lesson zip." });
      return;
    }
    setAttachBusy(true);
    try {
      const target = hubCourses?.find((c) => c.id === courseId);
      const courseName = target?.name ?? "Course";
      const { path } = await uploadCourseZip(supabase, user.id, courseId, built.blob, target?.materialsZipPath ?? null);
      const r = await setCourseMaterialsAction(courseId, {
        materialsZipName: built.fileName,
        materialsZipPath: path,
        materialsZipSize: built.blob.size,
      });
      if ("error" in r) {
        setAttachNote({ kind: "error", text: r.error });
        await removeCourseZip(supabase, path);
        return;
      }
      setAttachNote({ kind: "success", text: `Attached ${built.fileName} to ${courseName}.` });
      setHubCourses((prev) =>
        prev?.map((c) => c.id === courseId ? { ...c, materialsZipPath: path } : c) ?? null
      );
      void saveRecordingFile(supabase, user.id, built.blob, {
        name: built.fileName.replace(/\.zip$/i, ""),
        kind: "bundle",
        mimeType: "application/zip",
        durationSec: null,
      }).catch((err) => console.error("Library save failed:", err));
    } catch (err) {
      setAttachNote({ kind: "error", text: err instanceof Error ? err.message : "Could not attach materials." });
    } finally {
      setAttachBusy(false);
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
        // Preserve any example code block on the slide; only title/bullets are
        // editable through this textarea.
        slides[idx] = { ...slides[idx], title, bullets };
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
    } else if (key.startsWith("example-content-")) {
      const idx = parseInt(key.slice(16), 10);
      setExamplesPreview((prev) => {
        if (!prev) return prev;
        const examples = [...prev.examples];
        examples[idx] = { ...examples[idx], content: draft };
        return { ...prev, examples };
      });
    } else if (key.startsWith("example-explanation-")) {
      const idx = parseInt(key.slice(20), 10);
      setExamplesPreview((prev) => {
        if (!prev) return prev;
        const examples = [...prev.examples];
        examples[idx] = { ...examples[idx], explanation: draft };
        return { ...prev, examples };
      });
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

  const openWorkflow = (id: string, panel?: "automate") => {
    if (typeof window !== "undefined") localStorage.setItem("ta-workflows-selected", id);
    if (panel === "automate" && typeof window !== "undefined") localStorage.setItem("ta-workflows-panel", "automate");
    setWorkflowsView("workflows");
    setActiveTab("workflows");
  };

  const handleWorkflowScheduled = () => {
    setWorkflowsView("workflows");
    setActiveTab("workflows");
  };

  return (
    <>
      <TopBar />
      <WorkflowScheduleWatcher onRunScheduled={handleWorkflowScheduled} />
      <WorkflowTriggerWatcher onRunScheduled={handleWorkflowScheduled} />
      <main className={styles.page}>
      <div className={styles.tabContainer}>
        <Tabs
          value={activeTab}
          onChange={(_, v: ActiveTab) => setActiveTab(v)}
          sx={{
            position: "sticky",
            top: "var(--topbar-height)",
            zIndex: 40,
            backgroundColor: "var(--card-background)",
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
              color: "var(--accent-ink) !important",
              fontWeight: 600,
            },
            minHeight: 44,
          }}
        >
          <Tab label="Courses" value="courses" disableRipple />
          <Tab label="Manual" value="manual" disableRipple />
          <Tab label={<NavTabLabel text="Workflows" count={draftsInbox} />} value="workflows" disableRipple />
          <Tab label={<NavTabLabel text="Files" count={filesInbox} />} value="files" disableRipple />
        </Tabs>

        {activeTab === "courses" && (
          <CoursesTab
            onNavigate={(tab) => {
              if (tab === "course-planning") {
                // Course handoffs (syllabus prefill) live in the New Build flow.
                setBuildView("new");
                setManualView("course-planning");
                setActiveTab("manual");
              } else if (tab === "version-control") {
                setManualView("version-control");
                setActiveTab("manual");
              } else {
                setActiveTab(tab as ActiveTab);
              }
            }}
          />
        )}

        {activeTab === "manual" && (
          <>
            <ManualRail
              manualView={manualView}
              buildView={buildView}
              contentView={contentView}
              onDestinationClick={(destId) => {
                const resolved = resolveStateFromDestinationId(destId, manualView, buildView, contentView);
                if (resolved.manualView !== manualView) setManualView(resolved.manualView);
                if (resolved.buildView !== buildView) setBuildView(resolved.buildView);
                if (resolved.contentView !== contentView) setContentView(resolved.contentView);
              }}
            />

            {manualView === "course-planning" && (
              <div className={styles.card}>
                {buildView === "new" ? (
                  <CoursePlanningTab />
                ) : (
                  <LessonPlanningForm
                    moduleObjectives={moduleObjectives}
                    onModuleObjectivesChange={setModuleObjectives}
                    moduleTitle={moduleTitle}
                    onModuleTitleChange={setModuleTitle}
                    isCourseEngine={provider === "other"}
                    lessonContext={lessonContext}
                    onLessonContextChange={setLessonContext}
                    contextFileRef={lessonContextFileRef}
                    homeworkText={homeworkText}
                    onHomeworkTextChange={setHomeworkText}
                    homeworkFileRef={homeworkFileRef}
                    lessonError={lessonError}
                    isGeneratingLesson={isGeneratingLesson}
                    onGenerate={handleGenerateLesson}
                  />
                )}
              </div>
            )}

            {manualView === "content" && (
              <div className={styles.card}>
                <ContentTab
                  view={contentView}
                  grading={
                    <GradingTab
                      formAction={formAction}
                      pending={pending}
                      state={state}
                      testState={testState}
                      copiedKey={copiedKey}
                      onCopy={handleCopy}
                      onOpenPreview={handleOpenPreview}
                    />
                  }
                  announcements={<CanvasTab view="announcements" />}
                  inbox={<CanvasTab view="inbox" />}
                />
              </div>
            )}

            {manualView === "version-control" && (
              <div className={styles.card}>
                <VersionControlTab />
              </div>
            )}

            {manualView === "ppt-design" && (
              <div className={styles.card}>
                <PowerPointDesignTab />
              </div>
            )}
          </>
        )}

        {/* Kept mounted at all times so an in-progress recording survives switching
            subtabs or top-level tabs; only shown on Manual > Recording. */}
        <div style={{ display: activeTab === "manual" && manualView === "recording" ? undefined : "none" }}>
          <RecordingTab active={activeTab === "manual" && manualView === "recording"} />
        </div>

        {activeTab === "files" && <FilesTab onOpenWorkflow={openWorkflow} />}

        {activeTab === "workflows" && (
          <>
            <div className={styles.manualSubnav}>
              <div className={styles.lessonInnerTabs} role="tablist" aria-label="Workflows">
                <button
                  type="button"
                  role="tab"
                  aria-selected={workflowsView === "workflows"}
                  className={`${styles.lessonInnerTab}${workflowsView === "workflows" ? ` ${styles.lessonInnerTabActive}` : ""}`}
                  onClick={() => setWorkflowsView("workflows")}
                >
                  Workflows
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={workflowsView === "automations"}
                  className={`${styles.lessonInnerTab}${workflowsView === "automations" ? ` ${styles.lessonInnerTabActive}` : ""}`}
                  onClick={() => setWorkflowsView("automations")}
                >
                  Automations
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={workflowsView === "drafts"}
                  className={`${styles.lessonInnerTab}${workflowsView === "drafts" ? ` ${styles.lessonInnerTabActive}` : ""}`}
                  onClick={() => setWorkflowsView("drafts")}
                >
                  <span className={styles.tabLabelWrap}>
                    Drafts
                    {draftsInbox > 0 && <span className={styles.navBadge}>{draftsInbox}</span>}
                  </span>
                </button>
              </div>
            </div>

            {workflowsView === "workflows" && <WorkflowsTab />}
            {workflowsView === "automations" && (
              <AutomationsTabView onOpenWorkflow={openWorkflow} />
            )}
            {workflowsView === "drafts" && (
              <>
                <div className={styles.manualSubnav}>
                  <div className={styles.lessonInnerTabs} role="tablist" aria-label="Drafts">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={draftsView === "grades"}
                      className={`${styles.lessonInnerTab}${draftsView === "grades" ? ` ${styles.lessonInnerTabActive}` : ""}`}
                      onClick={() => setDraftsView("grades")}
                    >
                      <span className={styles.tabLabelWrap}>
                        Grades
                        {draftsGradesCount > 0 && <span className={styles.navBadge}>{draftsGradesCount}</span>}
                      </span>
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={draftsView === "messages"}
                      className={`${styles.lessonInnerTab}${draftsView === "messages" ? ` ${styles.lessonInnerTabActive}` : ""}`}
                      onClick={() => setDraftsView("messages")}
                    >
                      <span className={styles.tabLabelWrap}>
                        Messages
                        {draftsMessagesCount > 0 && <span className={styles.navBadge}>{draftsMessagesCount}</span>}
                      </span>
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={draftsView === "presentations"}
                      className={`${styles.lessonInnerTab}${draftsView === "presentations" ? ` ${styles.lessonInnerTabActive}` : ""}`}
                      onClick={() => setDraftsView("presentations")}
                    >
                      <span className={styles.tabLabelWrap}>
                        Presentations
                        {draftsPresentationsCount > 0 && <span className={styles.navBadge}>{draftsPresentationsCount}</span>}
                      </span>
                    </button>
                  </div>
                </div>

                {draftsView === "grades" && <DraftedGradesTab onOpenWorkflow={openWorkflow} />}
                {draftsView === "messages" && <MessageDraftsTab onOpenWorkflow={openWorkflow} />}
                {draftsView === "presentations" && <PresentationDraftsTab onOpenWorkflow={openWorkflow} />}
              </>
            )}
          </>
        )}

      </div>

      {lessonPlanPreview && (
        <LessonPlanPreview
          lessonPlanPreview={lessonPlanPreview}
          assignmentPreview={assignmentPreview}
          introPreview={introPreview}
          rubricPreview={rubricPreview}
          examplesPreview={examplesPreview}
          copiedKey={copiedKey}
          onClose={() => setLessonPlanPreview(null)}
          onCopy={handleCopy}
          onSaveField={saveLessonFieldEdit}
          onRegenerate={handleRegenerateLesson}
          onDownload={handleDownloadLessonPlan}
          attachCourses={hubCourses}
          attachBusy={attachBusy}
          attachNote={attachNote}
          onAttach={handleAttachToCourse}
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
    </>
  );
}
