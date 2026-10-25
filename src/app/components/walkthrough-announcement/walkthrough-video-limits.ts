export const VIDEO_MAX_BYTES = 250 * 1024 * 1024;
export const VIDEO_MAX_SECONDS = 20 * 60;
export const VIDEO_MAX_FRAMES = 120;
export const VIDEO_LOCAL_WAIT_MS = 20_000;
export const VIDEO_PROVIDER_WAIT_MS = 120_000;
export const VIDEO_NARRATION_CHARS = 24_000;

export class VideoReadError extends Error {
  constructor(public readonly code: string) { super(code); }
}

export function validateVideo(file: Pick<Blob, "type" | "size">): void {
  if (!["video/mp4", "video/webm"].includes(file.type)) throw new VideoReadError("unsupported-media");
  if (file.size <= 0 || file.size > VIDEO_MAX_BYTES) throw new VideoReadError("file-size");
}

export function videoTimestamps(duration: number): number[] {
  if (!Number.isFinite(duration) || duration <= 0) throw new VideoReadError("unknown-duration");
  if (duration > VIDEO_MAX_SECONDS) throw new VideoReadError("duration-limit");
  const end = Math.max(0, duration - Math.min(0.1, duration / 10));
  const count = Math.min(VIDEO_MAX_FRAMES, Math.max(2, Math.ceil(duration / 5) + 1));
  return Array.from({ length: count }, (_, i) => end * i / (count - 1));
}

// Observe late settlement but discard it; cancellation never claims to abort a server action.
export function videoWait<T>(work: () => Promise<T>, signal: AbortSignal, timeoutMs: number, code: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) { reject(new VideoReadError("cancelled")); return; }
    const cleanup = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); };
    const abort = () => { cleanup(); reject(new VideoReadError("cancelled")); };
    const timer = setTimeout(() => { cleanup(); reject(new VideoReadError(code)); }, timeoutMs);
    signal.addEventListener("abort", abort, { once: true });
    Promise.resolve().then(() => {
      if (signal.aborted) throw new VideoReadError("cancelled");
      return work();
    }).then(value => { cleanup(); if (signal.aborted) reject(new VideoReadError("cancelled")); else resolve(value); }, error => { cleanup(); reject(error); });
  });
}
