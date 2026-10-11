// VIDEO-GRADING W3 (ops 10.2 "bytes-reach", T15): ONE chain test, fakes only, no
// network. A real zip with a known mp4 -> the in-zip ingest hands the bytes to a
// fake stager -> the entry carries only a videoRef -> the grade-time seam
// downloads it from a fake Storage -> a fake Files client receives the SAME
// bytes -> the part handed to the (mocked) model call is a fileData part built
// from the fake client's uri -> the fake client's delete is called. The real
// upload and the real model result are owner-walk (ops R-1/R-2), not asserted.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "crypto";
import JSZip from "jszip";

vi.mock("../gemini", () => ({
  getGeminiInterRequestDelayMs: () => 0,
  getGeminiMaxCharsPerSubmission: () => 100000,
  getGeminiMaxOutputTokens: () => 700,
  getGeminiMaxSubmissions: () => 5,
}));
vi.mock("../llm", () => ({ callLlm: vi.fn() }));
vi.mock("../code-runner", () => ({ runSubmittedCode: vi.fn(async () => null) }));

import { callLlm, type LlmPart } from "../llm";
import { ingestZipEntries } from "./extraction";
import { gradeEntries } from "./engine";
import { withEntryVideos, type VideoSeamDeps } from "./video-grade-seam";
import type { StageVideoFn } from "./video-leaf";
import type { GeminiFilesClient } from "../gemini-files";

const mockCallLlm = vi.mocked(callLlm);
const sha = (b: Uint8Array): string => createHash("sha256").update(b).digest("hex");

const MP4_HEAD = [0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 2, 0, 0x69, 0x73, 0x6f, 0x6d, 0x6d, 0x70, 0x34, 0x31];
function mp4(length: number): Uint8Array {
  const out = new Uint8Array(length);
  let state = 12345;
  for (let i = 0; i < length; i += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    out[i] = state >>> 24;
  }
  out.set(MP4_HEAD, 0);
  return out;
}

const GOOD_RESPONSE = {
  ok: true,
  text: JSON.stringify({ overallComment: "ok", rubricResults: [{ area: "Clarity", score: "8/10" }], totalScore: "8/10" }),
  finishReason: "STOP",
};

const FAKE_URI = "https://generativelanguage.googleapis.com/v1beta/files/fake-uri-1";
const USER = "u1";

interface Harness {
  deps: VideoSeamDeps;
  uploaded: Uint8Array[];
  upload: ReturnType<typeof vi.fn>;
  deleteFile: ReturnType<typeof vi.fn>;
  removeObjects: ReturnType<typeof vi.fn>;
  stored: Map<string, Uint8Array>;
}

function harness(stored: Map<string, Uint8Array>): Harness {
  const uploaded: Uint8Array[] = [];
  const upload = vi.fn(async (input: { bytes: Uint8Array }) => {
    uploaded.push(input.bytes);
    return { name: "files/fake-1", uri: FAKE_URI };
  });
  const deleteFile = vi.fn(async () => undefined);
  const removeObjects = vi.fn(async () => undefined);
  const filesClient: GeminiFilesClient = { upload, waitActive: vi.fn(async () => undefined), delete: deleteFile };
  const deps: VideoSeamDeps = {
    download: async (path) => {
      const bytes = stored.get(path);
      if (!bytes) return null;
      return { size: bytes.byteLength, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer };
    },
    removeObjects,
    filesClient,
    newUploadId: () => "fixed",
  };
  return { deps, uploaded, upload, deleteFile, removeObjects, stored };
}

async function ingestOne(video: Uint8Array): Promise<{ entry: Awaited<ReturnType<typeof ingestZipEntries>>["entries"][number]; staged: Buffer[]; stored: Map<string, Uint8Array> }> {
  const zip = new JSZip();
  zip.file("HW/alice_1001_2001_demo.mp4", video, { createFolders: false });
  const buffer = await zip.generateAsync({ type: "arraybuffer", compression: "STORE" });
  const staged: Buffer[] = [];
  const stored = new Map<string, Uint8Array>();
  const stageVideo: StageVideoFn = async (bytes) => {
    staged.push(bytes);
    const path = `${USER}/grading-uploads/00000000-0000-4000-8000-00000000000${staged.length}.mp4`;
    stored.set(path, new Uint8Array(bytes));
    return { storagePath: path };
  };
  const { entries } = await ingestZipEntries(buffer, { videoEnabled: true, stageVideo });
  expect(entries).toHaveLength(1);
  return { entry: entries[0], staged, stored };
}

const CTX = { userId: USER, uploadDeadlineMs: Date.now() + 60_000 };

beforeEach(() => {
  mockCallLlm.mockReset();
  mockCallLlm.mockResolvedValue(GOOD_RESPONSE as never);
});

describe("the bytes-reach chain (ops 10.2 / T15)", () => {
  it("bytes survive zip -> stage -> Storage -> Files upload; the model part is built from the client's uri; the file is deleted", async () => {
    const video = mp4(4096);
    const h = sha(video);
    const { entry, staged, stored } = await ingestOne(video);

    // hop 1: the stager received the member's exact bytes
    expect(sha(staged[0])).toBe(h);
    const ref = entry.submittedFiles[0].videoRef;
    expect(ref?.storagePath).toBe(`${USER}/grading-uploads/00000000-0000-4000-8000-000000000001.mp4`);
    expect(entry.submittedFiles[0].rawBase64).toBeUndefined();

    // hop 2: the grade-time seam downloads from Storage and uploads to the Files client
    const f = harness(stored);
    const outcome = await withEntryVideos(f.deps, CTX, entry, (extraAttachments) =>
      gradeEntries([entry], "do it", "Clarity: 10 points", "gemini", null, { extraAttachments })
    );
    expect(outcome.ok).toBe(true);
    expect(f.uploaded).toHaveLength(1);
    expect(sha(f.uploaded[0])).toBe(h);

    // hop 3: the LlmPart handed to the model is exactly the fileData of the fake uri
    expect(mockCallLlm).toHaveBeenCalledTimes(1);
    const parts = mockCallLlm.mock.calls[0][0].contents[0].parts;
    const fileParts = parts.filter((p): p is Extract<LlmPart, { fileData: unknown }> => "fileData" in p);
    expect(fileParts).toEqual([{ fileData: { fileUri: FAKE_URI, mimeType: "video/mp4" } }]);
    expect(parts.some((p) => "inlineData" in p)).toBe(false);

    // hop 4: cleanup
    expect(f.deleteFile).toHaveBeenCalledWith("files/fake-1");
    expect(f.removeObjects).toHaveBeenCalledWith([ref?.storagePath]);
  });

  it("the Files delete still runs when the model call fails (the error path), and the Storage object is kept for retry", async () => {
    mockCallLlm.mockResolvedValue({ ok: false, status: 500, body: "boom" } as never);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { entry, stored } = await ingestOne(mp4(2048));
    const f = harness(stored);
    const outcome = await withEntryVideos(
      f.deps,
      CTX,
      entry,
      (extraAttachments) => gradeEntries([entry], "do it", "Clarity: 10 points", "gemini", null, { extraAttachments }),
      (run) => run.results[0]?.ungraded?.kind === "grading-failed"
    );
    expect(outcome.ok).toBe(true);
    expect(outcome.ok && outcome.value.results[0].ungraded?.kind).toBe("grading-failed");
    expect(f.deleteFile).toHaveBeenCalledWith("files/fake-1");
    expect(f.removeObjects).not.toHaveBeenCalled();
  });

  it("without extraAttachments no fileData part is sent (flag-off shape unchanged)", async () => {
    const { entry } = await ingestOne(mp4(2048));
    await gradeEntries([entry], "do it", "Clarity: 10 points", "gemini", null, {});
    const parts = mockCallLlm.mock.calls[0][0].contents[0].parts;
    expect(parts.some((p) => "fileData" in p)).toBe(false);
  });
});
