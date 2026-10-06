import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// KNOWLEDGE-SWITCH-SPEED W2: pins the load ORDERING of useKbPageTree - the
// summaries read is issued before the full-body read, and the tree/idle state
// is reached from the summaries result without awaiting the body read.
const source = readFileSync(join(__dirname, "useKbPageTree.ts"), "utf8");

describe("useKbPageTree load ordering", () => {
  it("issues the summaries read before the first full-body read", () => {
    const summaries = source.indexOf("listInstitutionPageSummariesAction(active)");
    const bodies = source.indexOf("listInstitutionPagesAction(active)");
    expect(summaries).toBeGreaterThan(-1);
    expect(bodies).toBeGreaterThan(-1);
    expect(summaries).toBeLessThan(bodies);
  });

  it("builds placeholder pages from the summaries result and goes idle without awaiting bodies", () => {
    const block = source.slice(source.indexOf("await summariesRequest"));
    const placeholder = block.indexOf("pagesFromSummaries(");
    const idle = block.indexOf('setLoadState("idle")');
    const awaitBodies = block.indexOf("await bodiesRequest");
    expect(placeholder).toBeGreaterThan(-1);
    expect(idle).toBeGreaterThan(placeholder);
    expect(awaitBodies).toBeGreaterThan(idle);
  });

  it("exposes bodiesReady and flips it only from a full read", () => {
    expect(source).toContain("bodiesReady,");
    expect(source.match(/setBodiesReady\(true\)/g)?.length).toBe(2);
  });

  // KNOWLEDGE-CREATE-LAG: create inserts the returned page optimistically.
  // Source-text pins only - no renderer here, so runtime call counts are not proven.
  it("exposes insertCreatedPage with an optimistic branch and a full-read fallback", () => {
    const start = source.indexOf("const insertCreatedPage = useCallback(");
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf("\n  );", start);
    const body = source.slice(start, end);
    expect(source).toContain("insertCreatedPage,\n    applyLocalPageUpdate");
    const fallback = body.indexOf("if (!bodiesReady)");
    const refreshCall = body.indexOf("await refresh(page.id)");
    const refreshedFlag = body.indexOf("refreshedRef.current = true");
    const select = body.indexOf("applySelection(page.id)");
    expect(fallback).toBeGreaterThan(-1);
    expect(refreshCall).toBeGreaterThan(fallback);
    expect(refreshedFlag).toBeGreaterThan(refreshCall);
    expect(select).toBeGreaterThan(refreshedFlag);
    expect(body).not.toContain("listInstitutionPagesAction");
    const optimistic = body.slice(body.indexOf("refreshedRef.current = true"));
    expect(optimistic).toContain("setPages(");
    expect(optimistic).not.toContain("refresh(");
    expect(body).not.toContain("setBodiesReady");
    expect(body).not.toContain("setLoadState");
  });

  // KNOWLEDGE-MUTATION-LAG: rename / reorder / reparent replace the returned rows locally.
  it("exposes applyLocalPageUpdate with an optimistic replace branch and a full-read fallback", () => {
    const start = source.indexOf("const applyLocalPageUpdate = useCallback(");
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf("\n  );", start);
    const body = source.slice(start, end);
    expect(source).toContain("applyLocalPageUpdate,\n    toggleExpand");
    const fallback = body.indexOf("if (!bodiesReady)");
    const refreshCall = body.indexOf("await refresh()");
    const refreshedFlag = body.indexOf("refreshedRef.current = true");
    expect(fallback).toBeGreaterThan(-1);
    expect(refreshCall).toBeGreaterThan(fallback);
    expect(refreshedFlag).toBeGreaterThan(refreshCall);
    const optimistic = body.slice(refreshedFlag);
    expect(optimistic).toContain("replacePages(");
    expect(optimistic).not.toContain("refresh(");
    expect(body).not.toContain("listInstitutionPagesAction");
    expect(body).not.toContain("applySelection");
    expect(body).not.toContain("setBodiesReady");
    expect(body).not.toContain("setLoadState");
  });
});
