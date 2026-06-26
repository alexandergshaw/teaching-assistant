"use client";

import type { ChangeEvent } from "react";
import { useRef, useState, useEffect } from "react";
import {
  generateCourseScheduleAction,
  generateCopilotProjectPromptAction,
  analyzeSyllabusInputsAction,
  regenerateSyllabusFieldAction,
  buildAdaptedSyllabusAction,
  type CourseScheduleRow,
  type SyllabusCourseInfo,
} from "../actions";
import LecturePlanningTab from "./LecturePlanningTab";
import { spansToPlainText } from "./RichTextEditor";
import { RichTextSectionEditor } from "./RichTextSectionEditor";
import type { RunSpan } from "@/lib/office-edit";
import { getStoredProvider } from "@/lib/llm-provider";
import styles from "../page.module.css";

/** One editable section (paragraph) of the syllabus being adapted. */
type AdaptSection = {
  /** Stable React key. */
  key: string;
  /** Original paragraph id whose style/position this section borrows. */
  sourceId: string;
  /** Original text (for change detection / "Original:"); "" for added sections. */
  original: string;
  /** Current content as formatted spans. */
  spans: RunSpan[];
  /** Label for the guided field list; "Section" otherwise. */
  label: string;
  /** Whether the AI flagged this as a class-specific field (shown in the form). */
  isField: boolean;
};
type PlanningMode = "syllabus" | "schedule" | "project" | "lecture";

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

// Local storage keys for the course-planning form fields. Module-level so the
// hydration/persistence effects can reference them without them counting as
// reactive dependencies.
const LS_KEYS = {
  planningMode: "coursePlanning_planningMode",
  courseDescription: "schedule_courseDescription",
  scheduleTerm: "schedule_scheduleTerm",
  scheduleStartDate: "schedule_scheduleStartDate",
  scheduleWeeks: "schedule_scheduleWeeks",
  scheduleTests: "schedule_scheduleTests",
  adaptCourseName: "adapt_courseName",
  adaptCourseCode: "adapt_courseCode",
  adaptInstructorName: "adapt_instructorName",
  adaptInstructorEmail: "adapt_instructorEmail",
  adaptDescription: "adapt_description",
  adaptStartDate: "adapt_startDate",
  adaptMeetingDays: "adapt_meetingDays",
  adaptMeetingTimes: "adapt_meetingTimes",
  adaptLocation: "adapt_location",
};

export default function CoursePlanningTab() {
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
  // ── Adapt an existing syllabus from a codebase (the Syllabus subtab flow) ──
  const adaptSyllabusRef = useRef<HTMLInputElement>(null);
  const adaptZipRef = useRef<HTMLInputElement>(null);
  const [adaptSyllabusBase64, setAdaptSyllabusBase64] = useState<string | null>(null);
  const [adaptSyllabusName, setAdaptSyllabusName] = useState("");
  // The syllabus as an ordered, editable list of sections (paragraphs). Each
  // borrows the style/position of its `sourceId` paragraph; added sections clone
  // their anchor. null = not analyzed yet.
  const [adaptSections, setAdaptSections] = useState<AdaptSection[] | null>(null);
  const adaptKeySeq = useRef(0);
  const [adaptStatus, setAdaptStatus] = useState<"idle" | "analyzing" | "building">("idle");
  const [adaptError, setAdaptError] = useState<string | null>(null);
  // Instructor-provided course facts (asked for; not assumed across syllabi).
  const [adaptCourseName, setAdaptCourseName] = useState("");
  const [adaptCourseCode, setAdaptCourseCode] = useState("");
  const [adaptInstructorName, setAdaptInstructorName] = useState("");
  const [adaptInstructorEmail, setAdaptInstructorEmail] = useState("");
  const [adaptDescription, setAdaptDescription] = useState("");
  const [adaptStartDate, setAdaptStartDate] = useState("");
  const [adaptMeetingDays, setAdaptMeetingDays] = useState("");
  const [adaptMeetingTimes, setAdaptMeetingTimes] = useState("");
  const [adaptLocation, setAdaptLocation] = useState("");
  // The full paragraph list + codebase summary, for the live preview and per-field regenerate.
  const [adaptCodebaseSummary, setAdaptCodebaseSummary] = useState("");
  const [adaptRegenKey, setAdaptRegenKey] = useState<string | null>(null);

  // One-time hydration of the syllabus-adapter text inputs from localStorage
  // (client-only, to avoid an SSR mismatch — same reasoning as the effect above).
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setAdaptCourseName(localStorage.getItem(LS_KEYS.adaptCourseName) || "");
    setAdaptCourseCode(localStorage.getItem(LS_KEYS.adaptCourseCode) || "");
    setAdaptInstructorName(localStorage.getItem(LS_KEYS.adaptInstructorName) || "");
    setAdaptInstructorEmail(localStorage.getItem(LS_KEYS.adaptInstructorEmail) || "");
    setAdaptDescription(localStorage.getItem(LS_KEYS.adaptDescription) || "");
    setAdaptStartDate(localStorage.getItem(LS_KEYS.adaptStartDate) || "");
    setAdaptMeetingDays(localStorage.getItem(LS_KEYS.adaptMeetingDays) || "");
    setAdaptMeetingTimes(localStorage.getItem(LS_KEYS.adaptMeetingTimes) || "");
    setAdaptLocation(localStorage.getItem(LS_KEYS.adaptLocation) || "");
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

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
    setAdaptSections(null);
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
      // Build the editable section list: each paragraph, with the AI field
      // suggestion or schedule replacement applied.
      const fieldById = new Map(result.fields.map((f) => [f.paragraphId, f]));
      const sections: AdaptSection[] = result.paragraphs.map((p) => {
        const field = fieldById.get(p.id);
        const sched = result.scheduleReplacements[p.id];
        const replacement = field ? field.suggestedText : sched;
        // AI replacements arrive as plain text; unchanged paragraphs keep their
        // original formatting (runs) so the editor shows it.
        const spans: RunSpan[] =
          replacement !== undefined
            ? [{ text: replacement }]
            : p.runs.length > 0
              ? p.runs
              : [{ text: p.text }];
        return {
          key: p.id,
          sourceId: p.id,
          original: p.text,
          spans,
          label: field?.label ?? "Section",
          isField: !!field,
        };
      });
      setAdaptSections(sections);
      setAdaptCodebaseSummary(result.codebaseSummary);
    } catch (err) {
      setAdaptError(err instanceof Error ? err.message : "Failed to analyze the syllabus.");
    } finally {
      setAdaptStatus("idle");
    }
  };

  const adaptCourseInfo = (): SyllabusCourseInfo => ({
    courseName: adaptCourseName.trim() || undefined,
    courseCode: adaptCourseCode.trim() || undefined,
    instructorName: adaptInstructorName.trim() || undefined,
    instructorEmail: adaptInstructorEmail.trim() || undefined,
    courseDescription: adaptDescription.trim() || undefined,
    startDate: adaptStartDate.trim() || undefined,
    meetingDays: adaptMeetingDays.trim() || undefined,
    meetingTimes: adaptMeetingTimes.trim() || undefined,
    location: adaptLocation.trim() || undefined,
  });

  const updateSection = (key: string, patch: Partial<AdaptSection>) =>
    setAdaptSections((prev) => (prev ? prev.map((s) => (s.key === key ? { ...s, ...patch } : s)) : prev));

  const deleteSection = (key: string) =>
    setAdaptSections((prev) => (prev ? prev.filter((s) => s.key !== key) : prev));

  // Add a blank section right after `key`, cloning that section's style anchor.
  const addSectionAfter = (key: string) =>
    setAdaptSections((prev) => {
      if (!prev) return prev;
      const idx = prev.findIndex((s) => s.key === key);
      if (idx === -1) return prev;
      const fresh: AdaptSection = {
        key: `new-${adaptKeySeq.current++}`,
        sourceId: prev[idx].sourceId,
        original: "",
        spans: [{ text: "" }],
        label: "New section",
        isField: false,
      };
      return [...prev.slice(0, idx + 1), fresh, ...prev.slice(idx + 1)];
    });

  // Regenerate one section's text with AI, leaving the others untouched.
  const handleRegenerateAdaptSection = async (section: AdaptSection) => {
    setAdaptRegenKey(section.key);
    setAdaptError(null);
    try {
      const result = await regenerateSyllabusFieldAction(
        { label: section.label, currentText: section.original || spansToPlainText(section.spans) },
        adaptCodebaseSummary,
        adaptCourseInfo(),
        getStoredProvider()
      );
      if ("error" in result) {
        setAdaptError(result.error);
        return;
      }
      updateSection(section.key, { spans: [{ text: result.text }] });
    } catch (err) {
      setAdaptError(err instanceof Error ? err.message : "Failed to regenerate the section.");
    } finally {
      setAdaptRegenKey(null);
    }
  };

  // Build the .docx from the current ordered sections (edits, additions, and
  // deletions) and download it.
  const handleBuildAdaptedSyllabus = async () => {
    if (!adaptSyllabusBase64 || !adaptSections) return;
    const payload = adaptSections.map((s) => ({ sourceId: s.sourceId, spans: s.spans }));
    setAdaptStatus("building");
    setAdaptError(null);
    try {
      const result = await buildAdaptedSyllabusAction(adaptSyllabusBase64, payload);
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

  return (
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
                <label htmlFor="adaptCourseName">Course name</label>
                <input
                  id="adaptCourseName"
                  type="text"
                  className={styles.textInput}
                  placeholder="e.g. Database Management"
                  value={adaptCourseName}
                  onChange={(e) => { setAdaptCourseName(e.target.value); localStorage.setItem(LS_KEYS.adaptCourseName, e.target.value); }}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="adaptCourseCode">Course code</label>
                <input
                  id="adaptCourseCode"
                  type="text"
                  className={styles.textInput}
                  placeholder="e.g. BIT270"
                  value={adaptCourseCode}
                  onChange={(e) => { setAdaptCourseCode(e.target.value); localStorage.setItem(LS_KEYS.adaptCourseCode, e.target.value); }}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="adaptInstructorName">Instructor name</label>
                <input
                  id="adaptInstructorName"
                  type="text"
                  className={styles.textInput}
                  placeholder="e.g. Alex Shaw"
                  value={adaptInstructorName}
                  onChange={(e) => { setAdaptInstructorName(e.target.value); localStorage.setItem(LS_KEYS.adaptInstructorName, e.target.value); }}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="adaptInstructorEmail">Instructor email</label>
                <input
                  id="adaptInstructorEmail"
                  type="email"
                  className={styles.textInput}
                  placeholder="e.g. shaw@university.edu"
                  value={adaptInstructorEmail}
                  onChange={(e) => { setAdaptInstructorEmail(e.target.value); localStorage.setItem(LS_KEYS.adaptInstructorEmail, e.target.value); }}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="adaptDescription">Official course description</label>
                <textarea
                  id="adaptDescription"
                  className={styles.textInput}
                  rows={4}
                  placeholder="Paste the official catalog description — used verbatim for the course description section."
                  value={adaptDescription}
                  onChange={(e) => { setAdaptDescription(e.target.value); localStorage.setItem(LS_KEYS.adaptDescription, e.target.value); }}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="adaptStartDate">Course start date</label>
                <input
                  id="adaptStartDate"
                  type="date"
                  className={styles.textInput}
                  value={adaptStartDate}
                  onChange={(e) => { setAdaptStartDate(e.target.value); localStorage.setItem(LS_KEYS.adaptStartDate, e.target.value); }}
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
                  onChange={(e) => { setAdaptMeetingDays(e.target.value); localStorage.setItem(LS_KEYS.adaptMeetingDays, e.target.value); }}
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
                  onChange={(e) => { setAdaptMeetingTimes(e.target.value); localStorage.setItem(LS_KEYS.adaptMeetingTimes, e.target.value); }}
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
                  onChange={(e) => { setAdaptLocation(e.target.value); localStorage.setItem(LS_KEYS.adaptLocation, e.target.value); }}
                />
              </div>

              {adaptError && <p className={styles.error}>{adaptError}</p>}

              <button
                type="button"
                className={styles.submitButton}
                onClick={handleAnalyzeSyllabus}
                disabled={adaptStatus !== "idle"}
              >
                {adaptStatus === "analyzing" ? "Analyzing…" : adaptSections ? "Re-analyze" : "Analyze syllabus"}
              </button>

              {adaptSections && adaptSections.length > 0 && (
                <>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", marginTop: 22 }}>
                    <p style={{ fontWeight: 600, margin: 0 }}>
                      {adaptSections.length} section{adaptSections.length === 1 ? "" : "s"} — edit, regenerate with AI, add, or delete any of them
                    </p>
                    <button
                      type="button"
                      className={styles.submitButton}
                      onClick={handleBuildAdaptedSyllabus}
                      disabled={adaptStatus !== "idle"}
                    >
                      {adaptStatus === "building" ? "Building…" : "Download adapted syllabus (.docx)"}
                    </button>
                  </div>

                  <RichTextSectionEditor
                    bordered
                    maxHeight="65vh"
                    onChange={(key, spans) => updateSection(key, { spans })}
                    sections={adaptSections.map((s) => ({
                      key: s.key,
                      spans: s.spans,
                      changed: s.isField || spansToPlainText(s.spans) !== s.original,
                      placeholder: "(empty section)",
                      label: s.isField ? s.label : undefined,
                      ariaLabel: s.isField ? s.label : "Syllabus section",
                      actions: [
                        {
                          key: "ai",
                          label: adaptRegenKey === s.key ? "…" : "AI",
                          title: "Regenerate this section with AI",
                          tone: "accent",
                          onClick: () => handleRegenerateAdaptSection(s),
                          disabled: adaptRegenKey !== null,
                          style: { opacity: adaptRegenKey !== null && adaptRegenKey !== s.key ? 0.5 : 1 },
                        },
                        {
                          key: "add",
                          label: "+",
                          title: "Add a section below",
                          onClick: () => addSectionAfter(s.key),
                        },
                        {
                          key: "del",
                          label: "×",
                          title: "Delete this section",
                          tone: "danger",
                          onClick: () => deleteSection(s.key),
                        },
                      ],
                    }))}
                  />
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
  );
}
