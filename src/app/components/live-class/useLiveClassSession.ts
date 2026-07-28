"use client";

// Live Class Mode's session controller, HOISTED out of the (now removed)
// Manual > Live Class subtab so the always-mounted app-wide FAB
// (AiChatFab.tsx) can own it directly. This is the critical piece of moving
// the feature into a floating window: the window (LiveClassWindow.tsx) can
// be opened, closed and reopened freely - closing it must NOT stop the
// class - so the session's state and its media capture live in this hook,
// called exactly once by AiChatFab, never by the window body itself.
// Because AiChatFab is mounted for the lifetime of the app (see
// src/app/layout.tsx), toggling the window's open/closed flag never
// unmounts this hook, never re-runs session setup, and never re-requests
// the microphone - only the explicit Stop control (LiveStatusBar's "End
// class" button, wired to `onStop` below) ends a session. Because AiChatFab
// itself is mounted exactly once, only one instance of this hook - and
// therefore only one live session - can ever exist.
//
// This is a straight hoist of the logic that used to live directly in
// LiveClassTab.tsx: same hooks, same handlers, same comments explaining the
// trickier bits, same cleanup - only the JSX moved out (into
// LiveClassWindow.tsx, which renders the same four panels unchanged).
//
// Ordering note (unchanged from LiveClassTab.tsx): useLiveTranscription's
// onFatalError must be able to trigger handleStop, but handleStop needs
// transcription.stop - a genuine circular need. Resolved the same way this
// codebase already resolves it elsewhere (see stopEverythingRef in
// useRecorder.ts): a ref holds the latest handleFatalError, kept in sync by
// a small effect, so transcription can be constructed first and
// handleStop/handleFatalError can be defined afterward referencing
// transcription directly - with no eslint-disable required.

import { useCallback, useEffect, useRef, useState } from "react";
import { useSupabase } from "@/context/SupabaseProvider";
import { useDevices } from "../recording/useDevices";
import type { Device } from "../recording/types";
import { useLiveClassSettings, type UseLiveClassSettingsReturn } from "./useLiveClassSettings";
import { useLiveTranscription } from "./useLiveTranscription";
import { useLiveAnswers } from "./useLiveAnswers";
import { useLiveSessionPersistence } from "./useLiveSessionPersistence";
import type { LiveAnswerEntry, LiveSessionContext, LiveTranscriptEntry, TranscriptionPath } from "./types";
// LiveClassSessionPhase is declared ONCE, in the pure fab-live-indicator.ts
// (which isLiveClassSessionActive also branches on) - re-exported here so
// this hook's phase type and the FAB's live-indicator decision can never
// silently drift apart the way two copies of the same union would.
import type { LiveClassSessionPhase } from "./fab-live-indicator";
import {
  INITIAL_UNREAD_ANSWERS_STATE,
  recordAnswerArrived,
  markAnswersSeen,
  unreadAnswerCount as unreadAnswerCountOf,
  computeTitleWithUnreadPrefix,
  stripUnreadTitlePrefix,
  type UnreadAnswersState,
} from "./live-class-logic";
import { buildSessionLogText } from "@/lib/live-class/session-log";
import { buildWorkflowFileName } from "@/lib/workflows/file-names";

export type { LiveClassSessionPhase };

/**
 * A short, gentle, generated WebAudio tone (D7) - never a shipped audio
 * asset, and never played unless the instructor explicitly opts in via
 * settings.answerSound (persisted "ta-live-answer-sound", default off - a
 * classroom is exactly where an unexpected noise is unwelcome). Failures (no
 * AudioContext, a context suspended pending a user gesture, etc.) are
 * swallowed - a missed chime must never surface as an error or interrupt the
 * class.
 */
function playAnswerChime(): void {
  if (typeof window === "undefined") return;
  try {
    const w = window as unknown as Record<string, unknown>;
    const Ctor = (window.AudioContext ?? (w.webkitAudioContext as typeof AudioContext)) as
      | typeof AudioContext
      | undefined;
    if (!Ctor) return;
    const ctx = new Ctor();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.4);
    oscillator.onended = () => {
      void ctx.close();
    };
  } catch {
    // Non-essential - never let an audio failure interrupt the class.
  }
}

// How long to wait, when ending class, for an in-flight segment
// transcription or answer request to land before running the final autosave
// and building the docx - a few seconds is plenty for a ~15s segment's
// transcription call or a single answerLiveQuestionAction round trip, and a
// hung request must never block the instructor from ending class longer
// than this.
const SETTLE_TIMEOUT_MS = 5000;

export interface UseLiveClassSessionOptions {
  /** Whether the Live Class floating window is currently open - needed for
   * D5/D8's unread-answer tracking: a new answer only counts as "seen" when
   * the window is open AND the answers list is showing it. Passed in from
   * AiChatFab, the only place that owns the window's open/closed state. */
  windowOpen: boolean;
}

export interface UseLiveClassSessionReturn {
  /** "idle" | "starting" | "live" | "ending" - non-idle for as long as a
   * session is active (used by the FAB's persistent indicator - see
   * fab-live-indicator.ts's isLiveClassSessionActive). */
  phase: LiveClassSessionPhase;
  isLiveOrEnding: boolean;
  starting: boolean;
  ending: boolean;
  elapsedSeconds: number;

  fatalError: string | null;
  endNote: string | null;
  notice: string | null;
  startError: string | null;
  sessionContext: LiveSessionContext | null;

  settings: UseLiveClassSettingsReturn;
  micError: string | null;
  mics: Device[];
  requestMicAccess: () => Promise<void>;

  supportsWebSpeech: boolean;
  supportsSegmented: boolean;
  activePath: TranscriptionPath;
  entries: LiveTranscriptEntry[];

  answers: LiveAnswerEntry[];
  pendingAnswerCount: number;
  dismissAnswer: (id: string) => void;
  askFollowUp: (question: string) => void;

  /** True once a session has started at least once - the "Download log"
   * control (D2) stays available after class ends, until a new one starts. */
  hasSessionLog: boolean;
  downloadLog: () => void;

  /** The single source of truth for D5/D8's unread-answer alerting - the
   * count and ids drive the answers panel's markers, the FAB's badge, and
   * (indirectly, via the same state) the document-title prefix. Cleared in
   * exactly one place: markAnswersSeen (live-class-logic.ts), triggered
   * either by the window opening while the panel is showing the newest
   * answer, or by the panel reporting that visibility through
   * onAnswersVisibilityChange. */
  unreadAnswerCount: number;
  unreadAnswerIds: string[];
  onAnswersVisibilityChange: (newestVisible: boolean) => void;

  onStart: () => void;
  onStop: () => void;
}

export function useLiveClassSession(options: UseLiveClassSessionOptions): UseLiveClassSessionReturn {
  const { windowOpen } = options;
  const { supabase, user } = useSupabase();
  const settings = useLiveClassSettings();

  const [micError, setMicError] = useState<string | null>(null);
  const devices = useDevices({ setError: setMicError });

  const [phase, setPhase] = useState<LiveClassSessionPhase>("idle");
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [endNote, setEndNote] = useState<string | null>(null);
  const [sessionContext, setSessionContext] = useState<LiveSessionContext | null>(null);
  const [sessionStartMs, setSessionStartMs] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [hasSessionLog, setHasSessionLog] = useState(false);

  // D5/D8's single unread-tracking state. windowOpenRef/answersNewestVisibleRef
  // mirror the latest windowOpen prop and the answers panel's own reported
  // scroll visibility - refs (not plain closures) because recordAnswerArrived
  // runs from the async onAnswered callback below, well after whatever render
  // captured a stale value (the same optionsRef idiom used throughout this
  // feature - see useLiveAnswers.ts).
  const [unreadState, setUnreadState] = useState<UnreadAnswersState>(INITIAL_UNREAD_ANSWERS_STATE);
  const windowOpenRef = useRef(windowOpen);
  const answersNewestVisibleRef = useRef(true);

  const pushNotice = useCallback((message: string) => setNotice(message), []);

  const persistence = useLiveSessionPersistence({
    supabase,
    user,
    onWarning: pushNotice,
  });

  // Keep windowOpenRef in sync, and - the "opening the window clears the
  // unread state" half of D8 - re-check visibility the moment the window
  // opens: if the answers panel is (still) reporting that it shows the
  // newest answer (answersNewestVisibleRef defaults true, and the panel
  // re-reports its actual scroll position once it mounts), clear unread
  // right here rather than waiting on a separate signal.
  useEffect(() => {
    windowOpenRef.current = windowOpen;
    if (windowOpen && answersNewestVisibleRef.current) {
      setUnreadState((prev) => markAnswersSeen(prev));
    }
  }, [windowOpen]);

  // The other half of D8: the answers panel calls this on every scroll
  // change (and once on mount, since a freshly-mounted panel starts showing
  // the newest answer) - the SAME markAnswersSeen call as above, so "opening
  // the window" and "scrolling to the newest answer" both clear unread state
  // through this one path, never two independently-tracked counters.
  const onAnswersVisibilityChange = useCallback((newestVisible: boolean) => {
    answersNewestVisibleRef.current = newestVisible;
    if (newestVisible && windowOpenRef.current) {
      setUnreadState((prev) => markAnswersSeen(prev));
    }
  }, []);

  const unreadAnswerCount = unreadAnswerCountOf(unreadState);

  // D6 - the document-title unread prefix, the one alert surface that
  // reaches an instructor whose slides are covering the browser window
  // entirely. originalTitleRef captures document.title exactly ONCE - this
  // hook is only ever mounted once for the lifetime of the app (see the
  // header comment), so there is only ever one "original" title to
  // remember - stripped defensively in case it somehow already carries a
  // "(N) " prefix. Kept in sync with computeTitleWithUnreadPrefix on every
  // unreadAnswerCount change and on every visibilitychange (the count only
  // ever shows while the tab is actually hidden), and ALWAYS restored -
  // regardless of the current count or visibility state - on unmount, so no
  // stale prefix can ever survive this hook being torn down.
  const originalTitleRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (originalTitleRef.current === null) {
      originalTitleRef.current = stripUnreadTitlePrefix(document.title);
    }
    const applyTitle = () => {
      const base = originalTitleRef.current ?? "";
      document.title = computeTitleWithUnreadPrefix(base, document.hidden ? unreadAnswerCount : 0);
    };
    applyTitle();
    document.addEventListener("visibilitychange", applyTitle);
    return () => {
      document.removeEventListener("visibilitychange", applyTitle);
    };
  }, [unreadAnswerCount]);

  // Belt-and-suspenders restore on unmount (D6) - the effect above already
  // restores the title whenever unreadAnswerCount returns to 0 (including
  // when handleStop resets unreadState at end of session), but this also
  // covers a full page unload/navigation while a prefix happens to be
  // showing.
  useEffect(() => {
    return () => {
      if (typeof document !== "undefined" && originalTitleRef.current !== null) {
        document.title = originalTitleRef.current;
      }
    };
  }, []);

  // Records unread state for D5 alongside the existing addAnswer persistence
  // call, using the SAME live visibility snapshot recordAnswerArrived is
  // handed (never a stale one) - see the ordering note on windowOpenRef/
  // answersNewestVisibleRef above. The chime (D7) only ever plays for an
  // answer that is ACTUALLY being marked unread by this same check, so it
  // can never fire for an answer the instructor already saw arrive.
  const handleAnswered = useCallback(
    (entry: LiveAnswerEntry) => {
      persistence.addAnswer(entry);
      const visibility = { windowOpen: windowOpenRef.current, newestVisible: answersNewestVisibleRef.current };
      const willBeUnread = !(visibility.windowOpen && visibility.newestVisible);
      setUnreadState((prev) => recordAnswerArrived(prev, entry.id, visibility));
      if (willBeUnread && settings.answerSound) {
        playAnswerChime();
      }
    },
    [persistence, settings.answerSound]
  );

  const answers = useLiveAnswers({
    sessionContext,
    sessionStartMs,
    getRecentTranscript: persistence.recentTranscriptSlice,
    onAnswered: handleAnswered,
    onError: pushNotice,
  });

  const handleFinalUtterance = useCallback(
    (entry: LiveTranscriptEntry) => {
      persistence.addSegment(entry);
      answers.submitUtterance(entry);
    },
    [persistence, answers]
  );

  // See the ordering note at the top of this file.
  const handleFatalErrorRef = useRef<(message: string) => void>(() => {});

  const transcription = useLiveTranscription({
    micId: settings.micId,
    noiseSuppression: settings.noiseSuppression,
    echoCancellation: settings.echoCancellation,
    autoGain: settings.autoGain,
    transcriptionOverride: settings.transcriptionOverride,
    hintTerms: sessionContext?.hintTerms ?? "",
    sessionStartMs,
    onFinalUtterance: handleFinalUtterance,
    onError: pushNotice,
    onFatalError: (message) => handleFatalErrorRef.current(message),
  });

  const stopInFlightRef = useRef(false);

  const handleStop = useCallback(async () => {
    if (stopInFlightRef.current) return;
    stopInFlightRef.current = true;
    try {
      setPhase((prev) => (prev === "idle" ? prev : "ending"));
      // Stops NEW capture immediately - the mic/recognizer release is
      // synchronous and unaffected by the settle-wait below (U9).
      transcription.stop();

      // Wait (bounded by SETTLE_TIMEOUT_MS) for a segment transcription or an
      // answer already in flight to land before the final autosave and docx
      // build run, so the tail of the class - often the closing summary or a
      // final question - is not silently dropped from the artifacts the
      // instructor keeps. Any question that had not yet started answering is
      // dropped by answers.settle() itself (see its own comment for why).
      const [transcriptionSettle, answersSettle] = await Promise.all([
        transcription.settle(SETTLE_TIMEOUT_MS),
        answers.settle(SETTLE_TIMEOUT_MS),
      ]);

      const result = await persistence.stop();

      const notes = [
        transcriptionSettle.timedOut || answersSettle.timedOut
          ? "Class ended before all in-progress transcription/answering finished - the saved transcript or an answer may be missing the last few seconds."
          : null,
        answersSettle.droppedQueuedCount > 0
          ? `${answersSettle.droppedQueuedCount} question(s) that had not started answering yet were dropped when class ended.`
          : null,
        result.note,
      ].filter((n): n is string => Boolean(n));
      setEndNote(notes.length > 0 ? notes.join(" ") : null);
    } finally {
      answers.reset();
      setSessionContext(null);
      setSessionStartMs(0);
      setElapsedSeconds(0);
      setPhase("idle");
      // D6 - the title prefix (and every other unread surface, since they all
      // read this same state) is restored/cleared when the session ends.
      answersNewestVisibleRef.current = true;
      setUnreadState(INITIAL_UNREAD_ANSWERS_STATE);
      stopInFlightRef.current = false;
    }
  }, [transcription, persistence, answers]);

  const handleFatalError = useCallback(
    (message: string) => {
      setFatalError(message);
      void handleStop();
    },
    [handleStop]
  );

  useEffect(() => {
    handleFatalErrorRef.current = handleFatalError;
  }, [handleFatalError]);

  const handleStart = useCallback(async () => {
    if (!settings.courseId) {
      setStartError("Choose a course before starting a live class session.");
      return;
    }
    setStartError(null);
    setFatalError(null);
    setEndNote(null);
    setNotice(null);
    setPhase("starting");

    const started = await persistence.start({ courseId: settings.courseId, moduleValue: settings.moduleValue });
    if (!started) {
      setStartError("Could not start the session - see the notice above for details.");
      setPhase("idle");
      return;
    }

    setSessionContext(started.sessionContext);
    setSessionStartMs(started.startedAtMs);
    setElapsedSeconds(0);
    setHasSessionLog(true);
    answersNewestVisibleRef.current = true;
    setUnreadState(INITIAL_UNREAD_ANSWERS_STATE);
    answers.reset();

    try {
      await transcription.start();
      setPhase("live");
    } catch (err) {
      setStartError(err instanceof Error ? err.message : "Could not start transcription.");
      // A session row already exists at this point - close it out cleanly
      // rather than leaving a "live" row behind that never captured anything.
      await persistence.stop();
      setSessionContext(null);
      setSessionStartMs(0);
      setPhase("idle");
    }
  }, [settings.courseId, settings.moduleValue, persistence, transcription, answers]);

  // Elapsed-time tick for the persistent indicator (U3) - a plain 1Hz
  // setInterval, the same cadence the Recording tab already uses for its own
  // elapsed timer; nowhere near the audio-frame rate C5 warns about.
  useEffect(() => {
    if (phase !== "live") return;
    const id = setInterval(() => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - sessionStartMs) / 1000)));
    }, 1000);
    return () => clearInterval(id);
  }, [phase, sessionStartMs]);

  // Unmount cleanup (U9/H6), mirroring the Recording tab's ref-based pattern
  // so this effect only ever runs once, on unmount, and always reads the
  // latest stop function - never a stale one captured at mount time. This
  // hook is now owned by the always-mounted AiChatFab (rendered once, app-
  // wide, from src/app/layout.tsx) rather than by a Manual subtab, so this
  // safety net only fires on a full page navigation/unload - never merely
  // from the live-class window being closed, which does not unmount this
  // hook at all.
  const handleStopRef = useRef(handleStop);
  useEffect(() => {
    handleStopRef.current = handleStop;
  }, [handleStop]);
  useEffect(() => {
    return () => {
      void handleStopRef.current();
    };
  }, []);

  // D2 - the "Download log" control, available both mid-session
  // (getSessionSnapshot's endedAt is still null - the log then reports
  // "still running" and computes elapsed against nowMs) and after class ends
  // (the ref backing the snapshot keeps its data until the NEXT start()
  // overwrites it - see getSessionSnapshot's own comment). hasSessionLog
  // gates whether this is ever offered; this is a defensive no-op if called
  // before any session has started, since the control is never rendered in
  // that state. Uses the SAME URL.createObjectURL + anchor-click +
  // revokeObjectURL idiom FilesTab.tsx already uses for its own downloads.
  const downloadLog = useCallback(() => {
    const snapshot = persistence.getSessionSnapshot();
    if (!snapshot) return;
    const text = buildSessionLogText(snapshot.state, { ...snapshot.meta, nowMs: Date.now() });
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = buildWorkflowFileName({
      course: { name: snapshot.meta.courseName ?? "" },
      artifact: "Class session log",
      qualifier: snapshot.meta.moduleName,
      date: snapshot.meta.startedAt.toISOString().slice(0, 10),
      ext: "txt",
    });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [persistence]);

  const isLiveOrEnding = phase === "live" || phase === "ending";

  return {
    phase,
    isLiveOrEnding,
    starting: phase === "starting",
    ending: phase === "ending",
    elapsedSeconds,

    fatalError,
    endNote,
    notice,
    startError,
    sessionContext,

    settings,
    micError,
    mics: devices.devices.mics,
    requestMicAccess: devices.requestAccess,

    supportsWebSpeech: transcription.supportsWebSpeech,
    supportsSegmented: transcription.supportsSegmented,
    activePath: transcription.activePath,
    entries: transcription.entries,

    answers: answers.answers,
    pendingAnswerCount: answers.pendingCount,
    dismissAnswer: answers.dismiss,
    askFollowUp: answers.submitManualQuestion,

    hasSessionLog,
    downloadLog,

    unreadAnswerCount,
    unreadAnswerIds: unreadState.unreadIds,
    onAnswersVisibilityChange,

    onStart: () => void handleStart(),
    onStop: () => void handleStop(),
  };
}
