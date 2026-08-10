import { describe, it, expect } from "vitest";
import { canvasUrlMatchesCourse, findCourseForCanvasUrl } from "./course-canvas-url-match";

describe("canvasUrlMatchesCourse", () => {
  it("matches identical URLs", () => {
    expect(
      canvasUrlMatchesCourse("https://school.instructure.com/courses/123", "https://school.instructure.com/courses/123")
    ).toBe(true);
  });

  it("matches when the tab URL has a trailing slash the stored URL does not", () => {
    expect(
      canvasUrlMatchesCourse("https://school.instructure.com/courses/123", "https://school.instructure.com/courses/123/")
    ).toBe(true);
  });

  it("matches when the tab URL has extra path segments (a deep link into the course)", () => {
    expect(
      canvasUrlMatchesCourse(
        "https://school.instructure.com/courses/123",
        "https://school.instructure.com/courses/123/assignments/456"
      )
    ).toBe(true);
  });

  it("matches when the tab URL carries a query string", () => {
    expect(
      canvasUrlMatchesCourse(
        "https://school.instructure.com/courses/123",
        "https://school.instructure.com/courses/123?foo=bar"
      )
    ).toBe(true);
  });

  it("matches across an http/https scheme mismatch (host is the same)", () => {
    expect(
      canvasUrlMatchesCourse("http://school.instructure.com/courses/123", "https://school.instructure.com/courses/123")
    ).toBe(true);
  });

  it("rejects a different course id on the same host", () => {
    expect(
      canvasUrlMatchesCourse("https://school.instructure.com/courses/123", "https://school.instructure.com/courses/999")
    ).toBe(false);
  });

  it("rejects the same course id on a different host - not raw string/id equality", () => {
    expect(
      canvasUrlMatchesCourse("https://other-school.instructure.com/courses/123", "https://school.instructure.com/courses/123")
    ).toBe(false);
  });

  it("rejects when the stored canvasUrl is null", () => {
    expect(canvasUrlMatchesCourse(null, "https://school.instructure.com/courses/123")).toBe(false);
  });

  it("rejects when the stored canvasUrl is empty/whitespace", () => {
    expect(canvasUrlMatchesCourse("   ", "https://school.instructure.com/courses/123")).toBe(false);
  });

  it("rejects when the tab URL has no /courses/<id> segment", () => {
    expect(canvasUrlMatchesCourse("https://school.instructure.com/courses/123", "https://school.instructure.com/")).toBe(false);
  });

  it("tolerates a schemeless stored URL (matched by host)", () => {
    expect(canvasUrlMatchesCourse("school.instructure.com/courses/123", "https://school.instructure.com/courses/123")).toBe(true);
  });
});

describe("findCourseForCanvasUrl", () => {
  const courses = [
    { id: "a", canvasUrl: "https://school.instructure.com/courses/111" },
    { id: "b", canvasUrl: "https://school.instructure.com/courses/222" },
    { id: "c", canvasUrl: null },
  ];

  it("returns the matching row", () => {
    const found = findCourseForCanvasUrl(courses, "https://school.instructure.com/courses/222/");
    expect(found?.id).toBe("b");
  });

  it("returns null when no row matches (AC S1/S2 - caller reports a specific message, never guesses)", () => {
    const found = findCourseForCanvasUrl(courses, "https://school.instructure.com/courses/999");
    expect(found).toBeNull();
  });

  it("returns null for an empty course list", () => {
    expect(findCourseForCanvasUrl([], "https://school.instructure.com/courses/111")).toBeNull();
  });

  it("skips a row with a null canvasUrl without throwing", () => {
    const found = findCourseForCanvasUrl(courses, "https://school.instructure.com/courses/111");
    expect(found?.id).toBe("a");
  });
});
