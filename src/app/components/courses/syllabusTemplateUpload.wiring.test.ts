// Courses-table upload pre-flight - wiring guard.
//
// The reported bug: uploading a syllabus template from the courses table
// produced "An error occurred in the Server Components render", the masked
// production error, instead of any usable message.
//
// The cause is an ORDERING one, which is why this test asserts order. The only
// size guard on that path lives INSIDE the server action
// (`createSyllabusTemplateAction` -> `checkWireBudget`), so it can only fire
// for a payload that already crossed the wire. Above the platform's request
// cap the request never reaches the function at all, the action's promise
// rejects rather than returning `{error}`, and the component's catch renders a
// framework string. The `.docx` extension check has the same problem: it is
// server-side only here, so a large PDF fails on size before anything tells
// the user it is the wrong type - which is why both formats appeared broken.
//
// `SyllabusTemplateLibrary.tsx` already does this correctly and is the model.
// The helpers are already written and already unit-tested
// (`src/lib/upload-budget.ts`); nothing here needs new logic, only the checks
// moved to the side of the wire where they can work.
//
// vitest here is node-env and collects only `src/**/*.test.ts`, so no
// component renders - this reads the components as text, the idiom
// `generatedPreviewModal.wiring.test.ts` and `repoGrades.wiring.test.ts`
// already use, and every checker below is proven against inline canary
// fixtures before being trusted against the real files.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const CELL_PATH = join(process.cwd(), "src/app/components/courses/SyllabusTemplateCell.tsx");
const cellSource = readFileSync(CELL_PATH, "utf8");

/** Source with comments stripped, so prose describing a check is never
 * mistaken for the check itself. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

/** Index of the first match, or -1. */
function at(text: string, pattern: RegExp): number {
  return text.search(pattern);
}

/** True when `earlier` appears, and appears before `later`. Both must be
 * present - "absent" must never read as "correctly ordered". */
function occursBefore(text: string, earlier: RegExp, later: RegExp): boolean {
  const a = at(text, earlier);
  const b = at(text, later);
  return a !== -1 && b !== -1 && a < b;
}

const READS_THE_FILE = /readFileBase64\s*\(/;
const BUDGET_CHECK = /check(File)?WireBudget\s*\(/;
const EXTENSION_CHECK = /\\\.docx\$?\/i|\.docx["']\s*\)|endsWith\(\s*["']\.docx["']/i;

describe("the ordering checker (canaries first)", () => {
  it("reports a check placed after the read as out of order", () => {
    const wrong = "const b = await readFileBase64(file);\ncheckFileWireBudget(file.size);";
    expect(occursBefore(wrong, BUDGET_CHECK, READS_THE_FILE)).toBe(false);

    const right = "checkFileWireBudget(file.size);\nconst b = await readFileBase64(file);";
    expect(occursBefore(right, BUDGET_CHECK, READS_THE_FILE)).toBe(true);
  });

  it("treats a missing check as a failure, not as correct ordering", () => {
    const missing = "const b = await readFileBase64(file);";
    expect(occursBefore(missing, BUDGET_CHECK, READS_THE_FILE)).toBe(false);
  });

  it("ignores a check that only exists in a comment", () => {
    const commented = "// checkFileWireBudget(file.size) should run here\nconst b = await readFileBase64(file);";
    expect(occursBefore(stripComments(commented), BUDGET_CHECK, READS_THE_FILE)).toBe(false);
  });
});

describe("the syllabus template cell refuses a bad upload before it crosses the wire", () => {
  const source = stripComments(cellSource);

  it("checks the wire budget before reading the file", () => {
    expect(source, "no wire-budget check reached from this component").toMatch(BUDGET_CHECK);
    expect(occursBefore(source, BUDGET_CHECK, READS_THE_FILE)).toBe(true);
  });

  it("checks the file type before reading the file", () => {
    expect(source, "no client-side extension check").toMatch(EXTENSION_CHECK);
    expect(occursBefore(source, EXTENSION_CHECK, READS_THE_FILE)).toBe(true);
  });

  it("takes its budget from the shared module rather than a local number", () => {
    expect(source).toMatch(/from\s+["']@\/lib\/upload-budget["']/);
  });

  it("clears the file input on every outcome, not only on success", () => {
    // Only-on-success reset is why a retry with the SAME file appeared to do
    // nothing: re-picking an identical file fires no change event.
    const reset = at(source, /fileInputRef\.current[\s\S]{0,40}value\s*=\s*""/);
    const tryBlock = at(source, /\btry\s*\{/);
    expect(reset, "the input is never cleared").not.toBe(-1);
    expect(reset, "the reset must not sit inside the success branch").toBeLessThan(tryBlock);
  });
});
