import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// AC-23: prompt-announcement-types.ts must stay TYPE-ONLY - it is the one
// legal exception to "every wave's file list must include the file that
// CALLS each new export" (no runtime binding means no caller to include).
// Duplicated comment-stripping helpers, per this repo's own rule against
// importing from another *.test.ts file.

const FILE = join(process.cwd(), "src/lib/prompt-announcement-types.ts");

function stripComments(source: string): string {
  const noBlockComments = source.replace(/\/\*[^]*?\*\//g, "");
  return noBlockComments
    .split(/\r?\n/)
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

describe("prompt-announcement-types.ts is type-only (AC-23)", () => {
  const stripped = stripComments(readFileSync(FILE, "utf8"));
  const lines = stripped.split("\n").map((l) => l.trim()).filter(Boolean);

  it("(i) every export line is a type or interface export, and the set is non-empty", () => {
    const exportLines = lines.filter((l) => /^export\b/.test(l));
    expect(exportLines.length).toBeGreaterThan(0);
    for (const line of exportLines) {
      expect(line, `non-type export: ${line}`).toMatch(/^export\s+(type|interface)\b/);
    }
  });

  it("(ii) every import line is a type-only import, and the set is non-empty", () => {
    const importLines = lines.filter((l) => /^import\b/.test(l));
    expect(importLines.length).toBeGreaterThan(0);
    for (const line of importLines) {
      expect(line, `non-type import: ${line}`).toMatch(/^import\s+type\b/);
    }
  });

  it("(iii) the stripped body contains no runtime binding", () => {
    for (const forbidden of ["export const", "export function", "export class", "export default", "export enum", "require("]) {
      expect(stripped, `found forbidden token: ${forbidden}`).not.toContain(forbidden);
    }
  });
});
