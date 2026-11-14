import { afterEach, beforeEach, expect, it, vi } from "vitest";

// Non-rendering dispatcher: effects are committed explicitly and their
// cleanup can run synchronously from the picker adoption callback.
const hooks = vi.hoisted(() => ({ cells: [] as unknown[], cursor: 0, effects: [] as Array<() => void | (() => void)>, cleanup: [] as Array<() => void> }));
vi.mock("react", () => ({
  useState: (initial: unknown) => {
    const i = hooks.cursor++;
    if (!(i in hooks.cells)) hooks.cells[i] = typeof initial === "function" ? (initial as () => unknown)() : initial;
    return [hooks.cells[i], (v: unknown) => { hooks.cells[i] = typeof v === "function" ? (v as (old: unknown) => unknown)(hooks.cells[i]) : v; }];
  },
  useRef: (initial: unknown) => {
    const i = hooks.cursor++;
    return hooks.cells[i] ?? (hooks.cells[i] = { current: initial });
  },
  useCallback: (fn: unknown) => { hooks.cursor++; return fn; },
  useEffect: (fn: () => void | (() => void)) => { hooks.cursor++; hooks.effects.push(fn); },
}));

vi.mock("@/lib/frame-ticker", () => ({ startFrameTicker: () => ({ stop: vi.fn() }) }));

import { useDiscussionCapture } from "./useDiscussionCapture";

beforeEach(() => { hooks.cells = []; hooks.cursor = 0; hooks.effects = []; hooks.cleanup = []; });
afterEach(() => { vi.unstubAllGlobals(); });

it("releases an adopted stream and does not set up capture after unmount during adoption", async () => {
  const track = { stop: vi.fn(), addEventListener: vi.fn(), muted: false };
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
  const picker = vi.fn().mockResolvedValue(stream);
  const createElement = vi.fn(() => { throw new Error("capture setup ran after teardown"); });
  vi.stubGlobal("navigator", { mediaDevices: { getDisplayMedia: picker } });
  vi.stubGlobal("document", { createElement });
  const capture = useDiscussionCapture();
  for (const effect of hooks.effects) {
    const cleanup = effect();
    if (cleanup) hooks.cleanup.push(cleanup);
  }
  await capture.start({ saveVideo: false, onStarted: () => {
    for (const cleanup of hooks.cleanup) cleanup();
  } });
  expect(picker).toHaveBeenCalledTimes(1);
  expect(track.stop).toHaveBeenCalledTimes(1);
  expect(track.addEventListener).not.toHaveBeenCalled();
  expect(createElement).not.toHaveBeenCalled();
});

it("does not resume setup after stop during adoption while still mounted", async () => {
  const track = { stop: vi.fn(), addEventListener: vi.fn(), muted: false };
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
  const createElement = vi.fn(() => { throw new Error("capture setup ran after stop"); });
  vi.stubGlobal("navigator", { mediaDevices: { getDisplayMedia: vi.fn().mockResolvedValue(stream) } });
  vi.stubGlobal("document", { createElement });
  const capture = useDiscussionCapture();
  for (const effect of hooks.effects) {
    const cleanup = effect();
    if (cleanup) hooks.cleanup.push(cleanup);
  }
  await capture.start({ saveVideo: false, onStarted: () => capture.stop() });
  expect(track.stop).toHaveBeenCalledTimes(1);
  expect(track.addEventListener).not.toHaveBeenCalled();
  expect(createElement).not.toHaveBeenCalled();
  for (const cleanup of hooks.cleanup) cleanup();
});

it("stops a microphone granted after recording setup was cancelled", async () => {
  let grant!: (value: MediaStream) => void;
  const permission = new Promise<MediaStream>(resolve => { grant = resolve; });
  const displayTrack = { stop: vi.fn(), addEventListener: vi.fn(), muted: false };
  const display = { getTracks: () => [displayTrack], getVideoTracks: () => [displayTrack], addTrack: vi.fn() };
  const microphoneTrack = { stop: vi.fn() };
  const microphone = { getTracks: () => [microphoneTrack] } as unknown as MediaStream;
  const createElement = vi.fn(() => { throw new Error("capture setup ran after cancellation"); });
  vi.stubGlobal("navigator", { mediaDevices: { getDisplayMedia: vi.fn().mockResolvedValue(display), getUserMedia: vi.fn(() => permission) } });
  vi.stubGlobal("document", { createElement });
  const capture = useDiscussionCapture();
  for (const effect of hooks.effects) { const cleanup = effect(); if (cleanup) hooks.cleanup.push(cleanup); }
  const starting = capture.start({ saveVideo: true, microphone: true });
  await vi.waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled());
  capture.stop();
  grant(microphone);
  await starting;
  expect(microphoneTrack.stop).toHaveBeenCalledOnce();
  expect(displayTrack.stop).toHaveBeenCalledOnce();
  expect(display.addTrack).not.toHaveBeenCalled();
  expect(createElement).not.toHaveBeenCalled();
  for (const cleanup of hooks.cleanup) cleanup();
});

it("blocks a new capture until an inactive recorder has delivered its final video", async () => {
  const track = { stop: vi.fn(), addEventListener: vi.fn(), muted: false };
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
  const picker = vi.fn().mockResolvedValue(stream);
  const recorders: Array<{ state: string; onstop: (() => void) | null }> = [];
  class Recorder {
    static isTypeSupported() { return true; }
    state = "recording"; mimeType = "video/webm"; onstop: (() => void) | null = null; ondataavailable = null;
    constructor() { recorders.push(this); }
    start() {}
    stop() { this.state = "inactive"; }
  }
  vi.stubGlobal("MediaRecorder", Recorder);
  vi.stubGlobal("navigator", { mediaDevices: { getDisplayMedia: picker } });
  vi.stubGlobal("URL", { createObjectURL: () => "blob:video", revokeObjectURL: vi.fn() });
  vi.stubGlobal("document", { createElement: (tag: string) => tag === "video"
    ? { play: async () => {}, pause: vi.fn(), srcObject: null }
    : { getContext: () => ({}) } });
  const capture = useDiscussionCapture();
  for (const effect of hooks.effects) { const cleanup = effect(); if (cleanup) hooks.cleanup.push(cleanup); }
  await capture.start({ saveVideo: true });
  recorders[0].state = "inactive";
  capture.stop();
  await capture.start({ saveVideo: true });
  expect(picker).toHaveBeenCalledTimes(1);
  recorders[0].onstop?.();
  await capture.start({ saveVideo: true });
  expect(picker).toHaveBeenCalledTimes(2);
  for (const cleanup of hooks.cleanup) cleanup();
});
