// REQ-A32-1/REQ-A32-2. `now` is injected throughout - never Date.now() -
// so every row below is a fixed, non-flaky fact about resolveScheduledVisibility.

import { describe, it, expect } from "vitest";
import { resolveScheduledVisibility } from "./scheduled-visibility";

const NOW = new Date("2026-06-15T12:00:00.000Z").getTime();

describe("resolveScheduledVisibility - empty/whitespace input", () => {
  it("empty string is immediate", () => {
    expect(resolveScheduledVisibility("", NOW)).toEqual({ kind: "immediate" });
  });

  it("whitespace-only string is immediate", () => {
    expect(resolveScheduledVisibility("   ", NOW)).toEqual({ kind: "immediate" });
  });
});

describe("resolveScheduledVisibility - malformed input", () => {
  it("a string Date cannot parse is invalid", () => {
    expect(resolveScheduledVisibility("not-a-date", NOW)).toEqual({ kind: "invalid" });
  });

  it("a malformed but non-empty datetime-local fragment is invalid", () => {
    expect(resolveScheduledVisibility("2026-13-99T99:99", NOW)).toEqual({ kind: "invalid" });
  });
});

describe("resolveScheduledVisibility - past and exactly-now input", () => {
  it("a past time resolves to immediate, not invalid and not scheduled - a past pick posts now, it is not an error", () => {
    expect(resolveScheduledVisibility("2020-01-01T09:00", NOW)).toEqual({ kind: "immediate" });
  });

  it("a time exactly equal to now is immediate - the comparison is strictly greater-than, mirroring announcements-panel.tsx:247's own when.getTime() > Date.now()", () => {
    expect(resolveScheduledVisibility(new Date(NOW).toISOString(), NOW)).toEqual({ kind: "immediate" });
  });
});

describe("resolveScheduledVisibility - future input", () => {
  it("a future time resolves to scheduled, with iso the UTC ISO-8601 string and label a locale string", () => {
    const raw = "2026-06-20T09:30";
    const result = resolveScheduledVisibility(raw, NOW);
    expect(result.kind).toBe("scheduled");
    if (result.kind !== "scheduled") throw new Error("unreachable");
    expect(result.iso).toBe(new Date(raw).toISOString());
    expect(result.label).toBe(new Date(raw).toLocaleString());
  });

  it("one millisecond in the future is scheduled - proves the boundary is strict, not off-by-one toward immediate", () => {
    expect(resolveScheduledVisibility(new Date(NOW + 1).toISOString(), NOW).kind).toBe("scheduled");
  });
});

// REQ-A32-1's whole point: a past-dated pick must resolve the SAME way for
// every consumer, because there is only one function to call. A
// length-derived boolean (the sibling's own shape at
// announcements-panel.tsx:296, `visibleAt.trim().length > 0`) would read
// "scheduled" for this exact PAST value even though it already happened -
// see walkthrough-announcement.structure.test.ts's own anchored-slice
// assertions for the proof that neither the copy nor the labels in
// AnnouncementDraftSlot.tsx, nor commitPost in useAnnouncementDraftSlots.ts,
// use that shape instead of this function's `kind`.
describe("resolveScheduledVisibility - the single-predicate guarantee (REQ-A32-1)", () => {
  const PAST = "2020-01-01T09:00";

  it("a past-dated, non-empty pick is immediate - not scheduled - even though a length check alone would say otherwise", () => {
    expect(resolveScheduledVisibility(PAST, NOW)).toEqual({ kind: "immediate" });
    expect(PAST.trim().length > 0).toBe(true);
  });
});
