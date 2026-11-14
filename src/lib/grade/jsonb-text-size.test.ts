import { expect, it } from "vitest";
import { jsonbTextSizeUpperBound } from "./jsonb-text-size";
import { validGeneralSourceReview } from "./general-execution-evidence";

it("counts PostgreSQL separator whitespace without counting punctuation in strings", () => {
  const value = { text: "a, b: \\\"quoted\\\"", items: ["á", "界"] };
  const compact = JSON.stringify(value);
  expect(jsonbTextSizeUpperBound(value)).toBe(new TextEncoder().encode(compact).byteLength + 4);
});

it("rejects feedback near the database limit before a settlement attempt", () => {
  const review = { overall: "x".repeat(16000), rubric: Array.from({ length: 40 }, () => ({ area: "a", comment: "界".repeat(1524) })) };
  expect(new TextEncoder().encode(JSON.stringify(review)).byteLength).toBeLessThan(200000);
  expect(jsonbTextSizeUpperBound(review)).toBeGreaterThan(199000);
  expect(validGeneralSourceReview(review)).toBe(false);
});
