// VIDEO-GRADING W2: the loose prepare logic with every dependency faked. Pins
// the FIXED ORDER (path -> stat -> head -> sniff), the size boundary, the
// delete-on-refusal rules, the O-1 invariant (videoRef, never rawBase64), and
// the head reader. No network: the head reader gets an injected fetch.
import { describe, it, expect, vi } from "vitest";
import { prepareLooseVideo, readObjectHead, sanitizeVideoName, type PrepareVideoDeps } from "./video-prepare";
import { VIDEO_HEAD_BYTES, VIDEO_MAX_BYTES } from "./video-limits";

const UID = "11111111-2222-4333-8444-555555555555";
const OBJ = "2f8a4b1e-5c3d-4e6f-8a9b-0c1d2e3f4a5b";
const PATH = `${UID}/grading-uploads/${OBJ}.mp4`;
const MP4_HEAD = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 2, 0, 0x69, 0x73, 0x6f, 0x6d, 0x6d, 0x70, 0x34, 0x31]);

function fakeDeps(overrides: Partial<PrepareVideoDeps> = {}) {
  const deps = {
    statObjectSize: vi.fn(async () => 5 * 1024 * 1024),
    readHead: vi.fn(async () => MP4_HEAD),
    remove: vi.fn(async () => undefined),
    ...overrides,
  };
  return { deps: deps as PrepareVideoDeps & typeof deps, ...deps };
}

describe("prepareLooseVideo: order and refusals", () => {
  it.each([
    ["traversal", `${UID}/grading-uploads/../x.mp4`],
    ["foreign user", `other/grading-uploads/${OBJ}.mp4`],
    ["a zip path", `${UID}/grading-uploads/${OBJ}.zip`],
    ["empty", ""],
    ["a non-string", 42],
  ])("a %s path is 400 and NOTHING in Storage is touched", async (_l, storagePath) => {
    const f = fakeDeps();
    const r = await prepareLooseVideo({ userId: UID, storagePath, deps: f.deps });
    expect(r).toMatchObject({ ok: false, status: 400 });
    expect(f.statObjectSize).not.toHaveBeenCalled();
    expect(f.readHead).not.toHaveBeenCalled();
    expect(f.remove).not.toHaveBeenCalled();
  });

  it("T3: the stat gate agrees with the client: MAX-1 and MAX accepted, MAX+1 refused 413 AND deleted, head never read", async () => {
    for (const size of [VIDEO_MAX_BYTES - 1, VIDEO_MAX_BYTES]) {
      const f = fakeDeps({ statObjectSize: vi.fn(async () => size) });
      expect((await prepareLooseVideo({ userId: UID, storagePath: PATH, deps: f.deps })).ok).toBe(true);
      expect(f.remove).not.toHaveBeenCalled();
    }
    const f = fakeDeps({ statObjectSize: vi.fn(async () => VIDEO_MAX_BYTES + 1) });
    const r = await prepareLooseVideo({ userId: UID, storagePath: PATH, deps: f.deps });
    expect(r).toMatchObject({ ok: false, status: 413, failure: "too large" });
    expect(f.remove).toHaveBeenCalledWith([PATH]);
    expect(f.readHead).not.toHaveBeenCalled();
  });

  it("an unknown size fails closed (cap cannot be shown to hold): refused, no head read", async () => {
    const f = fakeDeps({ statObjectSize: vi.fn(async () => null) });
    const r = await prepareLooseVideo({ userId: UID, storagePath: PATH, deps: f.deps });
    expect(r).toMatchObject({ ok: false, status: 404, failure: "upload failed" });
    expect(f.readHead).not.toHaveBeenCalled();
  });

  it("bad magic bytes: 415 'unsupported format' AND the object is deleted", async () => {
    const zipHead = new Uint8Array([0x50, 0x4b, 3, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const f = fakeDeps({ readHead: vi.fn(async () => zipHead) });
    const r = await prepareLooseVideo({ userId: UID, storagePath: PATH, deps: f.deps });
    expect(r).toMatchObject({ ok: false, status: 415, failure: "unsupported format" });
    expect(f.remove).toHaveBeenCalledWith([PATH]);
  });

  it("an unreadable head is a transient 502 'upload failed' and does NOT delete", async () => {
    const f = fakeDeps({ readHead: vi.fn(async () => null) });
    const r = await prepareLooseVideo({ userId: UID, storagePath: PATH, deps: f.deps });
    expect(r).toMatchObject({ ok: false, status: 502, failure: "upload failed" });
    expect(f.remove).not.toHaveBeenCalled();
  });

  it("the call order is stat, then head (never head first)", async () => {
    const calls: string[] = [];
    const f = fakeDeps({
      statObjectSize: vi.fn(async () => {
        calls.push("stat");
        return 100;
      }),
      readHead: vi.fn(async () => {
        calls.push("head");
        return MP4_HEAD;
      }),
    });
    await prepareLooseVideo({ userId: UID, storagePath: PATH, deps: f.deps });
    expect(calls).toEqual(["stat", "head"]);
  });
});

describe("prepareLooseVideo: success (T14, O-1)", () => {
  it("returns one entry carrying videoRef + the SNIFFED mime and NO rawBase64; the object is not deleted", async () => {
    const f = fakeDeps();
    const r = await prepareLooseVideo({ userId: UID, storagePath: PATH, name: "Jordan Walkthrough.mp4", label: "Jordan", deps: f.deps });
    if (!r.ok) throw new Error("expected ok");
    expect(r.entry.student).toBe("Jordan");
    expect(r.entry.mergedFileCount).toBe(1);
    const file = r.entry.submittedFiles[0];
    expect(file.videoRef).toEqual({ storagePath: PATH, sizeBytes: 5 * 1024 * 1024 });
    expect(file.rawBase64).toBeUndefined();
    expect("rawBase64" in file).toBe(false);
    expect(file.mimeType).toBe("video/mp4");
    expect(file.extension).toBe("mp4");
    expect(file.previewContent).toBe("[Video file: Jordan Walkthrough.mp4, 5.0MB, mp4]");
    expect(f.remove).not.toHaveBeenCalled();
  });

  it("the MIME comes from the bytes, not the extension: QuickTime bytes in a .mp4 go as video/quicktime", async () => {
    const qt = new Uint8Array(MP4_HEAD);
    qt.set([0x71, 0x74, 0x20, 0x20], 8);
    const f = fakeDeps({ readHead: vi.fn(async () => qt) });
    const r = await prepareLooseVideo({ userId: UID, storagePath: PATH, deps: f.deps });
    expect(r.ok && r.entry.submittedFiles[0].mimeType).toBe("video/quicktime");
  });

  it("without a label the student is the file-name stem; a hostile name is reduced to its last segment", async () => {
    const f = fakeDeps();
    const r = await prepareLooseVideo({ userId: UID, storagePath: PATH, name: "../../etc/Sam Rivera.mp4", deps: f.deps });
    expect(r.ok && r.entry.student).toBe("Sam Rivera");
    expect(r.ok && r.entry.submittedFiles[0].name).toBe("Sam Rivera.mp4");
  });

  it("sanitizeVideoName strips control characters, caps length and falls back", () => {
    expect(sanitizeVideoName("a\u0000b\nc.mp4", "x.mp4")).toBe("abc.mp4");
    expect(sanitizeVideoName("   ", "x.mp4")).toBe("x.mp4");
    expect(sanitizeVideoName(undefined, "x.mp4")).toBe("x.mp4");
    expect(sanitizeVideoName("a".repeat(500), "x").length).toBe(200);
  });
});

function streamOf(chunks: Uint8Array[]) {
  const cancel = vi.fn();
  let i = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) controller.enqueue(chunks[i++]);
      else controller.close();
    },
    cancel,
  });
  return { body, cancel };
}

describe("readObjectHead (injected fetch)", () => {
  it("asks for the first 64 bytes by Range, stops reading once it has them and cancels the body", async () => {
    const big = new Uint8Array(1000).fill(7);
    const { body, cancel } = streamOf([big, big, big]);
    const fetchImpl = vi.fn(async () => ({ ok: true, body }));
    const head = await readObjectHead("https://signed.example/x", fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith("https://signed.example/x", { headers: { Range: `bytes=0-${VIDEO_HEAD_BYTES - 1}` } });
    expect(head).toHaveLength(VIDEO_HEAD_BYTES);
    expect(cancel).toHaveBeenCalled();
  });

  it("assembles a head from several small chunks and returns fewer bytes for a short object", async () => {
    const { body } = streamOf([new Uint8Array([1, 2, 3]), new Uint8Array([4, 5])]);
    const head = await readObjectHead("u", async () => ({ ok: true, body }));
    expect(Array.from(head ?? [])).toEqual([1, 2, 3, 4, 5]);
  });

  it("null on a non-ok response, a missing body or a thrown fetch", async () => {
    expect(await readObjectHead("u", async () => ({ ok: false, body: null }))).toBeNull();
    expect(await readObjectHead("u", async () => ({ ok: true, body: null }))).toBeNull();
    expect(
      await readObjectHead("u", async () => {
        throw new Error("net");
      })
    ).toBeNull();
  });
});
