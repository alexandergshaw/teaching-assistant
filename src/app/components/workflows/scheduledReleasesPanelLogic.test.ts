import { describe, expect, it } from "vitest";
import {
  formatReleaseTargetLabel,
  formatReleaseCourseLabel,
  formatReleaseInstant,
  describeReleaseRowStatus,
  releaseStatusBadgeClassName,
  canCancelRelease,
  describeCancelRestorePreview,
  cancelButtonLabel,
  buildCancelConfirmMessage,
  describeCancelOutcome,
  sortScheduledReleasesForDisplay,
} from "./scheduledReleasesPanelLogic";
import type { CancelReleaseResult } from "@/lib/release-cancel";
import type { ScheduledRelease } from "@/lib/scheduled-releases";

function makeRelease(overrides: Partial<ScheduledRelease> = {}): ScheduledRelease {
  return {
    id: "r1",
    userId: "u1",
    courseUrl: "https://canvas.example.edu/courses/1",
    courseAcronym: null,
    target: { kind: "module", id: 123, moduleId: null },
    releaseAt: "2026-09-01T12:00:00.000Z",
    status: "pending",
    claimedAt: null,
    recoveryAttempts: 0,
    lastError: null,
    completedAt: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    wasPublished: null,
    ...overrides,
  };
}

describe("formatReleaseTargetLabel", () => {
  it("labels a module target", () => {
    expect(formatReleaseTargetLabel({ kind: "module", id: 42 })).toBe("Module #42");
  });

  it("labels a module_item target distinctly from a module", () => {
    const item = formatReleaseTargetLabel({ kind: "module_item", id: 42 });
    const moduleLabel = formatReleaseTargetLabel({ kind: "module", id: 42 });
    expect(item).not.toBe(moduleLabel);
    expect(item).toContain("42");
  });
});

describe("formatReleaseCourseLabel", () => {
  it("prefers the acronym when present", () => {
    expect(formatReleaseCourseLabel({ courseUrl: "https://canvas.example.edu/courses/1", courseAcronym: "CS101" })).toBe("CS101");
  });

  it("falls back to the raw course URL when there is no acronym", () => {
    expect(formatReleaseCourseLabel({ courseUrl: "https://canvas.example.edu/courses/1", courseAcronym: null })).toBe(
      "https://canvas.example.edu/courses/1"
    );
  });
});

describe("formatReleaseInstant", () => {
  it("renders a valid ISO instant as a locale string, not the raw ISO text", () => {
    const formatted = formatReleaseInstant("2026-09-01T12:00:00.000Z");
    expect(formatted).not.toBe("2026-09-01T12:00:00.000Z");
    expect(formatted.length).toBeGreaterThan(0);
  });

  it("falls back to the raw string for an unparseable instant rather than throwing", () => {
    expect(() => formatReleaseInstant("not-a-date")).not.toThrow();
    expect(formatReleaseInstant("not-a-date")).toBe("not-a-date");
  });
});

describe("describeReleaseRowStatus", () => {
  const now = new Date("2026-08-24T12:00:00.000Z");

  it("a pending release still in the future reads as ordinary Pending, not late", () => {
    const result = describeReleaseRowStatus(makeRelease({ status: "pending", releaseAt: "2026-08-25T00:00:00.000Z" }), now);
    expect(result.label).toBe("Pending");
    expect(result.tone).toBe("neutral");
    expect(result.hint.toLowerCase()).not.toContain("late");
  });

  it("F11.5: a pending release whose instant has passed reads as waiting for the next tick, never late or broken, and stays at neutral tone", () => {
    const result = describeReleaseRowStatus(makeRelease({ status: "pending", releaseAt: "2026-08-24T00:00:00.000Z" }), now);
    expect(result.tone).toBe("neutral");
    expect(result.hint.toLowerCase()).toContain("next tick");
    expect(result.hint.toLowerCase()).not.toContain("late");
    expect(result.hint.toLowerCase()).not.toContain("broken");
  });

  it("a claimed release reads as in-progress, distinct from pending", () => {
    const result = describeReleaseRowStatus(makeRelease({ status: "claimed" }), now);
    expect(result.label).not.toBe("Pending");
  });

  it("a done release reads success", () => {
    const result = describeReleaseRowStatus(makeRelease({ status: "done" }), now);
    expect(result.tone).toBe("success");
  });

  it("a failed release reads danger and surfaces lastError", () => {
    const result = describeReleaseRowStatus(makeRelease({ status: "failed", lastError: "Canvas refused the write" }), now);
    expect(result.tone).toBe("danger");
    expect(result.hint).toContain("Canvas refused the write");
  });

  it("a cancelled release never claims a restore happened, regardless of wasPublished (the row cannot retain whether a restore attempt succeeded)", () => {
    const withTrue = describeReleaseRowStatus(makeRelease({ status: "cancelled", wasPublished: true }), now);
    const withNull = describeReleaseRowStatus(makeRelease({ status: "cancelled", wasPublished: null }), now);
    expect(withTrue.label).toBe("Cancelled");
    expect(withTrue.hint.toLowerCase()).not.toContain("restored");
    expect(withNull.hint.toLowerCase()).not.toContain("restored");
  });
});

describe("releaseStatusBadgeClassName", () => {
  it("maps each tone to a distinct existing ghBadge class name", () => {
    expect(releaseStatusBadgeClassName("neutral")).toBe("ghBadgeNeutral");
    expect(releaseStatusBadgeClassName("success")).toBe("ghBadgeSuccess");
    expect(releaseStatusBadgeClassName("danger")).toBe("ghBadgeDanger");
  });
});

describe("canCancelRelease", () => {
  it("allows cancelling pending and claimed rows", () => {
    expect(canCancelRelease("pending")).toBe(true);
    expect(canCancelRelease("claimed")).toBe(true);
  });

  it("refuses to offer cancel on every terminal status", () => {
    expect(canCancelRelease("done")).toBe(false);
    expect(canCancelRelease("failed")).toBe(false);
    expect(canCancelRelease("cancelled")).toBe(false);
  });
});

describe("describeCancelRestorePreview - F11.1/F11.2", () => {
  it("wasPublished true will restore", () => {
    const preview = describeCancelRestorePreview(true);
    expect(preview.willRestore).toBe(true);
    expect(preview.text.toLowerCase()).toContain("restor");
  });

  it("wasPublished false will not restore, and says so rather than staying silent", () => {
    const preview = describeCancelRestorePreview(false);
    expect(preview.willRestore).toBe(false);
    expect(preview.text.length).toBeGreaterThan(0);
  });

  it("wasPublished null (a row predating the field) also will not restore, and reads distinctly from the false case", () => {
    const nullPreview = describeCancelRestorePreview(null);
    const falsePreview = describeCancelRestorePreview(false);
    expect(nullPreview.willRestore).toBe(false);
    // F11.2: null must never guess - its explanation must not read the same
    // as "we checked and it was already hidden" (the false case).
    expect(nullPreview.text).not.toBe(falsePreview.text);
  });
});

describe("cancelButtonLabel", () => {
  it("is distinct for a row that will restore versus one that will not", () => {
    expect(cancelButtonLabel(true)).not.toBe(cancelButtonLabel(false));
    expect(cancelButtonLabel(true)).not.toBe(cancelButtonLabel(null));
  });

  it("never reads as a bare, ambiguous 'Cancel' (F11.1's trap)", () => {
    expect(cancelButtonLabel(true)).not.toBe("Cancel");
    expect(cancelButtonLabel(false)).not.toBe("Cancel");
    expect(cancelButtonLabel(null)).not.toBe("Cancel");
  });
});

describe("buildCancelConfirmMessage - F11.1", () => {
  it("names the target in every case", () => {
    expect(buildCancelConfirmMessage("Module #7", true)).toContain("Module #7");
    expect(buildCancelConfirmMessage("Module #7", false)).toContain("Module #7");
    expect(buildCancelConfirmMessage("Module #7", null)).toContain("Module #7");
  });

  it("states the restore consequence in restore terms when wasPublished is true", () => {
    expect(buildCancelConfirmMessage("X", true).toLowerCase()).toContain("restore");
  });

  it("explicitly denies a restore when wasPublished is false or null, rather than staying silent", () => {
    expect(buildCancelConfirmMessage("X", false).toLowerCase()).toMatch(/not restore|leave it hidden/);
    expect(buildCancelConfirmMessage("X", null).toLowerCase()).toMatch(/not restore|not automatically/);
  });
});

describe("describeCancelOutcome - renders all three CancelReleaseResult outcomes distinctly", () => {
  const cases: Array<{ result: CancelReleaseResult; expectKind: "success" | "warning" | "error" }> = [
    { result: { status: "cancelled-and-restored" }, expectKind: "success" },
    { result: { status: "cancelled-without-restore", reason: "it was already hidden" }, expectKind: "warning" },
    { result: { status: "could-not-cancel", reason: "the release already ran" }, expectKind: "error" },
  ];

  it.each(cases)("maps $result.status to kind $expectKind", ({ result, expectKind }) => {
    const outcome = describeCancelOutcome(result, "Module #1");
    expect(outcome.kind).toBe(expectKind);
    expect(outcome.text).toContain("Module #1");
  });

  it("produces three DIFFERENT kinds - collapsing any two would hide which one happened", () => {
    const kinds = cases.map(({ result }) => describeCancelOutcome(result, "X").kind);
    expect(new Set(kinds).size).toBe(3);
  });

  it("surfaces the server's own reason text for the two non-restored outcomes", () => {
    expect(describeCancelOutcome({ status: "cancelled-without-restore", reason: "custom reason A" }, "X").text).toContain(
      "custom reason A"
    );
    expect(describeCancelOutcome({ status: "could-not-cancel", reason: "custom reason B" }, "X").text).toContain("custom reason B");
  });
});

describe("sortScheduledReleasesForDisplay", () => {
  it("puts active rows (pending/claimed) ahead of terminal rows regardless of input order", () => {
    const done = makeRelease({ id: "done", status: "done", updatedAt: "2026-08-20T00:00:00.000Z" });
    const pending = makeRelease({ id: "pending", status: "pending", releaseAt: "2026-09-05T00:00:00.000Z" });
    const sorted = sortScheduledReleasesForDisplay([done, pending]);
    expect(sorted.map((r) => r.id)).toEqual(["pending", "done"]);
  });

  it("sorts active rows soonest-release-first", () => {
    const later = makeRelease({ id: "later", status: "pending", releaseAt: "2026-09-10T00:00:00.000Z" });
    const sooner = makeRelease({ id: "sooner", status: "pending", releaseAt: "2026-09-01T00:00:00.000Z" });
    const sorted = sortScheduledReleasesForDisplay([later, sooner]);
    expect(sorted.map((r) => r.id)).toEqual(["sooner", "later"]);
  });

  it("sorts terminal rows most-recently-updated-first", () => {
    const old = makeRelease({ id: "old", status: "done", updatedAt: "2026-08-01T00:00:00.000Z" });
    const recent = makeRelease({ id: "recent", status: "failed", updatedAt: "2026-08-20T00:00:00.000Z" });
    const sorted = sortScheduledReleasesForDisplay([old, recent]);
    expect(sorted.map((r) => r.id)).toEqual(["recent", "old"]);
  });
});
