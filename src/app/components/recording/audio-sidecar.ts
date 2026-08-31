// AC22a: while a take is recording, a second MediaRecorder runs on the mixed
// audio track alone so a transcript/announcement can be produced instantly
// afterward, instead of paying extractAudioOnly's wall-clock real-time replay
// cost. It rotates - stops the current recorder and immediately starts a
// fresh one on the same underlying track - at `rotateSeconds`, the same
// idiom useLiveTranscription.ts uses for its segmented fallback: a WebM/Opus
// fragment after the first is not independently decodable, so a single long
// recording cannot be sliced after the fact, and decoding a 20-40 minute
// blob in one `decodeAudioData` call is an out-of-memory risk. The segments
// this produces ARE the transcription chunks - no further slicing needed.
//
// Rotation is driven by startFrameTicker, not setInterval or rAF, because a
// hidden tab is exactly when a screen recording runs and both of those are
// throttled there.

import { startFrameTicker, type FrameTicker } from "@/lib/frame-ticker";

export interface AudioSidecar {
  pause: () => void;
  resume: () => void;
  stop: () => Promise<Blob[]>;
}

// Conceptually the same cadence as src/lib/take-transcript.ts's
// TRANSCRIBE_CHUNK_SECONDS, duplicated rather than imported: this module only
// knows how to rotate a recorder, not how transcription chunks are planned,
// and the two concerns are owned by different parts of the feature.
const DEFAULT_ROTATE_SECONDS = 60;

// S5: stop() previously had no timeout at all - it resolved only from the
// in-flight recorder's onstop, with no guarantee that onstop ever fires
// (see the caller-tick race described where stop() is called). useRecorder
// awaits stop() BEFORE building and publishing the Take, so a promise that
// never settles loses the whole video take, not just the audio convenience.
// This bounds the wait: if onstop has not landed within this window, resolve
// with whatever segments are already collected instead of hanging forever.
// MediaRecorder's onstop normally fires within milliseconds of stop(), so
// this is generous without making a real failure feel slow.
const STOP_TIMEOUT_MS = 1500;

export function startAudioSidecar(
  track: MediaStreamTrack,
  mimeType: string,
  rotateSeconds: number = DEFAULT_ROTATE_SECONDS,
): AudioSidecar | null {
  try {
    const stream = new MediaStream([track]);
    const segments: Blob[] = [];
    let currentRecorder: MediaRecorder | null = null;
    let ticker: FrameTicker | null = null;
    let stopped = false;
    // Set only while an explicit stop() is waiting on the in-flight
    // recorder's onstop to fire - never during an ordinary rotation, so a
    // rotation's onstop does not resolve a stop() that has not been called.
    let onStoppedForGood: (() => void) | null = null;
    // S6: the specific recorder instance the current stop() call targeted
    // (recorder.stop() was invoked on it), if any. A rotation's OLD
    // recorder must never resolve a stop() that landed on the NEW recorder
    // rotate() already started in its place - see the race in stop() below.
    let stopTargetRecorder: MediaRecorder | null = null;

    const startSegment = () => {
      const chunks: Blob[] = [];
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorder.ondataavailable = (evt) => {
        if (evt.data.size > 0) chunks.push(evt.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" });
        if (blob.size > 0) segments.push(blob);
        if (currentRecorder === recorder) currentRecorder = null;
        // S6: only fire the stop() callback if THIS recorder is the one
        // stop() actually targeted. Without this check, a rotation's old
        // recorder - stopped by rotate() just before a concurrent stop()
        // call retargets currentRecorder to the recorder rotate() just
        // started - would resolve stop()'s promise with segments that do
        // not yet include the new (target) recorder's blob.
        if (stopTargetRecorder === recorder) {
          onStoppedForGood?.();
        }
      };
      // Deliberately no timeslice: one self-contained blob with its own
      // header per segment, rather than a headerless mid-stream fragment.
      recorder.start();
      currentRecorder = recorder;
    };

    const rotate = () => {
      const old = currentRecorder;
      currentRecorder = null;
      if (old && old.state !== "inactive") old.stop();
      if (!stopped) startSegment();
    };

    startSegment();
    ticker = startFrameTicker(1 / rotateSeconds, rotate);

    return {
      // AC22a-bis: pause/resume must drive BOTH recorders, or the sidecar
      // records straight through a pause and its audio runs longer than the
      // video take, desynchronizing every future transcript chunk plan.
      // MediaRecorder excludes a paused interval from its own output, so
      // pausing/resuming the currently-open segment recorder - not merely
      // suspending the rotation ticker - is what keeps the sidecar's total
      // captured duration equal to the video's. (Card-mute periods are
      // different and deliberately NOT handled here: that flips `enabled` on
      // the mic source track while both recorders keep running, so the
      // sidecar correctly records those seconds as silence rather than
      // dropping them - see useRecorder.ts.)
      pause: () => {
        ticker?.stop();
        ticker = null;
        if (currentRecorder && currentRecorder.state === "recording") {
          currentRecorder.pause();
        }
      },
      resume: () => {
        if (stopped || ticker) return;
        if (currentRecorder && currentRecorder.state === "paused") {
          currentRecorder.resume();
        }
        ticker = startFrameTicker(1 / rotateSeconds, rotate);
      },
      stop: () =>
        new Promise<Blob[]>((resolve) => {
          stopped = true;
          ticker?.stop();
          ticker = null;
          const recorder = currentRecorder;
          if (!recorder || recorder.state === "inactive") {
            // FIX 4: same class of bug S5's snapshot closed below - resolving
            // the LIVE array hands the caller a reference that a later
            // rotation's onstop (or another stop() path) can still push onto
            // after this promise has already settled and a Take may already
            // have been built from it.
            resolve(segments.slice());
            return;
          }
          stopTargetRecorder = recorder;
          let settled = false;
          const finish = () => {
            if (settled) return;
            settled = true;
            // Snapshot rather than hand back the live array: S5's timeout
            // path can resolve before this instance's own onstop lands, and
            // if it fires later it must not silently mutate a Take that was
            // already built from this result.
            resolve(segments.slice());
          };
          onStoppedForGood = finish;
          // S5: bound the wait - see STOP_TIMEOUT_MS's comment for why
          // onstop is not guaranteed to fire promptly, or at all.
          setTimeout(finish, STOP_TIMEOUT_MS);
          recorder.stop();
        }),
    };
  } catch (err) {
    // The video recording is the product; the audio sidecar is a
    // convenience. It must never take the video take down with it.
    console.error("Could not start the audio sidecar:", err);
    return null;
  }
}
