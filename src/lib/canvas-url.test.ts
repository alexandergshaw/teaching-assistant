import { describe, it, expect } from "vitest";
import { parseCanvasUrl, moduleItemContentUrl } from "./canvas-url";

describe("moduleItemContentUrl", () => {
  const courseUrl = "https://school.instructure.com/courses/1234";

  it("builds the direct assignment URL from the content id", () => {
    expect(moduleItemContentUrl(courseUrl, "Assignment", 987, null)).toBe(
      "https://school.instructure.com/courses/1234/assignments/987"
    );
  });

  it("builds the direct discussion URL from the content id", () => {
    expect(moduleItemContentUrl(courseUrl, "Discussion", 55, null)).toBe(
      "https://school.instructure.com/courses/1234/discussion_topics/55"
    );
  });

  it("uses the /courses/<id> prefix even when the course URL has a deeper path", () => {
    expect(
      moduleItemContentUrl("https://school.instructure.com/courses/1234/modules", "Assignment", 7, null)
    ).toBe("https://school.instructure.com/courses/1234/assignments/7");
  });

  it("ignores the /modules/items wrapper html_url when a content id exists", () => {
    expect(
      moduleItemContentUrl(courseUrl, "Assignment", 987, `${courseUrl}/modules/items/42`)
    ).toBe(`${courseUrl}/assignments/987`);
  });

  it("falls back to html_url only when it is itself a parseable content link", () => {
    const direct = `${courseUrl}/assignments/321`;
    expect(moduleItemContentUrl(courseUrl, "Assignment", null, direct)).toBe(direct);
    expect(parseCanvasUrl(direct)).not.toBeNull();
  });

  it("returns null for a wrapper html_url with no content id", () => {
    expect(
      moduleItemContentUrl(courseUrl, "Assignment", null, `${courseUrl}/modules/items/42`)
    ).toBeNull();
  });

  it("returns null for unsupported item types without a parseable html_url", () => {
    expect(moduleItemContentUrl(courseUrl, "Quiz", 12, null)).toBeNull();
    expect(moduleItemContentUrl(courseUrl, "Page", 12, null)).toBeNull();
  });

  it("returns null when the course URL has no /courses/<id> segment", () => {
    expect(moduleItemContentUrl("https://school.instructure.com", "Assignment", 9, null)).toBeNull();
  });
});
