import { describe, expect, it } from "vitest";
import { bulkRemoveFromModuleBannerText, bulkRemoveFromModuleButtonLabel } from "./bulkRemoveFromModuleCopy";

describe("bulkRemoveFromModuleButtonLabel", () => {
  it("reads 'Remove' when not armed", () => {
    expect(bulkRemoveFromModuleButtonLabel(false)).toBe("Remove");
  });

  it("reads 'Confirm remove' when armed - B2's two-click arm, matching the per-row idiom", () => {
    expect(bulkRemoveFromModuleButtonLabel(true)).toBe("Confirm remove");
  });
});

describe("bulkRemoveFromModuleBannerText", () => {
  it("names every kind of loss B2 requires: placement, position, indent, title override", () => {
    const text = bulkRemoveFromModuleBannerText(3);
    expect(text).toContain("placement");
    expect(text).toContain("position");
    expect(text).toContain("indent");
    expect(text).toContain("title override");
  });

  it("states the items stay in Canvas and placement is not auto-restored", () => {
    const text = bulkRemoveFromModuleBannerText(3);
    expect(text).toContain("stay in Canvas");
    expect(text).toContain("not restored automatically");
  });

  it("singularizes for exactly one item", () => {
    const text = bulkRemoveFromModuleBannerText(1);
    expect(text).toContain("selected item from its module");
    expect(text).not.toContain("items");
    expect(text).not.toContain("their modules");
  });

  it("pluralizes for more than one item", () => {
    const text = bulkRemoveFromModuleBannerText(2);
    expect(text).toContain("selected items from their modules");
    expect(text).not.toContain("its module");
  });
});
