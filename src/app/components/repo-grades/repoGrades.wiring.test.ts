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

// This wave (docs/repo-grades-view-acceptance-criteria.md, tasks 2-4 and the
// "Tests written BEFORE implementation" list items 7-8) added two more
// dangerous, click-only actions - grading a cell (gradeRepoAction) and
// posting a column (postCanvasGradesAction) - split across three files the
// same way binding acceptance is split across RepoBindingControl.tsx and
// index.tsx's acceptBinding. The guards below extend this file's existing
// text-reading approach to all three, rather than creating a parallel guard
// file, so every "is this dangerous call actually gated" guarantee in this
// feature lives in one place.
const CELL_CONTROL_PATH = join(process.cwd(), "src/app/components/repo-grades/RepoGradeCellControl.tsx");
const cellControlSource = readFileSync(CELL_CONTROL_PATH, "utf8");
const GRID_PATH = join(process.cwd(), "src/app/components/repo-grades/RepoGradesGrid.tsx");
const gridSource = readFileSync(GRID_PATH, "utf8");
const INDEX_PATH = join(process.cwd(), "src/app/components/repo-grades/index.tsx");
const indexSource = readFileSync(INDEX_PATH, "utf8");

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

// ---------------------------------------------------------------------------
// AC4 item 21 / REGRESSION entries 98 and 101: grading a cell (gradeRepoAction)
// must never fire on render or from an effect - only from the "Grade"
// button's own click. RepoGradeCellControl.tsx is the file with the actual
// button; it does not call gradeRepoAction itself (that would require it to
// import a "use server" action directly, which src/lib/use-server-exports.test.ts's
// AC6 item 34 boundary and this feature's own layering both avoid) - it
// calls the `onGrade` prop, which index.tsx wires to its own
// handleGradeCell (the function that actually calls gradeRepoAction). So the
// guarantee has two independent halves, checked separately below: (1) this
// file's onGrade() call site is click-gated, using the SAME
// callSitesGatedByClick canary already proven above; (2) index.tsx's own
// gradeRepoAction( call site is never inside a useEffect body.

describe("RepoGradeCellControl.tsx wires grading behind an explicit click only (AC4 item 21)", () => {
  it("canary: the file was actually read and contains its known grading affordances", () => {
    expect(cellControlSource.length).toBeGreaterThan(200);
    expect(cellControlSource).toContain("Grade");
    expect(cellControlSource).toContain("onGrade");
  });

  it("the Grade button's onGrade() call is inside an onClick handler - never a bare render-time or effect call", () => {
    const gated = callSitesGatedByClick(cellControlSource, "onGrade");
    expect(gated.length).toBeGreaterThanOrEqual(1);
    expect(gated.every(Boolean)).toBe(true);
  });

  it("the file defines no effect at all, so there is no mount-time or state-change-triggered path that could grade a cell automatically", () => {
    expect(cellControlSource).not.toContain("useEffect");
  });

  it("the score/comment inputs are controlled (value= bound to the edit prop) rather than uncontrolled, matching GradingResults.tsx:781-832's idiom", () => {
    expect(cellControlSource).toContain("value={edit.score}");
    expect(cellControlSource).toContain("value={edit.comment}");
    expect(cellControlSource).toContain("onChange={(e) => onScoreChange(e.target.value)}");
    expect(cellControlSource).toContain("onChange={(e) => onCommentChange(e.target.value)}");
  });
});

/**
 * Extracts the body text of every `useEffect(() => { ... }, [deps]);` call in
 * `text` - a narrow text heuristic matching this SPECIFIC file's own
 * consistent effect shape (every effect in index.tsx is written exactly
 * `useEffect(() => { <body> }, [<deps>]);`), not a general parser. Proven
 * against the two canary fixtures below before being trusted against the
 * real file, per REGRESSION entry 239 check 10's "a structural assertion
 * without a canary is worthless" (already cited by callSitesGatedByClick's
 * own canary block above).
 */
function extractUseEffectBodies(text: string): string[] {
  const marker = "useEffect(() => {";
  const bodies: string[] = [];
  let searchFrom = 0;
  for (;;) {
    const start = text.indexOf(marker, searchFrom);
    if (start === -1) break;
    const bodyStart = start + marker.length;
    const end = text.indexOf("}, [", bodyStart);
    if (end === -1) {
      searchFrom = bodyStart;
      continue;
    }
    bodies.push(text.slice(bodyStart, end));
    searchFrom = end + 4;
  }
  return bodies;
}

describe("extractUseEffectBodies (canary: proves the effect-body extractor actually discriminates)", () => {
  it("finds a marker placed INSIDE an effect body", () => {
    const fixture = `useEffect(() => { doDanger(); }, [x]);`;
    expect(extractUseEffectBodies(fixture).some((b) => b.includes("doDanger("))).toBe(true);
  });

  it("does NOT find a marker placed OUTSIDE any effect body (a plain function definition)", () => {
    const fixture = `const handleClick = async () => { doDanger(); };\nuseEffect(() => { somethingElse(); }, [x]);`;
    expect(extractUseEffectBodies(fixture).some((b) => b.includes("doDanger("))).toBe(false);
  });

  it("extracts more than one body when a file has several effects", () => {
    const fixture = `useEffect(() => { a(); }, [x]);\nuseEffect(() => { b(); }, [y]);`;
    const bodies = extractUseEffectBodies(fixture);
    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toContain("a(");
    expect(bodies[1]).toContain("b(");
  });
});

describe("index.tsx never calls gradeRepoAction or postCanvasGradesAction from inside a useEffect (AC4 item 21, AC5 items 27/29 - no auto-grade or auto-post on render)", () => {
  it("canary: the file was actually read and imports both dangerous actions", () => {
    expect(indexSource.length).toBeGreaterThan(500);
    expect(indexSource).toContain("gradeRepoAction");
    expect(indexSource).toContain("postCanvasGradesAction");
  });

  it("index.tsx contains at least one useEffect body (uiState persistence), so the absence checks below are not vacuous", () => {
    // Selection persistence is deliberately NOT a useEffect body any more -
    // see the mount-time-race guard below (and index.tsx:106-169's own
    // comment) for why a blanket `useEffect(() => persist(selected), [selected])`
    // was itself the bug. uiState persistence (index.tsx:81-83) is the
    // remaining effect and is enough to keep the "not found within any
    // effect body" assertions below non-vacuous - they would trivially (and
    // meaninglessly) pass against an empty bodies array too.
    expect(extractUseEffectBodies(indexSource).length).toBeGreaterThanOrEqual(1);
  });

  it("gradeRepoAction is never called from inside any useEffect body", () => {
    const bodies = extractUseEffectBodies(indexSource);
    expect(bodies.some((b) => b.includes("gradeRepoAction("))).toBe(false);
  });

  it("postCanvasGradesAction is never called from inside any useEffect body", () => {
    const bodies = extractUseEffectBodies(indexSource);
    expect(bodies.some((b) => b.includes("postCanvasGradesAction("))).toBe(false);
  });

  it("gradeRepoAction is called from inside handleGradeCell, the function wired to RepoGradesGrid's onGradeCell prop - not some other unrelated function", () => {
    const defIdx = indexSource.indexOf("const handleGradeCell = async");
    expect(defIdx).toBeGreaterThan(-1);
    const nextFnIdx = indexSource.indexOf("const handlePostColumn", defIdx);
    const body = indexSource.slice(defIdx, nextFnIdx > -1 ? nextFnIdx : defIdx + 1500);
    expect(body).toContain("gradeRepoAction(");
    expect(indexSource).toContain("onGradeCell={handleGradeCell}");
  });

  it("postCanvasGradesAction is called from inside handlePostColumn, the function wired to RepoGradesGrid's onPostColumn prop - not some other unrelated function", () => {
    const defIdx = indexSource.indexOf("const handlePostColumn = async");
    expect(defIdx).toBeGreaterThan(-1);
    // Bounded by the NEXT handler's definition rather than by a fixed
    // character count (the sibling gradeRepoAction assertion above already
    // does this): a fixed window silently turns "the call moved out of this
    // handler" and "this handler grew past N characters" into the same
    // failure, and the activity-log wave's added recordLog calls are exactly
    // the benign growth that tripped the old 2000-character bound.
    const nextFnIdx = indexSource.indexOf("const handlePostOneCell", defIdx);
    const body = indexSource.slice(defIdx, nextFnIdx > -1 ? nextFnIdx : indexSource.length);
    expect(body).toContain("postCanvasGradesAction(");
    expect(indexSource).toContain("onPostColumn={handlePostColumn}");
  });

  it("handlePostColumn requires an explicit window.confirm before calling postCanvasGradesAction, with the exact required wording", () => {
    const defIdx = indexSource.indexOf("const handlePostColumn = async");
    const callIdx = indexSource.indexOf("postCanvasGradesAction(", defIdx);
    const confirmIdx = indexSource.indexOf("window.confirm(", defIdx);
    expect(confirmIdx).toBeGreaterThan(-1);
    expect(confirmIdx).toBeLessThan(callIdx);
    expect(indexSource).toContain("Post ${plan.postable.length} grade(s) to Canvas? This writes to the live gradebook.");
  });
});

// ---------------------------------------------------------------------------
// AC4 items 23-24 mount-time-race regression: `selected` (index.tsx:106) starts
// as `new Set()`, and the persisted selection is only restored once `model`
// exists (index.tsx:142-147), strictly AFTER the async org scan and roster
// resolve in useRepoGradesData.ts complete. This view used to also have a
// `useEffect(() => { persistSelectedRepoIds(selected); }, [selected]);`
// (the SAME blanket-effect-on-a-piece-of-state shape `assignmentMapping`'s
// own comment above already warns against for the identical reason) - that
// effect fired on the very first commit, with `selected`'s untouched empty
// default, and overwrote localStorage's SELECTED_KEY with `[]` before the
// restore branch ever ran; the restore then read back the `[]` the effect
// had just written. Every reload silently lost the selection - AC4 items 23
// ("a stale selection must never resurrect a row that no longer exists",
// which presumes the selection is restorable at all) and 24 ("every control
// persists across reload") were both defeated. The fix (index.tsx:106-169)
// removes that effect and persists from the two places that actually mutate
// `selected` instead - the restore branch, and toggleSelected. The guard
// below detects the deleted shape structurally, with a canary pair (per
// REGRESSION entry 239 check 10: "a structural assertion without a canary is
// worthless") proving the detector actually discriminates the buggy shape
// from the fixed one - including a sample where the buggy line appears only
// inside a comment, so a comment (like this one, or the one in index.tsx)
// describing the bug can never itself trip the checker.

/**
 * Strips `//` line comments and `/* *\/` block comments from `text` before
 * searching it, so a checker built on plain substring search cannot be
 * fooled by a pattern that only appears in prose - a comment describing the
 * bug, a commented-out old implementation, etc. Deliberately simple (no
 * string-literal awareness): matches this file's existing "narrow heuristic,
 * proven by canary" posture (callSitesGatedByClick, extractUseEffectBodies
 * above), not a real parser.
 */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

/**
 * True when `text` (after stripping comments) contains a
 * `useEffect(() => { <body> }, [<deps>]);` whose dependency array is JUST
 * `stateVarName` (nothing else) and whose body calls
 * `persistSelectedRepoIds(` - i.e. the exact blanket "persist on every
 * change to this one piece of state" shape that caused the mount-time race
 * described above. Reuses extractUseEffectBodies's own marker-walking
 * approach but additionally captures each effect's dependency-array text, so
 * it can require an EXACT single-dependency match rather than merely "this
 * state appears somewhere in the deps list."
 */
function hasBlanketPersistEffect(text: string, stateVarName: string): boolean {
  const stripped = stripComments(text);
  const marker = "useEffect(() => {";
  let searchFrom = 0;
  for (;;) {
    const start = stripped.indexOf(marker, searchFrom);
    if (start === -1) return false;
    const bodyStart = start + marker.length;
    const bodyEnd = stripped.indexOf("}, [", bodyStart);
    if (bodyEnd === -1) {
      searchFrom = bodyStart;
      continue;
    }
    const depsStart = bodyEnd + 4;
    const depsEnd = stripped.indexOf("]", depsStart);
    if (depsEnd === -1) {
      searchFrom = depsStart;
      continue;
    }
    const body = stripped.slice(bodyStart, bodyEnd);
    const deps = stripped.slice(depsStart, depsEnd).trim();
    if (deps === stateVarName && body.includes("persistSelectedRepoIds(")) {
      return true;
    }
    searchFrom = depsEnd + 1;
  }
}

describe("hasBlanketPersistEffect (canary: proves the mount-time-race detector actually discriminates)", () => {
  it("detects the exact OLD buggy shape - a useEffect keyed on [selected] alone that persists it", () => {
    const buggy = `useEffect(() => {\n  persistSelectedRepoIds(selected);\n}, [selected]);`;
    expect(hasBlanketPersistEffect(buggy, "selected")).toBe(true);
  });

  it("does NOT detect the fixed shape - persistence from the restore branch and an explicit mutator, no such effect", () => {
    const fixed = `
      if (model && selectionKey !== selectionLoadedForKey) {
        setSelectionLoadedForKey(selectionKey);
        const restored = loadSelectedRepoIds(model.rows.map((row) => row.repo));
        setSelected(restored);
        persistSelectedRepoIds(restored);
      }
      const toggleSelected = (repo) => {
        const next = new Set(selected);
        if (next.has(repo)) next.delete(repo);
        else next.add(repo);
        setSelected(next);
        persistSelectedRepoIds(next);
      };
      useEffect(() => { persistRepoGradesUiState(uiState); }, [uiState]);
    `;
    expect(hasBlanketPersistEffect(fixed, "selected")).toBe(false);
  });

  it("does NOT detect the buggy line when it appears only inside a comment (prose must not trip the checker)", () => {
    const commentOnly = `
      // The old, buggy code looked like this and must never come back:
      // useEffect(() => { persistSelectedRepoIds(selected); }, [selected]);
      // See index.tsx's own comment for the full mount-time-race explanation.
      const toggleSelected = (repo) => { /* persists via persistSelectedRepoIds(next) below, not an effect */ };
    `;
    expect(hasBlanketPersistEffect(commentOnly, "selected")).toBe(false);
  });

  it("does not false-positive on an unrelated single-dependency effect that happens to persist something else", () => {
    const other = `useEffect(() => { persistRepoGradesUiState(uiState); }, [uiState]);`;
    expect(hasBlanketPersistEffect(other, "selected")).toBe(false);
  });
});

describe("index.tsx does not persist the repo-selection Set from a blanket useEffect keyed on the selection alone (AC4 items 23-24, mount-time race)", () => {
  it("the real file contains no such effect", () => {
    expect(hasBlanketPersistEffect(indexSource, "selected")).toBe(false);
  });

  it("persistSelectedRepoIds is still called from the render-phase restore branch, with the FILTERED value it just loaded - not the stale closure, not skipped entirely", () => {
    const restoreIdx = indexSource.indexOf("if (model && selectionKey !== selectionLoadedForKey)");
    expect(restoreIdx).toBeGreaterThan(-1);
    const body = indexSource.slice(restoreIdx, restoreIdx + 400);
    expect(body).toContain("const restored = loadSelectedRepoIds(model.rows.map((row) => row.repo))");
    expect(body).toContain("setSelected(restored)");
    expect(body).toContain("persistSelectedRepoIds(restored)");
  });

  it("toggleSelected computes `next` outside the setSelected updater and persists exactly that value", () => {
    const defIdx = indexSource.indexOf("const toggleSelected = (repo: string) => {");
    expect(defIdx).toBeGreaterThan(-1);
    const body = indexSource.slice(defIdx, defIdx + 400);
    expect(body).toContain("const next = new Set(selected)");
    expect(body).toContain("setSelected(next)");
    expect(body).toContain("persistSelectedRepoIds(next)");
    // Not persisted from inside the updater passed to setSelected - there is
    // no `setSelected((prev)` form left in this function at all.
    expect(body).not.toContain("setSelected((prev)");
  });
});

// ---------------------------------------------------------------------------
// "Tests written BEFORE implementation" list item 7: a source-reading guard
// that the view calls the SHARED postability predicate rather than an inline
// condition, with a canary pair. AC5 item 28 requires the button's enabled
// state and the post payload to be driven by the exact same check -
// buildRepoGradePostPlan (repoGradesPosting.ts), which itself calls
// repoGradePostability - so the guard below confirms both RepoGradesGrid.tsx
// (the button's live postable count) and index.tsx (the actual payload)
// import and call buildRepoGradePostPlan, and that postCanvasGradesAction
// itself - the one and only place a grade write actually happens (AC5 item
// 27's "nothing else") - is called from index.tsx alone, never from
// RepoGradesGrid.tsx or RepoGradeCellControl.tsx.

/** True when `text` both imports `symbolName` from `fromModule` and actually
 * calls it at least once (`${symbolName}(`) - importing without calling, or
 * calling a same-named local without importing it, both report false. */
function usesSharedFunction(text: string, symbolName: string, fromModule: string): boolean {
  const importPattern = new RegExp(`import\\s*\\{[^}]*\\b${symbolName}\\b[^}]*\\}\\s*from\\s*["']${fromModule}["']`);
  return importPattern.test(text) && text.includes(`${symbolName}(`);
}

describe("usesSharedFunction (canary: proves the import+call check actually discriminates)", () => {
  it("reports true when a function is both imported from the named module and called", () => {
    const fixture = `import { buildRepoGradePostPlan } from "./repoGradesPosting";\nconst plan = buildRepoGradePostPlan(rows, id);`;
    expect(usesSharedFunction(fixture, "buildRepoGradePostPlan", "./repoGradesPosting")).toBe(true);
  });

  it("reports false when the function is called but never imported from that module (e.g. a local reimplementation)", () => {
    const fixture = `function buildRepoGradePostPlan(rows) { return rows.filter((r) => r.state === "confirmed"); }\nconst plan = buildRepoGradePostPlan(rows);`;
    expect(usesSharedFunction(fixture, "buildRepoGradePostPlan", "./repoGradesPosting")).toBe(false);
  });

  it("reports false when the function is imported but never actually called (dead import)", () => {
    const fixture = `import { buildRepoGradePostPlan } from "./repoGradesPosting";`;
    expect(usesSharedFunction(fixture, "buildRepoGradePostPlan", "./repoGradesPosting")).toBe(false);
  });
});

describe("RepoGradesGrid.tsx and index.tsx both drive postability through buildRepoGradePostPlan, never a hand-rolled duplicate (AC5 item 28)", () => {
  it("RepoGradesGrid.tsx's column header count/button state is computed via buildRepoGradePostPlan, imported from repoGradesPosting.ts", () => {
    expect(usesSharedFunction(gridSource, "buildRepoGradePostPlan", "./repoGradesPosting")).toBe(true);
  });

  it("index.tsx's actual post payload is computed via the SAME buildRepoGradePostPlan, imported from repoGradesPosting.ts", () => {
    expect(usesSharedFunction(indexSource, "buildRepoGradePostPlan", "./repoGradesPosting")).toBe(true);
  });

  it("RepoGradesGrid.tsx and index.tsx both also assemble their candidate rows via the SAME repoGradePostCandidateRows, never each deriving their own row list", () => {
    expect(usesSharedFunction(gridSource, "repoGradePostCandidateRows", "./repoGradesPosting")).toBe(true);
    expect(usesSharedFunction(indexSource, "repoGradePostCandidateRows", "./repoGradesPosting")).toBe(true);
  });

  it("postCanvasGradesAction is called from index.tsx alone - never from RepoGradesGrid.tsx or RepoGradeCellControl.tsx (AC5 item 27: one call path, nothing else)", () => {
    expect(indexSource).toContain("postCanvasGradesAction(");
    expect(gridSource).not.toContain("postCanvasGradesAction(");
    expect(cellControlSource).not.toContain("postCanvasGradesAction(");
  });

  it("gradeRepoAction is called from index.tsx alone - never from RepoGradesGrid.tsx or RepoGradeCellControl.tsx (no second grading engine)", () => {
    expect(indexSource).toContain("gradeRepoAction(");
    expect(gridSource).not.toContain("gradeRepoAction(");
    expect(cellControlSource).not.toContain("gradeRepoAction(");
  });
});

describe("index.tsx's Post/Re-post confirmation and per-column busy state are wired through onPostColumn, matching AC5 items 27, 29-32", () => {
  it("RepoGradesGrid.tsx forwards onPostColumn straight to the column header control, never calling it eagerly during render", () => {
    expect(gridSource).toContain("onPostColumn={onPostColumn}");
  });

  it("the column header's Post/Re-post button relabels using the SAME plan.postable.length the button's disabled state also uses, so they cannot disagree", () => {
    const idx = gridSource.indexOf("function ColumnHeaderControls");
    expect(idx).toBeGreaterThan(-1);
    // Bounded by the NEXT top-level declaration, not by a fixed character
    // count. This used to slice a magic 2000 chars, which silently made the
    // assertion depend on how long this function's comments happened to be:
    // adding the selection-scoping comment pushed the label expression to
    // offset ~1964, so the window cut it mid-string and the test failed
    // without anything about the button actually changing. The three
    // assertions below are unchanged - only the window they search widened
    // from "an arbitrary prefix" to "the whole function".
    const end = gridSource.indexOf("\nexport default function", idx);
    expect(end).toBeGreaterThan(idx);
    const body = gridSource.slice(idx, end);
    expect(body).toContain("disabled={busy || plan.postable.length === 0}");
    expect(body).toContain("plan.postable.length");
    expect(body).toContain('alreadyAttempted ? "Re-post" : "Post"');
  });
});

// ---------------------------------------------------------------------------
// Activity log wiring (docs/repo-grades-activity-log-acceptance-criteria.md
// L6 item 28). Two guarantees this file's text-reading approach can prove
// that a node-env test of the pure module cannot:
//   1. The download and the destructive clear happen only from a real click -
//      a download that fired on render would drop a file into the
//      instructor's Downloads folder every time the view re-rendered, and a
//      clear that fired on render would destroy the audit trail outright.
//   2. index.tsx actually renders the panel and actually appends entries on
//      the post path - the log is worthless if nothing writes to it, and a
//      pure-module test passes happily against a log nothing ever calls.
// callSitesGatedByClick's canary (top of this file) is what stops these from
// passing vacuously.
const LOG_PANEL_PATH = join(process.cwd(), "src/app/components/repo-grades/RepoGradesLogPanel.tsx");
const logPanelSource = readFileSync(LOG_PANEL_PATH, "utf8");

describe("the activity log's download and clear are click-gated", () => {
  it("every triggerFileDownload call site sits inside an onClick handler", () => {
    const sites = callSitesGatedByClick(logPanelSource, "handleDownload");
    expect(sites.length).toBeGreaterThan(0);
    expect(sites.every(Boolean)).toBe(true);
    // The download itself lives in that handler, never at module or render scope.
    const defIdx = logPanelSource.indexOf("const handleDownload =");
    const endIdx = logPanelSource.indexOf("const handleClear =", defIdx);
    expect(logPanelSource.slice(defIdx, endIdx)).toContain("triggerFileDownload(");
  });

  it("clearing the log is behind a window.confirm that runs before onClear", () => {
    const defIdx = logPanelSource.indexOf("const handleClear =");
    expect(defIdx).toBeGreaterThan(-1);
    const confirmIdx = logPanelSource.indexOf("window.confirm(", defIdx);
    const clearIdx = logPanelSource.indexOf("onClear()", defIdx);
    expect(confirmIdx).toBeGreaterThan(-1);
    expect(confirmIdx).toBeLessThan(clearIdx);
  });

  it("no download or clear is reachable from a useEffect body", () => {
    const bodies = extractUseEffectBodies(logPanelSource);
    expect(bodies.some((b) => b.includes("triggerFileDownload("))).toBe(false);
    expect(bodies.some((b) => b.includes("onClear("))).toBe(false);
  });

  it("the panel builds its file through the shared triggerFileDownload, not a hand-rolled object URL", () => {
    expect(logPanelSource).toContain("triggerFileDownload");
    // Matched as CALLS, not as bare words: RepoGradesLogPanel.tsx's own
    // header comment names the hand-rolled dance it is avoiding, so a
    // substring check for "createObjectURL" alone goes red on a comment that
    // is documenting the very rule this test enforces.
    expect(logPanelSource).not.toContain("URL.createObjectURL(");
    expect(logPanelSource).not.toContain("document.createElement(");
  });
});

describe("index.tsx actually feeds and renders the activity log", () => {
  it("renders RepoGradesLogPanel with this course's log and a clear handler", () => {
    expect(indexSource).toContain("<RepoGradesLogPanel");
    expect(indexSource).toContain("log={log}");
    expect(indexSource).toContain("onClear={() => setLog([])}");
  });

  it("records an entry on both post outcomes and on both grading outcomes", () => {
    for (const kind of ['"post-succeeded"', '"post-failed"', '"grade-succeeded"', '"grade-failed"']) {
      expect(indexSource).toContain(kind);
    }
  });

  it("restores this course's log in the same branch that resets the ephemeral cell state", () => {
    const branchIdx = indexSource.indexOf("if (uiState.courseId !== cellStateResetForCourse)");
    expect(branchIdx).toBeGreaterThan(-1);
    const branch = indexSource.slice(branchIdx, branchIdx + 400);
    expect(branch).toContain("setLog(loadRepoGradeLog(uiState.courseId))");
  });

  it("persists the log only once the restore for the CURRENT course has run", () => {
    const bodies = extractUseEffectBodies(indexSource);
    const persistBody = bodies.find((b) => b.includes("persistRepoGradeLog("));
    expect(persistBody).toBeDefined();
    // The guard is what stops this effect from firing on the first commit
    // with the untouched `[]` default and wiping a real stored log - the
    // exact mount-time race the selection Set's own regression above records.
    expect(persistBody).toContain("if (cellStateResetForCourse !== uiState.courseId) return;");
  });
});
