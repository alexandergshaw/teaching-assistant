"use client";

// Discussion reply capture - "Activate this recording from the Knowledge
// base" STATE (the owner ask this closes: replies drafted with the
// instructor's selected standards pages as context), split out of
// useDiscussionReplies.ts (set C3) purely to stay under
// recording-split.structure.test.ts's 1000-line ceiling on
// src/app/components/recording/ (non-recursive) - see that file's own
// header for the full account of what stayed and why.
//
// STRUCTURAL FIX (owner ask: show the carried Knowledge Base context BEFORE
// a run, matching GradingRecordingPanel.tsx's own launch-listener shape,
// :247-259): this hook now owns the one-shot TAKE too, not just the state.
// Previously the take (takeRecordingKnowledgeContext(), src/lib/recording-
// launch.ts) happened inside useDiscussionReplies.ts's `start()` - correct
// per-run semantics, but it meant the label/context could only ever appear
// AFTER the instructor clicked Start, never before. GradingRecordingPanel
// already takes its context live, at LAUNCH ARRIVAL, in a
// `window.addEventListener(RECORDING_LAUNCH_EVENT, ...)` registered once for
// the component's whole mount lifetime - the effect below is that same
// shape, guarded on `detail.view === "discussions"` (this feature's one
// intended consumer) exactly like grading guards on `detail.view ===
// "grading"`. RecordingTab keeps every inner panel mounted for the whole
// session (CSS `display:none` toggling, never conditional JSX unmount - see
// RecordingTab.tsx's own comments beside <DiscussionRepliesPanel>), so this
// effect's `[]`-dep registration is live for every launch, first through
// twentieth, the same guarantee recording-launch.ts's own header describes.
//
// `start()` (useDiscussionReplies.ts) no longer calls
// takeRecordingKnowledgeContext() or resolveStartKnowledgeContext() at all -
// discussion-knowledge-context.test.ts's source guard now scans THIS file
// for the take (exactly one call site) and separately proves `start()`
// contains none. What `start()` keeps is ONLY the persisted-label WRITE (see
// that function's own comment for why that specific line cannot move here).
//
// Held as REACT STATE (never mutated as a bare ref from a callback -
// `react-hooks/immutability` forbids that once a ref is also read inside an
// effect, which the reload-visibility effect below does), mirrored into a
// ref for runDraftLoop the same way useDiscussionReplies.ts mirrors every
// other dispatch-time value. PER-RUN, not per-batch - taken exactly ONCE per
// real launch (a one-shot slot that clears itself on read), and left
// UNTOUCHED (never re-taken, never cleared) by every Start/Stop that follows
// with no new launch in between - resolveStartKnowledgeContext's own header
// (discussion-knowledge-context.ts) covers why that persistence-across-runs
// is deliberate, not an oversight.
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
// since both already touch other state at the same moment - see that
// function's own comment for the correctness reason the write specifically
// (not the take) must stay gated on an actual Start click.
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
import {
  RECORDING_LAUNCH_EVENT,
  parseRecordingLaunch,
  takeRecordingKnowledgeContext,
  type RecordingKnowledgeContext,
} from "@/lib/recording-launch";
import { knowledgeContextLabelFor, resolveStartKnowledgeContext } from "./discussion-knowledge-context";

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

  // "Activate this recording from the Knowledge base" - the ONE-SHOT TAKE,
  // live, at launch arrival. Mirrors GradingRecordingPanel.tsx's own launch
  // listener (:247-259 there) exactly: registered ONCE ([] deps) for this
  // hook's whole mount lifetime, guarded on `detail.view === "discussions"`
  // so a launch meant for another view (grading, moduledeck, a plain fab
  // visit with no knowledgeContext) is never misread as this one's. Only
  // takes when `detail.knowledgeContext` is actually present - a bare-view
  // "discussions" launch (the FAB's navigateToRecordingTool, or a launch
  // with unusable/blank page text) must not steal a take that was never
  // offered, and must not touch this table's existing context either
  // (resolveStartKnowledgeContext below only ever runs inside this `if`, so
  // "nothing new arrived" always leaves `current` alone by simply not
  // calling setKnowledgeContext at all).
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = e instanceof CustomEvent ? parseRecordingLaunch(e.detail) : null;
      if (!detail || detail.view !== "discussions") return;
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
