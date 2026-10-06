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

  it("delete stays on refresh(null) and no mutator uses the no-arg refresh any more", () => {
    expect(source).toContain("await refresh(null)");
    expect(source).not.toContain("await refresh();");
  });
});

// KNOWLEDGE-MUTATION-LAG: rename / reorder / reparent apply the returned rows
// locally; delete (cascade, no returned page) keeps the full refresh.
describe("useKbTreeActions rename / reorder / reparent path", () => {
  const rename = bodyOf("commitRename", "// ── Delete");
  const del = bodyOf("confirmDeleteRequest", "// ── Reorder");
  const reorderBody = bodyOf("reorder", "const reparent");
  const reparentBody = bodyOf("reparent", "const canMoveUp");

  it("commitRename, reorder and reparent apply the returned page(s) instead of refreshing", () => {
    expect(rename).toContain("await applyLocalPageUpdate([result.page])");
    expect(reorderBody).toContain("await applyLocalPageUpdate([resA.page, resB.page])");
    expect(reparentBody).toContain("await applyLocalPageUpdate([result.page])");
    for (const body of [rename, reorderBody, reparentBody]) {
      expect(body).not.toContain("refresh(");
      expect(body).not.toContain("listInstitutionPagesAction");
    }
  });

  it("delete still refreshes with a null selection", () => {
    expect(del).toContain("await refresh(null)");
    expect(del).not.toContain("applyLocalPageUpdate");
  });

  it("reparent still expands the new parent before applying the update", () => {
    const expand = reparentBody.indexOf("writeExpandedIds(active, next)");
    expect(expand).toBeGreaterThan(-1);
    expect(expand).toBeLessThan(reparentBody.indexOf("applyLocalPageUpdate"));
  });
});
