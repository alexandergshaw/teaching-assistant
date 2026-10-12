import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// N15a Wave 1. Reads source text; not a render test (nothing renders here, so
// the checkbox's look and reload behaviour are owner-walk claims). Pins the
// REACHABILITY chain: checkbox -> mode flag -> file input handler -> hook ->
// action, so the queue cannot ship dead.

function withoutComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const tab = withoutComments(readFileSync("src/app/components/GradingTab.tsx", "utf-8"));
const hook = withoutComments(readFileSync("src/app/components/grading/useOneUploadRun.ts", "utf-8"));

describe("GradingTab routes a zip-source upload through the one-upload hook", () => {
  it("constructs the hook with the ta-grading-one-upload key GradingTab owns", () => {
    expect(tab).toContain('import { useOneUploadRun } from "./grading/useOneUploadRun";');
    expect(tab).toContain('const ONE_UPLOAD_STORAGE_KEY = "ta-grading-one-upload";');
    expect(tab).toContain("modeStorageKey: ONE_UPLOAD_STORAGE_KEY");
    expect(tab).toContain("onReject: setUploadRejection");
  });

  it("the hook persists the mode under that key, on and off", () => {
    expect(hook).toMatch(/localStorage\.getItem\(modeStorageKey\) === "1"/);
    expect(hook).toMatch(/localStorage\.setItem\(modeStorageKey, "1"\)/);
    expect(hook).toMatch(/localStorage\.removeItem\(modeStorageKey\)/);
  });

  it("the mode is only active for the upload source", () => {
    expect(tab).toContain('const oneUploadActive = source === "zip" && oneUpload.mode;');
  });

  it("the file input's change handler hands a pick to the hook before any whole-run path", () => {
    expect(tab).toContain("onChange={handleUploadFileChange}");
    const i = tab.indexOf("const handleUploadFileChange");
    const body = tab.slice(i, tab.indexOf("const showContextFields", i));
    const pick = body.indexOf("oneUpload.pick(e.target, { assignmentInstructions, rubric })");
    expect(pick).toBeGreaterThan(-1);
    expect(body.slice(0, pick)).toContain("if (oneUploadActive) return");
    expect(pick).toBeLessThan(body.indexOf("loadRubricMemory("));
  });

  it("the hook's pick preflights, clears the input, then enqueues", () => {
    const i = hook.indexOf("const pick =");
    const body = hook.slice(i, hook.indexOf("return {", i));
    expect(body.indexOf("preflightUploadFile(")).toBeGreaterThan(-1);
    expect(body.indexOf("preflightUploadFile(")).toBeLessThan(body.indexOf('input.value = ""'));
    expect(body.indexOf('input.value = ""')).toBeLessThan(body.indexOf("void enqueueUpload(chosen, context)"));
  });

  it("the checkbox is rendered from the hook's mode and setter", () => {
    expect(tab).toContain("<OneUploadToggle checked={oneUpload.mode} onToggle={oneUpload.setMode} statusText={oneUpload.statusLine} active={oneUploadActive} />");
    const toggle = withoutComments(readFileSync("src/app/components/grading/OneUploadToggle.tsx", "utf-8"));
    expect(toggle).toContain("checked={checked}");
    expect(toggle).toContain("onToggle(e.target.checked)");
    expect(toggle).toContain("{statusText}");
  });

  it("the form never submits a whole run while the mode is on", () => {
    const i = tab.indexOf("event.preventDefault();");
    expect(tab.slice(i, i + 80)).toContain("if (oneUploadActive) return;");
    expect(tab).toContain("oneUploadActive ||");
  });

  it("the accumulating run reaches the existing single results mount", () => {
    expect(tab).toContain("const displayRun = oneUploadRun ?? selectDisplayRun(phase, incrementalRun, run);");
    expect(tab).toContain("const runKey = oneUploadRun ? oneUpload.runKey : selectRunKey(phase, runId);");
  });

  it("does not take the diagnostic core itself; the hook records through the grading wrapper", () => {
    expect(tab).not.toContain("session-diagnostic-log");
    expect(hook).toContain('from "./gradingDiagnosticLog"');
    expect(hook).toContain('operation: "grade_item"');
    expect(hook).not.toContain("markWholeRunStart");
  });
});

describe("useOneUploadRun", () => {
  it("builds through gradingOneUploadAction and grades through /api/grade-run-item", () => {
    expect(hook).toContain('from "@/app/actions/grading-one-upload"');
    expect(hook).toContain("await gradingOneUploadAction(fd)");
    expect(hook).toContain('"/api/grade-run-item"');
  });

  it("assigns identity in a synchronous read-modify-write with no await between", () => {
    const i = hook.indexOf("assignNextUploadIdentity(identityStateRef.current");
    const j = hook.indexOf("identityStateRef.current = step.next;");
    expect(i).toBeGreaterThan(-1);
    expect(j).toBeGreaterThan(i);
    expect(hook.slice(i, j)).not.toContain("await");
  });

  it("paces every dispatch with nextDispatchWaitMs before the post", () => {
    const wait = hook.indexOf("nextDispatchWaitMs(");
    const post = hook.indexOf("await postGradeRunItem(request)");
    expect(wait).toBeGreaterThan(-1);
    expect(wait).toBeLessThan(post);
  });
});
