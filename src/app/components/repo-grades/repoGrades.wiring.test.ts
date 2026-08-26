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
// The grading/posting handlers (handleGradeCell, handlePostColumn,
// handlePostOneCell, handleGradeColumn, and the withLiveScores/
// useRepoGradesBulkGrade wiring) moved out of index.tsx into this hook once
// index.tsx hit the codebase's 1000-line cap - see that file's own header
// comment. Every guard below that used to read those handlers' bodies off
// indexSource now reads them off hookSource instead; guards about the JSX
// wiring itself (onGradeCell={handleGradeCell} etc.) still read indexSource,
// since that wiring did not move.
const HOOK_PATH = join(process.cwd(), "src/app/components/repo-grades/useRepoGradesGradingActions.ts");
const hookSource = readFileSync(HOOK_PATH, "utf8");

/**
 * Starting at `openBraceIdx` (which must point at a `{`), walks forward
 * counting brace depth and returns the index of the `}` that brings depth
 * back to zero - i.e. the brace that actually closes this one. Returns -1 if
 * the text ends first.
 */
function findMatchingBraceEnd(text: string, openBraceIdx: number): number {
  let depth = 0;
  for (let i = openBraceIdx; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Finds every call site of `${calleeName}(` in `text` and reports, per call
 * site, whether it is textually inside an `onClick={...}` handler - i.e. the
 * nearest `onClick={` before it has a MATCHING closing brace (found by depth
 * counting, not by scanning for a literal "}}") that comes AFTER the call
 * site. A call with no preceding `onClick={` at all is reported as NOT gated.
 *
 * This used to look for a literal "}}" between the nearest `onClick={` and
 * the call site, on the theory that a block-body handler
 * (`onClick={() => { ... }}`) always closes with two braces together. That
 * heuristic silently blessed the exact bug it was meant to catch for any file
 * using the CONCISE arrow form - `onClick={() => foo()}` or `onClick={foo}` -
 * which closes with a single `}` and contains no "}}" anywhere. Any call
 * within 400 characters after such a handler was reported "gated" regardless
 * of whether it was actually inside it, because the old check never found a
 * "}}" to signal the handler had already closed. Depth-counting the ACTUAL
 * braces from the `onClick={`'s own `{` recognizes both forms correctly and
 * is proven against the concise-arrow case (RepoGradesLogPanel.tsx's shape)
 * in the canary block below, not just the "present vs absent" pair that
 * caught this file's other two files' block-body handlers before.
 *
 * Still a narrow text heuristic, not a real parser - good enough for this
 * file's actual shape (verified by the canary below), not asked to handle
 * arbitrary JSX.
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
    const lastOnClickRel = preceding.lastIndexOf("onClick={");
    if (lastOnClickRel === -1) {
      results.push(false);
      continue;
    }
    const onClickBraceIdx = windowStart + lastOnClickRel + "onClick=".length;
    const closeIdx = findMatchingBraceEnd(text, onClickBraceIdx);
    // Gated only if the call site falls strictly before the onClick
    // expression's own matching close - true for a block-body handler
    // (closes after its SECOND brace) and equally for a concise-arrow one
    // (closes after its FIRST and only brace), unlike the old "}}"-substring
    // search which only recognized the block-body shape.
    results.push(closeIdx !== -1 && idx < closeIdx);
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

  it("reports a call inside a CONCISE-arrow onClick (`onClick={() => accept(...)}`, no block body) as gated - this is the shape a `}}`-substring search cannot see, since a concise arrow closes with a single `}` and never produces \"}}\" at all", () => {
    const fixture = `<button onClick={() => accept(id, name)}>Confirm</button>`;
    expect(callSitesGatedByClick(fixture, "accept")).toEqual([true]);
  });

  it("reports a call placed at RENDER scope right after a concise-arrow onClick as NOT gated - the exact false pass this checker used to produce: with no \"}}\" to find, the old implementation treated any later call within 400 characters of ANY onClick as gated, even one sitting outside every handler entirely", () => {
    const fixture = `<button onClick={() => accept(1, "a")}>A</button>\n{(() => { accept(2, "b"); return null; })()}`;
    expect(callSitesGatedByClick(fixture, "accept")).toEqual([true, false]);
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
    // Bounded by the NEXT branch's own condition (the "ambiguous" state,
    // which follows "suggested" in this file), not by a fixed character
    // count - matching the fix already applied to the ColumnHeaderControls
    // guard (RepoGradesGrid.tsx window, elsewhere in this file) and to the
    // handlePostColumn guard above. A fixed 700-character window measured
    // ~69 characters of headroom against the real file at the time of this
    // fix: any comment added inside the "suggested" branch (of which
    // RepoBindingControl.tsx already has several - the U9.36 note, the
    // no-Canvas-id explanation) could push the real assertion past the cut
    // and fail this test for a reason unrelated to the wiring it checks.
    const ambiguousBranchIdx = source.indexOf('row.binding.state === "ambiguous"', suggestedBranchIdx);
    expect(ambiguousBranchIdx).toBeGreaterThan(suggestedBranchIdx);
    const branch = source.slice(suggestedBranchIdx, ambiguousBranchIdx);
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

describe("useRepoGradesGradingActions.ts never calls gradeRepoAction or postCanvasGradesAction from inside a useEffect (AC4 item 21, AC5 items 27/29 - no auto-grade or auto-post on render)", () => {
  // handleGradeCell, handlePostColumn, handlePostOneCell and their shared
  // helpers moved out of index.tsx into useRepoGradesGradingActions.ts once
  // index.tsx hit the codebase's 1000-line cap (that hook's own header
  // comment explains the move) - so every check in this describe block that
  // used to read indexSource now reads hookSource instead. The two checks
  // that assert the JSX WIRING itself (onGradeCell={handleGradeCell},
  // onPostColumn={handlePostColumn}) still read indexSource, since that
  // wiring did not move.
  it("canary: the file was actually read and imports both dangerous actions", () => {
    expect(hookSource.length).toBeGreaterThan(500);
    expect(hookSource).toContain("gradeRepoAction");
    expect(hookSource).toContain("postCanvasGradesAction");
  });

  it("index.tsx still contains at least one useEffect body (uiState persistence), proving the extractUseEffectBodies technique itself is not vacuous - relevant here because the hook checked below defines no effect at all, which the next test asserts directly", () => {
    // Selection persistence is deliberately NOT a useEffect body any more -
    // see the mount-time-race guard below (and index.tsx's own comment) for
    // why a blanket `useEffect(() => persist(selected), [selected])` was
    // itself the bug. uiState persistence is the remaining effect in
    // index.tsx and is enough to keep extractUseEffectBodies proven non-
    // vacuous in general.
    expect(extractUseEffectBodies(indexSource).length).toBeGreaterThanOrEqual(1);
  });

  it("useRepoGradesGradingActions.ts defines no useEffect at all, so gradeRepoAction/postCanvasGradesAction can only ever run from a real onClick reaching one of its returned handlers, never from render or an effect - stripComments (proven above) keeps this file's own comment about the rule from tripping the check", () => {
    expect(stripComments(hookSource)).not.toContain("useEffect");
  });

  // A "gradeRepoAction/postCanvasGradesAction is never called from inside any
  // useEffect body" pair used to live here, built on extractUseEffectBodies
  // exactly like the checks below index.tsx's own effect. It was vacuous:
  // this hook contains no `useEffect(() => {` at all (proven by the
  // stripComments assertion directly above), so extractUseEffectBodies(hookSource)
  // is always `[]`, and `[].some(...)` is `false` for any predicate - the
  // assertions passed no matter what the two actions' call sites looked like.
  // The stripComments check above is strictly the stronger guarantee: it
  // fails on ANY occurrence of the literal text "useEffect" anywhere in this
  // file, which is a necessary condition for a real `useEffect(...)` call to
  // exist at all, so there is no path by which either action could be called
  // from an effect body here without that check already failing first.
  // Deleted rather than kept as dead weight, per this file's own header rule
  // that a retained vacuous assertion implies coverage it does not have.

  it("gradeRepoAction is called from inside handleGradeCell, the function index.tsx wires to RepoGradesGrid's onGradeCell prop - not some other unrelated function", () => {
    const defIdx = hookSource.indexOf("const handleGradeCell = async");
    expect(defIdx).toBeGreaterThan(-1);
    const nextFnIdx = hookSource.indexOf("const handlePostColumn", defIdx);
    const body = hookSource.slice(defIdx, nextFnIdx > -1 ? nextFnIdx : defIdx + 1500);
    expect(body).toContain("gradeRepoAction(");
    expect(indexSource).toContain("onGradeCell={handleGradeCell}");
  });

  it("postCanvasGradesAction is called from inside handlePostColumn, the function index.tsx wires to RepoGradesGrid's onPostColumn prop - not some other unrelated function", () => {
    const defIdx = hookSource.indexOf("const handlePostColumn = async");
    expect(defIdx).toBeGreaterThan(-1);
    // Bounded by the NEXT handler's definition rather than by a fixed
    // character count (the sibling gradeRepoAction assertion above already
    // does this): a fixed window silently turns "the call moved out of this
    // handler" and "this handler grew past N characters" into the same
    // failure, and the activity-log wave's added recordLog calls are exactly
    // the benign growth that tripped the old 2000-character bound.
    const nextFnIdx = hookSource.indexOf("const handlePostOneCell", defIdx);
    const body = hookSource.slice(defIdx, nextFnIdx > -1 ? nextFnIdx : hookSource.length);
    expect(body).toContain("postCanvasGradesAction(");
    expect(indexSource).toContain("onPostColumn={handlePostColumn}");
  });

  it("handlePostColumn requires an explicit window.confirm before calling postCanvasGradesAction, with the exact required wording", () => {
    const defIdx = hookSource.indexOf("const handlePostColumn = async");
    const callIdx = hookSource.indexOf("postCanvasGradesAction(", defIdx);
    const confirmIdx = hookSource.indexOf("window.confirm(", defIdx);
    expect(confirmIdx).toBeGreaterThan(-1);
    expect(confirmIdx).toBeLessThan(callIdx);
    expect(hookSource).toContain("Post ${plan.postable.length} grade(s) to Canvas? This writes to the live gradebook.");
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
 * `useEffect(() => { <body> }, [<deps>]);` whose dependency array CONTAINS
 * `stateVarName` as one of its entries (exactly, not as a substring of a
 * longer identifier) and whose body calls `persistSelectedRepoIds(` - i.e.
 * the blanket "persist on every change to this piece of state" shape that
 * caused the mount-time race described above. Reuses extractUseEffectBodies's
 * own marker-walking approach but additionally captures each effect's
 * dependency-array text, split into individual entries.
 *
 * This used to require the ENTIRE deps array to be exactly `stateVarName`
 * and nothing else, which is evadable by one extra dependency:
 * `useEffect(() => { persistSelectedRepoIds(selected); }, [selected, model]);`
 * reintroduces the identical shipped bug (fires on the first commit with
 * `selected`'s untouched empty default and overwrites the stored selection
 * before the restore branch runs) but did not match `deps === stateVarName`
 * because `deps` was `"selected, model"`. Splitting the deps text on commas
 * and checking membership (with each entry trimmed and compared for EXACT
 * equality, not `.includes(stateVarName)` on the raw deps string) keeps the
 * real requirement intact - a deps entry named `selectedRepoIds` must still
 * not count as containing `selected` - while no longer requiring the array
 * to have exactly one entry.
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
    const depsList = deps
      .split(",")
      .map((d) => d.trim())
      .filter((d) => d.length > 0);
    if (depsList.includes(stateVarName) && body.includes("persistSelectedRepoIds(")) {
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

  it("detects the buggy shape even with an EXTRA dependency in the array - one additional dep reintroduces the identical mount-time race (the effect still fires on the first commit with `selected`'s untouched default) and must not evade this guard just by adding a second entry", () => {
    const buggyWithExtraDep = `useEffect(() => {\n  persistSelectedRepoIds(selected);\n}, [selected, model]);`;
    expect(hasBlanketPersistEffect(buggyWithExtraDep, "selected")).toBe(true);
    const buggyWithExtraDepFirst = `useEffect(() => {\n  persistSelectedRepoIds(selected);\n}, [model, selected]);`;
    expect(hasBlanketPersistEffect(buggyWithExtraDepFirst, "selected")).toBe(true);
  });

  it("does NOT false-positive on a deps entry that merely CONTAINS the state var name as a substring - e.g. a `selectedRepoIds` dependency must not count as `selected` being present", () => {
    const fixture = `useEffect(() => {\n  persistSelectedRepoIds(selectedRepoIds);\n}, [selectedRepoIds]);`;
    expect(hasBlanketPersistEffect(fixture, "selected")).toBe(false);
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

describe("RepoGradesGrid.tsx and useRepoGradesGradingActions.ts both drive postability through buildRepoGradePostPlan, never a hand-rolled duplicate (AC5 item 28)", () => {
  // The post payload's assembly (buildRepoGradePostPlan/repoGradePostCandidateRows
  // calls, and the postCanvasGradesAction/gradeRepoAction calls themselves)
  // moved from index.tsx into useRepoGradesGradingActions.ts along with
  // handlePostColumn/handlePostOneCell/handleGradeCell - see that hook's own
  // header comment. Every check below that used to read indexSource for
  // these now reads hookSource instead.
  it("RepoGradesGrid.tsx's column header count/button state is computed via buildRepoGradePostPlan, imported from repoGradesPosting.ts", () => {
    expect(usesSharedFunction(gridSource, "buildRepoGradePostPlan", "./repoGradesPosting")).toBe(true);
  });

  it("useRepoGradesGradingActions.ts's actual post payload is computed via the SAME buildRepoGradePostPlan, imported from repoGradesPosting.ts", () => {
    expect(usesSharedFunction(hookSource, "buildRepoGradePostPlan", "./repoGradesPosting")).toBe(true);
  });

  it("RepoGradesGrid.tsx and useRepoGradesGradingActions.ts both also assemble their candidate rows via the SAME repoGradePostCandidateRows, never each deriving their own row list", () => {
    expect(usesSharedFunction(gridSource, "repoGradePostCandidateRows", "./repoGradesPosting")).toBe(true);
    expect(usesSharedFunction(hookSource, "repoGradePostCandidateRows", "./repoGradesPosting")).toBe(true);
  });

  it("postCanvasGradesAction is called from useRepoGradesGradingActions.ts alone - never from RepoGradesGrid.tsx or RepoGradeCellControl.tsx (AC5 item 27: one call path, nothing else)", () => {
    expect(hookSource).toContain("postCanvasGradesAction(");
    expect(gridSource).not.toContain("postCanvasGradesAction(");
    expect(cellControlSource).not.toContain("postCanvasGradesAction(");
  });

  it("gradeRepoAction is called from useRepoGradesGradingActions.ts alone - never from RepoGradesGrid.tsx or RepoGradeCellControl.tsx (no second grading engine)", () => {
    expect(hookSource).toContain("gradeRepoAction(");
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

  it("the file defines no effect at all, so there is no mount-time or state-change-triggered path that could download or clear the log automatically - the same backstop RepoBindingControl.tsx (line 138 above) and useRepoGradesGradingActions.ts (line 316 above) already have", () => {
    expect(stripComments(logPanelSource)).not.toContain("useEffect");
  });
  // A "no download or clear is reachable from a useEffect body" pair used to
  // live here, built on extractUseEffectBodies exactly like the checks above
  // index.tsx's own effects. It was vacuous for the same reason as the
  // deleted hookSource pair above: this file contains no
  // `useEffect(() => {` at all, so extractUseEffectBodies(logPanelSource) is
  // always `[]` and `[].some(...)` is `false` regardless of what
  // triggerFileDownload/onClear's call sites looked like - this file
  // previously had NO backstop proving that at all (unlike hookSource, which
  // already had the stripComments check). The assertion directly above is
  // that backstop, added now, and is strictly the stronger guarantee: it
  // fails on any occurrence of the literal text "useEffect" anywhere in this
  // file, which is a necessary condition for a real effect to exist, so
  // there is no path by which either call could reach an effect body without
  // that check already failing first.

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

  it("records an entry on both post outcomes and on both grading outcomes - these four record sites moved into useRepoGradesGradingActions.ts along with the handlers that own them", () => {
    for (const kind of ['"post-succeeded"', '"post-failed"', '"grade-succeeded"', '"grade-failed"']) {
      expect(hookSource).toContain(kind);
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

// ---------------------------------------------------------------------------
// LinkUsernamesPanel wiring - the fix for the instructor complaint this wave
// addresses: the grid's own empty state used to be a dead end that named a
// workflow step living on a different screen and told the instructor to go
// run it there. This wave puts the mechanism (LinkUsernamesPanel.tsx) on this
// page instead. Three separate risks, each checked below: (1) the panel is
// actually rendered and wired to the view's ONE aria-live region rather than
// growing a second one (LinkUsernamesPanel.tsx's own header comment names
// this exact hazard); (2) the banner that used to send the reader elsewhere
// no longer does, while staying findable by the workflow step's exact label;
// (3) the log entry a link produces is recorded only when the link actually
// persisted something, mirroring the same rule this file already proves for
// handleAcceptBinding via its own "ok" in result guard.

describe("index.tsx renders LinkUsernamesPanel above the grid, wired to the view's single aria-live region", () => {
  it("renders <LinkUsernamesPanel and routes its outcomes through onAnnounce={setPostSummary} - never a second live region", () => {
    expect(indexSource).toContain("<LinkUsernamesPanel");
    expect(indexSource).toContain("onAnnounce={setPostSummary}");
  });

  it("gates the panel on `course` alone, matching how RepoGradesLogPanel below it is gated - never on `model && noConfirmedRows`, which would hide it exactly when an instructor has the least other way to bind repos (a failed scan or an unset org)", () => {
    const panelIdx = indexSource.indexOf("<LinkUsernamesPanel");
    expect(panelIdx).toBeGreaterThan(-1);
    // Structural bound, not a fixed character window: a fixed 60-character
    // backward slice measured only ~38 characters of headroom against the
    // real file at the time of this fix, and the JSX comment immediately
    // above this gate (explaining exactly why it is gated on `course` alone)
    // is itself long enough that growing it by a sentence would push the
    // gate out of a fixed-size window and fail this test for a reason
    // unrelated to the wiring it checks - precisely the risk another agent
    // editing index.tsx's surrounding comments right now would trip.
    // lastIndexOf has no such limit; requiring that ONLY whitespace sits
    // between the gate's closing "(" and the tag (rather than requiring the
    // gate to fall within an arbitrary N characters of it) is what actually
    // proves this gate - not some other, unrelated "{course && (" earlier in
    // the file - is the one immediately wrapping <LinkUsernamesPanel.
    const gateMarker = "{course && (";
    const gateIdx = indexSource.lastIndexOf(gateMarker, panelIdx);
    expect(gateIdx).toBeGreaterThan(-1);
    const between = indexSource.slice(gateIdx + gateMarker.length, panelIdx);
    expect(between.trim()).toBe("");
  });
});

describe("the no-confirmed-rows banner points at the on-page panel instead of instructing the reader to run a separate workflow step (instructor complaint fix)", () => {
  it("still contains the workflow step's exact UI label, so a support-doc or screenshot search for the step's real name still finds this text", () => {
    expect(indexSource).toContain("Link GitHub usernames to roster");
  });

  it("no longer tells the reader to go RUN the step - the old \"Running the ... workflow step is the reliable way to populate bindings\" sentence is gone", () => {
    expect(indexSource).not.toContain("Running the &quot;{LINK_GITHUB_USERNAMES_STEP_LABEL}&quot;");
    expect(indexSource).not.toContain("workflow step is the reliable way to populate bindings");
  });

  it("does not print LinkUsernamesPanel.tsx's own literal empty-state sentence a second time", () => {
    // LinkUsernamesPanel.tsx (read in the block below) already renders this
    // exact sentence when noConfirmedRows is true - the banner deliberately
    // owns a DIFFERENT sentence instead of repeating it, per this file's own
    // "surface-ownership decision" comment at the banner's call site.
    expect(indexSource).not.toContain("No repos are confirmed-bound to a roster student yet.");
  });
});

const LINK_PANEL_PATH = join(process.cwd(), "src/app/components/repo-grades/LinkUsernamesPanel.tsx");
const linkPanelSource = readFileSync(LINK_PANEL_PATH, "utf8");

describe("canary: LinkUsernamesPanel.tsx actually owns the empty-state sentence the banner test above assumes it owns", () => {
  it("LinkUsernamesPanel.tsx contains the exact sentence, proving the banner's non-duplication above is not vacuously true against a file that never had that sentence to begin with", () => {
    expect(linkPanelSource).toContain("No repos are confirmed-bound to a roster student yet.");
  });
});

/**
 * True when, searching `text` from the start, the first occurrence of
 * `ifConditionMarker` opens an `if (...) { ... }` block (found by a brace-
 * depth count starting at that `if`'s own opening `{`) whose body contains
 * `calleeMarker`. Generalizes callSitesGatedByClick's "is this call site
 * actually nested inside a specific guard, not merely somewhere later in the
 * same function" question from an onClick handler to an arbitrary `if` guard
 * - the same class of "is this dangerous call actually gated" check this
 * file already applies to click handlers, applied here to a success-only
 * branch instead. A narrow text heuristic (this file's established posture),
 * proven against the canary fixtures below before being trusted against the
 * real file, per REGRESSION entry 239 check 10's "a structural assertion
 * without a canary is worthless".
 */
function isCallSiteWithinIfBlock(text: string, ifConditionMarker: string, calleeMarker: string): boolean {
  const ifIdx = text.indexOf(ifConditionMarker);
  if (ifIdx === -1) return false;
  const braceStart = text.indexOf("{", ifIdx);
  if (braceStart === -1) return false;
  let depth = 0;
  for (let i = braceStart; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        const blockBody = text.slice(braceStart, i);
        return blockBody.includes(calleeMarker);
      }
    }
  }
  return false;
}

describe("isCallSiteWithinIfBlock (canary: proves the guard-membership check actually discriminates)", () => {
  it("finds a call INSIDE the if block's own body", () => {
    const fixture = `if (!("error" in result)) {\n  recordLog([buildLogEntry("x")]);\n}`;
    expect(isCallSiteWithinIfBlock(fixture, 'if (!("error" in result))', 'buildLogEntry("x"')).toBe(true);
  });

  it("does NOT find a call placed AFTER the if block has already closed (an unconditional call, the exact bug this guard exists to catch)", () => {
    const fixture = `if (!("error" in result)) {\n  doSomethingElse();\n}\nrecordLog([buildLogEntry("x")]);`;
    expect(isCallSiteWithinIfBlock(fixture, 'if (!("error" in result))', 'buildLogEntry("x"')).toBe(false);
  });

  it("does NOT false-positive on a call inside a DIFFERENT, unrelated if block that happens to appear first", () => {
    const fixture = `if (someOtherCondition) {\n  buildLogEntry("x");\n}\nif (!("error" in result)) {\n  doNothing();\n}`;
    expect(isCallSiteWithinIfBlock(fixture, 'if (!("error" in result))', 'buildLogEntry("x"')).toBe(false);
  });
});

describe("handleLinkUsernames records a log entry only when linkGithubUsernames succeeds - the log must never claim a link that did not persist", () => {
  it("the buildLogEntry(\"usernames-linked\" call site sits inside handleLinkUsernames's own non-error guard, the same shape handleAcceptBinding's \"ok\" in result guard already uses above", () => {
    const defIdx = indexSource.indexOf("const handleLinkUsernames = async");
    expect(defIdx).toBeGreaterThan(-1);
    const nextFnIdx = indexSource.indexOf("const handleConfirmAllSuggested", defIdx);
    expect(nextFnIdx).toBeGreaterThan(defIdx);
    const body = indexSource.slice(defIdx, nextFnIdx);
    expect(body).toContain('buildLogEntry("usernames-linked"');
    expect(isCallSiteWithinIfBlock(body, 'if (!("error" in result))', 'buildLogEntry("usernames-linked"')).toBe(true);
  });
});

describe("handleConfirmAllSuggested records a log entry only when confirmSuggestedBindings succeeds - same rule, same shape", () => {
  it("the buildLogEntry(\"binding-confirmed\" call site sits inside handleConfirmAllSuggested's own non-error guard", () => {
    const defIdx = indexSource.indexOf("const handleConfirmAllSuggested = async");
    expect(defIdx).toBeGreaterThan(-1);
    // Bounded by the next function actually declared in index.tsx
    // (handleLinkFromCourseRoster) rather than by handleGradeCell, which
    // used to follow it here but has since moved into
    // useRepoGradesGradingActions.ts along with the rest of the grading/
    // posting handlers - see that hook's own header comment.
    const nextFnIdx = indexSource.indexOf("const handleLinkFromCourseRoster = async", defIdx);
    expect(nextFnIdx).toBeGreaterThan(defIdx);
    const body = indexSource.slice(defIdx, nextFnIdx);
    expect(body).toContain('buildLogEntry("binding-confirmed"');
    expect(isCallSiteWithinIfBlock(body, 'if (!("error" in result))', 'buildLogEntry("binding-confirmed"')).toBe(true);
  });
});
