import { describe, expect, it } from "vitest";
import { missingSqlCommentRequiresReview as review } from "./sql-comment-review";

describe("SQL comment review preflight", () => {
  const instructions = "In a comment of at least 5 sentences, explain row-level security.";
  const check = (content: string) => review(instructions, [{ path: "lab/security.sql", content }]);
  it("holds the observed missing explanation and unrelated short comments", () => {
    expect(check("CREATE POLICY own_row ON employees;")).toBe(true);
    expect(check("-- unrelated comment\nSELECT 1;")).toBe(true);
  });
  it("ignores comment-like text in SQL strings, identifiers and dollar quotes", () => {
    for (const sql of ["SELECT '-- one. two. three. four. five.';", 'SELECT "/* one. two. three. four. five. */";', "SELECT $$-- one. two. three. four. five.$$;", "SELECT [-- fake];"]) expect(check(sql)).toBe(true);
  });
  it("allows five sentences in common SQL comment forms", () => {
    for (const sql of ["-- One. Two. Three. Four. Five.\nSELECT 1;", "/* One. Two. Three. Four. Five. */ SELECT 1;", "-- One. Two.\n-- Three. Four. Five.\nSELECT 1;"]) expect(check(sql)).toBe(false);
  });
  it("holds malformed lexical input instead of guessing", () => {
    expect(check("SELECT 'unterminated -- One. Two. Three. Four. Five.")).toBe(true);
    expect(check("/* One. Two. Three. Four. Five.")).toBe(true);
    expect(check("# One. Two. Three. Four. Five.\nSELECT 1;")).toBe(true);
    expect(check("--One. Two. Three. Four. Five.\nSELECT 1;")).toBe(true);
  });
  it("recognizes a spelled-out count and does not infer unstated requirements", () => {
    expect(review("In a comment of at least five sentences, explain row-level security.", [{ path: "security.sql", content: "SELECT 1;" }])).toBe(true);
    expect(review(instructions, [])).toBe(false);
    expect(review(instructions, [{ path: "answer.txt", content: "Explanation" }])).toBe(false);
    expect(review("Explain row-level security.", [{ path: "security.sql", content: "SELECT 1;" }])).toBe(false);
  });
  it("checks mixed files only when SQL comment scope is explicit", () => {
    const sql = { path: "security.sql", content: "SELECT 1;" };
    const notes = { path: "notes.txt", content: "One. Two. Three. Four. Five." };
    expect(review(instructions, [sql, notes])).toBe(false);
    expect(review(instructions, [sql, { path: "answer.py", content: "# One. Two. Three. Four. Five." }])).toBe(false);
    expect(review("In a SQL comment of at least 5 sentences, explain row-level security.", [sql, notes])).toBe(true);
    expect(review(instructions, [{ ...sql, content: "-- One. Two. Three. Four. Five." }, notes])).toBe(false);
    expect(review("In a SQL comment of at least 5 sentences, explain row-level security.", [{ ...sql, content: "-- One. Two. Three. Four. Five." }, notes])).toBe(false);
  });
  it("does not combine unrelated comment blocks or separate files", () => {
    expect(check("/* One. Two. Three. */ SELECT 1; /* Four. Five. */")).toBe(true);
    expect(review(instructions, [{ path: "a.sql", content: "-- One. Two. Three." }, { path: "b.sql", content: "-- Four. Five." }])).toBe(true);
    expect(check("-- One. Two. Three.\n\n-- Four. Five.")).toBe(true);
    expect(check("/*! One. Two. Three. Four. Five. */ SELECT 1;")).toBe(true);
    expect(check("/*+ One. Two. Three. Four. Five. */ SELECT 1;")).toBe(true);
  });
  it("accepts a qualifying comment even if a different SQL file is ambiguous", () => {
    const files = [{ path: "good.sql", content: "-- One. Two. Three. Four. Five." }, { path: "other.sql", content: "SELECT 'unterminated" }];
    expect(review(instructions, files)).toBe(false);
    expect(check("-- One. Two. Three. Four. Five.\nSELECT 'unterminated")).toBe(false);
    expect(check("SELECT 'unterminated -- One. Two. Three. Four. Five.")).toBe(true);
  });
});
