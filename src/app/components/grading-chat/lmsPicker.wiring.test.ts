import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Reads source text; not a render test. Pins that the LMS picker actually CALLS
// recordChatSeamSettled with list_lms_assignments around the assignment-list
// fetch, not merely that the union member exists.
function withoutLineComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}
const hook = withoutLineComments(readFileSync("src/app/components/grading-chat/useLmsSubmissionPicker.ts", "utf-8"));
const leaf = withoutLineComments(readFileSync("src/app/components/grading-chat/chatSeamDiagnostic.ts", "utf-8"));

describe("LMS picker list_lms_assignments diagnostic wiring", () => {
  it("the union has the member", () => {
    expect(leaf).toContain('"list_lms_assignments"');
  });

  it("captures a start before the fetch and records after it, with a fixed class", () => {
    const start = hook.indexOf("startedAtMs = chatSeamNowMs()");
    const call = hook.indexOf("await listCourseAssignmentsAction(");
    const record = hook.indexOf('operation: "list_lms_assignments"');
    expect(start).toBeGreaterThan(-1);
    expect(start).toBeLessThan(call);
    expect(call).toBeLessThan(record);
    expect(hook).toMatch(/recordChatSeamSettled\(\{\s*operation: "list_lms_assignments"/);
    expect(hook).toMatch(/classifyChatSeamFailure\(r\.error\)/);
  });
});

describe("LMS picker list_lms_courses diagnostic wiring", () => {
  it("both unions carry the member and the label", () => {
    expect(leaf).toContain('"list_lms_courses"');
    const log = withoutLineComments(readFileSync("src/app/components/grading/gradingDiagnosticLog.ts", "utf-8"));
    expect(log).toContain('"list_lms_courses"');
    expect(log).toMatch(/list_lms_courses: "/);
  });

  it("captures a start before the course fetch and records after it", () => {
    const call = hook.indexOf("await listCoursesAction(");
    const start = hook.lastIndexOf("startedAtMs = chatSeamNowMs()", call);
    const record = hook.indexOf('operation: "list_lms_courses"');
    expect(start).toBeGreaterThan(-1);
    expect(start).toBeLessThan(call);
    expect(call).toBeLessThan(record);
    expect(hook).toMatch(/recordChatSeamSettled\(\{\s*operation: "list_lms_courses"/);
  });
});

describe("LMS picker passes the fine failure fields at both record sites (AC-15)", () => {
  it("each site forwards cause, code and serverMs from the action result", () => {
    for (const op of ["list_lms_courses", "list_lms_assignments"]) {
      const at = hook.indexOf(`operation: "${op}"`);
      const close = hook.indexOf("});", at);
      const site = hook.slice(at, close);
      expect(site).toMatch(/cause: "error" in r \? r\.networkFailure\?\.cause/);
      expect(site).toMatch(/code: "error" in r \? r\.networkFailure\?\.code/);
      expect(site).toMatch(/serverMs: "error" in r \? r\.serverMs/);
    }
  });
});
