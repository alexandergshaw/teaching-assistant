import { describe, expect, it } from "vitest";
import { missingSqlCommentRequiresReview } from "./sql-comment-review";

describe("SQL comment review preflight", () => {
  const instructions = "In a comment of at least 5 sentences, explain row-level security.";
  it("flags the observed missing-comment case without scoring it", () => {
    expect(missingSqlCommentRequiresReview(instructions, [{ path: "lab/security.sql", content: "CREATE POLICY own_row ON employees;" }])).toBe(true);
  });
  it("does not claim a requirement is met merely because a comment exists", () => {
    for (const content of ["-- unrelated comment\nSELECT 1;", "/* note */ SELECT 1;", "# MySQL comment\nSELECT 1;"]) {
      expect(missingSqlCommentRequiresReview(instructions, [{ path: "lab/security.sql", content }])).toBe(false);
    }
  });
  it("recognizes a spelled-out sentence count", () => {
    expect(missingSqlCommentRequiresReview("In a comment of at least five sentences, explain row-level security.", [{ path: "security.sql", content: "SELECT 1;" }])).toBe(true);
  });
  it("does not infer absence from other file types, no files, or an unstated requirement", () => {
    expect(missingSqlCommentRequiresReview(instructions, [])).toBe(false);
    expect(missingSqlCommentRequiresReview(instructions, [{ path: "lab/answer.txt", content: "Explanation" }])).toBe(false);
    expect(missingSqlCommentRequiresReview("Explain row-level security.", [{ path: "lab/security.sql", content: "SELECT 1;" }])).toBe(false);
  });
});
