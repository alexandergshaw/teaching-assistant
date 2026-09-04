"use client";

// Message replies - the nine persisted SIMPLE controls M5 assigns directly
// to the orchestrator (course, instructor-name, ingredients, formality,
// address-name, signoff, skip-answered, thread-expand, save-video; the other
// five of M5's fourteen keys - table, sort, filter, status-filter, and the
// Knowledge Base context label - are owned by useMessageRows.ts/
// useMessageReplyFiltering.ts/useMessageKnowledgeContext.ts respectively;
// see useMessageKnowledgeContext.ts's own header for why its own key is
// never spelled out as a literal substring in a sibling file's prose).
// Pulled out of
// useMessageReplies.ts (which had grown past its ~500-line budget) as its
// own hook so the orchestrator stays thin wiring - this file owns nothing
// but "read once at mount, write through on every setter" for nine
// independent values, the same shape useDiscussionReplies.ts's own simple
// controls have, just gathered under one hook call instead of nine separate
// useState/useCallback pairs at the orchestrator's own top level.
//
// Keys are whole string literals throughout (never a template literal) -
// message-replies.structure.test.ts's directory-wide `ta-` key ordinal
// canary (M3) derives its key set with a regex over the literal source, the
// same AC55 discipline useMessageRows.ts's own STORAGE_KEY_TABLE comment
// records.

import { useCallback, useState } from "react";
import { readLocalStorage, writeLocalStorage, coerceMessageComposition } from "./message-capture";
import type { MessageCompositionSettings } from "@/lib/message-reply-prompt";

const STORAGE_KEY_COURSE = "ta-rec-msg-course";
const STORAGE_KEY_INSTRUCTOR_NAME = "ta-rec-msg-instructor-name";
const STORAGE_KEY_INGREDIENTS = "ta-rec-msg-ingredients";
const STORAGE_KEY_FORMALITY = "ta-rec-msg-formality";
const STORAGE_KEY_ADDRESS_NAME = "ta-rec-msg-address-name";
const STORAGE_KEY_SIGNOFF = "ta-rec-msg-signoff";
const STORAGE_KEY_SKIP_ANSWERED = "ta-rec-msg-skip-answered";
const STORAGE_KEY_THREAD_EXPAND = "ta-rec-msg-thread-expand";
const STORAGE_KEY_SAVE_VIDEO = "ta-rec-msg-save-video";

export interface UseMessagePersistedControlsReturn {
  courseId: string;
  setCourseId: (id: string) => void;
  instructorName: string;
  setInstructorName: (name: string) => void;
  signoff: string;
  setSignoff: (s: string) => void;
  /** M10's ingredients/formality/address-by-name. */
  composition: MessageCompositionSettings;
  setComposition: (next: MessageCompositionSettings) => void;
  /** M12: default on; keeps `answered` threads out of the automatic queue. */
  skipAnswered: boolean;
  setSkipAnswered: (v: boolean) => void;
  /** M13's table-level "Show the whole thread" default-open state. */
  threadExpand: boolean;
  setThreadExpand: (v: boolean) => void;
  saveVideo: boolean;
  setSaveVideo: (v: boolean) => void;
}

export function useMessagePersistedControls(): UseMessagePersistedControlsReturn {
  const [courseId, setCourseIdState] = useState<string>(() => readLocalStorage(STORAGE_KEY_COURSE) ?? "");
  const setCourseId = useCallback((id: string) => {
    setCourseIdState(id);
    writeLocalStorage(STORAGE_KEY_COURSE, id);
  }, []);

  const [instructorName, setInstructorNameState] = useState<string>(() => readLocalStorage(STORAGE_KEY_INSTRUCTOR_NAME) ?? "");
  const setInstructorName = useCallback((name: string) => {
    setInstructorNameState(name);
    writeLocalStorage(STORAGE_KEY_INSTRUCTOR_NAME, name);
  }, []);

  const [signoff, setSignoffState] = useState<string>(() => readLocalStorage(STORAGE_KEY_SIGNOFF) ?? "");
  const setSignoff = useCallback((s: string) => {
    setSignoffState(s);
    writeLocalStorage(STORAGE_KEY_SIGNOFF, s);
  }, []);

  const [composition, setCompositionState] = useState<MessageCompositionSettings>(() =>
    coerceMessageComposition(
      readLocalStorage(STORAGE_KEY_INGREDIENTS),
      readLocalStorage(STORAGE_KEY_ADDRESS_NAME),
      readLocalStorage(STORAGE_KEY_FORMALITY)
    )
  );
  const setComposition = useCallback((next: MessageCompositionSettings) => {
    setCompositionState(next);
    writeLocalStorage(STORAGE_KEY_INGREDIENTS, JSON.stringify(next.ingredients));
    writeLocalStorage(STORAGE_KEY_ADDRESS_NAME, next.addressByName ? "1" : "0");
    writeLocalStorage(STORAGE_KEY_FORMALITY, next.formality);
  }, []);

  const [skipAnswered, setSkipAnsweredState] = useState<boolean>(() => readLocalStorage(STORAGE_KEY_SKIP_ANSWERED) !== "0");
  const setSkipAnswered = useCallback((v: boolean) => {
    setSkipAnsweredState(v);
    writeLocalStorage(STORAGE_KEY_SKIP_ANSWERED, v ? "1" : "0");
  }, []);

  const [threadExpand, setThreadExpandState] = useState<boolean>(() => readLocalStorage(STORAGE_KEY_THREAD_EXPAND) === "1");
  const setThreadExpand = useCallback((v: boolean) => {
    setThreadExpandState(v);
    writeLocalStorage(STORAGE_KEY_THREAD_EXPAND, v ? "1" : "0");
  }, []);

  const [saveVideo, setSaveVideoState] = useState<boolean>(() => readLocalStorage(STORAGE_KEY_SAVE_VIDEO) === "1");
  const setSaveVideo = useCallback((v: boolean) => {
    setSaveVideoState(v);
    writeLocalStorage(STORAGE_KEY_SAVE_VIDEO, v ? "1" : "0");
  }, []);

  return {
    courseId,
    setCourseId,
    instructorName,
    setInstructorName,
    signoff,
    setSignoff,
    composition,
    setComposition,
    skipAnswered,
    setSkipAnswered,
    threadExpand,
    setThreadExpand,
    saveVideo,
    setSaveVideo,
  };
}
