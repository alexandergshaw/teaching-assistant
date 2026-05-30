"use client";
import { useState, useRef, useCallback, useEffect, useSyncExternalStore } from "react";
import SpeedDial from "@mui/material/SpeedDial";
import SpeedDialAction from "@mui/material/SpeedDialAction";
import SpeedDialIcon from "@mui/material/SpeedDialIcon";
import AiChatWindow from "./AiChatWindow";
import DeadlinesWindow from "./DeadlinesWindow";
import type { ChatMessage } from "@/lib/chat/types";

interface Pos { x: number; y: number }

const CHAT_W = 360;
const CHAT_H = 420;
const DEADLINES_W = 380;
const DEADLINES_H = 480;
const DIAL_BOTTOM = 24;
const DIAL_RIGHT = 24;

function subscribe() { return () => {}; }

export default function AiChatFab() {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const [dialOpen, setDialOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [deadlinesOpen, setDeadlinesOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stable session ID for the lifetime of this chat window; regenerated on close.
  const sessionIdRef = useRef<string>(crypto.randomUUID());

  const [chatPos, setChatPosState] = useState<Pos>({ x: 0, y: 0 });
  const chatPosRef = useRef<Pos>({ x: 0, y: 0 });
  const setChatPos = useCallback((pos: Pos) => {
    chatPosRef.current = pos;
    setChatPosState(pos);
  }, []);

  const [deadlinesPos, setDeadlinesPosState] = useState<Pos>({ x: 0, y: 0 });
  const deadlinesPosRef = useRef<Pos>({ x: 0, y: 0 });
  const setDeadlinesPos = useCallback((pos: Pos) => {
    deadlinesPosRef.current = pos;
    setDeadlinesPosState(pos);
  }, []);

  // Position chat window above the SpeedDial when it opens.
  const prevChatOpenRef = useRef(false);
  useEffect(() => {
    if (chatOpen && !prevChatOpenRef.current) {
      setChatPos({
        x: Math.max(8, window.innerWidth - CHAT_W - DIAL_RIGHT - 8),
        y: Math.max(8, window.innerHeight - CHAT_H - 100),
      });
    }
    prevChatOpenRef.current = chatOpen;
  }, [chatOpen, setChatPos]);

  // Position deadlines window above the SpeedDial when it opens.
  const prevDeadlinesOpenRef = useRef(false);
  useEffect(() => {
    if (deadlinesOpen && !prevDeadlinesOpenRef.current) {
      setDeadlinesPos({
        x: Math.max(8, window.innerWidth - DEADLINES_W - DIAL_RIGHT - 8),
        y: Math.max(8, window.innerHeight - DEADLINES_H - 100),
      });
    }
    prevDeadlinesOpenRef.current = deadlinesOpen;
  }, [deadlinesOpen, setDeadlinesPos]);

  // Chat window header: drag to reposition
  const onChatHeaderMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    const startMouse: Pos = { x: e.clientX, y: e.clientY };
    const startPos: Pos = { ...chatPosRef.current };
    const onMove = (ev: MouseEvent) => {
      setChatPos({
        x: Math.max(0, startPos.x + ev.clientX - startMouse.x),
        y: Math.max(0, startPos.y + ev.clientY - startMouse.y),
      });
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [setChatPos]);

  // Deadlines window header: drag to reposition
  const onDeadlinesHeaderMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    const startMouse: Pos = { x: e.clientX, y: e.clientY };
    const startPos: Pos = { ...deadlinesPosRef.current };
    const onMove = (ev: MouseEvent) => {
      setDeadlinesPos({
        x: Math.max(0, startPos.x + ev.clientX - startMouse.x),
        y: Math.max(0, startPos.y + ev.clientY - startMouse.y),
      });
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [setDeadlinesPos]);

  const handleSend = useCallback(async (text: string) => {
    const nextMessages: ChatMessage[] = [...messages, { role: "user", text }];
    setMessages(nextMessages);
    setLoading(true);
    setError(null);

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
  }, [messages]);

  const handleChatClose = useCallback(() => {
    setChatOpen(false);
    setMessages([]);
    setError(null);
    // Fresh session ID for next time the window opens.
    sessionIdRef.current = crypto.randomUUID();
  }, []);

  if (!mounted) return null;

  return (
    <>
      <SpeedDial
        ariaLabel="Quick actions"
        sx={{
          position: "fixed",
          bottom: DIAL_BOTTOM,
          right: DIAL_RIGHT,
          zIndex: 9999,
          "& .MuiSpeedDial-fab": {
            background: "#2563eb",
            color: "#fff",
            boxShadow:
              "0 4px 16px rgba(37, 99, 235, 0.45), 0 2px 6px rgba(0, 0, 0, 0.12)",
            "&:hover": { background: "#1d4ed8" },
          },
        }}
        icon={<SpeedDialIcon />}
        open={dialOpen}
        onOpen={() => setDialOpen(true)}
        onClose={() => setDialOpen(false)}
      >
        <SpeedDialAction
          icon={<ChatIcon />}
          title="AI Chatbot"
          onClick={() => {
            setDialOpen(false);
            setChatOpen((o) => !o);
          }}
        />
        <SpeedDialAction
          icon={<CalendarIcon />}
          title="Deadlines & Events"
          onClick={() => {
            setDialOpen(false);
            setDeadlinesOpen((o) => !o);
          }}
        />
      </SpeedDial>

      {chatOpen && (
        <AiChatWindow
          messages={messages}
          isLoading={loading}
          error={error}
          title="AI Chatbot"
          icon={<ChatIcon />}
          emptyMessage="Ask me anything!"
          position={chatPos}
          onHeaderMouseDown={onChatHeaderMouseDown}
          onSend={handleSend}
          onClose={handleChatClose}
        />
      )}

      {deadlinesOpen && (
        <DeadlinesWindow
          position={deadlinesPos}
          onHeaderMouseDown={onDeadlinesHeaderMouseDown}
          onClose={() => setDeadlinesOpen(false)}
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

function CalendarIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M19 4h-1V2h-2v2H8V2H6v2H5C3.89 2 3 2.9 3 4v16c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 18H5V8h14v14z" />
      <path d="M7 10h5v5H7z" />
    </svg>
  );
}
