import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("renders the instructor-facing grading failure reason separately from copyable feedback", () => {
  const source = readFileSync("src/app/components/GradingResults.tsx", "utf8");
  expect(source).toContain('import Alert from "@mui/material/Alert"');
  expect(source).toContain('result.ungraded?.kind === "grading-failed"');
  expect(source).toContain("Instructor review: {instructorHoldReason(result.ungraded.message)}");
});
