"use client";

// Message replies - "Activate this recording from the Knowledge base" STATE.
// COPIED from src/app/components/recording/useDiscussionKnowledgeContext.ts
// per docs/message-replies-acceptance-criteria.md section 0: that original
// hardcodes a guard on the discussion view and its own discussion-scoped
// persisted label key, so this copy is guarded on `detail.view === "messages"`
// and keyed to this feature's own label key below instead. Every other line
// of behaviour is unchanged from the discussion original - see that file's
// own header for the full account of the one-shot take, why only a LABEL
// (never the page text) is persisted, and the reload-visibility notice.
//
// NOTE (see useMessageRows.ts's own STORAGE_KEY_TABLE comment for the exact
// footgun): never spell the discussion original's own key out as a literal
// contiguous string in this file's prose - the M3 directory-wide key-ordinal
// canary harvests any `ta-...` substring it finds, including inside a
// comment, so quoting that other key here would inflate the count by one.

import { useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import { readLocalStorage } from "./message-capture";
import {
  RECORDING_LAUNCH_EVENT,
  parseRecordingLaunch,
  takeRecordingKnowledgeContext,
  type RecordingKnowledgeContext,
} from "@/lib/recording-launch";
import { knowledgeContextLabelFor, resolveStartKnowledgeContext } from "../recording/discussion-knowledge-context";

export interface UseMessageKnowledgeContextArgs {
  /** The UNFILTERED row count - a search-box keystroke must never change
   *  whether the reload notice fires. */
  rawRowsLength: number;
  pushNotice: (text: string) => void;
}

export interface UseMessageKnowledgeContextReturn {
  knowledgeContext: RecordingKnowledgeContext | null;
  setKnowledgeContext: (next: RecordingKnowledgeContext | null) => void;
  knowledgeContextRef: MutableRefObject<RecordingKnowledgeContext | null>;
  /** The one visible signal that this run's drafting is using different
   *  context than an ordinary run - MessageRepliesPanel.tsx renders this near
   *  the controls that govern drafting, keyed `ta-rec-msg-kb-context-label`. */
  knowledgeContextLabel: string | null;
}

export function useMessageKnowledgeContext(args: UseMessageKnowledgeContextArgs): UseMessageKnowledgeContextReturn {
  const { rawRowsLength, pushNotice } = args;

  const [knowledgeContext, setKnowledgeContext] = useState<RecordingKnowledgeContext | null>(null);
  const knowledgeContextRef = useRef<RecordingKnowledgeContext | null>(knowledgeContext);
  useEffect(() => {
    knowledgeContextRef.current = knowledgeContext;
  }, [knowledgeContext]);
  const knowledgeContextLabel = knowledgeContextLabelFor(knowledgeContext);

  // The ONE-SHOT TAKE, live, at launch arrival - registered ONCE ([] deps)
  // for this hook's whole mount lifetime, guarded on `detail.view ===
  // "messages"` (this feature's one intended consumer - the guard the
  // discussion original hardcodes to "discussions") so a launch meant for
  // another view is never misread as this one's.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = e instanceof CustomEvent ? parseRecordingLaunch(e.detail) : null;
      if (!detail || detail.view !== "messages") return;
      if (detail.knowledgeContext) {
        const taken = takeRecordingKnowledgeContext();
        if (taken) {
          setKnowledgeContext((current) => resolveStartKnowledgeContext(current, taken));
        }
      }
    };
    window.addEventListener(RECORDING_LAUNCH_EVENT, handler);
    return () => window.removeEventListener(RECORDING_LAUNCH_EVENT, handler);
  }, []);

  const kbContextReloadNoticeShownRef = useRef(false);

  useEffect(() => {
    if (kbContextReloadNoticeShownRef.current) return;
    if (knowledgeContext) return;
    const priorLabel = readLocalStorage("ta-rec-msg-kb-context-label");
    if (priorLabel && rawRowsLength > 0) {
      kbContextReloadNoticeShownRef.current = true;
      pushNotice(
        `Earlier replies in this table were drafted using Knowledge Base context (${priorLabel}). That context does not survive a reload - redrafting now will not include it unless you relaunch "Start recording" from the Knowledge Base with the same pages selected.`
      );
    }
  }, [knowledgeContext, rawRowsLength, pushNotice]);

  return { knowledgeContext, setKnowledgeContext, knowledgeContextRef, knowledgeContextLabel };
}
