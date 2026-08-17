import { describe, it, expect } from "vitest";
import { repoSlug, studentRepoName } from "./student-repo-names";

// FROZEN LITERAL ORACLE.
//
// These expectations are written out by hand from the behavior of the two
// implementations this module replaces - the local `repoSlug` in
// src/app/actions/github.ts and its verbatim duplicate in
// src/lib/repo-student-bindings.ts - and from the naming rule inlined in
// setupStudentRepoAction. NOTHING here is computed by calling the production
// code, and nothing here compares the two former copies to each other: once
// they became one function such a comparison would be `f(x) === f(x)` and
// could never fail again.
//
// The failure this guards is not cosmetic. Every student repo already created
// by the workflow step was named by the old transform, and the new invitation
// status panel finds a student's repo by recomputing that name. A one-character
// drift here silently orphans every existing repo (status reads "No repo yet"
// for a class that is fully provisioned) and makes a re-run create a second
// set of repos under the drifted names.

describe("repoSlug - frozen transform", () => {
  const CASES: Array<[input: string, expected: string]> = [
    ["Smith, John", "smith-john"],
    ["CS 101", "cs-101"],
    ["  Jo  Smith  ", "jo-smith"],
    ["ABC123", "abc123"],
    ["already-slugged", "already-slugged"],
    ["Trailing!!!", "trailing"],
    ["!!!Leading", "leading"],
    // A run of non-alphanumerics collapses to ONE hyphen, never one each.
    ["a___b---c...d", "a-b-c-d"],
    // Non-ASCII letters are not transliterated; they are separators.
    ["O'Brien-Nunez", "o-brien-nunez"],
    ["Óscar", "scar"],
    // Degenerate inputs slug to the empty string (the caller, not this
    // function, is what substitutes a fallback).
    ["---", ""],
    ["!!!", ""],
    ["", ""],
    ["   ", ""],
  ];

  for (const [input, expected] of CASES) {
    it(`slugs ${JSON.stringify(input)} to ${JSON.stringify(expected)}`, () => {
      expect(repoSlug(input)).toBe(expected);
    });
  }
});

describe("studentRepoName - frozen naming rule", () => {
  const CASES: Array<[prefix: string, student: string, username: string, expected: string]> = [
    // The ordinary case: prefix, then the slugged student name.
    ["cs101", "Smith, John", "jsmith", "cs101-smith-john"],
    // The prefix is slugged too, not used raw.
    ["CS 101", "Smith, John", "jsmith", "cs-101-smith-john"],
    // No prefix means no leading hyphen.
    ["", "Smith, John", "jsmith", "smith-john"],
    ["   ", "Smith, John", "jsmith", "smith-john"],
    // The student name wins over the username whenever it is non-blank.
    ["cs101", "Smith, John", "totally-different", "cs101-smith-john"],
    // The username is the fallback only when the student name is blank.
    ["cs101", "", "jsmith", "cs101-jsmith"],
    ["cs101", "   ", "jsmith", "cs101-jsmith"],
    // A leading "@" on the handle is absorbed by the slug's leading-hyphen
    // strip - it must NOT survive into a repo name.
    ["cs101", "", "@jsmith", "cs101-jsmith"],
    // Both blank falls back to the literal "student".
    ["cs101", "", "", "cs101-student"],
    ["", "", "", "student"],
    // A prefix that is entirely punctuation slugs to "" and is then treated
    // as absent - no leading hyphen is emitted.
    ["!!!", "Smith", "", "smith"],
    // A student name that is entirely punctuation falls through to "student".
    ["cs101", "!!!", "", "cs101-student"],
  ];

  for (const [prefix, student, username, expected] of CASES) {
    it(`names (${JSON.stringify(prefix)}, ${JSON.stringify(student)}, ${JSON.stringify(username)}) as ${JSON.stringify(expected)}`, () => {
      expect(studentRepoName(prefix, student, username)).toBe(expected);
    });
  }

  it("truncates to 95 characters, keeping the leading prefix", () => {
    // 60 a's + "-" + 60 b's = 121 characters, cut to the first 95:
    // 60 a's + "-" + 34 b's.
    const actual = studentRepoName("a".repeat(60), "b".repeat(60), "");
    expect(actual).toBe(`${"a".repeat(60)}-${"b".repeat(34)}`);
    expect(actual).toHaveLength(95);
  });

  it("leaves a name that is exactly 95 characters untouched", () => {
    const actual = studentRepoName("a".repeat(60), "b".repeat(34), "");
    expect(actual).toBe(`${"a".repeat(60)}-${"b".repeat(34)}`);
    expect(actual).toHaveLength(95);
  });

  it("does not truncate a name shorter than the limit", () => {
    expect(studentRepoName("cs101", "Smith", "")).toBe("cs101-smith");
  });
});
