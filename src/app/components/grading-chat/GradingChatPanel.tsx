"use client";
import type { ReviewedPastedDiscussion } from "@/lib/grade/reviewed-pasted-discussion";

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
import { useEffect, useLayoutEffect, useRef, useState, type DragEvent } from "react";
import { fetchCanvasMetaAction } from "../../actions/grading";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import { Accordion, AccordionSummary, AccordionDetails, Table, TableHead, TableBody, TableRow, TableCell } from "@mui/material";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import GradingResults from "../GradingResults";
import RubricProvenance from "../grading-results/RubricProvenance";
import GeneratedRubricCard from "../grading-results/GeneratedRubricCard";
import SubmissionClassificationBadge from "../grading/SubmissionClassificationBadge";
import { ChatComposer } from "./ChatComposer";
import { LargeZipRecovery } from "./LargeZipRecovery";
import { PartialHandoffNotice, usePartialHandoffRecords } from "./PartialHandoffNotice";
import { createPartialHandoffHandler } from "./partialHandoff";
import { createDirectFileIntake } from "./chatDirectFileIntake";
import type { ConfirmedRoleSetup } from "./chatFileRoles";
import { LENGTH_DEDUCTION_THRESHOLD_WORDS_DEFAULT, LENGTH_DEDUCTION_THRESHOLD_WORDS_MAX } from "@/lib/grade/length-deduction-policy";
import { LENGTH_THRESHOLD_ERROR, parseLengthDeductionThreshold, recordLengthDeductionThresholdChange } from "./chatLengthDeduction";
import { RecordingSplitConfirm } from "./RecordingSplitConfirm";
import { useContinuousGradingRun, type ItemDiagnostic, type SubmitOutcome } from "./useContinuousGradingRun";
import { buildLedgerView } from "./ingestLedger";
import { LedgerNotice } from "./LedgerNotice";
import { claimIntake, releaseIntake, resetIntake } from "./intakeFence";
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
import { submitFilesSequentially } from "./chatFileBatch"; import { zipUploadFallback } from "./zipUploadFallback";
import { useZipDuplicateReview } from "./useZipDuplicateReview";
import { pastedSubmissionUrl } from "@/lib/grade/pasted-submission-url";
import { chatEditScope, newChatEditInstance } from "./chatEditScope";
import { ChatEditRecovery } from "./ChatEditRecovery";
import type { CompositePartInput } from "./chatSubmissionIntake";
import { deriveChatScope, describeChatSetupOrigin, loadChatSetupMemory, saveChatSetupMemory } from "./chatSetupMemory";
import type { PreviewFile } from "../FilePreviewModal";
import { chatSeamNowMs, classifyChatSeamFailure, recordChatSeamSettled } from "./chatSeamDiagnostic";
import { preflightUploadFile } from "@/lib/grade/zip-upload-preflight";
import {
  chooseSingleFileTransport,
  chooseZipTransport, GRADING_ZIP_STORAGE_INGEST_ENABLED,
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
    <Accordion className={styles.generatedRubricCard}>
      <AccordionSummary expandIcon={<span aria-hidden="true">+</span>}>{summarizeDiagnostics(items)}</AccordionSummary>
      <AccordionDetails>
      <p className={styles.ghMeta}>Times are in seconds. Copied text uses row numbers, not student names.</p>
      <Button variant="outlined" size="small" onClick={() => void onCopy(COPY_KEY_DIAGNOSTICS, formatDiagnosticsText(items))}>
        {copiedKey === COPY_KEY_DIAGNOSTICS ? "Copied" : "Copy diagnostics"}
      </Button>
      <div className={chatStyles.diagnosticsScroll} role="region" aria-label="Run diagnostics table" tabIndex={0}>
      <Table className={styles.generatedRubricTable} size="small">
        <TableHead>
          <TableRow>
            <TableCell component="th" scope="col">Row</TableCell><TableCell component="th" scope="col">Outcome</TableCell><TableCell component="th" scope="col">Server s</TableCell><TableCell component="th" scope="col">Model s</TableCell>
            {DIAG_COLUMNS.map(([title]) => <TableCell component="th" scope="col" key={title}>{title}</TableCell>)}
          </TableRow>
        </TableHead>
        <TableBody>
          {items.map((d, i) => (
            <TableRow key={`${d.sourceIndex}-${i}`}>
              <TableCell>{d.rowLabel}</TableCell><TableCell>{d.outcome}</TableCell><TableCell>{diagSec(d, "serverMs")}</TableCell><TableCell>{diagSec(d, "modelMs")}</TableCell>
              {DIAG_COLUMNS.map(([title, key]) => <TableCell key={title}>{diagVal(d, key)}</TableCell>)}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      </div>
    </AccordionDetails>
    </Accordion>
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

/** A committed account switch remounts the entire chat, including its queued work. */
export function GradingChatPanel(props: GradingChatPanelProps) {
  const { user } = useSupabase();
  return <GradingChatPanelForAccount key={user?.id ?? "signed-out"} {...props} />;
}

function GradingChatPanelForAccount({ copiedKey, onCopy, onOpenPreview }: GradingChatPanelProps) {
  const [editInstance] = useState(newChatEditInstance);
  const panelRef = useRef<HTMLDivElement>(null);
  const sessionActionsRef = useRef<HTMLDivElement>(null);
  const setupRef = useRef<HTMLDivElement>(null);
  const setupSummaryRef = useRef<HTMLDivElement>(null);
  const [setupExpanded, setSetupExpanded] = useState(true);
  const setupFocusedRef = useRef(false);
  const previousReadyRef = useRef(false);

  useEffect(() => {
    const panel = panelRef.current;
    const actions = sessionActionsRef.current;
    const navigation = panel?.closest(`.${styles.tabContainer}`)?.querySelector<HTMLElement>(":scope > .MuiTabs-root");
    if (!panel || !actions || !navigation) return;
    // Only the primary Tabs row sticks; the lower navigation rails scroll away.
    const measure = () => {
      panel.style.setProperty("--chat-navigation-height", `${navigation.getBoundingClientRect().height}px`);
      panel.style.setProperty("--chat-session-actions-height", `${actions.getBoundingClientRect().height}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(navigation);
    observer.observe(actions);
    return () => observer.disconnect();
  }, []);

  const [instructions, setInstructions] = useState("");
  const [rubric, setRubric] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [setupNote, setSetupNote] = useState<string | null>(null);
  const [harshness, setHarshness] = useState<GradeHarshness>("balanced");
  const [feedbackLengthText, setFeedbackLengthText] = useState("");
  const [applyNamingDeduction, setApplyNamingDeduction] = useState(true);
  const [applyLengthDeduction, setApplyLengthDeduction] = useState(false);
  const [lengthThresholdText, setLengthThresholdText] = useState(String(LENGTH_DEDUCTION_THRESHOLD_WORDS_DEFAULT));
  const directIntake = useRef(createDirectFileIntake());
  const [directPreparing, setDirectPreparing] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [zipPhase, setZipPhase] = useState<"uploading" | "preparing" | null>(null);
  const [intakeNote, setIntakeNote] = useState<string | null>(null);
  const sessionRefusalRef = useRef("Set instructions and a rubric before submitting.");

  const driver = useContinuousGradingRun({ provider: "gemini", commentSplit: true });
  const { supabase, user } = useSupabase();
  const { omissions: partialOmissions, setOmissions: setPartialOmissions, records: partialRecords, setRecords: setPartialRecords } = usePartialHandoffRecords(user?.id);
  const zipReview = useZipDuplicateReview(user?.id);
  const resetOnUnmount = useRef(driver.reset);
  useLayoutEffect(() => { resetOnUnmount.current = driver.reset; }, [driver.reset]);
  useLayoutEffect(() => () => resetOnUnmount.current(), []);

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
    if (sessionReady || driver.headerState === "resolving" || preparing) return;
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
  useEffect(() => {
    const setup = setupRef.current;
    if (setup && sessionReady && !previousReadyRef.current) {
      if (setupFocusedRef.current) setupSummaryRef.current?.focus();
      setSetupExpanded(false);
    }
    previousReadyRef.current = sessionReady;
  }, [sessionReady]);

  const dropSessionEpoch = useRef(0); const [visibleDropEpoch, setVisibleDropEpoch] = useState(0);
  useLayoutEffect(() => () => { dropSessionEpoch.current++; }, []);
  const [sharedIntakeLatch] = useState(() => ({ busy: false, generation: 0 }));
  const handleNewSession = () => {
    if (
      typeof window !== "undefined" &&
      !window.confirm("Start a new session? This discards every graded row from the current session so you can grade a different assignment.")
    ) {
      return;
    }
    dropSessionEpoch.current += 1; setVisibleDropEpoch(dropSessionEpoch.current);
    zipReview.cancel();
    resetIntake(sharedIntakeLatch);
    directIntake.current.cancel();
    setDirectPreparing(false);
    setPreparing(false);
    setZipPhase(null);
    driver.reset();
    setSetupExpanded(true);
    setSubmitError(null);
    setPartialOmissions([]);
    setSetupNote(null);
  };

  // Marks the submit intake (extraction, session start) as in progress so the
  // composer shows busy until the awaits settle, success or failure.
  const withPreparing = async <T,>(work: () => Promise<T>): Promise<T> => {
    const epoch = dropSessionEpoch.current;
    setPreparing(true);
    try {
      return await work();
    } finally {
      if (dropSessionEpoch.current === epoch) setPreparing(false);
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
      const epoch = dropSessionEpoch.current, account = user?.id, token = zipReview.capture(), current = () => dropSessionEpoch.current === epoch && zipReview.owns(account, token);
      const hasUrl = !!pastedSubmissionUrl(content); if (hasUrl) zipReview.noteUnknown();
      if (!(await ensureSession(undefined, undefined, current)) || !current()) return;
      let outcome: SubmitOutcome;
      try { outcome = await driver.submit({ kind: "text", content, label }); if (hasUrl && zipReview.owns(account, token) && outcome.kind !== "refused") zipReview.rememberUnknown(); }
      catch (error) { if (hasUrl && zipReview.owns(account, token)) zipReview.rememberUnknown(); throw error; }
      if (current()) setSubmitError(outcome.kind === "accepted" ? null : outcome.reason);
    });
  // Uploads a large zip straight to Storage, then hands the path to the
  // driver. If the ingest call rejects or throws, the temp object is removed
  // best-effort (R10); the server's own delete and the orphan sweep remain the
  // real guarantees.
  const submitStoragedZip = async (file: File, current: () => boolean, reviewedZipMapping?: Readonly<Record<string, string>>, fallbackBody = false): Promise<SubmitOutcome> => {
    if (!user) return { kind: "refused", reason: "You must be signed in to upload a zip." };
    if (current()) setZipPhase("uploading");
    try {
      const uploaded = await uploadGradingZip(supabase.storage, user.id, file);
      if (!uploaded.ok) {
        safeIntake(() => recordIntakeGate({ stage: "upload", file, transport: "storage", rawReason: uploaded.message }));
        return zipUploadFallback(uploaded.message, fallbackBody, current, () => driver.submit({ kind: "file", file, reviewedZipMapping }));
      }
      if (current()) setZipPhase("preparing");
      try {
        if (!current()) { await deleteGradingZipBestEffort(supabase.storage, uploaded.storagePath); return { kind: "refused", reason: "File intake was canceled." }; }
        const outcome = await driver.submit({ kind: "storaged-zip", storagePath: uploaded.storagePath, name: file.name, reviewedZipMapping });
        if (outcome.kind === "refused") await deleteGradingZipBestEffort(supabase.storage, uploaded.storagePath);
        return outcome;
      } catch (err) {
        await deleteGradingZipBestEffort(supabase.storage, uploaded.storagePath);
        throw err;
      }
    } finally {
      if (current()) setZipPhase(null);
    }
  };
  // LARGE-SINGLE-FILE W2: a large office/text file goes to Storage, then the
  // driver's storaged-file submit (the server extracts it to a text-only entry).
  const submitStoragedSingleFile = async (file: File, label: string | undefined, current: () => boolean): Promise<SubmitOutcome> => {
    if (current()) setZipPhase("uploading");
    try {
      return await submitStoragedFile({
        file,
        label,
        userId: user?.id ?? null,
        storage: supabase.storage,
        submit: (input) => current() ? driver.submit(input) : Promise.resolve({ kind: "refused", reason: "File intake was canceled." }),
        onUploaded: () => { if (current()) setZipPhase("preparing"); },
      });
    } finally {
      if (current()) setZipPhase(null);
    }
  };
  const handleConfirmedFiles = async (files: File[], label: string | undefined, current: () => boolean, reviewedZipMapping?: Readonly<Record<string, string>>): Promise<SubmitOutcome[]> => {
    const account = user?.id, accountToken = zipReview.capture(), safeCurrent = () => current() && zipReview.owns(account, accountToken);
    if (!(await zipReview.check(files, safeCurrent)) || !safeCurrent()) return files.map(() => ({ kind: "refused", reason: "ZIP review was deferred or the session changed. Nothing was submitted." }));
    // A label names ONE student's ONE submission: forwarded only for a
    // single-file pick; a multi-file batch falls back to the filenames.
    const fileLabel = files.length === 1 ? label : undefined;
    // The session is begun once for the whole batch, not once per file.
    const outcomes = await submitFilesSequentially<SubmitOutcome>(files, async (file) => {
      if (!safeCurrent()) return { kind: "refused", reason: "File intake was canceled." };
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
        ensureSession: async () => safeCurrent(),
        sessionRefusal: () => sessionRefusalRef.current,
        submit: (input) => safeCurrent() ? driver.submit(input) : Promise.resolve({ kind: "refused", reason: "File intake was canceled." }),
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
      const chosen = isZip ? chooseZipTransport(file) : chooseSingleFileTransport(file); const transport = isZip && VIDEO_GRADING_ENABLED && GRADING_ZIP_STORAGE_INGEST_ENABLED && chosen.kind === "body" ? { kind: "storage" as const } : chosen;
      if (transport.kind === "refused") {
        safeIntake(() => recordIntakeGate({ stage: "gate", file, transport: "refused", rawReason: transport.message }));
        return { kind: "refused", reason: transport.message };
      }
      const preflight = chosen.kind === "body" ? preflightUploadFile(file, "This file") : { ok: true as const };
      if (!preflight.ok) {
        safeIntake(() => recordIntakeGate({ stage: "gate", file, transport: "body", rawReason: preflight.message }));
        return { kind: "refused", reason: preflight.message };
      }
      if (!safeCurrent()) return { kind: "refused", reason: "File intake was canceled." };
      const submit = () => transport.kind === "storage" ? (isZip ? submitStoragedZip(file, safeCurrent, reviewedZipMapping, chosen.kind === "body") : submitStoragedSingleFile(file, fileLabel, safeCurrent)) : driver.submit({ kind: "file", file, label: fileLabel, reviewedZipMapping });
      try { const outcome = await submit(); if (isZip && zipReview.owns(account, accountToken) && outcome.kind !== "refused") zipReview.remember([file]); return outcome; }
      catch (error) { if (isZip && zipReview.owns(account, accountToken)) zipReview.remember([file]); throw error; }
    });
    const reasons: string[] = [];
    outcomes.forEach((outcome, index) => {
      if (outcome.kind !== "accepted") reasons.push(`${files[index].name}: ${outcome.reason}`);
    });
    if (safeCurrent()) setSubmitError(reasons.length > 0 ? reasons.join(" ") : null);
    return outcomes;
  };
  const handleSubmitFiles = (files: File[], label?: string, reviewedZipMapping?: Readonly<Record<string, string>>) => {
    const blocked = directIntake.current.isPending() || preparing || driver.headerState === "resolving";
    return directIntake.current.run({ files, label, blocked, preparing: (value) => { setDirectPreparing(value); setPreparing(value); }, error: setSubmitError,
      setup: { instructions, rubric, harshness, feedbackWordTarget: coerceFeedbackWordTarget(feedbackLengthText), applyNamingDeduction, applyLengthDeduction,
        lengthDeductionThresholdWords: applyLengthDeduction ? parseLengthDeductionThreshold(lengthThresholdText) ?? NaN : undefined },
      start: (setup, current) => ensureSession(undefined, setup, current), submit: (batch, batchLabel, current) => handleConfirmedFiles(batch, batchLabel, current, reviewedZipMapping) });
  };
  const handlePartialHandoff = (...args: Parameters<ReturnType<typeof createPartialHandoffHandler>>) => createPartialHandoffHandler({ getEpoch: () => dropSessionEpoch.current, account: user?.id, capture: zipReview.capture, owns: zipReview.owns, latch: sharedIntakeLatch, onRecords: setPartialRecords, onOmissions: (groups) => setPartialOmissions((previous) => [...previous, ...groups]), submit: (zip, mapping) => handleSubmitFiles([zip], undefined, mapping) })(...args);
  // RECORDING ONE-VS-MANY: resolve the held multi-submission recording.
  const reportSplitOutcome = (outcome: SubmitOutcome) => setSubmitError(outcome.kind === "accepted" ? null : outcome.reason);
  const handleConfirmSplit = () => reportSplitOutcome(driver.confirmRecordingSplit());
  const handleRejectSplit = () => reportSplitOutcome(driver.rejectRecordingSplit());

  const handleSubmitUrl = (url: string, label?: string) =>
    withPreparing(async () => {
      const epoch = dropSessionEpoch.current, account = user?.id, token = zipReview.capture(), current = () => dropSessionEpoch.current === epoch && zipReview.owns(account, token);
      zipReview.noteUnknown();
      if (!(await ensureSession(url, undefined, current))) return { kind: "refused" as const, reason: sessionRefusalRef.current ?? "Session setup was not completed." };
      if (!current()) return { kind: "refused" as const, reason: "The session changed before the submission was queued." };
      let outcome: SubmitOutcome;
      try { outcome = await driver.submit({ kind: "url", url, label }); if (zipReview.owns(account, token) && outcome.kind !== "refused") zipReview.rememberUnknown(); }
      catch (error) { if (zipReview.owns(account, token)) zipReview.rememberUnknown(); throw error; }
      if (current()) setSubmitError(outcome.kind === "accepted" ? null : outcome.reason);
      return outcome;
    });

  const handleSubmitComposite = (student: string, parts: CompositePartInput[]) =>
    withPreparing(async () => {
      const epoch = dropSessionEpoch.current, account = user?.id, accountToken = zipReview.capture(), current = () => dropSessionEpoch.current === epoch && zipReview.owns(account, accountToken);
      const files = parts.flatMap((part) => part.kind === "file" ? [part.file] : []);
      const hasUrl = parts.some((part) => part.kind === "url" || (part.kind === "text" && !!pastedSubmissionUrl(part.content)));
      if (hasUrl) zipReview.noteUnknown();
      if (!(await zipReview.check(files, current, hasUrl && files.some((file) => /\.zip$/i.test(file.name)))) || !current()) return { kind: "refused" as const, reason: "ZIP review was deferred or the session changed. Nothing was submitted." };
      if (!(await ensureSession(undefined, undefined, current)) || !current()) return { kind: "refused" as const, reason: sessionRefusalRef.current ?? "Session setup was not completed." };
      let outcome: SubmitOutcome;
      try { outcome = await driver.submit({ kind: "composite", student, parts }); if (zipReview.owns(account, accountToken) && outcome.kind !== "refused") { zipReview.remember(files); if (hasUrl) zipReview.rememberUnknown(); } }
      catch (error) { if (zipReview.owns(account, accountToken)) { zipReview.remember(files); if (hasUrl) zipReview.rememberUnknown(); } throw error; }
      if (current()) setSubmitError(outcome.kind === "accepted" ? null : outcome.reason);
      return outcome;
    });

  const handleSubmitReviewed = (student: string, content: string, reviewedDiscussion: ReviewedPastedDiscussion) =>
    withPreparing(async () => {
      if (!(await ensureSession())) return { kind: "refused" as const, reason: sessionRefusalRef.current ?? "Session setup was not completed." };
      const outcome = await driver.submit({ kind: "text", label: student, content, reviewedDiscussion });
      setSubmitError(outcome.kind === "accepted" ? null : outcome.reason);
      return outcome;
    });

  // Clear controls: uncommitted draft text only, so no confirm. Pre-lock only;
  // the setup fields do not exist once the session is ready.
  const handleClearInstructions = () => setInstructions("");
  const handleClearRubric = () => setRubric("");
  const handleClearAll = () => {
    if (sessionReady || driver.headerState === "resolving" || preparing) return;
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
    if (files.length > 0) {
      const token = claimIntake(sharedIntakeLatch);
      if (token === null) { setSubmitError("Wait for the current submission to finish, then drop these files again."); return; }
      void handleSubmitFiles(files).finally(() => { releaseIntake(sharedIntakeLatch, token); });
    }
  };

  return (
    <div
      ref={panelRef}
      className={`${styles.card} ${styles.form} ${chatStyles.panel}`}
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
      <div ref={sessionActionsRef} className={chatStyles.sessionActions}>
        <Button variant="outlined" size="small" disabled={preparing && !directPreparing} onClick={handleNewSession}
          aria-describedby={preparing && !directPreparing ? "grading-chat-new-session-unavailable" : undefined}>
          New session
        </Button>
        {preparing && !directPreparing && (
          <span id="grading-chat-new-session-unavailable" className={styles.ghMeta}>
            Finish preparing the current submission before starting a new session.
          </span>
        )}
      </div>
      <Accordion ref={setupRef} className={chatStyles.setupDisclosure} expanded={setupExpanded} onChange={(_, expanded) => setSetupExpanded(expanded)}
        onFocusCapture={() => { setupFocusedRef.current = true; }}
        onBlurCapture={(event) => {
          if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) setupFocusedRef.current = false;
        }}>
        <AccordionSummary ref={setupSummaryRef} expandIcon={<span aria-hidden="true">+</span>}>{sessionReady ? "Assignment setup (locked)" : "Assignment setup"}</AccordionSummary>
        <AccordionDetails>
        <div className={chatStyles.setupGrid}>
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

      </div>
      <Accordion className={chatStyles.gradingOptions} disableGutters elevation={0}>
        <AccordionSummary expandIcon={<span aria-hidden="true">+</span>}>
          {`Grading options · ${harshness.charAt(0).toUpperCase()}${harshness.slice(1)}${applyNamingDeduction ? " · filename deduction" : ""}${applyLengthDeduction ? " · length deduction" : ""}${feedbackLengthText.trim() ? ` · ${feedbackLengthText.trim()}-word feedback` : ""}`}
        </AccordionSummary>
        <AccordionDetails>
      <div className={chatStyles.settingsGrid}>
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
              disabled={sessionReady || busy || preparing}
            />
          }
          label="Deduct for length"
        />
        <TextField className={chatStyles.thresholdField} size="small" type="text" label="Deduct when at least N words below the minimum"
          value={lengthThresholdText} onChange={(event) => changeLengthThreshold(event.target.value)}
          disabled={!applyLengthDeduction || sessionReady || busy || preparing}
          error={applyLengthDeduction && parseLengthDeductionThreshold(lengthThresholdText) === null}
          helperText={sessionReady || busy ? "Frozen for this session. Start a New session to change it." : preparing ? "Finish or cancel the current intake before changing this setting." : !applyLengthDeduction ? "Enable Deduct for length to set a threshold." : parseLengthDeductionThreshold(lengthThresholdText) === null ? LENGTH_THRESHOLD_ERROR : "Uses only an explicit assignment or rubric minimum; does not change the deduction amount."}
          slotProps={{ htmlInput: { inputMode: "numeric", min: 1, max: LENGTH_DEDUCTION_THRESHOLD_WORDS_MAX, step: 1 } }} />
        {!sessionReady && (instructions !== "" || rubric !== "" || lengthThresholdText !== String(LENGTH_DEDUCTION_THRESHOLD_WORDS_DEFAULT)) && (
          <Button variant="text" size="small" aria-label="Clear all setup fields" disabled={sessionReady || busy || preparing} onClick={handleClearAll}>
            Clear all
          </Button>
        )}
      </div>
        </AccordionDetails>
      </Accordion>

        </AccordionDetails>
      </Accordion>

      {setupNote && <p role="status" className={styles.ghMeta}>{setupNote}</p>}

      <ChatEditRecovery account={user?.id} />

      {hasRows && driver.run && (
        <div className={chatStyles.stream}>
        {driver.run && <RubricProvenance run={driver.run} />}
        <SubmissionClassificationBadge classification={driver.run.submissionClassification} />
        {driver.generatedRubric && <GeneratedRubricCard generatedRubric={driver.generatedRubric} />}
        <GradingResults
          run={driver.run}
          getVersionedResult={driver.getVersionedResult}
          canvasUrl={driver.canvasUrl}
          runKey={driver.runKey}
          editsSurface={chatEditScope(editInstance, user?.id, driver.sessionId)}
          assignmentName=""
          copiedKey={copiedKey}
          onCopy={onCopy}
          onOpenPreview={onOpenPreview}
          searchable
          compactContext
          onRegrade={driver.regrade}
          regradeCandidates={driver.regradeCandidates}
          regradeFailures={driver.regradeFailures}
          onAcceptRegrade={driver.acceptRegrade}
          onDiscardRegrade={driver.discardRegrade}
          regradingStudents={driver.pendingStudents}
          unresolvedStudents={driver.unresolvedStudents}
        />
        <RunDiagnostics items={driver.diagnostics} copiedKey={copiedKey} onCopy={onCopy} />
        </div>
      )}

      <div className={chatStyles.auxiliary}>
        {zipReview.view}
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

      </div>
      <div className={chatStyles.stickyComposer}>
        <PartialHandoffNotice omissions={partialOmissions} records={partialRecords} />
        <LargeZipRecovery key={visibleDropEpoch} onSubmit={handlePartialHandoff} />
        <ChatComposer
          sharedLatch={sharedIntakeLatch}
          disabled={busy || preparing}
          getSessionEpoch={() => dropSessionEpoch.current}
          sessionEpoch={visibleDropEpoch}
          onSubmitText={handleSubmitText} onSubmitFiles={handleSubmitFiles} onSubmitUrl={handleSubmitUrl}
          onSubmitComposite={handleSubmitComposite}
          onSubmitReviewed={handleSubmitReviewed}
        />
      </div>
    </div>
  );
}

export default GradingChatPanel;
