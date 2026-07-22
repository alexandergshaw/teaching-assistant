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
