import { describe, it, expect } from "vitest";
import { parseRosterNames } from "./grading-course-roster";

describe("parseRosterNames", () => {
  it("returns [] for null/undefined/blank", () => {
    expect(parseRosterNames(null)).toEqual([]);
    expect(parseRosterNames(undefined)).toEqual([]);
    expect(parseRosterNames("")).toEqual([]);
    expect(parseRosterNames("   \n  \n")).toEqual([]);
  });

  it("splits plain one-name-per-line rosters", () => {
    expect(parseRosterNames("Maria Alvarez\nDiego Chen\nZed Osei")).toEqual([
      "Maria Alvarez",
      "Diego Chen",
      "Zed Osei",
    ]);
  });

  it("strips a '| username' suffix, keeping only the name half", () => {
    expect(parseRosterNames("Maria Alvarez | malvarez\nDiego Chen|@dchen")).toEqual([
      "Maria Alvarez",
      "Diego Chen",
    ]);
  });

  it("trims whitespace and drops blank lines", () => {
    expect(parseRosterNames("  Maria Alvarez  \n\n\n  Diego Chen  ")).toEqual([
      "Maria Alvarez",
      "Diego Chen",
    ]);
  });

  it("de-duplicates identical lines - matchNameAgainstRoster's own contract requires one entry per DISTINCT student", () => {
    expect(parseRosterNames("Maria Alvarez\nMaria Alvarez\nDiego Chen")).toEqual([
      "Maria Alvarez",
      "Diego Chen",
    ]);
  });

  it("a stray trailing pipe with nothing after it still yields the name half", () => {
    expect(parseRosterNames("Maria Alvarez |")).toEqual(["Maria Alvarez"]);
  });
});
