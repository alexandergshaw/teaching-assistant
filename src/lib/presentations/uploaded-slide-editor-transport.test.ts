import { describe, expect, it } from "vitest";
import { UPLOAD_WIRE_BUDGET_BYTES } from "@/lib/upload-budget";
import { isUploadedSlideEditorRequestWithinBudget, serializeUploadedSlideEditorRequest } from "./uploaded-slide-editor-transport";

describe("uploaded slide editor combined request budget", () => {
  it("accepts the exact byte boundary and refuses one byte over before fetch", () => {
    const exact = `{"x":"${"a".repeat(UPLOAD_WIRE_BUDGET_BYTES - 8)}"}`;
    expect(new TextEncoder().encode(exact).byteLength).toBe(UPLOAD_WIRE_BUDGET_BYTES);
    expect(isUploadedSlideEditorRequestWithinBudget(UPLOAD_WIRE_BUDGET_BYTES)).toBe(true);
    expect(isUploadedSlideEditorRequestWithinBudget(UPLOAD_WIRE_BUDGET_BYTES + 1)).toBe(false);
    expect(() => serializeUploadedSlideEditorRequest({ x: "a".repeat(UPLOAD_WIRE_BUDGET_BYTES - 7) })).toThrow(/request is too large/);
  });
});
