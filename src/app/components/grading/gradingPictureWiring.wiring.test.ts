import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// N15 wave 3 ships-dead guard (docs/n15-w3-scope.md AC1, AC2): the shipped
// transcribe action must have a production caller, and GradingTab must mount
// the intake for BOTH kinds routed to the matching setter.

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const field = stripComments(
  readFileSync("src/app/components/grading/GradingPictureField.tsx", "utf-8")
);
const tab = stripComments(readFileSync("src/app/components/GradingTab.tsx", "utf-8"));

function mountTag(kind: string): string {
  const m = tab.match(new RegExp(`<GradingPictureField[^>]*kind="${kind}"[^>]*/>`));
  if (!m) throw new Error(`no GradingPictureField mount with kind="${kind}"`);
  return m[0];
}

describe("N15 W3 picture intake wiring", () => {
  it("a client file imports and CALLS transcribeGradingPictureAction directly", () => {
    expect(field).toMatch(
      /import \{ transcribeGradingPictureAction \} from "@\/app\/actions\/grading-picture-transcribe"/
    );
    expect(field).toMatch(/transcribeGradingPictureAction\(/);
  });

  it("GradingTab imports the field and mounts it for the rubric, routed to setRubric", () => {
    expect(tab).toMatch(/import GradingPictureField from "\.\/grading\/GradingPictureField"/);
    const tag = mountTag("rubric");
    expect(tag).toContain("onExtracted={setRubric}");
    expect(tag).toContain("provider={selectedProvider}");
  });

  it("GradingTab mounts it for the assignment description, routed to setAssignmentInstructions", () => {
    const tag = mountTag("assignment description");
    expect(tag).toContain("onExtracted={setAssignmentInstructions}");
    expect(tag).toContain("provider={selectedProvider}");
  });

  it("the field offers a browse path and harvests a paste before any await", () => {
    expect(field).toMatch(/type="file"/);
    const paste = field.slice(field.indexOf("function handlePaste"));
    const body = paste.slice(0, paste.indexOf("\n  }\n"));
    expect(body).toMatch(/clipboardData/);
    expect(body).not.toMatch(/\bawait\b/);
  });
});
