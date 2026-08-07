// TDD - written from the AC BEFORE implementation (avatar-likeness work item).
// Currently FAILS: src/app/components/recording/avatar-script.ts does not exist.
// Make these pass without changing what they assert.
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  AVATAR_SPEAKING_SECONDS,
  AVATAR_STILLNESS_SECONDS,
  AVATAR_SCRIPT_STAGES,
  AVATAR_SAMPLE_MAX_BYTES,
  AVATAR_CONSENT_ACKNOWLEDGEMENT,
  avatarScriptTotalSeconds,
  pickAvatarMimeType,
} from "./avatar-script";

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
  // the recorder at runtime. Instead this scans the source of the hook that
  // owns the real `new MediaRecorder(...)` call - the same technique
  // recording-split.structure.test.ts uses for its own cross-file
  // guarantees - so a rewrite that feeds the recorder a canvas stream
  // actually fails a test instead of only failing a comment's promise.
  const useAvatarStudioSource = fs.readFileSync(
    path.resolve(process.cwd(), "src/app/components/recording/useAvatarStudio.ts"),
    "utf-8"
  );

  it("never imports or references the canvas effects pipeline", () => {
    expect(useAvatarStudioSource).not.toMatch(/useCanvasPipeline/);
  });

  it("never calls captureStream on anything", () => {
    // The only way a canvas composite reaches a MediaRecorder is via
    // someCanvas.captureStream(...). If this string appears anywhere in the
    // file, something is capturing a canvas rather than using the raw
    // getUserMedia stream.
    expect(useAvatarStudioSource).not.toMatch(/captureStream/);
  });

  it("constructs every MediaRecorder from the raw stream ref, never a captured stream", () => {
    const recorderCalls = useAvatarStudioSource.match(/new MediaRecorder\([\s\S]*?\)/g) ?? [];
    // If this hook ever stops constructing a MediaRecorder at all, that is
    // itself a change worth this test failing on, rather than three
    // assertions silently checking zero calls.
    expect(recorderCalls.length).toBeGreaterThan(0);
    for (const call of recorderCalls) {
      expect(call).toMatch(/streamRef\.current/);
    }
  });
});
