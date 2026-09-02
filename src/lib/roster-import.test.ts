import { describe, it, expect } from "vitest";
import { parseRosterImportText, formatRosterImportSummary } from "./roster-import";

describe("parseRosterImportText", () => {
  it("parses the pipe form, same convention as rosterToRows", () => {
    const result = parseRosterImportText("Smith, John | jsmith\nDoe, Jane | jdoe");
    expect(result.rows).toEqual([
      { student: "Smith, John", username: "jsmith" },
      { student: "Doe, Jane", username: "jdoe" },
    ]);
    expect(result.studentsWithUsername).toBe(2);
    expect(result.unparsedLines).toEqual([]);
  });

  it("parses the tab form", () => {
    const result = parseRosterImportText("Ana Ruiz\tanaruiz");
    expect(result.rows).toEqual([{ student: "Ana Ruiz", username: "anaruiz" }]);
  });

  it("parses the comma form (single comma, right side a valid handle)", () => {
    const result = parseRosterImportText("Ana Ruiz, anaruiz99");
    expect(result.rows).toEqual([{ student: "Ana Ruiz", username: "anaruiz99" }]);
  });

  it("tab wins over a pipe if a line somehow has both", () => {
    const result = parseRosterImportText("Name|extra\thandle");
    expect(result.rows).toEqual([{ student: "Name|extra", username: "handle" }]);
  });

  it("a bare name with no delimiter is a usable row with no username", () => {
    const result = parseRosterImportText("Jane Doe");
    expect(result.rows).toEqual([{ student: "Jane Doe", username: "" }]);
    expect(result.studentsWithUsername).toBe(0);
  });

  it("a name containing a literal '|' round-trips through the LAST pipe, same as rosterToRows", () => {
    const result = parseRosterImportText("Ruiz|Ana | aruiz");
    expect(result.rows).toEqual([{ student: "Ruiz|Ana", username: "aruiz" }]);
  });

  it("a pipe with nothing before it is unparsed (empty student half)", () => {
    const result = parseRosterImportText("| jsmith");
    expect(result.rows).toEqual([]);
    expect(result.unparsedLines).toEqual(["| jsmith"]);
  });

  it("an unusable handle (contains a space) is unparsed, not silently dropped or mis-split", () => {
    const result = parseRosterImportText("Jane Doe | not a handle");
    expect(result.rows).toEqual([]);
    expect(result.unparsedLines).toEqual(["Jane Doe | not a handle"]);
  });

  it("blank lines are skipped entirely, not counted as unparsed", () => {
    const result = parseRosterImportText("Jane Doe | jdoe\n\n   \nJohn Roe | jroe");
    expect(result.rows).toHaveLength(2);
    expect(result.unparsedLines).toEqual([]);
  });

  it("a leading '@' on the handle is stripped, matching extractGithubHandle", () => {
    const result = parseRosterImportText("Jane Doe | @jdoe");
    expect(result.rows).toEqual([{ student: "Jane Doe", username: "jdoe" }]);
  });

  it("mixes parsed rows and unparsed lines in one paste", () => {
    const result = parseRosterImportText(["Jane Doe | jdoe", "| nobody", "John Roe"].join("\n"));
    expect(result.rows).toEqual([
      { student: "Jane Doe", username: "jdoe" },
      { student: "John Roe", username: "" },
    ]);
    expect(result.unparsedLines).toEqual(["| nobody"]);
  });
});

describe("formatRosterImportSummary", () => {
  it("reports counts with no unparsed lines", () => {
    const summary = formatRosterImportSummary({
      rows: [
        { student: "A", username: "a" },
        { student: "B", username: "" },
      ],
      studentsWithUsername: 1,
      unparsedLines: [],
    });
    expect(summary).toBe("Found 2 students, 1 with a GitHub username.");
  });

  it("appends the unparsed-lines clause, singular vs plural", () => {
    const summary = formatRosterImportSummary({
      rows: [],
      studentsWithUsername: 0,
      unparsedLines: ["| nobody"],
    });
    expect(summary).toBe("Found 0 students, 0 with a GitHub username. 1 line could not be read: | nobody");
  });

  it("uses singular 'student' for exactly one row", () => {
    const summary = formatRosterImportSummary({
      rows: [{ student: "A", username: "" }],
      studentsWithUsername: 0,
      unparsedLines: [],
    });
    expect(summary).toBe("Found 1 student, 0 with a GitHub username.");
  });
});
