// Repo Grades view - wiring guard for AC2 item 6 (docs/repo-grades-view-
// acceptance-criteria.md): "NOTHING auto-applies. A suggested row never
// becomes confirmed without an explicit per-row action." repoGradesRows.test.ts
// already pins the PURE half of that guarantee (applyRepoGradeBinding only
// ever changes exactly the repo it is called with, and buildRepoGradeRows/
// buildRepoGradeGridModel never call it themselves). What that cannot prove
// is the other half: that RepoBindingControl.tsx - the one place in this
// view that actually calls the useRepoGradesData.acceptBinding callback -
// only ever does so from a real button click, never automatically. vitest is
// node-env and collects only src/**/*.test.ts (AC6 item 37), so RepoBindingControl.tsx
// is never rendered by any test; this file reads it as TEXT instead, the same
// idiom src/app/components/workflows/useWorkflowRun.wiring.test.ts and
// src/app/components/courses/page-module-css-classes.test.ts both use for
// exactly this class of "implemented but not actually wired the safe way"
// risk.
//
// Per REGRESSION entry 239 check 10 (cited directly in the wave brief): "a
// structural assertion without a canary is worthless" - a checker that always
// returns true would make every assertion below pass vacuously. The
// `describe("canary...")` block below proves callSitesGatedByClick can tell a
// click-gated call from an unguarded one, using two small inline fixtures
// (never read from disk), BEFORE that same function is trusted against the
// real file.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const CONTROL_PATH = join(process.cwd(), "src/app/components/repo-grades/RepoBindingControl.tsx");
const source = readFileSync(CONTROL_PATH, "utf8");

/**
 * Finds every call site of `${calleeName}(` in `text` and reports, per call
 * site, whether it is textually inside an `onClick={...}` handler - i.e. the
 * nearest `onClick={` before it has no intervening `}}` (which would close
 * that handler before reaching the call). A call with no preceding `onClick={`
 * at all is reported as NOT gated. This is a narrow text heuristic, not a
 * real parser - it is good enough for this file's actual shape (verified by
 * the canary below) and is not asked to handle arbitrary JSX.
 */
function callSitesGatedByClick(text: string, calleeName: string): boolean[] {
  const marker = `${calleeName}(`;
  const results: boolean[] = [];
  let searchFrom = 0;
  for (;;) {
    const idx = text.indexOf(marker, searchFrom);
    if (idx === -1) break;
    searchFrom = idx + marker.length;

    const windowStart = Math.max(0, idx - 400);
    const preceding = text.slice(windowStart, idx);
    const lastOnClick = preceding.lastIndexOf("onClick={");
    if (lastOnClick === -1) {
      results.push(false);
      continue;
    }
    const closingBetween = preceding.indexOf("}}", lastOnClick);
    // No "}}" between the nearest onClick={ and this call site means the
    // handler is still open when the call happens - gated. A "}}" found in
    // between means some EARLIER handler already closed before this call, so
    // this call site is not actually inside it - not gated.
    results.push(closingBetween === -1);
  }
  return results;
}

describe("callSitesGatedByClick (canary: proves the gating check actually discriminates)", () => {
  it("reports a call inside onClick={} as gated", () => {
    const fixture = `const jsx = <button onClick={() => { void accept(id, name); }}>Confirm</button>;`;
    expect(callSitesGatedByClick(fixture, "accept")).toEqual([true]);
  });

  it("reports a call OUTSIDE any onClick (e.g. fired from an effect) as NOT gated", () => {
    const fixture = `useEffect(() => { void accept(id, name); }, []);\nreturn <button>Confirm</button>;`;
    expect(callSitesGatedByClick(fixture, "accept")).toEqual([false]);
  });

  it("reports a call after an EARLIER, already-closed onClick as NOT gated (proximity must not over-match)", () => {
    const fixture = `<button onClick={() => { doSomethingElse(); }}>Other</button>\naccept(id, name);`;
    expect(callSitesGatedByClick(fixture, "accept")).toEqual([false]);
  });

  it("reports one boolean per call site when there are several", () => {
    const fixture = `<button onClick={() => accept(1, "a")}>A</button><button onClick={() => accept(2, "b")}>B</button>`;
    expect(callSitesGatedByClick(fixture, "accept")).toEqual([true, true]);
  });
});

describe("RepoBindingControl.tsx wires binding acceptance behind an explicit click only (AC2 item 6)", () => {
  it("canary: the file was actually read and contains its known binding-state branches", () => {
    expect(source.length).toBeGreaterThan(200);
    expect(source).toContain("Confirm binding");
    expect(source).toContain("Bind to this student");
    expect(source).toContain("onAcceptBinding");
  });

  it("the local accept() wrapper forwards to the onAcceptBinding prop rather than resolving locally", () => {
    const defIdx = source.indexOf("const accept = ");
    expect(defIdx).toBeGreaterThan(-1);
    const body = source.slice(defIdx, defIdx + 400);
    expect(body).toContain("onAcceptBinding(row.repo, canvasUserId, student, null)");
  });

  it("every call to accept(...) is inside an onClick handler - never a bare render-time or effect call", () => {
    const gated = callSitesGatedByClick(source, "accept");
    // At least one call site must exist - a checker that finds zero call
    // sites would make the "every" assertion below pass vacuously.
    expect(gated.length).toBeGreaterThanOrEqual(3); // suggested, ambiguous (per candidate), unbound
    expect(gated.every(Boolean)).toBe(true);
  });

  it("the file defines no effect at all, so there is no mount-time or state-change-triggered path that could call accept() automatically", () => {
    expect(source).not.toContain("useEffect");
  });

  it("the suggested-state branch requires the SAME repo's single candidate id, never a hardcoded or unrelated one", () => {
    const suggestedBranchIdx = source.indexOf('row.binding.state === "suggested"');
    expect(suggestedBranchIdx).toBeGreaterThan(-1);
    const branch = source.slice(suggestedBranchIdx, suggestedBranchIdx + 700);
    expect(branch).toContain("accept(candidate.canvasUserId, candidate.name)");
  });

  it("the unbound-state branch's Bind button is disabled until a roster student is actually picked", () => {
    const unboundIdx = source.lastIndexOf('"unbound" - a manual picker');
    expect(unboundIdx).toBeGreaterThan(-1);
    const branch = source.slice(unboundIdx, unboundIdx + 1200);
    expect(branch).toContain("disabled={busy || !pickedRosterId}");
  });
});
