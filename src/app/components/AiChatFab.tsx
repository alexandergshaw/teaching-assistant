"use client";
import { useState, useRef, useCallback, useEffect, useSyncExternalStore } from "react";
import styles from "../page.module.css";

interface Pos { x: number; y: number }

const FAB_SIZE = 52;
const CHAT_W = 360;
const CHAT_H = 440;
const DRAG_THRESHOLD = 5;

function subscribe() { return () => {}; }

export default function AiChatFab() {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; text: string }[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

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

  // Position chat relative to FAB whenever it opens
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

  // Chat header: drag to move window
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

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    const userMsg = input;
    setMessages(msgs => [...msgs, { role: "user", text: userMsg }]);
    setLoading(true);
    setInput("");
    const response = await fetch("/api/ai-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [...messages, { role: "user", text: userMsg }] }),
    });
    const data = await response.json();
    setMessages(msgs => [...msgs, { role: "assistant", text: data.reply }]);
    setLoading(false);
  }

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
        <div
          className={styles.chatModal}
          style={{ left: chatPos.x, top: chatPos.y }}
          role="dialog"
          aria-label="AI Chatbot"
        >
          <div className={styles.chatModalHeader} onMouseDown={onChatHeaderMouseDown}>
            <div className={styles.chatModalHeaderLeft}>
              <ChatIcon />
              <span>AI Chatbot</span>
            </div>
            <button
              aria-label="Close"
              className={styles.chatModalClose}
              onClick={() => setOpen(false)}
            >
              ×
            </button>
          </div>
          <div className={styles.chatModalMessages}>
            {messages.length === 0 && (
              <p className={styles.chatModalEmpty}>Ask me anything!</p>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={m.role === "user" ? styles.chatModalUserMsg : styles.chatModalAiMsg}
              >
                {m.text}
              </div>
            ))}
            {loading && (
              <div className={styles.chatModalAiMsg}>
                <span className={styles.chatModalTyping}>···</span>
              </div>
            )}
          </div>
          <form onSubmit={sendMessage} className={styles.chatModalInputRow}>
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Type your message..."
              className={styles.chatModalInput}
              disabled={loading}
              autoFocus
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className={styles.chatModalSend}
            >
              Send
            </button>
          </form>
        </div>
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
