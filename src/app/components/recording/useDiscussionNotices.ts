"use client";

// Discussion reply capture - the notices sub-hook, split out of
// useDiscussionReplies.ts (set C3) purely to stay under
// recording-split.structure.test.ts's 1000-line ceiling on
// src/app/components/recording/ (non-recursive) - useDiscussionReplies.ts
// was at 944 of that ceiling with no room left for the next feature
// (resource controls: one-click insert, eligible resource kinds, a
// video-length preference, and a per-row resource search). This region was
// chosen because it has the fewest inbound references of any candidate in
// that file: three plain reactive booleans/strings in, four fields out, no
// touch on the resource-search queue or the per-row draft-dispatch path the
// next feature will edit (see that file's own header for what was
// deliberately left in place, and why).
//
// Owns AC38's notices list end to end: the capped, deduped `notices` array
// shown to the instructor, `pushNotice`/`dismissNotice`, and the
// `logAllNotices` mirror docs/DEV_LOOP.md's downloadable-log rule
// (REGRESSION entries 369/372/373/374) needs - every notice actually shown
// (post-dedupe) is appended there with a timestamp, for
// discussion-replies-log.ts's `buildDiscussionRepliesRunLog` to assemble.
// Also forwards C1's out-of-band recorder failure (`recordingError`) and
// over-budget-frame notice (`frameEncodeNotice`), and C2's AC23a persisted-
// write failure (`persistError`), into the same channel -
// useDiscussionReplies.ts hands these three in as plain reactive values (not
// refs), the same way it hands useReplyResources.ts plain reactive values
// rather than refs.
//
// The two pure decisions this hook makes (dedupe against the immediately-
// preceding notice; cap the visible list at NOTICES_VISIBLE_CAP) are pulled
// out as their own functions below, unit-tested directly - vitest in this
// repo is node-env and renders no hook (see useReplyResources.ts's own
// header for the same discipline, and discussion-capture.ts's
// shouldLoopContinue/shouldTickerRun for the drafting queue's version of
// this same pattern).
//
// Import direction: useDiscussionReplies.ts imports FROM this file, never
// the reverse - the same one-owner, one-direction rule discussion-thread.ts,
// discussion-serialization.ts and takeAnnouncementTranscription.ts's headers
// state for their own splits. This file imports nothing from
// useDiscussionReplies.ts (only React and a type from
// discussion-replies-log.ts, which itself does not import
// useDiscussionReplies.ts or this file), so that direction is enforced
// structurally, not just by convention - see this repo's recorded
// split-constants-into-the-leaf failure (a back-imported constant created a
// cycle that silently yielded `undefined` past tsc) for why that matters.

import { useCallback, useEffect, useRef, useState } from "react";
import type { DiscussionRepliesLogNotice } from "./discussion-replies-log";

// AC38: the visible notices list never grows past this many entries.
const NOTICES_VISIBLE_CAP = 4;

/** AC38: dedupe against the immediately-preceding notice only ("identical
 * consecutive texts deduped"), so a repeating 429 does not build a wall but
 * two DIFFERENT failures that happen to recur are not merged. */
export function shouldSuppressNotice(text: string, lastText: string | null): boolean {
  return text === lastText;
}

/** AC38: appends a notice and keeps only the most recent `cap` entries -
 * the same "capped list, not a slot" rule as the dedupe above, so an
 * extraction failure, a drafting failure, a recorder failure and a storage
 * failure never erase each other outright, but the list still cannot grow
 * without bound. Generic over the element type purely so it is testable
 * with plain literals with no dependency on the `{ id, text }` shape. */
export function appendCappedNotice<T>(prev: readonly T[], next: T, cap: number = NOTICES_VISIBLE_CAP): T[] {
  const appended = [...prev, next];
  return appended.length > cap ? appended.slice(appended.length - cap) : appended;
}

export interface UseDiscussionNoticesArgs {
  /** AC31's fully formatted "Could not save the recording: <reason>. The
   *  capture is still running." message, or null. Forwarded once per
   *  distinct message (F4). */
  recordingError: string | null;
  /** S5/AC10b's re-encode-and-drop notice. Forwarded the same way. */
  frameEncodeNotice: string | null;
  /** C2's AC23a localStorage write failure. Forwarded the same way. */
  persistError: string | null;
}

export interface UseDiscussionNoticesReturn {
  notices: Array<{ id: string; text: string }>;
  dismissNotice: (id: string) => void;
  pushNotice: (text: string) => void;
  /** docs/DEV_LOOP.md's downloadable-log rule: every notice actually shown
   *  (post-dedupe), for discussion-replies-log.ts's
   *  `buildDiscussionRepliesRunLog` to assemble into the downloaded log. */
  logAllNotices: DiscussionRepliesLogNotice[];
}

export function useDiscussionNotices(args: UseDiscussionNoticesArgs): UseDiscussionNoticesReturn {
  const [notices, setNotices] = useState<Array<{ id: string; text: string }>>([]);
  const noticeCounterRef = useRef(0);
  const lastNoticeTextRef = useRef<string | null>(null);
  const [logAllNotices, setLogAllNotices] = useState<DiscussionRepliesLogNotice[]>([]);

  const pushNotice = useCallback((text: string) => {
    if (shouldSuppressNotice(text, lastNoticeTextRef.current)) return;
    lastNoticeTextRef.current = text;
    noticeCounterRef.current += 1;
    const id = `disc-notice-${noticeCounterRef.current}`;
    // Logged here, after the dedupe check above - "every notice shown to
    // the instructor" means what was actually shown, and a duplicate
    // suppressed by the check above was not.
    const at = new Date().toISOString();
    setLogAllNotices((prev) => [...prev, { at, text }]);
    setNotices((prev) => appendCappedNotice(prev, { id, text }));
  }, []);

  const dismissNotice = useCallback((id: string) => {
    // N4: the consecutive-dedupe ref must be cleared on a dismissal, or the
    // user's own dismiss action becomes the thing permanently suppressing a
    // notice - hit the same 429 again after dismissing the first one and
    // nothing would reappear. Clearing unconditionally (rather than only
    // when the dismissed notice's text happens to match) is the simpler,
    // safer-in-the-wrong-direction choice: the worst case is one duplicate
    // notice instead of a permanently silenced one.
    lastNoticeTextRef.current = null;
    setNotices((prev) => prev.filter((n) => n.id !== id));
  }, []);

  // --- Forward C1's out-of-band recorder failure into notices, once per
  // distinct message (F4: the recorder error is rendered as a notice; the
  // drop count itself is passed through on useDiscussionReplies.ts's own
  // return instead, since AC7b places that specific sentence beneath the
  // persistent post-stop summary, not in the generic notices list). ---
  const lastRecordingErrorRef = useRef<string | null>(null);
  useEffect(() => {
    const err = args.recordingError;
    if (err && err !== lastRecordingErrorRef.current) pushNotice(err);
    lastRecordingErrorRef.current = err;
  }, [args.recordingError, pushNotice]);

  // --- S5/AC10b: forward C1's over-budget-frame notice the same way. ---
  const lastFrameEncodeNoticeRef = useRef<string | null>(null);
  useEffect(() => {
    const note = args.frameEncodeNotice;
    if (note && note !== lastFrameEncodeNoticeRef.current) pushNotice(note);
    lastFrameEncodeNoticeRef.current = note;
  }, [args.frameEncodeNotice, pushNotice]);

  // --- Forward C2's AC23a localStorage write failure into notices. ---
  const lastPersistErrorRef = useRef<string | null>(null);
  useEffect(() => {
    const err = args.persistError;
    if (err && err !== lastPersistErrorRef.current) pushNotice(err);
    lastPersistErrorRef.current = err;
  }, [args.persistError, pushNotice]);

  return { notices, dismissNotice, pushNotice, logAllNotices };
}
