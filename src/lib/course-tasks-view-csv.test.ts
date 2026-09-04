// Unit tests for course-tasks-view-csv.ts's shared CSV primitives
// (escapeCsvValue, csvRow, yesNo). course-tasks-view.ts's own CSV behaviour
// (buildTasksCsv et al.) is exercised by course-tasks-view.test.ts, which
// imports exclusively from "./course-tasks-view" per that file's own header;
// this file covers only the primitives added here directly, including the
// two (csvRow, yesNo) lifted out of message-replies-log.ts and
// discussion-replies-log.ts, which both used to carry byte-identical private
// copies.

import { describe, it, expect } from "vitest";
import { escapeCsvValue, csvRow, yesNo } from "./course-tasks-view-csv";

describe("escapeCsvValue", () => {
  it("returns a plain value unquoted", () => {
    expect(escapeCsvValue("hello")).toBe("hello");
  });

  it("quotes and doubles internal quotes when the value contains a comma", () => {
    expect(escapeCsvValue("Grade, question")).toBe('"Grade, question"');
  });

  it("quotes a value containing a double quote, doubling it", () => {
    expect(escapeCsvValue('say "hi"')).toBe('"say ""hi"""');
  });

  it("quotes a value containing a newline", () => {
    expect(escapeCsvValue("line one\nline two")).toBe('"line one\nline two"');
  });
});

describe("csvRow", () => {
  it("escapes each value independently and joins with a comma", () => {
    expect(csvRow(["a", "b, c", 'd "e"'])).toBe('a,"b, c","d ""e"""');
  });

  it("renders an empty row as an empty string", () => {
    expect(csvRow([])).toBe("");
  });
});

describe("yesNo", () => {
  it("renders true as Yes and false as No", () => {
    expect(yesNo(true)).toBe("Yes");
    expect(yesNo(false)).toBe("No");
  });
});
