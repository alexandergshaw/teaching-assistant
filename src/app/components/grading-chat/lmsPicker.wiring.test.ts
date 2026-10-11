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
