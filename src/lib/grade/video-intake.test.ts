// VIDEO-GRADING W1: in-zip recognition, the F2 conservation law, the O-1
// invariant (no rawBase64 on a video), the video-only named skip, and the
// flag-off "nothing changed" proof. Real in-memory jszip fixtures, no network.
import { describe, it, expect, vi } from "vitest";
import JSZip from "jszip";

// buildIngestLines' video-only skip is gated by the constant. The extraction
// options below are explicit; this pins the CONSTANT off for the whole file so
// the named-skip (flag-off) semantics stay covered. The flag-on side of the
// parser is ndjson-ingest-parser.videoon.test.ts.
vi.mock("./constants", async () => {
  const actual = await vi.importActual<typeof import("./constants")>("./constants");
  return { ...actual, VIDEO_GRADING_ENABLED: false };
});
import { extractSubmissions, ingestZipEntries } from "./extraction";
import { ZipCapError } from "../zip-caps";
import { buildIngestLines } from "./ndjson-ingest-parser";
import { VIDEO_EXTENSIONS, VIDEO_MIME_TYPES, getMimeType, graderNeedsFileBytes } from "./constants";
import {
  VIDEO_PENDING_MESSAGE,
  countVideoFiles,
  isVideoFile,
  isVideoName,
  isVideoOnlyEntry,
} from "./video-grading";
import { estimateNeededWireBytes } from "@/app/components/grading/incrementalRunPlan";
import type { StudentSubmissionEntry } from "./types";

function seeded(length: number, seed: number): Uint8Array {
  const out = new Uint8Array(length);
  let state = seed >>> 0;
  for (let i = 0; i < length; i += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    out[i] = state >>> 24;
  }
  return out;
}

async function toBuffer(zip: JSZip): Promise<ArrayBuffer> {
  return zip.generateAsync({ type: "arraybuffer", compression: "STORE" });
}

/** k = 4 video leaves: a mixed student, a video-only student, a nested one, an .m4v. */
async function buildVideoZip(): Promise<ArrayBuffer> {
  const bundle = new JSZip();
  bundle.file("clip.mov", seeded(300, 3));
  bundle.file("notes.txt", "carol notes");
  const bundleBuffer = await bundle.generateAsync({ type: "nodebuffer", compression: "STORE" });

  const outer = new JSZip();
  outer.file("HW1/alice_1001_2001_essay.txt", "alice essay");
  outer.file("HW1/alice_1001_2001_demo.mp4", seeded(400, 1));
  outer.file("HW1/bob_1002_2002_walk.webm", seeded(500, 2));
  outer.file("HW1/carol_1003_2003_bundle.zip", bundleBuffer);
  outer.file("HW1/dave_1004_2004_extra.m4v", seeded(200, 4));
  outer.file("HW1/dave_1004_2004_notes.txt", "dave notes");
  return toBuffer(outer);
}
const VIDEO_COUNT = 4;

describe("video recognition constants", () => {
  it("every video extension resolves to a video MIME, and no video MIME is inline-readable", () => {
    for (const extension of VIDEO_EXTENSIONS) {
      expect(VIDEO_MIME_TYPES.has(getMimeType(extension))).toBe(true);
    }
    for (const mime of VIDEO_MIME_TYPES) {
      expect(graderNeedsFileBytes(mime)).toBe(false);
    }
  });

  it("isVideoName keys on the extension only", () => {
    expect(isVideoName("a/b/clip.MP4")).toBe(true);
    expect(isVideoName("clip.webm")).toBe(true);
    expect(isVideoName("clip.mp4.txt")).toBe(false);
    expect(isVideoName("mp4")).toBe(false);
  });
});

describe("in-zip video, flag explicitly OFF: nothing changed", () => {
  it("a video member is still a silent skip - not counted, not failed, no entry", async () => {
    const result = await extractSubmissions(await buildVideoZip(), { videoEnabled: false });
    expect(Object.keys(result.submissions).some(isVideoName)).toBe(false);
    expect(result.failedSupportedFiles.some(isVideoName)).toBe(false);
    const ingested = await ingestZipEntries(await buildVideoZip(), { videoEnabled: false });
    expect(ingested.entries.some((entry) => entry.student === "bob")).toBe(false);
    expect(ingested.entries.flatMap((entry) => entry.submittedFiles).some(isVideoFile)).toBe(false);
  });

  it("with no option the default follows the (mocked-off) constant", async () => {
    const result = await extractSubmissions(await buildVideoZip());
    expect(Object.keys(result.submissions).some(isVideoName)).toBe(false);
  });
});

describe("in-zip video, flag ON (explicit option; parser constant mocked off)", () => {
  it("F2 conservation law: every video leaf is accounted for exactly once", async () => {
    const { entries, failedSupportedFiles } = await ingestZipEntries(await buildVideoZip(), { videoEnabled: true });
    const lines = buildIngestLines(entries, failedSupportedFiles);

    let inGradedEntries = 0;
    let inSkippedStudents = 0;
    for (const line of lines) {
      if (line.type === "entry") inGradedEntries += countVideoFiles(line.entry);
      if (line.type === "skip" && line.reason === VIDEO_PENDING_MESSAGE) {
        const entry = entries.find((candidate) => candidate.student === line.student);
        inSkippedStudents += entry ? countVideoFiles(entry) : 0;
      }
    }
    const failed = failedSupportedFiles.filter(isVideoName).length;
    // LHS greater than RHS would be a silently dropped video.
    expect(inGradedEntries + inSkippedStudents + failed).toBe(VIDEO_COUNT);
    expect(inSkippedStudents).toBe(1);
    expect(inGradedEntries).toBe(VIDEO_COUNT - 1);
  });

  it("counts video leaves as attempted supported files", async () => {
    const off = await extractSubmissions(await buildVideoZip(), { videoEnabled: false });
    const on = await extractSubmissions(await buildVideoZip(), { videoEnabled: true });
    expect(on.attemptedSupportedFiles - off.attemptedSupportedFiles).toBe(VIDEO_COUNT);
  });

  it("O-1: no video file carries rawBase64, and rawData has no video key", async () => {
    const result = await extractSubmissions(await buildVideoZip(), { videoEnabled: true });
    expect(Object.keys(result.rawData).some(isVideoName)).toBe(false);
    const { entries } = await ingestZipEntries(await buildVideoZip(), { videoEnabled: true });
    const videoFiles = entries.flatMap((entry) => entry.submittedFiles).filter(isVideoFile);
    expect(videoFiles).toHaveLength(VIDEO_COUNT);
    for (const file of videoFiles) {
      expect(file.rawBase64).toBeUndefined();
      expect(VIDEO_MIME_TYPES.has(file.mimeType ?? "")).toBe(true);
    }
  });

  it("the placeholder is worded and rides the entry content, so the grader is told", async () => {
    const { entries } = await ingestZipEntries(await buildVideoZip(), { videoEnabled: true });
    const alice = entries.find((entry) => entry.student === "alice");
    expect(alice?.content).toContain("[Video file:");
    expect(alice?.content).toContain("do not treat its absence from the work as missing");
    expect(alice?.content).toContain("alice essay");
  });

  it("a video-only student is a NAMED skip, never a computed grade, never silent", async () => {
    const { entries, failedSupportedFiles } = await ingestZipEntries(await buildVideoZip(), { videoEnabled: true });
    const bob = entries.find((entry) => entry.student === "bob");
    expect(bob).toBeDefined();
    expect(isVideoOnlyEntry(bob as StudentSubmissionEntry)).toBe(true);
    const lines = buildIngestLines(entries, failedSupportedFiles);
    expect(lines.filter((line) => line.type === "skip")).toEqual([
      { type: "skip", student: "bob", reason: VIDEO_PENDING_MESSAGE },
    ]);
    const done = lines[lines.length - 1];
    expect(done.type).toBe("done");
    if (done.type === "done" && "studentsFound" in done) {
      expect(done.studentsFound).toBe(entries.length);
      expect(done.studentsEmitted).toBe(entries.length - 1);
      expect(done.skipped).toEqual([{ student: "bob", reason: VIDEO_PENDING_MESSAGE }]);
    }
  });

  it("a mixed student (video plus text) is graded, not skipped", async () => {
    const { entries } = await ingestZipEntries(await buildVideoZip(), { videoEnabled: true });
    const dave = entries.find((entry) => entry.student === "dave") as StudentSubmissionEntry;
    expect(isVideoOnlyEntry(dave)).toBe(false);
    expect(countVideoFiles(dave)).toBe(1);
  });

  it("a video entry is nearly free on the per-item wire budget (nothing to stream)", async () => {
    const { entries } = await ingestZipEntries(await buildVideoZip(), { videoEnabled: true });
    for (const entry of entries) {
      expect(estimateNeededWireBytes(entry)).toBeLessThan(5000);
    }
  });

  it("a video is now CHARGED against the member cap (the silent-skip is closed)", async () => {
    const zip = new JSZip();
    zip.file("HW1/alice_1001_2001_big.mp4", seeded(600, 9));
    const buffer = await toBuffer(zip);
    await expect(extractSubmissions(buffer, { videoEnabled: true, limits: { maxMemberDeclaredBytes: 100 } })).rejects.toBeInstanceOf(
      ZipCapError
    );
    // Flag off: the same archive is still accepted (the member was skipped uncharged).
    await expect(
      extractSubmissions(buffer, { videoEnabled: false, limits: { maxMemberDeclaredBytes: 100 } })
    ).resolves.toBeDefined();
  });
});
