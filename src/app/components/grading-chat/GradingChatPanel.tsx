"use client";

// GRADING-CHAT wave 1 (docs/grading-chat-waves.md section 4a, N4a). The new
// sixth Grading sub-tab: instructions + rubric set once (AC-17), then a
// continuous stream of submissions each independently kicks off a grading
// effort that appends a row to a growing results table (AC-5/AC-6/AC-7).
//
// Layout order (docs/grading-chat-ux.md section 2): Instructions -> Rubric ->
// Results table -> Composer - the composer anchored at the point new turns
// enter, the results table growing above it, never replacing it
// (append-vs-reset is the surface's whole leverage over a plain chat).
//
// Mounted as an always-rendered, display-toggled top-level sibling of
// RecordingTab in page.tsx (P2) - this component itself does not know or care
// about visibility; the wrapper's display:none/undefined toggle is what
// preserves the in-flight run across navigation (architecture section 7).
import { useEffect, useRef, useState, type DragEvent } from "react";
import { fetchCanvasMetaAction } from "../../actions/grading";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import GradingResults from "../GradingResults";
import RubricProvenance from "../grading-results/RubricProvenance";
import GeneratedRubricCard from "../grading-results/GeneratedRubricCard";
import { ChatComposer } from "./ChatComposer";
import { LatestResultCard } from "./LatestResultCard";
import { selectLatestResult } from "./latestGradedResult";
import { useContinuousGradingRun, type SubmitOutcome } from "./useContinuousGradingRun";
import SegmentedToggle from "../ui/SegmentedToggle";
import {
  coerceFeedbackWordTarget,
  FEEDBACK_WORD_TARGET_MAX,
  FEEDBACK_WORD_TARGET_MIN,
  type GradeHarshness,
} from "@/lib/grade/types";
import { resolveSetupFill, type ResolveSetupFillResult } from "./chatSetupFill";
import { submitFilesSequentially } from "./chatFileBatch";
import type { CompositePartInput } from "./chatSubmissionIntake";
import { deriveChatScope, describeChatSetupOrigin, loadChatSetupMemory, saveChatSetupMemory } from "./chatSetupMemory";
import type { PreviewFile } from "../FilePreviewModal";
import { chatSeamNowMs, classifyChatSeamFailure, recordChatSeamSettled } from "./chatSeamDiagnostic";
import { preflightUploadFile } from "@/lib/grade/zip-upload-preflight";
import { chooseZipTransport, deleteGradingZipBestEffort, uploadGradingZip } from "@/lib/grade/grading-zip-transport";
import { useSupabase } from "@/context/SupabaseProvider";
import styles from "../../page.module.css";
import chatStyles from "./grading-chat.module.css";
import controls from "../recording/RecordingControls.module.css";

// RG-CLEANUP: the two older global slots (ta-grading-chat-instructions and
// ta-grading-chat-rubric) are FROZEN pre-upgrade values and are no longer read
// at all: seeding the fields from them surfaced a stale value that reflects
// nothing. The setup fields start blank; the Canvas-scoped chat memory
// (chatSetupMemory.ts, restored inside ensureSession) is the only persistence.

// RES-GC-11 (docs/grading-chat-reliability.md section 4): the reliability
// floor. This session is held in memory only - a reload, tab close, or crash
// loses every accumulated row and anything still grading. Shown persistently
// (not only after the loss), so the instructor can plan a stopping point.
export const CHAT_SESSION_NOT_SAVED_DISCLOSURE =
  "This session is not saved. Reloading or closing this tab loses every graded row and anything still grading.";

// Grading harshness (docs/grading-chat-controls-scope.md item 3): persisted as
// a UI preference, captured once at beginSession and frozen for the session.
const HARSHNESS_STORAGE_KEY = "ta-grading-chat-harshness";

function loadHarshness(): GradeHarshness {
  try {
    const stored = localStorage.getItem(HARSHNESS_STORAGE_KEY);
    if (stored === "lenient" || stored === "strict" || stored === "balanced") return stored;
  } catch {
    // Private window / blocked storage: degrade to the default.
  }
  return "balanced";
}

function persistHarshness(level: GradeHarshness) {
  try {
    localStorage.setItem(HARSHNESS_STORAGE_KEY, level);
  } catch {
    // ignore
  }
}

// Feedback word-count target (docs/feedback-length-control-scope.md): the raw
// field text is persisted, and coerced to a number only at the beginSession seam.
const FEEDBACK_LENGTH_STORAGE_KEY = "ta-grading-chat-feedback-length";

function loadFeedbackLength(): string {
  try {
    return localStorage.getItem(FEEDBACK_LENGTH_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function persistFeedbackLength(text: string) {
  try {
    localStorage.setItem(FEEDBACK_LENGTH_STORAGE_KEY, text);
  } catch {
    // ignore
  }
}

export interface GradingChatPanelProps {
  readonly copiedKey: string | null;
  readonly onCopy: (key: string, value: string) => Promise<void>;
  readonly onOpenPreview: (student: string, file: PreviewFile, trigger: HTMLElement) => void;
}

export function GradingChatPanel({ copiedKey, onCopy, onOpenPreview }: GradingChatPanelProps) {
  const [instructions, setInstructions] = useState("");
  const [rubric, setRubric] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [setupNote, setSetupNote] = useState<string | null>(null);
  const [harshness, setHarshness] = useState<GradeHarshness>("balanced");
  const [feedbackLengthText, setFeedbackLengthText] = useState("");
  const [preparing, setPreparing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const sessionRefusalRef = useRef("Set instructions and a rubric before submitting.");

  const driver = useContinuousGradingRun({ provider: "gemini", commentSplit: true });
  const { supabase, user } = useSupabase();

  // Restore the stored harshness after mount (a state initializer would
  // mismatch the server render); setState only after an await.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await Promise.resolve(loadHarshness());
      if (!cancelled) setHarshness(stored);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Same mount-effect restore as harshness (no state initializer: hydration).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await Promise.resolve(loadFeedbackLength());
      if (!cancelled) setFeedbackLengthText(stored);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const changeFeedbackLength = (next: string) => {
    setFeedbackLengthText(next);
    persistFeedbackLength(next);
  };

  const selectHarshness = (next: GradeHarshness) => {
    setHarshness(next);
    persistHarshness(next);
  };

  const handleInstructionsChange = (value: string) => setInstructions(value);
  const handleRubricChange = (value: string) => setRubric(value);

  // Silent-green fix (docs/grading-chat-wave1-verify.md, attack 9): beginSession
  // captures the header ONCE and every later submit grades against that first
  // capture (idempotent by design). Leaving the fields editable after that
  // point let an instructor edit the rubric mid-session and silently grade the
  // next student against the stale text. Locking the fields once the session
  // is established closes that path by construction - they cannot diverge from
  // what was actually captured because they can no longer be edited.
  const sessionReady = driver.headerState === "ready";

  const handleNewSession = () => {
    if (
      typeof window !== "undefined" &&
      !window.confirm("Start a new session? This discards every graded row from the current session so you can grade a different assignment.")
    ) {
      return;
    }
    driver.reset();
    setSubmitError(null);
    setSetupNote(null);
  };

  // Marks the submit intake (extraction, session start) as in progress so the
  // composer shows busy until the awaits settle, success or failure.
  const withPreparing = async (work: () => Promise<void>) => {
    setPreparing(true);
    try {
      await work();
    } finally {
      setPreparing(false);
    }
  };

  // Resolve the setup fields (typed text always wins; Canvas then stored memory
  // fill only blank fields) and begin the session with the RESOLVED values passed
  // explicitly: the instructions/rubric state captured by this closure is stale
  // until the next render, so it must not be what beginSession reads. The Canvas
  // fetch is awaited BEFORE beginSession.
  const ensureSession = async (canvasUrl?: string): Promise<boolean> => {
    if (driver.headerState === "ready") return true;
    const scope = canvasUrl ? deriveChatScope(canvasUrl) : "";
    const needsFill = !instructions.trim() || !rubric.trim();

    let canvasMeta: { instructions: string; rubric: string } | null = null;
    if (canvasUrl && scope && needsFill) {
      const metaStartedAtMs = chatSeamNowMs();
      const meta = await fetchCanvasMetaAction(canvasUrl.trim());
      recordChatSeamSettled({
        operation: "fetch_canvas_meta",
        startedAtMs: metaStartedAtMs,
        failureClass: "error" in meta ? classifyChatSeamFailure(meta.error) : null,
      });
      if (!("error" in meta)) canvasMeta = { instructions: meta.description, rubric: meta.rubricText };
    }
    const loaded = scope && needsFill ? loadChatSetupMemory(scope) : null;
    const fill: ResolveSetupFillResult = resolveSetupFill({
      typed: { instructions, rubric },
      canvasMeta,
      storedMemory: loaded ? { instructions: loaded.entry.instructions ?? "", rubric: loaded.entry.rubric } : null,
    });
    if (fill.instructions !== instructions) setInstructions(fill.instructions);
    if (fill.rubric !== rubric) setRubric(fill.rubric);

    const result = await driver.beginSession({ assignmentInstructions: fill.instructions, rubric: fill.rubric,
      harshness,
      feedbackWordTarget: coerceFeedbackWordTarget(feedbackLengthText),
    });
    if (result.kind === "refused") {
      sessionRefusalRef.current = result.reason;
      setSubmitError(result.reason);
      return false;
    }
    setSubmitError(null);
    if (scope) saveChatSetupMemory(scope, { rubric: fill.rubric, instructions: fill.instructions });
    const notes: string[] = [];
    if (fill.instructionsSource === "canvas" || fill.rubricSource === "canvas") {
      notes.push("Instructions and rubric not typed here were read from Canvas.");
    }
    if (loaded && (fill.instructionsSource === "memory" || fill.rubricSource === "memory")) {
      notes.push(describeChatSetupOrigin(loaded, scope));
    }
    setSetupNote(notes.length > 0 ? notes.join(" ") : null);
    return true;
  };

  const handleSubmitText = (content: string, label: string | undefined) =>
    withPreparing(async () => {
      if (!(await ensureSession())) return;
      const outcome = await driver.submit({ kind: "text", content, label });
      setSubmitError(outcome.kind === "accepted" ? null : outcome.reason);
    });
  // Uploads a large zip straight to Storage, then hands the path to the
  // driver. If the ingest call rejects or throws, the temp object is removed
  // best-effort (R10); the server's own delete and the orphan sweep remain the
  // real guarantees.
  const submitStoragedZip = async (file: File): Promise<SubmitOutcome> => {
    if (!user) return { kind: "refused", reason: "You must be signed in to upload a zip." };
    const uploaded = await uploadGradingZip(supabase.storage, user.id, file);
    if (!uploaded.ok) return { kind: "refused", reason: uploaded.message };
    try {
      const outcome = await driver.submit({ kind: "storaged-zip", storagePath: uploaded.storagePath, name: file.name });
      if (outcome.kind === "refused") await deleteGradingZipBestEffort(supabase.storage, uploaded.storagePath);
      return outcome;
    } catch (err) {
      await deleteGradingZipBestEffort(supabase.storage, uploaded.storagePath);
      throw err;
    }
  };
  const handleSubmitFiles = (files: File[], label?: string) => withPreparing(async () => {
    // A label names ONE student's ONE submission: forwarded only for a
    // single-file pick; a multi-file batch falls back to the filenames.
    const fileLabel = files.length === 1 ? label : undefined;
    // The session is begun once for the whole batch, not once per file.
    let began = false;
    const outcomes = await submitFilesSequentially<SubmitOutcome>(files, async (file) => {
      // FIX-1 size pre-flight: an oversized file is refused here, with a
      // worded reason, before the session starts or any bytes are uploaded.
      // BULK-ZIP BW1: a zip over the body budget takes the Storage transport
      // (when the ingest exists) instead of being refused here; every other
      // file keeps the body pre-flight unchanged.
      const transport = chooseZipTransport(file);
      if (transport.kind === "refused") return { kind: "refused", reason: transport.message };
      const preflight = transport.kind === "storage" ? { ok: true as const } : preflightUploadFile(file, "This file");
      if (!preflight.ok) return { kind: "refused", reason: preflight.message };
      if (!began) {
        if (!(await ensureSession())) {
          return { kind: "refused", reason: sessionRefusalRef.current };
        }
        began = true;
      }
      if (transport.kind === "storage") return submitStoragedZip(file);
      return driver.submit({ kind: "file", file, label: fileLabel });
    });
    const reasons: string[] = [];
    outcomes.forEach((outcome, index) => {
      if (outcome.kind !== "accepted") reasons.push(`${files[index].name}: ${outcome.reason}`);
    });
    setSubmitError(reasons.length > 0 ? reasons.join(" ") : null);
  });
  const handleSubmitUrl = (url: string, label?: string) =>
    withPreparing(async () => {
      if (!(await ensureSession(url))) return;
      const outcome = await driver.submit({ kind: "url", url, label });
      setSubmitError(outcome.kind === "accepted" ? null : outcome.reason);
    });

  const handleSubmitComposite = (student: string, parts: CompositePartInput[]) =>
    withPreparing(async () => {
      if (!(await ensureSession())) return;
      const outcome = await driver.submit({ kind: "composite", student, parts });
      setSubmitError(outcome.kind === "accepted" ? null : outcome.reason);
    });

  // Clear controls: uncommitted draft text only, so no confirm. Pre-lock only;
  // the setup fields do not exist once the session is ready.
  const handleClearInstructions = () => setInstructions("");
  const handleClearRubric = () => setRubric("");
  const handleClearAll = () => {
    setInstructions("");
    setRubric("");
  };

  const busy = driver.headerState === "resolving";
  const hasRows = driver.run !== null && driver.run.results.length > 0;

  // Whole-view drop target: dropping files anywhere on the grading chat
  // panel (not just the narrow composer strip) submits them for grading.
  // The composer's own drop handler stops propagation, so a drop there stays
  // tray-aware and does not also reach this handler.
  const handlePanelDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    if (busy || preparing) return;
    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) handleSubmitFiles(files);
  };

  return (
    <div
      className={`${styles.card} ${styles.form}`}
      onDragOver={(event) => {
        if (busy || preparing) return;
        event.preventDefault();
        if (!isDragging) setIsDragging(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setIsDragging(false);
      }}
      onDrop={handlePanelDrop}
      style={
        isDragging
          ? { outline: "2px dashed var(--accent)", outlineOffset: "-2px", borderRadius: "var(--radius-sm)" }
          : undefined
      }
    >
      {!sessionReady ? (
        <>
          <div className={chatStyles.compactField}>
            <label htmlFor="grading-chat-instructions">Assignment instructions</label>
            <TextField
              id="grading-chat-instructions"
              multiline
              minRows={3}
              fullWidth
              size="small"
              value={instructions}
              onChange={(event) => handleInstructionsChange(event.target.value)}
              disabled={sessionReady}
            />
            {instructions !== "" && (
              <Button variant="text" size="small" aria-label="Clear assignment instructions" onClick={handleClearInstructions}>
                Clear
              </Button>
            )}
          </div>

          <div className={chatStyles.compactField}>
            <label htmlFor="grading-chat-rubric">Rubric</label>
            <TextField
              id="grading-chat-rubric"
              multiline
              minRows={3}
              fullWidth
              size="small"
              value={rubric}
              onChange={(event) => handleRubricChange(event.target.value)}
              disabled={sessionReady}
            />
            {rubric !== "" && (
              <Button variant="text" size="small" aria-label="Clear rubric" onClick={handleClearRubric}>
                Clear
              </Button>
            )}
          </div>
        </>
      ) : (
        <p className={chatStyles.setupSummary}>Instructions and rubric are set for this session.</p>
      )}

      <div className={styles.ghActions}>
        <SegmentedToggle
          label="Grading strictness"
          showLabel
          options={[
            { value: "lenient", label: "Lenient" },
            { value: "balanced", label: "Balanced" },
            { value: "strict", label: "Strict" },
          ]}
          value={harshness}
          onChange={selectHarshness}
          disabled={sessionReady}
        />
        <TextField
          type="number"
          size="small"
          label="Feedback word count (optional)"
          value={feedbackLengthText}
          onChange={(event) => changeFeedbackLength(event.target.value)}
          disabled={sessionReady}
          slotProps={{
            htmlInput: { min: FEEDBACK_WORD_TARGET_MIN, max: FEEDBACK_WORD_TARGET_MAX, step: 10 },
          }}
        />
        {!sessionReady && (instructions !== "" || rubric !== "") && (
          <Button variant="text" size="small" aria-label="Clear all setup fields" onClick={handleClearAll}>
            Clear all
          </Button>
        )}
      </div>

      <div className={chatStyles.sessionBar}>
        <div className={chatStyles.sessionMeta}>
          <p className={styles.ghMeta}>{CHAT_SESSION_NOT_SAVED_DISCLOSURE}</p>
          {sessionReady && (
            <p className={styles.ghMeta}>Instructions and rubric are locked for this session.</p>
          )}
          {setupNote && <p className={styles.ghMeta}>{setupNote}</p>}
        </div>
        <Button variant="outlined" size="small" disabled={driver.headerState === "unset" || preparing} onClick={handleNewSession}>
          New session
        </Button>
      </div>

      {hasRows && driver.run ? (
        <div className={chatStyles.stream}>
        {driver.run && <RubricProvenance run={driver.run} />}
        {driver.generatedRubric && <GeneratedRubricCard generatedRubric={driver.generatedRubric} />}
        <GradingResults
          run={driver.run}
          canvasUrl={driver.canvasUrl}
          runKey={driver.runKey}
          editsSurface={driver.runKey}
          assignmentName=""
          copiedKey={copiedKey}
          onCopy={onCopy}
          onOpenPreview={onOpenPreview}
          searchable
          onRegrade={driver.regrade}
          unresolvedStudents={driver.unresolvedStudents}
        />
        </div>
      ) : (
        <p className={chatStyles.streamEmpty}>Set instructions and a rubric above, then drop in your first submission below.</p>
      )}

      <div className={chatStyles.stickyComposer}>
        {hasRows && driver.run && (
          <LatestResultCard
            result={selectLatestResult(driver.run)}
            copiedKey={copiedKey}
            onCopy={onCopy}
            unresolvedStudents={driver.unresolvedStudents}
          />
        )}
        {submitError && (
          <p role="alert" className={`${controls.notice} ${controls.noticeDanger}`}>
            {submitError}
          </p>
        )}
        {(() => {
          // "Still grading" is driven by WORK OUTSTANDING (dispatched but not
          // yet arrived), NOT driver.inFlight (only the active concurrency
          // slots). inFlight drops to 0 in the gap between intake finishing and
          // the first dispatch, and whenever submissions are queued behind the
          // concurrency limit - so keying on it made the indicator vanish while
          // grading was still going. outstanding stays > 0 from the moment an
          // entry is queued (set synchronously, before `preparing` clears)
          // until its result arrives.
          const outstanding = driver.dispatchedCount - driver.completedCount;
          if (!preparing && outstanding <= 0) return null;
          return (
            <div className={styles.loadingState} role="status" aria-live="polite" aria-busy="true">
              <span className={styles.spinner} aria-hidden="true" />
              <div>
                <p className={styles.loadingTitle}>
                  {preparing && outstanding <= 0 ? "Reading your submission..." : "Grading in progress"}
                </p>
                {outstanding > 0 && (
                  <p className={styles.loadingText}>
                    {`${outstanding} submission${outstanding === 1 ? "" : "s"} still grading (${driver.completedCount} of ${driver.dispatchedCount} done)`}
                  </p>
                )}
              </div>
            </div>
          );
        })()}
        <ChatComposer
          disabled={busy || preparing}
          onSubmitText={handleSubmitText} onSubmitFiles={handleSubmitFiles} onSubmitUrl={handleSubmitUrl}
          onSubmitComposite={handleSubmitComposite}
        />
      </div>
    </div>
  );
}

export default GradingChatPanel;
