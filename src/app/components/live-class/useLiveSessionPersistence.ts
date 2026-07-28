"use client";

// Live-class session lifecycle: the ONE buildLiveSessionContextAction call at
// start (U3 - the single most important latency decision in this feature -
// every per-question answer for the rest of class reuses this pre-warmed
// context instead of re-gathering course material), the session row, the
// incremental autosave (C7/U7 - only ever sends the unsynced delta, never the
// whole transcript, because server actions cap the request body at 10MB),
// and the end-of-class artifact (U8).

import { useCallback, useEffect, useRef } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { startFrameTicker, type FrameTicker } from "@/lib/frame-ticker";
import {
  createClassSession,
  appendClassSessionData,
  endClassSession,
  type ClassSessionSegment,
  type ClassSessionAnswer,
} from "@/lib/live-class-sessions";
import { appendSegment, unsyncedSegments, transcriptText, buildSessionMarkdown, type LiveSessionState } from "@/lib/live-class/session";
import { buildSessionLogText, type SessionLogSnapshot } from "@/lib/live-class/session-log";
import { buildDocxFromPlainText } from "@/lib/docx";
import { base64FromArrayBuffer } from "@/lib/live-class/wav";
import { saveLibraryFileAction, appendCourseMiscFileAction } from "@/app/actions";
import { buildLiveSessionContextAction, loadVisualizerIndexAction } from "@/app/actions/live-class";
import { uploadCourseFile } from "@/lib/course-files";
import { decideStop, INITIAL_STOP_GUARD_STATE, type StopGuardState } from "./live-class-logic";
import type { LiveAnswerEntry, LiveSessionContext, LiveTranscriptEntry, VisualizerIndexEntry } from "./types";

const AUTOSAVE_CADENCE_SECONDS = 25;
const RECENT_TRANSCRIPT_SLICE_CHARS = 2000;
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export interface UseLiveSessionPersistenceOptions {
  supabase: SupabaseClient<Database>;
  user: User | null;
  /** A quiet, recoverable warning (U7/U10) - autosave/save failures never interrupt the class. */
  onWarning: (message: string) => void;
}

export interface StartSessionInput {
  courseId: string;
  moduleValue: string;
}

export interface StartSessionResult {
  sessionContext: LiveSessionContext;
  sessionId: string;
  startedAtMs: number;
}

export interface StopSessionResult {
  /** Non-null when the end-of-class artifact could not be built, saved, or
   * attached - a visible note, never a thrown error (U8). */
  note: string | null;
}

export interface UseLiveSessionPersistenceReturn {
  start: (input: StartSessionInput) => Promise<StartSessionResult | null>;
  addSegment: (entry: LiveTranscriptEntry) => void;
  addAnswer: (answer: LiveAnswerEntry) => void;
  /** The tail of the transcript so far, capped to a few thousand characters -
   * used as answerLiveQuestionAction's recentTranscript context. */
  recentTranscriptSlice: () => string;
  /** A read-on-demand snapshot of the session state + rendering metadata, for
   * the "Download log" control (D2) - works both mid-session (endedAt null)
   * and after class ends (the ref keeps its data until the next start()
   * overwrites it). Null before any session has ever started. */
  getSessionSnapshot: () => SessionLogSnapshot | null;
  stop: () => Promise<StopSessionResult>;
}

export function useLiveSessionPersistence(options: UseLiveSessionPersistenceOptions): UseLiveSessionPersistenceReturn {
  const optionsRef = useRef(options);
  // Refs may not be written during render (only in an effect or a callback) -
  // mirror the latest options in, so every async callback below always reads
  // the current supabase/user/onWarning without needing them in its deps array.
  useEffect(() => {
    optionsRef.current = options;
  });

  const sessionStateRef = useRef<LiveSessionState>({ startedAtMs: 0, segments: [], answered: [], pending: [] });
  const lastSyncedSegmentIdRef = useRef<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const courseIdRef = useRef<string | null>(null);
  const sessionContextRef = useRef<LiveSessionContext | null>(null);
  const startedAtMsRef = useRef<number>(0);
  // Set once stop() has actually run for the session (D1/D3 - the log's
  // "session ended" header line, and getSessionSnapshot's meta.endedAt); null
  // while a session is live/starting, or before any session has ever run.
  const endedAtMsRef = useRef<number | null>(null);
  const autosaveTickerRef = useRef<FrameTicker | null>(null);
  // Guards stop() so pressing "End class" twice, or an unmount racing an
  // in-progress stop, never runs the final sync/endClassSession/docx
  // build-and-save more than once for the same session - reset in start().
  const stopGuardRef = useRef<StopGuardState>(INITIAL_STOP_GUARD_STATE);

  const syncNow = useCallback(async () => {
    const sessionId = sessionIdRef.current;
    const { supabase, user } = optionsRef.current;
    if (!sessionId || !user) return;

    const segmentsDelta: ClassSessionSegment[] = unsyncedSegments(
      sessionStateRef.current.segments,
      lastSyncedSegmentIdRef.current
    );
    // Answered questions are few per class - resending the whole list every
    // autosave is cheap, and appendClassSessionData dedupes by id server-side,
    // so no separate "since last sync" pointer is needed for it.
    const answeredAll: ClassSessionAnswer[] = sessionStateRef.current.answered;

    if (segmentsDelta.length === 0 && answeredAll.length === 0) return;

    try {
      await appendClassSessionData(supabase, user.id, sessionId, {
        segments: segmentsDelta,
        answered: answeredAll,
      });
      if (segmentsDelta.length > 0) {
        lastSyncedSegmentIdRef.current = segmentsDelta[segmentsDelta.length - 1].id;
      }
    } catch (err) {
      // Failure to save must never interrupt the class (U7) - surface a
      // quiet warning and retry the same (still-unsynced) delta next time.
      optionsRef.current.onWarning(
        err instanceof Error ? `Autosave failed: ${err.message}` : "Autosave failed. Still recording - will retry."
      );
    }
  }, []);

  const start = useCallback(async (input: StartSessionInput): Promise<StartSessionResult | null> => {
    const { supabase, user } = optionsRef.current;
    if (!user) {
      optionsRef.current.onWarning("You must be signed in to start a live class session.");
      return null;
    }

    try {
      // The course-material pre-warm (U3 - the single most important latency
      // decision in this feature) and the visualizer index (G3 - loaded ONCE
      // per session so answerLiveQuestionAction's link resolution never hits
      // GitHub on the answer-latency path) are independent network calls -
      // run them together rather than back-to-back.
      const [ctxResult, visualizerIndexResult] = await Promise.all([
        buildLiveSessionContextAction(input.courseId, input.moduleValue),
        loadVisualizerIndexAction(),
      ]);
      if ("error" in ctxResult) {
        optionsRef.current.onWarning(ctxResult.error);
        return null;
      }

      // A failed visualizer-index load is a quiet, recoverable warning (same
      // U7/U10 idiom as autosave failures below) - it must NEVER block
      // starting the class. It only means resolveVisualizerLinks has nothing
      // to match against this session; documentation links still resolve.
      let visualizerIndex: VisualizerIndexEntry[] = [];
      if ("error" in visualizerIndexResult) {
        optionsRef.current.onWarning(
          `Visualizer links will not be available this session: ${visualizerIndexResult.error}`
        );
      } else {
        visualizerIndex = visualizerIndexResult.entries;
      }

      const ctx: LiveSessionContext = { ...ctxResult, visualizerIndex };

      const row = await createClassSession(supabase, user.id, {
        courseId: input.courseId || null,
        title: ctx.courseName || "Live class",
        moduleName: ctx.moduleName,
      });

      const startedAtMs = Date.now();
      sessionStateRef.current = { startedAtMs, segments: [], answered: [], pending: [] };
      lastSyncedSegmentIdRef.current = null;
      sessionIdRef.current = row.id;
      sessionContextRef.current = ctx;
      courseIdRef.current = input.courseId || null;
      startedAtMsRef.current = startedAtMs;
      endedAtMsRef.current = null;
      stopGuardRef.current = INITIAL_STOP_GUARD_STATE;

      autosaveTickerRef.current?.stop();
      autosaveTickerRef.current = startFrameTicker(1 / AUTOSAVE_CADENCE_SECONDS, () => {
        void syncNow();
      });

      return { sessionContext: ctx, sessionId: row.id, startedAtMs };
    } catch (err) {
      optionsRef.current.onWarning(err instanceof Error ? err.message : "Could not start the live session.");
      return null;
    }
  }, [syncNow]);

  const addSegment = useCallback((entry: LiveTranscriptEntry) => {
    sessionStateRef.current = appendSegment(sessionStateRef.current, {
      id: entry.id,
      text: entry.text,
      atMs: entry.atMs,
    });
  }, []);

  const addAnswer = useCallback((answer: LiveAnswerEntry) => {
    sessionStateRef.current = {
      ...sessionStateRef.current,
      answered: [
        ...sessionStateRef.current.answered,
        {
          id: answer.id,
          question: answer.question,
          answer: answer.answer,
          askedAtMs: answer.askedAtMs,
          answeredAtMs: answer.answeredAtMs,
          grounded: answer.grounded,
          sources: answer.sources.length > 0 ? answer.sources : undefined,
          // Carried onto the persisted record (G9) so the end-of-class
          // document (buildSessionMarkdown, ./session.ts) renders the SAME
          // links the panel showed live - see that function's own links
          // rendering for the shape.
          links: answer.links.length > 0 ? answer.links : undefined,
        },
      ],
    };
  }, []);

  const recentTranscriptSlice = useCallback((): string => {
    const full = transcriptText(sessionStateRef.current.segments);
    return full.length > RECENT_TRANSCRIPT_SLICE_CHARS
      ? full.slice(full.length - RECENT_TRANSCRIPT_SLICE_CHARS)
      : full;
  }, []);

  const getSessionSnapshot = useCallback((): SessionLogSnapshot | null => {
    if (!sessionIdRef.current) return null;
    const ctx = sessionContextRef.current;
    return {
      state: sessionStateRef.current,
      meta: {
        courseName: ctx?.courseName,
        moduleName: ctx?.moduleName,
        startedAt: new Date(startedAtMsRef.current || Date.now()),
        endedAt: endedAtMsRef.current !== null ? new Date(endedAtMsRef.current) : null,
      },
    };
  }, []);

  const stop = useCallback(async (): Promise<StopSessionResult> => {
    // Idempotence: once stop has actually run for this session, every later
    // call (a second Stop click, an unmount racing an in-progress stop) is a
    // no-op - never a second sync/endClassSession/docx build-and-save.
    const decision = decideStop(stopGuardRef.current);
    stopGuardRef.current = decision.nextState;
    if (!decision.shouldRun) {
      return { note: null };
    }

    autosaveTickerRef.current?.stop();
    autosaveTickerRef.current = null;
    endedAtMsRef.current = Date.now();

    await syncNow();

    const sessionId = sessionIdRef.current;
    const { supabase, user } = optionsRef.current;
    if (sessionId && user) {
      try {
        await endClassSession(supabase, user.id, sessionId, "ended");
      } catch (err) {
        optionsRef.current.onWarning(
          err instanceof Error ? `Could not close out the session record: ${err.message}` : "Could not close out the session record."
        );
      }
    }

    let note: string | null = null;
    try {
      const ctx = sessionContextRef.current;
      const markdown = buildSessionMarkdown(sessionStateRef.current, {
        courseName: ctx?.courseName,
        moduleName: ctx?.moduleName,
        startedAt: new Date(startedAtMsRef.current || Date.now()),
      });
      const buffer = await buildDocxFromPlainText(markdown);
      const dateStamp = new Date(startedAtMsRef.current || Date.now()).toISOString().slice(0, 10);
      const fileName = `Class session - ${ctx?.courseName || "Untitled"} - ${dateStamp}`;

      const base64 = base64FromArrayBuffer(buffer);
      const lib = await saveLibraryFileAction({
        name: fileName,
        base64,
        mimeType: DOCX_MIME,
        fileExt: "docx",
      });
      if ("error" in lib) {
        note = `Could not save the session document to your library: ${lib.error}`;
      }

      const courseId = courseIdRef.current;
      if (courseId && user) {
        try {
          const blob = new Blob([buffer], { type: DOCX_MIME });
          const { path } = await uploadCourseFile(supabase, user.id, courseId, blob, "docx", DOCX_MIME);
          const attach = await appendCourseMiscFileAction(courseId, { name: `${fileName}.docx`, path, size: blob.size });
          if ("error" in attach) {
            note = [note, `Could not attach the session document to the course tile: ${attach.error}`]
              .filter(Boolean)
              .join(" ");
          }
        } catch (err) {
          note = [
            note,
            `Could not attach the session document to the course tile: ${err instanceof Error ? err.message : "unknown error"}`,
          ]
            .filter(Boolean)
            .join(" ");
        }
      }
    } catch (err) {
      note = `Could not build the session document: ${err instanceof Error ? err.message : "unknown error"}`;
    }

    // Plain-text session log (D1/D3) - additive alongside the Word document
    // above, built from the exact same LiveSessionState so it can never drift
    // from what the docx (and the live "Download log" control) show. A save
    // failure degrades to a note, exactly like the docx save above, and never
    // throws or blocks ending the class.
    try {
      const ctx = sessionContextRef.current;
      const dateStamp = new Date(startedAtMsRef.current || Date.now()).toISOString().slice(0, 10);
      const fileName = `Class session - ${ctx?.courseName || "Untitled"} - ${dateStamp}`;
      const logText = buildSessionLogText(sessionStateRef.current, {
        courseName: ctx?.courseName,
        moduleName: ctx?.moduleName,
        startedAt: new Date(startedAtMsRef.current || Date.now()),
        endedAt: new Date(endedAtMsRef.current ?? Date.now()),
      });
      const logBase64 = base64FromArrayBuffer(new TextEncoder().encode(logText).buffer);
      const logLib = await saveLibraryFileAction({
        name: fileName,
        base64: logBase64,
        mimeType: "text/plain",
        fileExt: "txt",
      });
      if ("error" in logLib) {
        note = [note, `Could not save the session log to your library: ${logLib.error}`].filter(Boolean).join(" ");
      }
    } catch (err) {
      note = [note, `Could not build the session log: ${err instanceof Error ? err.message : "unknown error"}`]
        .filter(Boolean)
        .join(" ");
    }

    return { note };
  }, [syncNow]);

  return { start, addSegment, addAnswer, recentTranscriptSlice, getSessionSnapshot, stop };
}
