"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import styles from "../page.module.css";
import type { AttachedFile, ChatMessage } from "@/lib/chat/types";

// ── File reading helpers ──────────────────────────────────────────────────────

const TEXT_EXTENSIONS = /\.(txt|md|csv|json|xml|yaml|yml|js|ts|tsx|jsx|py|html|css|sh|rb|java|c|cpp|h|go|rs|swift)$/i;

function fileIsText(file: File): boolean {
  if (file.type.startsWith("text/")) return true;
  if (["application/json", "application/xml"].includes(file.type)) return true;
  if (!file.type && TEXT_EXTENSIONS.test(file.name)) return true;
  return false;
}

async function readAttachedFile(file: File): Promise<AttachedFile> {
  if (fileIsText(file)) {
    const data = await file.text();
    return { name: file.name, mimeType: file.type || "text/plain", data, isText: true };
  }
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1] ?? "";
      resolve({ name: file.name, mimeType: file.type, data: base64, isText: false });
    };
    reader.readAsDataURL(file);
  });
}

const MAX_FILES = 5;
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

interface AiChatWindowProps {
  messages: ChatMessage[];
  isLoading: boolean;
  error?: string | null;
  title: string;
  icon: React.ReactNode;
  emptyMessage?: string;
  /** Optional context text shown at the top of the window (used by selection chat). */
  contextText?: string;
  /** Suggested prompts shown as clickable bubbles when the chat is empty. */
  suggestions?: string[];
  position: { x: number; y: number };
  onHeaderMouseDown: (e: React.MouseEvent) => void;
  onSend: (text: string, files: AttachedFile[]) => void;
  onClose: () => void;
}

/**
 * Shared AI chat window used by both the floating-action-button chat
 * (`AiChatFab`) and the text-selection chat (`SelectionChatWidget`).
 */
export default function AiChatWindow({
  messages,
  isLoading,
  error,
  title,
  icon,
  emptyMessage = "Ask me anything!",
  contextText,
  suggestions = [],
  position,
  onHeaderMouseDown,
  onSend,
  onClose,
}: AiChatWindowProps) {
  const [input, setInput] = useState("");
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Focus input whenever the window mounts.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Auto-scroll to newest message.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if ((!trimmed && attachedFiles.length === 0) || isLoading) return;
    onSend(trimmed, attachedFiles);
    setInput("");
    setAttachedFiles([]);
    setFileError(null);
  }, [input, attachedFiles, isLoading, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const copyMessage = useCallback(async (text: string, index: number) => {
    await navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(
      () => setCopiedIndex((prev) => (prev === index ? null : prev)),
      2000
    );
  }, []);

  const resendMessage = useCallback((text: string) => {
    if (isLoading) return;
    setInput(text);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [isLoading]);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;

    const remaining = MAX_FILES - attachedFiles.length;
    if (remaining <= 0) {
      setFileError(`Maximum ${MAX_FILES} files allowed.`);
      return;
    }

    const toProcess = files.slice(0, remaining);
    const oversized = toProcess.filter(f => f.size > MAX_FILE_BYTES);
    if (oversized.length > 0) {
      setFileError(`Files must be under 5 MB each. Skipped: ${oversized.map(f => f.name).join(", ")}`);
    } else {
      setFileError(null);
    }

    const eligible = toProcess.filter(f => f.size <= MAX_FILE_BYTES);
    if (eligible.length === 0) return;

    const processed = await Promise.all(eligible.map(readAttachedFile));
    setAttachedFiles(prev => [...prev, ...processed]);
  }, [attachedFiles.length]);

  const removeFile = useCallback((index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
    setFileError(null);
  }, []);

  return (
    <div
      className={styles.selectionChatWindow}
      style={{ left: position.x, top: position.y }}
      role="dialog"
      aria-label={title}
    >
      {/* Header */}
      <div className={styles.selectionChatHeader} onMouseDown={onHeaderMouseDown}>
        <div className={styles.selectionChatHeaderLeft}>
          {icon}
          <span>{title}</span>
        </div>
        <button
          className={styles.selectionChatClose}
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>
      </div>

      {/* Optional context strip (selection chat) */}
      {contextText && (
        <div className={styles.selectionChatContext} title={contextText}>
          &ldquo;{contextText.length > 140 ? contextText.slice(0, 140) + "…" : contextText}&rdquo;
        </div>
      )}

      {/* Messages */}
      <div className={styles.selectionChatMessages}>
        {messages.length === 0 && (
          <p className={styles.selectionChatEmpty}>{emptyMessage}</p>
        )}

        {messages.map((m, i) => (
          <div key={i} className={styles.selectionChatMsgGroup}>
            <div
              className={
                m.role === "user"
                  ? styles.selectionChatUserMsg
                  : styles.selectionChatAiMsg
              }
            >
              {m.text}
            </div>

            <div
              className={
                m.role === "user"
                  ? styles.selectionChatMsgActionsUser
                  : styles.selectionChatMsgActionsAi
              }
            >
              {m.role === "assistant" ? (
                <button
                  className={styles.selectionChatMsgAction}
                  onClick={() => void copyMessage(m.text, i)}
                  title={copiedIndex === i ? "Copied" : "Copy response"}
                  aria-label={copiedIndex === i ? "Copied" : "Copy response"}
                >
                  {copiedIndex === i ? <CheckIcon /> : <CopyIcon />}
                </button>
              ) : (
                <button
                  className={styles.selectionChatMsgAction}
                  onClick={() => resendMessage(m.text)}
                  title="Edit and resend"
                  aria-label="Edit and resend"
                  disabled={isLoading}
                >
                  <ResendIcon />
                </button>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className={styles.selectionChatAiMsg}>
            <span className={styles.selectionChatTyping}>···</span>
          </div>
        )}

        {error && <p className={styles.selectionChatError}>{error}</p>}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggestion bubbles — shown when the chat is empty */}
      {messages.length === 0 && suggestions.length > 0 && (
        <div className={styles.suggestionBubbles} aria-label="Suggested prompts">
          {suggestions.map((s) => (
            <button
              key={s}
              className={styles.suggestionBubble}
              onClick={() => onSend(s, [])}
              disabled={isLoading}
              title={s}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Attached files */}
      {(attachedFiles.length > 0 || fileError) && (
        <div className={styles.chatAttachedFiles}>
          {attachedFiles.map((f, i) => (
            <span key={i} className={styles.chatFileChip}>
              <FileIcon />
              <span className={styles.chatFileChipName} title={f.name}>{f.name}</span>
              <button
                className={styles.chatFileChipRemove}
                onClick={() => removeFile(i)}
                aria-label={`Remove ${f.name}`}
                type="button"
              >
                ×
              </button>
            </span>
          ))}
          {fileError && <span className={styles.chatFileError}>{fileError}</span>}
        </div>
      )}

      {/* Input */}
      <div className={styles.selectionChatInputRow}>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="text/*,image/*,application/pdf,application/json,application/xml,.md,.csv,.yaml,.yml,.js,.ts,.tsx,.jsx,.py,.html,.css,.sh,.rb,.java,.c,.cpp,.h,.go,.rs,.swift"
          style={{ display: "none" }}
          onChange={(e) => void handleFileChange(e)}
          aria-hidden="true"
        />
        <button
          className={styles.chatAttachButton}
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading || attachedFiles.length >= MAX_FILES}
          title="Attach files"
          aria-label="Attach files"
          type="button"
        >
          <PaperclipIcon />
        </button>
        <textarea
          ref={inputRef}
          className={styles.selectionChatInput}
          placeholder="Type your message…"
          value={input}
          rows={1}
          disabled={isLoading}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          className={styles.selectionChatSend}
          onClick={handleSend}
          disabled={(!input.trim() && attachedFiles.length === 0) || isLoading}
          aria-label="Send"
        >
          <SendIcon />
        </button>
      </div>
    </div>
  );
}

// ── Icons ────────────────────────────────────────────────────────────────────

function CopyIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 20 20" aria-hidden="true" focusable="false" fill="currentColor">
      <path d="M7 3.5A2.5 2.5 0 0 1 9.5 1h6A2.5 2.5 0 0 1 18 3.5v8A2.5 2.5 0 0 1 15.5 14h-6A2.5 2.5 0 0 1 7 11.5v-8Zm2.5-1a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-6Z" />
      <path d="M2 7.5A2.5 2.5 0 0 1 4.5 5h.75a.75.75 0 0 1 0 1.5H4.5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-.75a.75.75 0 0 1 1.5 0v.75A2.5 2.5 0 0 1 10.5 18h-6A2.5 2.5 0 0 1 2 15.5v-8Z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 20 20" aria-hidden="true" focusable="false" fill="currentColor">
      <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
    </svg>
  );
}

function ResendIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 20 20" aria-hidden="true" focusable="false" fill="currentColor">
      <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 0 1-9.201-4.925A5.5 5.5 0 0 1 15.1 4.9l1.647 1.629A.75.75 0 0 0 18 6V2a.75.75 0 0 0-.75-.75h-4a.75.75 0 0 0-.482 1.32l1.18 1.168a7 7 0 1 0 1.706 7.197.75.75 0 1 0-1.42-.49 5.502 5.502 0 0 1-.922 1.979Z" clipRule="evenodd" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
      <path d="M1.5 8L14 2l-4 6 4 6L1.5 8z" fill="currentColor" />
    </svg>
  );
}

function PaperclipIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <polyline points="13 2 13 9 20 9" />
    </svg>
  );
}
