"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { IconButton } from "@mui/material";
import { selectionChatAction } from "../actions";
import { getStoredProvider } from "@/lib/llm-provider";
import AiChatWindow from "./AiChatWindow";
import { usePromptSuggestions } from "@/hooks/usePromptSuggestions";
import type { ChatMessage } from "@/lib/chat/types";
import styles from "../page.module.css";

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
        // F1: this className was lost in a prior commit and never restored -
        // without it, MUI's IconButton stays `position: static` (its own
        // default), so the `style={{top, left}}` below is inert (a static
        // element ignores top/left) and the button rendered as an unstyled
        // grey circle at the bottom of <body>, below the entire app, not
        // beside the selection. .selectionAiButton (page.module.css) is what
        // actually supplies `position: fixed` (making the inline top/left
        // take effect), the circular sizing, the accent background, and the
        // elevation - restoring it is the fix, not the inline style, which
        // was never the problem.
        <IconButton
          size="small"
          className={styles.selectionAiButton}
          style={iconStyle}
          onClick={openChat}
          title="Ask AI about selected text"
          aria-label="Ask AI about selected text"
        >
          <SparkleIcon />
        </IconButton>
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
          // File attachments are only wired up for the FAB chat (see
          // AiChatFab). Disabling here rather than silently dropping
          // whatever the user attaches, which would look like it worked.
          attachDisabled
          attachDisabledReason="Attachments are only available in the AI Chatbot (the icon in the corner)."
          position={dragPos}
          onHeaderMouseDown={onHeaderMouseDown}
          onSend={handleSend}
          onClose={closeChat}
        />
      )}
    </div>
  );
}

// 20px (AM11's "toolbars and buttons" tier) - this is a standalone click
// target, not a dense-row action.
//
// F5: viewBox normalized from "0 0 16 16" to "0 0 24 24" (the same 24-unit
// space every other icon in this pass uses) - the path coordinates below
// are the original 16-unit sparkle scaled by exactly 1.5x, so the drawn
// shape is pixel-identical, only the coordinate space changed. A 16-unit
// path at a 20px render size was the one icon in the app rendering ~25%
// heavier than its 24-unit neighbors (a 16-unit glyph fills more of its own
// viewBox at the same stroke/fill proportions, since there is less
// surrounding space to scale down).
function SparkleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M12 1.5l2.25 6.75L21 10.5l-6.75 2.25L12 19.5l-2.25-6.75L3 10.5l6.75-2.25L12 1.5z"
        fill="currentColor"
      />
    </svg>
  );
}
