// Frame-rate measurement, extracted into its own module so every
// measurement session holds its OWN state in local closures - nothing here
// is shared between calls.
//
// This exists to fix a real defect: the sampling state used to live at the
// useAvatarStudio.ts HOOK level (frameSamplesRef / rvfcHandleRef, shared
// singletons). "Start camera" stays visually clickable for the whole
// getUserMedia await (captureState only flips once the promise resolves),
// so double-clicking it - the obvious thing to do when a button appears to
// do nothing during a permission prompt - started TWO overlapping
// measurement sessions that both pushed into the same samples array and
// both fought over the same callback handle. The result read roughly
// DOUBLE the camera's true rate: a 12-15fps camera measured as 24-30fps and
// was waved through. Every call to startFrameRateSampling below gets a
// fresh set of local variables, so two overlapping calls cannot interfere
// with each other even if a caller forgets to guard re-entry (see
// useAvatarStudio.ts's startCapturePreview, which also guards re-entry
// directly and disables its button while starting, as defence in depth).
//
// See docs/avatar-training-frame-rate-acceptance-criteria.md for the
// wider feature, and avatar-script.ts for the pure classification rules
// (classifyAvatarFrameRate, mergeAvatarFrameRateAssessment) this module is
// just a DOM-facing driver for - no threshold or wording logic lives here.

import {
  AVATAR_FRAME_RATE_SAMPLE_WINDOW_MS,
  AVATAR_FRAME_RATE_TIMEOUT_SLACK_MS,
  AVATAR_FRAME_RATE_RECHECK_DELAY_MS,
  avatarFrameRateFromSamples,
  classifyAvatarFrameRate,
  type AvatarFrameRateVerdict,
} from "./avatar-script";

export interface FrameRateSamplingHandlers {
  /** Called whenever a fresh, concrete verdict is available - once for the
   * initial window, and again if a mid-take recheck lands (see
   * AVATAR_FRAME_RATE_RECHECK_DELAY_MS). Callers should combine successive
   * calls with avatar-script.ts's mergeAvatarFrameRateAssessment rather
   * than overwrite blindly, so a later improvement cannot erase an
   * earlier bad reading. */
  onVerdict: (verdict: AvatarFrameRateVerdict) => void;
  /** Called AT MOST ONCE, and only if onVerdict is never called first: no
   * verdict - measured or reported - could be produced before the sample
   * window (plus slack) elapsed, or the track ended before one landed. */
  onUnknown: () => void;
}

/**
 * Starts measuring the DELIVERED frame rate of `track` by counting real
 * frames presented to `video` (requestVideoFrameCallback), falling back to
 * track.getSettings().frameRate - the negotiated rate, a weaker claim, see
 * AvatarFrameRateSource - when rVFC is unavailable or too few real frames
 * arrive in the window. If a first verdict lands via rVFC, a second window
 * re-opens partway through (AVATAR_FRAME_RATE_RECHECK_DELAY_MS) to catch a
 * camera that degrades after the first window closes.
 *
 * Returns a cancel function that must be called on cleanup (track stopped,
 * component unmounted, a new measurement starting instead) - safe to call
 * more than once.
 */
export function startFrameRateSampling(
  video: HTMLVideoElement | null,
  track: MediaStreamTrack | undefined,
  handlers: FrameRateSamplingHandlers
): () => void {
  let cancelled = false;
  // True once a first outcome (verdict OR unknown) has been decided - see
  // settleFirstWindow. Only the FIRST window's race (sample vs. timeout vs.
  // track-ended) is gated on this; a later recheck verdict is a separate,
  // additive event and does not touch it.
  let settled = false;
  let activeRvfcHandle: number | null = null;
  let unknownTimer: ReturnType<typeof setTimeout> | null = null;
  let recheckTimer: ReturnType<typeof setTimeout> | null = null;

  const clearUnknownTimer = () => {
    if (unknownTimer !== null) {
      clearTimeout(unknownTimer);
      unknownTimer = null;
    }
  };

  const reportFallback = (): boolean => {
    const reported = track?.getSettings().frameRate;
    if (typeof reported !== "number") return false;
    handlers.onVerdict(classifyAvatarFrameRate(reported, "reported"));
    return true;
  };

  const canUseRvfc = !!video && typeof video.requestVideoFrameCallback === "function";

  // Opens one sampling window of `durationMs` and calls `onSettled` with
  // the measured rate (or null if rVFC is unavailable). Used for both the
  // initial window and the later recheck window.
  const sampleWindow = (durationMs: number, onSettled: (rate: number | null) => void) => {
    if (!video || typeof video.requestVideoFrameCallback !== "function") {
      onSettled(null);
      return;
    }
    const el = video;
    const samples: number[] = [];
    // Anchor the window on the FIRST FRAME's own timestamp, not on a separate
    // performance.now() read taken at registration. Two reasons, one
    // correctness and one testability:
    //
    // Correctness: registration-to-first-frame latency is not sampling time.
    // A camera that takes 500ms to deliver its first frame used to get only
    // 2500ms of real frames, and the shortfall read as a LOWER measured rate
    // rather than as a shorter window - a spurious "warn" on a healthy camera.
    // Anchoring here means the window always covers durationMs of actual
    // frames, and a camera too slow to fill it settles via unknownTimer as
    // genuinely unknown instead of reporting a wrong number confidently.
    //
    // Testability: rVFC timestamps come from the caller, so a second clock
    // read here put the window on a DIFFERENT timeline from the samples and
    // made the measured rate depend on real elapsed wall-clock time. That is
    // what made avatar-script.test.ts flake only under full-suite load - see
    // that file's note above the sampler tests.
    let windowStart: number | null = null;
    const onFrame: VideoFrameRequestCallback = (now) => {
      if (cancelled) return;
      if (windowStart === null) windowStart = now;
      samples.push(now);
      if (now - windowStart < durationMs) {
        activeRvfcHandle = el.requestVideoFrameCallback(onFrame);
        return;
      }
      activeRvfcHandle = null;
      onSettled(avatarFrameRateFromSamples(samples));
    };
    activeRvfcHandle = el.requestVideoFrameCallback(onFrame);
  };

  // Resolves the race for the FIRST window only: whichever of (a) a real
  // measurement/fallback settling, or (b) the unknown timeout, or (c) the
  // track ending, happens first wins; the other two become no-ops. Safe to
  // call more than once - only the first call after `settled` flips does
  // anything.
  const settleFirstWindow = (fn: () => void) => {
    if (settled) return;
    settled = true;
    clearUnknownTimer();
    if (activeRvfcHandle !== null) {
      video?.cancelVideoFrameCallback?.(activeRvfcHandle);
      activeRvfcHandle = null;
    }
    fn();
  };

  // Defect 2: if nothing settles the first window - measured or reported -
  // before the window plus slack elapses, stop leaving the caller (and so
  // the UI) reading "still checking" forever.
  unknownTimer = setTimeout(() => {
    settleFirstWindow(() => {
      if (!reportFallback()) handlers.onUnknown();
    });
  }, AVATAR_FRAME_RATE_SAMPLE_WINDOW_MS + AVATAR_FRAME_RATE_TIMEOUT_SLACK_MS);

  sampleWindow(AVATAR_FRAME_RATE_SAMPLE_WINDOW_MS, (rate) => {
    settleFirstWindow(() => {
      if (rate !== null) {
        handlers.onVerdict(classifyAvatarFrameRate(rate, "measured"));
        // Defect 4: only worth re-arming when rVFC actually produced this
        // verdict - the getSettings() fallback reports the NEGOTIATED
        // rate, which does not change with live conditions, so re-reading
        // it later would never catch a degradation.
        if (canUseRvfc) {
          recheckTimer = setTimeout(() => {
            if (cancelled) return;
            sampleWindow(AVATAR_FRAME_RATE_SAMPLE_WINDOW_MS, (recheckRate) => {
              // A failed recheck (recheckRate === null - e.g. the video
              // stopped presenting frames) is silently dropped rather than
              // reported as unknown: a real verdict from the first window
              // already exists by the time this runs, and onUnknown is
              // reserved for the FIRST window producing nothing at all -
              // regressing a real answer to a non-answer here would be a
              // net loss of information, not a gain.
              if (cancelled || recheckRate === null) return;
              handlers.onVerdict(classifyAvatarFrameRate(recheckRate, "measured"));
            });
          }, AVATAR_FRAME_RATE_RECHECK_DELAY_MS);
        }
      } else if (!reportFallback()) {
        handlers.onUnknown();
      }
    });
  });

  // Defect 2: a camera that disappears (unplugged, seized by another app)
  // before a first verdict has landed must not be left reading as still
  // checking. Once a verdict HAS landed, this is intentionally a no-op -
  // camera loss after that point is a different, unrelated concern
  // (recording/stream teardown elsewhere), not something this module
  // speaks to.
  const onEnded = () => {
    settleFirstWindow(() => handlers.onUnknown());
  };
  track?.addEventListener("ended", onEnded);

  return () => {
    cancelled = true;
    clearUnknownTimer();
    if (recheckTimer !== null) {
      clearTimeout(recheckTimer);
      recheckTimer = null;
    }
    if (activeRvfcHandle !== null) {
      video?.cancelVideoFrameCallback?.(activeRvfcHandle);
      activeRvfcHandle = null;
    }
    track?.removeEventListener("ended", onEnded);
  };
}
