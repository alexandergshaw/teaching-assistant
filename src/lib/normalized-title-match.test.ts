import { describe, it, expect } from "vitest";
import { normalizedTitleEquals } from "./normalized-title-match";

describe("normalizedTitleEquals", () => {
  it("matches identical strings", () => {
    expect(normalizedTitleEquals("Start Here", "Start Here")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(normalizedTitleEquals("START HERE", "start here")).toBe(true);
  });

  it("is whitespace-insensitive at the edges", () => {
    expect(normalizedTitleEquals("  Start Here  ", "Start Here")).toBe(true);
  });

  it("is case- and whitespace-insensitive together", () => {
    expect(normalizedTitleEquals("  START here ", "start HERE")).toBe(true);
  });

  it("does not collapse internal whitespace - two spaces inside the title still differ from one", () => {
    expect(normalizedTitleEquals("Start  Here", "Start Here")).toBe(false);
  });

  it("rejects a genuinely different title", () => {
    expect(normalizedTitleEquals("Start Here", "Course Intro")).toBe(false);
  });

  it("rejects a substring match - not a contains check", () => {
    expect(normalizedTitleEquals("Start Here", "Start Here Extra")).toBe(false);
  });

  it("treats two empty/whitespace-only strings as equal", () => {
    expect(normalizedTitleEquals("", "   ")).toBe(true);
  });
});
