// Frozen-literal tests for taskLoadState.ts - BLOCKER 3/4 from the
// Tasks-tab UX audit: a failed load must never say "no courses yet", and
// must never be silent about failing.
import { describe, expect, it } from "vitest";
import { errorBannerText, shouldShowEmptyState, shouldShowMainContent } from "./taskLoadState";

describe("shouldShowEmptyState", () => {
  it("true for a genuinely empty account (idle, zero courses)", () => {
    expect(shouldShowEmptyState("idle", 0)).toBe(true);
  });

  it("THE DEFECT this fixes: false when the load FAILED, even with zero cached courses", () => {
    expect(shouldShowEmptyState("error", 0)).toBe(false);
  });

  it("false while still loading", () => {
    expect(shouldShowEmptyState("loading", 0)).toBe(false);
  });

  it("false once there are real courses", () => {
    expect(shouldShowEmptyState("idle", 5)).toBe(false);
  });
});

describe("shouldShowMainContent", () => {
  it("true once loading has finished and there is data, regardless of a since-failed background refresh", () => {
    expect(shouldShowMainContent("idle", 12)).toBe(true);
    expect(shouldShowMainContent("error", 12)).toBe(true);
  });

  it("false while loading, even with stale cached courses already in state", () => {
    expect(shouldShowMainContent("loading", 12)).toBe(false);
  });

  it("false with zero courses in every state", () => {
    expect(shouldShowMainContent("idle", 0)).toBe(false);
    expect(shouldShowMainContent("error", 0)).toBe(false);
    expect(shouldShowMainContent("loading", 0)).toBe(false);
  });
});

describe("errorBannerText", () => {
  it("null when there is no error", () => {
    expect(errorBannerText("idle", null)).toBeNull();
    expect(errorBannerText("error", null)).toBeNull();
  });

  it("a hard failure (state === error) shows the raw error, unprefixed", () => {
    expect(errorBannerText("error", "Network request failed.")).toBe("Network request failed.");
  });

  it("a silent background-refresh failure (state stays idle) gets the non-blocking prefix", () => {
    expect(errorBannerText("idle", "Network request failed.")).toBe(
      "Could not refresh - showing the last loaded data. Network request failed."
    );
  });

  it("sabotage canary: the two states must not produce the same text for the same underlying error", () => {
    const err = "Timed out.";
    expect(errorBannerText("error", err)).not.toBe(errorBannerText("idle", err));
  });
});
