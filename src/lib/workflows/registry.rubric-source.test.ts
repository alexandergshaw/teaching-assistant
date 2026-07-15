import { describe, it, expect } from "vitest";
import { classifyRubricSource } from "./registry";

describe("classifyRubricSource", () => {
  it("classifies a gradable Canvas URL (assignment or discussion) as an LMS probe", () => {
    expect(classifyRubricSource("https://canvas.school.edu/courses/123/assignments/456")).toBe("lms");
    expect(classifyRubricSource("https://x.instructure.com/courses/9/discussion_topics/7")).toBe("lms");
  });

  it("classifies a GitHub repo (owner/name or github.com URL) as a repo probe", () => {
    expect(classifyRubricSource("owner/my-repo")).toBe("repo");
    expect(classifyRubricSource("https://github.com/owner/my-repo")).toBe("repo");
  });

  it("classifies a bare topic as a rubric-bank probe", () => {
    expect(classifyRubricSource("Recursion and trees")).toBe("topic");
    expect(classifyRubricSource("loops")).toBe("topic");
  });

  it("skips a URL that matches no handler (e.g. a bare Canvas course URL), not the bank", () => {
    expect(classifyRubricSource("https://canvas.school.edu/courses/123")).toBe("skip");
    expect(classifyRubricSource("https://example.com/whatever")).toBe("skip");
  });
});
