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
import { useState } from "react";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import GradingResults from "../GradingResults";
import RubricProvenance from "../grading-results/RubricProvenance";
import GeneratedRubricCard from "../grading-results/GeneratedRubricCard";
import { ChatComposer } from "./ChatComposer";
import { useContinuousGradingRun } from "./useContinuousGradingRun";
import type { PreviewFile } from "../FilePreviewModal";
import styles from "../../page.module.css";

const INSTRUCTIONS_STORAGE_KEY = "ta-grading-chat-instructions";
const RUBRIC_STORAGE_KEY = "ta-grading-chat-rubric";

// RES-GC-11 (docs/grading-chat-reliability.md section 4): the reliability
// floor. This session is held in memory only - a reload, tab close, or crash
// loses every accumulated row and anything still grading. Shown persistently
// (not only after the loss), so the instructor can plan a stopping point.
export const CHAT_SESSION_NOT_SAVED_DISCLOSURE =
  "This session is not saved. Reloading or closing this tab loses every graded row and anything still grading.";

function loadPersisted(key: string): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function persist(key: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private window / blocked storage: degrade to not-persisted.
  }
}

export interface GradingChatPanelProps {
  readonly copiedKey: string | null;
  readonly onCopy: (key: string, value: string) => Promise<void>;
  readonly onOpenPreview: (student: string, file: PreviewFile, trigger: HTMLElement) => void;
}

export function GradingChatPanel({ copiedKey, onCopy, onOpenPreview }: GradingChatPanelProps) {
  const [instructions, setInstructions] = useState(() => loadPersisted(INSTRUCTIONS_STORAGE_KEY));
  const [rubric, setRubric] = useState(() => loadPersisted(RUBRIC_STORAGE_KEY));
  const [submitError, setSubmitError] = useState<string | null>(null);

  const driver = useContinuousGradingRun({ provider: "gemini", commentSplit: true });

  const handleInstructionsChange = (value: string) => {
    setInstructions(value);
    persist(INSTRUCTIONS_STORAGE_KEY, value);
  };
  const handleRubricChange = (value: string) => {
    setRubric(value);
    persist(RUBRIC_STORAGE_KEY, value);
  };

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
  };

  const ensureSession = async (): Promise<boolean> => {
    if (driver.headerState === "ready") return true;
    const result = await driver.beginSession({ assignmentInstructions: instructions, rubric });
    if (result.kind === "refused") {
      setSubmitError(result.reason);
      return false;
    }
    setSubmitError(null);
    return true;
  };

  const handleSubmitText = async (content: string, label: string | undefined) => {
    if (!(await ensureSession())) return;
    const outcome = await driver.submit({ kind: "text", content, label });
    setSubmitError(outcome.kind === "accepted" ? null : outcome.reason);
  };
  const handleSubmitFile = async (file: File) => {
    if (!(await ensureSession())) return;
    const outcome = await driver.submit({ kind: "file", file });
    setSubmitError(outcome.kind === "accepted" ? null : outcome.reason);
  };
  const handleSubmitUrl = async (url: string) => {
    if (!(await ensureSession())) return;
    const outcome = await driver.submit({ kind: "url", url });
    setSubmitError(outcome.kind === "accepted" ? null : outcome.reason);
  };

  const busy = driver.headerState === "resolving";
  const hasRows = driver.run !== null && driver.run.results.length > 0;

  return (
    <div className={styles.form}>
      <div className={styles.field}>
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
      </div>

      <div className={styles.field}>
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
      </div>

      <div className={styles.ghActions}>
        <p className={styles.ghMeta}>{CHAT_SESSION_NOT_SAVED_DISCLOSURE}</p>
        {sessionReady && (
          <p className={styles.ghMeta}>Instructions and rubric are locked for this session.</p>
        )}
        <Button variant="outlined" size="small" disabled={driver.headerState === "unset"} onClick={handleNewSession}>
          New session
        </Button>
      </div>

      {submitError && (
        <p role="alert" className={styles.ghMeta}>
          {submitError}
        </p>
      )}

      {hasRows && driver.run ? (
        <>
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
        />
        </>
      ) : (
        <p className={styles.ghMeta}>Set instructions and a rubric above, then drop in your first submission below.</p>
      )}

      <ChatComposer disabled={busy} onSubmitText={handleSubmitText} onSubmitFile={handleSubmitFile} onSubmitUrl={handleSubmitUrl} />
    </div>
  );
}

export default GradingChatPanel;
