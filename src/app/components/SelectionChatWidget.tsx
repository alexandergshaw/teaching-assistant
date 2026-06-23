"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { selectionChatAction } from "../actions";
import { getStoredProvider } from "@/lib/llm-provider";
import styles from "../page.module.css";
import AiChatWindow from "./AiChatWindow";
import { usePromptSuggestions } from "@/hooks/usePromptSuggestions";
import type { ChatMessage } from "@/lib/chat/types";

interface SelectionPos {
  text: string;
  x: number;
  y: number;
}

interface Pos { x: number; y: number }

export default function SelectionChatWidget() {
  // Render nothing until mounted on the client (the widget is portal/selection
  // based). useSyncExternalStore returns false on the server and true on the
  // client without a mount-time setState.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const [icon, setIcon] = useState<{ x: number; y: number } | null>(null);
  const [pendingText, setPendingText] = useState("");
  const [chat, setChat] = useState<SelectionPos | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { suggestions, recordPrompt } = usePromptSuggestions();

  const [dragPos, setDragPosState] = useState<Pos | null>(null);
  const dragPosRef = useRef<Pos | null>(null);
  const setDragPos = useCallback((pos: Pos | null) => {
    dragPosRef.current = pos;
    setDragPosState(pos);
  }, []);

  // Stable session ID for the lifetime of this chat window.
  const sessionIdRef = useRef<string>(crypto.randomUUID());

  const widgetRef = useRef<HTMLDivElement>(null);

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

  const openChat = () => {
    if (!icon || !pendingText) return;
    const chatData: SelectionPos = { text: pendingText, x: icon.x, y: icon.y };
    setChat(chatData);
    setDragPos({
      x: Math.max(8, Math.min(chatData.x - 200, window.innerWidth - 376)),
      y: Math.max(8, Math.min(chatData.y + 12, window.innerHeight - 440)),
    });
    setMessages([]);
    setError(null);
    setIcon(null);
    setPendingText("");
    // Fresh session ID for each new selection-chat window.
    sessionIdRef.current = crypto.randomUUID();
    window.getSelection()?.removeAllRanges();
  };

  const closeChat = () => {
    setChat(null);
    setDragPos(null);
    setMessages([]);
    setError(null);
  };

  const handleSend = useCallback(async (text: string) => {
    if (!chat || isLoading) return;
    const nextMessages: ChatMessage[] = [...messages, { role: "user", text }];
    setMessages(nextMessages);
    setIsLoading(true);
    setError(null);
    recordPrompt(text);

    const result = await selectionChatAction(
      chat.text,
      text,
      // Map to the "user" | "model" shape the server action expects.
      messages.map((m) => ({ role: m.role === "assistant" ? "model" : m.role, text: m.text })),
      sessionIdRef.current,
      getStoredProvider()
    );
    setIsLoading(false);

    if (typeof result === "string") {
      setMessages((prev) => [...prev, { role: "assistant", text: result }]);
    } else {
      setError(result.error);
    }
  }, [chat, isLoading, messages, recordPrompt]);

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
        <AiChatWindow
          messages={messages}
          isLoading={isLoading}
          error={error}
          title="Ask AI"
          icon={<SparkleIcon />}
          emptyMessage="Ask a question about the selected text."
          contextText={chat.text}
          suggestions={suggestions}
          position={dragPos}
          onHeaderMouseDown={onHeaderMouseDown}
          onSend={handleSend}
          onClose={closeChat}
        />
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
