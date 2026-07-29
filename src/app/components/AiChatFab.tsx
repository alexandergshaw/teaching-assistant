"use client";
import { useState, useRef, useCallback, useEffect, useSyncExternalStore } from "react";
import SpeedDial from "@mui/material/SpeedDial";
import SpeedDialAction from "@mui/material/SpeedDialAction";
import SpeedDialIcon from "@mui/material/SpeedDialIcon";
import AiChatWindow from "./AiChatWindow";
import LiveClassWindow, { LIVE_CLASS_WINDOW_W, LIVE_CLASS_WINDOW_H, LiveClassIcon } from "./live-class/LiveClassWindow";
import WeeklyChecklistOverviewModal from "./courses/WeeklyChecklistOverviewModal";
import { useLiveClassSession } from "./live-class/useLiveClassSession";
import {
  isLiveClassSessionActive,
  formatElapsedCompact,
  computeDefaultWindowPos,
  computeLiveBadgePosition,
  computeUnreadBadgePosition,
} from "./live-class/fab-live-indicator";
import { usePromptSuggestions } from "@/hooks/usePromptSuggestions";
import type { ChatAttachment, ChatMessage, ChatToneStatus } from "@/lib/chat/types";
import { CHAT_ATTACHMENT_BUDGET_BYTES, trimAttachmentsToBudget } from "@/lib/chat/attachments";
import { getStoredProvider } from "@/lib/llm-provider";
import { getChatToneStatusAction } from "../actions";
import styles from "../page.module.css";

interface Pos { x: number; y: number }

const CHAT_W = 360;
const CHAT_H = 420;
const DIAL_BOTTOM = 24;
const DIAL_RIGHT = 24;
// MUI's default SpeedDial Fab diameter - needed to place the live-recording
// badge beside it rather than guessing a pixel offset (see
// computeLiveBadgePosition's comment for why "beside", not "above").
const FAB_SIZE = 56;
const LIVE_BADGE_HEIGHT = 32;
const LIVE_BADGE_GAP = 12;
// D5/D8's unread-answer badge on the FAB itself - a small circle for a
// single-digit count, growing into a pill for "9+" via the CSS's padding +
// 999px border-radius (see .fabUnreadBadge in page.module.css).
const UNREAD_BADGE_SIZE = 20;

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
  const [liveClassOpen, setLiveClassOpen] = useState<boolean>(() => readLS("live-class-open", false));
  // Weekly Checklist Overview: a read-only glance-and-close modal (see its
  // own file for why it is a modal rather than a third floating window), so
  // - unlike chatOpen/liveClassOpen above - its open state is deliberately
  // NOT persisted: every open should re-fetch current data rather than
  // resurrect whatever was on screen in a previous session.
  const [checklistOverviewOpen, setChecklistOverviewOpen] = useState(false);

  // HOISTED above the window body (H3): this is the one and only instance of
  // the live-class session controller for the whole app, owned by this
  // always-mounted FAB rather than by the floating window. Toggling
  // liveClassOpen only mounts/unmounts <LiveClassWindow>'s display - it never
  // touches this hook, so closing the window does not stop the class, does
  // not re-run session setup, and does not re-request the microphone. Because
  // AiChatFab itself is only ever mounted once (see src/app/layout.tsx), only
  // one live session can ever exist.
  const liveClass = useLiveClassSession({ windowOpen: liveClassOpen });

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Names of attachments from the most recent exchange that produced nothing
  // (see filesToLlmPartsDetailed) - reset on every new send so it only ever
  // describes the exchange that just happened.
  const [skippedFiles, setSkippedFiles] = useState<string[]>([]);

  // Whether the FAB chat is mimicking the instructor's writing tone right
  // now, for the status chip in AiChatWindow. Left null (no chip) until the
  // window has actually been opened at least once - the FAB itself is
  // always mounted, so fetching this on mount/every render would cost a
  // request on every page load for no reason.
  const [toneStatus, setToneStatus] = useState<ChatToneStatus | null>(null);

  // Fetch the tone status only when the chat window opens. The embedded
  // provider never calls a model (see the route), so no tone is ever
  // applied there - that is decided client-side from the stored provider
  // without a network round trip, and only otherwise do we ask the server
  // action (which mirrors the exact same getWritingStyleBlock check the
  // route uses, so the chip can never claim more than the route actually did).
  useEffect(() => {
    if (!chatOpen) return;
    let cancelled = false;
    (async () => {
      // Setting state must happen after an await, never synchronously in the
      // effect body (see the setState-in-effect idiom) - this microtask hop
      // covers the embedded branch below too, which has no other await.
      await Promise.resolve();
      if (getStoredProvider() === "embedded") {
        if (!cancelled) setToneStatus("embedded");
        return;
      }
      try {
        const result = await getChatToneStatusAction();
        if (!cancelled) setToneStatus(result.active ? "active" : "no-sample");
      } catch {
        if (!cancelled) setToneStatus("no-sample");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chatOpen]);

  const { suggestions, recordPrompt } = usePromptSuggestions();

  // Stable session ID for the lifetime of this chat window; regenerated on close.
  const sessionIdRef = useRef<string>(crypto.randomUUID());

  // Restore positions from localStorage.  If chatOpen was persisted as true
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
  useEffect(() => { writeLS("live-class-open", liveClassOpen); }, [liveClassOpen]);

  // Persist position to localStorage whenever it changes.
  useEffect(() => { writeLS("chat-pos", chatPos); }, [chatPos]);
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

  const handleSend = useCallback(async (text: string, attachments: ChatAttachment[]) => {
    const provider = getStoredProvider();
    // The embedded provider is text-only and cannot read files (see AC6 in
    // the route) - the attach control is disabled for it below, so this is
    // only a safety net against a stale attachment from before a provider
    // switch.
    const effectiveAttachments = provider === "embedded" ? [] : attachments;

    const nextMessages: ChatMessage[] = [
      ...messages,
      { role: "user", text, ...(effectiveAttachments.length > 0 ? { attachments: effectiveAttachments } : {}) },
    ];

    // Bound the total attachment payload before it ever reaches fetch — a
    // request over Vercel's ~4.5MB serverless body limit fails opaquely, so
    // this either trims older attachments (their content is already
    // summarized by the assistant's reply that followed them) or, if the
    // newest message alone is too big, refuses the send with a real reason.
    const budgeted = trimAttachmentsToBudget(nextMessages, CHAT_ATTACHMENT_BUDGET_BYTES);
    if (budgeted.rejected) {
      setError(budgeted.rejected);
      return;
    }

    setMessages(nextMessages);
    setLoading(true);
    setError(null);
    setSkippedFiles([]);
    recordPrompt(text);

    try {
      const response = await fetch("/api/ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: budgeted.messages, sessionId: sessionIdRef.current, provider }),
      });
      const data = (await response.json()) as { reply?: string; error?: string; skipped?: string[] };

      if (!response.ok || data.error) {
        setError(data.error ?? "Something went wrong.");
      } else {
        setMessages(msgs => [...msgs, { role: "assistant", text: data.reply ?? "" }]);
        setSkippedFiles(data.skipped ?? []);
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
    setSkippedFiles([]);
    // Fresh session ID for next time the window opens.
    sessionIdRef.current = crypto.randomUUID();
  }, []);

  if (!mounted) return null;

  // The embedded provider is text-only (see routeRequest) and cannot read
  // files - disable the attach control rather than letting a file get
  // silently ignored. Read directly rather than via the reactive
  // useLlmProvider hook: `mounted` above already guarantees we're past SSR,
  // and this mirrors the same non-reactive check the tone-status effect uses.
  const attachDisabled = getStoredProvider() === "embedded";

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
        <SpeedDialAction
          icon={<ChecklistIcon />}
          title="Weekly Checklist Overview"
          onClick={() => {
            setDialOpen(false);
            setChecklistOverviewOpen(true);
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

      {/* D5/D8's unread-answer badge: a glance-able count on the FAB itself
          for exactly the situation this alerting exists for - the instructor
          is teaching, the Live Class window lives in the FAB and is usually
          CLOSED, and they are not watching the panel. Shown ONLY while the
          window is closed (once it is open, the panel's own "New" markers
          and jump-to-newest affordance take over - see AnswersPanel.tsx),
          and reads the SAME unreadAnswerCount the panel markers and the
          document-title prefix all read (useLiveClassSession.ts) - never a
          second, independently-tracked count. Positioned on the Fab's own
          top-right corner (computeUnreadBadgePosition), distinct from the
          recording pill beside it, since the two report different things
          and may both be visible at once. */}
      {!liveClassOpen && liveClass.unreadAnswerCount > 0 && (
        <div
          className={styles.fabUnreadBadge}
          style={computeUnreadBadgePosition({ right: DIAL_RIGHT, bottom: DIAL_BOTTOM }, FAB_SIZE, UNREAD_BADGE_SIZE)}
          role="status"
          aria-label={`${liveClass.unreadAnswerCount} new live class answer${liveClass.unreadAnswerCount === 1 ? "" : "s"} waiting`}
        >
          {liveClass.unreadAnswerCount > 9 ? "9+" : liveClass.unreadAnswerCount}
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
          toneStatus={toneStatus}
          suggestions={suggestions}
          attachDisabled={attachDisabled}
          attachDisabledReason="The Embedded Deterministic Engine cannot read files, so attachments are turned off. Switch providers to attach files."
          skippedFiles={skippedFiles}
          position={chatPos}
          onHeaderMouseDown={onChatHeaderMouseDown}
          onSend={handleSend}
          onClose={handleChatClose}
        />
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

      {/* Mounting this only while open is what gates its data fetch to "the
          modal was actually opened" (AC6) - see the component's own file
          for why, unlike the two windows above, it never persists its
          open/closed state. */}
      {checklistOverviewOpen && (
        <WeeklyChecklistOverviewModal onClose={() => setChecklistOverviewOpen(false)} />
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

function ChecklistIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M9 5h11a1 1 0 1 1 0 2H9a1 1 0 1 1 0-2zm0 6h11a1 1 0 1 1 0 2H9a1 1 0 1 1 0-2zm0 6h11a1 1 0 1 1 0 2H9a1 1 0 1 1 0-2z"
        fill="currentColor"
      />
      <path
        d="M4.7 4.3a1 1 0 0 1 1.4 0L7 5.3l1.9-1.9a1 1 0 1 1 1.4 1.4l-2.6 2.6a1 1 0 0 1-1.4 0L4.7 5.7a1 1 0 0 1 0-1.4zm0 6a1 1 0 0 1 1.4 0L7 11.3l1.9-1.9a1 1 0 1 1 1.4 1.4l-2.6 2.6a1 1 0 0 1-1.4 0l-1.6-1.6a1 1 0 0 1 0-1.4zm0 6a1 1 0 0 1 1.4 0L7 17.3l1.9-1.9a1 1 0 1 1 1.4 1.4l-2.6 2.6a1 1 0 0 1-1.4 0l-1.6-1.6a1 1 0 0 1 0-1.4z"
        fill="currentColor"
      />
    </svg>
  );
}

