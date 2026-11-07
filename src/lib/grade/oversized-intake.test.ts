import { describe, expect, it } from "vitest";
import { ITEM_REQUEST_BYTE_BUDGET } from "@/app/components/grading/incrementalRunPlan";
import { oversizedIntakeReason } from "./oversized-intake";

describe("oversized intake refusal", () => {
  it("bounds names and reports the number omitted", () => {
    const entries = Array.from({ length: 12 }, (_, i) => ({ student: `Student ${i} ${"x".repeat(500)}`, content: "x".repeat(ITEM_REQUEST_BYTE_BUDGET + 1), mergedFileCount: 0, submittedFiles: [] }));
    const reason = oversizedIntakeReason(entries)!;
    expect(reason).toContain("Student 0");
    expect(reason).toContain("and 2 more");
    expect(reason.length).toBeLessThan(1100);
  });
});
