import { describe, it, expect } from "vitest";
import { isClosingCardInProgress } from "./useRecorder";

// The vast majority of useRecorder.ts is unreachable from node-env vitest
// (no MediaRecorder, getUserMedia, getDisplayMedia, AudioContext, or canvas
// here). isClosingCardInProgress is the one piece of the D-1 fix that is a
// small pure predicate - see its doc comment in useRecorder.ts for the full
// story of why stopRecording() needs it.
describe("isClosingCardInProgress", () => {
  it("blocks re-entry while a closing card is counting down", () => {
    expect(isClosingCardInProgress("closing")).toBe(true);
  });

  it("allows a stop to begin when no card is active", () => {
    expect(isClosingCardInProgress(null)).toBe(false);
  });

  it("allows a stop to begin during the title card, not just when idle", () => {
    // Recording can be stopped while the title card (not closing) is
    // showing - only "closing" itself is re-entrant-protected.
    expect(isClosingCardInProgress("title")).toBe(false);
  });
});
