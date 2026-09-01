"use client";

// Discussion reply capture - the persisted simple controls, split out of
// useDiscussionReplies.ts (set C3) purely to stay under
// recording-split.structure.test.ts's 1000-line ceiling on
// src/app/components/recording/ (non-recursive) - see that file's own
// header for the full account of what stayed and why.
//
// Owns AC20's three simple persisted controls (audience, courseId,
// saveVideo) and docs/reply-composition-controls-acceptance-criteria.md
// C5/JOB1's composition object (ingredients, address-by-name, formality) -
// six of the discussion surface's persisted localStorage keys end to end
// (audience, course, save-video, ingredients, address-name, formality).
// useDiscussionReplies.ts
// calls this hook once and forwards every field on its own sealed return
// unchanged.
//
// Zero dependency on anything else in this directory beyond the shared
// readLocalStorage/writeLocalStorage helpers and coerceReplyComposition
// (both already live in discussion-draft-loop.ts, reused rather than
// duplicated) and the composition types from @/lib/discussion-reply-prompt -
// never a back-import of anything from useDiscussionReplies.ts itself (this
// repo's own recorded split-constants-into-the-leaf failure: a back-imported
// constant created a cycle that silently yielded `undefined` past tsc).
//
// Keys are whole string literals throughout this file - AC55 forbids a
// template literal, since recording-split.structure.test.ts's canary derives
// its key set with a regex over the literal source.

import { useCallback, useState } from "react";
import { readLocalStorage, writeLocalStorage, coerceReplyComposition } from "./discussion-draft-loop";
import {
  normalizeAudience,
  type DiscussionAudience,
  type ReplyCompositionSettings,
} from "@/lib/discussion-reply-prompt";

export interface UseDiscussionPersistedControlsReturn {
  audience: DiscussionAudience;
  setAudience: (a: DiscussionAudience) => void;
  courseId: string;
  setCourseId: (id: string) => void;
  saveVideo: boolean;
  setSaveVideo: (v: boolean) => void;
  /** docs/reply-composition-controls-acceptance-criteria.md C5/JOB1: what
   *  every drafted reply must contain. Threaded whole into runDraftLoop the
   *  same way `audience` already is, via useDiscussionReplies.ts's own
   *  compositionRef. */
  composition: ReplyCompositionSettings;
  setComposition: (next: ReplyCompositionSettings) => void;
}

export function useDiscussionPersistedControls(): UseDiscussionPersistedControlsReturn {
  const [audience, setAudienceState] = useState<DiscussionAudience>(() =>
    normalizeAudience(readLocalStorage("ta-rec-disc-audience"))
  );
  const setAudience = useCallback((a: DiscussionAudience) => {
    setAudienceState(a);
    writeLocalStorage("ta-rec-disc-audience", a);
  }, []);

  const [courseId, setCourseIdState] = useState<string>(
    () => readLocalStorage("ta-rec-disc-course") ?? ""
  );
  const setCourseId = useCallback((id: string) => {
    setCourseIdState(id);
    writeLocalStorage("ta-rec-disc-course", id);
  }, []);

  const [saveVideo, setSaveVideoState] = useState<boolean>(
    () => readLocalStorage("ta-rec-disc-save-video") === "1"
  );
  const setSaveVideo = useCallback((v: boolean) => {
    setSaveVideoState(v);
    writeLocalStorage("ta-rec-disc-save-video", v ? "1" : "0");
  }, []);

  // C5a: coercion is `coerceReplyComposition` (discussion-draft-loop.ts), a
  // plain exported function per that rule - never inline here, since vitest
  // in this repo is node-env and renders no hook.
  const [composition, setCompositionState] = useState<ReplyCompositionSettings>(() =>
    coerceReplyComposition(
      readLocalStorage("ta-rec-disc-ingredients"),
      readLocalStorage("ta-rec-disc-address-name"),
      readLocalStorage("ta-rec-disc-formality")
    )
  );
  const setComposition = useCallback((next: ReplyCompositionSettings) => {
    setCompositionState(next);
    writeLocalStorage("ta-rec-disc-ingredients", JSON.stringify(next.ingredients));
    writeLocalStorage("ta-rec-disc-address-name", next.addressByName ? "1" : "0");
    writeLocalStorage("ta-rec-disc-formality", next.formality);
  }, []);

  return {
    audience,
    setAudience,
    courseId,
    setCourseId,
    saveVideo,
    setSaveVideo,
    composition,
    setComposition,
  };
}
