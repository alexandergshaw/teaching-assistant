import { describe, it, expect, vi } from "vitest";
import { mixAudioTracks, type AudioContextLike } from "./audio-mix";

function makeTrack(id: string): MediaStreamTrack {
  return { id, stop: vi.fn() } as unknown as MediaStreamTrack;
}

// A minimal fake matching AudioContextLike, with counters and captured calls
// so each test can assert exactly what mixAudioTracks did to it. Node has no
// WebAudio and no MediaStream at all, so this fake - not a real AudioContext
// - is the entire contract under test.
function makeFakeContext() {
  const sourceCalls: unknown[] = [];
  const connectedTo: unknown[] = [];
  let destinationCalls = 0;
  let resumeCalls = 0;
  let closeCalls = 0;
  let trackStopCalls = 0;

  const destinationTrack = {
    id: "mixed-destination-track",
    stop: () => {
      trackStopCalls += 1;
    },
  } as unknown as MediaStreamTrack;

  const destinationStream = {
    getAudioTracks: () => [destinationTrack],
  } as unknown as MediaStream;

  const ctx: AudioContextLike = {
    createMediaStreamSource: (stream: MediaStream) => {
      sourceCalls.push(stream);
      return {
        connect: (dest: unknown) => {
          connectedTo.push(dest);
        },
      };
    },
    createMediaStreamDestination: () => {
      destinationCalls += 1;
      return { stream: destinationStream };
    },
    resume: async () => {
      resumeCalls += 1;
    },
    close: async () => {
      closeCalls += 1;
    },
    state: "suspended",
  };

  return {
    ctx,
    destinationTrack,
    get sourceCallCount() {
      return sourceCalls.length;
    },
    get connectedCallCount() {
      return connectedTo.length;
    },
    get destinationCallCount() {
      return destinationCalls;
    },
    get resumeCallCount() {
      return resumeCalls;
    },
    get closeCallCount() {
      return closeCalls;
    },
    get trackStopCallCount() {
      return trackStopCalls;
    },
  };
}

describe("mixAudioTracks", () => {
  it("returns null for an empty track list and never constructs a context", () => {
    const makeContext = vi.fn(() => makeFakeContext().ctx);
    const result = mixAudioTracks([], makeContext);
    expect(result).toBeNull();
    expect(makeContext).not.toHaveBeenCalled();
  });

  it("returns a single track unchanged with a no-op close, and never constructs a context", () => {
    const makeContext = vi.fn(() => makeFakeContext().ctx);
    const track = makeTrack("solo-mic");
    const result = mixAudioTracks([track], makeContext);
    expect(result).not.toBeNull();
    expect(result?.track).toBe(track);
    expect(makeContext).not.toHaveBeenCalled();
    // The no-op close must not stop the caller's own track - it does not own it.
    expect(() => result?.close()).not.toThrow();
    expect((track.stop as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it("mixes two or more tracks into one context, one source per track, one destination", () => {
    const fake = makeFakeContext();
    const makeContext = vi.fn(() => fake.ctx);
    const micTrack = makeTrack("mic");
    const systemTrack = makeTrack("system-audio");

    const result = mixAudioTracks([micTrack, systemTrack], makeContext);

    expect(makeContext).toHaveBeenCalledTimes(1);
    expect(fake.destinationCallCount).toBe(1);
    expect(fake.sourceCallCount).toBe(2);
    expect(fake.connectedCallCount).toBe(2);
    expect(result).not.toBeNull();
    expect(result?.track).toBe(fake.destinationTrack);
  });

  it("resumes the context immediately after construction (AC1b)", () => {
    const fake = makeFakeContext();
    mixAudioTracks([makeTrack("a"), makeTrack("b")], () => fake.ctx);
    expect(fake.resumeCallCount).toBe(1);
  });

  it("close() on a real mix stops the destination track and closes the context exactly once", () => {
    const fake = makeFakeContext();
    const result = mixAudioTracks([makeTrack("a"), makeTrack("b")], () => fake.ctx);
    result?.close();
    result?.close();
    expect(fake.trackStopCallCount).toBe(1);
    expect(fake.closeCallCount).toBe(1);
  });

  it("three or more tracks still produce exactly one context and one source per track", () => {
    const fake = makeFakeContext();
    const result = mixAudioTracks([makeTrack("a"), makeTrack("b"), makeTrack("c")], () => fake.ctx);
    expect(fake.destinationCallCount).toBe(1);
    expect(fake.sourceCallCount).toBe(3);
    expect(result?.track).toBe(fake.destinationTrack);
  });

  // AC1b: a refused resume() must be observable, not silently discarded -
  // the previous fire-and-forget `void ctx.resume().catch(() => {})` threw
  // the outcome away entirely, so a suspended context (no audio reaching
  // the destination track) looked identical to a healthy one.
  it("resolves resumedState to the context's actual state once a successful resume settles (AC1b)", async () => {
    const fake = makeFakeContext();
    const result = mixAudioTracks([makeTrack("a"), makeTrack("b")], () => fake.ctx);
    expect(result).not.toBeNull();
    // The fake's own state never flips off "suspended" (see makeFakeContext) -
    // pin the value actually observed rather than a state the fake never
    // produces, so this test does not silently start asserting a lie.
    await expect(result?.resumedState).resolves.toBe(fake.ctx.state);
    expect(fake.resumeCallCount).toBe(1);
  });

  it("resolves resumedState to the context's state even when resume() rejects (AC1b)", async () => {
    const fake = makeFakeContext();
    const rejecting: AudioContextLike = {
      ...fake.ctx,
      resume: async () => {
        throw new Error("resume() refused under autoplay policy");
      },
      state: "suspended",
    };
    const result = mixAudioTracks([makeTrack("a"), makeTrack("b")], () => rejecting);
    expect(result).not.toBeNull();
    await expect(result?.resumedState).resolves.toBe("suspended");
  });

  it("resolves resumedState to 'running' for a single track, without constructing a context (AC1b)", async () => {
    const makeContext = vi.fn(() => makeFakeContext().ctx);
    const result = mixAudioTracks([makeTrack("solo-mic")], makeContext);
    expect(result).not.toBeNull();
    await expect(result?.resumedState).resolves.toBe("running");
    expect(makeContext).not.toHaveBeenCalled();
  });
});
