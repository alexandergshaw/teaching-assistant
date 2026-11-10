import { describe, expect, it } from "vitest";
import { createDiagnosticExportAccountFence } from "./diagnostic-export-account";

describe("diagnostic export account fence", () => {
  it("invalidates an export across account transitions including a return to the same user", () => {
    const fence = createDiagnosticExportAccountFence();
    fence.commit("a");
    const original = fence.snapshot();
    expect(fence.current(original)).toBe(true);
    fence.commit("b");
    fence.commit("a");
    expect(fence.current(original)).toBe(false);
    expect(fence.current(fence.snapshot())).toBe(true);
    fence.commit(null);
    expect(fence.current(fence.snapshot())).toBe(false);
  });
});
