// Mixes N audio tracks into ONE track via WebAudio, so MediaRecorder - which
// only ever encodes the FIRST audio track of a stream - gets a single track
// that actually carries every source. This is the fix for D1: a screen
// recording's mic used to be a second track on the display stream and was
// silently dropped from every take.
//
// Deliberately at unity gain: summing a hot mic and loud system audio can
// clip. No gain node is added here - any value would be a guess, and mixed
// screen recordings are documented as un-attenuated, unmeasured-clipping
// behaviour (see the AC's Limits section), not fixed up quietly in this
// module.

export interface AudioContextLike {
  createMediaStreamSource(stream: MediaStream): { connect(dest: unknown): void };
  createMediaStreamDestination(): { stream: MediaStream };
  resume(): Promise<void>;
  close(): Promise<void>;
  readonly state: string;
}

export interface MixedAudio {
  track: MediaStreamTrack;
  close: () => void;
  // AC1b: ctx.resume() used to be fire-and-forget with the outcome
  // discarded entirely - a resume refused under Chrome's autoplay policy
  // left the destination track carrying no audio, with nothing anywhere
  // observing it. That is D1's silent-audio failure shape reached by a
  // second route. Resolves once the resume attempt has settled, to the
  // context's ACTUAL state at that point ("running" on success; whatever a
  // refusal left it in, typically "suspended", otherwise). For the
  // single-track path, no AudioContext is ever created, so there is
  // nothing to suspend - this resolves to "running" immediately. This
  // module only makes the fact observable; deciding what, if anything, to
  // surface to the user is the caller's call.
  readonly resumedState: Promise<string>;
}

function defaultMakeContext(): AudioContextLike {
  const w = typeof window !== "undefined" ? (window as unknown as Record<string, unknown>) : undefined;
  const Ctor = (w?.AudioContext ?? w?.webkitAudioContext) as typeof AudioContext | undefined;
  if (!Ctor) throw new Error("AudioContext is not supported in this browser.");
  return new Ctor();
}

// A MediaStreamAudioSourceNode is constructed from a MediaStream, not a bare
// track, so each input track has to be wrapped. The real constructor is used
// whenever it exists (every browser this ships to); the fallback exists only
// because vitest's node environment has no MediaStream global at all, and the
// injected fake AudioContextLike in a test never inspects the object beyond
// passing it straight to `connect`.
function wrapTrackAsStream(track: MediaStreamTrack): MediaStream {
  if (typeof MediaStream !== "undefined") {
    return new MediaStream([track]);
  }
  return { getAudioTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream;
}

export function mixAudioTracks(
  tracks: ReadonlyArray<MediaStreamTrack>,
  makeContext: () => AudioContextLike = defaultMakeContext,
): MixedAudio | null {
  if (tracks.length === 0) return null;

  if (tracks.length === 1) {
    // No AudioContext is created - do not pay for a graph that mixes nothing.
    return { track: tracks[0], close: () => {}, resumedState: Promise.resolve("running") };
  }

  const ctx = makeContext();
  // AC1b: startRecording can be reached from the 3-2-1 countdown's
  // setInterval callback, and a context constructed there can start
  // "suspended" under Chrome's autoplay policy - a suspended context's
  // destination track carries no audio at all, with no error. Resume
  // immediately, without blocking mixing on it; unlike the previous
  // fire-and-forget version, the outcome is captured (never discarded) as
  // `resumedState` below, whether resume settles or rejects.
  const resumedState: Promise<string> = ctx.resume().then(
    () => ctx.state,
    () => ctx.state,
  );

  const destination = ctx.createMediaStreamDestination();
  for (const track of tracks) {
    const source = ctx.createMediaStreamSource(wrapTrackAsStream(track));
    source.connect(destination);
  }

  // A MediaStreamAudioDestinationNode's stream always has exactly one audio
  // track per spec; the fake in a test is required to produce one too (see
  // audio-mix.test.ts).
  const mixedTrack = destination.stream.getAudioTracks()[0];
  if (!mixedTrack) throw new Error("mixAudioTracks: the destination produced no audio track.");
  let closed = false;
  return {
    track: mixedTrack,
    close: () => {
      if (closed) return;
      closed = true;
      mixedTrack.stop();
      void ctx.close().catch(() => {});
    },
    resumedState,
  };
}
