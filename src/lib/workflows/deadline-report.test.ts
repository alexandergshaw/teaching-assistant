import { describe, it, expect } from "vitest";
import { filterUpcoming, formatDeadlineReport, DeadlineSection } from "./deadline-report";

describe("filterUpcoming", () => {
  // Fixed reference: 2024-07-18 00:00:00 UTC
  const nowMs = Date.UTC(2024, 6, 18);
  const days = 7;
  const cutoffMs = nowMs + days * 864e5; // 7 days worth of ms

  describe("null handling", () => {
    it("drops assignments with null dueAt", () => {
      const assignments = [
        { name: "Assignment A", dueAt: "2024-07-20T00:00:00Z" },
        { name: "Assignment B", dueAt: null },
        { name: "Assignment C", dueAt: "2024-07-22T00:00:00Z" },
      ];
      const result = filterUpcoming(assignments, nowMs, days);
      expect(result).toHaveLength(2);
      expect(result.map((a) => a.name)).toEqual(["Assignment A", "Assignment C"]);
    });

    it("returns empty array when all assignments have null dueAt", () => {
      const assignments = [
        { name: "Assignment A", dueAt: null },
        { name: "Assignment B", dueAt: null },
      ];
      const result = filterUpcoming(assignments, nowMs, days);
      expect(result).toHaveLength(0);
    });
  });

  describe("window boundaries", () => {
    it("includes assignment due exactly at nowMs (now inclusive)", () => {
      const assignments = [
        { name: "Assignment A", dueAt: new Date(nowMs).toISOString() },
      ];
      const result = filterUpcoming(assignments, nowMs, days);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Assignment A");
    });

    it("includes assignment due exactly at cutoffMs (cutoff inclusive)", () => {
      const assignments = [
        { name: "Assignment A", dueAt: new Date(cutoffMs).toISOString() },
      ];
      const result = filterUpcoming(assignments, nowMs, days);
      expect(result).toHaveLength(1);
    });

    it("excludes assignment due before nowMs", () => {
      const tooEarlyMs = nowMs - 1000;
      const assignments = [
        { name: "Assignment A", dueAt: new Date(tooEarlyMs).toISOString() },
      ];
      const result = filterUpcoming(assignments, nowMs, days);
      expect(result).toHaveLength(0);
    });

    it("excludes assignment due after cutoffMs", () => {
      const tooLateMs = cutoffMs + 1000;
      const assignments = [
        { name: "Assignment A", dueAt: new Date(tooLateMs).toISOString() },
      ];
      const result = filterUpcoming(assignments, nowMs, days);
      expect(result).toHaveLength(0);
    });
  });

  describe("sorting", () => {
    it("sorts assignments by dueAt ascending", () => {
      const assignments = [
        { name: "Assignment C", dueAt: "2024-07-24T00:00:00Z" },
        { name: "Assignment A", dueAt: "2024-07-20T00:00:00Z" },
        { name: "Assignment B", dueAt: "2024-07-22T00:00:00Z" },
      ];
      const result = filterUpcoming(assignments, nowMs, days);
      expect(result.map((a) => a.name)).toEqual([
        "Assignment A",
        "Assignment B",
        "Assignment C",
      ]);
    });

    it("maintains sorted order with null values filtered out", () => {
      const assignments = [
        { name: "Assignment C", dueAt: "2024-07-24T00:00:00Z" },
        { name: "Assignment NULL", dueAt: null },
        { name: "Assignment A", dueAt: "2024-07-20T00:00:00Z" },
        { name: "Assignment NULL2", dueAt: null },
        { name: "Assignment B", dueAt: "2024-07-22T00:00:00Z" },
      ];
      const result = filterUpcoming(assignments, nowMs, days);
      expect(result.map((a) => a.name)).toEqual([
        "Assignment A",
        "Assignment B",
        "Assignment C",
      ]);
    });
  });

  describe("edge cases", () => {
    it("handles empty input array", () => {
      const result = filterUpcoming([], nowMs, days);
      expect(result).toHaveLength(0);
    });

    it("handles 0 days window", () => {
      const assignments = [
        { name: "Assignment A", dueAt: new Date(nowMs).toISOString() },
        { name: "Assignment B", dueAt: new Date(nowMs + 1000).toISOString() },
      ];
      const result = filterUpcoming(assignments, nowMs, 0);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Assignment A");
    });

    it("handles multiple assignments with same dueAt", () => {
      const dueTime = new Date(nowMs + 24 * 60 * 60 * 1000).toISOString();
      const assignments = [
        { name: "Assignment A", dueAt: dueTime },
        { name: "Assignment B", dueAt: dueTime },
      ];
      const result = filterUpcoming(assignments, nowMs, days);
      expect(result).toHaveLength(2);
      expect(result.map((a) => a.name)).toContain("Assignment A");
      expect(result.map((a) => a.name)).toContain("Assignment B");
    });
  });
});

describe("formatDeadlineReport", () => {
  describe("single section with assignments", () => {
    it("does not include section header when only one section", () => {
      const sections: DeadlineSection[] = [
        {
          course: "CS 101",
          assignments: [
            { name: "Quiz 1", dueAt: "2024-07-20T10:00:00Z" },
            { name: "Assignment 1", dueAt: "2024-07-22T23:59:00Z" },
          ],
        },
      ];
      const report = formatDeadlineReport(sections, 7);

      // Should not include "CS 101:" header
      expect(report.deadlines).not.toContain("CS 101:");
      expect(report.deadlines).toContain("- Quiz 1 - due");
      expect(report.deadlines).toContain("- Assignment 1 - due");
      expect(report.count).toBe(2);
      expect(report.problems).toBe(0);
      expect(report.items).toHaveLength(2);
    });
  });

  describe("multiple sections with assignments", () => {
    it("includes section headers when multiple sections", () => {
      const sections: DeadlineSection[] = [
        {
          course: "CS 101",
          assignments: [{ name: "Quiz 1", dueAt: "2024-07-20T10:00:00Z" }],
        },
        {
          course: "CS 102",
          assignments: [{ name: "Assignment 1", dueAt: "2024-07-22T23:59:00Z" }],
        },
      ];
      const report = formatDeadlineReport(sections, 7);

      expect(report.deadlines).toContain("CS 101:");
      expect(report.deadlines).toContain("CS 102:");
      expect(report.count).toBe(2);
      expect(report.problems).toBe(0);
      expect(report.items).toHaveLength(2);
    });

    it("includes section headers with mixed empty and non-empty sections", () => {
      const sections: DeadlineSection[] = [
        {
          course: "CS 101",
          assignments: [{ name: "Quiz 1", dueAt: "2024-07-20T10:00:00Z" }],
        },
        {
          course: "CS 102",
          assignments: [], // empty section
        },
        {
          course: "CS 103",
          assignments: [{ name: "Assignment 1", dueAt: "2024-07-22T23:59:00Z" }],
        },
      ];
      const report = formatDeadlineReport(sections, 7);

      expect(report.deadlines).toContain("CS 101:");
      expect(report.deadlines).not.toContain("CS 102:");
      expect(report.deadlines).toContain("CS 103:");
      expect(report.count).toBe(2);
    });
  });

  describe("error sections", () => {
    it("always includes error line when section has error", () => {
      const sections: DeadlineSection[] = [
        {
          course: "CS 101",
          error: "Connection timeout",
          assignments: [],
        },
      ];
      const report = formatDeadlineReport(sections, 7);

      expect(report.deadlines).toContain("CS 101: Connection timeout");
      expect(report.problems).toBe(1);
      expect(report.count).toBe(0);
    });

    it("keeps error lines when there are assignments in other sections", () => {
      const sections: DeadlineSection[] = [
        {
          course: "CS 101",
          assignments: [{ name: "Quiz 1", dueAt: "2024-07-20T10:00:00Z" }],
        },
        {
          course: "CS 102",
          error: "Not found",
          assignments: [],
        },
      ];
      const report = formatDeadlineReport(sections, 7);

      expect(report.deadlines).toContain("CS 101:");
      expect(report.deadlines).toContain("CS 102: Not found");
      expect(report.count).toBe(1);
      expect(report.problems).toBe(1);
    });
  });

  describe("no deadlines found", () => {
    it("returns 'No deadlines' message when count === 0 and no errors", () => {
      const sections: DeadlineSection[] = [
        {
          course: "CS 101",
          assignments: [],
        },
      ];
      const report = formatDeadlineReport(sections, 7);

      expect(report.deadlines).toBe("No deadlines in the next 7 day(s).");
      expect(report.count).toBe(0);
      expect(report.problems).toBe(0);
      expect(report.items).toHaveLength(0);
    });

    it("appends error lines after 'No deadlines' when problems > 0", () => {
      const sections: DeadlineSection[] = [
        {
          course: "CS 101",
          assignments: [],
        },
        {
          course: "CS 102",
          error: "Connection timeout",
          assignments: [],
        },
      ];
      const report = formatDeadlineReport(sections, 7);

      expect(report.deadlines).toContain("No deadlines in the next 7 day(s).");
      expect(report.deadlines).toContain("CS 102: Connection timeout");
      expect(report.deadlines).toContain("1 course(s) could not be checked.");
      expect(report.problems).toBe(1);
      expect(report.count).toBe(0);
    });

    it("appends all error lines and final count when multiple errors", () => {
      const sections: DeadlineSection[] = [
        {
          course: "CS 101",
          error: "Timeout",
          assignments: [],
        },
        {
          course: "CS 102",
          error: "Not found",
          assignments: [],
        },
        {
          course: "CS 103",
          error: "Permission denied",
          assignments: [],
        },
      ];
      const report = formatDeadlineReport(sections, 7);

      expect(report.deadlines).toContain("No deadlines in the next 7 day(s).");
      expect(report.deadlines).toContain("CS 101: Timeout");
      expect(report.deadlines).toContain("CS 102: Not found");
      expect(report.deadlines).toContain("CS 103: Permission denied");
      expect(report.deadlines).toContain("3 course(s) could not be checked.");
      expect(report.problems).toBe(3);
      expect(report.count).toBe(0);
    });

    it("does not show 'could not be checked' line when no errors", () => {
      const sections: DeadlineSection[] = [
        {
          course: "CS 101",
          assignments: [],
        },
      ];
      const report = formatDeadlineReport(sections, 7);

      expect(report.deadlines).toBe("No deadlines in the next 7 day(s).");
      expect(report.deadlines).not.toContain("could not be checked");
    });
  });

  describe("items array", () => {
    it("contains only assignment lines, not error lines", () => {
      const sections: DeadlineSection[] = [
        {
          course: "CS 101",
          assignments: [{ name: "Quiz 1", dueAt: "2024-07-20T10:00:00Z" }],
        },
        {
          course: "CS 102",
          error: "Timeout",
          assignments: [],
        },
      ];
      const report = formatDeadlineReport(sections, 7);

      expect(report.items).toHaveLength(1);
      expect(report.items[0]).toContain("Quiz 1");
      expect(report.items.every((item) => item.startsWith("-"))).toBe(true);
    });

    it("contains assignment lines in order when multiple sections", () => {
      const sections: DeadlineSection[] = [
        {
          course: "CS 101",
          assignments: [
            { name: "Quiz 1", dueAt: "2024-07-20T10:00:00Z" },
            { name: "Assignment 1", dueAt: "2024-07-21T10:00:00Z" },
          ],
        },
        {
          course: "CS 102",
          assignments: [{ name: "Midterm", dueAt: "2024-07-22T10:00:00Z" }],
        },
      ];
      const report = formatDeadlineReport(sections, 7);

      expect(report.items).toHaveLength(3);
      expect(report.items[0]).toContain("Quiz 1");
      expect(report.items[1]).toContain("Assignment 1");
      expect(report.items[2]).toContain("Midterm");
    });

    it("is empty when no assignments", () => {
      const sections: DeadlineSection[] = [
        {
          course: "CS 101",
          assignments: [],
        },
      ];
      const report = formatDeadlineReport(sections, 7);

      expect(report.items).toHaveLength(0);
    });
  });

  describe("date formatting", () => {
    it("formats dates using toLocaleString", () => {
      const sections: DeadlineSection[] = [
        {
          course: "CS 101",
          assignments: [
            { name: "Quiz 1", dueAt: "2024-07-20T10:30:45Z" },
          ],
        },
      ];
      const report = formatDeadlineReport(sections, 7);

      const expectedDate = new Date("2024-07-20T10:30:45Z").toLocaleString();
      expect(report.deadlines).toContain(`due ${expectedDate}`);
    });
  });

  describe("different day windows", () => {
    it("shows correct day count in 'No deadlines' message for 3 days", () => {
      const sections: DeadlineSection[] = [
        {
          course: "CS 101",
          assignments: [],
        },
      ];
      const report = formatDeadlineReport(sections, 3);

      expect(report.deadlines).toBe("No deadlines in the next 3 day(s).");
    });

    it("shows correct day count in 'No deadlines' message for 14 days", () => {
      const sections: DeadlineSection[] = [
        {
          course: "CS 101",
          assignments: [],
        },
      ];
      const report = formatDeadlineReport(sections, 14);

      expect(report.deadlines).toBe("No deadlines in the next 14 day(s).");
    });
  });

  describe("complex mixed scenarios", () => {
    it("handles mix of assignments, empty sections, and errors", () => {
      const sections: DeadlineSection[] = [
        {
          course: "CS 101",
          assignments: [{ name: "Quiz 1", dueAt: "2024-07-20T10:00:00Z" }],
        },
        {
          course: "CS 102",
          assignments: [],
        },
        {
          course: "CS 103",
          error: "Timeout",
          assignments: [],
        },
        {
          course: "CS 104",
          assignments: [
            { name: "Assignment 1", dueAt: "2024-07-21T10:00:00Z" },
            { name: "Assignment 2", dueAt: "2024-07-22T10:00:00Z" },
          ],
        },
      ];
      const report = formatDeadlineReport(sections, 7);

      expect(report.count).toBe(3);
      expect(report.problems).toBe(1);
      expect(report.items).toHaveLength(3);
      expect(report.deadlines).toContain("CS 101:");
      expect(report.deadlines).not.toContain("CS 102:");
      expect(report.deadlines).toContain("CS 103: Timeout");
      expect(report.deadlines).toContain("CS 104:");
    });

    it("preserves error lines even when total count === 0", () => {
      const sections: DeadlineSection[] = [
        {
          course: "MCC Course 101",
          assignments: [],
        },
        {
          course: "MCC Course 102",
          error: "Failed to fetch: MCC Canvas is not responding",
          assignments: [],
        },
      ];
      const report = formatDeadlineReport(sections, 7);

      expect(report.count).toBe(0);
      expect(report.problems).toBe(1);
      expect(report.deadlines).toContain("No deadlines in the next 7 day(s).");
      expect(report.deadlines).toContain("MCC Course 102: Failed to fetch: MCC Canvas is not responding");
      expect(report.deadlines).toContain("1 course(s) could not be checked.");
    });
  });
});
