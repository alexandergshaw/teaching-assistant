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
