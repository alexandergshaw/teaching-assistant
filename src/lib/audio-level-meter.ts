// A shared RMS-based mic/audio level meter, driven by the Web Audio API's
// AnalyserNode. Two hooks in src/app/components/recording
// (useRecorder.ts and useCameraPreview.ts) each built their own
// byte-for-byte identical copy of this - same AudioContext construction
// (with the webkit fallback), analyser.fftSize = 256, the same RMS-over-
// time-domain-data computation, and the same "amplify by 4, quantize to
// 1/20ths, only report a change" dedupe (useCameraPreview.ts's own comment
// even points back at useRecorder.ts's copy by line number). Pulled out here
// rather than left duplicated in the recording directory: it is a generic
// audio-analysis technique with no recording-specific dependency at all (no
// Take, no MediaRecorder, no recording settings) - it takes a MediaStream and
// hands back a level, nothing else.
//
// Mirrors frame-ticker.ts's shape in this same directory: a plain factory
// function, no React import, that starts a live process and hands back a
// handle to stop it. The caller supplies the callback that turns "the level
// changed" into its own setState call - this module owns no React state
// itself, so the same "amplify/quantize/dedupe, only call back on an actual
// change" behavior that both existing call sites already relied on continues
// unchanged; only the ownership of the AudioContext/AnalyserNode/rAF handle
// moved, not the arithmetic.
//
// useRecorder.ts is the only caller pulled onto this shared version so far -
// useCameraPreview.ts keeps its own pre-existing copy untouched, since this
// split's job is bringing useRecorder.ts under
// recording-split.structure.test.ts's 1000-line ceiling, not touching a file
// outside that assignment's scope.

export interface AudioLevelMeter {
  stop: () => void;
}

/**
 * Starts analysing `stream`'s audio track(s) and calls `onLevel` with a
 * 0..1 value, quantized to 1/20ths, every time the level actually changes
 * (never on every animation frame - that would re-render far more than a
 * level bar needs). Returns null immediately if the stream has no audio
 * track, or if this browser has no (even prefixed) AudioContext - in both
 * cases there is nothing to meter and nothing is started. `errorContext`
 * customizes only the console.error prefix logged if construction throws
 * (each existing call site logged its own distinct message before this
 * split; behavior is otherwise identical).
 */
export function startAudioLevelMeter(
  stream: MediaStream,
  onLevel: (level: number) => void,
  errorContext = "level meter"
): AudioLevelMeter | null {
  const audioTracks = stream.getAudioTracks();
  if (audioTracks.length === 0) return null;

  try {
    const audioCtx =
      typeof window !== "undefined" && window.AudioContext
        ? new window.AudioContext()
        : typeof window !== "undefined" && (window as unknown as Record<string, unknown>).webkitAudioContext
          ? new ((window as unknown as Record<string, unknown>).webkitAudioContext as typeof AudioContext)()
          : null;

    if (!audioCtx) {
      console.warn("AudioContext not supported");
      return null;
    }

    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);

    const data = new Uint8Array(analyser.frequencyBinCount);
    let lastLevel = 0;
    let rafId: number | null = null;
    const loop = () => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += (data[i] - 128) * (data[i] - 128);
      const rms = Math.sqrt(sum / data.length) / 128;
      // Raw RMS of speech is tiny; amplify so normal talking visibly moves
      // the bar. Quantize and only report on change - reporting at 60fps
      // re-rendered the whole tab every frame in useRecorder's original copy,
      // which broke the device dropdowns (MUI menus re-render out from under
      // the click).
      const q = Math.round(Math.min(rms * 4, 1) * 20) / 20;
      if (q !== lastLevel) {
        lastLevel = q;
        onLevel(q);
      }
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);

    return {
      stop: () => {
        if (rafId !== null) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
        if (audioCtx.state !== "closed") {
          audioCtx.close();
        }
      },
    };
  } catch (err) {
    console.error(`Failed to start ${errorContext}:`, err);
    return null;
  }
}
