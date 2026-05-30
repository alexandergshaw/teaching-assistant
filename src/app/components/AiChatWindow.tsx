"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import styles from "../page.module.css";
import type { ChatMessage } from "@/lib/chat/types";

interface AiChatWindowProps {
  messages: ChatMessage[];
  isLoading: boolean;
  error?: string | null;
  title: string;
  icon: React.ReactNode;
  emptyMessage?: string;
  /** Optional context text shown at the top of the window (used by selection chat). */
  contextText?: string;
  position: { x: number; y: number };
  onHeaderMouseDown: (e: React.MouseEvent) => void;
  onSend: (text: string) => void;
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
  position,
  onHeaderMouseDown,
  onSend,
  onClose,
}: AiChatWindowProps) {
  const [input, setInput] = useState("");
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
    onSend(trimmed);
    setInput("");
  }, [input, isLoading, onSend]);

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

      {/* Input */}
      <div className={styles.selectionChatInputRow}>
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
          disabled={!input.trim() || isLoading}
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
