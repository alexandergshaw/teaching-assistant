// Frozen-literal oracle for the pure decision helpers moved out of
// useTakeAnnouncement.ts into this file (see that file's own header, and
// this file's, for why). These literals were captured by reading
// useTakeAnnouncement.ts's ORIGINAL source directly, before any move
// happened - not by calling the function post-move and snapshotting its
// output, which would prove nothing about whether the move changed
// behaviour. A deliberately sabotaged decideRealTimeGuard (the boundary
// check flipped, and the "20 minutes" copy edited) was confirmed to turn
// this file's own tests red before being reverted - see this wave's report.
//
// decodeBlobToMono and resolveRealAudioDurationSec are not covered here:
// both touch real browser APIs (AudioContext.decodeAudioData, a live <video>
// element) unavailable in this project's node-env vitest - see
// useTakeAnnouncement.test.ts's own header for the identical, already-
// documented limitation on this exact surface.

import { describe, it, expect } from "vitest";
import { decideRealTimeGuard, estimateRealTimeMinutes } from "./takeAnnouncementTranscription";

describe("decideRealTimeGuard (frozen oracle)", () => {
  it("a null duration refuses with the exact unresolvable-duration message", () => {
    expect(decideRealTimeGuard(null)).toBe(
      "Could not determine this recording's length, so it cannot safely be played back in real time to extract audio here. Record a take in this session to draft from it directly - it carries its own captured audio and skips this step entirely."
    );
  });

  it("300s (well under the cap) does not refuse", () => {
    expect(decideRealTimeGuard(300)).toBeNull();
  });

  it("1200s (exactly the 20-minute cap) does not refuse - strictly greater-than", () => {
    expect(decideRealTimeGuard(1200)).toBeNull();
  });

  it("1201s (just over the cap) refuses with the exact too-long message, rounded to 20 minutes", () => {
    expect(decideRealTimeGuard(1201)).toBe(
      "This recording is about 20 minutes long, which is too long to prepare this way - it has no captured audio track, so the whole recording would have to be decoded at once. Record a take in this session to draft from it directly - it carries its own captured audio and skips this step entirely."
    );
  });

  it("2400s (40 minutes) refuses, naming 40 minutes", () => {
    expect(decideRealTimeGuard(2400)).toBe(
      "This recording is about 40 minutes long, which is too long to prepare this way - it has no captured audio track, so the whole recording would have to be decoded at once. Record a take in this session to draft from it directly - it carries its own captured audio and skips this step entirely."
    );
  });

  it("0 does not refuse (Number.isFinite(0) && 0 > 1200 is false)", () => {
    expect(decideRealTimeGuard(0)).toBeNull();
  });

  it("Infinity does not refuse (Number.isFinite(Infinity) is false)", () => {
    expect(decideRealTimeGuard(Infinity)).toBeNull();
  });
});

describe("estimateRealTimeMinutes (frozen oracle)", () => {
  it("0 -> 1 (non-positive floors to 1)", () => {
    expect(estimateRealTimeMinutes(0)).toBe(1);
  });

  it("-5 -> 1 (negative floors to 1)", () => {
    expect(estimateRealTimeMinutes(-5)).toBe(1);
  });

  it("NaN -> 1 (non-finite floors to 1)", () => {
    expect(estimateRealTimeMinutes(NaN)).toBe(1);
  });

  it("Infinity -> 1 (non-finite floors to 1)", () => {
    expect(estimateRealTimeMinutes(Infinity)).toBe(1);
  });

  it("29 -> 1 (29/60 rounds down to 0, floored to 1)", () => {
    expect(estimateRealTimeMinutes(29)).toBe(1);
  });

  it("30 -> 1 (30/60 = 0.5 rounds up to 1)", () => {
    expect(estimateRealTimeMinutes(30)).toBe(1);
  });

  it("90 -> 2 (90/60 = 1.5 rounds up to 2)", () => {
    expect(estimateRealTimeMinutes(90)).toBe(2);
  });

  it("3600 -> 60", () => {
    expect(estimateRealTimeMinutes(3600)).toBe(60);
  });
});
