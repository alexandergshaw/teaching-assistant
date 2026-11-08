import { describe, expect, it, vi } from "vitest";
import { createCapturePicker } from "./capture-picker";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

describe("capture picker admission", () => {
  it("stops an older picker stream and admits only the newest result", async () => {
    const picker = createCapturePicker();
    const first = deferred<MediaStream>();
    const second = deferred<MediaStream>();
    const stopFirst = vi.fn();
    const stopSecond = vi.fn();
    const oldStream = { getTracks: () => [{ stop: stopFirst }] } as unknown as MediaStream;
    const newStream = { getTracks: () => [{ stop: stopSecond }] } as unknown as MediaStream;
    const adopt = vi.fn();
    const oldResult = picker.request(() => first.promise, adopt);
    const newResult = picker.request(() => second.promise, adopt);
    second.resolve(newStream);
    expect(await newResult).toBe(newStream);
    first.resolve(oldStream);
    expect(await oldResult).toBeNull();
    expect(stopFirst).toHaveBeenCalledOnce();
    expect(stopSecond).not.toHaveBeenCalled();
    expect(adopt).toHaveBeenCalledExactlyOnceWith(newStream);
  });

  it("stops a stream arriving after cancellation", async () => {
    const picker = createCapturePicker();
    const pending = deferred<MediaStream>();
    const stop = vi.fn();
    const result = picker.request(() => pending.promise, vi.fn());
    picker.cancel();
    pending.resolve({ getTracks: () => [{ stop }] } as unknown as MediaStream);
    expect(await result).toBeNull();
    expect(stop).toHaveBeenCalledOnce();
  });

  it("adopts synchronously before a later microtask can start another picker", async () => {
    const picker = createCapturePicker();
    const selected = deferred<MediaStream>();
    const stream = { getTracks: () => [] } as unknown as MediaStream;
    const events: string[] = [];
    const result = picker.request(() => selected.promise, () => { events.push("adopt"); });
    selected.resolve(stream);
    queueMicrotask(() => { events.push("later microtask"); picker.cancel(); });
    expect(await result).toBe(stream);
    expect(events).toEqual(["adopt", "later microtask"]);
  });

  it("suppresses an older picker's rejection", async () => {
    const picker = createCapturePicker();
    let reject!: (reason: Error) => void;
    const old = new Promise<MediaStream>((_, r) => { reject = r; });
    const oldResult = picker.request(() => old, vi.fn());
    const current = deferred<MediaStream>();
    void picker.request(() => current.promise, vi.fn());
    reject(new Error("old picker failure"));
    await expect(oldResult).resolves.toBeNull();
  });
});
