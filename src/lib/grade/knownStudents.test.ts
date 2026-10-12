import { describe, it, expect } from "vitest";
import { parseKnownStudentNames, knownStudentsOption, KNOWN_STUDENTS_FIELD } from "./knownStudents";

describe("parseKnownStudentNames", () => {
  it("returns an empty list for null, undefined, blank and whitespace-only input", () => {
    expect(parseKnownStudentNames(null)).toEqual([]);
    expect(parseKnownStudentNames(undefined)).toEqual([]);
    expect(parseKnownStudentNames("")).toEqual([]);
    expect(parseKnownStudentNames("  \n \r\n\n")).toEqual([]);
  });

  it("trims each line and drops blank lines (LF and CRLF)", () => {
    expect(parseKnownStudentNames("  Maria Alvarez \r\n\nTom Brown\n")).toEqual(["Maria Alvarez", "Tom Brown"]);
  });

  it("de-duplicates by canonical form, keeping the first spelling", () => {
    expect(parseKnownStudentNames("Maria Alvarez\nmaria   alvarez\nAlvarez, Maria\nTom Brown")).toEqual([
      "Maria Alvarez",
      "Tom Brown",
    ]);
  });

  it("keeps genuinely distinct names", () => {
    expect(parseKnownStudentNames("AlvarezMaria\nBrownTom")).toEqual(["AlvarezMaria", "BrownTom"]);
  });
});

describe("knownStudentsOption", () => {
  it("is an empty object when no names parse (the no-roster degrade)", () => {
    expect(knownStudentsOption(null)).toEqual({});
    expect(knownStudentsOption("   ")).toEqual({});
    expect("knownStudents" in knownStudentsOption("")).toBe(false);
  });

  it("carries the parsed list when names exist", () => {
    expect(knownStudentsOption("AlvarezMaria\nBrownTom")).toEqual({ knownStudents: ["AlvarezMaria", "BrownTom"] });
  });

  it("pins the FormData field name the client and server share", () => {
    expect(KNOWN_STUDENTS_FIELD).toBe("knownStudents");
  });
});
