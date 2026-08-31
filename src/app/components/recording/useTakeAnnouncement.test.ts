// Tests for FIX 2's pure decision half, `decideRealTimeGuard`. The rest of
// useTakeAnnouncement.ts (all React state, `resolveRealAudioDurationSec`'s
// DOM/<video> probing, the transcription/drafting pipeline) cannot be
// exercised here: this project's vitest runs in the "node" environment with
// no jsdom/@testing-library/react - see useRepoGradesBulkGrade.test.ts's
// header comment for the established precedent this follows, and RecordingTab
// et al. are never rendered anywhere in this suite. `decideRealTimeGuard` was
// pulled out of the hook specifically so the guard's DECISION - as opposed to
// the impure work of measuring a take's real duration - is reachable from a
// real, failing test.
//
// Not covered by these tests (would require rendering the hook or a DOM):
// that beginRealTimeGuardCheck actually calls resolveRealAudioDurationSec
// before setNeedsRealTimeConfirm(true) rather than after (Problem A - the
// refusal replacing the confirm instead of following it), and that
// resolveRealAudioDurationSec itself never lets a 0 or Infinity duration
// through to this function. Both are verifiable only by reading
// useTakeAnnouncement.ts directly.

import { describe, it, expect } from "vitest";
import { decideRealTimeGuard } from "./useTakeAnnouncement";

describe("decideRealTimeGuard", () => {
  it("an unresolvable duration (null) refuses, naming the way out", () => {
    const message = decideRealTimeGuard(null);
    expect(message).not.toBeNull();
    expect(message).toContain("Could not determine");
    expect(message).toContain("Record a take in this session");
  });

  it("a duration well under the 20-minute cap does not refuse", () => {
    expect(decideRealTimeGuard(300)).toBeNull();
  });

  it("a duration just at the cap (1200s) does not refuse - the check is strictly greater-than", () => {
    expect(decideRealTimeGuard(1200)).toBeNull();
  });

  it("a duration over the 20-minute cap refuses, naming the estimated minutes and the way out", () => {
    const message = decideRealTimeGuard(21 * 60);
    expect(message).not.toBeNull();
    expect(message).toContain("21 minutes");
    expect(message).toContain("Record a take in this session");
  });

  it("a 40-minute recording (this feature's own worked example) refuses", () => {
    const message = decideRealTimeGuard(40 * 60);
    expect(message).toContain("40 minutes");
  });

  // Documents the exact shape of the bug FIX 2 / Problem B closed. Before the
  // fix, the guard read take.durationSec directly - and both a metadata-probe
  // fallback of 0 and a MediaRecorder webm's unseeked `Infinity` sailed past
  // it, straight into the decode the cap exists to prevent. These two cases
  // show that decideRealTimeGuard itself would ALSO wave both values through
  // if they ever reached it - which is exactly why resolveRealAudioDurationSec
  // (untestable here - see the file header) exists to turn "unknown" into
  // `null` before this function ever sees it, rather than a bare number.
  it("0 alone is not distinguishable from a genuinely short recording - resolving the real duration first is what closes Problem B, not this function", () => {
    expect(decideRealTimeGuard(0)).toBeNull();
  });

  it("Infinity alone is not caught either, for the same reason - Number.isFinite gates the too-long check", () => {
    expect(decideRealTimeGuard(Infinity)).toBeNull();
  });
});
