"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { selectionChatAction, type SelectionChatMessage } from "../actions";
import styles from "../page.module.css";

interface SelectionPos {
  text: string;
  x: number;
  y: number;
}

export default function SelectionChatWidget() {
  const [mounted, setMounted] = useState(false);
  const [icon, setIcon] = useState<{ x: number; y: number } | null>(null);
  const [pendingText, setPendingText] = useState("");
  const [chat, setChat] = useState<SelectionPos | null>(null);
  const [messages, setMessages] = useState<SelectionChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setMessages([]);
      setInput("");
      setError(null);
    }
  }, []);

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
    setChat({ text: pendingText, x: icon.x, y: icon.y });
    setMessages([]);
    setInput("");
    setError(null);
    setIcon(null);
    setPendingText("");
    window.getSelection()?.removeAllRanges();
  };

  const closeChat = () => {
    setChat(null);
    setMessages([]);
    setInput("");
    setError(null);
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

  if (!mounted) return null;

  const iconStyle = icon
    ? { top: icon.y + 6, left: icon.x - 15 }
    : undefined;

  const chatStyle = chat
    ? {
        top: Math.max(8, Math.min(chat.y + 12, window.innerHeight - 420)),
        left: Math.max(8, Math.min(chat.x - 200, window.innerWidth - 376)),
      }
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

      {chat && (
        <div className={styles.selectionChatWindow} style={chatStyle} role="dialog" aria-label="AI chat">
          <div className={styles.selectionChatHeader}>
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
              <div
                key={i}
                className={m.role === "user" ? styles.selectionChatUserMsg : styles.selectionChatAiMsg}
              >
                {m.text}
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
