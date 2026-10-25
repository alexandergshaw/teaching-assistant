import { afterEach, describe, expect, it, vi } from "vitest";
import { ensureFiniteDuration } from "./caption-burn";

function harness() {
  vi.useFakeTimers();
  const target = Object.assign(new EventTarget(), { duration: Infinity, currentTime: 0 });
  const video = target as unknown as HTMLVideoElement;
  const add = vi.spyOn(video, "addEventListener");
  const remove = vi.spyOn(video, "removeEventListener");
  const controller = new AbortController();
  const signalAdd = vi.spyOn(controller.signal, "addEventListener");
  const signalRemove = vi.spyOn(controller.signal, "removeEventListener");
  const clean = () => {
    for (const [type, listener] of add.mock.calls) expect(remove.mock.calls.some(call => call[0] === type && call[1] === listener)).toBe(true);
    for (const [type, listener] of signalAdd.mock.calls) expect(signalRemove.mock.calls.some(call => call[0] === type && call[1] === listener)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  };
  return { target, video, controller, clean };
}
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
describe("real finite-duration primitive owns its complete lifecycle", () => {
  it("returns existing finite duration without seeking or allocating a wait", async () => {
    const h = harness(); h.target.duration = 10;
    expect(await ensureFiniteDuration(h.video, h.controller.signal)).toBe(10); expect(h.video.currentTime).toBe(0); h.clean();
  });
  it.each(["abort", "error", "timeout"])("cleans discovery listeners and timer on %s", async mode => {
    const h = harness(); const pending = ensureFiniteDuration(h.video, h.controller.signal);
    const rejected = expect(pending).rejects.toMatchObject({ name: mode === "abort" ? "AbortError" : "Error" });
    if (mode === "abort") h.controller.abort();
    else if (mode === "error") h.video.dispatchEvent(new Event("error"));
    else await vi.advanceTimersByTimeAsync(10_001);
    await rejected; h.clean();
  });
  it.each(["abort", "error", "seeked", "fallback"])("cleans the best-effort rewind listener and both timers on %s", async mode => {
    const h = harness(); const pending = ensureFiniteDuration(h.video, h.controller.signal);
    const failure = mode === "abort" || mode === "error";
    const rejected = failure ? expect(pending).rejects.toMatchObject({ name: mode === "abort" ? "AbortError" : "Error" }) : null;
    h.target.duration = 42; h.video.dispatchEvent(new Event("durationchange"));
    expect(h.video.currentTime).toBe(0);
    if (mode === "abort") h.controller.abort();
    else if (mode === "error") h.video.dispatchEvent(new Event("error"));
    else if (mode === "seeked") h.video.dispatchEvent(new Event("seeked"));
    else await vi.advanceTimersByTimeAsync(101);
    if (failure) await rejected; else expect(await pending).toBe(42);
    h.clean();
    // A late event cannot reopen a completed discovery/rewind wait.
    h.video.dispatchEvent(new Event("seeked")); await vi.advanceTimersByTimeAsync(10_001); h.clean();
  });
  it("cleans everything when assigning the discovery seek throws", async () => {
    const h = harness(); Object.defineProperty(h.video, "currentTime", { set() { throw new Error("codec"); } });
    await expect(ensureFiniteDuration(h.video, h.controller.signal)).rejects.toThrow("Could not seek"); h.clean();
  });
  it("checks an already aborted signal before the finite-duration fast path", async () => {
    const h = harness(); h.target.duration = 10; h.controller.abort();
    await expect(ensureFiniteDuration(h.video, h.controller.signal)).rejects.toMatchObject({ name: "AbortError" }); h.clean();
  });
});
