import { describe, it, expect } from "vitest";
import { announcementImageFileName } from "./announcement-image-filename";

// Frozen-literal oracle for announcementImageFileName - see this repo's own
// "source-text tests over-specify" lesson: these pin the observable output
// for concrete inputs, not the implementation's spelling.
describe("announcementImageFileName", () => {
  it("slugifies punctuation and spaces, and maps image/png to .png", () => {
    expect(announcementImageFileName("Week 3: Quiz Reminder!!", "image/png")).toBe(
      "week-3-quiz-reminder-image.png"
    );
  });

  it("maps image/jpeg to .jpg", () => {
    expect(announcementImageFileName("Reminder", "image/jpeg")).toBe("reminder-image.jpg");
  });

  it("falls back to a fixed name for a blank subject", () => {
    expect(announcementImageFileName("", "image/png")).toBe("announcement-image.png");
  });

  it("falls back to a fixed name for a whitespace-only subject", () => {
    expect(announcementImageFileName("   ", "image/jpeg")).toBe("announcement-image.jpg");
  });

  it("falls back to a fixed name for a punctuation-only subject", () => {
    expect(announcementImageFileName("!!!???", "image/png")).toBe("announcement-image.png");
  });

  it("truncates a very long subject to 60 slug characters and trims any trailing dash the cut exposes", () => {
    // 30 "AB " tokens (90 chars) slugify to 30 "ab" tokens joined by dashes,
    // then get sliced to the first 60 characters - exactly 20 "ab" tokens
    // joined by 19 dashes ("ab-" repeats every 3 characters) - and the
    // trailing dash the slice exposes is trimmed off.
    const longSubject = Array(30).fill("AB").join(" ");
    const expectedSlug = Array(20).fill("ab").join("-");
    expect(announcementImageFileName(longSubject, "image/png")).toBe(`${expectedSlug}-image.png`);
  });
});
