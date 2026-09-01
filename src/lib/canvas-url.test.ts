import { describe, it, expect } from "vitest";
import { parseCanvasUrl, moduleItemContentUrl, extractCanvasFileIds, courseFileDownloadUrl } from "./canvas-url";

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

describe("extractCanvasFileIds", () => {
  it("extracts file IDs from plain href attributes", () => {
    const html = '<a href="/files/123">File</a>';
    expect(extractCanvasFileIds(html)).toEqual([123]);
  });

  it("extracts file IDs from full absolute URLs", () => {
    const html = '<a href="https://school.instructure.com/courses/456/files/789">File</a>';
    expect(extractCanvasFileIds(html)).toEqual([789]);
  });

  it("extracts file IDs with /download suffix and query strings", () => {
    const html = '<a href="/files/111/download?wrap=1">File</a>';
    expect(extractCanvasFileIds(html)).toEqual([111]);
  });

  it("extracts file IDs from data-api-endpoint attributes", () => {
    const html = '<span data-api-endpoint="/api/v1/files/222">File</span>';
    expect(extractCanvasFileIds(html)).toEqual([222]);
  });

  it("deduplicates file IDs while preserving first-appearance order", () => {
    const html = '<a href="/files/1">A</a><a href="/files/2">B</a><a href="/files/1">C</a>';
    expect(extractCanvasFileIds(html)).toEqual([1, 2]);
  });

  it("returns empty array when no file IDs are found", () => {
    const html = '<a href="/assignments/123">Assignment</a>';
    expect(extractCanvasFileIds(html)).toEqual([]);
  });

  it("returns empty array when given empty string", () => {
    expect(extractCanvasFileIds("")).toEqual([]);
  });

  it("returns empty array when given non-string input", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(extractCanvasFileIds(null as any)).toEqual([]);
  });

  it("extracts multiple mixed formats in order", () => {
    const html = `
      <a href="/files/100">One</a>
      <a href="https://school.instructure.com/courses/789/files/200/download">Two</a>
      <span data-api-endpoint="/api/v1/files/300">Three</span>
    `;
    expect(extractCanvasFileIds(html)).toEqual([100, 200, 300]);
  });

  it("handles /preview suffix", () => {
    const html = '<a href="/files/555/preview">Preview</a>';
    expect(extractCanvasFileIds(html)).toEqual([555]);
  });
});

describe("courseFileDownloadUrl", () => {
  const courseUrl = "https://canvas.mccneb.edu/courses/123";

  it("builds the course-scoped download URL from the course URL and file id (frozen literal)", () => {
    expect(courseFileDownloadUrl(courseUrl, 999)).toBe("https://canvas.mccneb.edu/courses/123/files/999/download");
  });

  it("sabotage check: is not the same shape as a raw per-upload file url", () => {
    const result = courseFileDownloadUrl(courseUrl, 999);
    expect(result).not.toBe("https://canvas.mccneb.edu/files/999/download");
    expect(result).not.toContain("/api/v1/");
  });

  it("uses the /courses/<id> prefix even when the course URL has a deeper path", () => {
    expect(courseFileDownloadUrl(`${courseUrl}/announcements`, 42)).toBe(
      "https://canvas.mccneb.edu/courses/123/files/42/download"
    );
  });

  it("this app's own extractCanvasFileIds recognizes the shape courseFileDownloadUrl builds - round-trips back to the same file id", () => {
    const built = courseFileDownloadUrl(courseUrl, 42)!;
    expect(extractCanvasFileIds(`<a href="${built}">file</a>`)).toEqual([42]);
  });

  it("returns null when the course URL has no /courses/<id> segment", () => {
    expect(courseFileDownloadUrl("https://canvas.mccneb.edu", 1)).toBeNull();
  });
});
