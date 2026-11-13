import { describe, expect, it } from "vitest";
import { canEditInstructorReview } from "./instructorReviewAvailability";
describe("instructor review availability", () => {
  it("holds editing until both eligibility and the saved review load succeed", () => {
    expect(canEditInstructorReview(true, false)).toBe(false);
    expect(canEditInstructorReview(false, true)).toBe(false);
    expect(canEditInstructorReview(false, false)).toBe(false);
    expect(canEditInstructorReview(true, true)).toBe(true);
  });
});
