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

export type { LiveClassSessionPhase };

// How long to wait, when ending class, for an in-flight segment
// transcription or answer request to land before running the final autosave
// and building the docx - a few seconds is plenty for a ~15s segment's
// transcription call or a single answerLiveQuestionAction round trip, and a
// hung request must never block the instructor from ending class longer
// than this.
const SETTLE_TIMEOUT_MS = 5000;

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

  onStart: () => void;
  onStop: () => void;
}

export function useLiveClassSession(): UseLiveClassSessionReturn {
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

  const pushNotice = useCallback((message: string) => setNotice(message), []);

  const persistence = useLiveSessionPersistence({
    supabase,
    user,
    onWarning: pushNotice,
  });

  const answers = useLiveAnswers({
    sessionContext,
    sessionStartMs,
    getRecentTranscript: persistence.recentTranscriptSlice,
    onAnswered: persistence.addAnswer,
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

    onStart: () => void handleStart(),
    onStop: () => void handleStop(),
  };
}
