// Pure module - no React, no browser globals used at import time - so it can
// be unit tested under vitest's node environment. See avatar-script.test.ts
// for the contract this file exists to satisfy.

/** Speaking stage target length, in seconds. Kept equal to the stillness
 * target by design (see the ratio test): the live Tavus docs disagree on
 * TOTAL sample length (30+30 on one page, "1.5-2 min optimal" on another,
 * "two minutes" on a third), but the 1:1 speaking-to-stillness structure is
 * consistent across all of them. 60+60 lands inside the documented optimal
 * band. If training ever fails with a duration-related error, dropping both
 * constants to 30 is meant to be a one-line change. */
export const AVATAR_SPEAKING_SECONDS = 60;

/** Stillness stage target length, in seconds. See AVATAR_SPEAKING_SECONDS. */
export const AVATAR_STILLNESS_SECONDS = 60;

/** One stage of the guided sample script. `body` is what the subject reads
 * aloud (empty for the stillness stage, which is deliberately silent).
 * `instruction` is on-screen guidance shown alongside `body`. */
export interface AvatarScriptStage {
  id: "speaking" | "stillness";
  label: string;
  instruction: string;
  body: string;
  targetSeconds: number;
}

const AVATAR_SPEAKING_BODY = [
  "Hi, I am recording this short video so an AI system can learn what I look",
  "like and sound like when I talk. Let me read a few different kinds of",
  "sentences so it can hear a wide range of sounds and see a wide range of",
  "expressions. Short bursts first: Stop. Go. Wait right there. Now something",
  "longer and more descriptive, the kind of sentence that paints a picture,",
  "like a quiet street lined with tall trees just after the rain has stopped",
  "falling. Numbers matter too, so here are a few: three, seventeen,",
  "forty-two, and one hundred and six. Questions change my face, do not",
  "they? What time is it? Are you ready for this? Now for some energy: that",
  "is fantastic news, I honestly cannot wait to share it with everyone! And",
  "to close, something calm and measured, spoken slowly, the way I might",
  "walk a student through an idea that needs a moment to sink in. Thanks for",
  "sticking with me through all of that.",
].join(" ");

/** The two ordered, labelled stages Tavus documents for training footage.
 * Order matters - speaking first, then stillness - and is asserted by the
 * test suite. */
export const AVATAR_SCRIPT_STAGES: AvatarScriptStage[] = [
  {
    id: "speaking",
    label: "Speaking",
    instruction:
      "Look at the camera lens, not the screen, and read the passage below aloud at a natural, conversational pace. Let your normal expressions come through.",
    body: AVATAR_SPEAKING_BODY,
    targetSeconds: AVATAR_SPEAKING_SECONDS,
  },
  {
    id: "stillness",
    label: "Stillness",
    instruction:
      "Recording keeps running - there is nothing to read here. Stay silent and still for about a minute: relax your face, keep your lips closed, and keep looking at the camera lens without speaking or moving around.",
    body: "",
    targetSeconds: AVATAR_STILLNESS_SECONDS,
  },
];

/** Sum of every stage's target, in seconds - the minimum a take must run
 * before it can be submitted for training. */
export function avatarScriptTotalSeconds(): number {
  return AVATAR_SCRIPT_STAGES.reduce((total, stage) => total + stage.targetSeconds, 0);
}

/** The in-app consent affirmation, stored on the likeness row (never sent to
 * Tavus - consent_video_url is documented Legacy and consent_phrase_mismatch
 * is a retired error, so scripting a spoken consent line into the footage
 * would break the documented segment structure for a validator that no
 * longer exists). */
export const AVATAR_CONSENT_ACKNOWLEDGEMENT =
  "I confirm that I am the person shown in this recording, and I consent to a digital likeness of me being trained from it and used to generate AI avatar videos on my behalf.";

/** Tavus's documented cap on training footage size. */
export const AVATAR_SAMPLE_MAX_BYTES = 750 * 1024 * 1024;

export interface AvatarMimeChoice {
  mimeType: string;
  /** True when the browser could only offer a VP8/VP9 webm container. Tavus
   * documents an H.264 + AAC requirement; a webm recorded with a real
   * MediaRecorder is very likely to be VP8/VP9 + Opus, which may only be
   * rejected with a video_codec training error AFTER the multi-hour round
   * trip. The caller must warn the user before training starts. */
  isRiskyCodec: boolean;
}

/** Negotiation order for AC1.5b: prefer H.264 mp4 (what Tavus documents),
 * fall back to a plain mp4 container, then to webm variants as a last
 * resort. Mirrors the shape of useRecorder.ts's pickMimeType, with the
 * avc1-hinted mp4 entry added first and each candidate flagged for risk. */
const AVATAR_MIME_CANDIDATES: AvatarMimeChoice[] = [
  { mimeType: "video/mp4;codecs=avc1", isRiskyCodec: false },
  { mimeType: "video/mp4", isRiskyCodec: false },
  { mimeType: "video/webm;codecs=vp9,opus", isRiskyCodec: true },
  { mimeType: "video/webm", isRiskyCodec: true },
];

/** Picks the best container/codec this browser can actually produce, in the
 * documented preference order. `supportsType` is injected (rather than
 * calling MediaRecorder.isTypeSupported directly) so this stays a pure,
 * unit-testable function; the real recorder passes
 * `MediaRecorder.isTypeSupported`. Returns null when nothing usable is
 * offered. */
export function pickAvatarMimeType(
  supportsType: (mimeType: string) => boolean
): AvatarMimeChoice | null {
  for (const candidate of AVATAR_MIME_CANDIDATES) {
    if (supportsType(candidate.mimeType)) {
      return { mimeType: candidate.mimeType, isRiskyCodec: candidate.isRiskyCodec };
    }
  }
  return null;
}

// AC1.4 (training footage must be the untouched getUserMedia stream, never a
// canvas composite) used to be encoded as a runtime function here
// (avatarRecorderStreamSource) that the recorder called before every take.
// It was deleted: the avatar capture hook (useAvatarStudio.ts) has no
// pipeline canvas anywhere to swap in in the first place - unlike
// useRecorder.ts's startRecording, which does have one and must choose not
// to use it - so a runtime check in this view had nothing to actually
// branch on and could never fail. The property is now enforced statically
// by a source-scan test in avatar-script.test.ts, which reads
// useAvatarStudio.ts and fails if it ever references the canvas effects
// pipeline or constructs a MediaRecorder from anything but the raw stream
// ref.
