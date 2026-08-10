// Wiring guard for the syllabus upload's transport
// (docs/upload-body-limit-acceptance-criteria.md AC2, AC5 items 20-21).
//
// The defect this feature fixed is invisible to every other kind of test: a
// base64 payload and a storage path are both just strings, the action's
// signature compiles either way, and the failure only appears in PRODUCTION,
// where Vercel refuses a body over 4.5 MB at the platform layer before the
// action is ever entered. A unit test of the action passes happily against the
// broken transport, because the test harness has no 4.5 MB body limit.
//
// So the guard has to be structural: assert that no file bytes are read into a
// string on the way to the action, and that the size cap runs BEFORE the upload
// rather than after it. Same source-text idiom as
// taskCellAttachments.wiring.test.ts, including its two habits that matter -
// comments are stripped (a commented-out `readFileBase64` would otherwise
// satisfy a `toContain`) and every file is proven non-empty before any negative
// assertion runs (`expect("").not.toContain(x)` passes for every x).
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

function readSource(relativePath: string): string {
  const full = join(process.cwd(), relativePath);
  if (!existsSync(full)) return "";
  return readFileSync(full, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

function present(source: string, what: string): string {
  expect(source.length, `${what} does not exist or is empty`).toBeGreaterThan(200);
  return source;
}

const CONTROL = "src/app/components/courses/SyllabusUploadControl.tsx";
const ACTION = "src/app/actions/syllabus-upload.ts";
const STEP = "src/lib/workflows/registry/steps.course-schedule-from-source.ts";

describe("the browser never encodes the syllabus file (AC5 item 20)", () => {
  it("SyllabusUploadControl reads no bytes into a string, in any encoding", () => {
    const source = present(readSource(CONTROL), CONTROL);
    expect(source).not.toContain("readFileBase64");
    expect(source).not.toContain("readAsDataURL");
    expect(source).not.toContain("readAsArrayBuffer");
    expect(source).not.toContain("btoa(");
    expect(source).not.toContain("base64");
  });

  it("SyllabusUploadControl uploads with the browser Supabase client instead", () => {
    const source = present(readSource(CONTROL), CONTROL);
    expect(source).toMatch(/useSupabase\(\)|createClient\(\)/);
    expect(source).toContain("storagePath");
  });

  it("the workflow step that shares the action encodes nothing either - the two paths must not drift", () => {
    // The action's own comment claims the two entry points can never diverge on
    // accepted types and sizes. Converting one alone would have made that
    // silently false, so both are pinned here.
    const source = present(readSource(STEP), STEP);
    expect(source).not.toContain("blobToBase64");
    expect(source).not.toContain("readFileBase64");
  });
});

describe("the action receives a path, never bytes (AC2 item 7)", () => {
  const source = readSource(ACTION);

  it("canary: the action file was read and still exports both entry points", () => {
    expect(source.length).toBeGreaterThan(200);
    expect(source).toContain("uploadSyllabusAction");
    expect(source).toContain("extractSyllabusTextAction");
  });

  it("neither entry point declares a base64 input field", () => {
    // The action legitimately mentions base64 for the REBUILT docx it WRITES,
    // so this cannot be a whole-file ban. What must not exist is a base64
    // field on the way IN. Both signatures take { name, storagePath, mimeType }.
    const s = present(source, ACTION);
    expect(s).not.toMatch(/\bbase64\s*[?]?\s*:\s*string/);
    expect(s).toMatch(/storagePath\s*[?]?\s*:\s*string/);
  });

  it("still writes the rebuilt docx as base64 - that half is unchanged and must not be swept away", () => {
    // A guard that banned the word outright would have quietly broken the
    // persisted artifact while looking like a tightening.
    expect(present(source, ACTION)).toContain("base64");
  });

  it("gets the bytes through the lifecycle helper that guarantees cleanup", () => {
    expect(present(source, ACTION)).toContain("withUploadedSyllabusFile(");
  });
});

// The knowledge-base attachments panel is the OTHER surface this work
// converted (AC1). Same defect, same fix, so the same guard - kept in this
// file rather than a second one because the two must not drift back apart:
// they now share a transport, and the whole reason the 6 MB number was wrong
// on both was that one copied its reasoning from the other.
describe("the knowledge-base attachments panel sends no bytes to its action either (AC1, AC5 item 20)", () => {
  const PANEL = "src/app/components/knowledge/AttachmentsPanel.tsx";
  const KB_ACTION = "src/app/actions/institution-page-attachments.ts";

  it("the panel reads no bytes into a string, in any encoding", () => {
    const source = present(readSource(PANEL), PANEL);
    expect(source).not.toContain("readFileBase64");
    expect(source).not.toContain("readAsDataURL");
    expect(source).not.toContain("btoa(");
    expect(source).not.toContain("base64");
  });

  it("the panel uploads through the shared helper that owns the cap, the ordering and the rollback", () => {
    // That helper now runs in the BROWSER, because once the object write moves
    // client-side the browser is the only party that observes both the Storage
    // outcome and the row-insert outcome - so it is the only place a rollback
    // can still be wired to both.
    const source = present(readSource(PANEL), PANEL);
    expect(source).toContain("uploadInstitutionPageAttachment(");
  });

  it("the action declares no base64 input field - it records a row for an object already written", () => {
    const source = present(readSource(KB_ACTION), KB_ACTION);
    expect(source).not.toMatch(/\bbase64\s*[?]?\s*:\s*string/);
    expect(source).toMatch(/storagePath\s*[?]?\s*:\s*string/);
  });

  it("the two converted surfaces agree on the cap, since they now share a transport", () => {
    const kb = present(readSource("src/lib/institution-page-attachments.ts"), "institution-page-attachments.ts");
    const tasks = present(readSource("src/lib/course-task-attachments.ts"), "course-task-attachments.ts");
    const capOf = (source: string) => /=\s*(\d+)\s*\*\s*1024\s*\*\s*1024/.exec(source)?.[1];
    expect(capOf(kb)).toBe("25");
    expect(capOf(tasks)).toBe("25");
  });
});

describe("the size cap runs before the upload, not after (AC5 item 21)", () => {
  it("the control validates before it uploads - a refused file must cost no upload", () => {
    const source = present(readSource(CONTROL), CONTROL);
    const validateIdx = source.indexOf("validateFileUpload(");
    const uploadIdx = source.search(/\.upload\(/);
    expect(validateIdx).toBeGreaterThan(-1);
    expect(uploadIdx).toBeGreaterThan(-1);
    expect(validateIdx).toBeLessThan(uploadIdx);
  });

  it("the workflow step validates before it uploads too", () => {
    const source = present(readSource(STEP), STEP);
    const validateIdx = source.indexOf("validateFileUpload(");
    const uploadIdx = source.search(/\.upload\(/);
    expect(validateIdx).toBeGreaterThan(-1);
    expect(uploadIdx).toBeGreaterThan(validateIdx);
  });

  it("the cap's own message names the limit rather than saying `too large`", () => {
    const validation = present(
      readSource("src/lib/syllabus-upload-validation.ts"),
      "src/lib/syllabus-upload-validation.ts"
    );
    expect(validation).toMatch(/25\s?MB/);
  });

  it("the cap explains itself by the constraint that actually binds, and points at the existing statement of it", () => {
    // Deliberately a POSITIVE assertion. The obvious negative -
    // `not.toContain("bodySizeLimit")` - would have been vacuous here: this
    // file never mentioned bodySizeLimit even before the fix (its comment read
    // "mirroring repository upload caps"), so that assertion could not have
    // failed at any point in this file's history. What is worth pinning is
    // that the number now has a real justification attached, and that it cites
    // one of the two existing correct statements rather than becoming a
    // seventh independent retelling of the same fact.
    const raw = readFileSync(join(process.cwd(), "src/lib/syllabus-upload-validation.ts"), "utf8");
    expect(raw.length).toBeGreaterThan(200);
    expect(raw).toMatch(/4\.5\s?MB|Vercel/);
    expect(raw).toMatch(/chat\/attachments|course-task-attachments/);
  });
});
