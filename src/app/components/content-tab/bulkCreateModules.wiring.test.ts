// Bulk-create-modules - wiring guard for the two risks the pure planner
// (src/lib/bulk-module-plan.ts, fully covered by bulk-module-plan.test.ts)
// cannot itself see. vitest is node-env and collects only src/**/*.test.ts
// (no .tsx is ever rendered - see AGENTS.md/CLAUDE.md-linked project notes
// and REGRESSION's own repeated citation of this constraint), so a bug
// confined entirely to BulkCreateModulesModal.tsx or ModulesHeaderBar.tsx
// would be invisible to any test that only exercises the planner. This file
// reads those two components as TEXT instead - the same idiom
// src/app/components/repo-grades/repoGrades.wiring.test.ts,
// src/app/components/workflows/useWorkflowRun.wiring.test.ts, and
// src/app/components/courses/page-module-css-classes.test.ts all use for
// exactly this class of "implemented but not actually wired the safe way"
// risk (REGRESSION entry 239 check 10: "a structural assertion without a
// canary is worthless" - every checker below is proven against inline
// fixtures before being trusted against the real files).
//
// Risk 1: the modal could loop over EVERY plan entry instead of only the
// "create" ones, defeating the planner's own idempotency guarantee at the UI
// layer even though planBulkModuleCreation itself is correct - re-running the
// modal would then re-POST a createModuleAction call for every
// "already-present" entry too.
//
// Risk 2: the "Create modules" button could inherit the SAME
// `modules.length === 0` disabled condition its Rename/Schedule siblings use
// (a plausible copy-paste mistake, since it sits in the same button group),
// which would make the control impossible to reach on a brand-new,
// still-empty course - exactly the case it exists for.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const MODAL_PATH = join(process.cwd(), "src/app/components/content-tab/BulkCreateModulesModal.tsx");
const modalSource = readFileSync(MODAL_PATH, "utf8");
const HEADER_BAR_PATH = join(process.cwd(), "src/app/components/content-tab/modules/ModulesHeaderBar.tsx");
const headerBarSource = readFileSync(HEADER_BAR_PATH, "utf8");

/**
 * True when the FIRST statement inside `for (const entry of plan.entries) {`
 * is a guard that skips (via `continue`) every entry whose `action` is not
 * `"create"`, BEFORE `calleeName(` is called anywhere in that loop body. A
 * narrow text heuristic (matching this specific file's own loop shape, not a
 * general parser) - proven against the two canary fixtures below first, per
 * the file header's citation of REGRESSION entry 239 check 10.
 */
function loopGuardsCalleeToCreateEntriesOnly(text: string, calleeName: string): boolean {
  const loopMarker = "for (const entry of plan.entries) {";
  const loopStart = text.indexOf(loopMarker);
  if (loopStart === -1) return false;
  // Brace-depth walk from just after the loop's opening "{" to its matching
  // closing "}", rather than a hardcoded indentation pattern - so the check
  // works identically against the real file's actual indentation AND against
  // differently-indented inline test fixtures (the bug an indentation-
  // sensitive marker like "\n    }" would silently mask: a canary fixture
  // indented differently than the real file would make the check pass or
  // fail for a reason that has nothing to do with what it claims to test).
  const bodyStart = loopStart + loopMarker.length;
  let depth = 1;
  let idx = bodyStart;
  while (idx < text.length && depth > 0) {
    if (text[idx] === "{") depth += 1;
    else if (text[idx] === "}") depth -= 1;
    idx += 1;
  }
  if (depth !== 0) return false;
  const body = text.slice(bodyStart, idx - 1);

  const guardIdx = body.indexOf('if (entry.action !== "create") continue;');
  const calleeIdx = body.indexOf(`${calleeName}(`);
  if (guardIdx === -1 || calleeIdx === -1) return false;
  // The guard must come BEFORE the callee call, so every path that reaches
  // the call has already skipped non-"create" entries.
  return guardIdx < calleeIdx;
}

describe("loopGuardsCalleeToCreateEntriesOnly (canary: proves the loop-guard check actually discriminates)", () => {
  it("reports true when the skip-guard precedes the call inside the loop", () => {
    const fixture = `
      for (const entry of plan.entries) {
        if (entry.action !== "create") continue;
        const result = await doWrite(entry.name);
      }
    `;
    expect(loopGuardsCalleeToCreateEntriesOnly(fixture, "doWrite")).toBe(true);
  });

  it("reports false when the guard is missing entirely (calls fire for every entry, including already-present ones)", () => {
    const fixture = `
      for (const entry of plan.entries) {
        const result = await doWrite(entry.name);
      }
    `;
    expect(loopGuardsCalleeToCreateEntriesOnly(fixture, "doWrite")).toBe(false);
  });

  it("reports false when the guard exists but the call happens BEFORE it (guard is dead code)", () => {
    const fixture = `
      for (const entry of plan.entries) {
        const result = await doWrite(entry.name);
        if (entry.action !== "create") continue;
      }
    `;
    expect(loopGuardsCalleeToCreateEntriesOnly(fixture, "doWrite")).toBe(false);
  });

  it("reports false when the loop iterates something other than plan.entries (marker must match exactly)", () => {
    const fixture = `
      for (const entry of otherList) {
        if (entry.action !== "create") continue;
        const result = await doWrite(entry.name);
      }
    `;
    expect(loopGuardsCalleeToCreateEntriesOnly(fixture, "doWrite")).toBe(false);
  });
});

describe("BulkCreateModulesModal.tsx's create loop only writes 'create' entries (idempotency preserved at the UI layer)", () => {
  it("canary: the file was actually read and contains its known creation-loop shape", () => {
    expect(modalSource.length).toBeGreaterThan(200);
    expect(modalSource).toContain("planBulkModuleCreation");
    expect(modalSource).toContain("createModuleAction");
    expect(modalSource).toContain('for (const entry of plan.entries) {');
  });

  it("imports planBulkModuleCreation from the pure planner module, rather than reimplementing the plan locally", () => {
    expect(modalSource).toMatch(
      /import\s*\{[^}]*\bplanBulkModuleCreation\b[^}]*\}\s*from\s*["']@\/lib\/bulk-module-plan["']/
    );
  });

  it("createModuleAction is called only after the entry.action !== \"create\" skip-guard inside the loop", () => {
    expect(loopGuardsCalleeToCreateEntriesOnly(modalSource, "createModuleAction")).toBe(true);
  });

  it("the apply button's disabled state reads plan.error and plan.createCount, not a hand-rolled duplicate condition", () => {
    const buttonIdx = modalSource.indexOf("<Button");
    const closeIdx = modalSource.indexOf("</Button>", buttonIdx);
    // The FIRST <Button> in the file is the modal's own header-adjacent close
    // control is a plain <button>, not <Button>; the apply button is the only
    // MUI <Button> in this file, so the first match is it.
    const body = modalSource.slice(buttonIdx, closeIdx);
    expect(body).toContain("disabled={applying || !!plan.error || plan.createCount === 0}");
  });
});

/**
 * True when the `disabled={...}` expression immediately following the FIRST
 * occurrence of `marker` in `text` contains `modules.length === 0`. Proven
 * against canary fixtures before use, per this file's header comment.
 */
function disabledExpressionAfter(text: string, marker: string): string | null {
  const markerIdx = text.indexOf(marker);
  if (markerIdx === -1) return null;
  const disabledIdx = text.indexOf("disabled={", markerIdx);
  if (disabledIdx === -1) return null;
  const closeIdx = text.indexOf("}", disabledIdx + "disabled={".length);
  if (closeIdx === -1) return null;
  return text.slice(disabledIdx, closeIdx + 1);
}

describe("disabledExpressionAfter (canary: proves the disabled-expression extractor actually discriminates)", () => {
  it("extracts the disabled expression that follows a given marker", () => {
    const fixture = `<Button onClick={() => setX(true)} disabled={busy || modules.length === 0}>Rename</Button>`;
    expect(disabledExpressionAfter(fixture, "setX(true)")).toBe("disabled={busy || modules.length === 0}");
  });

  it("does not pick up an EARLIER button's disabled expression for a LATER marker", () => {
    const fixture = `<Button disabled={busy}>A</Button><Button onClick={() => setY(true)} disabled={busy || modules.length === 0}>B</Button>`;
    expect(disabledExpressionAfter(fixture, "setY(true)")).toBe("disabled={busy || modules.length === 0}");
  });
});

describe("ModulesHeaderBar.tsx's \"Create modules\" trigger is reachable on an empty course (Risk 2)", () => {
  it("canary: the file was actually read and contains the new trigger alongside its Rename/Schedule siblings", () => {
    expect(headerBarSource.length).toBeGreaterThan(200);
    expect(headerBarSource).toContain("Create modules");
    expect(headerBarSource).toContain("setBulkCreateOpen(true)");
    expect(headerBarSource).toContain("setRenameOpen(true)");
  });

  it("the Rename and Schedule due dates triggers ARE gated on a non-empty module list (sanity: proves this suite's extractor finds the real gating pattern, not just its absence)", () => {
    expect(disabledExpressionAfter(headerBarSource, "setRenameOpen(true)")).toBe(
      "disabled={busy || modules.length === 0}"
    );
    expect(disabledExpressionAfter(headerBarSource, "setScheduleOpen(true)")).toBe(
      "disabled={busy || modules.length === 0}"
    );
  });

  it("the Create modules trigger's disabled expression does NOT reference modules.length - it must stay clickable on a still-empty course", () => {
    const disabled = disabledExpressionAfter(headerBarSource, "setBulkCreateOpen(true)");
    expect(disabled).not.toBeNull();
    expect(disabled).not.toContain("modules.length");
  });

  it("the Create modules trigger is still gated on busy, so it cannot be opened mid-write like every other action in this bar", () => {
    const disabled = disabledExpressionAfter(headerBarSource, "setBulkCreateOpen(true)");
    expect(disabled).toBe("disabled={busy}");
  });
});
