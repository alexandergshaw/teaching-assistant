import { describe, it, expect } from "vitest";
import { resolveSelectionReconciliation } from "./selection-reconciliation";

const workflows = [{ id: "a" }, { id: "b" }];

describe("resolveSelectionReconciliation", () => {
  it("honors a deep-linked id that has not resolved yet (pre-load)", () => {
    const action = resolveSelectionReconciliation("deep-link-id", "a", workflows, false, false);
    expect(action).toEqual({ type: "none" });
  });

  it("fires a reload once the deep-linked id resolves", () => {
    const action = resolveSelectionReconciliation("b", "a", workflows, false, false);
    expect(action).toEqual({ type: "resolve", id: "b" });
  });

  it("falls back to the first workflow only after a successful load leaves the id stale", () => {
    const notLoaded = resolveSelectionReconciliation("missing-id", "a", workflows, false, false);
    expect(notLoaded).toEqual({ type: "none" });

    const failedLoad = resolveSelectionReconciliation("missing-id", "a", workflows, true, true);
    expect(failedLoad).toEqual({ type: "none" });

    const settled = resolveSelectionReconciliation("missing-id", "a", workflows, true, false);
    expect(settled).toEqual({ type: "fallback", id: "a" });
  });

  it("takes no action when the id already matches the loaded state", () => {
    const action = resolveSelectionReconciliation("a", "a", workflows, true, false);
    expect(action).toEqual({ type: "none" });
  });

  it("takes no action when there are no workflows to fall back to", () => {
    const action = resolveSelectionReconciliation("missing-id", null, [], true, false);
    expect(action).toEqual({ type: "none" });
  });
});
