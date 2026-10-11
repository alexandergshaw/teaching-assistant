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
import SegmentedToggle from "../ui/SegmentedToggle";
import { submitOnEnter } from "../ui/submitOnEnter";
import styles from "../../page.module.css";
import chatStyles from "./grading-chat.module.css";
import type { CompositePartInput } from "./chatSubmissionIntake";
import { MAX_RECORDING_FRAMES, useChatScreenFrameCapture } from "./chatFrameCapture";
import { loadComposerHeight, persistComposerHeight } from "./composerHeight";
import { buildLmsAssignmentUrlAction } from "@/app/actions/grading-chat-intake";
import { useLmsSubmissionPicker } from "./useLmsSubmissionPicker";

const INPUT_MODE_STORAGE_KEY = "ta-grading-chat-input-mode";

type InputMode = "text" | "file" | "url" | "record" | "lms";

function loadInputMode(): InputMode {
  if (typeof window === "undefined") return "text";
  try {
    const stored = localStorage.getItem(INPUT_MODE_STORAGE_KEY);
    if (stored === "text" || stored === "file" || stored === "url" || stored === "record" || stored === "lms") return stored;
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
  readonly onSubmitText: (content: string, label: string | undefined) => void;
  readonly onSubmitFiles: (files: File[], label?: string) => void;
  readonly onSubmitUrl: (url: string, label?: string) => void;
  readonly onSubmitComposite: (student: string, parts: CompositePartInput[]) => void;
}

// Tray row text for one pending part. Pure and short: the tray shows what was
// added, never the content itself.
function describePart(part: CompositePartInput): string {
  if (part.kind === "text") return `Text - ${part.content.length} chars`;
  if (part.kind === "file") return `File: ${part.file.name}`;
  return `URL: ${part.url}`;
}

export function ChatComposer({ disabled, onSubmitText, onSubmitFiles, onSubmitUrl, onSubmitComposite }: ChatComposerProps) {
  const [mode, setMode] = useState<InputMode>(() => loadInputMode());
  const [text, setText] = useState("");
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const lms = useLmsSubmissionPicker();
  const [lmsBusy, setLmsBusy] = useState(false);
  const [lmsError, setLmsError] = useState<string | null>(null);
  const textFieldRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  // Composite assembly (docs/grading-chat-composite-scope.md section 7): the
  // tray is empty by default, and while it is empty every mode submits
  // immediately exactly as before. "+ Add part" opts in.
  const [parts, setParts] = useState<CompositePartInput[]>([]);
  const [student, setStudent] = useState("");
  const addIntentRef = useRef(false);
  const trayActive = parts.length > 0;

  const addParts = (added: CompositePartInput[]) => setParts((prev) => [...prev, ...added]);
  // A stopped recording hands back its frames as image Files; they join the
  // composite tray as file parts, so "Grade submission (N)" merges them into
  // ONE row through the existing composite path.
  const capture = useChatScreenFrameCapture((files) =>
    addParts(files.map((file): CompositePartInput => ({ kind: "file", file })))
  );
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
  const removePart = (index: number) => setParts((prev) => prev.filter((_, i) => i !== index));

  const selectMode = (next: InputMode) => {
    setMode(next);
    persistInputMode(next);
  };

  const handleSendText = () => {
    if (disabled || !text.trim()) return;
    if (trayActive) {
      handleAddTextPart();
      return;
    }
    onSubmitText(text, label.trim() ? label.trim() : undefined);
    setText("");
    setLabel("");
    textFieldRef.current?.focus();
  };

  const handleClearText = () => {
    setText("");
    setLabel("");
    textFieldRef.current?.focus();
  };

  const handleAddTextPart = () => {
    if (disabled || !text.trim()) return;
    addParts([{ kind: "text", content: text }]);
    setText("");
    setLabel("");
    textFieldRef.current?.focus();
  };

  const handleTextKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSendText();
    }
  };

  const handlePickFile = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    const asParts = addIntentRef.current || trayActive;
    addIntentRef.current = false;
    if (files.length === 0 || disabled) return;
    if (asParts) addParts(files.map((file): CompositePartInput => ({ kind: "file", file })));
    else {
      onSubmitFiles(files, label.trim() ? label.trim() : undefined);
      setLabel("");
    }
  };

  const handleSendUrl = () => {
    if (disabled || !url.trim()) return;
    if (trayActive) {
      handleAddUrlPart();
      return;
    }
    onSubmitUrl(url.trim(), label.trim() ? label.trim() : undefined);
    setUrl("");
    setLabel("");
  };

  const handleAddUrlPart = () => {
    if (disabled || !url.trim()) return;
    addParts([{ kind: "url", url: url.trim() }]);
    setUrl("");
  };

  // From LMS: the picked ids resolve to a Canvas assignment url on the server,
  // then the EXISTING url submit takes over (meta-fill and the all-submissions
  // pull are inherited from it).
  const handleSendLms = async () => {
    if (disabled || lmsBusy || !lms.canSubmit) return;
    setLmsBusy(true);
    setLmsError(null);
    try {
      const built = await buildLmsAssignmentUrlAction(lms.institution, lms.courseId, lms.assignmentId);
      if ("error" in built) setLmsError(built.error);
      else onSubmitUrl(built.url, label.trim() ? label.trim() : undefined);
    } catch {
      setLmsError("Could not build the assignment link.");
    } finally {
      setLmsBusy(false);
    }
  };

  // The secondary "+ Add part" control: moves the current mode's input into the
  // tray. File mode opens the picker and marks the pick as an add, not a submit.
  const handleAddPart = () => {
    if (mode === "text") handleAddTextPart();
    else if (mode === "url") handleAddUrlPart();
    else {
      addIntentRef.current = true;
      fileInputRef.current?.click();
    }
  };
  const addPartDisabled =
    disabled || mode === "record" || mode === "lms" || (mode === "text" && !text.trim()) || (mode === "url" && !url.trim());

  const handleGrade = () => {
    if (disabled || !trayActive) return;
    onSubmitComposite(student.trim(), parts);
    setParts([]);
    setStudent("");
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    // A drop on the composer is handled here (tray-aware) and must NOT also
    // bubble to the panel-level drop target, or it would be submitted twice.
    event.stopPropagation();
    setIsDragging(false);
    if (disabled) return;
    const files = Array.from(event.dataTransfer.files);
    if (files.length === 0) return;
    if (trayActive) addParts(files.map((file): CompositePartInput => ({ kind: "file", file })));
    else {
      onSubmitFiles(files, label.trim() ? label.trim() : undefined);
      setLabel("");
    }
  };

  return (
    <div
      className={chatStyles.composer}
      onDragOver={(event) => {
        if (disabled) return;
        event.preventDefault();
        if (!isDragging) setIsDragging(true);
      }}
      onDragLeave={(event) => {
        // Only clear when the pointer leaves the composer, not when it crosses
        // onto a child element (dragleave fires on every child boundary).
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setIsDragging(false);
      }}
      onDrop={handleDrop}
      style={
        isDragging
          ? { outline: "2px dashed var(--accent)", outlineOffset: "2px", borderRadius: "var(--radius-sm)" }
          : undefined
      }
    >
      <div className={styles.ghActions}>
        <SegmentedToggle
          label="Submission type"
          options={[
            { value: "text", label: "Text" },
            { value: "file", label: "File" },
            { value: "url", label: "URL" },
            { value: "record", label: "Record" },
            { value: "lms", label: "From LMS" },
          ]}
          value={mode}
          onChange={selectMode}
          disabled={disabled}
        />
        {mode === "file" && (
          <>
            <input ref={fileInputRef} type="file" multiple style={{ display: "none" }} onChange={handlePickFile} disabled={disabled} />
            <Button variant="outlined" size="small" aria-label="Attach a file" disabled={disabled} onClick={() => fileInputRef.current?.click()}>
              Add files
            </Button>
            <TextField
              size="small"
              className={chatStyles.composerLabel}
              label="Label (optional)"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              disabled={disabled}
            />
          </>
        )}
        <Button variant="text" size="small" aria-label="Add part to composite submission" disabled={addPartDisabled} onClick={handleAddPart}>
          + Add part
        </Button>
        <Button
          variant="text"
          size="small"
          aria-label="Capture a screenshot of a window as a part"
          disabled={disabled || trayRoom < 1 || capture.recording || capture.snapping}
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

      {trayActive && (
        <div role="group" aria-label="Composite submission parts">
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {parts.map((part, index) => (
              <li key={index} className={styles.adaptRow}>
                <span className={styles.ghMeta}>{describePart(part)}</span>
                <Button variant="text" size="small" aria-label={`Remove part ${index + 1}`} disabled={disabled} onClick={() => removePart(index)}>
                  Remove
                </Button>
              </li>
            ))}
          </ul>
          <div className={styles.adaptRow}>
            <TextField
              size="small"
              className={chatStyles.composerLabel}
              label="Student name"
              value={student}
              onChange={(event) => setStudent(event.target.value)}
              onKeyDown={submitOnEnter(handleGrade)}
              disabled={disabled}
            />
            <Button variant="contained" aria-label="Grade submission" disabled={disabled} onClick={handleGrade}>
              {`Grade submission (${parts.length})`}
            </Button>
          </div>
        </div>
      )}

      {mode === "text" && (
        <div className={styles.adaptRow}>
          <TextField
            inputRef={textFieldRef}
            multiline
            maxRows={6}
            className={chatStyles.composerGrow}
            style={composerHeight === null ? undefined : ({ "--composer-floor": `${composerHeight}px` } as CSSProperties)}
            size="small"
            label="Submission text"
            placeholder="Paste a student's submission"
            value={text}
            onChange={(event) => setText(event.target.value)}
            disabled={disabled}
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
          <TextField
            size="small"
            className={chatStyles.composerLabel}
            label="Label (optional)"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            disabled={disabled}
          />
          <Button variant="outlined" aria-label="Send submission" disabled={disabled || !text.trim()} onClick={handleSendText}>
            Send
          </Button>
          {(text !== "" || label !== "") && (
            <Button variant="text" size="small" aria-label="Clear submission text" onClick={handleClearText}>
              Clear
            </Button>
          )}
        </div>
      )}

      {mode === "record" && (
        <div className={styles.adaptRow}>
          {capture.recording ? (
            <Button variant="contained" size="small" aria-label="Stop recording" onClick={capture.stop}>
              {`Stop recording (${capture.frameCount} captured)`}
            </Button>
          ) : (
            <Button
              variant="outlined"
              size="small"
              aria-label="Start recording the screen"
              disabled={disabled || trayRoom < 1}
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
        <div className={styles.adaptRow}>
          <TextField
            type="url"
            className={chatStyles.composerGrow}
            size="small"
            label="Canvas, GitHub, or Google Drive URL"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            onKeyDown={submitOnEnter(handleSendUrl)}
            disabled={disabled}
          />
          <TextField
            size="small"
            className={chatStyles.composerLabel}
            label="Label (optional)"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            onKeyDown={submitOnEnter(handleSendUrl)}
            disabled={disabled}
          />
          <Button variant="outlined" disabled={disabled || !url.trim()} onClick={handleSendUrl}>
            Add
          </Button>
        </div>
      )}

      {mode === "lms" && (
        <div className={styles.adaptRow}>
          <TextField
            select
            size="small"
            className={chatStyles.composerLabel}
            label="Institution"
            value={lms.institution}
            onChange={(event) => lms.selectInstitution(event.target.value)}
            disabled={disabled || lms.loading.institutions}
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
            onChange={(event) => lms.selectCourse(event.target.value)}
            disabled={disabled || !lms.institution || lms.loading.courses}
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
            onChange={(event) => lms.selectAssignment(event.target.value)}
            disabled={disabled || !lms.courseId || lms.loading.assignments}
          >
            {lms.assignments.map((assignment) => (
              <MenuItem key={assignment.id} value={assignment.id}>
                {assignment.name}
              </MenuItem>
            ))}
          </TextField>
          <Button variant="outlined" aria-label="Grade the picked LMS assignment" disabled={disabled || lmsBusy || !lms.canSubmit} onClick={() => void handleSendLms()}>
            {lmsBusy ? "Working..." : "Grade"}
          </Button>
          {(lmsError ?? lms.error) && (
            <span role="alert" className={styles.ghMeta}>
              {lmsError ?? lms.error}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default ChatComposer;
