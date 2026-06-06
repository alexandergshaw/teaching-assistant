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
  type SyllabusSection,
  type CourseScheduleRow,
} from "../actions";
import { saveEndToEndCourseAction } from "../courseActions";
import SyllabusPreviewModal from "./SyllabusPreviewModal";
import LecturePlanningTab from "./LecturePlanningTab";
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
type PlanningMode = "syllabus" | "schedule" | "project" | "lecture" | "e2e";

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

  // Build a body paragraph using the template's exact paragraph and run properties.
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
    const bodyParas = paragraphs.slice(hIdx + 1, nextHIdx);
    if (content) {
      const lines = content.split("\n");
      for (let j = 0; j < bodyParas.length; j++) {
        const p = bodyParas[j];
        if (j < lines.length) {
          // Replace only the first <w:t> in the paragraph, keep all formatting/structure
          const text = escapeXml(lines[j]);
          let replaced = p.replace(/<w:t[\s\S]*?<\/w:t>/, `<w:t xml:space=\"preserve\">${text}</w:t>`);
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

  // End to End tab state
  const [e2eCourseName, setE2eCourseName] = useState("");
  const [e2eCourseDescription, setE2eCourseDescription] = useState("");
  const [e2eScheduleTerm, setE2eScheduleTerm] = useState("");
  const [e2eScheduleStartDate, setE2eScheduleStartDate] = useState("");
  const [e2eScheduleWeeks, setE2eScheduleWeeks] = useState("");
  const [e2eScheduleTests, setE2eScheduleTests] = useState("");
  const [e2eRows, setE2eRows] = useState<CourseScheduleRow[]>([]);
  const [isGeneratingE2e, setIsGeneratingE2e] = useState(false);
  const [e2eError, setE2eError] = useState<string | null>(null);
  const [e2eGenerated, setE2eGenerated] = useState(false);
  const [e2eCopilotPrompt, setE2eCopilotPrompt] = useState<string | null>(null);
  const [e2eSaveStatus, setE2eSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [e2eSaveError, setE2eSaveError] = useState<string | null>(null);

  // Local storage keys
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
    e2eCourseName: "e2e_courseName",
    e2eCourseDescription: "e2e_courseDescription",
    e2eScheduleTerm: "e2e_scheduleTerm",
    e2eScheduleStartDate: "e2e_scheduleStartDate",
    e2eScheduleWeeks: "e2e_scheduleWeeks",
    e2eScheduleTests: "e2e_scheduleTests",
  };

  useEffect(() => {
    setCourseTitle(localStorage.getItem(LS_KEYS.courseTitle) || "");
    setCourseCode(localStorage.getItem(LS_KEYS.courseCode) || "");
    setClassTimes(localStorage.getItem(LS_KEYS.classTimes) || "");
    setSemester(localStorage.getItem(LS_KEYS.semester) || "");
    setOfficeHours(localStorage.getItem(LS_KEYS.officeHours) || "");
    setCoursePlanningContext(localStorage.getItem(LS_KEYS.coursePlanningContext) || "");
    setLatePolicy(localStorage.getItem(LS_KEYS.latePolicy) || "");
    setAttendancePolicy(localStorage.getItem(LS_KEYS.attendancePolicy) || "");
    const savedMode = localStorage.getItem(LS_KEYS.planningMode);
    if (savedMode === "syllabus" || savedMode === "schedule" || savedMode === "project" || savedMode === "lecture" || savedMode === "e2e") {
      setPlanningMode(savedMode);
    }
    setCourseDescription(localStorage.getItem(LS_KEYS.courseDescription) || "");
    setScheduleTerm(localStorage.getItem(LS_KEYS.scheduleTerm) || "");
    setScheduleStartDate(localStorage.getItem(LS_KEYS.scheduleStartDate) || "");
    setScheduleWeeks(localStorage.getItem(LS_KEYS.scheduleWeeks) || "");
    setScheduleTests(localStorage.getItem(LS_KEYS.scheduleTests) || "");
    setE2eCourseName(localStorage.getItem(LS_KEYS.e2eCourseName) || "");
    setE2eCourseDescription(localStorage.getItem(LS_KEYS.e2eCourseDescription) || "");
    setE2eScheduleTerm(localStorage.getItem(LS_KEYS.e2eScheduleTerm) || "");
    setE2eScheduleStartDate(localStorage.getItem(LS_KEYS.e2eScheduleStartDate) || "");
    setE2eScheduleWeeks(localStorage.getItem(LS_KEYS.e2eScheduleWeeks) || "");
    setE2eScheduleTests(localStorage.getItem(LS_KEYS.e2eScheduleTests) || "");
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
        tests
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

  const handleGenerateE2e = async () => {
    if (!e2eCourseName.trim()) {
      setE2eError("Please enter a course name.");
      return;
    }
    if (!e2eCourseDescription.trim()) {
      setE2eError("Please enter a course description.");
      return;
    }
    if (!e2eScheduleTerm.trim()) {
      setE2eError("Please enter the term (e.g. Fall 2026).");
      return;
    }
    if (!e2eScheduleStartDate) {
      setE2eError("Please select the course start date.");
      return;
    }
    const weeks = parseInt(e2eScheduleWeeks, 10);
    if (!weeks || weeks < 1 || weeks > 52) {
      setE2eError("Please enter a valid number of weeks (1–52).");
      return;
    }
    const tests = parseInt(e2eScheduleTests, 10);
    if (isNaN(tests) || tests < 0) {
      setE2eError("Please enter a valid number of tests (0 or more).");
      return;
    }
    setIsGeneratingE2e(true);
    setE2eError(null);
    setE2eCopilotPrompt(null);
    setE2eSaveStatus("idle");
    setE2eSaveError(null);
    try {
      const scheduleResult = await generateCourseScheduleAction(
        e2eCourseDescription.trim(),
        e2eScheduleTerm.trim(),
        e2eScheduleStartDate,
        weeks,
        tests
      );
      if ("error" in scheduleResult) {
        setE2eError(scheduleResult.error);
        return;
      }
      const rows = scheduleResult.rows;
      setE2eRows(rows);
      setE2eGenerated(true);

      // Convert schedule rows to CSV for Copilot prompt generation
      const escapeCell = (val: string) => `"${val.replace(/"/g, '""')}"`;
      const csvLines = [
        ["Week", "Dates", "Topics", "Assignment"].join(","),
        ...rows.map((r) =>
          [String(r.week), escapeCell(r.dates), escapeCell(r.topics), escapeCell(r.assignment)].join(",")
        ),
      ];
      const csvContent = csvLines.join("\r\n");
      const sanitized =
        e2eCourseName.trim().slice(0, 60).replace(/[^a-z0-9]/gi, "_").replace(/_+/g, "_").replace(/^_|_$/g, "") || "course";
      const promptResult = await generateCopilotProjectPromptAction(csvContent, `${sanitized}_schedule.csv`);
      let geminiPrompt: string | null = null;
      if ("error" in promptResult) {
        setE2eError(promptResult.error);
      } else {
        geminiPrompt = promptResult.prompt;
        setE2eCopilotPrompt(promptResult.prompt);
      }

      // Persist the course and its schedule to the database so it appears in
      // the Course Library tab.
      setE2eSaveStatus("saving");
      const saveResult = await saveEndToEndCourseAction({
        title: e2eCourseName.trim(),
        description: e2eCourseDescription.trim(),
        term: e2eScheduleTerm.trim(),
        scheduleCsv: csvContent,
        scheduleFileName: `${sanitized}_schedule.csv`,
        geminiPrompt,
      });
      if ("error" in saveResult) {
        setE2eSaveStatus("error");
        setE2eSaveError(saveResult.error);
      } else {
        setE2eSaveStatus("saved");
      }
    } catch (err) {
      setE2eError(err instanceof Error ? err.message : "Failed to generate End to End output.");
    } finally {
      setIsGeneratingE2e(false);
    }
  };

  const resetE2e = () => {
    setE2eGenerated(false);
    setE2eRows([]);
    setE2eError(null);
    setE2eCopilotPrompt(null);
    setE2eSaveStatus("idle");
    setE2eSaveError(null);
  };

  const handleExportE2eCsv = () => {
    const header = ["Week", "Dates", "Topics", "Assignment"];
    const escapeCell = (val: string) => `"${val.replace(/"/g, '""')}"`;
    const rows = [
      header.join(","),
      ...e2eRows.map((r) =>
        [String(r.week), escapeCell(r.dates), escapeCell(r.topics), escapeCell(r.assignment)].join(",")
      ),
    ];
    const courseName = e2eCourseDescription.split("\n")[0].trim().slice(0, 60);
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
      const promptResult = await generateCopilotProjectPromptAction(projectFileContent, projectFileName);
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
            <h1>New Build Courses</h1>
            <p>Build a syllabus or generate a weekly course schedule with the help of AI.</p>
          </div>

          {/* Mode toggle */}
          <div className={styles.scheduleModeToggle}>
            <button
              type="button"
              className={`${styles.scheduleModeBtn}${planningMode === "syllabus" ? ` ${styles.active}` : ""}`}
              onClick={() => { setPlanningMode("syllabus"); localStorage.setItem(LS_KEYS.planningMode, "syllabus"); }}
            >
              Syllabus
            </button>
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
              className={`${styles.scheduleModeBtn}${planningMode === "e2e" ? ` ${styles.active}` : ""}`}
              onClick={() => { setPlanningMode("e2e"); localStorage.setItem(LS_KEYS.planningMode, "e2e"); }}
            >
              End to End
            </button>
          </div>

          {/* ── Syllabus mode ── */}
          {planningMode === "syllabus" && (
            <>
              <div className={styles.field}>
                <label htmlFor="courseTitle">Course Title</label>
                <input
                  id="courseTitle"
                  type="text"
                  className={styles.textInput}
                  placeholder="e.g. Introduction to Data Science"
                  value={courseTitle}
                  onChange={(e) => {
                    setCourseTitle(e.target.value);
                    localStorage.setItem(LS_KEYS.courseTitle, e.target.value);
                  }}
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
                  onChange={(e) => {
                    setCourseCode(e.target.value);
                    localStorage.setItem(LS_KEYS.courseCode, e.target.value);
                  }}
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
                  onChange={(e) => {
                    setSemester(e.target.value);
                    localStorage.setItem(LS_KEYS.semester, e.target.value);
                  }}
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
                  onChange={(e) => {
                    setClassTimes(e.target.value);
                    localStorage.setItem(LS_KEYS.classTimes, e.target.value);
                  }}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="latePolicy">Late/Makeup Work Policy</label>
                <textarea
                  id="latePolicy"
                  className={styles.textInput}
                  placeholder="Describe your late or makeup work policy..."
                  value={latePolicy}
                  onChange={(e) => {
                    setLatePolicy(e.target.value);
                    localStorage.setItem(LS_KEYS.latePolicy, e.target.value);
                  }}
                  rows={3}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="attendancePolicy">Attendance Policy</label>
                <textarea
                  id="attendancePolicy"
                  className={styles.textInput}
                  placeholder="Describe your attendance policy..."
                  value={attendancePolicy}
                  onChange={(e) => {
                    setAttendancePolicy(e.target.value);
                    localStorage.setItem(LS_KEYS.attendancePolicy, e.target.value);
                  }}
                  rows={3}
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
                  onChange={(e) => {
                    setOfficeHours(e.target.value);
                    localStorage.setItem(LS_KEYS.officeHours, e.target.value);
                  }}
                />
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
                  onChange={(e) => {
                    setCoursePlanningContext(e.target.value);
                    localStorage.setItem(LS_KEYS.coursePlanningContext, e.target.value);
                  }}
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

          {/* ── End to End mode – form ── */}
          {planningMode === "e2e" && !e2eGenerated && (
            <>
              <div className={styles.field}>
                <label htmlFor="e2eCourseName">Course Name</label>
                <input
                  id="e2eCourseName"
                  type="text"
                  className={styles.textInput}
                  placeholder="e.g. Introduction to Python"
                  value={e2eCourseName}
                  onChange={(e) => { setE2eCourseName(e.target.value); localStorage.setItem(LS_KEYS.e2eCourseName, e.target.value); }}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="e2eCourseDescription">Course Description</label>
                <textarea
                  id="e2eCourseDescription"
                  className={styles.textInput}
                  placeholder="Describe the course — its topics, goals, and audience."
                  value={e2eCourseDescription}
                  onChange={(e) => { setE2eCourseDescription(e.target.value); localStorage.setItem(LS_KEYS.e2eCourseDescription, e.target.value); }}
                  rows={4}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="e2eScheduleTerm">Term</label>
                <input
                  id="e2eScheduleTerm"
                  type="text"
                  className={styles.textInput}
                  placeholder="e.g. Fall 2026"
                  value={e2eScheduleTerm}
                  onChange={(e) => { setE2eScheduleTerm(e.target.value); localStorage.setItem(LS_KEYS.e2eScheduleTerm, e.target.value); }}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="e2eScheduleStartDate">Course Start Date</label>
                <input
                  id="e2eScheduleStartDate"
                  type="date"
                  className={styles.textInput}
                  value={e2eScheduleStartDate}
                  onChange={(e) => { setE2eScheduleStartDate(e.target.value); localStorage.setItem(LS_KEYS.e2eScheduleStartDate, e.target.value); }}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="e2eScheduleWeeks">Number of Weeks</label>
                <input
                  id="e2eScheduleWeeks"
                  type="number"
                  className={styles.textInput}
                  placeholder="e.g. 15"
                  min={1}
                  max={52}
                  value={e2eScheduleWeeks}
                  onChange={(e) => { setE2eScheduleWeeks(e.target.value); localStorage.setItem(LS_KEYS.e2eScheduleWeeks, e.target.value); }}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="e2eScheduleTests">Number of Tests</label>
                <input
                  id="e2eScheduleTests"
                  type="number"
                  className={styles.textInput}
                  placeholder="e.g. 3"
                  min={0}
                  value={e2eScheduleTests}
                  onChange={(e) => { setE2eScheduleTests(e.target.value); localStorage.setItem(LS_KEYS.e2eScheduleTests, e.target.value); }}
                />
              </div>
              {e2eError && <p className={styles.error}>{e2eError}</p>}
              <button
                type="button"
                className={styles.submitButton}
                onClick={handleGenerateE2e}
                disabled={isGeneratingE2e || !e2eCourseName.trim() || !e2eCourseDescription.trim() || !e2eScheduleTerm.trim() || !e2eScheduleStartDate || !e2eScheduleWeeks || !e2eScheduleTests}
              >
                {isGeneratingE2e ? "Generating…" : "Generate"}
              </button>
            </>
          )}

          {/* ── End to End mode – results ── */}
          {planningMode === "e2e" && e2eGenerated && (
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
                    {e2eRows.map((row) => (
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
                  onClick={resetE2e}
                >
                  Edit &amp; Regenerate
                </button>
                <button
                  type="button"
                  className={styles.submitButton}
                  onClick={handleExportE2eCsv}
                >
                  Download CSV
                </button>
              </div>
              {e2eError && <p className={styles.error}>{e2eError}</p>}
              {e2eSaveStatus === "saving" && (
                <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginTop: 16 }}>Saving course to the Course Library…</p>
              )}
              {e2eSaveStatus === "saved" && (
                <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginTop: 16 }}>Saved to the Course Library.</p>
              )}
              {e2eSaveStatus === "error" && e2eSaveError && (
                <p className={styles.error}>Could not save to the Course Library: {e2eSaveError}</p>
              )}
              {isGeneratingE2e && !e2eCopilotPrompt && (
                <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginTop: 16 }}>Generating GitHub Copilot prompt…</p>
              )}
              {e2eCopilotPrompt && (
                <div className={styles.field} style={{ marginTop: 24 }}>
                  <label>GitHub Copilot Prompt</label>
                  <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", marginBottom: 8 }}>
                    Copy the prompt below and paste it into GitHub Copilot (Agent mode) to scaffold a project covering all schedule topics.
                  </p>
                  <textarea
                    className={styles.textInput}
                    value={e2eCopilotPrompt}
                    readOnly
                    rows={20}
                    style={{ fontFamily: "monospace", fontSize: "0.85rem" }}
                  />
                  <button
                    type="button"
                    className={styles.submitButton}
                    style={{ marginTop: 8 }}
                    onClick={() => void navigator.clipboard.writeText(e2eCopilotPrompt)}
                  >
                    Copy to Clipboard
                  </button>
                </div>
              )}
            </>
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
