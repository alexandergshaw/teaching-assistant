"use client";

// The screen-source acquisition seam useRecorder.ts's startPreview delegates
// to for the "screen" branch only: requesting the display stream with AC4's
// hints, classifying whatever display-audio grant comes back into AC5's
// three-state notice, and separately requesting the mic (D1: never added as
// a second track on the display stream - MediaRecorder encodes only a
// stream's first audio track). Kept out of a subdirectory deliberately -
// recording-split.structure.test.ts's readdirSync is non-recursive, so a
// subdirectory would escape both the line cap and the localStorage-key scan.

// AC5 row 2's "offered, none granted" notice. Exported so a consumer that
// needs to recognize this exact state (StagePanel's `Share again` recovery
// action gates on it) imports the string instead of restating it - a
// one-character copy edit in either place would otherwise silently desync
// the two and remove the recovery action with every gate green (S2).
// Re-exported from useRecorder.ts so StagePanel.tsx's existing import keeps
// resolving without edits to that file.
export const SCREEN_AUDIO_NOT_GRANTED_NOTICE =
  "System audio was not shared. It has to be ticked in the browser's share dialog, and it is only offered for a tab or a whole screen.";

// Chrome/Edge offer a "share audio" checkbox in the getDisplayMedia picker;
// Firefox/Safari never do (survey-confirmed, AC5). No capability query
// exists for this, so it is UA-sniffed; failing toward "not offered" avoids
// blaming the user for a control they never saw.
export function browserMayOfferDisplayAudio(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Chrome|Chromium|Edg\//.test(navigator.userAgent) && !/Firefox/.test(navigator.userAgent);
}

export interface DisplayAudioGrant {
  // Whether the caller should keep the granted track feeding the mix. False
  // means the caller must stop the track immediately (AC5: a checkbox that
  // reads "on" while nothing is being mixed is a lie, and a track nothing
  // will use should not keep capturing).
  keepTrack: boolean;
  notice: string | null;
}

/**
 * AC5's three-state classification, pure and testable: given whether the
 * browser granted a display audio track at all and whether the "Share
 * system audio" checkbox is on, decides the notice text (or null, when
 * system audio is actually in the mix and there is nothing to say) and
 * whether the caller should keep the granted track.
 */
export function classifyDisplayAudioGrant(
  hasTrack: boolean,
  shareSystemAudio: boolean,
  browserOffersDisplayAudio: boolean
): DisplayAudioGrant {
  if (!hasTrack) {
    return {
      keepTrack: false,
      notice: shareSystemAudio
        ? browserOffersDisplayAudio
          ? SCREEN_AUDIO_NOT_GRANTED_NOTICE
          : "This browser does not share system audio. Your microphone is still being recorded."
        : "System audio is off - only your microphone is being recorded.",
    };
  }
  if (shareSystemAudio) {
    return { keepTrack: true, notice: null };
  }
  // Granted but the checkbox is off - the caller stops it immediately
  // rather than keeping capturing audio nothing will use.
  return {
    keepTrack: false,
    notice: "System audio is off - only your microphone is being recorded.",
  };
}

// AC4's explicit hints, pinned as a constant rather than inlined at the call
// site. System audio must not go through voice DSP - noise suppression on a
// shared tab destroys music and speech in the shared content. The mic keeps
// its own DSP settings, requested separately via acquireScreenShareMicTrack.
export const SCREEN_SHARE_CONSTRAINTS = {
  video: { displaySurface: "monitor" as const, frameRate: { ideal: 30 } },
  audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
};

export async function requestScreenShareStream(): Promise<MediaStream> {
  const displayMediaDevices = navigator.mediaDevices as unknown as {
    getDisplayMedia: (constraints: { video: unknown; audio: unknown }) => Promise<MediaStream>;
  };
  return displayMediaDevices.getDisplayMedia(SCREEN_SHARE_CONSTRAINTS);
}

export interface MicDspOptions {
  noiseSuppression: boolean;
  echoCancellation: boolean;
  autoGain: boolean;
}

/**
 * D1: the mic for a screen recording is requested SEPARATELY from
 * getDisplayMedia and returned for the caller to hold on its own ref, never
 * `stream.addTrack`'d onto the display stream - MediaRecorder encodes only a
 * stream's first audio track. Returns null (never throws) when no mic is
 * selected or the request fails, matching startPreview's existing
 * swallow-and-warn behaviour.
 */
export async function acquireScreenShareMicTrack(
  micId: string,
  dsp: MicDspOptions
): Promise<MediaStreamTrack | null> {
  if (!micId || micId === "off") return null;
  try {
    const audioStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: { exact: micId },
        noiseSuppression: dsp.noiseSuppression,
        echoCancellation: dsp.echoCancellation,
        autoGainControl: dsp.autoGain,
      },
    });
    return audioStream.getAudioTracks()[0] ?? null;
  } catch (err) {
    console.warn("Could not add selected mic to screen share:", err);
    return null;
  }
}
