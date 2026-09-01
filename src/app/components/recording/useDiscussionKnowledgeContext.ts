"use client";

// Discussion reply capture - "Activate this recording from the Knowledge
// base" STATE (the owner ask this closes: replies drafted with the
// instructor's selected standards pages as context), split out of
// useDiscussionReplies.ts (set C3) purely to stay under
// recording-split.structure.test.ts's 1000-line ceiling on
// src/app/components/recording/ (non-recursive) - see that file's own
// header for the full account of what stayed and why.
//
// This hook owns only the STATE and its reload-visibility notice, never the
// one-shot TAKE itself: takeRecordingKnowledgeContext() (src/lib/recording-
// launch.ts) is called exactly once per run, inside useDiscussionReplies.ts's
// own `start()` - discussion-knowledge-context.test.ts's source guard scans
// useDiscussionReplies.ts's literal text for that exact call and for
// `resolveStartKnowledgeContext(knowledgeContextRef.current, taken)`, so
// `start()` (and those two lines specifically) MUST stay in that file. This
// hook exposes `setKnowledgeContext` and `knowledgeContextRef` precisely so
// `start()` can keep making that call and writing the result here.
//
// Held as REACT STATE (never mutated as a bare ref from a callback -
// `react-hooks/immutability` forbids that once a ref is also read inside an
// effect, which the reload-visibility effect below does), mirrored into a
// ref for runDraftLoop the same way useDiscussionReplies.ts mirrors every
// other dispatch-time value. PER-RUN, not per-batch - taken exactly ONCE by
// `start()`, a one-shot slot that clears itself on read.
//
// Persistence: deliberately NOT persisted across a reload, the same rule
// recording-launch.ts's own module state already follows - persisting the
// actual page TEXT here would risk the same localStorage-quota failure
// useReplyRows.ts's `persistError` already guards the reply TABLE against.
// What IS persisted, deliberately small, is a LABEL ONLY
// ("ta-rec-disc-kb-context-label") - just enough to TELL a returning
// instructor their table's earlier drafts used context this fresh page load
// does not hold, never enough to reconstruct it. The write itself (on
// `start()`, and the clear on `clearTable()`) stays in useDiscussionReplies.ts
// since both already touch other state at the same moment.
//
// Reload-visibility case: `knowledgeContext` never survives a reload by
// design, but this table's OWN rows (restored from "ta-rec-disc-table" by
// useReplyRows.ts) can - without this, a returning instructor whose earlier
// drafts used Knowledge Base context has no way to know a later redraft
// silently will not. Fires at most once, and only when there is something to
// warn about: a persisted label from an earlier `start()`, a restored table
// this fresh load can see, and no live context already held (a same-session
// Stop/Start already has `knowledgeContext` set, so this correctly does not
// fire mid-session).

import { useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import { readLocalStorage } from "./discussion-draft-loop";
import type { RecordingKnowledgeContext } from "@/lib/recording-launch";
import { knowledgeContextLabelFor } from "./discussion-knowledge-context";

export interface UseDiscussionKnowledgeContextArgs {
  /** F0-2/F11: the UNFILTERED row count - a search-box keystroke must never
   *  change whether this reload notice fires. */
  rawRowsLength: number;
  pushNotice: (text: string) => void;
}

export interface UseDiscussionKnowledgeContextReturn {
  knowledgeContext: RecordingKnowledgeContext | null;
  setKnowledgeContext: (next: RecordingKnowledgeContext | null) => void;
  knowledgeContextRef: MutableRefObject<RecordingKnowledgeContext | null>;
  /** The one visible signal that this run's drafting is using different
   *  context than an ordinary run - DiscussionRepliesPanel.tsx renders this
   *  near the controls that govern drafting. */
  knowledgeContextLabel: string | null;
}

export function useDiscussionKnowledgeContext(
  args: UseDiscussionKnowledgeContextArgs
): UseDiscussionKnowledgeContextReturn {
  const { rawRowsLength, pushNotice } = args;

  const [knowledgeContext, setKnowledgeContext] = useState<RecordingKnowledgeContext | null>(null);
  const knowledgeContextRef = useRef<RecordingKnowledgeContext | null>(knowledgeContext);
  useEffect(() => {
    knowledgeContextRef.current = knowledgeContext;
  }, [knowledgeContext]);
  const knowledgeContextLabel = knowledgeContextLabelFor(knowledgeContext);
  const kbContextReloadNoticeShownRef = useRef(false);

  useEffect(() => {
    if (kbContextReloadNoticeShownRef.current) return;
    if (knowledgeContext) return;
    const priorLabel = readLocalStorage("ta-rec-disc-kb-context-label");
    if (priorLabel && rawRowsLength > 0) {
      kbContextReloadNoticeShownRef.current = true;
      pushNotice(
        `Earlier replies in this table were drafted using Knowledge Base context (${priorLabel}). That context does not survive a reload - redrafting now will not include it unless you relaunch "Start recording" from the Knowledge Base with the same pages selected.`
      );
    }
  }, [knowledgeContext, rawRowsLength, pushNotice]);

  return { knowledgeContext, setKnowledgeContext, knowledgeContextRef, knowledgeContextLabel };
}
