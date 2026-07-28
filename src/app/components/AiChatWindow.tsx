"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { IconButton, TextField } from "@mui/material";
import styles from "../page.module.css";
import type { ChatAttachment, ChatMessage, ChatToneStatus } from "@/lib/chat/types";
import { CHAT_ATTACHMENT_BUDGET_BYTES } from "@/lib/chat/attachments";

/** Sensible cap on how many files can ride on a single chat message. */
export const MAX_ATTACHMENTS_PER_MESSAGE = 6;

function formatMB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/** Reads a File into a base64 string (no data-URL prefix), like the voice-style upload flow. */
function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        resolve(result.split(",")[1] ?? result);
      } else {
        reject(new Error("Could not read file."));
      }
    };
    reader.onerror = () => reject(new Error("Could not read file."));
    reader.readAsDataURL(file);
  });
}

interface AiChatWindowProps {
  messages: ChatMessage[];
  isLoading: boolean;
  error?: string | null;
  title: string;
  icon: React.ReactNode;
  emptyMessage?: string;
  /** Optional context text shown at the top of the window (used by selection chat). */
  contextText?: string;
  /**
   * Whether replies are being written in the instructor's own writing tone
   * (see `ChatToneStatus`). Omitted entirely by callers that have not looked
   * it up yet (e.g. before the async status fetch resolves) — no chip is
   * shown in that case.
   */
  toneStatus?: ChatToneStatus | null;
  /** Suggested prompts shown as clickable bubbles when the chat is empty. */
  suggestions?: string[];
  /**
   * Disables the attach control (the embedded provider is text-only and
   * cannot read files — see `routeRequest` in `src/lib/embedded/router.ts`).
   */
  attachDisabled?: boolean;
  /** Tooltip shown on the attach control while `attachDisabled` is true. */
  attachDisabledReason?: string;
  /**
   * Names of attachments from the most recent exchange that produced nothing
   * (unreadable, empty, or extraction failure) — surfaced so an upload that
   * silently didn't help is diagnosable rather than invisible.
   */
  skippedFiles?: string[];
  position: { x: number; y: number };
  onHeaderMouseDown: (e: React.MouseEvent) => void;
  onSend: (text: string, attachments: ChatAttachment[]) => void;
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
  toneStatus,
  suggestions = [],
  attachDisabled = false,
  attachDisabledReason,
  skippedFiles = [],
  position,
  onHeaderMouseDown,
  onSend,
  onClose,
}: AiChatWindowProps) {
  const [input, setInput] = useState("");
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [pendingFiles, setPendingFiles] = useState<ChatAttachment[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);

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
    if (!trimmed || isLoading) return;
    onSend(trimmed, pendingFiles);
    setInput("");
    setPendingFiles([]);
    setAttachError(null);
  }, [input, isLoading, onSend, pendingFiles]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleAttachClick = useCallback(() => {
    if (attachDisabled) return;
    fileInputRef.current?.click();
  }, [attachDisabled]);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.currentTarget.files ?? []);
      // Always clear the input's own selection so picking the same file
      // again later still fires onChange.
      e.currentTarget.value = "";
      if (files.length === 0) return;

      setAttachError(null);

      if (pendingFiles.length + files.length > MAX_ATTACHMENTS_PER_MESSAGE) {
        setAttachError(`You can attach up to ${MAX_ATTACHMENTS_PER_MESSAGE} files per message.`);
        return;
      }

      try {
        const read = await Promise.all(
          files.map(async (file) => ({
            name: file.name,
            mimeType: file.type || "application/octet-stream",
            base64: await readFileAsBase64(file),
          }))
        );

        const existingBytes = pendingFiles.reduce((sum, f) => sum + f.base64.length, 0);
        const newBytes = read.reduce((sum, f) => sum + f.base64.length, 0);
        const totalBytes = existingBytes + newBytes;

        if (totalBytes > CHAT_ATTACHMENT_BUDGET_BYTES) {
          setAttachError(
            `These files total ${formatMB(totalBytes)}, over the ${formatMB(CHAT_ATTACHMENT_BUDGET_BYTES)} limit per message. Remove some files and try again.`
          );
          return;
        }

        setPendingFiles((prev) => [...prev, ...read]);
      } catch {
        setAttachError("Could not read one or more files.");
      }
    },
    [pendingFiles]
  );

  const removePendingFile = useCallback((name: string) => {
    setPendingFiles((prev) => prev.filter((f) => f.name !== name));
  }, []);

  const copyMessage = useCallback(async (text: string, index: number) => {
    await navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(
      () => setCopiedIndex((prev) => (prev === index ? null : prev)),
      2000
    );
  }, []);

  const resendMessage = useCallback((text: string, attachments?: ChatAttachment[]) => {
    if (isLoading) return;
    setInput(text);
    setPendingFiles(attachments ?? []);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [isLoading]);

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

      {/* Writing-tone status chip. Stacked as its own strip (never inside the
          contextText strip above) so the two never overlap when both are
          present. Reuses the same context-chip class/spacing; only the
          text color is overridden per state via a modifier class. */}
      {toneStatus === "active" && (
        <div
          className={`${styles.selectionChatContext} ${styles.toneStatusChip} ${styles.toneStatusChipActive}`}
          role="status"
        >
          Replies are written in your own writing tone
        </div>
      )}
      {toneStatus === "no-sample" && (
        <div
          className={`${styles.selectionChatContext} ${styles.toneStatusChip} ${styles.toneStatusChipMuted}`}
          role="status"
        >
          No writing-tone sample yet —{" "}
          <Link href="/account/voice-style" className={styles.toneStatusChipLink}>
            add one in Voice &amp; Writing Style settings
          </Link>
        </div>
      )}
      {toneStatus === "embedded" && (
        <div
          className={`${styles.selectionChatContext} ${styles.toneStatusChip} ${styles.toneStatusChipMuted}`}
          role="status"
        >
          The embedded engine does not use your writing tone
        </div>
      )}

      {/* Messages */}
      <div className={styles.selectionChatMessages}>
        {messages.length === 0 && (
          <p className={styles.selectionChatEmpty}>{emptyMessage}</p>
        )}

        {messages.map((m, i) => (
          <div key={i} className={styles.selectionChatMsgGroup}>
            {m.role === "user" && m.attachments && m.attachments.length > 0 && (
              <div className={styles.selectionChatMsgAttachments}>
                {m.attachments.map((a) => (
                  <span key={a.name} className={styles.selectionChatMsgAttachmentName} title={a.name}>
                    {a.name}
                  </span>
                ))}
              </div>
            )}
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
                <IconButton
                  size="small"
                  onClick={() => void copyMessage(m.text, i)}
                  title={copiedIndex === i ? "Copied" : "Copy response"}
                  aria-label={copiedIndex === i ? "Copied" : "Copy response"}
                >
                  {copiedIndex === i ? <CheckIcon /> : <CopyIcon />}
                </IconButton>
              ) : (
                <IconButton
                  size="small"
                  onClick={() => resendMessage(m.text, m.attachments)}
                  title="Edit and resend"
                  aria-label="Edit and resend"
                  disabled={isLoading}
                >
                  <ResendIcon />
                </IconButton>
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

      {/* Files from the last exchange that were sent but contributed nothing
          (unreadable, empty, or extraction failure) — see AiChatFab, which
          populates this from the route's `skipped` response field. */}
      {skippedFiles.length > 0 && (
        <p className={styles.attachmentSkippedNotice} role="status">
          {skippedFiles.length === 1
            ? `"${skippedFiles[0]}" could not be read and was not used.`
            : `These files could not be read and were not used: ${skippedFiles.join(", ")}`}
        </p>
      )}

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

      {/* Pending attachment chips — files selected but not yet sent */}
      {pendingFiles.length > 0 && (
        <div className={styles.attachmentChips}>
          {pendingFiles.map((f) => (
            <span key={f.name} className={styles.attachmentChip} title={f.name}>
              <span className={styles.attachmentChipName}>{f.name}</span>
              <button
                type="button"
                className={styles.attachmentChipRemove}
                onClick={() => removePendingFile(f.name)}
                aria-label={`Remove ${f.name}`}
                title="Remove"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {attachError && <p className={styles.selectionChatError} style={{ padding: "6px 12px 0" }}>{attachError}</p>}

      {/* Input */}
      <div className={styles.selectionChatInputRow}>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          style={{ display: "none" }}
          onChange={(e) => void handleFileChange(e)}
        />
        <IconButton
          size="small"
          onClick={handleAttachClick}
          disabled={isLoading || attachDisabled}
          aria-label="Attach files"
          title={
            attachDisabled
              ? attachDisabledReason ?? "Attachments are unavailable"
              : `Attach files (up to ${MAX_ATTACHMENTS_PER_MESSAGE} per message)`
          }
        >
          <AttachIcon />
        </IconButton>
        <TextField
          inputRef={inputRef}
          multiline
          maxRows={4}
          size="small"
          fullWidth
          placeholder="Type your message…"
          value={input}
          disabled={isLoading}
          onChange={(e) => setInput(e.target.value)}
          slotProps={{ input: { onKeyDown: handleKeyDown } }}
        />
        <IconButton
          size="small"
          onClick={handleSend}
          disabled={!input.trim() || isLoading}
          aria-label="Send"
        >
          <SendIcon />
        </IconButton>
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

function AttachIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" aria-hidden="true" focusable="false" fill="none">
      <path
        d="M13.5 6.5 7.75 12.25a2.121 2.121 0 0 0 3 3L16.5 9.5a3.536 3.536 0 1 0-5-5L5.75 10.25a4.95 4.95 0 0 0 7 7L18.5 11.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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
