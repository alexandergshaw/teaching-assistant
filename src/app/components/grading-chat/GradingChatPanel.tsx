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
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import GradingResults from "../GradingResults";
import RubricProvenance from "../grading-results/RubricProvenance";
import GeneratedRubricCard from "../grading-results/GeneratedRubricCard";
import SubmissionClassificationBadge from "../grading/SubmissionClassificationBadge";
import { ChatComposer } from "./ChatComposer";
import { ChatRepositoryEvidence } from "./ChatRepositoryEvidence";
import { ChatRepositoryMappings } from "./ChatRepositoryMappings";
import { ChatFileRolePreview } from "./ChatFileRolePreview";
import { useChatFileRoles } from "./useChatFileRoles";
import type { ConfirmedRoleSetup } from "./chatFileRoles";
import { LENGTH_DEDUCTION_THRESHOLD_WORDS_DEFAULT, LENGTH_DEDUCTION_THRESHOLD_WORDS_MAX } from "@/lib/grade/length-deduction-policy";
import { LENGTH_THRESHOLD_ERROR, parseLengthDeductionThreshold, recordLengthDeductionThresholdChange } from "./chatLengthDeduction";
import { useChatRepositoryProposals } from "./useChatRepositoryProposals";
import { recordRepositoryCollection, recordRepositoryWorkflow } from "./chatRepositoryDiagnostic";
import { emptyRepositoryEvidence, type RepositoryEvidenceState } from "./chatRepositoryBatch";
import { RecordingSplitConfirm } from "./RecordingSplitConfirm";
import { useContinuousGradingRun, type ItemDiagnostic, type SubmitOutcome } from "./useContinuousGradingRun";
import { buildLedgerView, type LedgerView } from "./ingestLedger";
import { describeRunStatus, type RunStatus } from "./runStatus";
import SegmentedToggle from "../ui/SegmentedToggle";
import { visuallyHidden } from "../ui/visuallyHidden";
import {
  coerceFeedbackWordTarget,
  FEEDBACK_WORD_TARGET_MAX,
  FEEDBACK_WORD_TARGET_MIN,
  type GradeHarshness,
} from "@/lib/grade/types";
import { resolveSetupFill, type ResolveSetupFillResult } from "./chatSetupFill";
import { applyOverride, computeOverrideOffer, countOverriddenFields, type OverrideDecision } from "./chatOverrideOffer";
import { recordGradingDiagnosticEntry } from "../grading/gradingDiagnosticLog";
import { submitFilesSequentially } from "./chatFileBatch";
import type { CompositePartInput } from "./chatSubmissionIntake";
import { deriveChatScope, describeChatSetupOrigin, loadChatSetupMemory, saveChatSetupMemory } from "./chatSetupMemory";
import type { PreviewFile } from "../FilePreviewModal";
import { chatSeamNowMs, classifyChatSeamFailure, recordChatSeamSettled } from "./chatSeamDiagnostic";
import { preflightUploadFile } from "@/lib/grade/zip-upload-preflight";
import {
  chooseSingleFileTransport,
  chooseZipTransport,
  deleteGradingZipBestEffort,
  isZipFileName,
  uploadGradingZip,
} from "@/lib/grade/grading-zip-transport";
import { submitStoragedFile } from "./singleFileClient";
import { recordIntakeGate, safeIntake } from "./chatIntakeDiagnostic";
import { useSupabase } from "@/context/SupabaseProvider";
import { VIDEO_GRADING_ENABLED } from "@/lib/grade/constants";
import { submitLooseVideo } from "./videoClient";
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
// Keys for the shared copiedKey slot owned by page.tsx; not storage keys.
const COPY_KEY_INSTRUCTIONS = "chat-setup-instructions";
const COPY_KEY_RUBRIC = "chat-setup-rubric";
const COPY_KEY_DIAGNOSTICS = "chat-run-diagnostics";

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

// File-name deduction (docs/grading-chat-deduction-controls-scope.md PART A):
// default ON; only an explicit stored "false" turns it off.
const APPLY_NAMING_DEDUCTION_STORAGE_KEY = "ta-grading-chat-apply-naming-deduction";

function loadApplyNamingDeduction(): boolean {
  try {
    return localStorage.getItem(APPLY_NAMING_DEDUCTION_STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

function persistApplyNamingDeduction(on: boolean) {
  try {
    localStorage.setItem(APPLY_NAMING_DEDUCTION_STORAGE_KEY, on ? "true" : "false");
  } catch {
    // ignore
  }
}

// Length deduction (docs/grading-chat-deduction-controls-scope.md PART B):
// default OFF; only an explicit stored "true" turns it on.
const APPLY_LENGTH_DEDUCTION_STORAGE_KEY = "ta-grading-chat-apply-length-deduction";

function loadApplyLengthDeduction(): boolean {
  try {
    return localStorage.getItem(APPLY_LENGTH_DEDUCTION_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function persistApplyLengthDeduction(on: boolean) {
  try {
    localStorage.setItem(APPLY_LENGTH_DEDUCTION_STORAGE_KEY, on ? "true" : "false");
  } catch {
    // ignore
  }
}

export interface GradingChatPanelProps {
  readonly copiedKey: string | null;
  readonly onCopy: (key: string, value: string) => Promise<void>;
  readonly onOpenPreview: (student: string, file: PreviewFile, trigger: HTMLElement) => void;
}

// BULK-ZIP BW4: the persistent ingest ledger. Session state, not a transient
// alert: it renders from the retained driver ledger and the graded rows.
function LedgerNotice({ view }: { view: LedgerView }) {
  if (!view.hasAny) return null;
  return (
    <div className={controls.notice} aria-label="Zip ingest ledger">
      {view.skipped.length > 0 && (
        <p className={styles.ghMeta}>
          {`Skipped (too large): ${view.skipped.map((s) => `${s.student} (${s.reason})`).join("; ")}`}
        </p>
      )}
      {view.linkNotFetched.length > 0 && (
        <p className={styles.ghMeta}>
          {`Link could not be fetched (graded on the link note): ${view.linkNotFetched.map((s) => s.student).join(", ")}`}
        </p>
      )}
      {view.failedFiles.length > 0 && (
        <p className={styles.ghMeta}>{`Files that could not be read: ${view.failedFiles.join(", ")}`}</p>
      )}
      {!view.accountedFor && (
        <p className={styles.ghMeta}>Some students in the zip are not accounted for. Re-upload the zip to check.</p>
      )}
    </div>
  );
}

// WD run-diagnostics panel. Reads the hook's `diagnostics` view model. The copied
// text uses rowLabel ("Row N"), never the student label (the label is page-only).
const diagVal = (d: ItemDiagnostic, key: string): string => String(d.detail[key] ?? "-");
const diagSec = (d: ItemDiagnostic, key: string): string => (typeof d.detail[key] === "number" ? ((d.detail[key] as number) / 1000).toFixed(1) : "-");
function summarizeDiagnostics(items: readonly ItemDiagnostic[]): string {
  const graded = items.filter((d) => d.outcome === "graded").length;
  const secs = items.map((d) => d.detail.serverMs).filter((v): v is number => typeof v === "number");
  const avg = secs.length > 0 ? ((secs.reduce((a, b) => a + b, 0) / secs.length) / 1000).toFixed(1) : "-";
  return `Run diagnostics - ${graded} graded, ${items.length - graded} needs-retry, avg ${avg}s`;
}
function formatDiagnosticsText(items: readonly ItemDiagnostic[]): string {
  return items
    .map((d) => `${d.rowLabel}: ${d.outcome}, model ${diagVal(d, "model")}, server ${diagSec(d, "serverMs")}s, model ${diagSec(d, "modelMs")}s, tokens ${diagVal(d, "promptTokens")}/${diagVal(d, "outputTokens")}, finish ${diagVal(d, "finishReason")}, failure ${diagVal(d, "failure")}, areas ${diagVal(d, "areas")}/${diagVal(d, "areasExpected")}, praise ${diagVal(d, "hasPraise")}, advice ${diagVal(d, "hasAdvice")}, truncated ${diagVal(d, "truncated")}, link ${diagVal(d, "link")}, code ${diagVal(d, "code")}, files ${diagVal(d, "files")}, video ${diagVal(d, "video")}`)
    .join(String.fromCharCode(10));
}
const DIAG_COLUMNS: readonly (readonly [string, string])[] = [
  ["Model", "model"], ["Tokens in", "promptTokens"], ["Tokens out", "outputTokens"], ["Finish", "finishReason"], ["Failure", "failure"],
  ["Areas", "areas"], ["Expected", "areasExpected"], ["Praise", "hasPraise"], ["Advice", "hasAdvice"], ["Truncated", "truncated"],
  ["Link", "link"], ["Code", "code"], ["Files", "files"], ["Video", "video"],
];
function RunDiagnostics({ items, copiedKey, onCopy }: { items: readonly ItemDiagnostic[]; copiedKey: string | null; onCopy: GradingChatPanelProps["onCopy"] }) {
  if (items.length === 0) return null;
  return (
    <details className={styles.generatedRubricCard}>
      <summary>{summarizeDiagnostics(items)}</summary>
      <p className={styles.ghMeta}>Times are in seconds. Copied text uses row numbers, not student names.</p>
      <Button variant="outlined" size="small" onClick={() => void onCopy(COPY_KEY_DIAGNOSTICS, formatDiagnosticsText(items))}>
        {copiedKey === COPY_KEY_DIAGNOSTICS ? "Copied" : "Copy diagnostics"}
      </Button>
      <table className={styles.generatedRubricTable}>
        <thead>
          <tr>
            <th>Row</th><th>Outcome</th><th>Server s</th><th>Model s</th>
            {DIAG_COLUMNS.map(([title]) => <th key={title}>{title}</th>)}
          </tr>
        </thead>
        <tbody>
          {items.map((d, i) => (
            <tr key={`${d.sourceIndex}-${i}`}>
              <td>{d.rowLabel}</td><td>{d.outcome}</td><td>{diagSec(d, "serverMs")}</td><td>{diagSec(d, "modelMs")}</td>
              {DIAG_COLUMNS.map(([title, key]) => <td key={title}>{diagVal(d, key)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

// Live run status. "Still grading" is driven by rows PENDING (queued or in
// flight, including retries and regrades), NOT driver.inFlight alone: inFlight
// drops to 0 between intake finishing and the first dispatch and whenever work is
// queued behind the concurrency limit. The run has no known total, so only honest
// live counts are shown (see runStatus.ts).
function GradingProgress({ status }: { status: RunStatus | null }) {
  if (status === null) return null;
  return (
    <div className={styles.loadingState} role="status" aria-live="polite" aria-busy="true">
      <span className={styles.spinner} aria-hidden="true" />
      <div>
        <p className={styles.loadingTitle}>{status.title}</p>
        {status.detail !== "" && <p className={styles.loadingText}>{status.detail}</p>}
      </div>
    </div>
  );
}

export function GradingChatPanel({ copiedKey, onCopy, onOpenPreview }: GradingChatPanelProps) {
  const [instructions, setInstructions] = useState("");
  const [repositoryEvidence, setRepositoryEvidence] = useState<RepositoryEvidenceState>(emptyRepositoryEvidence);
  const [repositoryEvidenceSession, setRepositoryEvidenceSession] = useState(0);
  const [rubric, setRubric] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [setupNote, setSetupNote] = useState<string | null>(null);
  const [harshness, setHarshness] = useState<GradeHarshness>("balanced");
  const [feedbackLengthText, setFeedbackLengthText] = useState("");
  const [applyNamingDeduction, setApplyNamingDeduction] = useState(true);
  const [applyLengthDeduction, setApplyLengthDeduction] = useState(false);
  const [lengthThresholdText, setLengthThresholdText] = useState(String(LENGTH_DEDUCTION_THRESHOLD_WORDS_DEFAULT));
  const [preparing, setPreparing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [zipPhase, setZipPhase] = useState<"uploading" | "preparing" | null>(null);
  const [intakeNote, setIntakeNote] = useState<string | null>(null);
  const sessionRefusalRef = useRef("Set instructions and a rubric before submitting.");

  const driver = useContinuousGradingRun({ provider: "gemini", commentSplit: true });
  const repositoryProposals = useChatRepositoryProposals({ sessionEpoch: driver.runKey, evidence: repositoryEvidence, students: () => driver.repositoryStudents, driver: driver.repositoryAdapter, onSettled: recordRepositoryCollection, onWorkflowSettled: recordRepositoryWorkflow });
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

  // Same mount-effect restore (no state initializer: hydration).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await Promise.resolve(loadApplyNamingDeduction());
      if (!cancelled) setApplyNamingDeduction(stored);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await Promise.resolve(loadApplyLengthDeduction());
      if (!cancelled) setApplyLengthDeduction(stored);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const changeApplyLengthDeduction = (next: boolean) => {
    if (sessionReady || driver.headerState === "resolving" || preparing || roleIntake.isPending()) return;
    setApplyLengthDeduction(next);
    persistApplyLengthDeduction(next);
  };
  const changeLengthThreshold = (next: string) => {
    recordLengthDeductionThresholdChange(lengthThresholdText, next);
    setLengthThresholdText(next);
  };

  const changeApplyNamingDeduction = (next: boolean) => {
    setApplyNamingDeduction(next);
    persistApplyNamingDeduction(next);
  };

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
    roleIntake.cancel();
    repositoryProposals.reset();
    setRepositoryEvidence(emptyRepositoryEvidence());
    setRepositoryEvidenceSession((session) => session + 1);
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
  const ensureSession = async (canvasUrl?: string, roleSetup?: ConfirmedRoleSetup, current: () => boolean = () => true): Promise<boolean> => {
    if (!current()) return false;
    if (driver.headerState === "ready") return true;
    if (roleSetup) {
      const result = await driver.beginSession({ assignmentInstructions: roleSetup.instructions, rubric: roleSetup.rubric,
        harshness: roleSetup.harshness, feedbackWordTarget: roleSetup.feedbackWordTarget,
        applyNamingDeduction: roleSetup.applyNamingDeduction, applyLengthDeduction: roleSetup.applyLengthDeduction,
        lengthDeductionThresholdWords: roleSetup.lengthDeductionThresholdWords, isCurrent: current });
      if (!current()) return false;
      if (result.kind === "refused") { sessionRefusalRef.current = result.reason; setSubmitError(result.reason); return false; }
      setSubmitError(null); return true;
    }
    const threshold = parseLengthDeductionThreshold(lengthThresholdText);
    if (applyLengthDeduction && threshold === null) { setSubmitError(LENGTH_THRESHOLD_ERROR); return false; }
    const scope = canvasUrl ? deriveChatScope(canvasUrl) : "";
    const needsFill = !instructions.trim() || !rubric.trim();

    let canvasMeta: { instructions: string; rubric: string } | null = null;
    if (canvasUrl && scope) {
      const metaStartedAtMs = chatSeamNowMs();
      setIntakeNote("Fetching assignment details from Canvas...");
      const meta = await fetchCanvasMetaAction(canvasUrl.trim()).finally(() => setIntakeNote(null));
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
    // Typed non-blank fields that differ from Canvas are OFFERED for override
    // (window.confirm, per field, differing fields only). The apply composes
    // over the fill result, so a blank field filled from Canvas stays filled.
    const offer = computeOverrideOffer({ typed: { instructions, rubric }, canvasMeta });
    const canPrompt = offer.anyOfferable && typeof window !== "undefined";
    const decision: OverrideDecision = {
      instructions: canPrompt && offer.instructions.offerable &&
        window.confirm("Replace the directions you typed with the directions from Canvas?"),
      rubric: canPrompt && offer.rubric.offerable &&
        window.confirm("Replace the rubric you typed with the rubric from Canvas?"),
    };
    const resolved: ResolveSetupFillResult = applyOverride({ base: fill, offer, decision });
    const overridden = countOverriddenFields(offer, decision);
    if (overridden > 0) {
      recordGradingDiagnosticEntry({
        at: new Date().toISOString(),
        operation: "override_setup_fields",
        outcome: "success",
        durationMs: 0,
        classificationStudentCount: overridden,
      });
    }
    if (resolved.instructions !== instructions) setInstructions(resolved.instructions);
    if (resolved.rubric !== rubric) setRubric(resolved.rubric);

    const result = await driver.beginSession({ assignmentInstructions: resolved.instructions, rubric: resolved.rubric,
      harshness,
      feedbackWordTarget: coerceFeedbackWordTarget(feedbackLengthText),
      applyNamingDeduction,
      applyLengthDeduction,
      lengthDeductionThresholdWords: applyLengthDeduction ? threshold! : undefined,
    });
    if (result.kind === "refused") {
      sessionRefusalRef.current = result.reason;
      setSubmitError(result.reason);
      return false;
    }
    setSubmitError(null);
    if (scope) saveChatSetupMemory(scope, { rubric: resolved.rubric, instructions: resolved.instructions });
    const notes: string[] = [];
    if (resolved.instructionsSource === "canvas" || resolved.rubricSource === "canvas") {
      notes.push("Instructions and rubric not typed here, or replaced at your choice, were read from Canvas.");
    }
    if (loaded && (resolved.instructionsSource === "memory" || resolved.rubricSource === "memory")) {
      notes.push(describeChatSetupOrigin(loaded, scope));
    }
    setSetupNote(notes.length > 0 ? notes.join(" ") : null);
    return true;
  };

  const handleSubmitText = (content: string, label: string | undefined) =>
    withPreparing(async () => {
      if (roleIntake.isPending()) return;
      if (!(await ensureSession())) return;
      const outcome = await driver.submit({ kind: "text", content, label });
      setSubmitError(outcome.kind === "accepted" ? null : outcome.reason);
    });
  // Uploads a large zip straight to Storage, then hands the path to the
  // driver. If the ingest call rejects or throws, the temp object is removed
  // best-effort (R10); the server's own delete and the orphan sweep remain the
  // real guarantees.
  const submitStoragedZip = async (file: File, current: () => boolean): Promise<SubmitOutcome> => {
    if (!user) return { kind: "refused", reason: "You must be signed in to upload a zip." };
    setZipPhase("uploading");
    try {
      const uploaded = await uploadGradingZip(supabase.storage, user.id, file);
      if (!uploaded.ok) {
        safeIntake(() => recordIntakeGate({ stage: "upload", file, transport: "storage", rawReason: uploaded.message }));
        return { kind: "refused", reason: uploaded.message };
      }
      setZipPhase("preparing");
      try {
        if (!current()) { await deleteGradingZipBestEffort(supabase.storage, uploaded.storagePath); return { kind: "refused", reason: "File intake was canceled." }; }
        const outcome = await driver.submit({ kind: "storaged-zip", storagePath: uploaded.storagePath, name: file.name });
        if (outcome.kind === "refused") await deleteGradingZipBestEffort(supabase.storage, uploaded.storagePath);
        return outcome;
      } catch (err) {
        await deleteGradingZipBestEffort(supabase.storage, uploaded.storagePath);
        throw err;
      }
    } finally {
      setZipPhase(null);
    }
  };
  // LARGE-SINGLE-FILE W2: a large office/text file goes to Storage, then the
  // driver's storaged-file submit (the server extracts it to a text-only entry).
  const submitStoragedSingleFile = async (file: File, label: string | undefined, current: () => boolean): Promise<SubmitOutcome> => {
    setZipPhase("uploading");
    try {
      return await submitStoragedFile({
        file,
        label,
        userId: user?.id ?? null,
        storage: supabase.storage,
        submit: (input) => current() ? driver.submit(input) : Promise.resolve({ kind: "refused", reason: "File intake was canceled." }),
        onUploaded: () => setZipPhase("preparing"),
      });
    } finally {
      setZipPhase(null);
    }
  };
  const handleConfirmedFiles = async (files: File[], label: string | undefined, current: () => boolean): Promise<SubmitOutcome[]> => {
    // A label names ONE student's ONE submission: forwarded only for a
    // single-file pick; a multi-file batch falls back to the filenames.
    const fileLabel = files.length === 1 ? label : undefined;
    // The session is begun once for the whole batch, not once per file.
    const outcomes = await submitFilesSequentially<SubmitOutcome>(files, async (file) => {
      if (!current()) return { kind: "refused", reason: "File intake was canceled." };
      // VIDEO-GRADING W4: a video is decided FIRST (the zip preflight's "split
      // the archive" wording is wrong for it) and goes straight to Storage; a
      // non-video returns null and takes the unchanged path below.
      const videoOutcome = await submitLooseVideo({
        file,
        label: fileLabel,
        userId: user?.id ?? null,
        storage: supabase.storage,
        pendingStaged: driver.pendingVideoCount(),
        enabled: VIDEO_GRADING_ENABLED,
        ensureSession: async () => current(),
        sessionRefusal: () => sessionRefusalRef.current,
        submit: (input) => current() ? driver.submit(input) : Promise.resolve({ kind: "refused", reason: "File intake was canceled." }),
      });
      if (videoOutcome !== null) return videoOutcome;
      // FIX-1 size pre-flight: an oversized file is refused here, with a
      // worded reason, before the session starts or any bytes are uploaded.
      // BULK-ZIP BW1: a zip over the body budget takes the Storage transport
      // (when the ingest exists) instead of being refused here; every other
      // file keeps the body pre-flight unchanged.
      // LARGE-SINGLE-FILE W2: a non-zip office/text file over the body budget
      // takes the single-file Storage lane; small files stay on the body path.
      const isZip = isZipFileName(file.name);
      const transport = isZip ? chooseZipTransport(file) : chooseSingleFileTransport(file);
      if (transport.kind === "refused") {
        safeIntake(() => recordIntakeGate({ stage: "gate", file, transport: "refused", rawReason: transport.message }));
        return { kind: "refused", reason: transport.message };
      }
      const preflight = transport.kind === "storage" ? { ok: true as const } : preflightUploadFile(file, "This file");
      if (!preflight.ok) {
        safeIntake(() => recordIntakeGate({ stage: "gate", file, transport: "body", rawReason: preflight.message }));
        return { kind: "refused", reason: preflight.message };
      }
      if (!current()) return { kind: "refused", reason: "File intake was canceled." };
      if (transport.kind === "storage") return isZip ? submitStoragedZip(file, current) : submitStoragedSingleFile(file, fileLabel, current);
      return driver.submit({ kind: "file", file, label: fileLabel });
    });
    const reasons: string[] = [];
    outcomes.forEach((outcome, index) => {
      if (outcome.kind !== "accepted") reasons.push(`${files[index].name}: ${outcome.reason}`);
    });
    if (current()) setSubmitError(reasons.length > 0 ? reasons.join(" ") : null);
    return outcomes;
  };
  const roleIntake = useChatFileRoles({ epoch: driver.runKey, locked: sessionReady, draft: { instructions, rubric },
    options: { harshness, feedbackWordTarget: coerceFeedbackWordTarget(feedbackLengthText), applyNamingDeduction, applyLengthDeduction,
      lengthDeductionThresholdWords: applyLengthDeduction ? parseLengthDeductionThreshold(lengthThresholdText) ?? NaN : undefined },
    canStage: !preparing && driver.headerState !== "resolving",
    start: (setup, current) => ensureSession(undefined, setup, current),
    submit: async (file, label, current) => (await handleConfirmedFiles([file], label, current))[0],
    applySetup: (setup) => { setInstructions(setup.instructions); setRubric(setup.rubric); } });
  const handleSubmitFiles = (files: File[], label?: string) => { roleIntake.stage(files, label); };
  // RECORDING ONE-VS-MANY: resolve the held multi-submission recording.
  const reportSplitOutcome = (outcome: SubmitOutcome) => setSubmitError(outcome.kind === "accepted" ? null : outcome.reason);
  const handleConfirmSplit = () => { if (roleIntake.isPending()) { setSubmitError("Finish or cancel the file preview before grading this recording."); return; } reportSplitOutcome(driver.confirmRecordingSplit()); };
  const handleRejectSplit = () => { if (roleIntake.isPending()) { setSubmitError("Finish or cancel the file preview before grading this recording."); return; } reportSplitOutcome(driver.rejectRecordingSplit()); };

  const handleSubmitUrl = (url: string, label?: string) =>
    withPreparing(async () => {
      if (roleIntake.isPending()) return;
      if (!(await ensureSession(url))) return;
      const outcome = await driver.submit({ kind: "url", url, label });
      setSubmitError(outcome.kind === "accepted" ? null : outcome.reason);
    });

  const handleSubmitComposite = (student: string, parts: CompositePartInput[]) =>
    withPreparing(async () => {
      if (roleIntake.isPending()) return;
      if (!(await ensureSession())) return;
      const outcome = await driver.submit({ kind: "composite", student, parts });
      setSubmitError(outcome.kind === "accepted" ? null : outcome.reason);
    });

  // Clear controls: uncommitted draft text only, so no confirm. Pre-lock only;
  // the setup fields do not exist once the session is ready.
  const handleClearInstructions = () => setInstructions("");
  const handleClearRubric = () => setRubric("");
  const handleClearAll = () => {
    if (sessionReady || driver.headerState === "resolving" || preparing || roleIntake.isPending()) return;
    setInstructions("");
    setRubric("");
    changeLengthThreshold(String(LENGTH_DEDUCTION_THRESHOLD_WORDS_DEFAULT));
  };

  const busy = driver.headerState === "resolving";
  const hasRows = driver.run !== null && driver.run.results.length > 0;
  const ledgerView = buildLedgerView(driver.run?.results ?? [], driver.ingestLedger);

  // Whole-view drop target: dropping files anywhere on the grading chat
  // panel (not just the narrow composer strip) submits them for grading.
  // The composer's own drop handler stops propagation, so a drop there stays
  // tray-aware and does not also reach this handler.
  const handlePanelDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
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
        <>
          <p className={chatStyles.setupSummary}>Instructions and rubric are set for this session.</p>
          {instructions.trim() !== "" && (
            <div className={chatStyles.compactField}>
              <label htmlFor="grading-chat-instructions-locked">Assignment instructions</label>
              <TextField
                id="grading-chat-instructions-locked"
                multiline
                minRows={2}
                maxRows={6}
                fullWidth
                size="small"
                value={instructions}
                slotProps={{ input: { readOnly: true } }}
              />
              <Button
                variant="text"
                size="small"
                aria-label="Copy assignment instructions"
                onClick={() => void onCopy(COPY_KEY_INSTRUCTIONS, instructions)}
              >
                {copiedKey === COPY_KEY_INSTRUCTIONS ? "Copied" : "Copy"}
              </Button>
            </div>
          )}
          {rubric.trim() !== "" && (
            <div className={chatStyles.compactField}>
              <label htmlFor="grading-chat-rubric-locked">Rubric</label>
              <TextField
                id="grading-chat-rubric-locked"
                multiline
                minRows={2}
                maxRows={6}
                fullWidth
                size="small"
                value={rubric}
                slotProps={{ input: { readOnly: true } }}
              />
              <Button
                variant="text"
                size="small"
                aria-label="Copy rubric"
                onClick={() => void onCopy(COPY_KEY_RUBRIC, rubric)}
              >
                {copiedKey === COPY_KEY_RUBRIC ? "Copied" : "Copy"}
              </Button>
            </div>
          )}
          <span role="status" aria-live="polite" style={visuallyHidden}>
            {copiedKey === COPY_KEY_INSTRUCTIONS
              ? "Copied assignment instructions"
              : copiedKey === COPY_KEY_RUBRIC
                ? "Copied rubric"
                : ""}
          </span>
        </>
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
        <FormControlLabel
          control={
            <Checkbox
              id="grading-chat-apply-naming-deduction"
              size="small"
              checked={applyNamingDeduction}
              onChange={(event) => changeApplyNamingDeduction(event.target.checked)}
              disabled={sessionReady}
            />
          }
          label="Deduct for wrong file names"
        />
        <FormControlLabel
          control={
            <Checkbox
              id="grading-chat-apply-length-deduction"
              size="small"
              checked={applyLengthDeduction}
              onChange={(event) => changeApplyLengthDeduction(event.target.checked)}
              disabled={sessionReady || busy || preparing || roleIntake.pending}
            />
          }
          label="Deduct for length"
        />
        <TextField size="small" type="text" label="Deduct when at least N words below the minimum"
          value={lengthThresholdText} onChange={(event) => changeLengthThreshold(event.target.value)}
          disabled={!applyLengthDeduction || sessionReady || busy || preparing || roleIntake.pending}
          error={applyLengthDeduction && parseLengthDeductionThreshold(lengthThresholdText) === null}
          helperText={sessionReady || busy ? "Frozen for this session. Start a New session to change it." : roleIntake.pending || preparing ? "Finish or cancel the current intake before changing this setting." : !applyLengthDeduction ? "Enable Deduct for length to set a threshold." : parseLengthDeductionThreshold(lengthThresholdText) === null ? LENGTH_THRESHOLD_ERROR : "Uses only an explicit assignment or rubric minimum; does not change the deduction amount."}
          slotProps={{ htmlInput: { inputMode: "numeric", min: 1, max: LENGTH_DEDUCTION_THRESHOLD_WORDS_MAX, step: 1 } }} />
        {!sessionReady && (instructions !== "" || rubric !== "" || lengthThresholdText !== String(LENGTH_DEDUCTION_THRESHOLD_WORDS_DEFAULT)) && (
          <Button variant="text" size="small" aria-label="Clear all setup fields" disabled={sessionReady || busy || preparing || roleIntake.pending} onClick={handleClearAll}>
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
        <Button variant="outlined" size="small" disabled={preparing} onClick={handleNewSession}>
          New session
        </Button>
      </div>

      {hasRows && driver.run ? (
        <div className={chatStyles.stream}>
        {driver.run && <RubricProvenance run={driver.run} />}
        <SubmissionClassificationBadge classification={driver.run.submissionClassification} />
        {driver.generatedRubric && <GeneratedRubricCard generatedRubric={driver.generatedRubric} />}
        <GradingResults
          run={driver.run}
          repositoryProposals={repositoryProposals.workflow}
          canvasUrl={driver.canvasUrl}
          runKey={driver.runKey}
          editsSurface={driver.runKey}
          assignmentName=""
          copiedKey={copiedKey}
          onCopy={onCopy}
          onOpenPreview={onOpenPreview}
          searchable
          onRegrade={driver.regrade}
          regradingStudents={driver.pendingStudents}
          unresolvedStudents={driver.unresolvedStudents}
        />
        <RunDiagnostics items={driver.diagnostics} copiedKey={copiedKey} onCopy={onCopy} />
        </div>
      ) : (
        <p className={chatStyles.streamEmpty}>Set instructions and a rubric above, then drop in your first submission below.</p>
      )}

      <div className={chatStyles.stickyComposer}>
        {submitError && (
          <p role="alert" className={`${controls.notice} ${controls.noticeDanger}`}>
            {submitError}
          </p>
        )}
        <LedgerNotice view={ledgerView} />
        {driver.pendingSplit !== null && (
          <RecordingSplitConfirm pending={driver.pendingSplit} onConfirm={handleConfirmSplit} onReject={handleRejectSplit} />
        )}
        <GradingProgress
          status={describeRunStatus({
            preparing,
            zipPhase,
            headerState: driver.headerState,
            intakeNote,
            classifyingRecording: driver.classifyingRecording,
            pendingCount: Math.max(driver.pendingStudents.size, driver.dispatchedCount - driver.completedCount),
            inFlightStudents: driver.inFlightStudents,
            inFlightCount: driver.inFlight,
            completedCount: driver.completedCount,
          })}
        />

        <ChatRepositoryEvidence key={repositoryEvidenceSession} evidence={repositoryEvidence} onChange={setRepositoryEvidence} />
        <ChatRepositoryMappings key={`mappings-${repositoryEvidenceSession}`} evidence={repositoryEvidence} students={driver.repositoryStudents} proposals={repositoryProposals} />
        <ChatFileRolePreview intake={roleIntake} />
        <ChatComposer
          disabled={busy || preparing || roleIntake.pending}
          onSubmitText={handleSubmitText} onSubmitFiles={handleSubmitFiles} onSubmitUrl={handleSubmitUrl}
          onSubmitComposite={handleSubmitComposite}
        />
      </div>
    </div>
  );
}

export default GradingChatPanel;
