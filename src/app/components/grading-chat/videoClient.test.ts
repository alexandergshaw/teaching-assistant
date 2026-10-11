// VIDEO-GRADING W4: the loose video path (single and multi, which is the same
// sink iterated) and the default prepareVideo POST, with every dependency
// injected. Nothing dials out.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { submitLooseVideo, postPrepareVideo, videoFailureOf, VideoGradeError, type SubmitLooseVideoArgs } from "./videoClient";
import { VIDEO_MAX_BYTES, VIDEO_MAX_PENDING_STAGED } from "@/lib/grade/video-limits";
import type { GradingZipStorage } from "@/lib/grade/grading-zip-transport";

const recorded: Array<{ failure: string | null }> = [];
vi.mock("./videoDiagnostic", () => ({
  recordVideoSettled: (args: { failure: string | null }) => {
    recorded.push({ failure: args.failure });
    return true;
  },
}));

const STORAGE = {} as GradingZipStorage;
const PATH = "u1/grading-uploads/2f8a4b1e-5c3d-4e6f-8a9b-0c1d2e3f4a5b.mp4";

function fileOf(name: string, size = 10): File {
  return new File([new Uint8Array(size)], name);
}

type Overrides = Partial<SubmitLooseVideoArgs>;

function build(overrides: Overrides = {}) {
  const upload = vi.fn<NonNullable<SubmitLooseVideoArgs["upload"]>>(async () => ({ ok: true, storagePath: PATH }));
  const remove = vi.fn(async () => undefined);
  const submit = vi.fn<SubmitLooseVideoArgs["submit"]>(async () => ({ kind: "accepted", entryCount: 1 }));
  const ensureSession = vi.fn(async () => true);
  const args: SubmitLooseVideoArgs = {
    file: fileOf("demo.mp4"),
    userId: "u1",
    storage: STORAGE,
    pendingStaged: 0,
    enabled: true,
    ensureSession,
    sessionRefusal: () => "no session",
    submit,
    upload,
    remove,
    ...overrides,
  };
  return { args, upload, remove, submit, ensureSession };
}

beforeEach(() => {
  recorded.length = 0;
});

describe("submitLooseVideo", () => {
  it("returns null for a non-video so the caller keeps the unchanged zip/body path", async () => {
    const { args, upload, submit } = build({ file: fileOf("essay.docx") });
    expect(await submitLooseVideo(args)).toBeNull();
    expect(upload).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });

  it("uploads a video, then submits a storaged-video input carrying only the path", async () => {
    const { args, upload, submit } = build({ label: "Sam" });
    const outcome = await submitLooseVideo(args);
    expect(outcome).toEqual({ kind: "accepted", entryCount: 1 });
    expect(upload).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledWith({ kind: "storaged-video", storagePath: PATH, name: "demo.mp4", label: "Sam" });
  });

  it("a flag-off refusal uploads nothing, begins no session and records the typed class", async () => {
    const { args, upload, ensureSession } = build({ enabled: false });
    const outcome = await submitLooseVideo(args);
    expect(outcome?.kind).toBe("refused");
    expect(upload).not.toHaveBeenCalled();
    expect(ensureSession).not.toHaveBeenCalled();
    expect(recorded).toEqual([{ failure: "not supported here" }]);
  });

  it("refuses MAX+1 before any upload (too large) and accepts exactly MAX", async () => {
    const over = build({ file: { name: "big.mp4", size: VIDEO_MAX_BYTES + 1 } as unknown as File });
    const refused = await submitLooseVideo(over.args);
    expect(refused?.kind).toBe("refused");
    expect(over.upload).not.toHaveBeenCalled();
    expect(recorded).toEqual([{ failure: "too large" }]);

    const at = build({ file: { name: "ok.mp4", size: VIDEO_MAX_BYTES } as unknown as File });
    expect((await submitLooseVideo(at.args))?.kind).toBe("accepted");
    expect(at.upload).toHaveBeenCalledTimes(1);
  });

  it("enforces the pending-staged cap (5 of 6 ok, 6 refused)", async () => {
    const ok = build({ pendingStaged: VIDEO_MAX_PENDING_STAGED - 1 });
    expect((await submitLooseVideo(ok.args))?.kind).toBe("accepted");
    const full = build({ pendingStaged: VIDEO_MAX_PENDING_STAGED });
    expect((await submitLooseVideo(full.args))?.kind).toBe("refused");
    expect(full.upload).not.toHaveBeenCalled();
    expect(recorded).toEqual([{ failure: "too many videos" }]);
  });

  it("a signed-out user is refused before any upload", async () => {
    const { args, upload } = build({ userId: null });
    expect((await submitLooseVideo(args))?.kind).toBe("refused");
    expect(upload).not.toHaveBeenCalled();
  });

  it("a refused session start surfaces the session reason and uploads nothing", async () => {
    const { args, upload } = build({ ensureSession: async () => false });
    expect(await submitLooseVideo(args)).toEqual({ kind: "refused", reason: "no session" });
    expect(upload).not.toHaveBeenCalled();
  });

  it("an upload failure is a refusal with the typed class and no submit", async () => {
    const { args, submit } = build({
      upload: async () => ({ ok: false, failure: "upload failed", message: "Could not upload" }),
    });
    expect(await submitLooseVideo(args)).toEqual({ kind: "refused", reason: "Could not upload" });
    expect(submit).not.toHaveBeenCalled();
    expect(recorded).toEqual([{ failure: "upload failed" }]);
  });

  it("removes the staged object when the driver refuses, and when it throws", async () => {
    const refusing = build({ submit: async () => ({ kind: "refused", reason: "bad" }) });
    await submitLooseVideo(refusing.args);
    expect(refusing.remove).toHaveBeenCalledWith(STORAGE, PATH);

    const throwing = build({
      submit: async () => {
        throw new Error("network");
      },
    });
    await expect(submitLooseVideo(throwing.args)).rejects.toThrow("network");
    expect(throwing.remove).toHaveBeenCalledWith(STORAGE, PATH);

    const accepted = build();
    await submitLooseVideo(accepted.args);
    expect(accepted.remove).not.toHaveBeenCalled();
  });

  it("loose MULTI: each video in a batch is its own upload and submit", async () => {
    const shared = build();
    for (const name of ["a.mp4", "b.webm", "c.mov"]) {
      await submitLooseVideo({ ...shared.args, file: fileOf(name) });
    }
    expect(shared.upload).toHaveBeenCalledTimes(3);
    expect(shared.submit).toHaveBeenCalledTimes(3);
  });
});

describe("postPrepareVideo", () => {
  function stubFetch(res: { ok: boolean; body: unknown } | "throw") {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        if (res === "throw") throw new Error("offline");
        return { ok: res.ok, json: async () => res.body };
      })
    );
  }

  it("returns the entry on success", async () => {
    const entry = { student: "demo", content: "c", mergedFileCount: 1, submittedFiles: [] };
    stubFetch({ ok: true, body: { entry } });
    expect(await postPrepareVideo(PATH, "demo.mp4")).toEqual({ kind: "entry", entry });
  });

  it("carries the server's typed class and worded message on a refusal", async () => {
    stubFetch({ ok: false, body: { error: "too big", videoFailure: "too large" } });
    expect(await postPrepareVideo(PATH, "demo.mp4")).toEqual({ kind: "refused", reason: "too big", videoFailure: "too large" });
  });

  it("never throws: a network error is an upload-failed refusal", async () => {
    stubFetch("throw");
    const out = await postPrepareVideo(PATH, "demo.mp4");
    expect(out).toMatchObject({ kind: "refused", videoFailure: "upload failed" });
    vi.unstubAllGlobals();
  });
});

describe("videoFailureOf", () => {
  it("reads the typed class off a VideoGradeError only", () => {
    expect(videoFailureOf(new VideoGradeError("m", "timed out"))).toBe("timed out");
    expect(videoFailureOf(new Error("timed out"))).toBeNull();
    expect(videoFailureOf("timed out")).toBeNull();
  });
});
