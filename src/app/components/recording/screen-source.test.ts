import { describe, it, expect, vi, afterEach } from "vitest";
import {
  SCREEN_AUDIO_NOT_GRANTED_NOTICE,
  browserMayOfferDisplayAudio,
  classifyDisplayAudioGrant,
  acquireScreenShareMicTrack,
} from "./screen-source";

describe("classifyDisplayAudioGrant", () => {
  it("checkbox off, no track: 'off' notice, does not keep the track", () => {
    const result = classifyDisplayAudioGrant(false, false, true);
    expect(result.keepTrack).toBe(false);
    expect(result.notice).toBe("System audio is off - only your microphone is being recorded.");
  });

  it("checkbox on, no track, browser offers display audio: the not-granted notice", () => {
    const result = classifyDisplayAudioGrant(false, true, true);
    expect(result.keepTrack).toBe(false);
    expect(result.notice).toBe(SCREEN_AUDIO_NOT_GRANTED_NOTICE);
  });

  it("checkbox on, no track, browser never offers display audio: the browser-cannot notice", () => {
    const result = classifyDisplayAudioGrant(false, true, false);
    expect(result.keepTrack).toBe(false);
    expect(result.notice).toBe("This browser does not share system audio. Your microphone is still being recorded.");
  });

  it("checkbox on, track granted: keeps the track, no notice", () => {
    const result = classifyDisplayAudioGrant(true, true, true);
    expect(result.keepTrack).toBe(true);
    expect(result.notice).toBeNull();
  });

  it("checkbox off, track granted anyway: does not keep the track, 'off' notice", () => {
    const result = classifyDisplayAudioGrant(true, false, true);
    expect(result.keepTrack).toBe(false);
    expect(result.notice).toBe("System audio is off - only your microphone is being recorded.");
  });
});

describe("browserMayOfferDisplayAudio", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns false when navigator is unavailable (node/vitest's own default)", () => {
    expect(browserMayOfferDisplayAudio()).toBe(false);
  });

  it("returns true for a Chrome user agent", () => {
    vi.stubGlobal("navigator", {
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });
    expect(browserMayOfferDisplayAudio()).toBe(true);
  });

  it("returns true for an Edge user agent", () => {
    vi.stubGlobal("navigator", {
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
    });
    expect(browserMayOfferDisplayAudio()).toBe(true);
  });

  it("returns false for a Firefox user agent", () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
    });
    expect(browserMayOfferDisplayAudio()).toBe(false);
  });
});

describe("acquireScreenShareMicTrack", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns null without calling getUserMedia when micId is 'off'", async () => {
    const getUserMedia = vi.fn();
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    const track = await acquireScreenShareMicTrack("off", {
      noiseSuppression: true,
      echoCancellation: true,
      autoGain: true,
    });
    expect(track).toBeNull();
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("returns null without calling getUserMedia when micId is empty", async () => {
    const getUserMedia = vi.fn();
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    const track = await acquireScreenShareMicTrack("", {
      noiseSuppression: true,
      echoCancellation: true,
      autoGain: true,
    });
    expect(track).toBeNull();
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("requests the exact device and DSP settings, and returns the first audio track", async () => {
    const fakeTrack = { id: "mic-track" } as unknown as MediaStreamTrack;
    const getUserMedia = vi.fn(async () => ({
      getAudioTracks: () => [fakeTrack],
    }));
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });

    const track = await acquireScreenShareMicTrack("mic-123", {
      noiseSuppression: false,
      echoCancellation: true,
      autoGain: false,
    });

    expect(track).toBe(fakeTrack);
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: {
        deviceId: { exact: "mic-123" },
        noiseSuppression: false,
        echoCancellation: true,
        autoGainControl: false,
      },
    });
  });

  it("swallows a getUserMedia rejection and returns null rather than throwing", async () => {
    const getUserMedia = vi.fn(async () => {
      throw new Error("Permission denied");
    });
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const track = await acquireScreenShareMicTrack("mic-123", {
      noiseSuppression: true,
      echoCancellation: true,
      autoGain: true,
    });

    expect(track).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
