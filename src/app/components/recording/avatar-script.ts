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

// ---------------------------------------------------------------------------
// Frame rate pre-flight. Tavus rejects training footage below 23fps, but
// only AFTER the multi-hour training round trip - the same "post-mortem
// only" shape isRiskyCodec exists to fix for codec. getUserMedia's `ideal`
// hint has no floor (a webcam in dim light routinely halves its capture
// rate as auto-exposure lengthens, and the browser reports success anyway),
// and track.getSettings().frameRate reports what was NEGOTIATED, not what
// is actually being delivered - a camera that negotiated 30fps and is
// currently delivering 12fps still reports 30, which is exactly the case
// that produces the rejection. Real frames must be counted (via
// requestVideoFrameCallback on the preview element, see useAvatarStudio.ts);
// getSettings() is kept only as a clearly-labelled fallback for browsers
// without that API. See docs/avatar-training-frame-rate-acceptance-criteria.md.

/** Tavus's own documented floor ("at least 23fps") - almost certainly 23
 * rather than 24 to admit 23.976fps (24000/1001), a standard cinema rate a
 * naive `>= 24` check would incorrectly reject. This is a hard floor: Tavus
 * enforces it server-side regardless of what this app asks for. */
export const AVATAR_MIN_FRAME_RATE = 23;

/** The frame rate requested as `ideal` from getUserMedia, and the rate this
 * app treats as "no reason for concern". Kept as a SEPARATE constant from
 * AVATAR_MIN_FRAME_RATE - one is a hard floor the provider enforces, the
 * other is only ever a soft request a camera is free to ignore - so do not
 * collapse them into one number even though 30 currently sits comfortably
 * above 23. */
export const AVATAR_TARGET_FRAME_RATE = 30;

/** How long to sample requestVideoFrameCallback before trusting the
 * measured rate. Long enough to smooth over one slow frame (a single
 * stutter must not read as a sustained drop); short enough that a user
 * previewing the camera is not kept waiting for a verdict. */
export const AVATAR_FRAME_RATE_SAMPLE_WINDOW_MS = 3000;

/** Extra time allowed, on top of AVATAR_FRAME_RATE_SAMPLE_WINDOW_MS, before
 * giving up on a first verdict and reporting AVATAR_FRAME_RATE_UNKNOWN_ASSESSMENT
 * instead. Covers the gap between the sampling window logically closing and
 * the fallback getSettings() read actually running - without slack, a
 * sampler that is a few milliseconds slow to settle would read as "stuck
 * checking forever" rather than as a real answer arriving a little late. */
export const AVATAR_FRAME_RATE_TIMEOUT_SLACK_MS = 2000;

/** When to open a SECOND sampling window during a take, on top of the one
 * opened the instant the camera starts. A single window at t=0 overlaps
 * auto-exposure convergence and cannot see a camera that starts at 30fps
 * and settles to 12fps once the take is under way in dim light - exactly
 * the mechanism the acceptance criteria doc names as the likeliest cause
 * of the original rejection. Roughly the midpoint of the speaking stage:
 * late enough that exposure has settled, early enough that a downgrade is
 * still caught well before the take ends. */
export const AVATAR_FRAME_RATE_RECHECK_DELAY_MS = 12000;

/** Where a frame rate figure came from. "measured" means counted from real
 * frames via requestVideoFrameCallback; "reported" means read from
 * track.getSettings().frameRate, which is the browser's NEGOTIATED rate,
 * not a live measurement - see the module-level note above. Callers must
 * present "reported" as the weaker of the two claims. */
export type AvatarFrameRateSource = "measured" | "reported";

/** A CONCRETE frame-rate classification - the result of actually being
 * able to say something about the rate (measured or reported). See
 * AvatarFrameRateAssessment for the wider type that also covers being
 * unable to say anything at all. */
export interface AvatarFrameRateVerdict {
  status: "ok" | "warn" | "block";
  source: AvatarFrameRateSource;
  /** Rounded for display. Every branch except "block" rounds to the
   * nearest tenth; "block" rounds DOWN (see classifyAvatarFrameRate) so
   * the displayed figure can never read as having reached the very floor
   * it is being described as falling short of. */
  rate: number;
  /** Populated for "warn" and "block"; null for "ok", where there is
   * nothing to explain. */
  reason: string | null;
}

/** The camera could not be assessed at all before the caller gave up
 * waiting: neither a real measurement nor even the negotiated
 * getSettings() figure arrived, or the track ended first. Distinct from
 * "still checking", which callers represent as `null` (see
 * useAvatarStudio.ts's frameRateAssessment) - this is a terminal, explicit
 * "we do not know", not an in-progress state. Deliberately NOT a "block":
 * see AVATAR_FRAME_RATE_UNKNOWN_ASSESSMENT for why. */
export interface AvatarFrameRateUnknownAssessment {
  status: "unknown";
  reason: string;
}

/** Either a concrete verdict, or an explicit "could not verify" - see
 * AvatarFrameRateUnknownAssessment. `null` (used by callers, not part of
 * this type) is reserved for "still checking, no answer yet". */
export type AvatarFrameRateAssessment = AvatarFrameRateVerdict | AvatarFrameRateUnknownAssessment;

/** Shown when nothing could be determined before the sample window (plus
 * slack) elapsed, or the camera disappeared first (see
 * AVATAR_FRAME_RATE_TIMEOUT_SLACK_MS and frameRateSampler.ts's track
 * "ended" handling). This WARNS rather than blocks: Save is only gated on
 * status === "block" (see useAvatarStudio.ts's saveTake), deliberately -
 * a browser/camera combination that cannot be measured here (no
 * requestVideoFrameCallback AND no reported frameRate, or a camera that
 * keeps vanishing) would hit this on every future attempt too, and
 * blocking Save on it would leave that user permanently unable to record
 * at all. That is a worse failure than the bug this feature exists to fix
 * - one bad session, once - so the user is told plainly that this check
 * did not run and left to weigh the risk themselves. */
export const AVATAR_FRAME_RATE_UNKNOWN_ASSESSMENT: AvatarFrameRateUnknownAssessment = {
  status: "unknown",
  reason:
    "Could not verify the camera's frame rate before recording, so this check did not run - you are " +
    "proceeding without it. If the preview looks smooth this is usually fine, but if the training video is " +
    "later rejected for frame rate, try a different browser or camera.",
};

/**
 * Turns a series of requestVideoFrameCallback timestamps (each callback's
 * `now` argument, in milliseconds, in arrival order) into a frames-per-
 * second figure. Returns null - rather than a misleading number - when
 * there is not enough data to say anything: fewer than two samples, or
 * samples that do not span any measurable time.
 */
export function avatarFrameRateFromSamples(timestampsMs: number[]): number | null {
  if (timestampsMs.length < 2) return null;
  const elapsedMs = timestampsMs[timestampsMs.length - 1] - timestampsMs[0];
  if (elapsedMs <= 0) return null;
  const frameIntervals = timestampsMs.length - 1;
  return (frameIntervals / elapsedMs) * 1000;
}

/**
 * Classifies a frame rate figure against Tavus's floor and this app's
 * target, folding in whether the figure was actually measured or only
 * reported (see AvatarFrameRateSource). The block/warn/ok boundaries do not
 * shift with source - only the wording of `reason` does - so a "reported"
 * figure is never presented with the confidence of a measurement, but a low
 * reported figure is still worth warning about (a camera that cannot even
 * negotiate the floor is not going to deliver it either).
 */
export function classifyAvatarFrameRate(
  rate: number,
  source: AvatarFrameRateSource
): AvatarFrameRateVerdict {
  const verb = source === "measured" ? "delivering" : "reporting";
  if (rate < AVATAR_MIN_FRAME_RATE) {
    // Floor, never round, here: Math.round could turn e.g. 22.96 into a
    // displayed "23.0", producing the self-contradictory "about 23fps,
    // below the 23fps minimum." Flooring guarantees the displayed figure
    // is always strictly less than the floor it is being compared to.
    const rounded = Math.floor(rate * 10) / 10;
    return {
      status: "block",
      source,
      rate: rounded,
      reason:
        `The camera is currently ${verb} about ${rounded} frames per second, below the ` +
        `${AVATAR_MIN_FRAME_RATE}fps minimum Tavus requires for training. This is usually caused by dim ` +
        `lighting - a camera's auto-exposure slows down to compensate in low light, which lowers the frame ` +
        `rate even though the picture still looks fine. Move to a brighter, more evenly lit space, then record ` +
        `a new take.`,
    };
  }
  const rounded = Math.round(rate * 10) / 10;
  if (rate < AVATAR_TARGET_FRAME_RATE) {
    return {
      status: "warn",
      source,
      rate: rounded,
      reason:
        `The camera is currently ${verb} about ${rounded} frames per second - above the ` +
        `${AVATAR_MIN_FRAME_RATE}fps minimum but below the ${AVATAR_TARGET_FRAME_RATE}fps target. Brighter, ` +
        `more even lighting will help keep the rate from dropping further once recording starts.`,
    };
  }
  return { status: "ok", source, rate: rounded, reason: null };
}

const AVATAR_FRAME_RATE_STATUS_RANK: Record<AvatarFrameRateVerdict["status"], number> = {
  ok: 0,
  warn: 1,
  block: 2,
};

/**
 * Combines a newly-arrived frame-rate verdict with whatever was already
 * recorded, keeping only DOWNGRADES: `next` replaces `previous` only when
 * it is a STRICTLY WORSE status (ok -> warn -> block); an equal or better
 * `next` is discarded and `previous` is returned unchanged. This is what
 * lets a camera be re-checked partway through a take (see
 * AVATAR_FRAME_RATE_RECHECK_DELAY_MS) without a later improvement quietly
 * erasing an earlier bad reading - the footage already recorded during
 * the bad window does not get better because the camera's exposure
 * recovered afterwards.
 */
export function mergeAvatarFrameRateAssessment(
  previous: AvatarFrameRateVerdict,
  next: AvatarFrameRateVerdict
): AvatarFrameRateVerdict {
  return AVATAR_FRAME_RATE_STATUS_RANK[next.status] > AVATAR_FRAME_RATE_STATUS_RANK[previous.status]
    ? next
    : previous;
}

// ---------------------------------------------------------------------------
// Resolution regression guard. Requesting frameRate as a hard `min` (above)
// gives the browser fewer degrees of freedom to satisfy at the requested
// 1920x1080: on a camera whose 1080p mode cannot sustain 23fps, the browser
// may satisfy the floor by silently dropping to a lower-resolution mode
// instead - trading a video_fps rejection for a resolution problem after
// the same multi-hour wait. Unlike frame rate, there is no Tavus error
// string pinning an exact resolution floor to enforce here: "at least
// 23fps" was taken verbatim from a real rejection message, but no
// comparable resolution rejection has ever been observed. So this is a
// WARN, surfaced for the user to judge, never a block - blocking on a
// number this app is only guessing at risks refusing footage Tavus would
// have accepted.

/** Tavus documents 1080p as a training-footage minimum (see AC1.5's
 * getUserMedia call, which requests it as `ideal`, same as frame rate used
 * to be). Used only to decide whether describeAvatarResolutionDrop has
 * something to say - not requested as a hard `min` constraint itself, for
 * the reason in the module comment above. */
export const AVATAR_MIN_TRAINING_HEIGHT = 1080;

/**
 * Warns when the camera settled on a resolution below the documented
 * minimum - the regression a hard frame-rate `min` constraint can cause
 * (see the module comment above). Returns null (nothing to say) at or
 * above it.
 */
export function describeAvatarResolutionDrop(height: number): string | null {
  if (height >= AVATAR_MIN_TRAINING_HEIGHT) return null;
  return (
    `The camera settled on ${height}p instead of the ${AVATAR_MIN_TRAINING_HEIGHT}p Tavus documents as a ` +
    `minimum for training footage - possibly because holding the frame rate above ${AVATAR_MIN_FRAME_RATE}fps ` +
    `pushed it into a lower-resolution mode. A brighter space, or a different camera, may let it hold both.`
  );
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
