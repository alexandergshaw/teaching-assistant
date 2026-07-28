"use client";
import { useState, useRef, useCallback, useEffect, useSyncExternalStore } from "react";
import SpeedDial from "@mui/material/SpeedDial";
import SpeedDialAction from "@mui/material/SpeedDialAction";
import SpeedDialIcon from "@mui/material/SpeedDialIcon";
import AiChatWindow from "./AiChatWindow";
import DeadlinesWindow from "./DeadlinesWindow";
import SubmissionPullbackWindow from "./SubmissionPullbackWindow";
import RosterWindow from "./RosterWindow";
import LiveClassWindow, { LIVE_CLASS_WINDOW_W, LIVE_CLASS_WINDOW_H, LiveClassIcon } from "./live-class/LiveClassWindow";
import { useLiveClassSession } from "./live-class/useLiveClassSession";
import {
  isLiveClassSessionActive,
  formatElapsedCompact,
  computeDefaultWindowPos,
  computeLiveBadgePosition,
} from "./live-class/fab-live-indicator";
import { usePromptSuggestions } from "@/hooks/usePromptSuggestions";
import type { ChatMessage } from "@/lib/chat/types";
import { getStoredProvider } from "@/lib/llm-provider";
import styles from "../page.module.css";

interface Pos { x: number; y: number }

const CHAT_W = 360;
const CHAT_H = 420;
const DEADLINES_W = 380;
const DEADLINES_H = 480;
const DIAL_BOTTOM = 24;
const DIAL_RIGHT = 24;
// MUI's default SpeedDial Fab diameter - needed to place the live-recording
// badge beside it rather than guessing a pixel offset (see
// computeLiveBadgePosition's comment for why "beside", not "above").
const FAB_SIZE = 56;
const LIVE_BADGE_HEIGHT = 32;
const LIVE_BADGE_GAP = 12;

// ── localStorage helpers ──────────────────────────────────────────────────────

const LS_PREFIX = "ta:";

function readLS<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    return raw !== null ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeLS<T>(key: string, value: T): void {
  try {
    localStorage.setItem(LS_PREFIX + key, JSON.stringify(value));
  } catch {
    // Quota exceeded or private-browsing restriction — silently ignore.
  }
}

// ─────────────────────────────────────────────────────────────────────────────

function subscribe() { return () => {}; }

export default function AiChatFab() {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const [dialOpen, setDialOpen] = useState(false);

  // Restore open/closed state from localStorage.
  const [chatOpen, setChatOpen] = useState<boolean>(() => readLS("chat-open", false));
  const [deadlinesOpen, setDeadlinesOpen] = useState<boolean>(() => readLS("deadlines-open", false));
  const [pullbackOpen, setPullbackOpen] = useState<boolean>(() => readLS("pullback-open", false));
  const [rosterOpen, setRosterOpen] = useState<boolean>(() => readLS("roster-open", false));
  const [liveClassOpen, setLiveClassOpen] = useState<boolean>(() => readLS("live-class-open", false));

  // HOISTED above the window body (H3): this is the one and only instance of
  // the live-class session controller for the whole app, owned by this
  // always-mounted FAB rather than by the floating window. Toggling
  // liveClassOpen only mounts/unmounts <LiveClassWindow>'s display - it never
  // touches this hook, so closing the window does not stop the class, does
  // not re-run session setup, and does not re-request the microphone. Because
  // AiChatFab itself is only ever mounted once (see src/app/layout.tsx), only
  // one live session can ever exist.
  const liveClass = useLiveClassSession();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { suggestions, recordPrompt } = usePromptSuggestions();

  // Stable session ID for the lifetime of this chat window; regenerated on close.
  const sessionIdRef = useRef<string>(crypto.randomUUID());

  // Restore positions from localStorage.  If chatOpen/deadlinesOpen was persisted as true
  // and no explicit position is saved we compute the default here — this is safe because the
  // component returns null during SSR (via the `mounted` guard below), so there is no
  // hydration mismatch.
  const [chatPos, setChatPosState] = useState<Pos>(() => {
    const saved = readLS<Pos | null>("chat-pos", null);
    if (saved) return saved;
    if (typeof window !== "undefined" && readLS<boolean>("chat-open", false)) {
      return {
        x: Math.max(8, window.innerWidth - CHAT_W - DIAL_RIGHT - 8),
        y: Math.max(8, window.innerHeight - CHAT_H - 100),
      };
    }
    return { x: 0, y: 0 };
  });
  const chatPosRef = useRef<Pos>(chatPos);
  const setChatPos = useCallback((pos: Pos) => {
    chatPosRef.current = pos;
    setChatPosState(pos);
  }, []);

  const [deadlinesPos, setDeadlinesPosState] = useState<Pos>(() => {
    const saved = readLS<Pos | null>("deadlines-pos", null);
    if (saved) return saved;
    if (typeof window !== "undefined" && readLS<boolean>("deadlines-open", false)) {
      return {
        x: Math.max(8, window.innerWidth - DEADLINES_W - DIAL_RIGHT - 8),
        y: Math.max(8, window.innerHeight - DEADLINES_H - 100),
      };
    }
    return { x: 0, y: 0 };
  });
  const deadlinesPosRef = useRef<Pos>(deadlinesPos);
  const setDeadlinesPos = useCallback((pos: Pos) => {
    deadlinesPosRef.current = pos;
    setDeadlinesPosState(pos);
  }, []);

  const [liveClassPos, setLiveClassPosState] = useState<Pos>(() => {
    const saved = readLS<Pos | null>("live-class-pos", null);
    if (saved) return saved;
    if (typeof window !== "undefined" && readLS<boolean>("live-class-open", false)) {
      return computeDefaultWindowPos(
        { width: window.innerWidth, height: window.innerHeight },
        { width: LIVE_CLASS_WINDOW_W, height: LIVE_CLASS_WINDOW_H },
        { right: DIAL_RIGHT, bottom: 100 }
      );
    }
    return { x: 0, y: 0 };
  });
  const liveClassPosRef = useRef<Pos>(liveClassPos);
  const setLiveClassPos = useCallback((pos: Pos) => {
    liveClassPosRef.current = pos;
    setLiveClassPosState(pos);
  }, []);

  // Persist open/closed state to localStorage whenever it changes.
  useEffect(() => { writeLS("chat-open", chatOpen); }, [chatOpen]);
  useEffect(() => { writeLS("deadlines-open", deadlinesOpen); }, [deadlinesOpen]);
  useEffect(() => { writeLS("pullback-open", pullbackOpen); }, [pullbackOpen]);
  useEffect(() => { writeLS("roster-open", rosterOpen); }, [rosterOpen]);
  useEffect(() => { writeLS("live-class-open", liveClassOpen); }, [liveClassOpen]);

  // Persist position to localStorage whenever it changes.
  useEffect(() => { writeLS("chat-pos", chatPos); }, [chatPos]);
  useEffect(() => { writeLS("deadlines-pos", deadlinesPos); }, [deadlinesPos]);
  useEffect(() => { writeLS("live-class-pos", liveClassPos); }, [liveClassPos]);

  // Listen for the "open-ai-chat" event dispatched by the context menu.
  // Calling setState in a subscribed event callback (not directly in the effect body) is fine.
  useEffect(() => {
    const handler = () => {
      setChatOpen(true);
      if (!readLS<Pos | null>("chat-pos", null)) {
        setChatPos({
          x: Math.max(8, window.innerWidth - CHAT_W - DIAL_RIGHT - 8),
          y: Math.max(8, window.innerHeight - CHAT_H - 100),
        });
      }
    };
    window.addEventListener("open-ai-chat", handler);
    return () => window.removeEventListener("open-ai-chat", handler);
  }, [setChatPos]);

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

  // Live Class window header: drag to reposition
  const onLiveClassHeaderMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    const startMouse: Pos = { x: e.clientX, y: e.clientY };
    const startPos: Pos = { ...liveClassPosRef.current };
    const onMove = (ev: MouseEvent) => {
      setLiveClassPos({
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
  }, [setLiveClassPos]);

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
        body: JSON.stringify({ messages: nextMessages, sessionId: sessionIdRef.current, provider: getStoredProvider() }),
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
            background: "var(--accent)",
            color: "#fff",
            boxShadow:
              "0 4px 16px rgba(37, 99, 235, 0.45), 0 2px 6px rgba(0, 0, 0, 0.12)",
            "&:hover": { background: "var(--accent-hover)" },
          },
        }}
        icon={<SpeedDialIcon />}
        open={dialOpen}
        onOpen={(_, reason) => {
          // Open only on an explicit click — never on hover.
          if (reason === "toggle") setDialOpen(true);
        }}
        onClose={(_, reason) => {
          // Keep open when the mouse moves away; close on click-away, Escape, or focus loss.
          if (reason !== "mouseLeave") setDialOpen(false);
        }}
      >
        <SpeedDialAction
          icon={<ChatIcon />}
          title="AI Chatbot"
          onClick={() => {
            setDialOpen(false);
            const nextOpen = !chatOpen;
            setChatOpen(nextOpen);
            if (nextOpen && !readLS<Pos | null>("chat-pos", null)) {
              setChatPos({
                x: Math.max(8, window.innerWidth - CHAT_W - DIAL_RIGHT - 8),
                y: Math.max(8, window.innerHeight - CHAT_H - 100),
              });
            }
          }}
        />
        <SpeedDialAction
          icon={<CalendarIcon />}
          title="Deadlines & Events"
          onClick={() => {
            setDialOpen(false);
            const nextOpen = !deadlinesOpen;
            setDeadlinesOpen(nextOpen);
            if (nextOpen && !readLS<Pos | null>("deadlines-pos", null)) {
              setDeadlinesPos({
                x: Math.max(8, window.innerWidth - DEADLINES_W - DIAL_RIGHT - 8),
                y: Math.max(8, window.innerHeight - DEADLINES_H - 100),
              });
            }
          }}
        />
        <SpeedDialAction
          icon={<PullbackIcon />}
          title="Pull back submission"
          onClick={() => {
            setDialOpen(false);
            setPullbackOpen((v) => !v);
          }}
        />
        <SpeedDialAction
          icon={<RosterIcon />}
          title="Class rosters"
          onClick={() => {
            setDialOpen(false);
            setRosterOpen((v) => !v);
          }}
        />
        <SpeedDialAction
          icon={<LiveClassIcon />}
          title={
            isLiveClassSessionActive(liveClass.phase)
              ? `Live Class - recording ${formatElapsedCompact(liveClass.elapsedSeconds)}`
              : "Live Class"
          }
          onClick={() => {
            setDialOpen(false);
            const nextOpen = !liveClassOpen;
            setLiveClassOpen(nextOpen);
            if (nextOpen && !readLS<Pos | null>("live-class-pos", null)) {
              setLiveClassPos(
                computeDefaultWindowPos(
                  { width: window.innerWidth, height: window.innerHeight },
                  { width: LIVE_CLASS_WINDOW_W, height: LIVE_CLASS_WINDOW_H },
                  { right: DIAL_RIGHT, bottom: 100 }
                )
              );
            }
          }}
        />
      </SpeedDial>

      {/* The FAB's own persistent recording indicator (H4 / regression
          90.11): visible for as long as a live-class session is active, even
          while the Live Class window itself is closed AND regardless of
          whether the dial is open or closed - closing the window never stops
          the class (H3), so this is the only thing on screen that keeps
          proving a session is still running.
          Placed BESIDE the Fab (see computeLiveBadgePosition), not above it:
          the dial's actions expand upward from the Fab, so a badge stacked
          above it would end up tangled in that menu - see the fix for the
          collision this used to have with the topmost dial entry. */}
      {isLiveClassSessionActive(liveClass.phase) && (
        <div
          className={styles.fabLiveBadge}
          style={{
            ...computeLiveBadgePosition({ right: DIAL_RIGHT, bottom: DIAL_BOTTOM }, FAB_SIZE, LIVE_BADGE_HEIGHT, LIVE_BADGE_GAP),
            height: LIVE_BADGE_HEIGHT,
          }}
          role="status"
          aria-label={`Live class session in progress - ${formatElapsedCompact(liveClass.elapsedSeconds)} elapsed`}
        >
          <span aria-hidden className={styles.liveRecordingDot} />
          <span className={styles.fabLiveBadgeTime}>{formatElapsedCompact(liveClass.elapsedSeconds)}</span>
        </div>
      )}

      {chatOpen && (
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

      {pullbackOpen && (
        <SubmissionPullbackWindow
          onClose={() => setPullbackOpen(false)}
        />
      )}

      {rosterOpen && (
        <RosterWindow onClose={() => setRosterOpen(false)} />
      )}

      {/* Closing this window only hides the UI (setLiveClassOpen(false)) - it
          never calls liveClass.onStop, so an in-progress session keeps
          running, capturing audio and answering questions, exactly as H3
          requires. Reopening renders the same still-running session. */}
      {liveClassOpen && (
        <LiveClassWindow
          session={liveClass}
          position={liveClassPos}
          onHeaderMouseDown={onLiveClassHeaderMouseDown}
          onClose={() => setLiveClassOpen(false)}
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

function PullbackIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
    </svg>
  );
}

function RosterIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
    </svg>
  );
}
