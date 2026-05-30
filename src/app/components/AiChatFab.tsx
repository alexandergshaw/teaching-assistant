"use client";
import { useState, useRef, useCallback, useEffect, useSyncExternalStore } from "react";
import styles from "../page.module.css";
import AiChatWindow from "./AiChatWindow";
import { usePromptSuggestions } from "@/hooks/usePromptSuggestions";
import type { ChatMessage } from "@/lib/chat/types";

interface Pos { x: number; y: number }

const FAB_SIZE = 52;
const CHAT_W = 360;
const CHAT_H = 420;
const DRAG_THRESHOLD = 5;

function subscribe() { return () => {}; }

export default function AiChatFab() {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { suggestions, recordPrompt } = usePromptSuggestions();

  // Stable session ID for the lifetime of this chat window; regenerated on close.
  const sessionIdRef = useRef<string>(crypto.randomUUID());

  const [fabPos, setFabPosState] = useState<Pos>(() => {
    if (typeof window === "undefined") return { x: 0, y: 0 };
    return { x: window.innerWidth - FAB_SIZE - 24, y: window.innerHeight - FAB_SIZE - 24 };
  });
  const fabPosRef = useRef<Pos>(fabPos);
  const setFabPos = useCallback((pos: Pos) => {
    fabPosRef.current = pos;
    setFabPosState(pos);
  }, []);

  const [chatPos, setChatPosState] = useState<Pos>({ x: 0, y: 0 });
  const chatPosRef = useRef<Pos>({ x: 0, y: 0 });
  const setChatPos = useCallback((pos: Pos) => {
    chatPosRef.current = pos;
    setChatPosState(pos);
  }, []);

  // Position chat relative to FAB whenever it opens; reset session ID on each open.
  const prevOpenRef = useRef(false);
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      const fp = fabPosRef.current;
      setChatPos({
        x: Math.max(8, Math.min(fp.x - CHAT_W + FAB_SIZE, window.innerWidth - CHAT_W - 8)),
        y: Math.max(8, Math.min(fp.y - CHAT_H - 12, window.innerHeight - CHAT_H - 8)),
      });
    }
    prevOpenRef.current = open;
  }, [open, setChatPos]);

  // FAB: drag to move, click to toggle open
  const onFabMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startMouse: Pos = { x: e.clientX, y: e.clientY };
    const startPos: Pos = { ...fabPosRef.current };
    let dragged = false;

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startMouse.x;
      const dy = ev.clientY - startMouse.y;
      if (!dragged && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
        dragged = true;
      }
      if (dragged) {
        setFabPos({
          x: Math.max(0, Math.min(window.innerWidth - FAB_SIZE, startPos.x + dx)),
          y: Math.max(0, Math.min(window.innerHeight - FAB_SIZE, startPos.y + dy)),
        });
      }
    };

    const onUp = () => {
      if (!dragged) {
        setOpen(o => !o);
      }
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [setFabPos]);

  // Chat window header: drag to reposition
  const onChatHeaderMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    const startMouse: Pos = { x: e.clientX, y: e.clientY };
    const startPos: Pos = { ...chatPosRef.current };

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startMouse.x;
      const dy = ev.clientY - startMouse.y;
      setChatPos({
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
  }, [setChatPos]);

  const handleSend = useCallback(async (text: string) => {
    const nextMessages: ChatMessage[] = [...messages, { role: "user", text }];
    setMessages(nextMessages);
    setLoading(true);
    setError(null);
    recordPrompt(text);

    try {
      const response = await fetch("/api/ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages, sessionId: sessionIdRef.current }),
      });
      const data = (await response.json()) as { reply?: string; error?: string };

      if (!response.ok || data.error) {
        setError(data.error ?? "Something went wrong.");
      } else {
        setMessages(msgs => [...msgs, { role: "assistant", text: data.reply ?? "" }]);
      }
    } catch {
      setError("Failed to reach the server.");
    } finally {
      setLoading(false);
    }
  }, [messages, recordPrompt]);

  const handleClose = useCallback(() => {
    setOpen(false);
    setMessages([]);
    setError(null);
    // Fresh session ID for next time the window opens.
    sessionIdRef.current = crypto.randomUUID();
  }, []);

  if (!mounted) return null;

  return (
    <>
      <button
        className={styles.fab}
        aria-label="Open AI Chatbot"
        title="AI Chatbot"
        onMouseDown={onFabMouseDown}
        style={{ left: fabPos.x, top: fabPos.y }}
      >
        <ChatIcon />
      </button>

      {open && (
        <AiChatWindow
          messages={messages}
          isLoading={loading}
          error={error}
          title="AI Chatbot"
          icon={<ChatIcon />}
          emptyMessage="Ask me anything!"
          suggestions={suggestions}
          position={chatPos}
          onHeaderMouseDown={onChatHeaderMouseDown}
          onSend={handleSend}
          onClose={handleClose}
        />
      )}
    </>
  );
}

function ChatIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M20 2H4C2.9 2 2 2.9 2 4v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"
        fill="currentColor"
      />
    </svg>
  );
}
