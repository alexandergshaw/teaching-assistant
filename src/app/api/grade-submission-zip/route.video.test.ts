import { describe, it, expect, vi, beforeEach } from "vitest";

// VIDEO-GRADING W2 (ops T16): the ingest route's in-zip video staging with the
// dark flag ON. The stager is built by the route, closed over userId and an
// `abandoned` flag; extraction is mocked so the test can drive the stager
// directly. Storage and the budget race are mocked; nothing dials out.
const requireAppOwnerMock = vi.fn();
vi.mock("@/lib/supabase/auth", () => ({
  requireAppOwner: (...args: unknown[]) => requireAppOwnerMock(...args),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ storage: { from: () => ({ list: async () => ({ data: [], error: null }) }) } }),
}));

const downloadFileMock = vi.fn();
const removeFilesMock = vi.fn();
const uploadFileMock = vi.fn();
vi.mock("@/lib/supabase/storage", () => ({
  downloadFile: (...args: unknown[]) => downloadFileMock(...args),
  removeFiles: (...args: unknown[]) => removeFilesMock(...args),
  uploadFile: (...args: unknown[]) => uploadFileMock(...args),
}));

const flag = vi.hoisted(() => ({ on: true }));
vi.mock("@/lib/grade/constants", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/grade/constants")>();
  return {
    ...actual,
    get VIDEO_GRADING_ENABLED() {
      return flag.on;
    },
  };
});

const ingestMock = vi.fn();
vi.mock("@/lib/grade/extraction", () => ({
  ingestZipEntries: (...args: unknown[]) => ingestMock(...args),
}));

const raceMock = vi.fn();
vi.mock("@/lib/bounded-race", () => ({
  raceWithTimeout: (...args: unknown[]) => raceMock(...args),
}));

import { POST } from "./route";
import { isVideoUploadPath } from "@/lib/grade/video-transport";
import type { StageVideoFn } from "@/lib/grade/video-leaf";
import type { NextRequest } from "next/server";

const USER = "11111111-2222-4333-8444-555555555555";
const GOOD_PATH = `${USER}/grading-uploads/abc.zip`;

function jsonRequest(body: unknown): NextRequest {
  return { headers: { get: () => "application/json" }, json: vi.fn(async () => body) } as unknown as NextRequest;
}

async function readLines(res: Response): Promise<Array<Record<string, unknown>>> {
  return (await res.text())
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

const BYTES = Buffer.from([1, 2, 3, 4]);

beforeEach(() => {
  vi.clearAllMocks();
  flag.on = true;
  requireAppOwnerMock.mockResolvedValue({ id: USER, email: "o@example.com" });
  downloadFileMock.mockResolvedValue({ data: new Blob([new Uint8Array(64)]), error: null });
  removeFilesMock.mockResolvedValue({ error: null });
  uploadFileMock.mockResolvedValue({ error: null });
  // default: the real behaviour of raceWithTimeout for a promise that settles
  raceMock.mockImplementation(async (work: Promise<unknown>) => {
    try {
      return { kind: "settled", value: await work };
    } catch (error) {
      return { kind: "failed", error };
    }
  });
});

describe("flag ON: the route hands extraction a stager", () => {
  it("stages to a path that passes the video path contract, with the closed content type, upsert false", async () => {
    let staged: Awaited<ReturnType<StageVideoFn>> | undefined;
    ingestMock.mockImplementation(async (_buf: unknown, options: { stageVideo: StageVideoFn }) => {
      staged = await options.stageVideo(BYTES, "quicktime");
      return { entries: [], attemptedSupportedFiles: 0, failedSupportedFiles: [], videoOutcomes: { accepted: 1, failed: {} } };
    });
    const res = await POST(jsonRequest({ storagePath: GOOD_PATH }));
    const lines = await readLines(res);
    expect(staged).toBeDefined();
    const storagePath = (staged as { storagePath: string }).storagePath;
    expect(isVideoUploadPath(USER, storagePath)).toBe(true);
    expect(storagePath.endsWith(".mov")).toBe(true);
    expect(uploadFileMock).toHaveBeenCalledTimes(1);
    const [bucket, path, , opts] = uploadFileMock.mock.calls[0] as [string, string, unknown, Record<string, unknown>];
    expect(bucket).toBe("course-files");
    expect(path).toBe(storagePath);
    expect(opts).toEqual({ contentType: "video/quicktime", upsert: false });
    // the ledger carries COUNTS only
    expect(lines[lines.length - 1]).toMatchObject({ type: "done", videoOutcomes: { accepted: 1, failed: {} } });
    // success keeps the staged object (grade time owns it): only the zip is removed
    expect(removeFilesMock).not.toHaveBeenCalledWith("course-files", [storagePath]);
  });

  it("an upload error is a typed per-file failure from the stager, not a throw", async () => {
    uploadFileMock.mockResolvedValue({ error: { message: "nope" } });
    let staged: unknown;
    ingestMock.mockImplementation(async (_b: unknown, options: { stageVideo: StageVideoFn }) => {
      staged = await options.stageVideo(BYTES, "mp4");
      return { entries: [], attemptedSupportedFiles: 0, failedSupportedFiles: [] };
    });
    await POST(jsonRequest({ storagePath: GOOD_PATH }));
    expect(staged).toEqual({ failure: "upload failed" });
  });

  it("T16: stage 2 of 4, then the budget expires -> the 2 staged paths are removed and the 3rd and 4th calls upload NOTHING", async () => {
    let releaseLoser: () => void = () => undefined;
    const loserGate = new Promise<void>((resolve) => {
      releaseLoser = resolve;
    });
    let twoStaged: () => void = () => undefined;
    const twoStagedSignal = new Promise<void>((resolve) => {
      twoStaged = resolve;
    });
    const results: unknown[] = [];
    ingestMock.mockImplementation(async (_b: unknown, options: { stageVideo: StageVideoFn }) => {
      results.push(await options.stageVideo(BYTES, "mp4"));
      results.push(await options.stageVideo(BYTES, "mp4"));
      twoStaged();
      await loserGate; // the race is lost while this is pending; the loser keeps running
      results.push(await options.stageVideo(BYTES, "mp4"));
      results.push(await options.stageVideo(BYTES, "mp4"));
      return { entries: [], attemptedSupportedFiles: 0, failedSupportedFiles: [] };
    });
    raceMock.mockImplementation(async () => {
      await twoStagedSignal;
      return { kind: "timedout" };
    });

    const res = await POST(jsonRequest({ storagePath: GOOD_PATH }));
    const lines = await readLines(res);
    expect(lines[0]).toMatchObject({ type: "done", videoFailure: "timed out" });

    const stagedPaths = uploadFileMock.mock.calls.map((c) => c[1] as string);
    expect(stagedPaths).toHaveLength(2);
    expect(removeFilesMock).toHaveBeenCalledWith("course-files", stagedPaths);

    releaseLoser();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(uploadFileMock).toHaveBeenCalledTimes(2); // calls 3 and 4 uploaded nothing
    expect(results.slice(2)).toEqual([{ failure: "timed out" }, { failure: "timed out" }]);
  });

  it("a whole-archive refusal (video-count) removes everything already staged", async () => {
    const { ZipCapError } = await import("@/lib/zip-caps");
    ingestMock.mockImplementation(async (_b: unknown, options: { stageVideo: StageVideoFn }) => {
      await options.stageVideo(BYTES, "mp4");
      throw new ZipCapError({
        code: "video-count",
        entryName: "n/5.mp4",
        chain: [],
        limitName: "ZIP_MAX_VIDEO_MEMBERS",
        limitValue: 4,
        limitIsBytes: false,
        observed: 5,
      });
    });
    const lines = await readLines(await POST(jsonRequest({ storagePath: GOOD_PATH })));
    expect(lines[0]).toMatchObject({ type: "done", videoFailure: "too many videos" });
    const stagedPath = uploadFileMock.mock.calls[0][1] as string;
    expect(removeFilesMock).toHaveBeenCalledWith("course-files", [stagedPath]);
  });

  it("sabotage control: with the flag OFF the same route passes NO stager", async () => {
    flag.on = false;
    ingestMock.mockResolvedValue({ entries: [], attemptedSupportedFiles: 0, failedSupportedFiles: [] });
    await POST(jsonRequest({ storagePath: GOOD_PATH }));
    expect((ingestMock.mock.calls[0][1] as { stageVideo?: unknown }).stageVideo).toBeUndefined();
  });
});
