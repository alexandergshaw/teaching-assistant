"use client";

// Question detection + answering (U5): every new FINAL utterance is rescanned
// through detectQuestions/dedupeAgainstAnswered, survivors are queued, and a
// single-flight "drain" call runs one answerLiveQuestionAction at a time - a
// class can produce several questions within seconds, and firing them all in
// parallel would both cost money and jumble the display.
//
// The queue itself lives in a ref, not React state: it is pure internal
// bookkeeping (never rendered directly), driven imperatively from the exact
// points that change it (enqueue, and an answer's completion) rather than a
// useEffect reacting to a queue-state change to kick off more work - the
// latter is exactly the "derived setState-in-effect" pattern this project's
// stricter hook rules push back on. Only `pendingCount` (queue length +
// in-flight) is real React state, kept in sync explicitly, since that is the
// one number the UI actually renders.
//
// Rescanning the full running list of final utterances (not just the newest
// one) on every new utterance is deliberate: detectQuestions is pure and
// stateless over whatever list it is given, so this is how a question that
// was queued (but not yet answered) is kept from being re-queued as a
// duplicate DetectedQuestion with the SAME id - enqueueQuestion's id dedupe
// catches that - while dedupeAgainstAnswered's text-based dedupe is what
// stops the very same question from being queued again once it already has
// an answer on record.

import { useCallback, useEffect, useRef, useState } from "react";
import { INITIAL_ANSWER_QUEUE_STATE, enqueueQuestion, startNextIfIdle, completeInFlight, type AnswerQueueState } from "./live-class-logic";
import type { LiveAnswerEntry, LiveSessionContext, LiveTranscriptEntry } from "./types";
import { detectQuestions, dedupeAgainstAnswered, type Utterance } from "@/lib/live-class/questions";
import { answerLiveQuestionAction } from "@/app/actions/live-class";
import { waitForSettle } from "./settle";

export interface UseLiveAnswersOptions {
  /** The pre-warmed context, fetched once at session start (U3). Answering is
   * a no-op until this is set. */
  sessionContext: LiveSessionContext | null;
  /** Date.now() at session start; askedAtMs/answeredAtMs are relative to this. */
  sessionStartMs: number;
  /** Returns the current recent-transcript slice on demand (not a snapshot -
   * always the latest, since the answer queue may run this some time after
   * the question was detected). */
  getRecentTranscript: () => string;
  onAnswered: (entry: LiveAnswerEntry) => void;
  onError: (message: string) => void;
}

export interface SettleAnswersResult {
  /** The bound was reached with an answer still in flight - surface this,
   * never drop it silently. */
  timedOut: boolean;
  /** How many still-queued (not-yet-started) questions were dropped rather
   * than waited for - see settle()'s comment for why. */
  droppedQueuedCount: number;
}

export interface UseLiveAnswersReturn {
  /** Newest first, excluding dismissed entries. */
  answers: LiveAnswerEntry[];
  /** Queued + in-flight count, for a small "answering..." indicator. */
  pendingCount: number;
  /** Feed every new transcript entry through here (interim entries are
   * ignored - only `final: true` ones are ever scanned for questions). */
  submitUtterance: (entry: LiveTranscriptEntry) => void;
  /** A follow-up question the instructor typed by hand (U5). */
  submitManualQuestion: (question: string) => void;
  dismiss: (id: string) => void;
  reset: () => void;
  /** Called once, when ending class: drops any not-yet-started queued
   * questions immediately (the class is over - it makes no sense to start
   * fresh LLM calls now) and waits, bounded by timeoutMs, for the single
   * currently in-flight answer (if any) to land, so it makes it into the
   * final autosave/docx instead of being silently lost. */
  settle: (timeoutMs: number) => Promise<SettleAnswersResult>;
}

export function useLiveAnswers(options: UseLiveAnswersOptions): UseLiveAnswersReturn {
  const optionsRef = useRef(options);
  // Refs may not be written during render (only in an effect or a callback) -
  // mirror the latest options in, so every async callback below always reads
  // the current context/callbacks without needing them in its deps array.
  useEffect(() => {
    optionsRef.current = options;
  });

  const [answers, setAnswers] = useState<LiveAnswerEntry[]>([]);
  const [pendingCount, setPendingCount] = useState(0);

  const queueStateRef = useRef<AnswerQueueState>(INITIAL_ANSWER_QUEUE_STATE);
  const finalUtterancesRef = useRef<Utterance[]>([]);
  const answeredTextsRef = useRef<string[]>([]);

  const syncPendingCount = useCallback(() => {
    const s = queueStateRef.current;
    setPendingCount(s.queue.length + (s.inFlightId ? 1 : 0));
  }, []);

  // runAnswer (below) and drain call each other (drain starts an answer;
  // finishing an answer drains again) - a genuine circular need, resolved the
  // same way as elsewhere in this codebase (see startWebSpeechSessionRef in
  // useLiveTranscription.ts): drain is defined first and calls runAnswer
  // through this ref, so runAnswer itself can be defined afterward and simply
  // list drain as a normal (already-declared) dependency - no self/forward
  // reference, no disable comment needed.
  const runAnswerRef = useRef<(item: { id: string; question: string; atMs: number }) => Promise<void>>(
    async () => {}
  );

  // Starts the next queued question if (and only if) nothing is already in
  // flight - called imperatively right after every queue mutation (enqueue,
  // and an answer's completion below), never from a reactive effect.
  const drain = useCallback(() => {
    const { state: nextState, toStart } = startNextIfIdle(queueStateRef.current);
    if (!toStart) return;
    queueStateRef.current = nextState;
    syncPendingCount();
    void runAnswerRef.current(toStart);
  }, [syncPendingCount]);

  const runAnswer = useCallback(
    async (item: { id: string; question: string; atMs: number }) => {
      try {
        const ctx = optionsRef.current.sessionContext;
        const result = await answerLiveQuestionAction(item.question, {
          courseName: ctx?.courseName,
          moduleName: ctx?.moduleName,
          materialsText: ctx?.materialsText,
          recentTranscript: optionsRef.current.getRecentTranscript(),
          // The visualizer index was loaded ONCE, at session start (see
          // useLiveSessionPersistence.ts's start()) - threaded through
          // unchanged on every question so link resolution stays a local
          // match inside the action, never a per-question GitHub call.
          visualizerIndex: ctx?.visualizerIndex,
        });

        if ("error" in result) {
          optionsRef.current.onError(result.error);
        } else {
          const entry: LiveAnswerEntry = {
            id: item.id,
            question: item.question,
            answer: result.answer,
            askedAtMs: item.atMs,
            answeredAtMs: Date.now() - optionsRef.current.sessionStartMs,
            grounded: result.grounded,
            sources: result.sources,
            links: result.links,
            dismissed: false,
          };
          answeredTextsRef.current = [...answeredTextsRef.current, entry.question];
          setAnswers((prev) => [entry, ...prev]);
          optionsRef.current.onAnswered(entry);
        }
      } catch (err) {
        optionsRef.current.onError(
          err instanceof Error ? `Could not answer a question: ${err.message}` : "Could not answer a question."
        );
      } finally {
        // Always free the single-flight slot, success or failure (U10 - a
        // failed answer must not stall every question behind it), then try
        // to drain whatever queued up while this one was running.
        queueStateRef.current = completeInFlight(queueStateRef.current, item.id);
        syncPendingCount();
        drain();
      }
    },
    [syncPendingCount, drain]
  );

  useEffect(() => {
    runAnswerRef.current = runAnswer;
  }, [runAnswer]);

  const enqueue = useCallback(
    (item: { id: string; question: string; atMs: number }) => {
      queueStateRef.current = enqueueQuestion(queueStateRef.current, item);
      syncPendingCount();
      drain();
    },
    [drain, syncPendingCount]
  );

  const submitUtterance = useCallback(
    (entry: LiveTranscriptEntry) => {
      if (!entry.final) return;
      const text = entry.text.trim();
      if (!text) return;
      finalUtterancesRef.current = [...finalUtterancesRef.current, { id: entry.id, text, atMs: entry.atMs, final: true }];

      const candidates = detectQuestions(finalUtterancesRef.current);
      const survivors = dedupeAgainstAnswered(candidates, answeredTextsRef.current);
      for (const q of survivors) {
        enqueue({ id: q.id, question: q.text, atMs: q.atMs });
      }
    },
    [enqueue]
  );

  const submitManualQuestion = useCallback(
    (question: string) => {
      const text = question.trim();
      if (!text) return;
      enqueue({ id: crypto.randomUUID(), question: text, atMs: Date.now() - optionsRef.current.sessionStartMs });
    },
    [enqueue]
  );

  const dismiss = useCallback((id: string) => {
    setAnswers((prev) => prev.map((a) => (a.id === id ? { ...a, dismissed: true } : a)));
  }, []);

  const reset = useCallback(() => {
    finalUtterancesRef.current = [];
    answeredTextsRef.current = [];
    queueStateRef.current = INITIAL_ANSWER_QUEUE_STATE;
    setAnswers([]);
    setPendingCount(0);
  }, []);

  const settle = useCallback(
    async (timeoutMs: number): Promise<SettleAnswersResult> => {
      // The class is ending - stop taking on NEW answer work. Anything still
      // queued never even reached answerLiveQuestionAction, so waiting for it
      // would mean starting fresh LLM calls after class is over; dropping it
      // is the deliberate choice here, but it must be visible, not silent -
      // droppedQueuedCount is returned so the caller can surface a note.
      const droppedQueuedCount = queueStateRef.current.queue.length;
      if (droppedQueuedCount > 0) {
        queueStateRef.current = { ...queueStateRef.current, queue: [] };
        syncPendingCount();
      }

      // The single already-in-flight answer (if any) is different - it is
      // already mid-request, so it is worth a bounded wait rather than
      // dropping it outright.
      const { timedOut } = await waitForSettle(() => (queueStateRef.current.inFlightId ? 1 : 0), timeoutMs);
      return { timedOut, droppedQueuedCount };
    },
    [syncPendingCount]
  );

  return {
    answers: answers.filter((a) => !a.dismissed),
    pendingCount,
    submitUtterance,
    submitManualQuestion,
    dismiss,
    reset,
    settle,
  };
}
