"use client";

import type { ChangeEvent, ComponentType } from "react";
import { useRef, useState, useEffect } from "react";
import {
  parseSyllabusAction,
  generateSyllabusSectionAction,
  generateSyllabusRemainingSectionsAction,
  reviseSyllabusAction,
  assembleSyllabusFromTemplateAction,
  generateCourseScheduleAction,
  generateCopilotProjectPromptAction,
  analyzeSyllabusInputsAction,
  regenerateSyllabusFieldAction,
  buildAdaptedSyllabusAction,
  type SyllabusSection,
  type CourseScheduleRow,
  type SyllabusInputField,
  type SyllabusCourseInfo,
} from "../actions";
import SyllabusPreviewModal from "./SyllabusPreviewModal";
import LecturePlanningTab from "./LecturePlanningTab";
import { getStoredProvider } from "@/lib/llm-provider";
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
type PlanningMode = "syllabus" | "schedule" | "project" | "lecture";

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
    const bodyParas = paragraphs.slice(hIdx + 1, nextHIdx);
    if (content) {
      const lines = content.split("\n");
      for (let j = 0; j < bodyParas.length; j++) {
        const p = bodyParas[j];
        if (j < lines.length) {
          // Replace only the first <w:t> in the paragraph, keep all formatting/structure
          const text = escapeXml(lines[j]);
          const replaced = p.replace(/<w:t[\s\S]*?<\/w:t>/, `<w:t xml:space=\"preserve\">${text}</w:t>`);
          out.push(replaced);
        } else {
          // No more content lines, keep template paragraph as-is
          out.push(p);
        }
      }
    } else {
      // No generated content — keep the original template body for this section
      out.push(...bodyParas);
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

// Local storage keys for the course-planning form fields. Module-level so the
// hydration/persistence effects can reference them without them counting as
// reactive dependencies.
const LS_KEYS = {
  courseTitle: "syllabus_courseTitle",
  courseCode: "syllabus_courseCode",
  classTimes: "syllabus_classTimes",
  semester: "syllabus_semester",
  officeHours: "syllabus_officeHours",
  coursePlanningContext: "syllabus_coursePlanningContext",
  latePolicy: "syllabus_latePolicy",
  attendancePolicy: "syllabus_attendancePolicy",
  planningMode: "coursePlanning_planningMode",
  courseDescription: "schedule_courseDescription",
  scheduleTerm: "schedule_scheduleTerm",
  scheduleStartDate: "schedule_scheduleStartDate",
  scheduleWeeks: "schedule_scheduleWeeks",
  scheduleTests: "schedule_scheduleTests",
};

export default function CoursePlanningTab({ copiedKey, onCopy, icons }: CoursePlanningTabProps) {
  const syllabusFileRef = useRef<HTMLInputElement>(null);
  const [courseTitle, setCourseTitle] = useState("");
  const [courseCode, setCourseCode] = useState("");
  const [classTimes, setClassTimes] = useState("");
  const [semester, setSemester] = useState("");
  const [officeHours, setOfficeHours] = useState("");
  const [coursePlanningContext, setCoursePlanningContext] = useState("");
  const [latePolicy, setLatePolicy] = useState("");
  const [attendancePolicy, setAttendancePolicy] = useState("");

  // Planning mode toggle
  const [planningMode, setPlanningMode] = useState<PlanningMode>("syllabus");

  // Course schedule state
  const [courseDescription, setCourseDescription] = useState("");
  const [scheduleTerm, setScheduleTerm] = useState("");
  const [scheduleStartDate, setScheduleStartDate] = useState("");
  const [scheduleWeeks, setScheduleWeeks] = useState("");
  const [scheduleTests, setScheduleTests] = useState("");
  const [scheduleRows, setScheduleRows] = useState<CourseScheduleRow[]>([]);
  const [isGeneratingSchedule, setIsGeneratingSchedule] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [scheduleGenerated, setScheduleGenerated] = useState(false);

  // Course project planning state
  const projectFileRef = useRef<HTMLInputElement>(null);
  const [projectFileName, setProjectFileName] = useState<string | null>(null);
  const [projectFileContent, setProjectFileContent] = useState<string | null>(null);
  const [isGeneratingProjectPrompt, setIsGeneratingProjectPrompt] = useState(false);
  const [projectPrompt, setProjectPrompt] = useState<string | null>(null);
  const [projectError, setProjectError] = useState<string | null>(null);


  useEffect(() => {
    // One-time hydration of editable form fields from localStorage. This must
    // run client-only (in an effect) so the server-rendered defaults match the
    // first client render; a lazy useState initializer would read localStorage
    // during hydration and cause an SSR mismatch. Hence the rule is suppressed.
    /* eslint-disable react-hooks/set-state-in-effect */
    setCourseTitle(localStorage.getItem(LS_KEYS.courseTitle) || "");
    setCourseCode(localStorage.getItem(LS_KEYS.courseCode) || "");
    setClassTimes(localStorage.getItem(LS_KEYS.classTimes) || "");
    setSemester(localStorage.getItem(LS_KEYS.semester) || "");
    setOfficeHours(localStorage.getItem(LS_KEYS.officeHours) || "");
    setCoursePlanningContext(localStorage.getItem(LS_KEYS.coursePlanningContext) || "");
    setLatePolicy(localStorage.getItem(LS_KEYS.latePolicy) || "");
    setAttendancePolicy(localStorage.getItem(LS_KEYS.attendancePolicy) || "");
    const savedMode = localStorage.getItem(LS_KEYS.planningMode);
    if (savedMode === "syllabus" || savedMode === "schedule" || savedMode === "project" || savedMode === "lecture") {
      setPlanningMode(savedMode);
    }
    setCourseDescription(localStorage.getItem(LS_KEYS.courseDescription) || "");
    setScheduleTerm(localStorage.getItem(LS_KEYS.scheduleTerm) || "");
    setScheduleStartDate(localStorage.getItem(LS_KEYS.scheduleStartDate) || "");
    setScheduleWeeks(localStorage.getItem(LS_KEYS.scheduleWeeks) || "");
    setScheduleTests(localStorage.getItem(LS_KEYS.scheduleTests) || "");
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);
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
  const [syllabusFileData, setSyllabusFileData] = useState<{ name: string; base64: string; mimeType: string } | null>(null);

  // ── Adapt an existing syllabus from a codebase (the Syllabus subtab flow) ──
  const adaptSyllabusRef = useRef<HTMLInputElement>(null);
  const adaptZipRef = useRef<HTMLInputElement>(null);
  const [adaptSyllabusBase64, setAdaptSyllabusBase64] = useState<string | null>(null);
  const [adaptSyllabusName, setAdaptSyllabusName] = useState("");
  const [adaptFields, setAdaptFields] = useState<SyllabusInputField[] | null>(null);
  const [adaptValues, setAdaptValues] = useState<Record<string, string>>({});
  const [adaptStatus, setAdaptStatus] = useState<"idle" | "analyzing" | "building">("idle");
  const [adaptError, setAdaptError] = useState<string | null>(null);
  // Instructor-provided course facts (asked for; not assumed across syllabi).
  const [adaptStartDate, setAdaptStartDate] = useState("");
  const [adaptMeetingDays, setAdaptMeetingDays] = useState("");
  const [adaptMeetingTimes, setAdaptMeetingTimes] = useState("");
  const [adaptLocation, setAdaptLocation] = useState("");
  // The full paragraph list + codebase summary, for the live preview and per-field regenerate.
  const [adaptParagraphs, setAdaptParagraphs] = useState<Array<{ id: string; text: string }>>([]);
  const [adaptCodebaseSummary, setAdaptCodebaseSummary] = useState("");
  const [adaptRegenId, setAdaptRegenId] = useState<string | null>(null);
  const [adaptShowPreview, setAdaptShowPreview] = useState(false);
  const adaptFieldIds = new Set((adaptFields ?? []).map((f) => f.paragraphId));

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
    ...coursePlanningContextFiles,
  ];

  const handleGenerateSchedule = async () => {
    if (!courseDescription.trim()) {
      setScheduleError("Please enter a course description.");
      return;
    }
    if (!scheduleTerm.trim()) {
      setScheduleError("Please enter the term (e.g. Fall 2026).");
      return;
    }
    if (!scheduleStartDate) {
      setScheduleError("Please select the course start date.");
      return;
    }
    const weeks = parseInt(scheduleWeeks, 10);
    if (!weeks || weeks < 1 || weeks > 52) {
      setScheduleError("Please enter a valid number of weeks (1–52).");
      return;
    }
    const tests = parseInt(scheduleTests, 10);
    if (isNaN(tests) || tests < 0) {
      setScheduleError("Please enter a valid number of tests (0 or more).");
      return;
    }
    setIsGeneratingSchedule(true);
    setScheduleError(null);
    try {
      const result = await generateCourseScheduleAction(
        courseDescription.trim(),
        scheduleTerm.trim(),
        scheduleStartDate,
        weeks,
        tests,
        getStoredProvider()
      );
      if ("error" in result) {
        setScheduleError(result.error);
        return;
      }
      setScheduleRows(result.rows);
      setScheduleGenerated(true);
    } catch (err) {
      setScheduleError(err instanceof Error ? err.message : "Failed to generate schedule.");
    } finally {
      setIsGeneratingSchedule(false);
    }
  };

  const resetSchedule = () => {
    setScheduleGenerated(false);
    setScheduleRows([]);
    setScheduleError(null);
  };

  const handleExportScheduleCsv = () => {
    const header = ["Week", "Dates", "Topics", "Assignment"];
    const escapeCell = (val: string) => `"${val.replace(/"/g, '""')}"`;
    const rows = [
      header.join(","),
      ...scheduleRows.map((r) =>
        [String(r.week), escapeCell(r.dates), escapeCell(r.topics), escapeCell(r.assignment)].join(",")
      ),
    ];
    const courseName = courseDescription.split("\n")[0].trim().slice(0, 60);
    const sanitized = courseName.replace(/[^a-z0-9]/gi, "_").replace(/_+/g, "_").replace(/^_|_$/g, "") || "course";
    triggerFileDownload(
      new Blob([rows.join("\r\n")], { type: "text/csv;charset=utf-8" }),
      `${sanitized}_schedule.csv`
    );
  };

  const handleProjectFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProjectFileName(file.name);
    setProjectPrompt(null);
    setProjectError(null);
    const reader = new FileReader();
    reader.onload = () => setProjectFileContent(reader.result as string);
    reader.onerror = () => setProjectError("Failed to read file.");
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleGenerateProjectPrompt = async () => {
    if (!projectFileContent || !projectFileName) {
      setProjectError("Please upload a schedule file first.");
      return;
    }
    setIsGeneratingProjectPrompt(true);
    setProjectError(null);
    setProjectPrompt(null);
    try {
      const promptResult = await generateCopilotProjectPromptAction(projectFileContent, projectFileName, getStoredProvider());
      if ("error" in promptResult) {
        setProjectError(promptResult.error);
      } else {
        setProjectPrompt(promptResult.prompt);
      }
    } catch (err) {
      setProjectError(err instanceof Error ? err.message : "Failed to generate prompt.");
    } finally {
      setIsGeneratingProjectPrompt(false);
    }
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

  const readFileBase64 = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  // Analyze the former syllabus + optional codebase zip; AI returns the
  // class-specific fields, each pre-filled with a suggested value.
  const handleAnalyzeSyllabus = async () => {
    const syllabusFile = adaptSyllabusRef.current?.files?.[0];
    if (!syllabusFile) {
      setAdaptError("Upload the former syllabus (.docx) first.");
      return;
    }
    if (!/\.docx$/i.test(syllabusFile.name)) {
      setAdaptError("The former syllabus must be a Word .docx file.");
      return;
    }
    const zipFile = adaptZipRef.current?.files?.[0] ?? null;
    setAdaptStatus("analyzing");
    setAdaptError(null);
    setAdaptFields(null);
    try {
      const syllabusBase64 = await readFileBase64(syllabusFile);
      const zipBase64 = zipFile ? await readFileBase64(zipFile) : null;
      setAdaptSyllabusBase64(syllabusBase64);
      setAdaptSyllabusName(syllabusFile.name);
      const result = await analyzeSyllabusInputsAction(
        { name: syllabusFile.name, base64: syllabusBase64 },
        zipBase64,
        adaptCourseInfo(),
        getStoredProvider()
      );
      if ("error" in result) {
        setAdaptError(result.error);
        return;
      }
      setAdaptFields(result.fields);
      setAdaptValues(Object.fromEntries(result.fields.map((f) => [f.paragraphId, f.suggestedText])));
      setAdaptParagraphs(result.paragraphs);
      setAdaptCodebaseSummary(result.codebaseSummary);
    } catch (err) {
      setAdaptError(err instanceof Error ? err.message : "Failed to analyze the syllabus.");
    } finally {
      setAdaptStatus("idle");
    }
  };

  const adaptCourseInfo = (): SyllabusCourseInfo => ({
    startDate: adaptStartDate.trim() || undefined,
    meetingDays: adaptMeetingDays.trim() || undefined,
    meetingTimes: adaptMeetingTimes.trim() || undefined,
    location: adaptLocation.trim() || undefined,
  });

  // Regenerate the text of one field with AI, leaving the others untouched.
  const handleRegenerateField = async (field: SyllabusInputField) => {
    setAdaptRegenId(field.paragraphId);
    setAdaptError(null);
    try {
      const result = await regenerateSyllabusFieldAction(
        { label: field.label, currentText: field.currentText },
        adaptCodebaseSummary,
        adaptCourseInfo(),
        getStoredProvider()
      );
      if ("error" in result) {
        setAdaptError(result.error);
        return;
      }
      setAdaptValues((prev) => ({ ...prev, [field.paragraphId]: result.text }));
    } catch (err) {
      setAdaptError(err instanceof Error ? err.message : "Failed to regenerate the field.");
    } finally {
      setAdaptRegenId(null);
    }
  };

  // Write the instructor's values into the original .docx in place (only the
  // class-specific paragraphs change) and download the result.
  const handleBuildAdaptedSyllabus = async () => {
    if (!adaptSyllabusBase64 || !adaptFields) return;
    // Write any paragraph whose value differs from the original — this covers the
    // AI-flagged fields and any edits made directly in the preview.
    const edits: Record<string, string> = {};
    for (const p of adaptParagraphs) {
      const value = adaptValues[p.id];
      if (value !== undefined && value !== p.text) edits[p.id] = value;
    }
    setAdaptStatus("building");
    setAdaptError(null);
    try {
      const result = await buildAdaptedSyllabusAction(adaptSyllabusBase64, edits);
      if ("error" in result) {
        setAdaptError(result.error);
        return;
      }
      const bytes = Uint8Array.from(atob(result.base64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
      const baseName = adaptSyllabusName.replace(/\.docx$/i, "") || "syllabus";
      triggerFileDownload(blob, `${baseName}_adapted.docx`);
    } catch (err) {
      setAdaptError(err instanceof Error ? err.message : "Failed to build the syllabus.");
    } finally {
      setAdaptStatus("idle");
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
      setSyllabusFileData({ name: file.name, base64, mimeType: file.type || "application/octet-stream" });
      const parsed = await parseSyllabusAction(
        courseTitle,
        { name: file.name, base64, mimeType: file.type || "application/octet-stream" },
        getFullContext(),
        getContextFiles(),
        getStoredProvider()
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
        getContextFiles(),
        getStoredProvider()
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
        lockedSyllabusSections,
        getStoredProvider()
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
      getContextFiles(),
      getStoredProvider()
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
        const result = await assembleSyllabusFromTemplateAction(syllabusFileData, parsedSections, sectionContents, getStoredProvider());
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
            <h1>New Build Courses</h1>
            <p>Build a syllabus or generate a weekly course schedule with the help of AI.</p>
          </div>

          {/* Mode toggle */}
          <div className={styles.scheduleModeToggle}>
            <button
              type="button"
              className={`${styles.scheduleModeBtn}${planningMode === "schedule" ? ` ${styles.active}` : ""}`}
              onClick={() => { setPlanningMode("schedule"); localStorage.setItem(LS_KEYS.planningMode, "schedule"); }}
            >
              Course Schedule
            </button>
            <button
              type="button"
              className={`${styles.scheduleModeBtn}${planningMode === "project" ? ` ${styles.active}` : ""}`}
              onClick={() => { setPlanningMode("project"); localStorage.setItem(LS_KEYS.planningMode, "project"); }}
            >
              Course Project Planning
            </button>
            <button
              type="button"
              className={`${styles.scheduleModeBtn}${planningMode === "lecture" ? ` ${styles.active}` : ""}`}
              onClick={() => { setPlanningMode("lecture"); localStorage.setItem(LS_KEYS.planningMode, "lecture"); }}
            >
              Lecture Planning
            </button>
            <button
              type="button"
              className={`${styles.scheduleModeBtn}${planningMode === "syllabus" ? ` ${styles.active}` : ""}`}
              onClick={() => { setPlanningMode("syllabus"); localStorage.setItem(LS_KEYS.planningMode, "syllabus"); }}
            >
              Syllabus
            </button>
          </div>

          {/* ── Syllabus mode: adapt an existing syllabus from a codebase ── */}
          {planningMode === "syllabus" && (
            <>
              <p style={{ marginTop: 0, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                Upload a previous offering&apos;s syllabus and (optionally) a zip of the course&apos;s codebase.
                The AI finds the class-specific parts that need your input, you confirm or edit them, and the new
                syllabus is written back into the original Word file — so its formatting matches exactly.
              </p>

              <div className={styles.field}>
                <label htmlFor="adaptSyllabusFile">Former syllabus (.docx)</label>
                <div className={styles.fileField}>
                  <input id="adaptSyllabusFile" type="file" accept=".docx" ref={adaptSyllabusRef} />
                  <p>Word .docx only. The new syllabus keeps its exact formatting; only class-specific text changes.</p>
                </div>
              </div>

              <div className={styles.field}>
                <label htmlFor="adaptZipFile">Course codebase (.zip, optional)</label>
                <div className={styles.fileField}>
                  <input id="adaptZipFile" type="file" accept=".zip" ref={adaptZipRef} />
                  <p>Optional. A zip of the course&apos;s codebase so the AI can suggest accurate, class-specific values.</p>
                </div>
              </div>

              <div className={styles.field}>
                <label htmlFor="adaptStartDate">Course start date</label>
                <input
                  id="adaptStartDate"
                  type="date"
                  className={styles.textInput}
                  value={adaptStartDate}
                  onChange={(e) => setAdaptStartDate(e.target.value)}
                />
                <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", margin: "4px 0 0" }}>
                  Include the year — used to compute the schedule. Not assumed from the old syllabus.
                </p>
              </div>
              <div className={styles.field}>
                <label htmlFor="adaptMeetingDays">Meeting days</label>
                <input
                  id="adaptMeetingDays"
                  type="text"
                  className={styles.textInput}
                  placeholder="e.g. Mon / Wed / Fri"
                  value={adaptMeetingDays}
                  onChange={(e) => setAdaptMeetingDays(e.target.value)}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="adaptMeetingTimes">Meeting times</label>
                <input
                  id="adaptMeetingTimes"
                  type="text"
                  className={styles.textInput}
                  placeholder="e.g. 9:00–10:15am"
                  value={adaptMeetingTimes}
                  onChange={(e) => setAdaptMeetingTimes(e.target.value)}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="adaptLocation">Meeting location</label>
                <input
                  id="adaptLocation"
                  type="text"
                  className={styles.textInput}
                  placeholder="e.g. Room 204, Science Hall"
                  value={adaptLocation}
                  onChange={(e) => setAdaptLocation(e.target.value)}
                />
              </div>

              {adaptError && <p className={styles.error}>{adaptError}</p>}

              <button
                type="button"
                className={styles.submitButton}
                onClick={handleAnalyzeSyllabus}
                disabled={adaptStatus !== "idle"}
              >
                {adaptStatus === "analyzing" ? "Analyzing…" : adaptFields ? "Re-analyze" : "Analyze syllabus"}
              </button>

              {adaptFields && adaptFields.length > 0 && (
                <>
                  <p style={{ marginTop: 22, fontWeight: 600 }}>
                    {adaptFields.length} class-specific section{adaptFields.length === 1 ? "" : "s"} to confirm
                  </p>
                  {adaptFields.map((f) => {
                    const value = adaptValues[f.paragraphId] ?? "";
                    return (
                      <div key={f.paragraphId} className={styles.field}>
                        <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                          <span>{f.label}</span>
                          <button
                            type="button"
                            onClick={() => handleRegenerateField(f)}
                            disabled={adaptRegenId !== null}
                            style={{
                              fontSize: "0.78rem",
                              fontWeight: 600,
                              color: "var(--accent)",
                              background: "transparent",
                              border: "1px solid var(--field-border)",
                              borderRadius: 8,
                              padding: "3px 10px",
                              cursor: adaptRegenId !== null ? "default" : "pointer",
                              opacity: adaptRegenId !== null && adaptRegenId !== f.paragraphId ? 0.5 : 1,
                            }}
                          >
                            {adaptRegenId === f.paragraphId ? "Regenerating…" : "Regenerate"}
                          </button>
                        </label>
                        <textarea
                          className={styles.textInput}
                          rows={Math.max(2, Math.min(8, Math.round(value.length / 70) + 1))}
                          value={value}
                          onChange={(e) =>
                            setAdaptValues((prev) => ({ ...prev, [f.paragraphId]: e.target.value }))
                          }
                        />
                        {f.currentText && f.currentText !== value && (
                          <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", margin: "4px 0 0" }}>
                            Original: {f.currentText}
                          </p>
                        )}
                      </div>
                    );
                  })}

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
                    <button
                      type="button"
                      className={styles.submitButton}
                      onClick={() => setAdaptShowPreview((v) => !v)}
                    >
                      {adaptShowPreview ? "Hide preview" : "Preview syllabus"}
                    </button>
                    <button
                      type="button"
                      className={styles.submitButton}
                      onClick={handleBuildAdaptedSyllabus}
                      disabled={adaptStatus !== "idle"}
                    >
                      {adaptStatus === "building" ? "Building…" : "Download adapted syllabus (.docx)"}
                    </button>
                  </div>

                  {adaptShowPreview && (
                    <div
                      style={{
                        marginTop: 14,
                        padding: "22px 26px",
                        border: "1px solid var(--field-border)",
                        borderRadius: 12,
                        background: "#ffffff",
                        maxHeight: "60vh",
                        overflowY: "auto",
                      }}
                    >
                      <p style={{ margin: "0 0 12px", fontSize: "0.8rem", color: "#6b7280" }}>
                        Editable preview — click any line to change it. Highlighted lines are the AI-identified
                        class-specific sections. Edits here are included when you download.
                      </p>
                      {adaptParagraphs.map((p) => {
                        const isField = adaptFieldIds.has(p.id);
                        const value = adaptValues[p.id] ?? p.text;
                        return (
                          <textarea
                            key={p.id}
                            value={value}
                            onChange={(e) => setAdaptValues((prev) => ({ ...prev, [p.id]: e.target.value }))}
                            rows={Math.max(1, Math.ceil(value.length / 95))}
                            style={{
                              display: "block",
                              width: "100%",
                              border: "none",
                              outline: "none",
                              resize: "vertical",
                              background: isField ? "rgba(37, 99, 235, 0.08)" : "transparent",
                              color: "#1f2933",
                              font: "inherit",
                              fontSize: "0.95rem",
                              lineHeight: 1.5,
                              padding: isField ? "4px 6px" : "2px 0",
                              margin: "0 0 6px",
                              borderRadius: 4,
                            }}
                          />
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* ── Course Schedule mode ── */}
          {planningMode === "schedule" && !scheduleGenerated && (
            <>
              <div className={styles.field}>
                <label htmlFor="courseDescription">Course Description</label>
                <textarea
                  id="courseDescription"
                  className={styles.textInput}
                  placeholder="Describe the course — its topics, goals, and audience."
                  value={courseDescription}
                  onChange={(e) => { setCourseDescription(e.target.value); localStorage.setItem(LS_KEYS.courseDescription, e.target.value); }}
                  rows={4}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="scheduleTerm">Term</label>
                <input
                  id="scheduleTerm"
                  type="text"
                  className={styles.textInput}
                  placeholder="e.g. Fall 2026"
                  value={scheduleTerm}
                  onChange={(e) => { setScheduleTerm(e.target.value); localStorage.setItem(LS_KEYS.scheduleTerm, e.target.value); }}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="scheduleStartDate">Course Start Date</label>
                <input
                  id="scheduleStartDate"
                  type="date"
                  className={styles.textInput}
                  value={scheduleStartDate}
                  onChange={(e) => { setScheduleStartDate(e.target.value); localStorage.setItem(LS_KEYS.scheduleStartDate, e.target.value); }}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="scheduleWeeks">Number of Weeks</label>
                <input
                  id="scheduleWeeks"
                  type="number"
                  className={styles.textInput}
                  placeholder="e.g. 15"
                  min={1}
                  max={52}
                  value={scheduleWeeks}
                  onChange={(e) => { setScheduleWeeks(e.target.value); localStorage.setItem(LS_KEYS.scheduleWeeks, e.target.value); }}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="scheduleTests">Number of Tests</label>
                <input
                  id="scheduleTests"
                  type="number"
                  className={styles.textInput}
                  placeholder="e.g. 3"
                  min={0}
                  value={scheduleTests}
                  onChange={(e) => { setScheduleTests(e.target.value); localStorage.setItem(LS_KEYS.scheduleTests, e.target.value); }}
                />
              </div>
              {scheduleError && <p className={styles.error}>{scheduleError}</p>}
              <button
                type="button"
                className={styles.submitButton}
                onClick={handleGenerateSchedule}
                disabled={isGeneratingSchedule || !courseDescription.trim() || !scheduleTerm.trim() || !scheduleStartDate || !scheduleWeeks || !scheduleTests}
              >
                {isGeneratingSchedule ? "Generating schedule…" : "Generate Schedule"}
              </button>
            </>
          )}

          {/* ── Schedule result table ── */}
          {planningMode === "schedule" && scheduleGenerated && (
            <>
              <div className={styles.courseScheduleWrap}>
                <table className={styles.courseScheduleTable}>
                  <thead>
                    <tr>
                      <th>Week</th>
                      <th>Dates</th>
                      <th>Topics</th>
                      <th>Assignment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scheduleRows.map((row) => (
                      <tr key={row.week}>
                        <td>{row.week}</td>
                        <td>{row.dates}</td>
                        <td>{row.topics}</td>
                        <td>{row.assignment}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className={styles.scheduleActions}>
                <button
                  type="button"
                  className={styles.submitButton}
                  onClick={resetSchedule}
                >
                  Edit &amp; Regenerate
                </button>
                <button
                  type="button"
                  className={styles.submitButton}
                  onClick={handleExportScheduleCsv}
                >
                  Export CSV
                </button>
              </div>
            </>
          )}

          {/* ── Course Project Planning mode ── */}
          {planningMode === "project" && (
            <>
              <div className={styles.field}>
                <label htmlFor="projectFile">Upload Schedule File</label>
                <div className={styles.fileField}>
                  <input
                    id="projectFile"
                    type="file"
                    accept=".csv,.txt,text/csv,text/plain"
                    ref={projectFileRef}
                    onChange={handleProjectFileChange}
                  />
                  <p>Upload a CSV or text file containing your course schedule (topics and assignments).</p>
                  {projectFileName && <p>Selected: {projectFileName}</p>}
                </div>
              </div>
              {projectError && <p className={styles.error}>{projectError}</p>}
              <button
                type="button"
                className={styles.submitButton}
                onClick={handleGenerateProjectPrompt}
                disabled={isGeneratingProjectPrompt || !projectFileContent}
              >
                {isGeneratingProjectPrompt ? "Generating prompt…" : "Generate Copilot Prompt"}
              </button>
              {projectPrompt && (
                <div className={styles.field}>
                  <label>GitHub Copilot Prompt</label>
                  <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", marginBottom: 8 }}>
                    Copy the prompt below and paste it into GitHub Copilot (Agent mode) to scaffold a project covering all schedule topics.
                  </p>
                  <textarea
                    className={styles.textInput}
                    value={projectPrompt}
                    readOnly
                    rows={20}
                    style={{ fontFamily: "monospace", fontSize: "0.85rem" }}
                  />
                  <button
                    type="button"
                    className={styles.submitButton}
                    style={{ marginTop: 8 }}
                    onClick={() => void navigator.clipboard.writeText(projectPrompt)}
                  >
                    Copy to Clipboard
                  </button>
                </div>
              )}
            </>
          )}

          {planningMode === "lecture" && (
            <LecturePlanningTab />
          )}
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
