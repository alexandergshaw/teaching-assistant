"use client";

import type { ChangeEvent, RefObject } from "react";
import { startTransition, useEffect, useRef, useState } from "react";
import {
  fetchCanvasMetaAction,
  type GradeActionState,
  type TestGeminiState,
} from "../actions";
import type { PreviewFile } from "./FilePreviewModal";
import type { CanvasQueueItem } from "@/lib/canvas";
import GeneratedRubricCard from "./grading-results/GeneratedRubricCard";
import { useLlmProvider } from "@/lib/llm-provider";
import { useInstitutionCounts } from "./InstitutionCounts";
import { detectCanvasUrlKind } from "@/lib/canvas-url";
import { submitOnEnter } from "./ui/submitOnEnter";
import LiveFeedPanel from "./LiveFeedPanel";
import GradingResults from "./GradingResults";
import GithubGradingPanel from "./GithubGradingPanel";
import CartridgeDropPanel from "./CartridgeDropPanel";
import RubricProvenance from "./grading-results/RubricProvenance";
import { loadRubricMemory, saveRubricMemory, describeRubricOrigin } from "@/lib/grade/rubric-memory";
import { isCanvasCredentialRequiredError, CANVAS_CREDENTIAL_CTA_HREF, CANVAS_CREDENTIAL_CTA_LABEL } from "@/lib/canvas-credential-cta";
// A39 wave 4c (docs/a39-waves.md 8.4.3): every DECISION lives in this .ts
// hook; this file only wires startReview/submitWholeRun (step S5).
import { useIncrementalGradingRun } from "./grading/useIncrementalGradingRun";
// A39 incremental-fill W5 (docs/a39-fill-waves.md): the pure precedence,
// identity and copy leaf behind "one machine, one mount, one door" -
// GradingTab only wires these, every DECISION lives in incrementalRunPlan.ts.
import { selectDisplayRun, selectRunKey, isTerminal } from "./grading/incrementalRunPlan";
import { describeRunProgress, shouldShowEmptyState } from "./grading/runProgressCopy";
import { runResetKey } from "./grading-results/gradingResultsHelpers";
import GradingPictureField from "./grading/GradingPictureField";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import styles from "../page.module.css";

type GradingMode = "zip" | "canvas" | "livefeed" | "github";

// A39 wave 1 ("one submission needs no zip"): every extension
// classifyGradingUpload (src/lib/grade/single-file-entry.ts) treats as
// "single" - i.e. every non-zip type the server can grade directly without
// an archive. Kept in sync with TEXT_EXTENSIONS/DOCUMENT_EXTENSIONS/
// IMAGE_EXTENSIONS (src/lib/office-extract.ts, src/lib/grade/constants.ts)
// by hand: this is a client component and cannot import those server-only
// modules (JSZip, officeparser) directly.
const SINGLE_SUBMISSION_EXTENSIONS = [
  ".txt", ".md", ".markdown", ".py", ".js", ".ts", ".tsx", ".jsx", ".java",
  ".c", ".cpp", ".cs", ".html", ".htm", ".css", ".json", ".xml", ".rb",
  ".go", ".rs", ".csv", ".tsv", ".dat", ".in", ".ipynb", ".yml", ".yaml",
  ".sql", ".sh", ".bash", ".zsh", ".php", ".swift", ".kt", ".kts", ".scala",
  ".r", ".m", ".tex",
  ".docx", ".doc", ".pptx", ".ppt", ".xlsx", ".xls", ".odt", ".odp", ".ods",
  ".pdf", ".rtf",
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".heic", ".heif",
];
const STUDENT_SUBMISSIONS_ACCEPT = [".zip", "application/zip", ...SINGLE_SUBMISSION_EXTENSIONS].join(",");

// A39 wave 2: path A's own ta- key for rubric-memory.ts, scoped per
// uploaded file name ("upload:<name>") - never a single global slot. DECISION
// 9 (docs/owner-decisions-2026-09-23.md): ships with no exact-set canary;
// write one when a sixth ta- key lands in this directory, covering all of them.
const RUBRIC_MEMORY_STORAGE_KEY = "ta-grading-rubric-memory";

type GradingTabProps = {
  formAction: (payload: FormData) => void;
  pending: boolean;
  state: GradeActionState;
  testState: TestGeminiState;
  copiedKey: string | null;
  onCopy: (key: string, value: string) => Promise<void>;
  /** `trigger` is the clicked opener element, forwarded to page.tsx
   * (this file has no call site of its own - see GradingResults.tsx). */
  onOpenPreview: (student: string, file: PreviewFile, trigger: HTMLElement) => void;
  /** Focus restoration (docs/modal-focus-restoration-acceptance-criteria.md,
   * wave R3 bug report finding 3): page.tsx's own fallback for
   * FilePreviewModal, nearer than `previewFallbackRef` (the whole-app tab
   * container) because it names GradingResults.tsx's `<section>` instead -
   * a container the Preview button's row can unmount out of, several
   * screens closer to where the click actually happened. Threaded through
   * the EXISTING `resultsRef`/`sectionRef` channel below (merged, not a
   * second ref pipeline) rather than inventing one: `resultsRef` already
   * reaches that section for the scroll-into-view effect, so this prop only
   * adds a second writer to the same callback ref. */
  resultsSectionFallbackRef?: RefObject<HTMLElement | null>;
};

export default function GradingTab({
  formAction,
  pending,
  state,
  testState,
  copiedKey,
  onCopy,
  onOpenPreview,
  resultsSectionFallbackRef,
}: GradingTabProps) {
  const [selectedProvider] = useLlmProvider();
  const { refresh: refreshCounts, totalNeedsGrading } = useInstitutionCounts();
  // Grade-in-context: which Live Feed row is being graded, a signal to refetch
  // the queue after posting, and a ref to scroll the results into view.
  const [gradingTarget, setGradingTarget] = useState<{
    title: string;
    courseName: string;
    key: string;
  } | null>(null);
  const [queueRefreshSignal, setQueueRefreshSignal] = useState(0);
  const resultsRef = useRef<HTMLDivElement>(null);
  const [source, setSource] = useState<GradingMode>(() => {
    if (typeof window === "undefined") return "zip";
    const saved = localStorage.getItem("ta-grading-source");
    return saved === "canvas" || saved === "livefeed" || saved === "github" ? saved : "zip";
  });
  const [canvasUrl, setCanvasUrl] = useState("");
  const [canvasRetrieved, setCanvasRetrieved] = useState(false);
  const [assignmentInstructions, setAssignmentInstructions] = useState("");
  const [rubric, setRubric] = useState("");
  // A39 wave 2: the visible origin label for path A's rubric-memory restore
  // (docs/a39-architecture.md 6.3, "the field IS the receipt").
  const [rubricOrigin, setRubricOrigin] = useState<string | null>(null);
  // What THIS component last restored into the two fields, so a later
  // restore can tell "edited since" apart from "still what we put there"
  // (architecture 6.2.1).
  const lastRestoredRef = useRef<{ instructions: string; rubric: string } | null>(null);
  // The chosen upload's name - the save side of the "upload:<name>" scope
  // key the restore handler below uses.
  const [uploadFileName, setUploadFileName] = useState("");

  const [canvasMeta, setCanvasMeta] = useState<{ status: "idle" | "loading" | "done" | "error"; message: string }>({ status: "idle", message: "" });

  const selectSource = (next: GradingMode) => {
    setSource(next);
    if (typeof window !== "undefined") localStorage.setItem("ta-grading-source", next);
  };

  const canvasUrlKind = detectCanvasUrlKind(canvasUrl);
  const graderLabel =
    selectedProvider === "other"
      ? "deterministic grader (against your CSV/JSON rubric)"
      : selectedProvider === "embedded"
        ? "embedded deterministic engine (rule-based checks, no AI; the rubric is used if present, otherwise generated from the instructions)"
        : "AI grader";

  // Retrieve the assignment/discussion description + rubric from Canvas and show
  // them as read-only fields. Triggered by the button below the URL.
  const handleRetrieveCanvas = async () => {
    const url = canvasUrl.trim();
    if (!url || !detectCanvasUrlKind(url)) {
      setCanvasMeta({ status: "error", message: "Enter a valid Canvas discussion or assignment URL first." });
      return;
    }
    setCanvasMeta({ status: "loading", message: "Retrieving details from Canvas…" });

    const result = await fetchCanvasMetaAction(url);
    if ("error" in result) {
      setCanvasMeta({ status: "error", message: result.error });
      return;
    }

    setAssignmentInstructions(result.description);
    setRubric(result.rubricText);
    setCanvasRetrieved(true);

    const parts: string[] = [];
    if (result.description) parts.push("instructions");
    if (result.rubricText) parts.push("rubric");
    const base = parts.length
      ? `Retrieved ${parts.join(" + ")} from Canvas.`
      : "Retrieved from Canvas.";
    const noRubric = result.rubricText
      ? ""
      : " No rubric was found in Canvas; none will be synthesized. Grading uses the assignment instructions only (attach a rubric in Canvas for per-criterion scoring).";
    const caveat =
      selectedProvider === "other" && result.rubricText
        ? " Note: the deterministic grader needs a check-based CSV/JSON rubric; this Canvas rubric may not map to automated checks."
        : "";
    setCanvasMeta({ status: "done", message: base + noRubric + caveat });
  };

  const run = state.run;

  // A39 wave 4c, step S5 (RULING 40); A39 incremental-fill W5 (architecture
  // 5.4): every whole-run dispatch now goes through beginWholeRun (the hook's
  // ONE door) before reaching here, so this is the file's only remaining
  // direct formAction( call site - A5's count is now exactly one.
  const submitWholeRun = (fd: FormData) => {
    startTransition(() => {
      formAction(fd);
    });
  };
  const {
    startReview,
    cancel: cancelIncrementalRun,
    beginWholeRun,
    phase,
    incrementalRunning,
    incrementalRun,
    runId,
    incrementalDone,
    incrementalTotal,
    incrementalError,
  } = useIncrementalGradingRun({ provider: selectedProvider, submitWholeRun });

  // A39 incremental-fill W5 (architecture 5.3): the ONE object the merged
  // mount renders, and the identity that distinguishes "a new run" from "the
  // same run, one row longer" (RULING 131).
  const displayRun = selectDisplayRun(phase, incrementalRun, run);
  const runKey = selectRunKey(phase, runId);
  const progressLine = describeRunProgress(phase, incrementalDone, incrementalTotal);
  const terminalLine = isTerminal(phase) ? describeRunProgress(phase, incrementalDone, incrementalTotal) : null;

  // Live Feed "Auto Grade": grade a queue row through the very same pipeline as
  // the Single Assignment form. Set canvasUrl so a later "Post grades" targets
  // this assignment, then dispatch the grade action with the row's context.
  const handleAutoGrade = (row: CanvasQueueItem) => {
    setCanvasUrl(row.canvasUrl);
    const fd = new FormData();
    fd.set("canvasUrl", row.canvasUrl);
    fd.set("assignmentInstructions", row.description || row.title);
    fd.set("rubric", row.rubricText);
    fd.set("provider", selectedProvider);
    fd.set("institution", row.institution);
    startTransition(() => {
      setGradingTarget({ title: row.title, courseName: row.courseName, key: `${row.kind}-${row.id}` });
      // A39 incremental-fill W5 (architecture 5.4): the ONE door - every
      // whole-run dispatch goes through it, so a whole-run object can never
      // travel with a stale incremental runKey.
      beginWholeRun(fd);
    });
  };

  // Scroll the results into view when a new grading run arrives (so Auto Grade
  // from the tall queue lands you on the results instead of leaving you scrolled up).
  // A39 incremental-fill W5 (architecture 10, M6): the dependency is the run
  // IDENTITY, not the run reference - reusing RULING 131's own construction -
  // so this fires at most once per run rather than once per arrival.
  useEffect(() => {
    if (displayRun && resultsRef.current) {
      resultsRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    // The dependency is the run IDENTITY (F25), deliberately not `displayRun`
    // itself: that object changes on every arrival, and firing on each one
    // would scroll-jack the reader (architecture 10, M6).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runResetKey(runKey, displayRun), incrementalDone > 0]);

  const handleAssignmentInstructionsChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => setAssignmentInstructions(e.target.value);

  const handleRubricChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setRubric(e.target.value);

  // A39 wave 2, path A (docs/a39-architecture.md 6.2.1): nothing is
  // restored until a file is chosen, scoped to that file's own name; an
  // edited field is left alone rather than overwritten.
  const handleUploadFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const name = e.target.files?.[0]?.name ?? "";
    setUploadFileName(name);
    if (!name) return;
    const loaded = loadRubricMemory(RUBRIC_MEMORY_STORAGE_KEY, `upload:${name}`);
    if (!loaded) return;
    const last = lastRestoredRef.current;
    const iOk = assignmentInstructions === "" || assignmentInstructions === last?.instructions;
    const rOk = rubric === "" || rubric === last?.rubric;
    const nextI = iOk ? loaded.entry.instructions ?? "" : assignmentInstructions;
    const nextR = rOk ? loaded.entry.rubric : rubric;
    if (iOk) setAssignmentInstructions(nextI);
    if (rOk) setRubric(nextR);
    if (iOk || rOk) {
      lastRestoredRef.current = { instructions: nextI, rubric: nextR };
      setRubricOrigin(describeRubricOrigin(loaded, `upload:${name}`));
    }
  };

  const showContextFields = source === "zip" || canvasRetrieved;

  return (
    <div className={styles.form}>
      <div className={styles.field}>
        <label htmlFor="grade-source">Grade from</label>
        <TextField
          select
          size="small"
          id="grade-source"
          value={source}
          onChange={(e) => selectSource(e.target.value as GradingMode)}
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="zip">Upload ZIP</MenuItem>
          <MenuItem value="canvas">Single Assignment</MenuItem>
          <MenuItem value="livefeed">Live Feed{totalNeedsGrading > 0 ? ` (${totalNeedsGrading})` : ""}</MenuItem>
          <MenuItem value="github">GitHub Repo</MenuItem>
        </TextField>
      </div>

      {source !== "livefeed" && pending && (
        <div className={styles.loadingState} role="status" aria-live="polite">
          <span className={styles.spinner} aria-hidden="true" />
          <div>
            <p className={styles.loadingTitle}>Grading In Progress</p>
            <p className={styles.loadingText}>
              {selectedProvider === "gemini"
                ? "Reviewing submissions now. This can take a moment for larger archives."
                : "Running the grading checks now. This usually only takes a moment."}
            </p>
          </div>
        </div>
      )}

      {(state.error || incrementalError) && (
        <p role="alert" className={styles.error}>
          {state.error || incrementalError}
        </p>
      )}

      {isCanvasCredentialRequiredError(state.error) && (
        <p className={styles.fieldHint}>
          <a href={CANVAS_CREDENTIAL_CTA_HREF} className={styles.lfLink}>
            {CANVAS_CREDENTIAL_CTA_LABEL}
          </a>
        </p>
      )}

      {source === "github" ? (
        <GithubGradingPanel />
      ) : source === "livefeed" ? (
        <LiveFeedPanel
          provider={selectedProvider}
          pending={pending}
          run={run}
          gradingRowKey={gradingTarget?.key ?? null}
          refreshSignal={queueRefreshSignal}
          canvasUrl={canvasUrl}
          copiedKey={copiedKey}
          onCopy={onCopy}
          onOpenPreview={onOpenPreview}
          onAutoGrade={handleAutoGrade}
          onPosted={() => {
            refreshCounts();
            setQueueRefreshSignal((n) => n + 1);
          }}
        />
      ) : (
      <form
        className={styles.form}
        onSubmit={(event) => {
          // A39 wave 4c, step S5: action={formAction} deleted (W4-9b);
          // startReview decides whole-run vs incremental itself.
          event.preventDefault();
          // A39 wave 2: save under the same scope the restore handler reads.
          if (source === "zip" && uploadFileName) {
            saveRubricMemory(RUBRIC_MEMORY_STORAGE_KEY, `upload:${uploadFileName}`, {
              rubric,
              instructions: assignmentInstructions,
            });
          }
          void startReview(new FormData(event.currentTarget));
        }}
      >
        <input type="hidden" name="provider" value={selectedProvider} />
        {source === "zip" ? (
          <div className={styles.field}>
            <label htmlFor="student-submissions">Student Submissions</label>
            <div className={styles.fileField}>
              <input
                id="student-submissions"
                name="studentSubmissions"
                type="file"
                accept={STUDENT_SUBMISSIONS_ACCEPT}
                onChange={handleUploadFileChange}
              />
              <p>Upload a zip archive of student submissions, or a single student&apos;s file (a document, text file, or image) to grade it on its own.</p>
            </div>
          </div>
        ) : (
          <div className={styles.field}>
            <label htmlFor="canvas-url">Canvas URL</label>
            <TextField
              size="small"
              fullWidth
              id="canvas-url"
              name="canvasUrl"
              type="url"
              required
              placeholder="Paste a discussion or assignment link (…/discussion_topics/… or …/assignments/…)"
              value={canvasUrl}
              onChange={(e) => {
                setCanvasUrl(e.target.value);
                setCanvasRetrieved(false);
                setCanvasMeta({ status: "idle", message: "" });
              }}
              onKeyDown={submitOnEnter(handleRetrieveCanvas)}
            />
            <Button
              variant="outlined"
              size="small"
              onClick={handleRetrieveCanvas}
              disabled={canvasMeta.status === "loading" || !canvasUrlKind}
              sx={{ alignSelf: "flex-start" }}
            >
              {canvasMeta.status === "loading" ? "Retrieving…" : "Retrieve from Canvas"}
            </Button>
            <p className={styles.fieldHint}>
              {canvasUrlKind === "discussion"
                ? `Detected: discussion board. Each student's posts and replies are pulled via the Canvas API and graded with the ${graderLabel}.`
                : canvasUrlKind === "assignment"
                  ? `Detected: assignment. Each student's submission text and uploaded files are pulled via the Canvas API and graded with the ${graderLabel}.`
                  : canvasUrl.trim()
                    ? "Unrecognized Canvas URL. Expecting a link like …/courses/123/discussion_topics/456 or …/courses/123/assignments/456."
                    : `Paste a Canvas discussion or assignment link, then retrieve it. The type is detected automatically and graded with the ${graderLabel}.`}
            </p>
            {canvasMeta.status !== "idle" && (
              <p
                className={styles.fieldHint}
                style={{ color: canvasMeta.status === "error" ? "var(--danger)" : undefined }}
              >
                {canvasMeta.message}
              </p>
            )}
          </div>
        )}

        {showContextFields && (
          <>
            <div className={styles.field}>
              <label htmlFor="assignment-instructions">Assignment Instructions</label>
              <TextField
                multiline
                minRows={10}
                maxRows={20}
                fullWidth
                id="assignment-instructions"
                name="assignmentInstructions"
                slotProps={{ input: { readOnly: source === "canvas" } }}
                value={assignmentInstructions}
                onChange={handleAssignmentInstructionsChange}
                placeholder="Paste the assignment brief, requirements, and any special directions."
              />
              {source === "zip" && (<GradingPictureField kind="assignment description" provider={selectedProvider} onExtracted={setAssignmentInstructions} />)}
            </div>

            {(source === "zip" || rubric.trim()) && (
              <div className={styles.field}>
                <label htmlFor="rubric">Rubric</label>
                <TextField
                  multiline
                  minRows={10}
                  maxRows={20}
                  fullWidth
                  id="rubric"
                  name="rubric"
                  slotProps={{ input: { readOnly: source === "canvas" } }}
                  value={rubric}
                  onChange={handleRubricChange}
                  placeholder="Paste the grading rubric, expectations, and scoring guidance."
                />
                {source === "zip" && (<GradingPictureField kind="rubric" provider={selectedProvider} onExtracted={setRubric} />)}
                {rubricOrigin && source === "zip" && (
                  <p className={styles.fieldHint}>{rubricOrigin}</p>
                )}
              </div>
            )}
          </>
        )}

        {selectedProvider === "other" && (
          <div className={styles.field}>
            <label htmlFor="rubric-file">Rubric file (CSV/JSON)</label>
            <input
              id="rubric-file"
              name="rubricFile"
              type="file"
              accept=".csv,.json,application/json,text/csv"
            />
            <p>
              Upload a check-based rubric for the deterministic grader (for example the
              rubric.csv produced by Course materials), or paste one in the Rubric box above.
            </p>
          </div>
        )}

        <Button
          variant="contained"
          size="small"
          type="submit"
          disabled={pending || incrementalRunning || (source === "canvas" && !canvasRetrieved)}
        >
          {pending || incrementalRunning ? (
            <>
              <span className={styles.btnSpinner} aria-hidden="true" />
              Grading…
            </>
          ) : (
            "Start Review"
          )}
        </Button>
      </form>
      )}

      {/* W4-8: before the results table; a sibling of the `pending &&` span
          above (A6 requires no `||` there). */}
      {source !== "livefeed" && incrementalRunning && (
        <div className={styles.loadingState} role="status" aria-live="polite">
          <span className={styles.spinner} aria-hidden="true" />
          <p className={styles.loadingTitle}>{progressLine}</p>
          <Button variant="outlined" size="small" onClick={cancelIncrementalRun} disabled={phase === "stopping"}>Stop grading</Button>
        </div>
      )}

      {/* A39 incremental-fill W5 (architecture 7.2, F13): the terminal
          "stopped" sentence's OWN region, a sibling of the region above -
          gated on the SENTENCE EXISTING, never on a row existing, so it
          survives after the pool ends even when zero rows ever arrived. */}
      {source !== "livefeed" && terminalLine && (
        <p className={styles.emptyState} role="status" aria-live="polite">{terminalLine}</p>
      )}

      {testState.result && (
        <p style={{ marginTop: "var(--space-2)", color: "var(--success-ink)" }}>Gemini responded: {testState.result}</p>
      )}
      {testState.error && (
        <p style={{ marginTop: "var(--space-2)", color: "var(--danger)" }}>Gemini error: {testState.error}</p>
      )}

      {/* F12 (docs/a39-fill-waves.md W5): total over all six phases - false
          while a run is in progress or just stopped (that state has its own
          sentence above), true only for idle/complete with a zero-result
          non-null run. */}
      {source !== "livefeed" && shouldShowEmptyState(phase, displayRun) && (
        <p className={styles.emptyState}>
          {source === "zip"
            ? "No supported submission files were found in the zip archive."
            : "Nothing left to grade here. Every submission has already been graded, or no one has submitted yet."}
        </p>
      )}

      {/* A39 incremental-fill W5 (architecture 10): extracted to
          GeneratedRubricCard.tsx - see that file's own header for why. */}
      {state.generatedRubric && <GeneratedRubricCard generatedRubric={state.generatedRubric} />}

      {state.warnings && state.warnings.length > 0 && (
        <section className={styles.checklistCard}>
          <h2>Grading Notes</h2>
          <ul>
            {state.warnings.map((item, index) => (
              <li key={`grading-warning-${index + 1}`}>{item}</li>
            ))}
          </ul>
        </section>
      )}

      {/* A39 incremental-fill W5 (owner-walk item 6): RubricProvenance is NOT
          wired to the incremental route by this fill - that remains an
          owner-walk claim (docs/a39-incremental-fill-architecture.md section
          12, item 6). Gated on `phase === "idle"` so its behaviour for the
          whole-run path is unchanged. */}
      {source !== "livefeed" && phase === "idle" && run && run.results.length > 0 && (
        <RubricProvenance run={run} />
      )}

      {/* A39 incremental-fill W5 (architecture 2, 5.2, 5.5): ONE mount for
          BOTH routes - the merged run and its identity key (RULING 131),
          selected by selectDisplayRun/selectRunKey. Two tables inside one
          GradingTab are unrepresentable by construction; F6b's guard text
          below must stay conjunctive with `source !== "livefeed"` and carry
          no `||` and no `<` comparison. */}
      {source !== "livefeed" && displayRun && displayRun.results.length > 0 && (
        <GradingResults
          run={displayRun}
          runKey={runKey}
          canvasUrl={canvasUrl}
          // A36: this mount and LiveFeedPanel.tsx's own GradingResults mount
          // intentionally share GradingTab's `canvasUrl` state and are
          // mutually exclusive in the UI (`source !== "livefeed"` above), so
          // they share one edits-storage surface ("canvas") - distinct from
          // GithubGradingPanel.tsx's "github", which otherwise collided with
          // this one whenever canvasUrl was empty (see gradingResultsEditsKey
          // in gradingResultsHelpers.ts).
          editsSurface="canvas"
          // A16-1 (docs/a16-scope.md section 4.3): no assignment name source
          // of truth exists on this classic zip/canvas path - GradingTabProps
          // carries none, and gradingTarget is livefeed-only (gated out by
          // `source !== "livefeed"` above). One named hole, not a blanket
          // default: the trends panel's per-assignment copy degrades to
          // "this assignment" (class-trends-draft.ts) rather than reading a
          // wrong name.
          assignmentName=""
          copiedKey={copiedKey}
          onCopy={onCopy}
          onOpenPreview={onOpenPreview}
          onPosted={() => {
            refreshCounts();
            setQueueRefreshSignal((n) => n + 1);
          }}
          // Merged ref (REGRESSION.md entry 287 check 6's pattern): this
          // section already backs the scroll-into-view effect above via
          // resultsRef, and now also backs page.tsx's FilePreviewModal
          // fallback via resultsSectionFallbackRef - one DOM node, two
          // independent readers, no second ref pipeline.
          sectionRef={(el) => {
            resultsRef.current = el;
            if (resultsSectionFallbackRef) resultsSectionFallbackRef.current = el;
          }}
          banner={
            gradingTarget ? (
              <div className={styles.gradingBanner}>
                Grading <strong>{gradingTarget.title}</strong>
                {gradingTarget.courseName ? ` — ${gradingTarget.courseName}` : ""}
              </div>
            ) : undefined
          }
        />
      )}

      <CartridgeDropPanel />
    </div>
  );
}
