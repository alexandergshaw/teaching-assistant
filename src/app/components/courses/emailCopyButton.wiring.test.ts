import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(process.cwd(), "src/app/components/courses");
const courseRow = readFileSync(join(dir, "CourseRow.tsx"), "utf8");
const button = readFileSync(join(dir, "EmailCopyButton.tsx"), "utf8");

describe("EmailCopyButton wiring (per-row correctness)", () => {
  it("CourseRow passes this row's course.email into EmailCopyButton in the email cell", () => {
    const m = courseRow.match(/email: <EditableCell[^\n]*\n?/);
    expect(m).not.toBeNull();
    expect(m![0]).toContain("<EmailCopyButton email={course.email ?? \"\"}");
    expect(courseRow).toContain('import EmailCopyButton from "./EmailCopyButton"');
  });

  it("EmailCopyButton writes its own email prop and stops propagation", () => {
    expect(button).toMatch(/writeClipboardText\(email\)/);
    expect(button).toContain("e.stopPropagation()");
    expect(button).toMatch(/email\.trim\(\) === ""\) return null/);
    expect(button).toContain('role="status"');
  });
});
