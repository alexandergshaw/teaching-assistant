import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// KNOWLEDGE-CREATE-LAG: pins that create no longer re-reads every page body.
// Source-text pins only - no renderer, so runtime call counts are not proven.
const source = readFileSync(join(__dirname, "useKbTreeActions.ts"), "utf8");

function bodyOf(name: string, next: string): string {
  const start = source.indexOf(`const ${name} = async`);
  const end = source.indexOf(next, start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("useKbTreeActions create path", () => {
  const top = bodyOf("createTopLevel", "const createChild");
  const child = bodyOf("createChild", "// ── Rename");

  it("createTopLevel and createChild insert the created page instead of refreshing", () => {
    for (const body of [top, child]) {
      expect(body).toContain("await insertCreatedPage(result.page)");
      expect(body).not.toContain("refresh(");
      expect(body).not.toContain("listInstitutionPagesAction");
    }
  });

  it("still begins the edit session on the created page, after the insert", () => {
    for (const body of [top, child]) {
      const insert = body.indexOf("insertCreatedPage(result.page)");
      const begin = body.indexOf("beginEdit(result.page)");
      expect(begin).toBeGreaterThan(insert);
    }
  });

  it("createChild still expands the parent before inserting", () => {
    expect(child.indexOf("writeExpandedIds(active, next)")).toBeGreaterThan(-1);
    expect(child.indexOf("writeExpandedIds(active, next)")).toBeLessThan(child.indexOf("insertCreatedPage"));
  });

  it("leaves rename and delete on refresh", () => {
    expect(source).toContain("await refresh(null)");
    expect(source).toContain("await refresh();");
  });
});
