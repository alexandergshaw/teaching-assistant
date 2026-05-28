"use client";

import type { ChangeEvent, ComponentType } from "react";
import { useRef, useState } from "react";
import {
  parseSyllabusAction,
  generateSyllabusSectionAction,
  generateSyllabusRemainingSectionsAction,
  reviseSyllabusAction,
  type SyllabusSection,
} from "../actions";
import SyllabusPreviewModal from "./SyllabusPreviewModal";
import styles from "../page.module.css";

type CoursePlanningTabProps = {
  copiedKey: string | null;
  onCopy: (key: string, value: string) => Promise<void>;
  icons: {
    CopyIcon: ComponentType;
    LockClosedIcon: ComponentType;
    LockOpenIcon: ComponentType;
    PencilIcon: ComponentType;
  };
};

type CoursePlanningStep = "form" | "wizard" | "preview";

export default function CoursePlanningTab({ copiedKey, onCopy, icons }: CoursePlanningTabProps) {
  const syllabusFileRef = useRef<HTMLInputElement>(null);
  const [courseTitle, setCourseTitle] = useState("");
  const [coursePlanningContext, setCoursePlanningContext] = useState("");
  const [coursePlanningContextFiles, setCoursePlanningContextFiles] = useState<
    Array<{ name: string; base64: string; mimeType: string }>
  >([]);
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
  const [syllabusRevisionFiles, setSyllabusRevisionFiles] = useState<
    Array<{ name: string; base64: string; mimeType: string }>
  >([]);
  const [lockedSyllabusSections, setLockedSyllabusSections] = useState<boolean[]>([]);
  const [isRevisingSyllabus, setIsRevisingSyllabus] = useState(false);

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
      const result = await parseSyllabusAction(
        courseTitle,
        { name: file.name, base64, mimeType: file.type || "application/octet-stream" },
        coursePlanningContext.trim() || undefined,
        coursePlanningContextFiles
      );
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

  const handleSyllabusRevisionFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
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

  const saveEditSyllabusSection = (i: number, content: string) => {
    setSectionContents((prev) => {
      const next = [...prev];
      next[i] = content;
      return next;
    });
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

  return (
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

      {coursePlanningStep === "preview" && (
        <SyllabusPreviewModal
          courseTitle={courseTitle}
          parsedSections={parsedSections}
          sectionContents={sectionContents}
          copiedKey={copiedKey}
          lockedSyllabusSections={lockedSyllabusSections}
          coursePlanningError={coursePlanningError}
          syllabusRevisionPrompt={syllabusRevisionPrompt}
          revisionFileCount={syllabusRevisionFiles.length}
          isRevisingSyllabus={isRevisingSyllabus}
          onClose={resetCoursePlanning}
          onCopy={onCopy}
          onToggleLock={(i) =>
            setLockedSyllabusSections((prev) => {
              const next = [...prev];
              next[i] = !next[i];
              return next;
            })
          }
          onSaveSection={saveEditSyllabusSection}
          onRevisionFileChange={handleSyllabusRevisionFileChange}
          onRevisionPromptChange={setSyllabusRevisionPrompt}
          onRevise={handleReviseSyllabus}
          onDownload={handleDownloadSyllabus}
          icons={icons}
        />
      )}
    </>
  );
}
