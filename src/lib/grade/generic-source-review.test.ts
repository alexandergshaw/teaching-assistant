import { expect, it } from "vitest";
import { genericSourceReview } from "./generic-source-review";
import { validGeneralSourceReview } from "./general-execution-evidence";

it("anchors rubric keyword matches to submitted paths and lines without claiming a grade", () => {
  const review = genericSourceReview("Implement palindrome handling", [{path: "lab/main.py", bytes: new TextEncoder().encode("def palindrome(value):\n    return value == value[::-1]\n")}]);
  expect(review.rubric[0].comment).toContain("lab/main.py:1: def palindrome(value):");
  expect(review.overall).toContain("not findings that criteria were met");
  expect(validGeneralSourceReview(review)).toBe(true);
});
it("does not decode opaque binary or assert a criterion from absence", () => {
  const review = genericSourceReview("Implement palindrome handling", [{path: "lab/output.exe", bytes: new Uint8Array([0, 255])}]);
  expect(review.rubric).toEqual([]);
});
