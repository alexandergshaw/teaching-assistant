"use client";

import { useEffect, useRef, useState } from "react";
import {
  generateLecturePlansAction,
  generateLecturePlanForAssignmentAction,
  listAssignmentFoldersAction,
  generateCourseRubricFromZipAction,
  generateCourseMaterialsAction,
  getRepoZipAction,
  type AssignmentPlan,
} from "../actions";
import GithubRepoPicker from "./GithubRepoPicker";
import { parseGeneratedRubric } from "../utils/rubric";
import { saveFile, loadFile, deleteFile } from "../../lib/file-persistence";
import { getStoredProvider, useLlmProvider } from "@/lib/llm-provider";
import { buildSlidesPptx } from "@/lib/pptx";
import { buildDocxFromPlainText } from "@/lib/docx";
import { resolveDocumentAuthor } from "@/lib/author";
import { useSupabase } from "@/context/SupabaseProvider";
import styles from "../page.module.css";
import LecturePlanPreviewModal from "./LecturePlanPreviewModal";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";

const ZIP_FILE_KEY = "lecture-planning-zip";
const INTRO_TEMPLATE_KEY = "lecture-planning-intro-template";
const INSTRUCTIONS_TEMPLATE_KEY = "lecture-planning-instructions-template";

// Read a File as a base64 string (without the data: URL prefix). Module-scoped
// so it is stable for use in effect dependency lists.
function readFileAsBase64(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Build a File from a base64 payload (used to turn a downloaded GitHub repo zip
// into the same File the upload flow produces).
function base64ToFile(base64: string, name: string, type = "application/zip"): File {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return new File([bytes], name, { type });
}

// Decode a base64 payload (e.g. the Course Engine materials zip) and download it.
function downloadBase64File(base64: string, fileName: string, mimeType: string) {
  const byteChars = atob(base64);
  const byteArray = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteArray[i] = byteChars.charCodeAt(i);
  const blob = new Blob([byteArray], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function LecturePlanningTab() {
  const { user } = useSupabase();
  const [provider] = useLlmProvider();
  const [lectureDuration, setLectureDuration] = useState("50");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [plans, setPlans] = useState<AssignmentPlan[]>([]);
  // Snapshot of the plans exactly as generated, so the editor can reset a
  // section back to its original AI output after the user edits it.
  const [originalPlans, setOriginalPlans] = useState<AssignmentPlan[]>([]);
  const [isDownloading, setIsDownloading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  // Scope of generation: every assignment in the zip, or a single chosen one.
  const [scope, setScope] = useState<"all" | "single">("all");
  const [folders, setFolders] = useState<{ slug: string; label: string }[]>([]);
  const [selectedSlug, setSelectedSlug] = useState("");
  const [foldersLoading, setFoldersLoading] = useState(false);
  const [foldersError, setFoldersError] = useState<string | null>(null);
  // Index of the card currently being regenerated in place (null when none).
  const [regeneratingIndex, setRegeneratingIndex] = useState<number | null>(null);
  const [rubricStatus, setRubricStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [rubricError, setRubricError] = useState<string | null>(null);
  const [generatedRubric, setGeneratedRubric] = useState<string | null>(null);
  const [rubricCopied, setRubricCopied] = useState(false);
  const zipFileRef = useRef<HTMLInputElement>(null);
  const introTemplateRef = useRef<HTMLInputElement>(null);
  const instructionsTemplateRef = useRef<HTMLInputElement>(null);

  // Files are persisted to IndexedDB so that uploads survive page refreshes.
  // Browsers do not allow programmatically setting a file input's value, so the
  // restored files are tracked in state and used directly by the handlers.
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [introTemplateFile, setIntroTemplateFile] = useState<File | null>(null);
  const [instructionsTemplateFile, setInstructionsTemplateFile] = useState<File | null>(null);
  // Loading the course repo from GitHub instead of a zip upload.
  const [githubRepo, setGithubRepo] = useState("");
  const [githubBranch, setGithubBranch] = useState("");
  const [githubLoading, setGithubLoading] = useState(false);
  const [githubError, setGithubError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [zip, intro, instructions] = await Promise.all([
        loadFile(ZIP_FILE_KEY),
        loadFile(INTRO_TEMPLATE_KEY),
        loadFile(INSTRUCTIONS_TEMPLATE_KEY),
      ]);
      if (cancelled) return;
      if (zip) setZipFile(zip);
      if (intro) setIntroTemplateFile(intro);
      if (instructions) setInstructionsTemplateFile(instructions);
    })().catch(() => {
      // Restoring persisted files is best-effort; ignore failures.
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // When generating a single module, read the assignment folders out of the zip
  // so the picker can offer them. Re-runs if the zip changes while in single mode.
  // (The picker only renders in single mode, so stale state outside it is unused.)
  useEffect(() => {
    if (scope !== "single" || !zipFile) return;
    let cancelled = false;
    (async () => {
      setFoldersLoading(true);
      setFoldersError(null);
      try {
        const base64 = await readFileAsBase64(zipFile);
        const result = await listAssignmentFoldersAction(base64);
        if (cancelled) return;
        if ("error" in result) {
          setFoldersError(result.error);
          setFolders([]);
          return;
        }
        setFolders(result.folders);
        setSelectedSlug((prev) =>
          result.folders.some((f) => f.slug === prev) ? prev : result.folders[0]?.slug ?? ""
        );
      } catch {
        if (!cancelled) setFoldersError("Could not read the assignment list from the zip.");
      } finally {
        if (!cancelled) setFoldersLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scope, zipFile]);

  const handleFileChange = (
    file: File | null,
    key: string,
    setFile: (file: File | null) => void
  ) => {
    setFile(file);
    if (file) {
      saveFile(key, file).catch(() => {});
    } else {
      deleteFile(key).catch(() => {});
    }
  };

  const handleClearFile = (
    key: string,
    setFile: (file: File | null) => void,
    inputRef: React.RefObject<HTMLInputElement | null>
  ) => {
    setFile(null);
    if (inputRef.current) inputRef.current.value = "";
    deleteFile(key).catch(() => {});
  };

  // Download a GitHub repo as a normalized zip and use it as the course repository,
  // exactly as if it had been uploaded.
  const loadRepoFromGithub = async () => {
    if (!githubRepo.trim()) return;
    setGithubLoading(true);
    setGithubError(null);
    const r = await getRepoZipAction(githubRepo.trim(), githubBranch || undefined);
    setGithubLoading(false);
    if ("error" in r) {
      setGithubError(r.error);
      return;
    }
    handleFileChange(base64ToFile(r.base64, r.name), ZIP_FILE_KEY, setZipFile);
  };

  // Read the zip + optional templates and generate the module for one assignment.
  // Shared by single-scope generation and per-card regeneration.
  const callSingleAction = async (
    slug: string,
    minutes: number
  ): Promise<AssignmentPlan | { error: string }> => {
    if (!zipFile) return { error: "Please select a zip file of your course repository." };
    const base64 = await readFileAsBase64(zipFile);
    const introTemplateBase64 = introTemplateFile ? await readFileAsBase64(introTemplateFile) : undefined;
    const instructionsTemplateBase64 = instructionsTemplateFile
      ? await readFileAsBase64(instructionsTemplateFile)
      : undefined;
    return generateLecturePlanForAssignmentAction(
      base64,
      slug,
      minutes,
      introTemplateBase64,
      instructionsTemplateBase64,
      getStoredProvider()
    );
  };

  const handleGenerate = async () => {
    const file = zipFile;
    if (!file) {
      setError("Please select a zip file of your course repository.");
      return;
    }

    const minutes = parseInt(lectureDuration, 10);
    if (isNaN(minutes) || minutes < 1) {
      setError("Please enter a valid lecture duration in minutes.");
      return;
    }

    // Single-module path: generate just the chosen assignment and show it as one
    // card. Runs the Gemini preview flow regardless of provider (the Course
    // Engine "other" path only produces a whole-course package).
    if (scope === "single") {
      if (!selectedSlug) {
        setError("Choose an assignment to generate a module for.");
        return;
      }
      setStatus("loading");
      setError(null);
      setPlans([]);
      try {
        const result = await callSingleAction(selectedSlug, minutes);
        if ("error" in result) {
          setError(result.error);
          setStatus("error");
          return;
        }
        setPlans([result]);
        setOriginalPlans(JSON.parse(JSON.stringify([result])) as AssignmentPlan[]);
        setStatus("done");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Generation failed. Please try again.");
        setStatus("error");
      }
      return;
    }

    setStatus("loading");
    setError(null);
    setPlans([]);

    try {
      const base64 = await readFileAsBase64(file);

      // Course Engine path: it returns a finished course-materials.zip from the
      // project, so download it directly and skip the per-assignment preview.
      // The package also includes rubric.csv, so surface it in the rubric panel
      // from this single call (avoids a second /materials request).
      if (getStoredProvider() === "other") {
        const materials = await generateCourseMaterialsAction(base64);
        if ("error" in materials) {
          setError(materials.error);
          setStatus("error");
          return;
        }
        downloadBase64File(materials.base64, materials.fileName, materials.mimeType);
        if (materials.rubricCsv) {
          setGeneratedRubric(materials.rubricCsv);
          setRubricStatus("done");
          setRubricError(null);
        }
        setStatus("done");
        return;
      }

      const introTemplateBase64 = introTemplateFile
        ? await readFileAsBase64(introTemplateFile)
        : undefined;
      const instructionsTemplateBase64 = instructionsTemplateFile
        ? await readFileAsBase64(instructionsTemplateFile)
        : undefined;

      const result = await generateLecturePlansAction(
        base64,
        minutes,
        introTemplateBase64,
        instructionsTemplateBase64,
        getStoredProvider()
      );

      if ("error" in result) {
        setError(result.error);
        setStatus("error");
        return;
      }

      setPlans(result);
      setOriginalPlans(JSON.parse(JSON.stringify(result)) as AssignmentPlan[]);
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed. Please try again.");
      setStatus("error");
    }
  };

  // Regenerate a single card in place (e.g. one whose slides failed), reusing the
  // same zip and templates. Replaces both the plan and its reset-snapshot.
  const regenerateModule = async (index: number) => {
    const plan = plans[index];
    if (!plan) return;
    const minutes = parseInt(lectureDuration, 10);
    if (isNaN(minutes) || minutes < 1) {
      setError("Please enter a valid lecture duration in minutes.");
      return;
    }
    setRegeneratingIndex(index);
    setError(null);
    try {
      const result = await callSingleAction(plan.assignmentName, minutes);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setPlans((prev) => prev.map((p, i) => (i === index ? result : p)));
      setOriginalPlans((prev) =>
        prev.map((p, i) => (i === index ? (JSON.parse(JSON.stringify(result)) as AssignmentPlan) : p))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Regeneration failed. Please try again.");
    } finally {
      setRegeneratingIndex(null);
    }
  };

  const handleDownloadAll = async () => {
    if (plans.length === 0) return;
    setIsDownloading(true);
    try {
      const { default: JSZip } = await import("jszip");

      const outputZip = new JSZip();

      // Author stamped into every generated file's core properties so the
      // download reads as the user's own work, not a tooling default.
      const author = resolveDocumentAuthor(user);

      for (const plan of plans) {
        const pptxData = await buildSlidesPptx({
          presentationTitle: plan.presentationTitle,
          slides: plan.slides,
          subtitle: plan.label,
          author,
        });
        const fileLabel = plan.label;
        outputZip.file(`${fileLabel} Slides.pptx`, pptxData);
        if (plan.moduleIntroduction) {
          outputZip.file(`${fileLabel} Introduction.docx`, await buildDocxFromPlainText(plan.moduleIntroduction, plan.introTemplateHeadings, author));
        }
        if (plan.assignmentInstructions) {
          outputZip.file(`${fileLabel} Instructions.docx`, await buildDocxFromPlainText(plan.assignmentInstructions, plan.instructionsTemplateHeadings, author));
        }
      }

      const blob = await outputZip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "lecture_plans.zip";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed.");
    } finally {
      setIsDownloading(false);
    }
  };

  // ── Editor wiring: edits persist into `plans` so the ZIP uses them ──────────

  type EditablePlan = Pick<
    AssignmentPlan,
    "presentationTitle" | "moduleIntroduction" | "assignmentInstructions" | "slides"
  >;

  const updatePlan = (index: number, patch: Partial<EditablePlan>) => {
    setPlans((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  };

  const resetSection = (index: number, section: keyof EditablePlan) => {
    const original = originalPlans[index];
    if (!original) return;
    const value = original[section];
    // Deep-copy arrays/objects so a later edit can't mutate the snapshot.
    updatePlan(index, {
      [section]: Array.isArray(value) ? JSON.parse(JSON.stringify(value)) : value,
    } as Partial<EditablePlan>);
  };

  const downloadBlob = (data: BlobPart, fileName: string, mimeType: string) => {
    const blob = new Blob([data], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadDoc = async (index: number, kind: "slides" | "intro" | "instructions") => {
    const plan = plans[index];
    if (!plan) return;
    const author = resolveDocumentAuthor(user);
    const fileLabel = plan.label;
    if (kind === "slides") {
      const pptx = await buildSlidesPptx({
        presentationTitle: plan.presentationTitle,
        slides: plan.slides,
        subtitle: plan.assignmentName,
        author,
      });
      downloadBlob(
        pptx,
        `${fileLabel} Slides.pptx`,
        "application/vnd.openxmlformats-officedocument.presentationml.presentation"
      );
      return;
    }
    const text = kind === "intro" ? plan.moduleIntroduction : plan.assignmentInstructions;
    const headings = kind === "intro" ? plan.introTemplateHeadings : plan.instructionsTemplateHeadings;
    const name = kind === "intro" ? "Introduction" : "Instructions";
    const docx = await buildDocxFromPlainText(text, headings, author);
    downloadBlob(
      docx,
      `${fileLabel} ${name}.docx`,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
  };

  const handleGenerateRubric = async () => {
    const file = zipFile;
    if (!file) {
      setRubricError("Please select a zip file of your course repository.");
      setRubricStatus("idle");
      return;
    }

    setRubricStatus("loading");
    setRubricError(null);
    setGeneratedRubric(null);
    setRubricCopied(false);

    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1] ?? "");
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const result = await generateCourseRubricFromZipAction(base64, getStoredProvider());

      if (typeof result === "object" && "error" in result) {
        setRubricError(result.error);
        setRubricStatus("error");
        return;
      }

      setGeneratedRubric(result);
      setRubricStatus("done");
    } catch (err) {
      setRubricError(err instanceof Error ? err.message : "Rubric generation failed. Please try again.");
      setRubricStatus("error");
    }
  };

  const handleCopyRubric = async () => {
    if (!generatedRubric) return;
    try {
      await navigator.clipboard.writeText(generatedRubric);
      setRubricCopied(true);
      setTimeout(() => setRubricCopied(false), 2000);
    } catch {
      // clipboard not available
    }
  };

  const handleDownloadRubricCsv = () => {
    if (!generatedRubric) return;
    const rows = parseGeneratedRubric(generatedRubric);
    let csv: string;
    if (rows) {
      // Gemini text rubric: serialize the parsed rows to CSV.
      const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
      const lines = ["Criterion,Weight,Performance Levels"];
      for (const row of rows) {
        const weight = row.weight.endsWith("%") ? row.weight : `${row.weight}%`;
        const levels = row.subcategories.length > 0
          ? row.subcategories.map((s) => `${s.label}: ${s.description}`).join(" | ")
          : row.description;
        lines.push([esc(row.area), esc(weight), esc(levels)].join(","));
      }
      csv = lines.join("\r\n");
    } else {
      // Course Engine path: generatedRubric is already rubric.csv — download as-is.
      csv = generatedRubric;
    }
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "rubric.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <section className={styles.card}>
      <div className={styles.header}>
        <h1>Lecture Planning</h1>
        <p>
          Upload a zip of your template course repository and generate a tailored PowerPoint
          lecture for each assignment — ready to teach the concepts students need to succeed.
        </p>
      </div>

      <div className={styles.field}>
        <label htmlFor="lectureDuration">Lecture Duration (minutes)</label>
        <TextField
          id="lectureDuration"
          type="number"
          size="small"
          value={lectureDuration}
          onChange={(e) => setLectureDuration(e.target.value)}
          placeholder="e.g. 50"
          sx={{ width: 160 }}
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="repoZip">Course Repository (.zip)</label>
        <div className={styles.fileField}>
          <input
            id="repoZip"
            type="file"
            accept=".zip,application/zip,application/x-zip-compressed"
            ref={zipFileRef}
            onChange={(e) => handleFileChange(e.target.files?.[0] ?? null, ZIP_FILE_KEY, setZipFile)}
          />
          {zipFile && (
            <p className={styles.savedFileNote}>
              Saved: <strong>{zipFile.name}</strong>
              <Button
                type="button"
                variant="outlined"
                size="small"
                onClick={() => handleClearFile(ZIP_FILE_KEY, setZipFile, zipFileRef)}
              >
                Remove
              </Button>
            </p>
          )}
          <p>
            Upload a zip of your template repository. The zip must contain an{" "}
            <code>assignments</code> folder (or similar) with one subfolder per assignment.
            Each subfolder should include the README, any unit tests, and assignment source files.
            Maximum upload size: ~7 MB zip.
          </p>
          <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", margin: "8px 0 4px" }}>
            or load one of your GitHub repositories:
          </p>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 220px", minWidth: 0 }}>
              <GithubRepoPicker value={githubRepo} onChange={setGithubRepo} disabled={githubLoading} branch={githubBranch} onBranchChange={setGithubBranch} />
            </div>
            <Button
              variant="contained"
              size="small"
              onClick={loadRepoFromGithub}
              disabled={githubLoading || !githubRepo.trim()}
            >
              {githubLoading ? "Loading…" : "Load from GitHub"}
            </Button>
          </div>
          {githubError && <p className={styles.error}>{githubError}</p>}
        </div>
      </div>

      <div className={styles.field}>
        <label htmlFor="introTemplate">Module Intro Template (.docx, optional)</label>
        <div className={styles.fileField}>
          <input
            id="introTemplate"
            type="file"
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            ref={introTemplateRef}
            onChange={(e) => handleFileChange(e.target.files?.[0] ?? null, INTRO_TEMPLATE_KEY, setIntroTemplateFile)}
          />
          {introTemplateFile && (
            <p className={styles.savedFileNote}>
              Saved: <strong>{introTemplateFile.name}</strong>
              <Button
                type="button"
                variant="outlined"
                size="small"
                onClick={() => handleClearFile(INTRO_TEMPLATE_KEY, setIntroTemplateFile, introTemplateRef)}
              >
                Remove
              </Button>
            </p>
          )}
          <p>
            Optional. Upload a .docx whose structure, headings, and formatting the generated
            module intro documents must follow exactly. Leave empty to use the default layout.
          </p>
        </div>
      </div>

      <div className={styles.field}>
        <label htmlFor="instructionsTemplate">Assignment Instructions Template (.docx, optional)</label>
        <div className={styles.fileField}>
          <input
            id="instructionsTemplate"
            type="file"
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            ref={instructionsTemplateRef}
            onChange={(e) => handleFileChange(e.target.files?.[0] ?? null, INSTRUCTIONS_TEMPLATE_KEY, setInstructionsTemplateFile)}
          />
          {instructionsTemplateFile && (
            <p className={styles.savedFileNote}>
              Saved: <strong>{instructionsTemplateFile.name}</strong>
              <Button
                type="button"
                variant="outlined"
                size="small"
                onClick={() => handleClearFile(INSTRUCTIONS_TEMPLATE_KEY, setInstructionsTemplateFile, instructionsTemplateRef)}
              >
                Remove
              </Button>
            </p>
          )}
          <p>
            Optional. Upload a .docx whose structure, headings, and formatting the generated
            assignment instruction documents must follow exactly. Leave empty to use the default layout.
          </p>
        </div>
      </div>

      <div className={styles.field}>
        <label>Scope</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(["all", "single"] as const).map((opt) => (
            <Button
              key={opt}
              type="button"
              variant={scope === opt ? "contained" : "outlined"}
              size="small"
              onClick={() => setScope(opt)}
            >
              {opt === "all" ? "All assignments" : "Single assignment"}
            </Button>
          ))}
        </div>
        {scope === "single" && (
          <div style={{ marginTop: 10 }}>
            {!zipFile ? (
              <p>Select a course zip above to choose an assignment.</p>
            ) : foldersLoading ? (
              <p>Reading assignments…</p>
            ) : foldersError ? (
              <p className={styles.error}>{foldersError}</p>
            ) : folders.length > 0 ? (
              <TextField
                select
                size="small"
                aria-label="Assignment to generate"
                value={selectedSlug}
                onChange={(e) => setSelectedSlug(e.target.value)}
                sx={{ minWidth: 360 }}
              >
                {folders.map((f) => (
                  <MenuItem key={f.slug} value={f.slug}>
                    {f.label}
                  </MenuItem>
                ))}
              </TextField>
            ) : (
              <p>No assignments found in the zip.</p>
            )}
          </div>
        )}
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <Button
        variant="contained"
        size="small"
        onClick={handleGenerate}
        disabled={status === "loading" || (scope === "single" && !selectedSlug)}
      >
        {status === "loading"
          ? "Generating…"
          : scope === "single"
            ? "Generate Module"
            : "Generate Lecture Plans"}
      </Button>

      {status === "done" && plans.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20, marginTop: 8 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <p style={{ margin: 0, fontWeight: 600, color: "var(--text-primary)" }}>
              Generated {plans.length} lecture plan{plans.length !== 1 ? "s" : ""}
            </p>
            <Button
              variant="contained"
              size="small"
              onClick={handleDownloadAll}
              disabled={isDownloading}
            >
              {isDownloading ? "Building ZIP…" : "Download All as ZIP"}
            </Button>
          </div>

          {(() => {
            const failed = plans.filter((p) => p.slidesFailed);
            if (failed.length === 0) return null;
            return (
              <div
                role="alert"
                style={{
                  padding: "12px 16px",
                  borderRadius: 10,
                  background: "color-mix(in srgb, #f59e0b 12%, transparent 88%)",
                  border: "1px solid color-mix(in srgb, #f59e0b 35%, transparent 65%)",
                  color: "var(--text-primary)",
                  fontSize: "0.9rem",
                  lineHeight: 1.5,
                }}
              >
                <strong>Slides could not be generated for {failed.length} assignment{failed.length !== 1 ? "s" : ""}:</strong>{" "}
                {failed.map((p) => p.label).join(", ")}. The model failed even after retries, so{" "}
                {failed.length !== 1 ? "their decks are empty placeholders" : "its deck is an empty placeholder"}. Use{" "}
                <strong>Regenerate</strong> on {failed.length !== 1 ? "each" : "the"} affected card to try again — transient model errors
                usually clear on a retry.
              </div>
            );
          })()}

          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {plans.map((plan, i) => {
              const badges: string[] = [];
              if (!plan.slidesFailed) {
                badges.push(`${plan.slides.length + 1} slide${plan.slides.length !== 0 ? "s" : ""}`);
              }
              if (plan.moduleIntroduction) badges.push("Module Intro");
              if (plan.assignmentInstructions) badges.push("Instructions");
              return (
                <li
                  key={plan.assignmentName}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedIndex(i)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setSelectedIndex(i); }}
                  style={{
                    background: "var(--field-background)",
                    border: "1px solid var(--field-border)",
                    borderRadius: 10,
                    padding: "14px 18px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    cursor: "pointer",
                  }}
                >
                  <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                    {plan.presentationTitle}
                  </span>
                  <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: 500 }}>
                    {plan.assignmentName}
                  </span>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 2 }}>
                    {plan.slidesFailed && (
                      <span
                        style={{
                          fontSize: "0.72rem",
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          padding: "2px 8px",
                          borderRadius: 20,
                          background: "color-mix(in srgb, #f59e0b 14%, transparent 86%)",
                          color: "var(--warning)",
                          border: "1px solid color-mix(in srgb, #f59e0b 35%, transparent 65%)",
                        }}
                      >
                        Slides failed
                      </span>
                    )}
                    {badges.map((badge) => (
                      <span
                        key={badge}
                        style={{
                          fontSize: "0.72rem",
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          padding: "2px 8px",
                          borderRadius: 20,
                          background: "color-mix(in srgb, var(--accent) 12%, transparent 88%)",
                          color: "var(--accent-ink)",
                          border: "1px solid color-mix(in srgb, var(--accent) 25%, transparent 75%)",
                        }}
                      >
                        {badge}
                      </span>
                    ))}
                  </div>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      regenerateModule(i);
                    }}
                    onKeyDown={(e) => e.stopPropagation()}
                    disabled={regeneratingIndex !== null}
                    title="Regenerate this module from the uploaded zip"
                    sx={{
                      alignSelf: "flex-start",
                      marginTop: 1,
                      opacity: regeneratingIndex !== null && regeneratingIndex !== i ? 0.5 : 1,
                    }}
                  >
                    {regeneratingIndex === i ? "Regenerating…" : "Regenerate"}
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {selectedIndex !== null && plans[selectedIndex] && (
        <LecturePlanPreviewModal
          plans={plans}
          index={selectedIndex}
          provider={provider}
          onIndexChange={setSelectedIndex}
          onUpdatePlan={updatePlan}
          onResetSection={resetSection}
          onDownloadDoc={downloadDoc}
          onClose={() => setSelectedIndex(null)}
        />
      )}

      <div style={{ borderTop: "1px solid var(--field-border)", marginTop: 32, paddingTop: 28 }}>
        <div style={{ marginBottom: 16 }}>
          <h2 style={{ margin: "0 0 6px", fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary)" }}>
            Course-Wide Rubric
          </h2>
          <p style={{ margin: 0, fontSize: "0.9rem", color: "var(--text-secondary)" }}>
            {provider === "other"
              ? "The grading rubric is produced together with the lecture package above — generate it there and it will appear here. It can be copied and pasted into the Grading tab."
              : "Generate a universal grading rubric derived from all assignment instructions in the uploaded zip. This rubric can be copied and pasted into the Grading tab."}
          </p>
        </div>

        {rubricError && <p className={styles.error}>{rubricError}</p>}

        {provider !== "other" && (
          <Button
            variant="contained"
            size="small"
            onClick={handleGenerateRubric}
            disabled={rubricStatus === "loading"}
            sx={{ marginBottom: 2 }}
          >
            {rubricStatus === "loading" ? "Generating Rubric…" : "Generate Course Rubric"}
          </Button>
        )}

        {rubricStatus === "done" && generatedRubric && (() => {
          const rows = parseGeneratedRubric(generatedRubric);
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                <span style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--text-primary)" }}>
                  Generated rubric — applies to all assignments
                </span>
                <div style={{ display: "flex", gap: 8 }}>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={handleCopyRubric}
                  >
                    {rubricCopied ? "Copied!" : "Copy Rubric"}
                  </Button>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={handleDownloadRubricCsv}
                  >
                    Download CSV
                  </Button>
                </div>
              </div>
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
                <pre className={styles.generatedRubricBody}>{generatedRubric}</pre>
              )}
            </div>
          );
        })()}
      </div>
    </section>
  );
}
