"use client";

// GAP 3 (cross-surface busy gating, AC15b): TakeAnnouncementPanel.tsx computes
// its own local `busy` from `stage.phase` but has never exposed it, so
// TakesPanel's per-row gating only ever saw the walkthrough's and audio-
// extraction's busy states. TakeAnnouncementPanel.tsx owns the only call site
// of useTakeAnnouncement.ts and is out of that wave's allow-list (a sibling
// agent's file), so the busy fact cannot be threaded up through a new prop
// the panel would have to forward. A module-level external store sidesteps
// that: useTakeAnnouncement.ts writes to it (via setAnnouncementBusy, below),
// and RecordingTab.tsx reads it via useAnnouncementBusy() with no
// participation required from the panel in between. A plain singleton is
// also the semantically correct shape here - only one TakeAnnouncementPanel
// is ever mounted at a time (RecordingTab keeps a single `announcementTake`),
// mirroring the "the transcription queue is a singleton" reasoning AC15b
// itself gives.
//
// Pulled out of useTakeAnnouncement.ts (which re-exports useAnnouncementBusy
// so RecordingTab.tsx's existing `import { useAnnouncementBusy } from
// "./useTakeAnnouncement"` keeps resolving) to stay under
// recording-split.structure.test.ts's 1000-line ceiling on this directory -
// see that file's own header for the running account of what has already
// moved out of it and why. This store has no dependency on anything
// announcement-specific beyond its own name/purpose, but it is not a
// cross-feature primitive in the dropped-frame-accumulator.ts sense (nothing
// else in the app reads or writes it) - see that file's own header for the
// distinction - so it stays in this directory rather than moving to src/lib.

import { useSyncExternalStore } from "react";

type AnnouncementBusyListener = () => void;
let currentAnnouncementBusy = false;
const announcementBusyListeners = new Set<AnnouncementBusyListener>();

export function setAnnouncementBusy(busy: boolean): void {
  if (busy === currentAnnouncementBusy) return;
  currentAnnouncementBusy = busy;
  announcementBusyListeners.forEach((listener) => listener());
}

function subscribeAnnouncementBusy(listener: AnnouncementBusyListener): () => void {
  announcementBusyListeners.add(listener);
  return () => {
    announcementBusyListeners.delete(listener);
  };
}

function getAnnouncementBusySnapshot(): boolean {
  return currentAnnouncementBusy;
}

/** True while useTakeAnnouncement's pipeline is preparing audio,
 * transcribing, or drafting for whichever take its single mounted instance is
 * open on - the smallest fact that answers "is the announcement pipeline in
 * flight". Not "posting": posting is a Canvas write, not a use of the
 * recorder or the transcription queue, so it does not need to block another
 * take's actions. */
export function useAnnouncementBusy(): boolean {
  return useSyncExternalStore(subscribeAnnouncementBusy, getAnnouncementBusySnapshot, () => false);
}
