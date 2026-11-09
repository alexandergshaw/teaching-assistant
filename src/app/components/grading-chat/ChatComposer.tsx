"use client";

// GRADING-CHAT wave 1 (docs/grading-chat-waves.md section 4b, N4b). The
// three-mode submission composer, pre-extracted from GradingChatPanel.tsx
// (N4a) per the wave plan's split-trigger contingency (section 6) - a client
// leaf with a single caller (N4a), reused-classes only, no new inline flex.
//
// UX doc (docs/grading-chat-ux.md section 3.2): text mode's Enter-sends
// handler lives in `slotProps.input` (onKeyDown reaches the textarea only
// through that slot - AiChatWindow.tsx:575-578's precedent); url mode's
// Enter-submits handler is a TOP-LEVEL TextField prop, copying the already-
// working single-line pattern GradingTab.tsx:393 uses for its own Canvas-URL
// field - a different, already-proven convention for a single-line field,
// not the multiline slotProps.input rule.
//
// RES-GC-UX-3: the Send button's own onClick calls `.focus()` back onto the
// composer field after clearing it, so the next paste does not cost an extra
// click back into the field (clicking Send moves focus to the button;
// pressing Enter does not move focus at all).
import { useEffect, useRef, useState, type CSSProperties, type ChangeEvent, type DragEvent, type KeyboardEvent, type MouseEvent } from "react";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import Accordion from "@mui/material/Accordion";
import AccordionSummary from "@mui/material/AccordionSummary";
import AccordionDetails from "@mui/material/AccordionDetails";
import styles from "../../page.module.css";
import chatStyles from "./grading-chat.module.css";
import type { CompositePartInput } from "./chatSubmissionIntake";
import { MAX_RECORDING_FRAMES, useChatScreenFrameCapture } from "./chatFrameCapture";
import { loadComposerHeight, persistComposerHeight } from "./composerHeight";
import { buildLmsAssignmentUrlAction } from "@/app/actions/grading-chat-intake";
import { useLmsSubmissionPicker } from "./useLmsSubmissionPicker";
import { LMS_ASSIGNMENT_COPY, LMS_COURSE_COPY, LMS_INSTITUTION_COPY, lmsFieldIndication } from "./lmsPickerState";
import { SubmissionDrop } from "./SubmissionDrop";
import type { DirectFileOutcome } from "./chatDirectFileIntake";
import type { ReviewedPastedDiscussion } from "@/lib/grade/reviewed-pasted-discussion";
import type { SubmitOutcome } from "./useContinuousGradingRun";
import { submitOneFileGroup } from "./submissionDropRoutes";
import { dispatchComposite } from "./compositeSubmission";
import { claimIntake, releaseIntake, resetIntake, type IntakeFence } from "./intakeFence";

const INPUT_MODE_STORAGE_KEY = "ta-grading-chat-input-mode";

type InputMode = "text" | "url" | "record" | "lms";

function loadInputMode(): InputMode {
  if (typeof window === "undefined") return "text";
  try {
    const stored = localStorage.getItem(INPUT_MODE_STORAGE_KEY);
    if (stored === "text" || stored === "url" || stored === "record" || stored === "lms") return stored;
  } catch {
    // Private window / blocked storage: degrade to the default.
  }
  return "text";
}

function persistInputMode(mode: InputMode) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(INPUT_MODE_STORAGE_KEY, mode);
  } catch {
    // ignore
  }
}

export interface ChatComposerProps {
  readonly disabled: boolean;
  readonly reviewFiles?: boolean;
  readonly getSessionEpoch?: () => number;
  readonly sessionEpoch?: number;
  readonly sharedLatch?: IntakeFence;
  readonly onSubmitText: (content: string, label: string | undefined) => void;
  readonly onSubmitFiles: (files: File[], label?: string) => Promise<DirectFileOutcome[]>;
  readonly onSubmitUrl: (url: string, label?: string) => Promise<SubmitOutcome>;
  readonly onSubmitComposite: (student: string, parts: CompositePartInput[]) => Promise<SubmitOutcome>;
  readonly onSubmitReviewed?: (student: string, content: string, discussion: ReviewedPastedDiscussion) => Promise<SubmitOutcome>;
}

// Tray row text for one pending part. Pure and short: the tray shows what was
// added, never the content itself.
function describePart(part: CompositePartInput): string {
  if (part.kind === "text") return `Text - ${part.content.length} chars`;
  if (part.kind === "file") return `File: ${part.file.name}`;
  return `URL: ${part.url}`;
}

export function ChatComposer({ disabled, sharedLatch, reviewFiles = false, getSessionEpoch, sessionEpoch, onSubmitFiles, onSubmitUrl, onSubmitComposite, onSubmitReviewed }: ChatComposerProps) {
  const [mode, setMode] = useState<InputMode>(() => loadInputMode());
  const [text, setText] = useState("");
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const lms = useLmsSubmissionPicker();
  const [lmsBusy, setLmsBusy] = useState(false);
  const [lmsError, setLmsError] = useState<string | null>(null);
  const [urlPending, setUrlPending] = useState(false);
  const [urlUncertain, setUrlUncertain] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [lmsUncertain, setLmsUncertain] = useState(false);
  const [dropNotice, setDropNotice] = useState(false);
  const textFieldRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // Composite assembly (docs/grading-chat-composite-scope.md section 7): the
  // tray is empty by default, and while it is empty every mode submits
  // immediately exactly as before. "+ Add part" opts in.
  const [parts, setParts] = useState<CompositePartInput[]>([]);
  const [compositePending, setCompositePending] = useState(false);
  const [compositeUncertain, setCompositeUncertain] = useState(false);
  const [compositeError, setCompositeError] = useState<string | null>(null);
  const [localLatch] = useState<IntakeFence>(() => ({ busy: false, generation: 0 }));
  const intakeLatch = sharedLatch ?? localLatch;
  const mounted = useRef(true);
  const [previousEpoch, setPreviousEpoch] = useState(sessionEpoch);
  const controlsDisabled = disabled || compositePending || urlPending || lmsBusy;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { if (!sharedLatch) resetIntake(localLatch); }, [sessionEpoch, sharedLatch, localLatch]);
  if (previousEpoch !== sessionEpoch) {
    setPreviousEpoch(sessionEpoch);
    if (urlPending) setUrlUncertain(true);
    if (lmsBusy) setLmsUncertain(true);
    if (compositePending) setCompositeUncertain(true);
    setUrlPending(false); setLmsBusy(false); setCompositePending(false);
  }
  const [student, setStudent] = useState("");
  const captureRevision = useRef(0);
  const trayActive = parts.length > 0;

  const addParts = (added: CompositePartInput[]) => { if (!intakeLatch.busy) setParts((prev) => [...prev, ...added]); };
  // A stopped recording hands back its frames as image Files; they join the
  // composite tray as file parts, so "Grade submission (N)" merges them into
  // ONE row through the existing composite path.
  const capture = useChatScreenFrameCapture((files) => {
    captureRevision.current += 1;
    setParts((previous) => [...previous, ...files.map((file): CompositePartInput => ({ kind: "file", file }))]);
  });
  const trayRoom = MAX_RECORDING_FRAMES - parts.length;
  // Vertical expand (docs/grading-chat-consolidation-scope.md W1, A): the
  // persisted floor is a min-height on the TEXTAREA (see composerHeight.ts for
  // why min-height and not height). The drag-end height is captured only when
  // a press-and-release actually changed the box, so a plain click never
  // ratchets the floor up to the autosized content height.
  // The stored floor is restored in a mount effect, not a state initializer:
  // the server HTML has no floor, so an initializer would mismatch on hydrate.
  const [composerHeight, setComposerHeight] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await Promise.resolve(loadComposerHeight());
      if (!cancelled && stored !== null) setComposerHeight(stored);
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  const pressHeightRef = useRef<number | null>(null);
  const handleTextareaMouseDown = (event: MouseEvent<HTMLTextAreaElement>) => {
    pressHeightRef.current = event.currentTarget.offsetHeight;
  };
  const handleTextareaMouseUp = (event: MouseEvent<HTMLTextAreaElement>) => {
    const before = pressHeightRef.current;
    pressHeightRef.current = null;
    const after = event.currentTarget.offsetHeight;
    if (before === null || after === before) return;
    const saved = persistComposerHeight(after);
    if (saved !== null) setComposerHeight(saved);
  };
  const removePart = (index: number) => { if (!intakeLatch.busy) setParts((prev) => prev.filter((_, i) => i !== index)); };

  const selectMode = (next: InputMode) => {
    if (intakeLatch.busy) return;
    setMode(next);
    persistInputMode(next);
    // Selecting Record starts the capture directly. This MUST run here, inside
    // the click gesture: getDisplayMedia needs a user gesture, and an effect
    // watching `mode` would run after render and be blocked.
    if (next === "record" && mode !== "record" && !controlsDisabled && !capture.recording && !capture.snapping && trayRoom >= 1) {
      void capture.start(trayRoom).catch(() => {});
    }
  };

  const handleAddTextPart = () => {
    if (controlsDisabled || intakeLatch.busy || !text.trim()) return;
    addParts([{ kind: "text", content: text }]);
    setText("");
    setLabel("");
    textFieldRef.current?.focus();
  };

  const handleTextKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleAddTextPart();
    }
  };

  const handlePickFile = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0 || controlsDisabled || intakeLatch.busy) return;
    addParts(files.map((file): CompositePartInput => ({ kind: "file", file })));
  };

  const handleSendUrl = async () => {
    if (controlsDisabled || intakeLatch.busy || urlUncertain || !url.trim()) return;
    if (trayActive) {
      handleAddUrlPart();
      return;
    }
    const capturedUrl = url, capturedLabel = label, epoch = getSessionEpoch?.();
    const token = claimIntake(intakeLatch); if (token === null) return;
    setUrlPending(true); setUrlError(null);
    try {
      const outcome = await onSubmitUrl(capturedUrl.trim(), capturedLabel.trim() || undefined);
      if (!mounted.current || intakeLatch.generation !== token) return;
      if (getSessionEpoch?.() !== epoch || outcome.kind === "partial" || (outcome.kind === "accepted" && outcome.entryCount === 0)) setUrlUncertain(true);
      else if (outcome.kind === "refused") setUrlError(outcome.reason);
      else { setUrl((current) => current === capturedUrl ? "" : current); setLabel((current) => current === capturedLabel ? "" : current); }
    } catch { if (mounted.current && intakeLatch.generation === token) setUrlUncertain(true); }
    finally { if (releaseIntake(intakeLatch, token) && mounted.current) setUrlPending(false); }
  };

  const handleAddUrlPart = () => {
    if (controlsDisabled || intakeLatch.busy || !url.trim()) return;
    addParts([{ kind: "url", url: url.trim() }]);
    setUrl("");
  };

  // From LMS: the picked ids resolve to a Canvas assignment url on the server,
  // then the EXISTING url submit takes over (meta-fill and the all-submissions
  // pull are inherited from it).
  const handleSendLms = async () => {
    if (controlsDisabled || intakeLatch.busy || lmsUncertain || !lms.canSubmit) return;
    const epoch = getSessionEpoch?.(); const token = claimIntake(intakeLatch); if (token === null) return; setLmsBusy(true);
    setLmsError(null);
    let submitted = false;
    try {
      const built = await buildLmsAssignmentUrlAction(lms.institution, lms.courseId, lms.assignmentId);
      if (!mounted.current || intakeLatch.generation !== token) return;
      if (getSessionEpoch?.() !== epoch) { setLmsUncertain(true); return; }
      if ("error" in built) setLmsError(built.error);
      else {
        submitted = true;
        const outcome = await onSubmitUrl(built.url, label.trim() || undefined);
        if (!mounted.current || intakeLatch.generation !== token) return;
        if (getSessionEpoch?.() !== epoch || outcome.kind === "partial" || (outcome.kind === "accepted" && outcome.entryCount === 0)) setLmsUncertain(true);
        else if (outcome.kind === "refused") setLmsError(outcome.reason);
      }
    } catch {
      if (mounted.current && intakeLatch.generation === token) { if (submitted) setLmsUncertain(true); else setLmsError("Could not build the assignment link."); }
    } finally {
      if (releaseIntake(intakeLatch, token) && mounted.current) setLmsBusy(false);
    }
  };

  // The secondary "+ Add part" control: moves the current mode's input into the
  // tray. File mode opens the picker and marks the pick as an add, not a submit.
  const handleAddPart = () => {
    if (mode === "text") handleAddTextPart();
    else if (mode === "url") handleAddUrlPart();
  };
  const addPartDisabled =
    controlsDisabled || mode === "record" || mode === "lms" || (mode === "text" && !text.trim()) || (mode === "url" && !url.trim());

  const handleGrade = async () => {
    if (controlsDisabled || intakeLatch.busy || compositeUncertain || !trayActive || parts.length > MAX_RECORDING_FRAMES || capture.recording || capture.snapping) return;
    const token = claimIntake(intakeLatch); if (token === null) return;
    setCompositePending(true);
    setCompositeError(null);
    const epoch = getSessionEpoch?.();
    const submittedParts = parts;
    const submittedStudent = student;
    const submittedCaptureRevision = captureRevision.current;
    const outcome = await dispatchComposite(
      () => onSubmitComposite(submittedStudent.trim(), submittedParts),
      () => mounted.current && getSessionEpoch?.() === epoch && intakeLatch.generation === token,
    );
    if (!releaseIntake(intakeLatch, token) || !mounted.current) return;
    setCompositePending(false);
    if (outcome.kind === "accepted") {
      setParts((current) => submittedParts.every((part, index) => current[index] === part) ? current.slice(submittedParts.length) : current);
      if (captureRevision.current === submittedCaptureRevision) setStudent((current) => current === submittedStudent ? "" : current);
    }
    else if (outcome.kind === "refused") setCompositeError(outcome.reason);
    else setCompositeUncertain(true);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (controlsDisabled || intakeLatch.busy) return;
    const files = Array.from(event.dataTransfer.files);
    if (!files.length) return;
    if (trayActive) {
      addParts(files.map((file): CompositePartInput => ({ kind: "file", file })));
      setDropNotice(false);
    } else setDropNotice(true);
  };

  return (
    <div className={chatStyles.composer} onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>
      <SubmissionDrop disabled={controlsDisabled} sharedLatch={intakeLatch} reviewFiles={reviewFiles} getSessionEpoch={getSessionEpoch} sessionEpoch={sessionEpoch} onMany={(files) => onSubmitFiles(files)}
        onOne={(name, files) => submitOneFileGroup(name, files, onSubmitFiles, onSubmitComposite)}
        onText={(name, content) => onSubmitComposite(name, [{ kind: "text", content }])} onReviewed={onSubmitReviewed} />
      {dropNotice && <span role="status">Drop files in the submission area above.</span>}
      <Accordion>
        <AccordionSummary expandIcon={<span aria-hidden="true">+</span>}>More submission options</AccordionSummary>
        <AccordionDetails>
      <div className={`${styles.ghActions} ${chatStyles.composerRow}`}>
        <Button size="small" aria-pressed={mode === "text"} variant={mode === "text" ? "contained" : "outlined"} onClick={() => selectMode("text")} disabled={controlsDisabled}>Combine parts</Button>
        <Button size="small" aria-pressed={mode === "url"} variant={mode === "url" ? "contained" : "outlined"} onClick={() => selectMode("url")} disabled={controlsDisabled}>Add link</Button>
        <Button size="small" aria-pressed={mode === "record"} variant={mode === "record" ? "contained" : "outlined"} onClick={() => selectMode("record")} disabled={controlsDisabled}>Record</Button>
        <Button size="small" aria-pressed={mode === "lms"} variant={mode === "lms" ? "contained" : "outlined"} onClick={() => selectMode("lms")} disabled={controlsDisabled}>From LMS</Button>
        {mode === "text" && <><input ref={fileInputRef} type="file" multiple hidden onChange={handlePickFile} disabled={controlsDisabled} /><Button size="small" onClick={() => fileInputRef.current?.click()} disabled={controlsDisabled}>Add files as parts</Button></>}
        <Button variant="text" size="small" aria-label="Add part to composite submission" disabled={addPartDisabled} onClick={handleAddPart}>
          + Add part
        </Button>
        <Button
          variant="text"
          size="small"
          aria-label="Capture a screenshot of a window as a part"
          disabled={controlsDisabled || trayRoom < 1 || capture.recording || capture.snapping}
          onClick={() => void capture.snapOnce()}
        >
          {capture.snapping ? "Capturing..." : "Snap screenshot"}
        </Button>
        {mode !== "record" && capture.error && (
          <span role="alert" className={styles.ghMeta}>
            {capture.error}
          </span>
        )}
      </div>

      {!trayActive && mode !== "record" && mode !== "lms" && (
        <span className={styles.ghMeta}>
          To combine files, text, or a link, add each part and then select Grade submission.
        </span>
      )}

      {compositeError && <Alert severity="warning">{compositeError}</Alert>}
      {compositeUncertain && <Alert severity="warning" action={<Button color="inherit" size="small" onClick={() => setCompositeUncertain(false)}>I checked results</Button>}>The combined submission could not be confirmed. Check previous results before retrying.</Alert>}
      {parts.length > MAX_RECORDING_FRAMES && <Alert severity="warning">This submission has too many parts. Remove parts until it has at most {MAX_RECORDING_FRAMES} before grading.</Alert>}
      {trayActive && (
        <div role="group" aria-label="Composite submission parts">
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {parts.map((part, index) => (
              <li key={index} className={`${styles.adaptRow} ${chatStyles.composerRow}`}>
                <span className={styles.ghMeta}>{describePart(part)}</span>
                <Button variant="text" size="small" aria-label={`Remove part ${index + 1}`} disabled={controlsDisabled} onClick={() => removePart(index)}>
                  Remove
                </Button>
              </li>
            ))}
          </ul>
          <div className={`${styles.adaptRow} ${chatStyles.composerRow}`}>
            <TextField
              size="small"
              className={chatStyles.composerLabel}
              label="Student name"
              value={student}
              onChange={(event) => { if (!intakeLatch.busy) setStudent(event.target.value); }}
              onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void handleGrade(); } }}
              disabled={controlsDisabled}
            />
            <Button variant="contained" aria-label="Grade submission" disabled={controlsDisabled || compositeUncertain || parts.length > MAX_RECORDING_FRAMES || capture.recording || capture.snapping} onClick={() => void handleGrade()}>
              {`Grade submission (${parts.length})`}
            </Button>
          </div>
        </div>
      )}

      {mode === "text" && (
        <div className={`${styles.adaptRow} ${chatStyles.composerRow}`}>
          <TextField
            inputRef={textFieldRef}
            multiline
            maxRows={6}
            className={chatStyles.composerGrow}
            style={composerHeight === null ? undefined : ({ "--composer-floor": `${composerHeight}px` } as CSSProperties)}
            size="small"
            label="Text for combined submission"
            placeholder="Paste text to add as a part"
            value={text}
            onChange={(event) => setText(event.target.value)}
            disabled={controlsDisabled}
            slotProps={{
              input: { onKeyDown: handleTextKeyDown },
              // resize reaches the real <textarea> (not .MuiInputBase-root):
              // MUI's CSS sets resize:none on it, an inline style wins. The
              // min-height floor is NOT inline: inline style is also spread onto
              // MUI's hidden measuring textarea and would lift the maxRows cap.
              // It comes from --composer-floor via .composerGrow in the CSS.
              htmlInput: {
                onMouseDown: handleTextareaMouseDown,
                onMouseUp: handleTextareaMouseUp,
                style: { resize: "vertical" },
              },
            }}
          />
          <Button variant="outlined" disabled={controlsDisabled || !text.trim()} onClick={handleAddTextPart}>Add text part</Button>
        </div>
      )}

      {mode === "record" && (
        <div className={`${styles.adaptRow} ${chatStyles.composerRow}`}>
          {capture.recording ? (
            <Button variant="contained" size="small" aria-label="Stop recording" onClick={capture.stop}>
              {`Stop recording (${capture.frameCount} captured)`}
            </Button>
          ) : (
            <Button
              variant="outlined"
              size="small"
              aria-label="Start recording the screen"
              disabled={controlsDisabled || trayRoom < 1}
              onClick={() => void capture.start(trayRoom)}
            >
              Start recording
            </Button>
          )}
          <span className={styles.ghMeta}>
            {trayRoom < 1
              ? `The tray is full (${MAX_RECORDING_FRAMES} parts). Remove one to record.`
              : "Frames are captured every few seconds and added as parts when you stop."}
          </span>
          {capture.error && (
            <span role="alert" className={styles.ghMeta}>
              {capture.error}
            </span>
          )}
        </div>
      )}

      {mode === "url" && (
        <div className={`${styles.adaptRow} ${chatStyles.composerRow}`}>
          <TextField
            type="url"
            className={chatStyles.composerGrow}
            size="small"
            label="Canvas, GitHub, or Google Drive URL"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void handleSendUrl(); } }}
            disabled={controlsDisabled}
          />
          <TextField
            size="small"
            className={chatStyles.composerLabel}
            label="Label (optional)"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void handleSendUrl(); } }}
            disabled={controlsDisabled}
          />
          <Button variant="outlined" disabled={controlsDisabled || urlUncertain || !url.trim()} onClick={() => void handleSendUrl()}>
            Add
          </Button>
          {urlError && <Alert severity="warning">{urlError}</Alert>}
          {urlUncertain && <Alert severity="warning" action={<Button color="inherit" size="small" onClick={() => setUrlUncertain(false)}>I checked results</Button>}>This link may have queued work. Check results before retrying.</Alert>}
        </div>
      )}

      {mode === "lms" && (() => {
        const instInd = lmsFieldIndication({
          globallyDisabled: controlsDisabled,
          parentSelected: true,
          loading: lms.loading.institutions,
          error: lms.errors.institutions,
          optionCount: lms.institutions.length,
          emptyReason: lms.emptyReason,
          ...LMS_INSTITUTION_COPY,
        });
        const courseInd = lmsFieldIndication({
          globallyDisabled: controlsDisabled,
          parentSelected: !!lms.institution,
          loading: lms.loading.courses,
          error: lms.errors.courses,
          optionCount: lms.courses.length,
          ...LMS_COURSE_COPY,
        });
        const assignmentInd = lmsFieldIndication({
          globallyDisabled: controlsDisabled,
          parentSelected: !!lms.courseId,
          loading: lms.loading.assignments,
          error: lms.errors.assignments,
          optionCount: lms.assignments.length,
          ...LMS_ASSIGNMENT_COPY,
        });
        return (
        <div className={`${styles.adaptRow} ${chatStyles.composerRow}`}>
          <TextField
            select
            size="small"
            className={chatStyles.composerLabel}
            label="Institution"
            value={lms.institution}
            onChange={(event) => { if (!intakeLatch.busy) lms.selectInstitution(event.target.value); }}
            disabled={instInd.disabled}
            error={instInd.error}
            helperText={instInd.helperText}
          >
            {lms.institutions.map((code) => (
              <MenuItem key={code} value={code}>
                {code}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            className={chatStyles.composerGrow}
            label="Course"
            value={lms.courseId}
            onChange={(event) => { if (!intakeLatch.busy) lms.selectCourse(event.target.value); }}
            disabled={courseInd.disabled}
            error={courseInd.error}
            helperText={courseInd.helperText}
          >
            {lms.courses.map((course) => (
              <MenuItem key={course.id} value={course.id}>
                {course.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            className={chatStyles.composerGrow}
            label="Assignment"
            value={lms.assignmentId}
            onChange={(event) => { if (!intakeLatch.busy) lms.selectAssignment(event.target.value); }}
            disabled={assignmentInd.disabled}
            error={assignmentInd.error}
            helperText={assignmentInd.helperText}
          >
            {lms.assignments.map((assignment) => (
              <MenuItem key={assignment.id} value={assignment.id}>
                {assignment.name}
              </MenuItem>
            ))}
          </TextField>
          <Button variant="outlined" aria-label="Grade the picked LMS assignment" disabled={controlsDisabled || lmsUncertain || !lms.canSubmit} onClick={() => void handleSendLms()}>
            {lmsBusy ? "Working..." : "Grade"}
          </Button>
          {lmsError && (
            <span role="alert" className={styles.ghMeta}>
              {lmsError}
            </span>
          )}
          {lmsUncertain && <Alert severity="warning" action={<Button color="inherit" size="small" onClick={() => setLmsUncertain(false)}>I checked results</Button>}>This assignment may have queued work. Check results before retrying.</Alert>}
        </div>
        );
      })()}
        </AccordionDetails>
      </Accordion>
    </div>
  );
}

export default ChatComposer;
