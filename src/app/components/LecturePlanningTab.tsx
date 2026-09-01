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
import { saveFile, loadFile, deleteFile } from "../../lib/file-persistence";
import { getStoredProvider, useLlmProvider } from "@/lib/llm-provider";
import { resolveDocumentAuthor } from "@/lib/author";
import { useSupabase } from "@/context/SupabaseProvider";
import { saveRecordingFile } from "@/lib/recording-files";
import { checkCourseEngineUpload } from "@/lib/course-engine-upload";
import { checkFileWireBudget, formatMB, maxFileBytesForWireBudget, type UploadBudgetCheck } from "@/lib/upload-budget";
import styles from "../page.module.css";
import LecturePlanPreviewModal from "./LecturePlanPreviewModal";
import LecturePlanCardList from "./LecturePlanCardList";
import LecturePlanningRubricSection from "./LecturePlanningRubricSection";
import {
  plansSignature,
  isGenerateConfirmArmed,
  planEditSignature,
  planHasEdits,
  isRegenerateConfirmArmed,
  generateButtonLabel,
  generateConfirmMessage,
  courseEngineDoneMessage,
  type RegenerateArmed,
} from "./lecture-planning-decisions";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
// Pure file/blob helpers - extracted to lecture-planning-file-utils.ts (kept
// this component under this project's 1000-line cap); see that module's
// header for details.
import {
  readFileAsBase64,
  base64ToFile,
  downloadBase64File,
  downloadBlob,
  triggerDownload,
  buildRubricCsv,
  buildPlanDocDownload,
  buildLecturePlansZip,
  computeLecturePlansZipBaseName,
} from "./lecture-planning-file-utils";

const ZIP_FILE_KEY = "lecture-planning-zip";
const INTRO_TEMPLATE_KEY = "lecture-planning-intro-template";
const INSTRUCTIONS_TEMPLATE_KEY = "lecture-planning-instructions-template";

/**
 * STOPGAP size guard for the course-repo zip on the lecture-planning Gemini
 * flow (generateLecturePlansAction / generateLecturePlanForAssignmentAction /
 * listAssignmentFoldersAction). This upload has no cap today and fails
 * opaquely against Vercel's platform request-body limit (~4.5 MB, see
 * upload-budget.ts) once the zip crosses it. This is NOT the real fix - the
 * real fix is converting this flow to a direct browser-to-Storage upload, so
 * it no longer travels through a request body at all, because a course
 * repository legitimately needs to exceed any request-body cap. That
 * conversion is deliberately out of scope here; this check only turns the
 * opaque platform 413 into an honest refusal in the meantime.
 */
function checkRepoZipUpload(file: File): UploadBudgetCheck {
  return checkFileWireBudget(file.size, "This course repository");
}

export default function LecturePlanningTab() {
  const { user, supabase } = useSupabase();
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
  // BLOCKER 1: signature Generate is armed to overwrite. Generate only runs
  // for real when this matches the CURRENT plan set's signature - see
  // isGenerateConfirmArmed in lecture-planning-decisions.ts for why a
  // signature (not a boolean/timer) is the right shape here.
  const [generateArmedFor, setGenerateArmedFor] = useState<string | null>(null);
  // BLOCKER 2: which single card's Regenerate is armed, and for what edited
  // state - see isRegenerateConfirmArmed.
  const [regenerateArmed, setRegenerateArmed] = useState<RegenerateArmed>(null);
  // BLOCKER 3: the Course Engine path's last finished package, so a "done"
  // state with no per-assignment plans can still say what was produced and
  // offer a re-download instead of rendering nothing.
  const [courseEngineMaterials, setCourseEngineMaterials] = useState<
    { base64: string; fileName: string; mimeType: string } | null
  >(null);
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
      const budgetCheck = checkRepoZipUpload(zipFile);
      if (!budgetCheck.ok) {
        setFoldersError(budgetCheck.error ?? "This course repository is too large to upload in one request.");
        setFolders([]);
        setFoldersLoading(false);
        return;
      }
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
    const budgetCheck = checkRepoZipUpload(zipFile);
    if (!budgetCheck.ok) {
      return { error: budgetCheck.error ?? "This course repository is too large to upload in one request." };
    }
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

  // BLOCKER 1: generating again used to clear `plans` before the request even
  // started (setPlans([]) up front), so a second click - or a failed retry -
  // destroyed every existing plan and every edit made in the preview modal
  // (edits write straight into `plans`, see updatePlan below) with no way
  // back. Fixed two ways: (1) `plans` is never cleared ahead of the request -
  // it is only ever REPLACED, and only on success, so a failed request lands
  // back on whatever was on screen before, not a blank slate; (2) when there
  // is something on screen to lose, the button arms instead of firing
  // immediately, using this app's existing signature-based arming idiom
  // (isGenerateConfirmArmed / content-tab/modules/confirmArming.ts) so a
  // second click on the SAME plan set confirms, but any change to what is at
  // risk (a new zip, a different scope) re-requires confirmation.
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

    if (scope === "single" && !selectedSlug) {
      setError("Choose an assignment to generate a module for.");
      return;
    }

    if (plans.length > 0 && !isGenerateConfirmArmed(generateArmedFor, plans)) {
      setGenerateArmedFor(plansSignature(plans));
      return;
    }
    setGenerateArmedFor(null);

    setStatus("loading");
    setError(null);

    try {
      // Single-module path: generate just the chosen assignment and show it as
      // one card. Runs the Gemini preview flow regardless of provider (the
      // Course Engine "other" path only produces a whole-course package).
      if (scope === "single") {
        const result = await callSingleAction(selectedSlug, minutes);
        if ("error" in result) {
          setError(result.error);
          setStatus("error");
          return;
        }
        setPlans([result]);
        setOriginalPlans(JSON.parse(JSON.stringify([result])) as AssignmentPlan[]);
        setCourseEngineMaterials(null);
        setStatus("done");
        return;
      }

      const isCourseEngine = getStoredProvider() === "other";
      // Pre-flight before readFileAsBase64, in the same unit the platform's
      // request-body cap applies in (WIRE bytes, not raw file bytes - see
      // checkCourseEngineUpload / checkRepoZipUpload). Checked ahead of the
      // provider branch below because both branches read and send this same
      // file.
      const budgetCheck = isCourseEngine
        ? checkCourseEngineUpload(file.size, "This course repository")
        : checkRepoZipUpload(file);
      if (!budgetCheck.ok) {
        setError(budgetCheck.error ?? "This course repository is too large to upload in one request.");
        setStatus("error");
        return;
      }

      const base64 = await readFileAsBase64(file);

      // Course Engine path: it returns a finished course-materials.zip from the
      // project, so download it directly and skip the per-assignment preview.
      // The package also includes rubric.csv, so surface it in the rubric panel
      // from this single call (avoids a second /materials request).
      if (isCourseEngine) {
        const materials = await generateCourseMaterialsAction(base64);
        if ("error" in materials) {
          setError(materials.error);
          setStatus("error");
          return;
        }
        downloadBase64File(materials.base64, materials.fileName, materials.mimeType);
        // BLOCKER 3: this path never produces per-assignment `plans` - record
        // what it DID produce so a finished run has something to show.
        setCourseEngineMaterials({ base64: materials.base64, fileName: materials.fileName, mimeType: materials.mimeType });
        setPlans([]);
        setOriginalPlans([]);
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
      setCourseEngineMaterials(null);
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

  // BLOCKER 2: Regenerate used to overwrite the plan AND its reset-snapshot
  // (originalPlans[index]) unconfirmed, so Reset could no longer recover the
  // instructor's edits. A card with no edits has nothing to protect, so it
  // still regenerates on the first click - only an EDITED card requires a
  // confirming second click (isRegenerateConfirmArmed, armed by
  // planEditSignature so a further edit after arming re-requires
  // confirmation).
  const handleRegenerateClick = (index: number) => {
    const plan = plans[index];
    const original = originalPlans[index];
    if (!plan) return;
    if (!original || !planHasEdits(plan, original)) {
      void regenerateModule(index);
      return;
    }
    if (isRegenerateConfirmArmed(regenerateArmed, index, plan)) {
      setRegenerateArmed(null);
      void regenerateModule(index);
      return;
    }
    setRegenerateArmed({ index, signature: planEditSignature(plan) });
  };

  const handleDownloadAll = async () => {
    if (plans.length === 0) return;
    setIsDownloading(true);
    try {
      // Author stamped into every generated file's core properties so the
      // download reads as the user's own work, not a tooling default.
      const author = resolveDocumentAuthor(user);
      const blob = await buildLecturePlansZip(plans, author);
      // Compute download name: use repo name if from GitHub, else zip filename, else fallback
      const baseName = computeLecturePlansZipBaseName(githubRepo, zipFile?.name ?? null);
      triggerDownload(blob, `${baseName}.zip`);
      if (user) {
        void saveRecordingFile(supabase, user.id, blob, {
          name: baseName,
          kind: "bundle",
          mimeType: "application/zip",
          durationSec: null,
        }).catch((err) => console.error("Library save failed:", err));
      }
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

  const downloadDoc = async (index: number, kind: "slides" | "intro" | "instructions") => {
    const plan = plans[index];
    if (!plan) return;
    const author = resolveDocumentAuthor(user);
    const { blob, fileName } = await buildPlanDocDownload(plan, kind, author);
    triggerDownload(blob, fileName);
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
    // buildRubricCsv handles both paths: a Gemini text rubric is serialized
    // from its parsed rows, a Course Engine rubric.csv passes through as-is.
    const csv = buildRubricCsv(generatedRubric);
    downloadBlob(csv, "rubric.csv", "text/csv;charset=utf-8");
  };

  // Whether Generate, if clicked right now, would run for real vs. arm the
  // confirmation - see the BLOCKER 1 comment above handleGenerate.
  const generateArmed = isGenerateConfirmArmed(generateArmedFor, plans);

  return (
    <>
      <div className={styles.header}>
        <h2>Lecture Planning</h2>
        <p>
          Upload a zip of your template course repository to generate lecture materials — slide
          decks, module intros, and assignment instructions ready to teach from. Choose{" "}
          <strong>All assignments</strong> below to get one module per assignment, or{" "}
          <strong>Single assignment</strong> for just one. (The Course Engine provider instead
          produces one finished course package rather than per-assignment previews.)
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
            Maximum upload size for now: ~{formatMB(maxFileBytesForWireBudget())} zip. Larger course
            repositories are not yet supported in a single upload.
          </p>
          <p style={{ fontSize: "var(--font-size-sm)", color: "var(--text-secondary)", margin: "var(--space-2) 0 var(--space-1)" }}>
            or load one of your GitHub repositories:
          </p>
          <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "flex-start", flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 220px", minWidth: 0 }}>
              <GithubRepoPicker
                value={githubRepo}
                onChange={setGithubRepo}
                disabled={githubLoading}
                branch={githubBranch}
                onBranchChange={setGithubBranch}
                describedById={githubError ? "githubRepoError" : undefined}
              />
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
          {githubError && (
            <p id="githubRepoError" className={styles.error} role="alert">
              {githubError}
            </p>
          )}
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
        <label id="scopeGroupLabel">Scope</label>
        <div role="group" aria-labelledby="scopeGroupLabel" style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
          {(["all", "single"] as const).map((opt) => (
            <Button
              key={opt}
              type="button"
              variant={scope === opt ? "contained" : "outlined"}
              size="small"
              aria-pressed={scope === opt}
              onClick={() => setScope(opt)}
            >
              {opt === "all" ? "All assignments" : "Single assignment"}
            </Button>
          ))}
        </div>
        {scope === "single" && (
          <div style={{ marginTop: "var(--space-2)" }}>
            {!zipFile ? (
              <p className={styles.fieldHint}>Select a course zip above to choose an assignment.</p>
            ) : foldersLoading ? (
              <p className={styles.fieldHint} role="status" aria-live="polite">Reading assignments…</p>
            ) : foldersError ? (
              <p className={styles.error} role="alert">
                {foldersError}
              </p>
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
              <p className={styles.fieldHint}>No assignments found in the zip.</p>
            )}
          </div>
        )}
      </div>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <Button
        variant="contained"
        size="small"
        onClick={handleGenerate}
        disabled={status === "loading" || (scope === "single" && !selectedSlug)}
      >
        {generateButtonLabel({ status, scope, confirmArmed: generateArmed })}
      </Button>

      {generateArmed && (
        <p role="alert" className={styles.error} style={{ marginTop: "var(--space-1)" }}>
          {generateConfirmMessage(plans.length)}
        </p>
      )}

      {status === "loading" && (
        <div className={styles.loadingState} role="status" aria-live="polite">
          <div className={styles.spinner} />
          <div>
            <p className={styles.loadingTitle}>
              {scope === "single" ? "Generating this module…" : "Generating your lecture plans…"}
            </p>
            <p className={styles.loadingText}>
              This can take several minutes for a large course repository. Keep this tab open — closing it or
              navigating away cancels the request and you will lose the result.
            </p>
          </div>
        </div>
      )}

      {status === "done" && plans.length === 0 && courseEngineMaterials && (
        <div
          style={{
            marginTop: "var(--space-2)",
            padding: "var(--space-3) var(--space-4)",
            borderRadius: "var(--radius-md)",
            background: "var(--field-background)",
            border: "1px solid var(--field-border)",
          }}
        >
          <p style={{ margin: "0 0 var(--space-2)", color: "var(--text-primary)" }}>
            {courseEngineDoneMessage(courseEngineMaterials.fileName)}
          </p>
          <Button
            variant="outlined"
            size="small"
            onClick={() =>
              downloadBase64File(
                courseEngineMaterials.base64,
                courseEngineMaterials.fileName,
                courseEngineMaterials.mimeType
              )
            }
          >
            Download again
          </Button>
        </div>
      )}

      {plans.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)", marginTop: "var(--space-2)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "var(--space-3)" }}>
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
                  padding: "var(--space-3) var(--space-4)",
                  borderRadius: "var(--radius-md)",
                  background: "var(--warning-surface)",
                  border: "1px solid var(--warning-border)",
                  color: "var(--text-primary)",
                  fontSize: "var(--font-size-md)",
                  lineHeight: "var(--line-normal)",
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

          <LecturePlanCardList
            plans={plans}
            originalPlans={originalPlans}
            regeneratingIndex={regeneratingIndex}
            regenerateArmed={regenerateArmed}
            onSelect={setSelectedIndex}
            onRegenerateClick={handleRegenerateClick}
          />
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

      <LecturePlanningRubricSection
        provider={provider}
        rubricStatus={rubricStatus}
        rubricError={rubricError}
        generatedRubric={generatedRubric}
        rubricCopied={rubricCopied}
        onGenerate={handleGenerateRubric}
        onCopy={handleCopyRubric}
        onDownloadCsv={handleDownloadRubricCsv}
      />
    </>
  );
}
