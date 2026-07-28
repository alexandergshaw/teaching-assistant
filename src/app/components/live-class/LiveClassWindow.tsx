"use client";

// The floating Live Class window - a relocation, not a redesign. It renders
// the exact same four panels the old Manual > Live Class subtab used
// (SessionSetupPanel, LiveStatusBar, TranscriptPanel, AnswersPanel), with
// their props and behavior untouched, inside the same draggable floating
// shell AiChatWindow.tsx uses for the AI chat (styles.selectionChatWindow /
// selectionChatHeader / selectionChatClose - see page.module.css). A plain
// shell mirror rather than <AiChatWindow> itself, because that component's
// body is a chat message list; this window's body is the live-class panel
// composition instead.
//
// All session state and media capture live ABOVE this component, in
// useLiveClassSession (owned by the always-mounted AiChatFab) - this
// component only renders whatever that hook currently reports. Closing this
// window (unmounting it) never touches the session: the parent simply stops
// rendering <LiveClassWindow>, while useLiveClassSession keeps running.

import { Button } from "@mui/material";
import styles from "../../page.module.css";
import SessionSetupPanel from "./SessionSetupPanel";
import LiveStatusBar from "./LiveStatusBar";
import TranscriptPanel from "./TranscriptPanel";
import AnswersPanel from "./AnswersPanel";
import type { UseLiveClassSessionReturn } from "./useLiveClassSession";

// Wider and taller than the chat window (360x420): a course/module/mic
// picker row, a status bar, a scrolling transcript and a scrolling Q&A list
// all need to be usable at once, which the chat window's dimensions were
// never sized for. Clamped with CSS min() against the viewport (H7 - the
// window must never overflow the viewport).
export const LIVE_CLASS_WINDOW_W = 640;
export const LIVE_CLASS_WINDOW_H = 620;

interface LiveClassWindowProps {
  session: UseLiveClassSessionReturn;
  position: { x: number; y: number };
  onHeaderMouseDown: (e: React.MouseEvent) => void;
  onClose: () => void;
}

export default function LiveClassWindow({ session, position, onHeaderMouseDown, onClose }: LiveClassWindowProps) {
  return (
    <div
      className={styles.selectionChatWindow}
      style={{
        left: position.x,
        top: position.y,
        width: `min(${LIVE_CLASS_WINDOW_W}px, calc(100vw - 48px))`,
        height: `min(${LIVE_CLASS_WINDOW_H}px, calc(100vh - 120px))`,
      }}
      role="dialog"
      aria-label="Live Class"
    >
      <div className={styles.selectionChatHeader} onMouseDown={onHeaderMouseDown}>
        <div className={styles.selectionChatHeaderLeft}>
          <LiveClassIcon />
          <span>Live Class</span>
          {session.isLiveOrEnding && <span aria-hidden className={styles.liveRecordingDot} />}
        </div>
        <button className={styles.selectionChatClose} onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      {/* Scroll region is internal to the window (H7) - the same
          flex:1/overflow-y:auto region AiChatWindow's message list uses. */}
      <div className={styles.selectionChatMessages}>
        {session.fatalError && <p className={styles.error}>{session.fatalError} The session has ended.</p>}
        {session.endNote && <p className={styles.fieldHint}>{session.endNote}</p>}

        {/* D2 - available BOTH during a live session and after class ends
            (hasSessionLog stays true once a session has started, until the
            next one begins), not just while SessionSetupPanel or
            LiveStatusBar happen to be showing - so this sits above the
            phase-conditional content below rather than inside either
            branch. */}
        {session.hasSessionLog && (
          <div className={styles.ghActions} style={{ justifyContent: "flex-end" }}>
            <Button size="small" variant="outlined" onClick={session.downloadLog}>
              Download log (.txt)
            </Button>
          </div>
        )}

        {!session.isLiveOrEnding && (
          <SessionSetupPanel
            settings={session.settings}
            mics={session.mics}
            micError={session.micError}
            requestMicAccess={session.requestMicAccess}
            supportsWebSpeech={session.supportsWebSpeech}
            supportsSegmented={session.supportsSegmented}
            onStart={session.onStart}
            starting={session.starting}
            startError={session.startError}
          />
        )}

        {session.isLiveOrEnding && (
          <>
            <LiveStatusBar
              courseName={session.sessionContext?.courseName ?? ""}
              moduleName={session.sessionContext?.moduleName ?? ""}
              elapsedSeconds={session.elapsedSeconds}
              activePath={session.activePath}
              pendingAnswerCount={session.pendingAnswerCount}
              ending={session.ending}
              onStop={session.onStop}
              recentWarning={session.notice}
            />
            <TranscriptPanel entries={session.entries} />
            <AnswersPanel
              answers={session.answers}
              pendingCount={session.pendingAnswerCount}
              unreadAnswerIds={session.unreadAnswerIds}
              onDismiss={session.dismissAnswer}
              onAskFollowUp={session.askFollowUp}
              onVisibilityChange={session.onAnswersVisibilityChange}
            />
          </>
        )}
      </div>
    </div>
  );
}

export function LiveClassIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3z"
        fill="currentColor"
      />
      <path
        d="M19 11a1 1 0 1 0-2 0 5 5 0 0 1-10 0 1 1 0 1 0-2 0 7 7 0 0 0 6 6.93V20H9a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2h-2v-2.07A7 7 0 0 0 19 11z"
        fill="currentColor"
      />
    </svg>
  );
}
