// VIDEO-GRADING W2: the caps are single-sourced. Each quantity has ONE
// definition; where it is the same quantity as a zip cap it is defined by
// IMPORT. Relation tests (not literal pins) so a drift in either direction
// is red, plus source-text pins that no second literal was introduced.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  DEFAULT_ZIP_LIMITS,
  ZIP_EXTRACTION_CONCURRENCY,
  ZIP_MAX_CUMULATIVE_DECLARED_BYTES,
  ZIP_MAX_MEMBER_DECLARED_BYTES,
  ZIP_MAX_VIDEO_MEMBERS,
  ZipCapError,
} from "@/lib/zip-caps";
import { GRADING_ZIP_MAX_BYTES, chooseZipTransport } from "./grading-zip-transport";
import { VIDEO_MAX_BYTES, VIDEO_MAX_PENDING_STAGED } from "./video-limits";
import { VIDEO_FAILURE_CLASSES } from "./video-failure";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const MiB = 1024 * 1024;

describe("single-sourced caps", () => {
  it("VIDEO_MAX_BYTES is the per-member zip cap (40MiB) by value and by import", () => {
    expect(VIDEO_MAX_BYTES).toBe(ZIP_MAX_MEMBER_DECLARED_BYTES);
    expect(VIDEO_MAX_BYTES).toBe(DEFAULT_ZIP_LIMITS.maxMemberDeclaredBytes);
    expect(VIDEO_MAX_BYTES).toBe(40 * MiB);
    const src = read("src/lib/grade/video-limits.ts");
    expect(src).toMatch(/import \{ ZIP_MAX_MEMBER_DECLARED_BYTES \} from "@\/lib\/zip-caps"/);
    expect(src).not.toMatch(/\d+\s*\*\s*1024\s*\*\s*1024/);
  });

  it("T6: GRADING_ZIP_MAX_BYTES is the cumulative cap + 5MiB and can never sit below it", () => {
    expect(GRADING_ZIP_MAX_BYTES).toBe(ZIP_MAX_CUMULATIVE_DECLARED_BYTES + 5 * MiB);
    expect(GRADING_ZIP_MAX_BYTES).toBe(105 * MiB);
    expect(GRADING_ZIP_MAX_BYTES).toBeGreaterThanOrEqual(ZIP_MAX_CUMULATIVE_DECLARED_BYTES);
    const src = read("src/lib/grade/grading-zip-transport.ts");
    expect(src).toContain("ZIP_MAX_CUMULATIVE_DECLARED_BYTES");
    expect(src).not.toMatch(/GRADING_ZIP_MAX_BYTES = \d+ \* 1024/);
  });

  it("the raised ceiling reaches the client transport choice: a 60MiB zip is now 'storage', 105MiB+1 is refused", () => {
    expect(chooseZipTransport({ name: "c.zip", size: 60 * MiB }, true)).toEqual({ kind: "storage" });
    expect(chooseZipTransport({ name: "c.zip", size: GRADING_ZIP_MAX_BYTES }, true)).toEqual({ kind: "storage" });
    expect(chooseZipTransport({ name: "c.zip", size: GRADING_ZIP_MAX_BYTES + 1 }, true).kind).toBe("refused");
  });

  it("ZIP_MAX_VIDEO_MEMBERS is 4 = the extraction concurrency, and the loose pending cap is 6", () => {
    expect(ZIP_MAX_VIDEO_MEMBERS).toBe(4);
    expect(ZIP_MAX_VIDEO_MEMBERS).toBe(ZIP_EXTRACTION_CONCURRENCY);
    expect(VIDEO_MAX_PENDING_STAGED).toBe(6);
  });

  it("the video-count refusal is a Refused: message that names the knob", () => {
    const error = new ZipCapError({
      code: "video-count",
      entryName: "HW/five.mp4",
      chain: [],
      limitName: "ZIP_MAX_VIDEO_MEMBERS",
      limitValue: ZIP_MAX_VIDEO_MEMBERS,
      limitIsBytes: false,
      observed: 5,
    });
    expect(error.message.startsWith("Refused: ")).toBe(true);
    expect(error.message).toContain("ZIP_MAX_VIDEO_MEMBERS (4)");
    expect(error.message).toContain("video files");
    expect(error.code).toBe("video-count");
  });

  it("the failure vocabulary has exactly the 8 ops classes, no duplicates", () => {
    expect([...VIDEO_FAILURE_CLASSES].sort()).toEqual(
      [
        "extraction failed",
        "model rejected",
        "not supported here",
        "timed out",
        "too large",
        "too many videos",
        "unsupported format",
        "upload failed",
      ].sort()
    );
  });
});
