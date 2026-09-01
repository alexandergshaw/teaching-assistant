import { describe, expect, it } from "vitest";
import { bulkDeleteConfirmLabel } from "./bulkDeleteLabel";

describe("bulkDeleteConfirmLabel", () => {
  it("reads plain 'Delete' when not armed, regardless of count", () => {
    expect(bulkDeleteConfirmLabel(false, 1)).toBe("Delete");
    expect(bulkDeleteConfirmLabel(false, 40)).toBe("Delete");
  });

  it("states the exact count it is about to delete when armed - B1's own requirement", () => {
    expect(bulkDeleteConfirmLabel(true, 40)).toBe("Confirm delete 40 files");
  });

  it("singularizes for exactly one file", () => {
    expect(bulkDeleteConfirmLabel(true, 1)).toBe("Confirm delete 1 file");
  });

  it("reflects a DIFFERENT count when armed on 2 then the selection grows to 40 - the B1 scenario", () => {
    // Armed on a small selection...
    const armedOnTwo = bulkDeleteConfirmLabel(true, 2);
    expect(armedOnTwo).toBe("Confirm delete 2 files");
    // ...confirmArming.ts disarms on any selection change, so by the time the
    // selection has grown to 40 the button is back to unarmed "Delete" - it
    // can never read "Confirm delete 40" while still only armed for 2.
    const afterGrowingUnarmed = bulkDeleteConfirmLabel(false, 40);
    expect(afterGrowingUnarmed).toBe("Delete");
    expect(afterGrowingUnarmed).not.toContain("40");
  });
});
