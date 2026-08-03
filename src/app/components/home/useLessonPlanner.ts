"use client";

import { useEffect, useRef, useState } from "react";
import {
  generateLessonPlanAction,
  generateAssignmentAction,
  generateAssignmentRubricAction,
  generateModuleIntroAction,
  generateExamplesAction,
  generateLectureDeckAction,
  listCourseHubAction,
  setCourseMaterialsAction,
} from "../../actions";
import type {
  GenerateLessonPlanResult,
  AssignmentData,
  ModuleIntroData,
  ExamplesData,
} from "../../actions-types";
import { readUploadFile, downloadBase64File } from "../../home-helpers";
import { getStoredProvider, useLlmProvider } from "@/lib/llm-provider";
import { buildSlidesPptx } from "@/lib/pptx";
import { stampDocxAppProperties } from "@/lib/docx";
import { normalizeTypography } from "@/lib/text-normalize";
import { resolveDocumentAuthor } from "@/lib/author";
import { useSupabase } from "@/context/SupabaseProvider";
import { uploadCourseZip, removeCourseZip } from "@/lib/course-files";
import { saveRecordingFile } from "@/lib/recording-files";
import {
  bundleFileBaseName,
  formatExamplesText,
  formatRubricText,
  parseLessonFieldKey,
} from "./lesson-bundle-format";

// The hosted Course Engine runs on Vercel, which caps the request body at
// ~4.5 MB. Reject larger uploads client-side with a clear message rather than
// letting the platform fail the request opaquely.
const COURSE_ENGINE_MAX_UPLOAD_BYTES = 4.5 * 1024 * 1024;

type UploadedFile = { name: string; base64: string; mimeType: string };
type HubCourse = { id: string; name: string; materialsZipPath: string | null };

/**
 * Owns the Manual > Build Courses > Pre Built flow end to end: the form
 * fields, the generated lesson/assignment/rubric/intro/examples previews, the
 * inline edits made to them, and the two things that consume them (download
 * the zip, attach the zip to a course).
 *
 * Extracted out of page.tsx as one unit because every handler here reads or
 * writes the same preview state - buildLessonZip alone touches five of the
 * preview slices - so splitting it further would just turn field reads into
 * parameter threading. The genuinely pure parts (the rubric/examples text
 * formats, the zip's filename, the edit-key parse) are NOT here: they live in
 * lesson-bundle-format.ts, where vitest can actually reach them.
 */
export function useLessonPlanner() {
  const { supabase, user } = useSupabase();
  const [provider] = useLlmProvider();

  const [moduleObjectives, setModuleObjectives] = useState("");
  const [moduleTitle, setModuleTitle] = useState("");
  const [lessonContext, setLessonContext] = useState("");
  const [isGeneratingLesson, setIsGeneratingLesson] = useState(false);
  const [lessonError, setLessonError] = useState<string | null>(null);
  const [lessonPlanPreview, setLessonPlanPreview] = useState<GenerateLessonPlanResult | null>(null);
  const [assignmentPreview, setAssignmentPreview] = useState<AssignmentData | null>(null);
  const [rubricPreview, setRubricPreview] = useState<string | null>(null);
  const [introPreview, setIntroPreview] = useState<ModuleIntroData | null>(null);
  const [examplesPreview, setExamplesPreview] = useState<ExamplesData | null>(null);
  const [savedLessonFiles, setSavedLessonFiles] = useState<UploadedFile[]>([]);
  const lessonContextFileRef = useRef<HTMLInputElement>(null);
  const [homeworkText, setHomeworkText] = useState("");
  const homeworkFileRef = useRef<HTMLInputElement>(null);
  const [savedHomeworkFiles, setSavedHomeworkFiles] = useState<UploadedFile[]>([]);
  const [hubCourses, setHubCourses] = useState<HubCourse[] | null>(null);
  const [attachBusy, setAttachBusy] = useState(false);
  const [attachNote, setAttachNote] = useState<{ kind: "success" | "error"; text: string } | null>(null);

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
      const files: UploadedFile[] = [];
      if (fileList) {
        for (const file of Array.from(fileList)) {
          files.push(await readUploadFile(file));
        }
      }

      setSavedLessonFiles(files);

      const homeworkFileList = homeworkFileRef.current?.files;
      const homeworkFiles: UploadedFile[] = [];
      if (homeworkFileList) {
        for (const file of Array.from(homeworkFileList)) {
          homeworkFiles.push(await readUploadFile(file));
        }
      }
      setSavedHomeworkFiles(homeworkFiles);
      const homework = { text: homeworkText.trim() || undefined, files: homeworkFiles };

      const activeProvider = getStoredProvider();
      const [slideResult, assignmentResult, rubricResult, introResult] = await Promise.all([
        generateLessonPlanAction(moduleObjectives, lessonContext, files, undefined, undefined, activeProvider, homework),
        generateAssignmentAction(moduleObjectives, lessonContext, files, activeProvider),
        generateAssignmentRubricAction(moduleObjectives, lessonContext, activeProvider),
        generateModuleIntroAction(moduleObjectives, lessonContext, activeProvider),
      ]);

      if ("error" in slideResult) {
        setLessonError(slideResult.error);
        return;
      }

      const examplesResult = await generateExamplesAction(
        moduleObjectives,
        lessonContext,
        slideResult.slides,
        activeProvider
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
              new Paragraph({ children: [new TextRun(normalizeTypography(introPreview.overview))] }),
              new Paragraph({ text: "Key Terms", heading: HeadingLevel.HEADING_2 }),
              new Paragraph({ children: [new TextRun(normalizeTypography(introPreview.keyTerms))] }),
            ],
          }],
        });
        introDocxBuffer = await stampDocxAppProperties(await Packer.toArrayBuffer(introDoc));
      }

      let assignmentDocxBuffer: ArrayBuffer | null = null;
      if (assignmentPreview) {
        const assignmentChildren = [
          new Paragraph({ text: `Assignment: ${normalizeTypography(assignmentPreview.title)}`, heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ text: "Overview", heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ children: [new TextRun(normalizeTypography(assignmentPreview.overview))] }),
          new Paragraph({ text: "Steps", heading: HeadingLevel.HEADING_2 }),
          ...assignmentPreview.steps.map((s) => new Paragraph({
            children: [
              new TextRun({ text: `• ${normalizeTypography(s.stepTitle)}`, bold: true }),
              new TextRun({ text: `  ${normalizeTypography(s.description)}` }),
            ],
          })),
          new Paragraph({ text: "Free Tools", heading: HeadingLevel.HEADING_2 }),
          ...assignmentPreview.tools.map((t) => new Paragraph({ children: [new TextRun(`• ${normalizeTypography(t)}`)] })),
          new Paragraph({ text: "Deliverables", heading: HeadingLevel.HEADING_2 }),
          ...assignmentPreview.deliverables.map((d) => new Paragraph({ children: [new TextRun(`• ${normalizeTypography(d)}`)] })),
        ];
        const assignmentDoc = new Document({ creator: author, lastModifiedBy: author, sections: [{ children: assignmentChildren }] });
        assignmentDocxBuffer = await stampDocxAppProperties(await Packer.toArrayBuffer(assignmentDoc));
      }

      const rubricText = formatRubricText(rubricPreview);
      const examplesText = formatExamplesText(examplesPreview);

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

      const safeName = bundleFileBaseName(lessonPlanPreview.presentationTitle);
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
    const target = parseLessonFieldKey(key);
    if (!target) return;
    switch (target.kind) {
      case "lesson-title":
        setLessonPlanPreview((prev) => prev ? { ...prev, presentationTitle: draft } : prev);
        break;
      case "intro-overview":
        setIntroPreview((prev) => prev ? { ...prev, overview: draft } : prev);
        break;
      case "intro-keyTerms":
        setIntroPreview((prev) => prev ? { ...prev, keyTerms: draft } : prev);
        break;
      case "slide": {
        const lines = draft.split("\n");
        const title = lines[0] ?? "";
        const bullets = lines.slice(1).map((l) => l.trim()).filter(Boolean);
        setLessonPlanPreview((prev) => {
          if (!prev) return prev;
          const slides = [...prev.slides];
          // Preserve any example code block on the slide; only title/bullets are
          // editable through this textarea.
          slides[target.index] = { ...slides[target.index], title, bullets };
          return { ...prev, slides };
        });
        break;
      }
      case "assignment-overview":
        setAssignmentPreview((prev) => prev ? { ...prev, overview: draft } : prev);
        break;
      case "assignment-step": {
        const lines = draft.split("\n");
        const stepTitle = lines[0] ?? "";
        const description = lines.slice(1).join("\n").trim();
        setAssignmentPreview((prev) => {
          if (!prev) return prev;
          const steps = [...prev.steps];
          steps[target.index] = { stepTitle, description };
          return { ...prev, steps };
        });
        break;
      }
      case "assignment-tools": {
        const tools = draft.split("\n").map((l) => l.trim()).filter(Boolean);
        setAssignmentPreview((prev) => prev ? { ...prev, tools } : prev);
        break;
      }
      case "assignment-deliverables": {
        const deliverables = draft.split("\n").map((l) => l.trim()).filter(Boolean);
        setAssignmentPreview((prev) => prev ? { ...prev, deliverables } : prev);
        break;
      }
      case "rubric":
        setRubricPreview(draft);
        break;
      case "example-content":
        setExamplesPreview((prev) => {
          if (!prev) return prev;
          const examples = [...prev.examples];
          examples[target.index] = { ...examples[target.index], content: draft };
          return { ...prev, examples };
        });
        break;
      case "example-explanation":
        setExamplesPreview((prev) => {
          if (!prev) return prev;
          const examples = [...prev.examples];
          examples[target.index] = { ...examples[target.index], explanation: draft };
          return { ...prev, examples };
        });
        break;
    }
  };

  return {
    provider,
    // Form fields
    moduleObjectives,
    setModuleObjectives,
    moduleTitle,
    setModuleTitle,
    lessonContext,
    setLessonContext,
    lessonContextFileRef,
    homeworkText,
    setHomeworkText,
    homeworkFileRef,
    // Generation
    isGeneratingLesson,
    lessonError,
    handleGenerateLesson,
    handleRegenerateLesson,
    // Previews
    lessonPlanPreview,
    setLessonPlanPreview,
    assignmentPreview,
    rubricPreview,
    introPreview,
    examplesPreview,
    saveLessonFieldEdit,
    // Delivery
    handleDownloadLessonPlan,
    handleAttachToCourse,
    hubCourses,
    attachBusy,
    attachNote,
  };
}
