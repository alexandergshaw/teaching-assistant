import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// FIX-1 reachability pin (docs/zip-upload-lag-scope.md): the size pre-flight
// leaf must actually be CALLED from the file inputs before anything uploads.
// This reads source text; it is not a render test and does not prove the
// onChange fires in a browser (owner-walk).

function withoutLineComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const tab = withoutLineComments(readFileSync("src/app/components/GradingTab.tsx", "utf-8"));
const panel = withoutLineComments(
  readFileSync("src/app/components/grading-chat/GradingChatPanel.tsx", "utf-8")
);

function body(src: string, start: string, end: string): string {
  const i = src.indexOf(start);
  if (i < 0) throw new Error(`no ${start}`);
  const j = src.indexOf(end, i);
  return src.slice(i, j < 0 ? undefined : j);
}

describe("FIX-1 upload pre-flight is wired into the file inputs", () => {
  it("GradingTab imports the leaf and the zip input's change handler calls it before restoring or submitting", () => {
    expect(tab).toMatch(/import \{ preflightUploadFile \} from "@\/lib\/grade\/zip-upload-preflight"/);
    const handler = body(tab, "const handleUploadFileChange", "const showContextFields");
    const call = handler.indexOf("preflightUploadFile(");
    expect(call).toBeGreaterThan(-1);
    expect(call).toBeLessThan(handler.indexOf("loadRubricMemory("));
    expect(handler).toMatch(/setUploadRejection\(/);
    expect(tab).toMatch(/onChange=\{handleUploadFileChange\}/);
  });

  it("GradingTab renders the rejection in the role=alert error surface", () => {
    expect(tab).toMatch(/\(uploadRejection \|\| state\.error \|\| incrementalError\)/);
  });

  it("the chat file entry point checks the body size before upload or submission", () => {
    expect(panel).toMatch(/import \{ preflightUploadFile \} from "@\/lib\/grade\/zip-upload-preflight"/);
    const entry = body(panel, "const handleSubmitFiles", "const handlePartialHandoff");
    expect(entry).toContain("submit: (batch, batchLabel, current) => handleConfirmedFiles(batch, batchLabel, current,");
    expect(panel).toContain('onSubmitFiles={(files, label, mode) => handleSubmitFiles(files, label,');
    const handler = body(panel, "const handleConfirmedFiles", "const handleSubmitFiles");
    const call = handler.indexOf("preflightUploadFile(");
    const refusal = handler.indexOf("return { kind: \"refused\", reason: preflight.message }");
    const dispatch = handler.indexOf("const submit = () =>");
    expect(handler).toContain("submitFilesSequentially<SubmitOutcome>(files, async (file) =>");
    expect(handler).toContain('chosen.kind === "body" ? preflightUploadFile(file, "This file")');
    expect(handler).toMatch(/if \(!preflight\.ok\) \{[^}]*\{[^}]*\}[^}]*return \{ kind: "refused", reason: preflight\.message \}/);
    expect(call).toBeGreaterThan(-1);
    expect(refusal).toBeGreaterThan(call);
    expect(dispatch).toBeGreaterThan(refusal);
    expect(handler.indexOf("submitStoragedZip(file,", dispatch)).toBeGreaterThan(dispatch);
    expect(handler.indexOf("submitStoragedSingleFile(file,", dispatch)).toBeGreaterThan(dispatch);
    expect(handler.indexOf('driver.submit({ kind: "file"', dispatch)).toBeGreaterThan(dispatch);
  });
});
