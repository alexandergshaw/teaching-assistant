// TDD - written from the AC BEFORE implementation (avatar-likeness work item).
// Currently FAILS: src/app/components/recording/avatar-script.ts does not exist.
// Make these pass without changing what they assert.
import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import path from "path";
import {
  AVATAR_SPEAKING_SECONDS,
  AVATAR_STILLNESS_SECONDS,
  AVATAR_SCRIPT_STAGES,
  AVATAR_SAMPLE_MAX_BYTES,
  AVATAR_CONSENT_ACKNOWLEDGEMENT,
  AVATAR_MIN_FRAME_RATE,
  AVATAR_TARGET_FRAME_RATE,
  AVATAR_FRAME_RATE_SAMPLE_WINDOW_MS,
  AVATAR_FRAME_RATE_TIMEOUT_SLACK_MS,
  AVATAR_FRAME_RATE_RECHECK_DELAY_MS,
  AVATAR_FRAME_RATE_UNKNOWN_ASSESSMENT,
  AVATAR_MIN_TRAINING_HEIGHT,
  avatarScriptTotalSeconds,
  pickAvatarMimeType,
  avatarFrameRateFromSamples,
  classifyAvatarFrameRate,
  mergeAvatarFrameRateAssessment,
  describeAvatarResolutionDrop,
  type AvatarFrameRateVerdict,
} from "./avatar-script";
import { startFrameRateSampling } from "./frameRateSampler";

describe("the guided sample script", () => {
  it("has exactly the two stages Tavus documents, in order", () => {
    expect(AVATAR_SCRIPT_STAGES.map((s) => s.id)).toEqual(["speaking", "stillness"]);
  });

  it("keeps the documented 1:1 speaking-to-stillness ratio", () => {
    // The live Tavus docs contradict each other on TOTAL length (30+30 on one
    // page, "1.5-2 min optimal" on another, "two minutes" on a third). The 1:1
    // STRUCTURE is consistent across all of them, so that is what we pin.
    expect(AVATAR_SPEAKING_SECONDS).toBe(AVATAR_STILLNESS_SECONDS);
  });

  it("lands inside the documented optimal band", () => {
    const total = avatarScriptTotalSeconds();
    expect(total).toBe(AVATAR_SPEAKING_SECONDS + AVATAR_STILLNESS_SECONDS);
    expect(total).toBeGreaterThanOrEqual(60);
    expect(total).toBeLessThanOrEqual(150);
  });

  it("exposes each stage's target so the timer cannot drift from the constant", () => {
    const speaking = AVATAR_SCRIPT_STAGES.find((s) => s.id === "speaking")!;
    const stillness = AVATAR_SCRIPT_STAGES.find((s) => s.id === "stillness")!;
    expect(speaking.targetSeconds).toBe(AVATAR_SPEAKING_SECONDS);
    expect(stillness.targetSeconds).toBe(AVATAR_STILLNESS_SECONDS);
  });

  it("gives the speaking stage enough words to fill its target, DERIVED from the constant", () => {
    const speaking = AVATAR_SCRIPT_STAGES.find((s) => s.id === "speaking")!;
    const words = speaking.body.trim().split(/\s+/).filter(Boolean).length;
    // Tied to AVATAR_SPEAKING_SECONDS, not hardcoded: if the stage target is
    // ever dropped to 30s, a 60-second script must FAIL this rather than
    // silently over-running the segment.
    const minutes = AVATAR_SPEAKING_SECONDS / 60;
    expect(words).toBeGreaterThanOrEqual(Math.round(minutes * 110));
    expect(words).toBeLessThanOrEqual(Math.round(minutes * 200));
  });

  it("gives the stillness stage nothing to read aloud", () => {
    const stillness = AVATAR_SCRIPT_STAGES.find((s) => s.id === "stillness")!;
    // Tavus wants lips closed and silent here. Any body text would be read out
    // loud by a user following a teleprompter, which defeats the segment.
    expect(stillness.body.trim()).toBe("");
    expect(stillness.instruction.trim().length).toBeGreaterThan(0);
  });

  it("labels and instructs every stage", () => {
    for (const s of AVATAR_SCRIPT_STAGES) {
      expect(s.label.trim().length).toBeGreaterThan(0);
      expect(s.instruction.trim().length).toBeGreaterThan(0);
    }
  });

  it("does not script a spoken consent sentence in ANY wording", () => {
    // Tavus retired consent_phrase_mismatch and marks consent_video_url Legacy.
    // Scripting a consent line would break the 1:1 segment structure for a
    // validator that no longer exists. Grepping for one exact phrasing is not
    // enough - "I authorise Tavus to create a likeness of me" is the same
    // mistake in different words.
    const allText = AVATAR_SCRIPT_STAGES.map((s) => `${s.body} ${s.instruction}`)
      .join(" ")
      .toLowerCase();
    for (const banned of ["consent", "authorise", "authorize", "i agree", "permission"]) {
      expect(allText, `stage text must not contain "${banned}"`).not.toContain(banned);
    }
  });
});

describe("the in-app consent acknowledgement", () => {
  it("says what is actually being agreed to", () => {
    const t = AVATAR_CONSENT_ACKNOWLEDGEMENT.toLowerCase();
    expect(t.length).toBeGreaterThan(40);
    // It must name the person AND the act, or it is not an acknowledgement of
    // anything - a string of the right length is not consent.
    expect(/\bi\b/.test(t)).toBe(true);
    expect(t).toMatch(/likeness|avatar|digital (twin|version)/);
    expect(t).toMatch(/consent|authoris|authoriz|agree|permission/);
  });
});

describe("file size guard", () => {
  it("matches the documented 750 MB Tavus cap", () => {
    expect(AVATAR_SAMPLE_MAX_BYTES).toBe(750 * 1024 * 1024);
  });
});

describe("codec negotiation", () => {
  it("prefers H.264 mp4 when the browser offers it", () => {
    const r = pickAvatarMimeType((t) => t.startsWith("video/mp4"));
    expect(r).not.toBeNull();
    expect(r!.mimeType).toContain("video/mp4");
    expect(r!.isRiskyCodec).toBe(false);
  });

  it("falls back to webm but FLAGS it, because Tavus documents H.264 + AAC", () => {
    const r = pickAvatarMimeType((t) => t.startsWith("video/webm"));
    expect(r).not.toBeNull();
    expect(r!.mimeType).toContain("video/webm");
    // A VP8/VP9 webm may be rejected with video_codec only AFTER a 3-4 hour
    // round trip, so the user has to be warned BEFORE training starts.
    expect(r!.isRiskyCodec).toBe(true);
  });

  it("returns null when the browser supports no usable container", () => {
    expect(pickAvatarMimeType(() => false)).toBeNull();
  });

  it("probes containers in the exact documented preference order", () => {
    const asked: string[] = [];
    pickAvatarMimeType((t) => {
      asked.push(t);
      return false;
    });
    // Asserting only asked[0] would let a two-entry ["video/mp4","video/webm"]
    // list pass while dropping the avc1 hint - and H.264 is the whole reason
    // mp4 is preferred, since Tavus documents H.264 + AAC.
    expect(asked).toEqual([
      "video/mp4;codecs=avc1",
      "video/mp4",
      "video/webm;codecs=vp9,opus",
      "video/webm",
    ]);
  });
});

describe("avatarFrameRateFromSamples: turns requestVideoFrameCallback timestamps into fps", () => {
  it("counts frames per second from evenly spaced timestamps", () => {
    // 31 samples 1000/30 ms apart span exactly 1000ms across 30 intervals -
    // a synthetic 30fps stream.
    const thirtyFps = Array.from({ length: 31 }, (_, i) => i * (1000 / 30));
    expect(avatarFrameRateFromSamples(thirtyFps)).toBeCloseTo(30, 5);

    // A slower, independent cadence proves the arithmetic generalizes
    // rather than only working for the one number above: 25 samples 2s
    // apart... i.e. 24 intervals over 2000ms is 12fps.
    const twelveFps = Array.from({ length: 25 }, (_, i) => i * (2000 / 24));
    expect(avatarFrameRateFromSamples(twelveFps)).toBeCloseTo(12, 5);
  });

  it("returns null rather than a number when there is not enough data", () => {
    expect(avatarFrameRateFromSamples([])).toBeNull();
    expect(avatarFrameRateFromSamples([42])).toBeNull();
  });

  it("returns null rather than dividing by zero when samples span no time", () => {
    // Three callbacks that all reported the identical timestamp (a
    // degenerate case, not a realistic one, but the arithmetic must not
    // produce Infinity/NaN for it).
    expect(avatarFrameRateFromSamples([5, 5, 5])).toBeNull();
  });
});

describe("classifyAvatarFrameRate: maps a rate (+ its source) to ok/warn/block", () => {
  it("blocks a rate below Tavus's floor and names dim lighting as the likely cause", () => {
    const r = classifyAvatarFrameRate(15, "measured");
    expect(r.status).toBe("block");
    // Pin the FACTS (the floor is named, dim lighting is named as the
    // cause) rather than the exact sentence - see the standing lesson
    // against pinning source text.
    expect(r.reason).not.toBeNull();
    expect(r.reason!.toLowerCase()).toContain("light");
    expect(r.reason).toContain(String(AVATAR_MIN_FRAME_RATE));
  });

  it("treats the floor as inclusive: the minimum itself is not blocked", () => {
    const r = classifyAvatarFrameRate(AVATAR_MIN_FRAME_RATE, "measured");
    expect(r.status).not.toBe("block");
  });

  it("treats the target as the ok boundary: at/above it is ok with no reason, just under it warns", () => {
    const atTarget = classifyAvatarFrameRate(AVATAR_TARGET_FRAME_RATE, "measured");
    expect(atTarget.status).toBe("ok");
    expect(atTarget.reason).toBeNull();

    const justUnder = classifyAvatarFrameRate(AVATAR_TARGET_FRAME_RATE - 0.1, "measured");
    expect(justUnder.status).toBe("warn");
    expect(justUnder.reason).not.toBeNull();
  });

  it("keeps the same thresholds regardless of source, changing only how the figure is described", () => {
    const measured = classifyAvatarFrameRate(15, "measured");
    const reported = classifyAvatarFrameRate(15, "reported");
    // Same classification either way - a low reported number is still
    // worth blocking even though it was not measured.
    expect(measured.status).toBe("block");
    expect(reported.status).toBe("block");
    // But the two must not read identically: a "reported" figure is a
    // weaker claim than a "measured" one, and the wording has to say so.
    expect(reported.reason).not.toBe(measured.reason);
    expect(reported.source).toBe("reported");
    expect(measured.source).toBe("measured");
  });

  it("rounds the displayed rate to one decimal place", () => {
    const r = classifyAvatarFrameRate(24.567, "measured");
    expect(r.rate).toBe(24.6);
  });

  it("FLOORS (never rounds) the displayed rate in the block branch, so it can never read as reaching the floor it is below", () => {
    // 22.96 would ROUND to 23.0 - the exact self-contradiction ("about
    // 23fps, below the 23fps minimum") the flooring fix exists to prevent.
    const r = classifyAvatarFrameRate(22.96, "measured");
    expect(r.status).toBe("block");
    expect(r.rate).toBeLessThan(AVATAR_MIN_FRAME_RATE);
    expect(r.reason).toContain(String(r.rate));
  });
});

describe("mergeAvatarFrameRateAssessment: a later verdict only overwrites an earlier one if it is WORSE (defect 4)", () => {
  it("replaces the earlier verdict when the later one downgrades the status", () => {
    const ok = classifyAvatarFrameRate(30, "measured");
    const warn = classifyAvatarFrameRate(25, "measured");
    expect(mergeAvatarFrameRateAssessment(ok, warn)).toBe(warn);
  });

  it("keeps the EARLIER verdict when the later one is an improvement - footage already recorded at the worse rate does not retroactively get better", () => {
    const block = classifyAvatarFrameRate(15, "measured");
    const ok = classifyAvatarFrameRate(30, "measured");
    expect(mergeAvatarFrameRateAssessment(block, ok)).toBe(block);
  });

  it("keeps the earlier verdict when the later one is the same severity", () => {
    const warnA = classifyAvatarFrameRate(24, "measured");
    const warnB = classifyAvatarFrameRate(26, "measured");
    expect(mergeAvatarFrameRateAssessment(warnA, warnB)).toBe(warnA);
  });
});

describe("AVATAR_FRAME_RATE_UNKNOWN_ASSESSMENT: the 'could not verify' terminal state (defect 2)", () => {
  it("is a distinct status from ok/warn/block, and warns rather than silently passing through", () => {
    expect(AVATAR_FRAME_RATE_UNKNOWN_ASSESSMENT.status).toBe("unknown");
    expect(AVATAR_FRAME_RATE_UNKNOWN_ASSESSMENT.reason.toLowerCase()).toContain("could not verify");
  });
});

describe("describeAvatarResolutionDrop: warns when the camera settles below Tavus's documented resolution minimum", () => {
  it("returns null at or above the documented minimum", () => {
    expect(describeAvatarResolutionDrop(AVATAR_MIN_TRAINING_HEIGHT)).toBeNull();
    expect(describeAvatarResolutionDrop(AVATAR_MIN_TRAINING_HEIGHT + 200)).toBeNull();
  });

  it("names both the actual and the documented minimum when it warns", () => {
    const msg = describeAvatarResolutionDrop(720);
    expect(msg).not.toBeNull();
    expect(msg).toContain("720");
    expect(msg).toContain(String(AVATAR_MIN_TRAINING_HEIGHT));
  });
});

// Fake video/track doubles for frameRateSampler.ts: it only ever calls
// requestVideoFrameCallback/cancelVideoFrameCallback on `video` and
// getSettings/addEventListener/removeEventListener on `track`, so a plain
// object satisfying that shape drives it fully under vitest's node
// environment - no real MediaStream/rVFC needed for this module (unlike
// useAvatarStudio.ts itself, which is still source-scanned below).
function fakeRvfcVideo() {
  let seq = 0;
  const pending = new Map<number, VideoFrameRequestCallback>();
  const video = {
    requestVideoFrameCallback: (cb: VideoFrameRequestCallback) => {
      const id = ++seq;
      pending.set(id, cb);
      return id;
    },
    cancelVideoFrameCallback: (id: number) => {
      pending.delete(id);
    },
  } as unknown as HTMLVideoElement;
  return {
    video,
    // Fires whichever registration is currently pending (there is at most
    // one at a time, mirroring how the real API is used here).
    fire: (now: number) => {
      const entry = Array.from(pending.entries())[0];
      if (!entry) return;
      const [id, cb] = entry;
      pending.delete(id);
      cb(now, {} as VideoFrameCallbackMetadata);
    },
    pendingCount: () => pending.size,
  };
}

function fakeTrack(frameRate?: number) {
  let endedListener: (() => void) | null = null;
  const track = {
    getSettings: () => (typeof frameRate === "number" ? { frameRate } : {}),
    addEventListener: (_type: "ended", listener: () => void) => {
      endedListener = listener;
    },
    removeEventListener: () => {
      endedListener = null;
    },
  } as unknown as MediaStreamTrack;
  return { track, end: () => endedListener?.() };
}

// Frame timestamps for the sampler tests, as INTEGER milliseconds from an
// explicit base rather than from performance.now().
//
// This is deliberate and load-bearing. These tests used to anchor on
// `performance.now()` and space frames by `i * (1000 / fps)`. 1000/30 is not
// exactly representable, and once the whole suite has been running for a
// while performance.now() is large enough that the additions lose precision -
// so a "30fps" stream measured out at 29.999999999999996, and
// classifyAvatarFrameRate returns "ok" only at rate >= AVATAR_TARGET_FRAME_RATE.
// The test sat exactly on that boundary, so a sub-picosecond float error
// flipped it to "warn". It passed alone and failed under a full run, which is
// the worst shape a test can have: it trains people to re-run until green.
//
// Integer stamps from base 0 are exact, so the measured rate is exact, and
// `frames` chooses a count whose final stamp lands on a whole number of
// milliseconds - which is what keeps the rate exact rather than merely close.
// sampleWindow anchors on the first frame's own timestamp (see
// frameRateSampler.ts), so no real clock enters the measurement at all.
function frameStamps(fps: number, count: number, base = 0): number[] {
  // Refuse a fractional base rather than trusting a comment to keep future
  // callers off performance.now(). A whole-millisecond base keeps every stamp
  // an exact integer, so `last - first` is exact and the measured rate is
  // exact. A fractional base near 4e5 - which is what performance.now()
  // returns once the suite has been running a while - is precisely what
  // reintroduces the drift: the stamps stay valid-looking floats and only the
  // final comparison against the classification boundary goes wrong.
  if (!Number.isInteger(base)) {
    throw new Error(
      `frameStamps needs a whole-millisecond base, got ${base}. Do not anchor ` +
        `frame timestamps on performance.now() - see the note above.`,
    );
  }
  return Array.from({ length: count }, (_, i) => base + Math.round((i * 1000) / fps));
}

describe("frameRateSampler.startFrameRateSampling", () => {
  it("frameStamps produces an exactly-representable rate (guards the tests below)", () => {
    // If this ever goes red, the tests below are back on a float knife-edge
    // and their pass/fail depends on how long the suite has been running.
    for (const fps of [12, 30, 60]) {
      const stamps = frameStamps(fps, 3 * fps + 1);
      expect(stamps[stamps.length - 1] - stamps[0]).toBe(3000);
      expect(avatarFrameRateFromSamples(stamps)).toBe(fps);
      expect(stamps.every(Number.isInteger)).toBe(true);
    }
    // A fractional base is refused, not silently accepted. This is the shape
    // of the original defect: performance.now() returns something like
    // 403123.4567, and `base + i * (1000 / 30)` then rounds on every addition
    // until a 30fps stream measures 29.999999999999996 and the inclusive
    // "ok" boundary flips to "warn".
    expect(() => frameStamps(30, 96, 403123.4567)).toThrow(/whole-millisecond base/);
    // Proof the refusal is worth having, computed rather than asserted from
    // memory: the float path really does miss the boundary at this magnitude.
    const drifted = Array.from({ length: 96 }, (_, i) => 403123.4567 + i * (1000 / 30));
    expect(avatarFrameRateFromSamples(drifted)).not.toBe(30);
  });

  it("holds no state shared between two concurrent sessions (defect 1 regression)", () => {
    // The original bug: sampling state lived at the caller's level as
    // shared refs, so two overlapping measurements (e.g. a double-clicked
    // "Start camera" during a getUserMedia permission prompt) both wrote
    // into the SAME array and stomped the SAME handle, roughly doubling
    // the computed rate. Interleaving two independent sessions here and
    // asserting each produces its OWN correct verdict proves the
    // extraction actually fixed that, not just moved the code around.
    const a = fakeRvfcVideo();
    const b = fakeRvfcVideo();
    const verdictsA: AvatarFrameRateVerdict[] = [];
    const verdictsB: AvatarFrameRateVerdict[] = [];
    const cancelA = startFrameRateSampling(a.video, fakeTrack().track, {
      onVerdict: (v) => verdictsA.push(v),
      onUnknown: () => {},
    });
    const cancelB = startFrameRateSampling(b.video, fakeTrack().track, {
      onVerdict: (v) => verdictsB.push(v),
      onUnknown: () => {},
    });

    // Session A: a slow 12fps stream, past the sampling window.
    for (const t of frameStamps(12, 41)) a.fire(t);
    // Session B, interleaved with A above: a clean 60fps stream.
    for (const t of frameStamps(60, 191)) b.fire(t);

    expect(verdictsA).toHaveLength(1);
    expect(verdictsB).toHaveLength(1);
    // Exact, not toBeCloseTo: the stamps are integers from an explicit base,
    // so a drifting figure here means the sampler mixed in another clock
    // rather than that the arithmetic is merely imprecise.
    expect(verdictsA[0].rate).toBe(12);
    expect(verdictsB[0].rate).toBe(60);
    // Both sessions armed a real (non-fake-timer) mid-take recheck once
    // their first window settled - cancel to release those real timers
    // rather than leaking them past the end of this test.
    cancelA();
    cancelB();
  });

  it("measures a real rate via requestVideoFrameCallback and classifies it (AC3)", () => {
    const v = fakeRvfcVideo();
    const verdicts: AvatarFrameRateVerdict[] = [];
    const cancel = startFrameRateSampling(v.video, fakeTrack().track, {
      onVerdict: (x) => verdicts.push(x),
      onUnknown: () => {},
    });
    for (const t of frameStamps(30, 96)) v.fire(t);
    expect(verdicts.length).toBeGreaterThanOrEqual(1);
    expect(verdicts[0].source).toBe("measured");
    // Exactly AVATAR_TARGET_FRAME_RATE, which is the interesting case: "ok"
    // requires rate >= target, so this pins the inclusive boundary end to end
    // rather than only in classifyAvatarFrameRate's own unit test. It can only
    // be asserted honestly because the stamps make the rate exactly 30.
    expect(verdicts[0].rate).toBe(AVATAR_TARGET_FRAME_RATE);
    expect(verdicts[0].status).toBe("ok");
    cancel(); // release the real mid-take recheck timer this armed
  });

  it("falls back to the reported (negotiated) rate when requestVideoFrameCallback is unavailable", () => {
    const track = fakeTrack(18).track;
    const verdicts: AvatarFrameRateVerdict[] = [];
    let unknownCalled = false;
    startFrameRateSampling(null, track, {
      onVerdict: (v) => verdicts.push(v),
      onUnknown: () => {
        unknownCalled = true;
      },
    });
    expect(unknownCalled).toBe(false);
    expect(verdicts).toHaveLength(1);
    expect(verdicts[0].source).toBe("reported");
    expect(verdicts[0].status).toBe("block");
  });

  it("reaches the unknown state if nothing settles before the window plus slack elapses (defect 2)", () => {
    vi.useFakeTimers();
    try {
      const v = fakeRvfcVideo(); // registers, but the test never fires it
      const track = fakeTrack().track; // no negotiated frameRate either
      let unknownCalled = false;
      startFrameRateSampling(v.video, track, {
        onVerdict: () => {
          throw new Error("should not settle a concrete verdict");
        },
        onUnknown: () => {
          unknownCalled = true;
        },
      });

      vi.advanceTimersByTime(AVATAR_FRAME_RATE_SAMPLE_WINDOW_MS + AVATAR_FRAME_RATE_TIMEOUT_SLACK_MS - 1);
      expect(unknownCalled).toBe(false);
      vi.advanceTimersByTime(2);
      expect(unknownCalled).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports unknown when the track ends before any verdict lands (defect 2)", () => {
    const v = fakeRvfcVideo(); // never fired
    const t = fakeTrack();
    let unknownCalled = false;
    startFrameRateSampling(v.video, t.track, { onVerdict: () => {}, onUnknown: () => (unknownCalled = true) });
    expect(unknownCalled).toBe(false);
    t.end();
    expect(unknownCalled).toBe(true);
  });

  it("does NOT report unknown when the track ends after a verdict already landed", () => {
    const t = fakeTrack(30); // resolves synchronously via the reported fallback
    let unknownCalled = false;
    let verdictCount = 0;
    startFrameRateSampling(null, t.track, {
      onVerdict: () => {
        verdictCount += 1;
      },
      onUnknown: () => {
        unknownCalled = true;
      },
    });
    expect(verdictCount).toBe(1);
    t.end();
    expect(unknownCalled).toBe(false);
  });

  it("re-arms a second window partway through and reports a degrading rate as a second verdict (defect 4)", () => {
    vi.useFakeTimers();
    try {
      const v = fakeRvfcVideo();
      const verdicts: AvatarFrameRateVerdict[] = [];
      startFrameRateSampling(v.video, fakeTrack().track, {
        onVerdict: (x) => verdicts.push(x),
        onUnknown: () => {},
      });

      // First window: a clean 30fps stream. Integer stamps, same reason as
      // frameStamps' own note - an exact-30 rate is the only way "ok" can be
      // asserted at the inclusive boundary without depending on float luck.
      for (const t of frameStamps(30, 96)) v.fire(t);
      expect(verdicts).toHaveLength(1);
      expect(verdicts[0].rate).toBe(AVATAR_TARGET_FRAME_RATE);
      expect(verdicts[0].status).toBe("ok");

      vi.advanceTimersByTime(AVATAR_FRAME_RATE_RECHECK_DELAY_MS);

      // Second window: the camera has degraded to 12fps. Each sampleWindow
      // anchors on its OWN first frame, so this window needs no offset from
      // the first - and asserting that is part of the point.
      for (const t of frameStamps(12, 41)) v.fire(t);

      expect(verdicts).toHaveLength(2);
      expect(verdicts[1].status).toBe("block");
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancel() clears pending timers/rVFC registrations and prevents any further callback", () => {
    vi.useFakeTimers();
    try {
      let cancelledHandle: number | null = null;
      const video = {
        requestVideoFrameCallback: () => 42,
        cancelVideoFrameCallback: (id: number) => {
          cancelledHandle = id;
        },
      } as unknown as HTMLVideoElement;
      let verdictCalled = false;
      let unknownCalled = false;
      const cancel = startFrameRateSampling(video, fakeTrack().track, {
        onVerdict: () => {
          verdictCalled = true;
        },
        onUnknown: () => {
          unknownCalled = true;
        },
      });

      cancel();
      expect(cancelledHandle).toBe(42);

      vi.advanceTimersByTime(AVATAR_FRAME_RATE_SAMPLE_WINDOW_MS + AVATAR_FRAME_RATE_TIMEOUT_SLACK_MS + 5000);
      expect(verdictCalled).toBe(false);
      expect(unknownCalled).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("frame-rate pre-flight (source scan): guarantees vitest cannot exercise directly", () => {
  // Avatar hook code used to live entirely in useAvatarStudio.ts. A 1000-line
  // cap forces it to split into a family of useAvatar*.ts files beside it, so
  // the file list is DERIVED from the directory tree (readdirSync) rather
  // than hardcoded - these guarantees are about the avatar hook CODE as a
  // body, not about one filename, and stay meaningful no matter how the hook
  // is split or re-split later.
  //
  // This filter is NOT recursive and only matches "useAvatar*.ts" sitting
  // directly in this directory - a file moved into a subdirectory, or
  // renamed to ".tsx", silently drops out of avatarHookFileNames /
  // avatarHookSources below with no error of its own. That gap is defended
  // in depth rather than closed here: losing useAvatarCapture.ts this way
  // (it owns the getUserMedia constraints and the frameRateSampler wiring
  // every test below checks) makes "asks getUserMedia for a hard frame-rate
  // floor via `min`" and "holds no frame-sampling state..." fail loudly on
  // their positive matches, and every extractCallback("startCapturePreview"
  // | "saveTake") call below throws "not found" - those are the assertions
  // actually doing the work if this filter's coverage is ever silently
  // narrowed. A future edit must not remove them while leaving the filter as
  // the only guard.
  const recordingDir = path.resolve(process.cwd(), "src/app/components/recording");
  const avatarHookFileNames = fs
    .readdirSync(recordingDir)
    .filter((f) => /^useAvatar.*\.ts$/.test(f) && !f.endsWith(".test.ts"));
  const avatarHookSources = avatarHookFileNames.map((f) => ({
    name: f,
    content: fs.readFileSync(path.join(recordingDir, f), "utf-8"),
  }));
  const combinedAvatarHookSource = avatarHookSources.map((f) => f.content).join("\n");

  const avatarStudioPanelSource = fs.readFileSync(
    path.resolve(process.cwd(), "src/app/components/recording/AvatarStudioPanel.tsx"),
    "utf-8"
  );

  it("finds the useAvatar* hook family on disk - a scan over nothing proves nothing", () => {
    expect(avatarHookFileNames.length).toBeGreaterThan(0);
    expect(combinedAvatarHookSource.length).toBeGreaterThan(0);
  });

  // Hole 2 (proven by sabotage): this used to return the FIRST file whose
  // content matched the callback name, so a second, WRONG definition of the
  // same name in a file sorting AFTER the real one was never even inspected
  // - a duplicate `const saveTake = ...` added to useAvatarVideo.ts (which
  // sorts after useAvatarCapture.ts) produced zero failures. Now every file
  // in the family is scanned and matches are collected across ALL of them,
  // so finding more than one definition is itself a named failure rather
  // than a coin flip on readdirSync's filename ordering.
  function extractCallback(name: string): string {
    const pattern = new RegExp(`const ${name} = useCallback\\(async \\(\\) => \\{[\\s\\S]*?\\n {2}\\}, \\[`);
    const matches: { file: string; body: string }[] = [];
    for (const { name: file, content } of avatarHookSources) {
      const match = content.match(pattern);
      if (match) matches.push({ file, body: match[0] });
    }
    if (matches.length === 0) {
      throw new Error(
        `expected to find ${name}'s useCallback body in one of: ${avatarHookFileNames.join(", ")}`
      );
    }
    if (matches.length > 1) {
      throw new Error(
        `expected exactly ONE definition of ${name}'s useCallback body across the useAvatar* family, found ${matches.length}: ${matches.map((m) => m.file).join(", ")}`
      );
    }
    return matches[0].body;
  }

  it("asks getUserMedia for a hard frame-rate floor via `min`, not just `ideal` (AC2)", () => {
    expect(combinedAvatarHookSource).toMatch(/frameRate:\s*\{[^}]*min:\s*AVATAR_MIN_FRAME_RATE/);
  });

  it("retries getUserMedia unconstrained on ANY rejection, never gated on a specific error identity (defect 3)", () => {
    const body = extractCallback("startCapturePreview");
    const getUserMediaCalls = body.match(/getUserMedia\(/g) ?? [];
    // One constrained attempt, one unconstrained retry.
    expect(getUserMediaCalls.length).toBeGreaterThanOrEqual(2);
    // Naming a specific error here (by instanceof/name check) is the exact
    // defect: the relevant error type predates being folded into
    // DOMException, and different engines have used different names for
    // it, so a wrong predicate rethrows and leaves the user with NO camera
    // - worse than the bug this feature exists to fix.
    expect(body).not.toMatch(/OverconstrainedError/);
  });

  it("gates Save on a BLOCKING frame-rate verdict, before the save actually starts (AC5)", () => {
    const body = extractCallback("saveTake");
    const gateIdx = body.search(/frameRateAssessment\?\.status === ["']block["']/);
    const savingIdx = body.indexOf('setSaveState("saving")');
    expect(gateIdx).toBeGreaterThan(-1);
    expect(savingIdx).toBeGreaterThan(-1);
    expect(gateIdx).toBeLessThan(savingIdx);
  });

  it("holds no frame-sampling state as hook-level singleton refs - sampling lives in its own module now (defect 1)", () => {
    // Paired positive: the family must still actually DRIVE the sampler
    // module, so "no singleton refs" cannot pass merely because the scan
    // missed wherever the sampling code now lives.
    expect(combinedAvatarHookSource).toMatch(/from ["']\.\/frameRateSampler["']/);
    expect(combinedAvatarHookSource).toMatch(/startFrameRateSampling\(/);
    expect(combinedAvatarHookSource).not.toMatch(/frameSamplesRef/);
    expect(combinedAvatarHookSource).not.toMatch(/rvfcHandleRef/);
  });

  it("guards startCapturePreview against a re-entrant double-click before its first await (defect 1)", () => {
    const body = extractCallback("startCapturePreview");
    const guardIdx = body.search(/if\s*\([^)]*\.current[^)]*\)\s*return;/);
    const firstAwaitIdx = body.indexOf("await");
    expect(guardIdx).toBeGreaterThan(-1);
    expect(firstAwaitIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(firstAwaitIdx);
  });

  it("disables the Start camera button while startCapturePreview is in flight (defect 1)", () => {
    const idx = avatarStudioPanelSource.indexOf("Start camera");
    expect(idx).toBeGreaterThan(-1);
    const nearby = avatarStudioPanelSource.slice(Math.max(0, idx - 400), idx);
    expect(nearby).toMatch(/disabled=\{/);
  });
});

describe("training footage must bypass the effects pipeline (source scan)", () => {
  // This is the AC that silently corrupts EVERY likeness if it is got wrong,
  // and the failure is invisible for 3-4 hours and costs a paid training
  // slot. The existing recorder (useRecorder.ts's startRecording) swaps in
  // canvas.captureStream() for any video source whenever a pipeline canvas
  // exists - background blur, mirror, annotations, the PiP bubble and title
  // cards all ride on it, and every one of them alters the subject's
  // appearance. The avatar capture hook must never take that branch.
  //
  // There is no way to construct a MediaStream/MediaRecorder under vitest's
  // node environment (no jsdom here), so this cannot be proven by exercising
  // the recorder at runtime. Instead this scans the source of the useAvatar*
  // hook family that owns the real `new MediaRecorder(...)` call - the same
  // technique recording-split.structure.test.ts uses for its own cross-file
  // guarantees - so a rewrite that feeds the recorder a canvas stream
  // actually fails a test instead of only failing a comment's promise.
  //
  // The file list is DERIVED (readdirSync + a useAvatar* filter) rather than
  // one hardcoded filename, and specifically NOT "every file in this
  // directory": useRecorder.ts legitimately references both
  // useCanvasPipeline and captureStream for its own, unrelated pipeline, so
  // a whole-directory scan would false-positive on that file. Restricting to
  // the useAvatar* family is what makes "never" here mean something for the
  // hook this AC is actually about, while still being immune to it splitting
  // across several files - a scan pinned to the old single filename would go
  // quietly vacuous, always finding nothing to object to, the moment the
  // real code moved to a sibling file.
  // See the matching comment in the "frame-rate pre-flight" describe above -
  // this filter is its own separate readdirSync scan (not recursive, ".ts"
  // only) with the same gap: a file moved into a subdirectory or renamed
  // ".tsx" silently drops out. Here, losing useAvatarCapture.ts (the file
  // that owns the real `new MediaRecorder(...)` call) is what "never imports
  // or references the canvas effects pipeline" / "never calls captureStream
  // on anything" (via their code-shaped positive below) and "constructs
  // every MediaRecorder..." (via its non-empty assertion) actually catch -
  // not "finds the useAvatar* hook family on disk" below, which stays green
  // as long as ANY useAvatar*.ts file remains, moved file or not.
  const recordingDir = path.resolve(process.cwd(), "src/app/components/recording");
  const avatarHookFileNames = fs
    .readdirSync(recordingDir)
    .filter((f) => /^useAvatar.*\.ts$/.test(f) && !f.endsWith(".test.ts"));
  const avatarHookSources = avatarHookFileNames.map((f) =>
    fs.readFileSync(path.join(recordingDir, f), "utf-8")
  );
  const combinedAvatarHookSource = avatarHookSources.join("\n");

  // Hole 3 (proven by sabotage): the two tests below used to check for the
  // bare identifier `streamRef.current` ANYWHERE in the combined source,
  // including inside comments. With the real capture code moved out and only
  // a COMMENT mentioning `streamRef.current` left behind (there is a real
  // one in useAvatarCapture.ts today, right beside the actual code, on the
  // "never a canvas composite" comment above the MediaRecorder constructor),
  // both paired positives passed vacuously - a "never X" assertion whose own
  // positive is satisfiable by a comment is not testing anything.
  //
  // Fixed two ways, not one:
  //  1. Comments are stripped before either check runs. This repo already
  //     has a `stripComments` helper in
  //     src/app/components/ui/modalAdoptionScan.ts, but its own comment
  //     documents a real limitation: it only strips a `//` that starts the
  //     line, so a TRAILING `// comment` after real code survives it
  //     untouched - and useAvatarCapture.ts has exactly one of those, on its
  //     re-entrancy guard (`if (startingCapturePreviewRef.current) return; //
  //     defect 1 - see the ref's own comment above`). stripAvatarHookComments
  //     below strips `//` wherever it appears on a line, not only at line
  //     start, so it does not inherit that specific weakness. It is still a
  //     naive, non-tokenizing strip - a `//` inside a string literal (e.g. a
  //     URL) would be mis-stripped as a comment - but grep confirms no
  //     useAvatar*.ts file contains one today, and a full JS/TS tokenizer is
  //     out of scope for a source-text guard.
  //  2. The positive match is now CODE-SHAPED rather than a bare identifier:
  //     it requires `streamRef.current` to appear as an argument inside an
  //     actual `new MediaRecorder(...)` call - the one piece of code this
  //     whole AC is actually about - rather than the identifier occurring
  //     anywhere at all. That is deliberately the same shape "constructs
  //     every MediaRecorder..." below checks in full, reused here so a
  //     comment-only sabotage cannot satisfy this positive even if the
  //     comment also happens to mention "MediaRecorder".
  function stripAvatarHookComments(text: string): string {
    return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  }
  const strippedAvatarHookSource = stripAvatarHookComments(combinedAvatarHookSource);
  const MEDIARECORDER_FROM_RAW_STREAM = /new MediaRecorder\([^)]*streamRef\.current[^)]*\)/;

  it("finds the useAvatar* hook family on disk - a scan over nothing proves nothing", () => {
    expect(avatarHookFileNames.length).toBeGreaterThan(0);
  });

  it("never imports or references the canvas effects pipeline", () => {
    // Paired positive: prove the scan actually lands on real capture code -
    // a genuine `new MediaRecorder(streamRef.current, ...)` call, comments
    // stripped - rather than passing because it is looking at near-empty,
    // relocated, or comment-only files.
    expect(strippedAvatarHookSource).toMatch(MEDIARECORDER_FROM_RAW_STREAM);
    expect(strippedAvatarHookSource).not.toMatch(/useCanvasPipeline/);
  });

  it("never calls captureStream on anything", () => {
    // The only way a canvas composite reaches a MediaRecorder is via
    // someCanvas.captureStream(...). If this string appears anywhere in the
    // family's actual CODE (comments stripped), something is capturing a
    // canvas rather than using the raw getUserMedia stream.
    expect(strippedAvatarHookSource).toMatch(MEDIARECORDER_FROM_RAW_STREAM);
    expect(strippedAvatarHookSource).not.toMatch(/captureStream/);
  });

  it("constructs every MediaRecorder from the raw stream ref, never a captured stream", () => {
    const recorderCalls = strippedAvatarHookSource.match(/new MediaRecorder\([\s\S]*?\)/g) ?? [];
    // THE worst failure mode this guard exists to catch: if the family ever
    // stops constructing a MediaRecorder at all - deleted outright, or moved
    // to a file this scan does not cover - `recorderCalls` goes empty and a
    // `for` loop over it would silently run zero iterations, i.e. pass by
    // doing nothing. Asserting non-empty FIRST turns that into a loud, named
    // failure instead of a vacuous pass. Comments are stripped first (see
    // strippedAvatarHookSource above) so a comment that merely describes a
    // `new MediaRecorder(...)` call cannot count as one.
    expect(
      recorderCalls.length,
      "expected at least one `new MediaRecorder(...)` call across the useAvatar* hook family"
    ).toBeGreaterThan(0);
    for (const call of recorderCalls) {
      expect(call).toMatch(/streamRef\.current/);
    }
  });
});

describe("likeness training poll: cold-start + backgrounded-tab hardening (source scan)", () => {
  // The instructor-reported defect: opening the app after a "your avatar is
  // ready" email, seeing "Training in progress", and reloading within the
  // poll interval never called the provider at all - the poll effect had no
  // leading immediate call, unlike useAvatarVideo.ts's poll (its correct
  // precedent). A second, silent defect rode along: a poll result carrying
  // `{ error }` (e.g. an expired/rotated/missing TAVUS_API_KEY) was
  // discarded outright, making a broken integration indistinguishable from
  // "still training" forever.
  //
  // Like the "frame-rate pre-flight" and "training footage" scans above,
  // this effect lives inside a useEffect - not a useCallback wired to a UI
  // action - and depends on setInterval/document.visibilitychange timing
  // vitest's node environment (no jsdom) cannot exercise. These guarantees
  // are proven by reading the shape of the source, the same technique the
  // rest of this file already uses for the useAvatar* hook family, so a
  // regression here fails a named test instead of only breaking a comment's
  // promise.
  const recordingDir = path.resolve(process.cwd(), "src/app/components/recording");
  const avatarHookFileNames = fs
    .readdirSync(recordingDir)
    .filter((f) => /^useAvatar.*\.ts$/.test(f) && !f.endsWith(".test.ts"));
  const avatarHookSources = avatarHookFileNames.map((f) => ({
    name: f,
    content: fs.readFileSync(path.join(recordingDir, f), "utf-8"),
  }));

  it("finds the useAvatar* hook family on disk - a scan over nothing proves nothing", () => {
    expect(avatarHookFileNames.length).toBeGreaterThan(0);
  });

  // Locates the ONE effect body that schedules the likeness poll (identified
  // by its distinguishing first statement AND keyed on [nonTerminalIds]),
  // rather than hardcoding "useAvatarTraining.ts" - a rename or a further
  // split still finds the right effect, and finding zero or more than one is
  // a named failure rather than a silently vacuous scan (see the
  // extractCallback hole-2 lesson above, same file). Anchoring on the
  // guard-clause first statement matters: this file also has an EARLIER,
  // unrelated useEffect (the mount-time fetch), and a lazy `[\s\S]*?` that
  // merely looks for "starts with useEffect and contains LIKENESS_POLL_MS
  // somewhere before the next [nonTerminalIds] close" matches from THAT
  // earlier effect's opening brace all the way through to the poll effect's
  // close, swallowing everything in between - caught by sabotage while
  // writing this guard, not a hypothetical.
  function findLikenessPollEffect(): string {
    const pattern =
      /useEffect\(\(\) => \{\s*\n\s*if \(nonTerminalIds\.length === 0\) return;[\s\S]*?\n {2}\}, \[nonTerminalIds\]\);/;
    const matches: { file: string; body: string }[] = [];
    for (const { name, content } of avatarHookSources) {
      const match = content.match(pattern);
      if (match) matches.push({ file: name, body: match[0] });
    }
    if (matches.length === 0) {
      throw new Error(
        `expected to find the LIKENESS_POLL_MS poll effect (keyed on [nonTerminalIds]) in one of: ${avatarHookFileNames.join(", ")}`
      );
    }
    if (matches.length > 1) {
      throw new Error(
        `expected exactly ONE likeness poll effect across the useAvatar* family, found ${matches.length}: ${matches.map((m) => m.file).join(", ")}`
      );
    }
    return matches[0].body;
  }

  it("finds exactly one likeness poll effect to check - a check over nothing proves nothing", () => {
    expect(findLikenessPollEffect().length).toBeGreaterThan(0);
  });

  it("polls immediately on mount/dependency-change, before the interval's first tick (cold-start hole)", () => {
    const body = findLikenessPollEffect();
    const leadingCallIdx = body.search(/\bvoid poll\(\);\s*\n\s*const timer = setInterval/);
    expect(
      leadingCallIdx,
      "expected a leading `void poll();` call immediately before `const timer = setInterval(...)`, matching useAvatarVideo.ts's poll effect"
    ).toBeGreaterThan(-1);
  });

  it("surfaces a poll `{ error }` result instead of discarding it (defect 2)", () => {
    const body = findLikenessPollEffect();
    // The old code's error branch was `if (!("error" in r)) { ...update... }`
    // with nothing in the else - so an `{ error }` result vanished with no
    // state change, no note, no console. The branch must now do something
    // observable with the error string, through the same likenessesError
    // channel the panel already renders for every other likeness error.
    const errorBranchStart = body.search(/if\s*\(\s*"error"\s*in\s*r\s*\)\s*\{/);
    expect(errorBranchStart, 'expected an `if ("error" in r) { ... }` branch').toBeGreaterThan(-1);
    const elseIdx = body.indexOf("} else {", errorBranchStart);
    expect(elseIdx, "expected a paired else branch for the success case").toBeGreaterThan(errorBranchStart);
    const errorBranchBody = body.slice(errorBranchStart, elseIdx);
    expect(errorBranchBody).toMatch(/setLikenessesError\(\s*r\.error\s*\)/);
  });

  it("adds AND removes a visibilitychange listener that re-polls only on becoming visible (AC2)", () => {
    const body = findLikenessPollEffect();
    expect(body).toMatch(/document\.addEventListener\(\s*["']visibilitychange["']/);
    expect(body).toMatch(/document\.removeEventListener\(\s*["']visibilitychange["']/);
    // Gated on becoming visible specifically - an ungated handler would also
    // fire (and poll) when the tab goes hidden, which AC2 forbids.
    expect(body).toMatch(/visibilityState\s*===\s*["']visible["']/);
  });

  it("removes in cleanup the SAME listener function reference that was added on setup", () => {
    const body = findLikenessPollEffect();
    const addMatch = body.match(/document\.addEventListener\(\s*["']visibilitychange["']\s*,\s*(\w+)/);
    const removeMatch = body.match(/document\.removeEventListener\(\s*["']visibilitychange["']\s*,\s*(\w+)/);
    expect(addMatch, "expected addEventListener(\"visibilitychange\", <fn>)").not.toBeNull();
    expect(removeMatch, "expected removeEventListener(\"visibilitychange\", <fn>)").not.toBeNull();
    expect(addMatch![1]).toBe(removeMatch![1]);
  });
});
