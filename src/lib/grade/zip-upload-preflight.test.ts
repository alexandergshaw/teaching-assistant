import { describe, expect, it } from "vitest";
import { maxFileBytesForWireBudget } from "@/lib/upload-budget";
import { preflightUploadFile } from "./zip-upload-preflight";

const MB = 1024 * 1024;
const MAX = maxFileBytesForWireBudget();

// Frozen literal: the limit the owner-facing message must name.
const LIMIT_TEXT = "2.6MB";

describe("preflightUploadFile (leaf logic only; the call sites are pinned by source text)", () => {
  it("pins the disk-bytes limit at its literal value", () => {
    expect(MAX).toBe(2752512);
  });

  it("accepts a file well under budget", () => {
    expect(preflightUploadFile({ name: "a.zip", size: 1 * MB }, "This file")).toEqual({ ok: true });
  });

  it("accepts a file exactly at the boundary", () => {
    expect(preflightUploadFile({ name: "a.zip", size: MAX }, "This file")).toEqual({ ok: true });
  });

  it("rejects one byte over the boundary", () => {
    expect(preflightUploadFile({ name: "a.zip", size: MAX + 1 }, "This file").ok).toBe(false);
  });

  it("rejects the 13 MB zip with a message naming the size, the limit and the remedy", () => {
    const result = preflightUploadFile({ name: "bulk.zip", size: 13 * MB }, "The student submissions file");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("The student submissions file");
    expect(result.message).toContain("13.0MB");
    expect(result.message).toContain(LIMIT_TEXT);
    expect(result.message).toContain("Nothing was uploaded");
  });
});
