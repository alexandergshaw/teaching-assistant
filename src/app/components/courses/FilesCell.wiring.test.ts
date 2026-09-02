// F3 (LMS Exports at-rest cell): hasOnlyGeneratedExports
// (src/lib/courses-table-helpers.ts) already existed to distinguish "every
// export file is app-generated" from a real instructor-provided export
// (REGRESSION entry 196 AC3), but had zero callers outside its own test -
// the at-rest cell rendered a bare "N files" that read identically either
// way, and canImport/lmsRenderSourcesFor both already treated the two states
// as different. This guards that the fix actually reaches the AT-REST cell
// (the summary line rendered before the "Manage" popover opens), not just
// somewhere in the file - "reachability, not just correctness".
//
// vitest here is node-env and collects only src/**/*.test.ts, so no
// component renders - this reads the component as text, the idiom
// syllabusTemplateUpload.wiring.test.ts already uses, and every checker
// below is proven against inline canary fixtures before being trusted
// against the real file.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const CELL_PATH = join(process.cwd(), "src/app/components/courses/FilesCell.tsx");
const rawSource = readFileSync(CELL_PATH, "utf8");

/** Source with comments stripped, so prose describing the check is never
 * mistaken for the check itself. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

/** The body of one `export function <name>` declaration, up to (but not
 * including) the next top-level `export function` - good enough here since
 * FilesCell.tsx only ever declares its two cells that way. */
function extractFunctionBody(text: string, functionName: string): string {
  const marker = `export function ${functionName}`;
  const start = text.indexOf(marker);
  if (start === -1) return "";
  const rest = text.slice(start + marker.length);
  const nextExportOffset = rest.search(/\nexport function /);
  return nextExportOffset === -1 ? rest : rest.slice(0, nextExportOffset);
}

const HAS_ONLY_GENERATED_CALL = /hasOnlyGeneratedExports\(/;
// The variable the call's result is stored in (see FilesCell.tsx), not the
// call site itself - a call that happens early but whose result is only
// ever RENDERED inside the popover is exactly the "two clicks deep" defect
// this guards against, and checking the call site alone would miss it (the
// call naturally happens before the Popover JSX regardless of where its
// result is later read).
const ONLY_GENERATED_RENDERED = /\{onlyGenerated\b/;
const POPOVER_OPEN_TAG = /<Popover\b/;

describe("extractFunctionBody / stripComments (canaries first)", () => {
  it("isolates the named function's body up to the next export function", () => {
    const source = [
      "export function A() {",
      "  const x = 1;",
      "}",
      "",
      "export function B() {",
      "  const y = 2;",
      "}",
    ].join("\n");
    const bodyA = extractFunctionBody(source, "A");
    expect(bodyA).toContain("const x = 1;");
    expect(bodyA).not.toContain("const y = 2;");
  });

  it("returns an empty string when the function is not present", () => {
    expect(extractFunctionBody("export function Only() {}", "Missing")).toBe("");
  });

  it("ignores a reference that only exists in a comment", () => {
    const commented = "// hasOnlyGeneratedExports(course) should be called here\nconst x = 1;";
    expect(stripComments(commented)).not.toMatch(HAS_ONLY_GENERATED_CALL);
  });
});

describe("LmsExportsCell surfaces hasOnlyGeneratedExports at rest, not only in the popover", () => {
  const clean = stripComments(rawSource);
  const body = extractFunctionBody(clean, "LmsExportsCell");

  it("imports hasOnlyGeneratedExports from the shared helpers module", () => {
    expect(clean).toMatch(
      /import\s*\{[^}]*hasOnlyGeneratedExports[^}]*\}\s*from\s*["']@\/lib\/courses-table-helpers["']/
    );
  });

  it("actually declares an LmsExportsCell function body to check (a missing function must not read as a passing file)", () => {
    expect(body.length).toBeGreaterThan(0);
  });

  it("calls hasOnlyGeneratedExports inside LmsExportsCell", () => {
    expect(body).toMatch(HAS_ONLY_GENERATED_CALL);
  });

  it("renders the flag before the Popover - it must reach the at-rest summary, not only the two-clicks-deep popover body", () => {
    const renderedIdx = body.search(ONLY_GENERATED_RENDERED);
    const popoverIdx = body.search(POPOVER_OPEN_TAG);
    expect(renderedIdx, "onlyGenerated is never rendered in JSX at all").toBeGreaterThan(-1);
    expect(popoverIdx).toBeGreaterThan(-1);
    expect(renderedIdx).toBeLessThan(popoverIdx);
  });
});
