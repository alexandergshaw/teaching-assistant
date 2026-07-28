import { describe, it, expect } from "vitest";
import {
  formatRunWhen,
  formatRunDuration,
  formatRunSteps,
  runStatusBadge,
  buildRunLogDownloadName,
} from "./automation-runs-logic";

describe("formatRunWhen", () => {
  it("prefers startedAt over finishedAt", () => {
    const result = formatRunWhen("2026-07-27T10:00:00.000Z", "2026-07-27T10:00:05.000Z");
    expect(result).toBe(new Date("2026-07-27T10:00:00.000Z").toLocaleString());
  });

  it("falls back to finishedAt when startedAt is null", () => {
    const result = formatRunWhen(null, "2026-07-27T10:00:05.000Z");
    expect(result).toBe(new Date("2026-07-27T10:00:05.000Z").toLocaleString());
  });

  it("reads '(not recorded)' when neither timestamp is set", () => {
    expect(formatRunWhen(null, null)).toBe("(not recorded)");
  });

  it("reads '(not recorded)' for an unparseable timestamp rather than 'Invalid Date'", () => {
    expect(formatRunWhen("not-a-date", null)).toBe("(not recorded)");
  });
});

describe("formatRunDuration", () => {
  it("reads '(unknown)' for null", () => {
    expect(formatRunDuration(null)).toBe("(unknown)");
  });

  it("renders sub-second durations in milliseconds", () => {
    expect(formatRunDuration(450)).toBe("450ms");
  });

  it("renders durations at or above one second in seconds, one decimal place", () => {
    expect(formatRunDuration(1000)).toBe("1.0s");
    expect(formatRunDuration(12340)).toBe("12.3s");
  });

  it("treats zero as a known, sub-second duration", () => {
    expect(formatRunDuration(0)).toBe("0ms");
  });
});

describe("formatRunSteps", () => {
  it("reads '(unknown)' when stepCount is null", () => {
    expect(formatRunSteps(null, null)).toBe("(unknown)");
  });

  it("pluralizes correctly for 1 vs many steps", () => {
    expect(formatRunSteps(1, 0)).toBe("1 step");
    expect(formatRunSteps(3, 0)).toBe("3 steps");
  });

  it("omits the error count when it is zero", () => {
    expect(formatRunSteps(3, 0)).toBe("3 steps");
  });

  it("omits the error count when it is null", () => {
    expect(formatRunSteps(3, null)).toBe("3 steps");
  });

  it("appends a singular/plural error count when nonzero", () => {
    expect(formatRunSteps(3, 1)).toBe("3 steps (1 error)");
    expect(formatRunSteps(3, 2)).toBe("3 steps (2 errors)");
  });
});

describe("runStatusBadge", () => {
  it("maps each recognized status to a distinct, nonempty badge text", () => {
    const statuses = ["ok", "error", "skipped", "running"] as const;
    const texts = statuses.map((s) => runStatusBadge(s).text);
    expect(new Set(texts).size).toBe(statuses.length);
    for (const text of texts) expect(text.length).toBeGreaterThan(0);
  });

  it("gives every status a nonempty class name", () => {
    for (const status of ["ok", "error", "skipped", "running"] as const) {
      expect(runStatusBadge(status).class.length).toBeGreaterThan(0);
    }
  });
});

describe("buildRunLogDownloadName", () => {
  it("ends with .txt", () => {
    expect(buildRunLogDownloadName("Weekly Announcement", "run-1234567890")).toMatch(/\.txt$/);
  });

  it("includes the workflow name", () => {
    expect(buildRunLogDownloadName("Weekly Announcement", "run-1234567890")).toContain("Weekly Announcement");
  });

  it("strips filesystem-unfriendly characters from the workflow name", () => {
    const name = buildRunLogDownloadName("Grade / Sync: Final?", "run-1234567890");
    expect(name).not.toMatch(/[/:?]/);
  });

  it("uses a short, non-empty id fragment so two runs of the same workflow never collide", () => {
    const a = buildRunLogDownloadName("Weekly Announcement", "run-aaaaaaaa-1111");
    const b = buildRunLogDownloadName("Weekly Announcement", "run-bbbbbbbb-2222");
    expect(a).not.toBe(b);
  });

  it("falls back to a nonempty name when workflowName is blank", () => {
    const name = buildRunLogDownloadName("   ", "run-1234567890");
    expect(name.startsWith(".txt")).toBe(false);
    expect(name.length).toBeGreaterThan(4);
  });
});
