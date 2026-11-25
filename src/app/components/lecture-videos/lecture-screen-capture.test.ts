import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLectureScreenCapture, type ScreenCaptureState } from "./lecture-screen-capture";

class FakeTrack extends EventTarget {
  readyState = "live";
  stop = vi.fn(() => { this.readyState = "ended"; });
}

class FakeRecorder {
  static latest: FakeRecorder | undefined;
  state = "inactive";
  mimeType = "video/mp4";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onerror: (() => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(readonly stream: unknown) { FakeRecorder.latest = this; }
  start = vi.fn(() => { this.state = "recording"; });
  stop = vi.fn(() => { this.state = "inactive"; });
}

const getDisplayMedia = vi.fn();

function displayStream(withAudio = false) {
  const video = new FakeTrack();
  const audio = withAudio ? [new FakeTrack()] : [];
  let tracks = [video, ...audio];
  return {
    video, audio,
    stream: {
      getTracks: () => tracks,
      getVideoTracks: () => [video],
      getAudioTracks: () => tracks.filter((track) => track !== video),
      removeTrack: vi.fn((track: FakeTrack) => { tracks = tracks.filter((entry) => entry !== track); }),
    },
  };
}

function setup() {
  const onState = vi.fn<(state: ScreenCaptureState) => void>();
  const onCapturingChange = vi.fn();
  const onCaptured = vi.fn<(file: File, hasSystemAudio: boolean) => void>();
  const capture = createLectureScreenCapture({ onState, onCapturingChange, onCaptured });
  return { capture, onState, onCapturingChange, onCaptured };
}

beforeEach(() => {
  FakeRecorder.latest = undefined;
  getDisplayMedia.mockReset();
  vi.stubGlobal("MediaRecorder", FakeRecorder);
  vi.stubGlobal("navigator", { mediaDevices: { getDisplayMedia } });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Narrated Videos screen capture", () => {
  it("records a silent file by default and locks the workspace until final data arrives", async () => {
    const { capture, onState, onCaptured, onCapturingChange } = setup();
    const { stream, video, audio } = displayStream(true);
    getDisplayMedia.mockResolvedValue(stream);
    await capture.start(false);
    expect(getDisplayMedia).toHaveBeenCalledWith(expect.objectContaining({ audio: false }));
    expect(stream.removeTrack).toHaveBeenCalledWith(audio[0]);
    expect(audio[0].stop).toHaveBeenCalledTimes(1);
    expect(onCapturingChange.mock.calls).toEqual([[true]]);
    await capture.start(false);
    expect(getDisplayMedia).toHaveBeenCalledTimes(1);

    const recorder = FakeRecorder.latest!;
    recorder.ondataavailable?.({ data: new Blob(["first"]) });
    capture.stop();
    capture.stop();
    expect(recorder.stop).toHaveBeenCalledTimes(1);
    expect(onState).toHaveBeenLastCalledWith({ phase: "finishing" });
    expect(onCaptured).not.toHaveBeenCalled();
    recorder.ondataavailable?.({ data: new Blob(["last"]) });
    recorder.onstop?.();

    const [[file, systemAudio]] = onCaptured.mock.calls;
    expect(await file.text()).toBe("firstlast");
    expect(file.type).toBe("video/mp4");
    expect(file.name).toMatch(/^Screen recording .+\.mp4$/);
    expect(systemAudio).toBe(false);
    expect(video.stop).toHaveBeenCalledTimes(1);
    expect(onCapturingChange.mock.calls).toEqual([[true], [false]]);
  });

  it("keeps recording across views and saves shared audio when the browser ends sharing", async () => {
    const { capture, onCaptured } = setup();
    const { stream, video, audio } = displayStream(true);
    getDisplayMedia.mockResolvedValue(stream);
    await capture.start(true);
    expect(getDisplayMedia).toHaveBeenCalledWith(expect.objectContaining({
      audio: expect.objectContaining({ noiseSuppression: false }),
    }));
    const recorder = FakeRecorder.latest!;
    capture.leaveView();
    expect(recorder.stop).not.toHaveBeenCalled();
    expect(video.stop).not.toHaveBeenCalled();
    video.dispatchEvent(new Event("ended"));
    expect(recorder.stop).toHaveBeenCalledTimes(1);
    recorder.ondataavailable?.({ data: new Blob(["picture and audio"]) });
    recorder.onstop?.();
    expect(onCaptured).toHaveBeenCalledWith(expect.any(File), true);
    expect(audio[0].stop).toHaveBeenCalledTimes(1);
  });

  it("discards a share granted after leaving the picker without recording or handing off a file", async () => {
    const { capture, onCaptured, onCapturingChange } = setup();
    const { stream, video } = displayStream();
    const picker = Promise.withResolvers<typeof stream>();
    getDisplayMedia.mockReturnValue(picker.promise);
    const starting = capture.start(false);
    capture.leaveView();
    picker.resolve(stream);
    await starting;
    expect(video.stop).toHaveBeenCalledTimes(1);
    expect(FakeRecorder.latest).toBeUndefined();
    expect(onCaptured).not.toHaveBeenCalled();
    expect(onCapturingChange.mock.calls).toEqual([[true], [false]]);
  });

  it("discards pending final data and releases capture on cancel after stop", async () => {
    const { capture, onCaptured } = setup();
    const { stream, video } = displayStream();
    getDisplayMedia.mockResolvedValue(stream);
    await capture.start(false);
    const late = FakeRecorder.latest!.onstop;
    capture.stop();
    capture.cancel();
    late?.();
    expect(video.stop).toHaveBeenCalledTimes(1);
    expect(onCaptured).not.toHaveBeenCalled();
  });

  it("reports picker denial and releases the workspace lock", async () => {
    const { capture, onState, onCapturingChange, onCaptured } = setup();
    getDisplayMedia.mockRejectedValue(new DOMException("closed", "NotAllowedError"));
    await capture.start(true);
    expect(onState).toHaveBeenLastCalledWith({ phase: "idle", error: expect.stringContaining("canceled or blocked") });
    expect(onCapturingChange.mock.calls).toEqual([[true], [false]]);
    expect(onCaptured).not.toHaveBeenCalled();
  });

  it("reports an absent audio grant and releases the stream if the recorder never finishes", async () => {
    vi.useFakeTimers();
    const { capture, onState, onCapturingChange, onCaptured } = setup();
    const { stream, video } = displayStream();
    getDisplayMedia.mockResolvedValue(stream);
    await capture.start(true);
    expect(onState).toHaveBeenLastCalledWith({ phase: "recording", notice: expect.stringContaining("not shared") });
    capture.stop();
    await vi.advanceTimersByTimeAsync(10000);
    expect(onCaptured).not.toHaveBeenCalled();
    expect(onState).toHaveBeenLastCalledWith({ phase: "idle", error: expect.stringContaining("did not finish") });
    expect(onCapturingChange.mock.calls).toEqual([[true], [false]]);
    expect(video.stop).toHaveBeenCalledTimes(1);
  });
});
