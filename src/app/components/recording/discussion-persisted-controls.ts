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
// Resource-controls feature: "eligible resource kinds" and "preferred video
// length" - two more persisted settings that belong next to `composition`
// (all four are drafting/resource inputs the panel reads and the resource
// pass consumes, exactly the reasoning this file's own header already gives
// for owning `composition`).
import { RESOURCE_KINDS, type ResourceKind } from "@/lib/resource-kind";

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

  /** Resource-controls feature: which resource kinds the resource pass is
   *  allowed to search for and return. Default (a fresh table, or any
   *  unparseable persisted value) is the full RESOURCE_KINDS set - byte-
   *  identical to the resource pass's own pre-existing behaviour. An
   *  explicit EMPTY array is legal (mirrors `composition.ingredients`'s own
   *  "zero selected" precedent) and means "search nothing" - see
   *  discussion-replies.ts's gatherReplyResourcesAction for how that is
   *  enforced on both the request and the result. */
  resourceKinds: readonly ResourceKind[];
  setResourceKinds: (next: readonly ResourceKind[]) => void;

  /** Resource-controls feature: the "preferred video length" setting, min
   *  and/or max minutes. `undefined` means "no preference set" for that
   *  bound. SURVEY FINDING (see discussion-replies.ts's own
   *  `videoLengthPreferenceSentence`): nothing in the resource pipeline ever
   *  learns a candidate video's actual runtime, so this can only ever reach
   *  the model as a stated preference, never an enforced filter - the panel
   *  labels this control "Preferred video length" for exactly that reason,
   *  never as a guarantee. */
  videoLengthMinMinutes?: number;
  videoLengthMaxMinutes?: number;
  setVideoLengthPreference: (min: number | undefined, max: number | undefined) => void;
}

/**
 * Coercion for `ta-rec-disc-resource-kinds`. Mirrors `coerceReplyComposition`
 * (discussion-draft-loop.ts)'s own "zero selected survives, only a genuinely
 * unparseable/non-array blob falls back to the default" discipline for
 * `ingredients` - never throws. Always filters FROM RESOURCE_KINDS (never a
 * fresh literal), so a persisted value can never resurrect a kind the shared
 * leaf's own `coerceResourceKind` would not itself recognize.
 */
export function coerceResourceKinds(raw: string | null): readonly ResourceKind[] {
  if (raw === null) return RESOURCE_KINDS;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return RESOURCE_KINDS;
    const seen = new Set<ResourceKind>();
    for (const v of parsed) {
      if (typeof v === "string" && (RESOURCE_KINDS as readonly string[]).includes(v)) {
        seen.add(v as ResourceKind);
      }
    }
    return RESOURCE_KINDS.filter((k) => seen.has(k));
  } catch {
    return RESOURCE_KINDS;
  }
}

/**
 * Coercion for `ta-rec-disc-video-min` / `ta-rec-disc-video-max`. A blank
 * string (never written, or explicitly cleared by `setVideoLengthPreference`
 * below) and anything that does not parse to a positive finite number both
 * mean "no preference set" - never `NaN`, never a negative or zero minute
 * count reaching state.
 */
export function coerceVideoLengthMinutes(raw: string | null): number | undefined {
  if (raw === null) return undefined;
  const trimmed = raw.trim();
  if (trimmed === "") return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) && n > 0 ? n : undefined;
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

  // Resource-controls feature.
  const [resourceKinds, setResourceKindsState] = useState<readonly ResourceKind[]>(() =>
    coerceResourceKinds(readLocalStorage("ta-rec-disc-resource-kinds"))
  );
  const setResourceKinds = useCallback((next: readonly ResourceKind[]) => {
    setResourceKindsState(next);
    writeLocalStorage("ta-rec-disc-resource-kinds", JSON.stringify(next));
  }, []);

  const [videoLengthMinMinutes, setVideoLengthMinState] = useState<number | undefined>(() =>
    coerceVideoLengthMinutes(readLocalStorage("ta-rec-disc-video-min"))
  );
  const [videoLengthMaxMinutes, setVideoLengthMaxState] = useState<number | undefined>(() =>
    coerceVideoLengthMinutes(readLocalStorage("ta-rec-disc-video-max"))
  );
  const setVideoLengthPreference = useCallback((min: number | undefined, max: number | undefined) => {
    setVideoLengthMinState(min);
    setVideoLengthMaxState(max);
    writeLocalStorage("ta-rec-disc-video-min", min !== undefined ? String(min) : "");
    writeLocalStorage("ta-rec-disc-video-max", max !== undefined ? String(max) : "");
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
    resourceKinds,
    setResourceKinds,
    videoLengthMinMinutes,
    videoLengthMaxMinutes,
    setVideoLengthPreference,
  };
}
