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
import { useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent } from "react";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import SegmentedToggle from "../ui/SegmentedToggle";
import { submitOnEnter } from "../ui/submitOnEnter";
import styles from "../../page.module.css";
import chatStyles from "./grading-chat.module.css";
import type { CompositePartInput } from "./chatSubmissionIntake";

const INPUT_MODE_STORAGE_KEY = "ta-grading-chat-input-mode";

type InputMode = "text" | "file" | "url";

function loadInputMode(): InputMode {
  if (typeof window === "undefined") return "text";
  try {
    const stored = localStorage.getItem(INPUT_MODE_STORAGE_KEY);
    if (stored === "text" || stored === "file" || stored === "url") return stored;
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
  readonly onSubmitFiles: (files: File[]) => void;
  readonly onSubmitUrl: (url: string) => void;
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
    else onSubmitFiles(files);
  };

  const handleSendUrl = () => {
    if (disabled || !url.trim()) return;
    if (trayActive) {
      handleAddUrlPart();
      return;
    }
    onSubmitUrl(url.trim());
    setUrl("");
  };

  const handleAddUrlPart = () => {
    if (disabled || !url.trim()) return;
    addParts([{ kind: "url", url: url.trim() }]);
    setUrl("");
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
  const addPartDisabled = disabled || (mode === "text" && !text.trim()) || (mode === "url" && !url.trim());

  const handleGrade = () => {
    if (disabled || !trayActive) return;
    onSubmitComposite(student.trim(), parts);
    setParts([]);
    setStudent("");
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    const files = Array.from(event.dataTransfer.files);
    if (files.length === 0) return;
    if (trayActive) addParts(files.map((file): CompositePartInput => ({ kind: "file", file })));
    else onSubmitFiles(files);
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
          </>
        )}
        <Button variant="text" size="small" aria-label="Add part to composite submission" disabled={addPartDisabled} onClick={handleAddPart}>
          + Add part
        </Button>
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
            size="small"
            label="Submission text"
            placeholder="Paste a student's submission"
            value={text}
            onChange={(event) => setText(event.target.value)}
            disabled={disabled}
            slotProps={{
              input: { onKeyDown: handleTextKeyDown },
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
        </div>
      )}

      {mode === "url" && (
        <div className={styles.adaptRow}>
          <TextField
            type="url"
            className={chatStyles.composerGrow}
            size="small"
            label="Canvas or GitHub repo URL"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            onKeyDown={submitOnEnter(handleSendUrl)}
            disabled={disabled}
          />
          <Button variant="outlined" disabled={disabled || !url.trim()} onClick={handleSendUrl}>
            Add
          </Button>
        </div>
      )}
    </div>
  );
}

export default ChatComposer;
