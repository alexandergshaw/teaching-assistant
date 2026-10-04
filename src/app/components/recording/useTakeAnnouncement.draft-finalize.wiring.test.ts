import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// ARC-L1 wiring half: the leaf (take-announcement-draft.ts) only closes the
// embedded-prompt, blank-draft and invented-URL defects if runDraft actually
// routes draftAnnouncementAction's result through it. No component is rendered
// by vitest here, so this is a structural source-text check, mirroring
// useTakeAnnouncement.image-copy-safety.test.ts. It pins the fact (imported,
// called, and setSubject/setBody come after it) and not variable spelling.

const IMPORT_RE = /import\s*\{[^}]*\bfinalizeTakeDraft\b[^}]*\}\s*from\s*["'][^"']*take-announcement-draft["']/;

function runDraftBody(source: string): string | null {
  const start = source.indexOf("async function runDraft(");
  if (start < 0) return null;
  const rest = source.slice(start);
  const end = rest.search(/\n {2}\/\/ Every function below/);
  return end < 0 ? rest : rest.slice(0, end);
}

function wiringProblem(source: string): string | null {
  if (!IMPORT_RE.test(source)) return "finalizeTakeDraft is not imported from take-announcement-draft";
  const body = runDraftBody(source);
  if (body === null) return "runDraft not found";
  const callAt = body.search(/\bfinalizeTakeDraft\(/);
  if (callAt < 0) return "runDraft does not call finalizeTakeDraft";
  const afterCall = body.slice(callAt);
  if (!/setSubject\(/.test(afterCall) || !/setBody\(/.test(afterCall)) {
    return "setSubject/setBody do not follow the finalizeTakeDraft call";
  }
  // The raw action result must not feed the setters directly.
  if (/set(?:Subject|Body)\(\s*raw\b/.test(body)) return "setSubject/setBody read the raw action result";
  return null;
}

describe("runDraft routes the draft through finalizeTakeDraft", () => {
  const hookSource = fs.readFileSync(
    path.resolve(process.cwd(), "src/app/components/recording/useTakeAnnouncement.ts"),
    "utf-8"
  );

  it("finds at least one finalizeTakeDraft( call - a check over nothing proves nothing", () => {
    expect(hookSource).toMatch(/finalizeTakeDraft\(/);
  });

  it("runDraft imports, calls, and consumes the finalized result", () => {
    expect(wiringProblem(hookSource)).toBeNull();
  });

  it("sabotage check: the scan reports a problem when the call is removed", () => {
    const sabotaged = hookSource.replace(/\bfinalizeTakeDraft\(/g, "passThrough(");
    expect(wiringProblem(sabotaged)).not.toBeNull();
  });

  it("sabotage check: the scan reports a problem when the setters read the raw result", () => {
    const sabotaged = hookSource.replace(/setSubject\(result\.title\)/, "setSubject(raw.title)");
    expect(wiringProblem(sabotaged)).not.toBeNull();
  });
});
