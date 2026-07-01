import { describe, it, expect } from "vitest";
import { toProse } from "./index";

describe("toProse", () => {
  it("describes a JSON object as sentences", () => {
    const r = toProse('{"courseName": "CS101", "credits": 3, "online": false}');
    expect(r.format).toBe("json");
    expect(r.prose).toContain("The course name is CS101.");
    expect(r.prose).toContain("The credits is 3.");
    expect(r.prose).toContain("The online is false.");
  });

  it("describes an array of records", () => {
    const r = toProse('[{"name": "Ada", "score": 92}, {"name": "Bo", "score": 71}]');
    expect(r.format).toBe("json");
    expect(r.prose).toContain("The data lists 2 records.");
    expect(r.prose).toContain("Record 1: name is Ada and score is 92.");
    expect(r.prose).toContain("Record 2: name is Bo and score is 71.");
  });

  it("enumerates a primitive JSON array", () => {
    const r = toProse('["loops", "functions", "recursion"]');
    expect(r.prose).toBe("The list has 3 items: loops, functions, and recursion.");
  });

  it("narrates a CSV table row by row", () => {
    const r = toProse("name,grade,late days\nAda,95,0\nBo,82,2");
    expect(r.format).toBe("table");
    expect(r.prose).toContain("The table has 2 rows with columns name, grade, and late days.");
    expect(r.prose).toContain("For Ada, grade is 95 and late days is 0.");
    expect(r.prose).toContain("For Bo, grade is 82 and late days is 2.");
  });

  it("converts key-value lines into sentences", () => {
    const r = toProse("Course: Databases\nRoom: 204\nMeeting Time: MWF 10am");
    expect(r.format).toBe("keyvalue");
    expect(r.prose).toContain("The course is Databases.");
    expect(r.prose).toContain("The room is 204.");
    expect(r.prose).toContain("The meeting time is MWF 10am.");
  });

  it("flattens markdown headings and bullets into prose", () => {
    const r = toProse("## Requirements\n- a working demo\n- a short writeup");
    expect(r.format).toBe("markdown");
    expect(r.prose).toBe("Requirements covers a working demo and a short writeup.");
  });

  it("turns a bare bullet list into an enumeration sentence", () => {
    const r = toProse("- bring your laptop\n- install Python\n- read chapter 2");
    expect(r.format).toBe("list");
    expect(r.prose).toBe("The list includes bring your laptop, install Python, and read chapter 2.");
  });

  it("passes existing prose through unchanged", () => {
    const text = "The midterm covers chapters one through four. Bring a calculator.";
    const r = toProse(text);
    expect(r.format).toBe("prose");
    expect(r.prose).toBe(text);
  });

  it("handles empty input and is deterministic", () => {
    expect(toProse("  ")).toEqual({ prose: "", format: "prose" });
    const input = '{"a": 1, "tags": ["x", "y"]}';
    expect(toProse(input)).toEqual(toProse(input));
  });

  it("summarizes counts for oversized structures instead of dumping them", () => {
    const rows = Array.from({ length: 10 }, (_, i) => `student${i},${70 + i}`).join("\n");
    const r = toProse(`name,score\n${rows}`);
    expect(r.prose).toContain("There are 4 more rows.");
  });
});
