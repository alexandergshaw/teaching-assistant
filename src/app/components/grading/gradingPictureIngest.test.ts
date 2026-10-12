import { describe, expect, it, vi } from "vitest";
import { maxFileBytesForWireBudget } from "@/lib/upload-budget";
import {
  describePictureRejection,
  ingestGradingPicture,
  type PictureFileLike,
  type TranscribeFn,
} from "./gradingPictureIngest";

function fakeFile(over: Partial<PictureFileLike> = {}): File {
  const f: PictureFileLike = { name: "rubric.png", size: 1000, type: "image/png", ...over };
  return f as unknown as File;
}

describe("describePictureRejection", () => {
  it("accepts a small image", () => {
    expect(describePictureRejection(fakeFile(), "rubric")).toBeNull();
  });

  it("accepts a file exactly at the budget and rejects one byte over with remediation", () => {
    const max = maxFileBytesForWireBudget();
    expect(describePictureRejection(fakeFile({ size: max }), "rubric")).toBeNull();
    const msg = describePictureRejection(fakeFile({ size: max + 1000 }), "assignment description");
    expect(msg).not.toBeNull();
    expect(msg).toContain("too large");
    expect(msg).toContain("assignment description");
    expect(msg).toMatch(/screenshot|smaller/i);
  });

  it("rejects a non-image with a message", () => {
    const msg = describePictureRejection(fakeFile({ type: "application/pdf", name: "r.pdf" }), "rubric");
    expect(msg).toContain("not an image");
  });
});

describe("ingestGradingPicture", () => {
  it("passes the base64 and the kind through to transcribe and returns its text", async () => {
    const transcribe = vi.fn<TranscribeFn>(async () => ({ text: "Criteria A" }));
    const read = vi.fn(async () => "QUJD");
    const rubric = await ingestGradingPicture(fakeFile(), "rubric", transcribe, read);
    expect(rubric).toEqual({ text: "Criteria A" });
    expect(transcribe).toHaveBeenLastCalledWith("QUJD", "rubric");
    await ingestGradingPicture(fakeFile(), "assignment description", transcribe, read);
    expect(transcribe).toHaveBeenLastCalledWith("QUJD", "assignment description");
  });

  it("returns an action error unchanged", async () => {
    const result = await ingestGradingPicture(
      fakeFile(),
      "rubric",
      async () => ({ error: "boom" }),
      async () => "QUJD"
    );
    expect(result).toEqual({ error: "boom" });
  });

  it("rejects an oversize file without reading or transcribing", async () => {
    const transcribe = vi.fn<TranscribeFn>(async () => ({ text: "x" }));
    const read = vi.fn(async () => "QUJD");
    const result = await ingestGradingPicture(
      fakeFile({ size: maxFileBytesForWireBudget() + 5000 }),
      "rubric",
      transcribe,
      read
    );
    expect("rejected" in result).toBe(true);
    expect(read).not.toHaveBeenCalled();
    expect(transcribe).not.toHaveBeenCalled();
  });

  it("downscales an over-budget image then accepts and transcribes it", async () => {
    const transcribe = vi.fn<TranscribeFn>(async () => ({ text: "ok" }));
    const read = vi.fn<(f: File) => Promise<string>>(async () => "QUJD");
    const small = fakeFile({ size: 500_000, type: "image/jpeg", name: "p.jpg" });
    const downscale = vi.fn<(f: File) => Promise<File | null>>(async () => small);
    const big = fakeFile({ size: maxFileBytesForWireBudget() + 1_000_000, type: "image/jpeg", name: "p.jpg" });
    const result = await ingestGradingPicture(big, "rubric", transcribe, read, downscale);
    expect(result).toEqual({ text: "ok" });
    expect(downscale).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledWith(small);
  });

  it("never downscales a non-image and keeps its refusal", async () => {
    const downscale = vi.fn<(f: File) => Promise<File | null>>(async () => null);
    const result = await ingestGradingPicture(
      fakeFile({ size: maxFileBytesForWireBudget() + 1000, type: "application/pdf", name: "r.pdf" }),
      "rubric",
      async () => ({ text: "x" }),
      async () => "QUJD",
      downscale
    );
    expect("rejected" in result).toBe(true);
    expect(downscale).not.toHaveBeenCalled();
  });

  it("falls through to the oversize refusal when downscale returns null, throws, or stays over", async () => {
    const big = () => fakeFile({ size: maxFileBytesForWireBudget() + 1_000_000, type: "image/jpeg" });
    const transcribe = vi.fn<TranscribeFn>(async () => ({ text: "x" }));
    const read = async () => "QUJD";
    const nul = await ingestGradingPicture(big(), "rubric", transcribe, read, async () => null);
    expect(nul).toEqual({ rejected: expect.stringContaining("too large") });
    const thrown = await ingestGradingPicture(big(), "rubric", transcribe, read, async () => {
      throw new Error("decode");
    });
    expect("rejected" in thrown).toBe(true);
    const still = await ingestGradingPicture(big(), "rubric", transcribe, read, async () => big());
    expect("rejected" in still).toBe(true);
    expect(transcribe).not.toHaveBeenCalled();
  });

  it("surfaces a read failure as an error, never a transcribe call", async () => {
    const transcribe = vi.fn<TranscribeFn>(async () => ({ text: "x" }));
    const result = await ingestGradingPicture(fakeFile(), "rubric", transcribe, async () => {
      throw new Error("disk gone");
    });
    expect(result).toEqual({ error: "disk gone" });
    expect(transcribe).not.toHaveBeenCalled();
  });
});
