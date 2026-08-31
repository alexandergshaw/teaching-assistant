import { describe, it, expect } from "vitest";
import { takePostArmSignature } from "./takeAnnouncementArming";

describe("takePostArmSignature", () => {
  it("returns the same string for the same inputs", () => {
    const a = takePostArmSignature("take-1", "course-1", "ACME");
    const b = takePostArmSignature("take-1", "course-1", "ACME");
    expect(a).toBe(b);
  });

  it("changes when the take id changes", () => {
    const a = takePostArmSignature("take-1", "course-1", "ACME");
    const b = takePostArmSignature("take-2", "course-1", "ACME");
    expect(a).not.toBe(b);
  });

  it("changes when the course changes", () => {
    const a = takePostArmSignature("take-1", "course-1", "ACME");
    const b = takePostArmSignature("take-1", "course-2", "ACME");
    expect(a).not.toBe(b);
  });

  it("changes when the institution changes", () => {
    const a = takePostArmSignature("take-1", "course-1", "ACME");
    const b = takePostArmSignature("take-1", "course-1", "OTHER");
    expect(a).not.toBe(b);
  });

  it("does not collide across a field boundary (delimiter-safe)", () => {
    // A naive delimiter join could collide here; JSON.stringify of an
    // ordered array must not.
    const a = takePostArmSignature("take-1,course-9", "", "ACME");
    const b = takePostArmSignature("take-1", "course-9", "ACME");
    expect(a).not.toBe(b);
  });
});
