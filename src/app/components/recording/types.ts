interface Device {
  deviceId: string;
  label: string;
}

export interface Take {
  id: string;
  name: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  durationSec: number;
  createdAt: number;
  backup?: "pending" | "done" | "failed";
  dbSave?: "pending" | "done" | "failed";
  // Audio captured alongside the video by a parallel recorder, rotated into
  // roughly one-minute segments. In memory for this session only: never backed
  // up and never saved to the library, because the library copy already has
  // this audio inside the video. Segments rather than one blob because
  // decodeAudioData decodes a whole buffer at once and a webm/opus fragment is
  // not independently decodable - a 40-minute take would decode to ~920MB in a
  // single allocation.
  audioSegments?: Blob[];
  // Cached transcript, set ONLY after a complete successful pass. A partial
  // value here would be silently reused by every later draft with no sign that
  // it is truncated.
  transcript?: string;
  // Provenance for a take derived by talking over another one.
  sourceTakeId?: string;
  sourceTakeName?: string;
}

interface Stroke {
  tool: "pen" | "highlighter" | "eraser";
  color: string;
  size: number;
  points: Array<{ x: number; y: number }>;
}

type RecState = "idle" | "recording" | "paused";

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export type { Device, Stroke, RecState };
export { fmt };
