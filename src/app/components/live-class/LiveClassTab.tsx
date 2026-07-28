"use client";

// Live Class Mode container: wires together session setup, transcription,
// question answering, and persistence. Split into focused hooks (the
// Recording tab's pattern - see src/app/components/RecordingTab.tsx): this
// file only orchestrates; each concern's actual logic lives in its own hook.
//
// Ordering note: useLiveTranscription's onFatalError must be able to trigger
// handleStop, but handleStop needs transcription.stop - a genuine circular
// need. Resolved the same way this codebase already resolves it elsewhere
// (see stopEverythingRef in useRecorder.ts): a ref holds the latest
// handleFatalError, kept in sync by a small effect, so transcription can be
// constructed first and handleStop/handleFatalError can be defined afterward
// referencing transcription directly - with no eslint-disable required.

import { useCallback, useEffect, useRef, useState } from "react";
import TabShell from "../TabShell";
import styles from "../../page.module.css";
import { useSupabase } from "@/context/SupabaseProvider";
import { useDevices } from "../recording/useDevices";
import { useLiveClassSettings } from "./useLiveClassSettings";
import { useLiveTranscription } from "./useLiveTranscription";
import { useLiveAnswers } from "./useLiveAnswers";
import { useLiveSessionPersistence } from "./useLiveSessionPersistence";
import SessionSetupPanel from "./SessionSetupPanel";
import LiveStatusBar from "./LiveStatusBar";
import TranscriptPanel from "./TranscriptPanel";
import AnswersPanel from "./AnswersPanel";
import type { LiveSessionContext, LiveTranscriptEntry } from "./types";

type SessionPhase = "idle" | "starting" | "live" | "ending";

// How long to wait, when ending class, for an in-flight segment
// transcription or answer request to land before running the final autosave
// and building the docx - a few seconds is plenty for a ~15s segment's
// transcription call or a single answerLiveQuestionAction round trip, and a
// hung request must never block the instructor from ending class longer
// than this.
const SETTLE_TIMEOUT_MS = 5000;

export default function LiveClassTab() {
  const { supabase, user } = useSupabase();
  const settings = useLiveClassSettings();

  const [micError, setMicError] = useState<string | null>(null);
  const devices = useDevices({ setError: setMicError });

  const [phase, setPhase] = useState<SessionPhase>("idle");
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

  // Unmount cleanup (U9), mirroring the Recording tab's ref-based pattern so
  // this effect only ever runs once, on unmount, and always reads the latest
  // stop function - never a stale one captured at mount time. This is a
  // last-resort safety net: LiveClassTab is kept mounted (hidden, not
  // unmounted) while the instructor merely switches subtabs, exactly like
  // RecordingTab, so this really only fires on a full page navigation/unload.
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

  return (
    <TabShell
      eyebrow="Live Class"
      title="Transcribe and answer questions live"
      subtitle="Start at the beginning of class to transcribe the room, detect student questions as they come up, and answer them from your course material in real time."
    >
      {fatalError && <p className={styles.error}>{fatalError} The session has ended.</p>}
      {endNote && <p className={styles.fieldHint}>{endNote}</p>}

      {!isLiveOrEnding && (
        <SessionSetupPanel
          settings={settings}
          mics={devices.devices.mics}
          micError={micError}
          requestMicAccess={devices.requestAccess}
          supportsWebSpeech={transcription.supportsWebSpeech}
          supportsSegmented={transcription.supportsSegmented}
          onStart={() => void handleStart()}
          starting={phase === "starting"}
          startError={startError}
        />
      )}

      {isLiveOrEnding && (
        <>
          <LiveStatusBar
            courseName={sessionContext?.courseName ?? ""}
            moduleName={sessionContext?.moduleName ?? ""}
            elapsedSeconds={elapsedSeconds}
            activePath={transcription.activePath}
            pendingAnswerCount={answers.pendingCount}
            ending={phase === "ending"}
            onStop={() => void handleStop()}
            recentWarning={notice}
          />
          <TranscriptPanel entries={transcription.entries} />
          <AnswersPanel
            answers={answers.answers}
            pendingCount={answers.pendingCount}
            onDismiss={answers.dismiss}
            onAskFollowUp={answers.submitManualQuestion}
          />
        </>
      )}
    </TabShell>
  );
}
