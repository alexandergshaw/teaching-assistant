"use client";

// docs/recording-controls-ux-acceptance-criteria.md CC12: the file-local
// `composeLiveSentence` (DiscussionRepliesPanel.tsx:101-118), parameterised
// over the noun being counted, and the throttling effect at :383-401,
// extracted so Grading (and, later, anyone else) can adopt the same live
// region instead of re-deriving it.
import { useEffect, useRef, useState } from "react";

export interface CaptureLiveSentenceNoun {
  one: string;
  many: string;
}

export interface CaptureLiveSentenceArgs {
  count: number;
  noun: CaptureLiveSentenceNoun;
  extracting: boolean;
  pendingFrames: number;
  stalled: boolean;
  capturing: boolean;
}

/** Reproduces DiscussionRepliesPanel.tsx:101-118's sentences exactly, with
 *  `noun.one`/`noun.many` substituted for the hard-coded "post"/"posts". */
export function composeCaptureLiveSentence(args: CaptureLiveSentenceArgs): string {
  const { count, noun, extracting, pendingFrames, stalled, capturing } = args;
  if (stalled) {
    return "Nothing new has been read off the screen for 30 seconds. Keep this app's tab visible in a second window while you scroll.";
  }
  if (!capturing) return "";
  const parts: string[] = [];
  parts.push(
    count === 0 ? `Capturing - 0 ${noun.many} so far.` : `${count} ${count === 1 ? noun.one : noun.many} found.`
  );
  if (extracting) parts.push("Reading the screen…");
  if (pendingFrames > 0) parts.push("Catching up - scroll a little slower.");
  return parts.join(" ");
}

/** Reproduces the effect at DiscussionRepliesPanel.tsx:383-401: recomputes
 *  at most once per `minIntervalMs` of wall-clock time (measured ceiling 12
 *  announcements per minute per region regardless of input rate). This
 *  repo's eslint rejects setState reached synchronously from an effect
 *  body, so the wait is a real await (even a zero-length one) and the
 *  setState call happens only after it. */
export function useThrottledLiveSentence(sentence: string, minIntervalMs = 5000): string {
  const [announced, setAnnounced] = useState("");
  const lastAnnouncedAtRef = useRef(0);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const sinceLast = Date.now() - lastAnnouncedAtRef.current;
      if (sinceLast < minIntervalMs) await new Promise((resolve) => setTimeout(resolve, minIntervalMs - sinceLast));
      if (cancelled) return;
      lastAnnouncedAtRef.current = Date.now();
      setAnnounced(sentence);
    })();
    return () => {
      cancelled = true;
    };
  }, [sentence, minIntervalMs]);
  return announced;
}
