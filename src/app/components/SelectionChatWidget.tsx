"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { selectionChatAction, type SelectionChatMessage } from "../actions";
import styles from "../page.module.css";

interface SelectionPos {
  text: string;
  x: number;
  y: number;
}

interface Pos { x: number; y: number }

export default function SelectionChatWidget() {
  const [mounted, setMounted] = useState(false);
  const [icon, setIcon] = useState<{ x: number; y: number } | null>(null);
  const [pendingText, setPendingText] = useState("");
  const [chat, setChat] = useState<SelectionPos | null>(null);
  const [messages, setMessages] = useState<SelectionChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const [dragPos, setDragPosState] = useState<Pos | null>(null);
  const dragPosRef = useRef<Pos | null>(null);
  const setDragPos = useCallback((pos: Pos | null) => {
    dragPosRef.current = pos;
    setDragPosState(pos);
  }, []);

  const widgetRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  const handleMouseUp = useCallback((e: MouseEvent) => {
    if (widgetRef.current?.contains(e.target as Node)) return;
    requestAnimationFrame(() => {
      const selection = window.getSelection();
      const text = selection?.toString().trim() ?? "";
      if (!selection || !text || selection.rangeCount === 0) {
        setIcon(null);
        setPendingText("");
        return;
      }
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      setIcon({ x: rect.right, y: rect.bottom });
      setPendingText(text);
    });
  }, []);

  const handleMouseDown = useCallback((e: MouseEvent) => {
    if (widgetRef.current?.contains(e.target as Node)) return;
    setIcon(null);
    setPendingText("");
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") {
      setIcon(null);
      setPendingText("");
      setChat(null);
      setDragPos(null);
      setMessages([]);
      setInput("");
      setError(null);
    }
  }, [setDragPos]);

  useEffect(() => {
    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleMouseUp, handleMouseDown, handleKeyDown]);

  useEffect(() => {
    if (chat && inputRef.current) {
      inputRef.current.focus();
    }
  }, [chat]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const openChat = () => {
    if (!icon || !pendingText) return;
    const chatData: SelectionPos = { text: pendingText, x: icon.x, y: icon.y };
    setChat(chatData);
    setDragPos({
      x: Math.max(8, Math.min(chatData.x - 200, window.innerWidth - 376)),
      y: Math.max(8, Math.min(chatData.y + 12, window.innerHeight - 440)),
    });
    setMessages([]);
    setInput("");
    setError(null);
    setIcon(null);
    setPendingText("");
    window.getSelection()?.removeAllRanges();
  };

  const closeChat = () => {
    setChat(null);
    setDragPos(null);
    setMessages([]);
    setInput("");
    setError(null);
    setCopiedIndex(null);
  };

  const copyMessage = async (text: string, index: number) => {
    await navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex((prev) => (prev === index ? null : prev)), 2000);
  };

  const resendMessage = (text: string) => {
    if (isLoading) return;
    setInput(text);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const sendMessage = async () => {
    if (!input.trim() || !chat || isLoading) return;
    const question = input.trim();
    const nextMessages: SelectionChatMessage[] = [...messages, { role: "user", text: question }];
    setMessages(nextMessages);
    setInput("");
    setIsLoading(true);
    setError(null);

    const result = await selectionChatAction(chat.text, question, messages);
    setIsLoading(false);

    if (typeof result === "string") {
      setMessages((prev) => [...prev, { role: "model", text: result }]);
    } else {
      setError(result.error);
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  };

  // Chat header drag handler
  const onHeaderMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    const startMouse: Pos = { x: e.clientX, y: e.clientY };
    const startPos: Pos = { ...dragPosRef.current! };

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startMouse.x;
      const dy = ev.clientY - startMouse.y;
      setDragPos({
        x: Math.max(0, startPos.x + dx),
        y: Math.max(0, startPos.y + dy),
      });
    };

    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [setDragPos]);

  if (!mounted) return null;

  const iconStyle = icon
    ? { top: icon.y + 6, left: icon.x - 15 }
    : undefined;

  return (
    <div ref={widgetRef}>
      {icon && !chat && (
        <button
          className={styles.selectionAiButton}
          style={iconStyle}
          onClick={openChat}
          title="Ask AI about selected text"
          aria-label="Ask AI about selected text"
        >
          <SparkleIcon />
        </button>
      )}

      {chat && dragPos && (
        <div
          className={styles.selectionChatWindow}
          style={{ left: dragPos.x, top: dragPos.y }}
          role="dialog"
          aria-label="AI chat"
        >
          <div className={styles.selectionChatHeader} onMouseDown={onHeaderMouseDown}>
            <div className={styles.selectionChatHeaderLeft}>
              <SparkleIcon />
              <span>Ask AI</span>
            </div>
            <button
              className={styles.selectionChatClose}
              onClick={closeChat}
              aria-label="Close AI chat"
            >
              ×
            </button>
          </div>

          <div className={styles.selectionChatContext} title={chat.text}>
            &ldquo;{chat.text.length > 140 ? chat.text.slice(0, 140) + "…" : chat.text}&rdquo;
          </div>

          <div className={styles.selectionChatMessages}>
            {messages.length === 0 && (
              <p className={styles.selectionChatEmpty}>
                Ask a question about the selected text.
              </p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={styles.selectionChatMsgGroup}>
                <div
                  className={m.role === "user" ? styles.selectionChatUserMsg : styles.selectionChatAiMsg}
                >
                  {m.text}
                </div>
                <div className={m.role === "user" ? styles.selectionChatMsgActionsUser : styles.selectionChatMsgActionsAi}>
                  {m.role === "model" ? (
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

          <div className={styles.selectionChatInputRow}>
            <textarea
              ref={inputRef}
              className={styles.selectionChatInput}
              placeholder="Ask a question…"
              value={input}
              rows={1}
              disabled={isLoading}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleInputKeyDown}
            />
            <button
              className={styles.selectionChatSend}
              onClick={() => void sendMessage()}
              disabled={!input.trim() || isLoading}
              aria-label="Send"
            >
              <SendIcon />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

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

function SparkleIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M8 1l1.5 4.5L14 7l-4.5 1.5L8 13l-1.5-4.5L2 7l4.5-1.5L8 1z"
        fill="currentColor"
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
