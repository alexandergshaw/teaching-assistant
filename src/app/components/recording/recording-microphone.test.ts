import { expect, it, vi } from "vitest";
import { attachRecordingMicrophone } from "./recording-microphone";

it("adds an admitted microphone to the current recording", async () => {
  const track = { stop: vi.fn() };
  const addTrack = vi.fn();
  const display = { addTrack } as unknown as MediaStream;
  const microphone = { getAudioTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream;
  await expect(attachRecordingMicrophone(display, async () => microphone, () => true)).resolves.toBe("recording");
  expect(addTrack).toHaveBeenCalledWith(track);
  expect(track.stop).not.toHaveBeenCalled();
});

it("continues without audio when access is denied", async () => {
  const display = { addTrack: vi.fn() } as unknown as MediaStream;
  await expect(attachRecordingMicrophone(display, async () => { throw new Error("denied"); }, () => true)).resolves.toBe("unavailable");
  expect(display.addTrack).not.toHaveBeenCalled();
});

it("stops a microphone granted after capture has ended", async () => {
  let resolve!: (stream: MediaStream) => void;
  const request = new Promise<MediaStream>(done => { resolve = done; });
  const track = { stop: vi.fn() };
  const display = { addTrack: vi.fn() } as unknown as MediaStream;
  const pending = attachRecordingMicrophone(display, () => request, () => false);
  resolve({ getTracks: () => [track] } as unknown as MediaStream);
  await expect(pending).resolves.toBe("cancelled");
  expect(track.stop).toHaveBeenCalledOnce();
  expect(display.addTrack).not.toHaveBeenCalled();
});
