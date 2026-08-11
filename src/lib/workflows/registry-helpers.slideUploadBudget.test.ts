// Regression coverage for the slide-upload budget helpers shared by
// generate-worked-examples (steps.content-generators.ts) and lecture-qa
// (steps.content-insights.ts).
//
// Bug: both steps carried their OWN copy of a byte cap measured on FILE
// bytes (6MB), which is ~8MB once base64-encoded onto the wire - well above
// the platform's ~4.5MB request-body ceiling - so the cap never actually
// protected the request; the platform's opaque 413 fired before either
// step's friendlier refusal could. Neither copy budgeted several files
// TOGETHER either, so a request combining several individually-fine files
// could still overflow the platform limit undetected.
//
// Fix: one shared checkSlideFilesWireBudget, budgeted in WIRE bytes via
// checkFileWireBudget (src/lib/upload-budget.ts), given the FULL set of
// files that ride together in one request; and a separate checkSlideFileCap
// for the independent "how many files" question.
import { describe, it, expect, vi } from "vitest";

vi.mock("@/app/actions", () => ({
  listCourseContentAction: vi.fn(),
  listCourseHubAction: vi.fn(),
  getDeckTemplateAction: vi.fn(),
}));

import {
  MAX_SLIDE_FILES,
  checkSlideFileCap,
  checkSlideFilesWireBudget,
} from "./registry-helpers";
import { UPLOAD_WIRE_BUDGET_BYTES, maxFileBytesForWireBudget } from "@/lib/upload-budget";

const MB = 1024 * 1024;
// The largest a single file may be (in FILE bytes) and still fit the WIRE
// budget on its own - the exact boundary checkFileWireBudget enforces.
const MAX_SINGLE_FILE_BYTES = maxFileBytesForWireBudget(UPLOAD_WIRE_BUDGET_BYTES);

describe("checkSlideFilesWireBudget", () => {
  it("refuses a single file that alone is over budget", () => {
    const overBudget = MAX_SINGLE_FILE_BYTES + MB;
    const result = checkSlideFilesWireBudget([{ size: overBudget }], "This slide upload");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("This slide upload");
  });

  it("refuses several individually-fine files that TOGETHER exceed the budget", () => {
    // Each file alone is comfortably under MAX_SINGLE_FILE_BYTES...
    const perFile = 2 * MB;
    expect(
      checkSlideFilesWireBudget([{ size: perFile }], "one file alone").ok
    ).toBe(true);
    // ...but three of them together (6MB of FILE bytes -> 8MB on the wire)
    // blow the combined budget. A per-file check would miss this entirely.
    const result = checkSlideFilesWireBudget(
      [{ size: perFile }, { size: perFile }, { size: perFile }],
      "These slide files"
    );
    expect(result.ok).toBe(false);
  });

  it("accepts an under-budget set of files", () => {
    const result = checkSlideFilesWireBudget(
      [{ size: 500 * 1024 }, { size: 500 * 1024 }],
      "This slide upload"
    );
    expect(result.ok).toBe(true);
    expect(result.error).toBeUndefined();
  });
});

describe("checkSlideFileCap - the count cap, independent of the byte budget", () => {
  it("refuses too many files even when every file is tiny (bytes would pass)", () => {
    const tinyFiles = [{ size: 10 }, { size: 10 }, { size: 10 }, { size: 10 }];
    // The byte budget alone says these are fine...
    expect(checkSlideFilesWireBudget(tinyFiles, "tiny files").ok).toBe(true);
    // ...but there are more of them than the count cap allows.
    const capResult = checkSlideFileCap(tinyFiles.length, MAX_SLIDE_FILES);
    expect(capResult.ok).toBe(false);
    expect(capResult.error).toContain(String(MAX_SLIDE_FILES));
  });

  it("accepts a file count at or under the cap", () => {
    expect(checkSlideFileCap(MAX_SLIDE_FILES, MAX_SLIDE_FILES).ok).toBe(true);
    expect(checkSlideFileCap(1, MAX_SLIDE_FILES).ok).toBe(true);
  });

  it("the byte budget can still refuse a set that is within the count cap", () => {
    const oneHugeFile = [{ size: MAX_SINGLE_FILE_BYTES + MB }];
    expect(checkSlideFileCap(oneHugeFile.length, MAX_SLIDE_FILES).ok).toBe(true);
    expect(checkSlideFilesWireBudget(oneHugeFile, "This slide upload").ok).toBe(false);
  });
});
