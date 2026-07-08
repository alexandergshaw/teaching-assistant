"use client";

import type { ChangeEvent } from "react";
import { useRef, useState, useEffect } from "react";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import {
  generateCourseScheduleAction,
  generateCopilotProjectPromptAction,
  createCopilotRepoAction,
  listMyOrgsAction,
  getRepoZipAction,
  analyzeSyllabusInputsAction,
  regenerateSyllabusFieldAction,
  buildAdaptedSyllabusAction,
  listCourseContentAction,
  placeSyllabusInModuleAction,
  type CourseScheduleRow,
  type SyllabusCourseInfo,
} from "../actions";
import GithubRepoPicker from "./GithubRepoPicker";
import SyllabusTemplateLibrary from "./SyllabusTemplateLibrary";
import GithubSyncPanel from "./GithubSyncPanel";
import LecturePlanningTab from "./LecturePlanningTab";
import { spansToPlainText } from "./RichTextEditor";
import { RichTextSectionEditor } from "./RichTextSectionEditor";
import TabHeader from "./TabHeader";
import { useInstitutionSelection } from "@/lib/institutions";
import type { RunSpan } from "@/lib/office-edit";
import type { CanvasModule } from "@/lib/canvas-modules";
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
type PlanningMode = "syllabus" | "schedule" | "project" | "lecture" | "sync";

// The subtab toggle, in workflow order. "Syllabus" is first because it is the
// default landing mode.
const PLANNING_MODES: Array<{ key: PlanningMode; label: string }> = [
  { key: "syllabus", label: "Syllabus" },
  { key: "schedule", label: "Course Schedule" },
  { key: "project", label: "Course Project Planning" },
  { key: "lecture", label: "Lecture Planning" },
  { key: "sync", label: "Assignment Sync" },
];

// Map an AI replacement string onto the paragraph's original formatting: if the
// replacement still starts with the original's leading bold label, keep that
// label bold and the rest plain; otherwise the whole replacement is plain. This
// preserves bold field labels without bolding the value the AI filled in.
function boldLabelSpans(runs: RunSpan[], replacement: string): RunSpan[] {
  let prefix = "";
  for (const r of runs) {
    if (!r.bold) break;
    prefix += r.text;
  }
  if (prefix && replacement.startsWith(prefix) && replacement.length > prefix.length) {
    return [{ text: prefix, bold: true }, { text: replacement.slice(prefix.length) }];
  }
  return [{ text: replacement }];
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
  adaptTextbookText: "adapt_textbookText",
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

  // Create-a-repo from the generated Copilot prompt.
  const [repoName, setRepoName] = useState("");
  const [repoPrivate, setRepoPrivate] = useState(true);
  const [repoOrg, setRepoOrg] = useState("");
  const [repoTemplate, setRepoTemplate] = useState(false);
  const [repoOrgs, setRepoOrgs] = useState<string[]>([]);
  const [creatingRepo, setCreatingRepo] = useState(false);
  const [createdRepo, setCreatedRepo] = useState<{ fullName: string; htmlUrl: string } | null>(null);
  const [createRepoError, setCreateRepoError] = useState<string | null>(null);

  const loadRepoOrgs = async () => {
    const r = await listMyOrgsAction();
    if (!("error" in r)) setRepoOrgs(r.orgs);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await listMyOrgsAction();
      if (!cancelled && !("error" in r)) setRepoOrgs(r.orgs);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCreateRepo = async () => {
    if (!projectPrompt) return;
    const name = repoName.trim() || (projectFileName ? projectFileName.replace(/\.[^.]+$/, "") : "course-project");
    setCreatingRepo(true);
    setCreateRepoError(null);
    setCreatedRepo(null);
    try {
      const r = await createCopilotRepoAction(name, projectPrompt, repoPrivate, repoOrg || undefined, repoTemplate);
      if ("error" in r) setCreateRepoError(r.error);
      else setCreatedRepo(r);
    } catch (err) {
      setCreateRepoError(err instanceof Error ? err.message : "Failed to create the repository.");
    } finally {
      setCreatingRepo(false);
    }
  };

  // Syllabus mode: an optional GitHub repo as the codebase source (instead of a zip).
  const [adaptRepo, setAdaptRepo] = useState("");
  const [adaptBranch, setAdaptBranch] = useState("");


  useEffect(() => {
    // One-time hydration of editable form fields from localStorage. This must
    // run client-only (in an effect) so the server-rendered defaults match the
    // first client render; a lazy useState initializer would read localStorage
    // during hydration and cause an SSR mismatch. Hence the rule is suppressed.
    /* eslint-disable react-hooks/set-state-in-effect */
    const savedMode = localStorage.getItem(LS_KEYS.planningMode);
    if (savedMode === "syllabus" || savedMode === "schedule" || savedMode === "project" || savedMode === "lecture" || savedMode === "sync") {
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
  const textbookImagesRef = useRef<HTMLInputElement>(null);
  const [adaptSyllabusBase64, setAdaptSyllabusBase64] = useState<string | null>(null);
  // A saved template selected from the library, used as the syllabus base when no
  // file is uploaded.
  const [pickedTemplate, setPickedTemplate] = useState<{ id: string; name: string; fileName: string; base64: string } | null>(null);
  // Textbook details the AI extracted from uploaded screenshots (kept so a later
  // field regeneration still has them).
  const [extractedTextbookInfo, setExtractedTextbookInfo] = useState("");
  const [adaptTextbookText, setAdaptTextbookText] = useState("");
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
    setAdaptTextbookText(localStorage.getItem(LS_KEYS.adaptTextbookText) || "");
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

  const buildScheduleCsv = (): { content: string; fileName: string } => {
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
    return { content: rows.join("\r\n"), fileName: `${sanitized}_schedule.csv` };
  };

  const handleExportScheduleCsv = () => {
    const { content, fileName } = buildScheduleCsv();
    triggerFileDownload(new Blob([content], { type: "text/csv;charset=utf-8" }), fileName);
  };

  // Hand the generated schedule straight to Project Planning and kick off the
  // Copilot prompt — no manual export/re-upload round trip.
  const handleUseScheduleForProject = () => {
    const { content, fileName } = buildScheduleCsv();
    setProjectFileContent(content);
    setProjectFileName(fileName);
    setProjectPrompt(null);
    setProjectError(null);
    setPlanningMode("project");
    localStorage.setItem(LS_KEYS.planningMode, "project");
    void handleGenerateProjectPrompt(content, fileName);
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

  const handleGenerateProjectPrompt = async (contentArg?: string, nameArg?: string) => {
    const content = contentArg ?? projectFileContent;
    const name = nameArg ?? projectFileName;
    if (!content || !name) {
      setProjectError("Please upload a schedule file first.");
      return;
    }
    setIsGeneratingProjectPrompt(true);
    setProjectError(null);
    setProjectPrompt(null);
    try {
      const promptResult = await generateCopilotProjectPromptAction(content, name, getStoredProvider());
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
    if (!syllabusFile && !pickedTemplate) {
      setAdaptError("Upload a former syllabus (.docx) or pick a saved template first.");
      return;
    }
    if (syllabusFile && !/\.docx$/i.test(syllabusFile.name)) {
      setAdaptError("The former syllabus must be a Word .docx file.");
      return;
    }
    const zipFile = adaptZipRef.current?.files?.[0] ?? null;
    setAdaptStatus("analyzing");
    setAdaptError(null);
    setAdaptSections(null);
    try {
      const syllabusName = syllabusFile ? syllabusFile.name : pickedTemplate ? pickedTemplate.fileName : "";
      const syllabusBase64 = syllabusFile ? await readFileBase64(syllabusFile) : pickedTemplate ? pickedTemplate.base64 : "";
      let zipBase64: string | null = null;
      if (adaptRepo.trim()) {
        const z = await getRepoZipAction(adaptRepo.trim(), adaptBranch || undefined);
        if ("error" in z) {
          setAdaptError(z.error);
          return;
        }
        zipBase64 = z.base64;
      } else if (zipFile) {
        zipBase64 = await readFileBase64(zipFile);
      }
      setAdaptSyllabusBase64(syllabusBase64);
      setAdaptSyllabusName(syllabusName);
      const imageFiles = Array.from(textbookImagesRef.current?.files ?? []);
      const textbookImages = imageFiles.length
        ? await Promise.all(
            imageFiles.map(async (f) => ({ base64: await readFileBase64(f), mimeType: f.type || "image/png" }))
          )
        : null;
      const result = await analyzeSyllabusInputsAction(
        { name: syllabusName, base64: syllabusBase64 },
        zipBase64,
        { ...adaptCourseInfo(), textbookInfo: adaptTextbookText.trim() || undefined },
        getStoredProvider(),
        textbookImages
      );
      if ("error" in result) {
        setAdaptError(result.error);
        return;
      }
      if (result.textbookInfo) setExtractedTextbookInfo(result.textbookInfo);
      // Build the editable section list: each paragraph, with the AI field
      // suggestion or schedule replacement applied.
      const fieldById = new Map(result.fields.map((f) => [f.paragraphId, f]));
      const sections: AdaptSection[] = result.paragraphs.map((p) => {
        const field = fieldById.get(p.id);
        const sched = result.scheduleReplacements[p.id];
        const replacement = field ? field.suggestedText : sched;
        // AI replacements arrive as plain text. Where the replacement still
        // begins with the paragraph's original bold label (e.g. "Instructor
        // name: "), keep that label bold and the value plain; otherwise plain.
        // Unchanged paragraphs keep their original run formatting.
        const spans: RunSpan[] =
          replacement !== undefined
            ? boldLabelSpans(p.runs, replacement)
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
    textbookInfo: [adaptTextbookText.trim(), extractedTextbookInfo.trim()].filter(Boolean).join("\n\n") || undefined,
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

  // Build the adapted .docx from the current ordered sections and return its
  // base64, or null on error (error is surfaced via setAdaptError).
  const buildSyllabusBase64 = async (): Promise<string | null> => {
    if (!adaptSyllabusBase64 || !adaptSections) return null;
    const payload = adaptSections.map((s) => ({ sourceId: s.sourceId, spans: s.spans }));
    const result = await buildAdaptedSyllabusAction(adaptSyllabusBase64, payload);
    if ("error" in result) {
      setAdaptError(result.error);
      return null;
    }
    return result.base64;
  };

  const adaptedFileName = () => `${adaptSyllabusName.replace(/\.docx$/i, "") || "syllabus"}_adapted.docx`;

  // Build and download.
  const handleBuildAdaptedSyllabus = async () => {
    setAdaptStatus("building");
    setAdaptError(null);
    try {
      const base64 = await buildSyllabusBase64();
      if (!base64) return;
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
      triggerFileDownload(blob, adaptedFileName());
    } catch (err) {
      setAdaptError(err instanceof Error ? err.message : "Failed to build the syllabus.");
    } finally {
      setAdaptStatus("idle");
    }
  };

  // ── Place the generated syllabus into a Canvas course module ──
  const { active: activeInstitution } = useInstitutionSelection();
  const [placeCourseUrl, setPlaceCourseUrl] = useState<string>(() =>
    typeof window !== "undefined" ? localStorage.getItem("ta-content-course-url") ?? "" : ""
  );
  const [placeModules, setPlaceModules] = useState<CanvasModule[] | null>(null);
  const [placeModuleId, setPlaceModuleId] = useState<number | "">("");
  const [placePosition, setPlacePosition] = useState("");
  const [placeBusy, setPlaceBusy] = useState<"idle" | "loading" | "adding">("idle");
  const [placeNote, setPlaceNote] = useState<{ kind: "error" | "success"; text: string } | null>(null);

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

  const handleAddToModule = async () => {
    if (placeModuleId === "") return;
    setPlaceBusy("adding");
    setPlaceNote(null);
    try {
      const base64 = await buildSyllabusBase64();
      if (!base64) {
        setPlaceNote({ kind: "error", text: adaptError ?? "Could not build the syllabus." });
        return;
      }
      const pos = placePosition.trim() ? Number(placePosition) : undefined;
      const result = await placeSyllabusInModuleAction(
        base64,
        placeCourseUrl,
        placeModuleId,
        adaptedFileName(),
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

  return (
    <section className={styles.card}>
          <TabHeader
            eyebrow="New Build Courses"
            title="Build a new course"
            subtitle="Build a syllabus or generate a weekly course schedule with the help of AI."
          />

          {/* Mode toggle — segmented control (see .scheduleModeBtn) */}
          <div className={styles.scheduleModeToggle}>
            {PLANNING_MODES.map((m) => (
              <button
                key={m.key}
                type="button"
                className={`${styles.scheduleModeBtn}${planningMode === m.key ? ` ${styles.active}` : ""}`}
                onClick={() => { setPlanningMode(m.key); localStorage.setItem(LS_KEYS.planningMode, m.key); }}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* ── Syllabus mode: adapt an existing syllabus from a codebase ── */}
          {planningMode === "syllabus" && (
            <>
              <p className={styles.adaptIntro}>
                Upload a previous offering&apos;s syllabus and (optionally) a zip of the course&apos;s codebase.
                The AI finds the class-specific parts that need your input, you confirm or edit them, and the new
                syllabus is written back into the original Word file — so its formatting matches exactly.
              </p>

              <div className={styles.field}>
                <label>Syllabus template</label>
                <SyllabusTemplateLibrary
                  activeTemplateId={pickedTemplate?.id ?? null}
                  onUse={(t) => {
                    setPickedTemplate(t);
                    if (adaptSyllabusRef.current) adaptSyllabusRef.current.value = "";
                    setAdaptError(null);
                  }}
                />
                {pickedTemplate && (
                  <p className={styles.adaptTemplateNote}>
                    Using template: <strong>{pickedTemplate.name}</strong>{" "}
                    <button type="button" className={styles.linkButton} onClick={() => setPickedTemplate(null)}>
                      clear
                    </button>
                  </p>
                )}
              </div>

              <div className={styles.field}>
                <label htmlFor="adaptSyllabusFile">Or upload a former syllabus (.docx)</label>
                <div className={styles.fileField}>
                  <input
                    id="adaptSyllabusFile"
                    type="file"
                    accept=".docx"
                    ref={adaptSyllabusRef}
                    onChange={() => {
                      if (adaptSyllabusRef.current?.files?.[0]) setPickedTemplate(null);
                    }}
                  />
                  <p>Word .docx only. The new syllabus keeps its exact formatting; only class-specific text changes.</p>
                </div>
              </div>

              <div className={styles.field}>
                <label htmlFor="adaptTextbookImages">Textbook info screenshot (optional)</label>
                <div className={styles.fileField}>
                  <input id="adaptTextbookImages" type="file" accept="image/*" multiple ref={textbookImagesRef} />
                  <p>Optional. Upload one or more screenshots of the textbook / required-materials details; the AI reads them and fills the syllabus textbook section.</p>
                </div>
              </div>

              <div className={styles.field}>
                <TextField
                  id="adaptTextbookText"
                  label="Textbook info as text (optional)"
                  multiline
                  minRows={3}
                  size="small"
                  fullWidth
                  placeholder="Optional. Paste or type the textbook / required-materials details; combined with any screenshot above and used for the syllabus textbook section."
                  value={adaptTextbookText}
                  onChange={(e) => { setAdaptTextbookText(e.target.value); localStorage.setItem(LS_KEYS.adaptTextbookText, e.target.value); }}
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="adaptZipFile">Course codebase (optional)</label>
                <div className={styles.fileField}>
                  <input id="adaptZipFile" type="file" accept=".zip" ref={adaptZipRef} disabled={!!adaptRepo.trim()} />
                  <p>Optional. A zip of the course&apos;s codebase so the AI can suggest accurate, class-specific values.</p>
                </div>
                <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", margin: "8px 0 4px" }}>or select one of your GitHub repositories:</p>
                <GithubRepoPicker value={adaptRepo} onChange={setAdaptRepo} disabled={adaptStatus === "analyzing"} branch={adaptBranch} onBranchChange={setAdaptBranch} />
              </div>

              <div className={styles.field}>
                <TextField
                  id="adaptCourseName"
                  label="Course name"
                  type="text"
                  size="small"
                  fullWidth
                  placeholder="e.g. Database Management"
                  value={adaptCourseName}
                  onChange={(e) => { setAdaptCourseName(e.target.value); localStorage.setItem(LS_KEYS.adaptCourseName, e.target.value); }}
                />
              </div>
              <div className={styles.field}>
                <TextField
                  id="adaptCourseCode"
                  label="Course code"
                  type="text"
                  size="small"
                  fullWidth
                  placeholder="e.g. BIT270"
                  value={adaptCourseCode}
                  onChange={(e) => { setAdaptCourseCode(e.target.value); localStorage.setItem(LS_KEYS.adaptCourseCode, e.target.value); }}
                />
              </div>
              <div className={styles.field}>
                <TextField
                  id="adaptInstructorName"
                  label="Instructor name"
                  type="text"
                  size="small"
                  fullWidth
                  placeholder="e.g. Alex Shaw"
                  value={adaptInstructorName}
                  onChange={(e) => { setAdaptInstructorName(e.target.value); localStorage.setItem(LS_KEYS.adaptInstructorName, e.target.value); }}
                />
              </div>
              <div className={styles.field}>
                <TextField
                  id="adaptInstructorEmail"
                  label="Instructor email"
                  type="email"
                  size="small"
                  fullWidth
                  placeholder="e.g. shaw@university.edu"
                  value={adaptInstructorEmail}
                  onChange={(e) => { setAdaptInstructorEmail(e.target.value); localStorage.setItem(LS_KEYS.adaptInstructorEmail, e.target.value); }}
                />
              </div>
              <div className={styles.field}>
                <TextField
                  id="adaptDescription"
                  label="Official course description"
                  multiline
                  minRows={4}
                  size="small"
                  fullWidth
                  placeholder="Paste the official catalog description — used verbatim for the course description section."
                  value={adaptDescription}
                  onChange={(e) => { setAdaptDescription(e.target.value); localStorage.setItem(LS_KEYS.adaptDescription, e.target.value); }}
                />
              </div>
              <div className={styles.field}>
                <TextField
                  id="adaptStartDate"
                  label="Course start date"
                  type="date"
                  size="small"
                  fullWidth
                  value={adaptStartDate}
                  onChange={(e) => { setAdaptStartDate(e.target.value); localStorage.setItem(LS_KEYS.adaptStartDate, e.target.value); }}
                  slotProps={{ inputLabel: { shrink: true } }}
                />
                <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", margin: "4px 0 0" }}>
                  Include the year — used to compute the schedule. Not assumed from the old syllabus.
                </p>
              </div>
              <div className={styles.field}>
                <TextField
                  id="adaptMeetingDays"
                  label="Meeting days"
                  type="text"
                  size="small"
                  fullWidth
                  placeholder="e.g. Mon / Wed / Fri"
                  value={adaptMeetingDays}
                  onChange={(e) => { setAdaptMeetingDays(e.target.value); localStorage.setItem(LS_KEYS.adaptMeetingDays, e.target.value); }}
                />
              </div>
              <div className={styles.field}>
                <TextField
                  id="adaptMeetingTimes"
                  label="Meeting times"
                  type="text"
                  size="small"
                  fullWidth
                  placeholder="e.g. 9:00–10:15am"
                  value={adaptMeetingTimes}
                  onChange={(e) => { setAdaptMeetingTimes(e.target.value); localStorage.setItem(LS_KEYS.adaptMeetingTimes, e.target.value); }}
                />
              </div>
              <div className={styles.field}>
                <TextField
                  id="adaptLocation"
                  label="Meeting location"
                  type="text"
                  size="small"
                  fullWidth
                  placeholder="e.g. Room 204, Science Hall"
                  value={adaptLocation}
                  onChange={(e) => { setAdaptLocation(e.target.value); localStorage.setItem(LS_KEYS.adaptLocation, e.target.value); }}
                />
              </div>

              {adaptError && <p className={styles.error}>{adaptError}</p>}

              <Button
                variant="contained"
                size="small"
                onClick={handleAnalyzeSyllabus}
                disabled={adaptStatus !== "idle"}
              >
                {adaptStatus === "analyzing" ? "Analyzing…" : adaptSections ? "Re-analyze" : "Analyze syllabus"}
              </Button>

              {adaptSections && adaptSections.length > 0 && (
                <>
                  <p className={styles.adaptSectionsHeading}>
                    {adaptSections.length} section{adaptSections.length === 1 ? "" : "s"} — edit, regenerate with AI, add, or delete any of them
                  </p>

                  {/* Review the generated sections first, then act on them below. */}
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

                  <div className={styles.adaptActionBar}>
                    <Button
                      variant="contained"
                      size="small"
                      onClick={handleBuildAdaptedSyllabus}
                      disabled={adaptStatus !== "idle"}
                    >
                      {adaptStatus === "building" ? "Building…" : "Download adapted syllabus (.docx)"}
                    </Button>
                  </div>

                  {/* Optional: place the generated syllabus directly into a Canvas module. */}
                  <details className={styles.adaptDisclosure}>
                    <summary>Add to a Canvas module</summary>
                    <div className={styles.adaptDisclosureBody}>
                      <div className={styles.adaptRow}>
                        <div className={styles.field} style={{ flex: "1 1 280px", margin: 0 }}>
                          <TextField
                            id="placeCourseUrl"
                            label="Course URL"
                            type="text"
                            size="small"
                            fullWidth
                            placeholder="https://canvas.../courses/123"
                            value={placeCourseUrl}
                            onChange={(e) => setPlaceCourseUrl(e.target.value)}
                          />
                        </div>
                        <Button variant="contained" size="small" onClick={handleLoadPlaceModules} disabled={placeBusy !== "idle"}>
                          {placeBusy === "loading" ? "Loading…" : "Load modules"}
                        </Button>
                      </div>
                      {placeModules && (
                        <div className={styles.adaptRow}>
                          <div className={styles.field} style={{ flex: "1 1 240px", margin: 0 }}>
                            <TextField
                              id="placeModule"
                              label="Module"
                              select
                              size="small"
                              fullWidth
                              value={placeModuleId}
                              onChange={(e) => setPlaceModuleId(Number(e.target.value))}
                            >
                              {placeModules.length === 0 && <MenuItem value="">No modules in this course</MenuItem>}
                              {placeModules.map((m) => (
                                <MenuItem key={m.id} value={m.id}>{m.name}</MenuItem>
                              ))}
                            </TextField>
                          </div>
                          <div className={styles.field} style={{ width: 110, margin: 0 }}>
                            <TextField
                              id="placePosition"
                              label="Position"
                              type="number"
                              size="small"
                              fullWidth
                              slotProps={{ htmlInput: { min: 1 } }}
                              placeholder="End"
                              value={placePosition}
                              onChange={(e) => setPlacePosition(e.target.value)}
                            />
                          </div>
                          <Button
                            variant="contained"
                            size="small"
                            onClick={handleAddToModule}
                            disabled={placeBusy !== "idle" || placeModuleId === ""}
                          >
                            {placeBusy === "adding" ? "Adding…" : "Add to module"}
                          </Button>
                        </div>
                      )}
                      {placeNote && (
                        <p className={placeNote.kind === "error" ? styles.error : styles.fieldHint} style={{ marginTop: 8 }}>
                          {placeNote.text}
                        </p>
                      )}
                    </div>
                  </details>
                </>
              )}
            </>
          )}

          {/* ── Course Schedule mode ── */}
          {planningMode === "schedule" && !scheduleGenerated && (
            <>
              <div className={styles.field}>
                <TextField
                  id="courseDescription"
                  label="Course Description"
                  multiline
                  minRows={4}
                  size="small"
                  fullWidth
                  placeholder="Describe the course — its topics, goals, and audience."
                  value={courseDescription}
                  onChange={(e) => { setCourseDescription(e.target.value); localStorage.setItem(LS_KEYS.courseDescription, e.target.value); }}
                />
              </div>
              <div className={styles.field}>
                <TextField
                  id="scheduleTerm"
                  label="Term"
                  type="text"
                  size="small"
                  fullWidth
                  placeholder="e.g. Fall 2026"
                  value={scheduleTerm}
                  onChange={(e) => { setScheduleTerm(e.target.value); localStorage.setItem(LS_KEYS.scheduleTerm, e.target.value); }}
                />
              </div>
              <div className={styles.field}>
                <TextField
                  id="scheduleStartDate"
                  label="Course Start Date"
                  type="date"
                  size="small"
                  fullWidth
                  value={scheduleStartDate}
                  onChange={(e) => { setScheduleStartDate(e.target.value); localStorage.setItem(LS_KEYS.scheduleStartDate, e.target.value); }}
                  slotProps={{ inputLabel: { shrink: true } }}
                />
              </div>
              <div className={styles.field}>
                <TextField
                  id="scheduleWeeks"
                  label="Number of Weeks"
                  type="number"
                  size="small"
                  fullWidth
                  placeholder="e.g. 15"
                  slotProps={{ htmlInput: { min: 1, max: 52 } }}
                  value={scheduleWeeks}
                  onChange={(e) => { setScheduleWeeks(e.target.value); localStorage.setItem(LS_KEYS.scheduleWeeks, e.target.value); }}
                />
              </div>
              <div className={styles.field}>
                <TextField
                  id="scheduleTests"
                  label="Number of Tests"
                  type="number"
                  size="small"
                  fullWidth
                  placeholder="e.g. 3"
                  slotProps={{ htmlInput: { min: 0 } }}
                  value={scheduleTests}
                  onChange={(e) => { setScheduleTests(e.target.value); localStorage.setItem(LS_KEYS.scheduleTests, e.target.value); }}
                />
              </div>
              {scheduleError && <p className={styles.error}>{scheduleError}</p>}
              <Button
                variant="contained"
                size="small"
                onClick={handleGenerateSchedule}
                disabled={isGeneratingSchedule || !courseDescription.trim() || !scheduleTerm.trim() || !scheduleStartDate || !scheduleWeeks || !scheduleTests}
              >
                {isGeneratingSchedule ? "Generating schedule…" : "Generate Schedule"}
              </Button>
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
                <Button
                  variant="contained"
                  size="small"
                  onClick={resetSchedule}
                >
                  Edit &amp; Regenerate
                </Button>
                <Button
                  variant="contained"
                  size="small"
                  onClick={handleExportScheduleCsv}
                >
                  Export CSV
                </Button>
                <Button
                  variant="contained"
                  size="small"
                  onClick={handleUseScheduleForProject}
                  disabled={isGeneratingProjectPrompt}
                  title="Use this schedule for Course Project Planning and generate the Copilot prompt"
                >
                  {isGeneratingProjectPrompt ? "Generating prompt…" : "Use for Project Planning"}
                </Button>
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
              <Button
                variant="contained"
                size="small"
                onClick={() => handleGenerateProjectPrompt()}
                disabled={isGeneratingProjectPrompt || !projectFileContent}
              >
                {isGeneratingProjectPrompt ? "Generating prompt…" : "Generate Copilot Prompt"}
              </Button>
              {projectPrompt && (
                <div className={styles.field}>
                  <label>GitHub Copilot Prompt</label>
                  <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", marginBottom: 8 }}>
                    Copy the prompt below and paste it into GitHub Copilot (Agent mode) to scaffold a project covering all schedule topics.
                  </p>
                  <TextField
                    value={projectPrompt}
                    multiline
                    minRows={20}
                    size="small"
                    fullWidth
                    slotProps={{ htmlInput: { readOnly: true } }}
                    sx={{ fontFamily: "monospace", fontSize: "0.85rem" }}
                  />
                  <Button
                    variant="contained"
                    size="small"
                    style={{ marginTop: 8 }}
                    onClick={() => void navigator.clipboard.writeText(projectPrompt)}
                  >
                    Copy to Clipboard
                  </Button>

                  <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--card-border, #e2e8f0)" }}>
                    <label>Or create a GitHub repo with this prompt</label>
                    <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", margin: "4px 0 8px" }}>
                      Creates the repo and commits the prompt to <code>.github/copilot-instructions.md</code>, ready to open in Copilot Agent mode.
                    </p>

                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
                      <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>Owner</span>
                      <TextField
                        select
                        size="small"
                        value={repoOrg}
                        onChange={(e) => setRepoOrg(e.target.value)}
                        disabled={creatingRepo}
                        sx={{ flex: "1 1 200px" }}
                      >
                        <MenuItem value="">Your personal account</MenuItem>
                        {repoOrgs.map((o) => (
                          <MenuItem key={o} value={o}>
                            {o} (organization)
                          </MenuItem>
                        ))}
                      </TextField>
                      <a href="https://github.com/account/organizations/new" target="_blank" rel="noreferrer" style={{ fontSize: "0.82rem" }}>
                        Create org on GitHub
                      </a>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => void loadRepoOrgs()}
                        disabled={creatingRepo}
                      >
                        Refresh
                      </Button>
                    </div>

                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <TextField
                        type="text"
                        size="small"
                        value={repoName}
                        placeholder={projectFileName ? projectFileName.replace(/\.[^.]+$/, "") : "course-project"}
                        onChange={(e) => setRepoName(e.target.value)}
                        disabled={creatingRepo}
                        sx={{ flex: "1 1 220px" }}
                      />
                      <FormControlLabel
                        control={<Checkbox size="small" checked={repoPrivate} onChange={(e) => setRepoPrivate(e.target.checked)} disabled={creatingRepo} />}
                        label="Private"
                        sx={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}
                      />
                      <FormControlLabel
                        control={<Checkbox size="small" checked={repoTemplate} onChange={(e) => setRepoTemplate(e.target.checked)} disabled={creatingRepo} />}
                        label="Template"
                        title="Mark as a template so the Version Control Integration tab can generate one repo per student from it"
                        sx={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}
                      />
                      <Button variant="contained" size="small" onClick={handleCreateRepo} disabled={creatingRepo}>
                        {creatingRepo ? "Creating repo…" : "Create GitHub repo"}
                      </Button>
                    </div>
                    {createRepoError && <p className={styles.error}>{createRepoError}</p>}
                    {createdRepo && (
                      <p style={{ fontSize: "0.85rem", marginTop: 8 }}>
                        Created{" "}
                        <a href={createdRepo.htmlUrl} target="_blank" rel="noreferrer" style={{ fontWeight: 600 }}>
                          {createdRepo.fullName}
                        </a>
                        {repoTemplate ? " — use it in Version Control Integration to generate student repos." : "."}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {planningMode === "sync" && <GithubSyncPanel acronym={activeInstitution || undefined} />}

          {planningMode === "lecture" && (
            <LecturePlanningTab />
          )}
    </section>
  );
}
