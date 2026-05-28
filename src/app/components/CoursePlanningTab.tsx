"use client";

import type { ChangeEvent, ComponentType } from "react";
import { useRef, useState } from "react";
import {
  parseSyllabusAction,
  generateSyllabusSectionAction,
  generateSyllabusRemainingSectionsAction,
  reviseSyllabusAction,
  assembleSyllabusFromTemplateAction,
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

type CoursePlanningStep = "form" | "preview";

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function replaceSectionsInDocx(
  xml: string,
  sections: SyllabusSection[],
  contents: string[]
): string {
  // Collect all <w:p> paragraph elements and the gaps between them
  const paraRegex = /<w:p[ >][\s\S]*?<\/w:p>/g;
  const paragraphs: string[] = [];
  const gaps: string[] = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;

  while ((m = paraRegex.exec(xml)) !== null) {
    gaps.push(xml.slice(lastIndex, m.index));
    paragraphs.push(m[0]);
    lastIndex = m.index + m[0].length;
  }
  gaps.push(xml.slice(lastIndex));

  const getText = (p: string) => p.replace(/<[^>]+>/g, "").trim();

  const getPPr = (p: string): string => {
    const r = p.match(/<w:pPr>[\s\S]*?<\/w:pPr>/);
    return r ? r[0] : "";
  };

  // Extract run properties from the first run in a paragraph — this carries
  // font name, font size, bold, italic, color, spacing, etc.
  const getRPr = (p: string): string => {
    const runMatch = p.match(/<w:r[ >][\s\S]*?<\/w:r>/);
    if (!runMatch) return "";
    const rPrMatch = runMatch[0].match(/<w:rPr>[\s\S]*?<\/w:rPr>/);
    return rPrMatch ? rPrMatch[0] : "";
  };

  const hasNumPr = (p: string) => /<w:numPr>/.test(p);
  // Matches common AI-generated list markers: -, *, •, 1., a., etc.
  const LIST_MARKER_RE = /^(\s*[-•*]\s+|\s*\d+[.)]\s+|\s*[a-zA-Z][.)]\s+)/;

  // Build a paragraph that faithfully carries both paragraph and run properties
  // from the template, with the supplied text as content.
  const makePara = (pPr: string, rPr: string, text: string): string =>
    `<w:p>${pPr}<w:r>${rPr}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;

  // Map each section heading to the paragraph index that contains it
  const headingIndices = sections.map((s) => {
    const target = s.heading.trim().toLowerCase();
    return paragraphs.findIndex((p) => {
      const t = getText(p).toLowerCase();
      return t === target || t.includes(target);
    });
  });

  const out: string[] = [];
  let cursor = 0;

  for (let i = 0; i < sections.length; i++) {
    const hIdx = headingIndices[i];
    if (hIdx === -1 || hIdx < cursor) continue;

    // Where this section's body ends (start of next found heading)
    const nextHIdx =
      headingIndices.slice(i + 1).find((idx) => idx !== -1 && idx > hIdx) ??
      paragraphs.length;

    // Preserve all paragraphs up to and including the heading
    out.push(...paragraphs.slice(cursor, hIdx + 1));

    const content = contents[i];
    if (content) {
      // Pull paragraph AND run style templates from the section's original body paragraphs
      const bodyParas = paragraphs.slice(hIdx + 1, nextHIdx);
      const listPara = bodyParas.find(hasNumPr);
      const plainPara = bodyParas.find((p) => !hasNumPr(p) && getText(p).length > 0);

      // Fall back to heading paragraph's run properties if body paragraphs are missing
      const headingPara = paragraphs[hIdx];
      const fallbackRPr = getRPr(headingPara);

      const listPPr = listPara ? getPPr(listPara) : "";
      const listRPr = listPara ? (getRPr(listPara) || fallbackRPr) : fallbackRPr;
      const plainPPr = plainPara ? getPPr(plainPara) : "";
      const plainRPr = plainPara ? (getRPr(plainPara) || fallbackRPr) : fallbackRPr;

      for (const rawLine of content.split("\n")) {
        if (rawLine.trim() === "") {
          out.push(makePara(plainPPr, plainRPr, ""));
          continue;
        }
        // Strip any stray list markers the model may have emitted despite instructions,
        // and always render as a plain paragraph using the template's body style.
        const markerMatch = rawLine.match(LIST_MARKER_RE);
        const lineText = markerMatch ? rawLine.slice(markerMatch[0].length) : rawLine;
        out.push(makePara(plainPPr, plainRPr, lineText));
      }
    } else {
      // No generated content — keep the original template body for this section
      out.push(...paragraphs.slice(hIdx + 1, nextHIdx));
    }

    cursor = nextHIdx;
  }

  // Add any remaining paragraphs after the last section
  out.push(...paragraphs.slice(cursor));

  // Preamble XML (header, <w:body>) + paragraphs + closing XML (</w:body>, sectPr, </w:document>)
  return gaps[0] + out.join("") + gaps[gaps.length - 1];
}

function triggerFileDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function buildTextTemplateSyllabus(
  templateText: string,
  sections: SyllabusSection[],
  contents: string[]
): string | null {
  type FoundSection = { headingStart: number; headingEnd: number; sectionIndex: number };
  const found: FoundSection[] = [];
  for (let i = 0; i < sections.length; i++) {
    const idx = templateText.indexOf(sections[i].heading);
    if (idx !== -1) found.push({ headingStart: idx, headingEnd: idx + sections[i].heading.length, sectionIndex: i });
  }
  if (found.length === 0) return null;
  found.sort((a, b) => a.headingStart - b.headingStart);

  let result = "";
  let cursor = 0;
  for (let p = 0; p < found.length; p++) {
    const { headingEnd, sectionIndex } = found[p];
    const nextStart = p + 1 < found.length ? found[p + 1].headingStart : templateText.length;
    const content = contents[sectionIndex];
    result += templateText.slice(cursor, headingEnd);
    result += content ? "\n\n" + content + "\n\n" : templateText.slice(headingEnd, nextStart);
    cursor = nextStart;
  }
  result += templateText.slice(cursor);
  return result;
}

function buildSimpleSyllabus(sections: SyllabusSection[], contents: string[]): string {
  const lines: string[] = [];
  for (let i = 0; i < sections.length; i++) {
    const content = contents[i];
    if (!content) continue;
    const h = sections[i].heading;
    lines.push(h, "=".repeat(h.length), "", content, "", "");
  }
  return lines.join("\n");
}

async function downloadDocxSyllabus(
  fileData: { name: string; base64: string; mimeType: string },
  sections: SyllabusSection[],
  contents: string[],
  baseName: string
): Promise<void> {
  const JSZip = (await import("jszip")).default;
  const binary = atob(fileData.base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const zip = await JSZip.loadAsync(bytes);
  const docFile = zip.file("word/document.xml");
  if (!docFile) throw new Error("Invalid DOCX: missing word/document.xml");

  const modifiedXml = replaceSectionsInDocx(await docFile.async("string"), sections, contents);
  zip.file("word/document.xml", modifiedXml);

  const blob = await zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  triggerFileDownload(blob, `${baseName}_syllabus.docx`);
}

export default function CoursePlanningTab({ copiedKey, onCopy, icons }: CoursePlanningTabProps) {
  const syllabusFileRef = useRef<HTMLInputElement>(null);
  const [courseTitle, setCourseTitle] = useState("");
  const [courseCode, setCourseCode] = useState("");
  const [classTimes, setClassTimes] = useState("");
  const [semester, setSemester] = useState("");
  const [officeHours, setOfficeHours] = useState("");
  const [coursePlanningContext, setCoursePlanningContext] = useState("");
  const [coursePlanningContextFiles, setCoursePlanningContextFiles] = useState<
    Array<{ name: string; base64: string; mimeType: string }>
  >([]);
  const [coursePlanningStep, setCoursePlanningStep] = useState<CoursePlanningStep>("form");
  const [parsedSections, setParsedSections] = useState<SyllabusSection[]>([]);
  const [syllabusTemplateText, setSyllabusTemplateText] = useState("");
  const [sectionContents, setSectionContents] = useState<string[]>([]);
  const [isParsingTemplate, setIsParsingTemplate] = useState(false);
  const [coursePlanningError, setCoursePlanningError] = useState<string | null>(null);
  const [syllabusRevisionPrompt, setSyllabusRevisionPrompt] = useState("");
  const [syllabusRevisionFiles, setSyllabusRevisionFiles] = useState<
    Array<{ name: string; base64: string; mimeType: string }>
  >([]);
  const [lockedSyllabusSections, setLockedSyllabusSections] = useState<boolean[]>([]);
  const [isRevisingSyllabus, setIsRevisingSyllabus] = useState(false);
  const [isDownloadingSyllabus, setIsDownloadingSyllabus] = useState(false);
  const academicCalendarRef = useRef<HTMLInputElement>(null);
  const [academicCalendarFile, setAcademicCalendarFile] = useState<{ name: string; base64: string; mimeType: string } | null>(null);
  const [syllabusFileData, setSyllabusFileData] = useState<{ name: string; base64: string; mimeType: string } | null>(null);

  const getFullContext = () => {
    const parts = [
      courseCode.trim() && `Course Code: ${courseCode.trim()}`,
      semester.trim() && `Semester: ${semester.trim()}`,
      classTimes.trim() && `Class Times & Location: ${classTimes.trim()}`,
      officeHours.trim() && `Office Hours: ${officeHours.trim()}`,
      coursePlanningContext.trim(),
    ].filter(Boolean) as string[];
    return parts.length > 0 ? parts.join("\n") : undefined;
  };

  const getContextFiles = () => [
    ...(academicCalendarFile ? [academicCalendarFile] : []),
    ...coursePlanningContextFiles,
  ];

  const handleAcademicCalendarChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    setAcademicCalendarFile({ name: file.name, base64, mimeType: file.type || "application/octet-stream" });
    e.target.value = "";
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
      setSyllabusFileData({ name: file.name, base64, mimeType: file.type || "application/octet-stream" });
      const parsed = await parseSyllabusAction(
        courseTitle,
        { name: file.name, base64, mimeType: file.type || "application/octet-stream" },
        getFullContext(),
        getContextFiles()
      );
      if ("error" in parsed) { setCoursePlanningError(parsed.error); return; }
      setParsedSections(parsed.sections);
      setSyllabusTemplateText(parsed.templateText);
      setLockedSyllabusSections(new Array(parsed.sections.length).fill(false));
      const result = await generateSyllabusRemainingSectionsAction(
        courseTitle,
        parsed.sections,
        new Array(parsed.sections.length).fill(""),
        0,
        parsed.templateText || undefined,
        getFullContext(),
        getContextFiles()
      );
      if ("error" in result) { setCoursePlanningError(result.error); return; }
      setSectionContents(result.contents);
      setCoursePlanningStep("preview");
    } catch (err) {
      setCoursePlanningError(err instanceof Error ? err.message : "Failed to generate syllabus.");
    } finally {
      setIsParsingTemplate(false);
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
        getFullContext(),
        getContextFiles(),
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

  const handleRegenerateSection = async (i: number, revisionPrompt: string) => {
    setCoursePlanningError(null);
    const completedSections = parsedSections
      .map((s, idx) => ({ heading: s.heading, content: sectionContents[idx] }))
      .filter((s) => s.content);
    const prompt = revisionPrompt.trim()
      ? `${revisionPrompt.trim()}`
      : undefined;
    const sectionWithHint = prompt
      ? { ...parsedSections[i], hint: `${parsedSections[i].hint ?? ""} Additional instruction: ${prompt}`.trim() }
      : parsedSections[i];
    const result = await generateSyllabusSectionAction(
      courseTitle,
      sectionWithHint,
      completedSections.filter((s) => s.heading !== parsedSections[i].heading),
      syllabusTemplateText || undefined,
      getFullContext(),
      getContextFiles()
    );
    if (typeof result === "string") {
      setSectionContents((prev) => {
        const next = [...prev];
        next[i] = result;
        return next;
      });
    } else {
      setCoursePlanningError(result.error);
    }
  };

  const resetCoursePlanning = () => {
    setCoursePlanningStep("form");
    setParsedSections([]);
    setSectionContents([]);
    setCoursePlanningError(null);
    setSyllabusRevisionPrompt("");
    setSyllabusRevisionFiles([]);
    setLockedSyllabusSections([]);
    setSyllabusFileData(null);
  };

  const saveEditSyllabusSection = (i: number, content: string) => {
    setSectionContents((prev) => {
      const next = [...prev];
      next[i] = content;
      return next;
    });
  };

  const handleDownloadSyllabus = async () => {
    setIsDownloadingSyllabus(true);
    try {
      const ext = syllabusFileData?.name.split(".").pop()?.toLowerCase();
      const baseName = courseTitle.replace(/[^a-z0-9]/gi, "_").replace(/_+/g, "_");

      if (syllabusFileData && ext === "docx") {
        await downloadDocxSyllabus(syllabusFileData, parsedSections, sectionContents, baseName);
        return;
      }

      let output: string;
      if (syllabusTemplateText) {
        output = buildTextTemplateSyllabus(syllabusTemplateText, parsedSections, sectionContents)
          ?? buildSimpleSyllabus(parsedSections, sectionContents);
      } else if (syllabusFileData) {
        const result = await assembleSyllabusFromTemplateAction(syllabusFileData, parsedSections, sectionContents);
        output = "error" in result ? buildSimpleSyllabus(parsedSections, sectionContents) : result.text;
      } else {
        output = buildSimpleSyllabus(parsedSections, sectionContents);
      }

      triggerFileDownload(
        new Blob([output], { type: "text/plain;charset=utf-8" }),
        `${baseName}_syllabus.txt`
      );
    } finally {
      setIsDownloadingSyllabus(false);
    }
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
            <label htmlFor="courseCode">Course Code</label>
            <input
              id="courseCode"
              type="text"
              className={styles.textInput}
              placeholder="e.g. CS 101"
              value={courseCode}
              onChange={(e) => setCourseCode(e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="semester">Semester &amp; Year</label>
            <input
              id="semester"
              type="text"
              className={styles.textInput}
              placeholder="e.g. Fall 2026"
              value={semester}
              onChange={(e) => setSemester(e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="classTimes">Class Times &amp; Location</label>
            <input
              id="classTimes"
              type="text"
              className={styles.textInput}
              placeholder="e.g. MWF 9:00–10:00am, Room 204"
              value={classTimes}
              onChange={(e) => setClassTimes(e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="officeHours">Office Hours</label>
            <input
              id="officeHours"
              type="text"
              className={styles.textInput}
              placeholder="e.g. Tuesdays 2–4pm, Office 305"
              value={officeHours}
              onChange={(e) => setOfficeHours(e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="academicCalendar">Academic Calendar</label>
            <div className={styles.fileField}>
              <input
                id="academicCalendar"
                type="file"
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                ref={academicCalendarRef}
                onChange={handleAcademicCalendarChange}
              />
              <p>Upload your institution&apos;s academic calendar (PDF or DOCX) to inform key dates and deadlines.</p>
              {academicCalendarFile && <p>{academicCalendarFile.name}</p>}
            </div>
          </div>
          <div className={styles.field}>
            <label htmlFor="syllabusFile">Syllabus Template</label>
            <div className={styles.fileField}>
              <input id="syllabusFile" type="file" ref={syllabusFileRef} />
              <p>Upload a syllabus template (.txt, .pdf, .docx, etc.) to use as a starting point.</p>
            </div>
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
          {coursePlanningError && <p className={styles.error}>{coursePlanningError}</p>}
          <button
            type="button"
            className={styles.submitButton}
            onClick={handleStartCoursePlanning}
            disabled={isParsingTemplate || !courseTitle.trim()}
          >
            {isParsingTemplate ? "Generating syllabus…" : "Generate Syllabus"}
          </button>
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
          onRegenerateSection={handleRegenerateSection}
          onDownload={handleDownloadSyllabus}
          isDownloadingSyllabus={isDownloadingSyllabus}
          icons={icons}
        />
      )}
    </>
  );
}
