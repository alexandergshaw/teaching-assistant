// VIDEO-GRADING W2: the in-zip caps and staging against the real extractor.
// T4 (per-zip video count, ZERO member reads on the over-count), T3 (the zip
// plan-pass boundary), T14 (a staged video carries videoRef, never rawBase64),
// the injected-stager contract and the flag-off "nothing changed" proof. Real
// in-memory jszip fixtures; the stager is a fake, so no network or Storage.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "crypto";
import JSZip from "jszip";

vi.mock("../zip-caps", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../zip-caps")>();
  return { ...actual, readMemberBounded: vi.fn(actual.readMemberBounded) };
});

import * as zipCaps from "../zip-caps";
import { extractSubmissions, ingestZipEntries } from "./extraction";
import { VIDEO_MAX_BYTES } from "./video-limits";
import type { StageVideoFn } from "./video-leaf";
import { graderNeedsFileBytes } from "./constants";
import { estimateNeededWireBytes, graderReadsFileBytes } from "@/app/components/grading/incrementalRunPlan";

const { ZIP_MAX_VIDEO_MEMBERS, ZipCapError, DEFAULT_ZIP_LIMITS } = zipCaps;
const readSpy = vi.mocked(zipCaps.readMemberBounded);

function seeded(length: number, seed: number): Uint8Array {
  const out = new Uint8Array(length);
  let state = seed >>> 0;
  for (let i = 0; i < length; i += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    out[i] = state >>> 24;
  }
  return out;
}

const MP4_HEAD = [0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 2, 0, 0x69, 0x73, 0x6f, 0x6d, 0x6d, 0x70, 0x34, 0x31];

/** A byte string the sniff accepts as an mp4 (ftyp/isom at offset 4). */
function mp4Bytes(length: number, seed: number): Uint8Array {
  const out = seeded(length, seed);
  out.set(MP4_HEAD, 0);
  return out;
}

async function zipOf(files: Array<readonly [string, Uint8Array | string]>): Promise<ArrayBuffer> {
  const zip = new JSZip();
  for (const [name, data] of files) zip.file(name, data, { createFolders: false });
  return zip.generateAsync({ type: "arraybuffer", compression: "STORE" });
}

async function nestedZip(files: Array<readonly [string, Uint8Array | string]>): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const [name, data] of files) zip.file(name, data, { createFolders: false });
  return zip.generateAsync({ type: "uint8array", compression: "STORE" });
}

function fakeStager() {
  const received: Array<{ bytes: Buffer; container: string }> = [];
  const stage: StageVideoFn = vi.fn(async (bytes, container) => {
    received.push({ bytes, container });
    return { storagePath: `u1/grading-uploads/00000000-0000-4000-8000-00000000000${received.length}.mp4` };
  });
  return { stage, received };
}

beforeEach(() => {
  readSpy.mockClear();
});

describe("T4: the per-zip video count cap", () => {
  it("5 videos at the top level are refused with code video-count and ZERO members are read", async () => {
    const stager = fakeStager();
    const buffer = await zipOf(
      Array.from({ length: ZIP_MAX_VIDEO_MEMBERS + 1 }, (_, i) => [`HW/s${i}_100${i}_200${i}_v.mp4`, mp4Bytes(200, i)] as const)
    );
    const error = await extractSubmissions(buffer, { videoEnabled: true, stageVideo: stager.stage }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ZipCapError);
    expect((error as InstanceType<typeof ZipCapError>).code).toBe("video-count");
    expect((error as Error).message.startsWith(zipCaps.ZIP_REFUSAL_PREFIX)).toBe(true);
    expect((error as Error).message).toContain("ZIP_MAX_VIDEO_MEMBERS");
    expect(readSpy).not.toHaveBeenCalled();
    expect(stager.stage).not.toHaveBeenCalled();
  });

  it("exactly ZIP_MAX_VIDEO_MEMBERS videos proceed and are all staged", async () => {
    const stager = fakeStager();
    const buffer = await zipOf(
      Array.from({ length: ZIP_MAX_VIDEO_MEMBERS }, (_, i) => [`HW/s${i}_100${i}_200${i}_v.mp4`, mp4Bytes(200, i)] as const)
    );
    const result = await extractSubmissions(buffer, { videoEnabled: true, stageVideo: stager.stage });
    expect(stager.stage).toHaveBeenCalledTimes(ZIP_MAX_VIDEO_MEMBERS);
    expect(Object.keys(result.videoStaging)).toHaveLength(ZIP_MAX_VIDEO_MEMBERS);
    expect(result.videoOutcomes).toEqual({ accepted: ZIP_MAX_VIDEO_MEMBERS, failed: {} });
  });

  it("the count spans nesting levels: 2 top-level + 3 inside a nested zip is refused before any NESTED leaf is read", async () => {
    const inner = await nestedZip([
      ["a.mp4", mp4Bytes(200, 11)],
      ["b.mp4", mp4Bytes(200, 12)],
      ["c.mp4", mp4Bytes(200, 13)],
    ]);
    const stager = fakeStager();
    const buffer = await zipOf([
      ["HW/x_1001_2001_one.mp4", mp4Bytes(200, 1)],
      ["HW/y_1002_2002_two.mp4", mp4Bytes(200, 2)],
      ["HW/z_1003_2003_bundle.zip", inner],
    ]);
    const error = await extractSubmissions(buffer, { videoEnabled: true, stageVideo: stager.stage }).catch((e: unknown) => e);
    expect((error as InstanceType<typeof ZipCapError>).code).toBe("video-count");
    // The nested archive is only knowable after it is read, so the 2 top-level
    // videos (a different, already-passed level) were staged first - the ingest
    // route removes those on the refusal. No NESTED video is read or staged.
    expect(stager.stage).toHaveBeenCalledTimes(2);
    const names = readSpy.mock.calls.map((call) => String(call[2]));
    expect(names.some((n) => /bundle\.zip\/[abc]\.mp4$/.test(n))).toBe(false);
  });

  it("flag OFF: 5 videos are not counted, not refused and not read (today's silent skip is unchanged)", async () => {
    const buffer = await zipOf(
      Array.from({ length: ZIP_MAX_VIDEO_MEMBERS + 1 }, (_, i) => [`HW/s${i}_100${i}_200${i}_v.mp4`, mp4Bytes(200, i)] as const)
    );
    const result = await extractSubmissions(buffer, { videoEnabled: false });
    expect(result.attemptedSupportedFiles).toBe(0);
    expect(readSpy).not.toHaveBeenCalled();
  });

  it("the cap is a tunable option (maxVideoMembers) so a smaller limit trips earlier", async () => {
    const buffer = await zipOf([
      ["HW/a_1001_2001_v.mp4", mp4Bytes(200, 1)],
      ["HW/b_1002_2002_v.mp4", mp4Bytes(200, 2)],
    ]);
    const error = await extractSubmissions(buffer, { videoEnabled: true, maxVideoMembers: 1 }).catch((e: unknown) => e);
    expect((error as InstanceType<typeof ZipCapError>).code).toBe("video-count");
    expect(readSpy).not.toHaveBeenCalled();
  });
});

describe("T3: the size cap is the ONE zip member cap, at MAX-1 / MAX / MAX+1", () => {
  it("VIDEO_MAX_BYTES is the per-member zip cap by value", () => {
    expect(VIDEO_MAX_BYTES).toBe(zipCaps.ZIP_MAX_MEMBER_DECLARED_BYTES);
    expect(VIDEO_MAX_BYTES).toBe(DEFAULT_ZIP_LIMITS.maxMemberDeclaredBytes);
  });

  it("refuses iff declared > limit: limit-1 and limit accept, limit+1 is member-bytes", async () => {
    const size = 1000;
    const buffer = await zipOf([["HW/a_1001_2001_v.mp4", mp4Bytes(size, 5)]]);
    for (const [limit, refused] of [
      [size + 1, false],
      [size, false],
      [size - 1, true],
    ] as const) {
      const stager = fakeStager();
      const attempt = extractSubmissions(buffer, {
        videoEnabled: true,
        stageVideo: stager.stage,
        limits: { maxMemberDeclaredBytes: limit },
      });
      if (refused) {
        const error = await attempt.catch((e: unknown) => e);
        expect((error as InstanceType<typeof ZipCapError>).code).toBe("member-bytes");
        expect(stager.stage).not.toHaveBeenCalled();
      } else {
        await expect(attempt).resolves.toBeDefined();
        expect(stager.stage).toHaveBeenCalledTimes(1);
      }
    }
  });
});

describe("in-zip staging through the injected stager", () => {
  it("hands the stager the EXACT member bytes and records a videoRef + sniffed mime, with no rawBase64 anywhere (T14)", async () => {
    const bytes = mp4Bytes(600, 9);
    const stager = fakeStager();
    const buffer = await zipOf([
      ["HW/alice_1001_2001_essay.txt", "alice essay"],
      ["HW/alice_1001_2001_demo.mp4", bytes],
    ]);
    const { entries, videoOutcomes, failedSupportedFiles } = await ingestZipEntries(buffer, {
      videoEnabled: true,
      stageVideo: stager.stage,
    });
    expect(failedSupportedFiles).toEqual([]);
    expect(videoOutcomes).toEqual({ accepted: 1, failed: {} });
    const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
    expect(sha(stager.received[0].bytes)).toBe(sha(bytes));
    expect(stager.received[0].container).toBe("mp4");

    const files = entries.flatMap((e) => e.submittedFiles);
    const video = files.find((f) => f.mimeType === "video/mp4");
    expect(video).toBeDefined();
    expect(video?.videoRef).toEqual({ storagePath: "u1/grading-uploads/00000000-0000-4000-8000-000000000001.mp4", sizeBytes: 600 });
    expect(video?.rawBase64).toBeUndefined();
    expect(estimateNeededWireBytes(entries[0])).toBeLessThan(2000);
    expect(video?.previewContent).toMatch(/^\[Video file: .*, mp4\]$/);
    // T14 predicates: a video mime needs no inline bytes.
    expect(graderNeedsFileBytes("video/mp4")).toBe(false);
    expect(graderReadsFileBytes("video/mp4")).toBe(false);
    for (const f of files) {
      if (f.videoRef) expect(f.rawBase64).toBeUndefined();
    }
  });

  it("bytes that are not a video are one failed file (unsupported format); the other video still stages", async () => {
    const stager = fakeStager();
    const buffer = await zipOf([
      ["HW/a_1001_2001_bad.mp4", new TextEncoder().encode("PK this is not a video at all, just text")],
      ["HW/b_1002_2002_good.mp4", mp4Bytes(300, 2)],
    ]);
    const { failedSupportedFiles, videoOutcomes, entries } = await ingestZipEntries(buffer, {
      videoEnabled: true,
      stageVideo: stager.stage,
    });
    expect(failedSupportedFiles).toHaveLength(1);
    expect(videoOutcomes).toEqual({ accepted: 1, failed: { "unsupported format": 1 } });
    expect(stager.stage).toHaveBeenCalledTimes(1);
    expect(entries).toHaveLength(1);
  });

  it("a stager that reports a failure or throws is a per-file failure, never a whole-archive failure", async () => {
    let call = 0;
    const stage: StageVideoFn = async () => {
      call += 1;
      if (call === 1) return { failure: "upload failed" };
      throw new Error("network down");
    };
    const buffer = await zipOf([
      ["HW/a_1001_2001_v.mp4", mp4Bytes(200, 1)],
      ["HW/b_1002_2002_v.mp4", mp4Bytes(200, 2)],
    ]);
    const { failedSupportedFiles, videoOutcomes } = await ingestZipEntries(buffer, { videoEnabled: true, stageVideo: stage });
    expect(failedSupportedFiles).toHaveLength(2);
    expect(videoOutcomes).toEqual({ accepted: 0, failed: { "upload failed": 2 } });
  });

  it("with NO stager the W1 placeholder is recorded and no member is read (bytes never touched)", async () => {
    const buffer = await zipOf([["HW/a_1001_2001_v.mp4", mp4Bytes(200, 1)]]);
    const result = await extractSubmissions(buffer, { videoEnabled: true });
    expect(readSpy).not.toHaveBeenCalled();
    expect(Object.values(result.submissions)[0]).toContain("received; video grading is being set up");
    expect(result.videoStaging).toEqual({});
    expect(result.videoOutcomes).toEqual({ accepted: 0, failed: {} });
  });

  it("a stager passed with the flag OFF is never called (flag-off byte-identical)", async () => {
    const stager = fakeStager();
    const buffer = await zipOf([["HW/a_1001_2001_v.mp4", mp4Bytes(200, 1)]]);
    await extractSubmissions(buffer, { videoEnabled: false, stageVideo: stager.stage });
    expect(stager.stage).not.toHaveBeenCalled();
    expect(readSpy).not.toHaveBeenCalled();
  });
});
