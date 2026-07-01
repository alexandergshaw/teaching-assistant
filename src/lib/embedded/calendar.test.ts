import { describe, it, expect } from "vitest";
import { parseCalendarEmbedded } from "./calendar";

describe("parseCalendarEmbedded", () => {
  it("extracts ISO-dated events and classifies their type", () => {
    const text = [
      "2026-09-07 Labor Day holiday, no class",
      "2026-09-14 Problem Set 1 due",
      "2026-10-12 Midterm Exam",
    ].join("\n");
    const result = parseCalendarEmbedded(text);
    expect(result.events).toHaveLength(3);
    expect(result.events[0]).toMatchObject({ date: "2026-09-07", type: "holiday" });
    expect(result.events[1].type).toBe("assignment");
    expect(result.events[2].type).toBe("exam");
  });

  it("parses month-name dates and infers a missing year from the document", () => {
    const text = "Term: Fall 2026\nSep 3 - Classes begin\nDec 10 Final Exam";
    const result = parseCalendarEmbedded(text);
    expect(result.term).toBe("Fall 2026");
    expect(result.events.find((e) => e.type === "term_start")?.date).toBe("2026-09-03");
    expect(result.events.find((e) => e.type === "exam")?.date).toBe("2026-12-10");
  });

  it("parses US numeric dates and reads labeled metadata", () => {
    const text = "School: Example University\nQuiz 2 on 11/5/2026";
    const result = parseCalendarEmbedded(text);
    expect(result.school).toBe("Example University");
    expect(result.events[0]).toMatchObject({ date: "2026-11-05", type: "quiz" });
  });

  it("uses the school hint when the document has no school line", () => {
    const result = parseCalendarEmbedded("2026-01-01 New Year", { schoolHint: "Hint College" });
    expect(result.school).toBe("Hint College");
  });

  it("skips lines with no resolvable date and returns empty for empty input", () => {
    expect(parseCalendarEmbedded("Just some prose with no dates.").events).toEqual([]);
    expect(parseCalendarEmbedded("").events).toEqual([]);
  });
});
