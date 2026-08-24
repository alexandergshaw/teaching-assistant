// Wiring guard for useCurrentEventsAssignments.ts
// (docs/current-events-assignment-from-modules-acceptance-criteria.md,
// section 3b is the final contract; D3 is the run order this file pins, D4
// is the deadline-placement guard this file extends across the whole
// current-events-assignment* action family).
//
// vitest here is node-env (vitest.config.ts) and collects only
// src/**/*.test.ts - NO component is ever rendered, and this hook cannot be
// exercised end to end in this file: it calls React's useState, which
// throws "Invalid hook call" outside a component render, and importing
// "@/app/actions/current-events-assignments" at module load reaches
// @/lib/supabase/auth, which this test deliberately does not mock. Every
// assertion below is therefore a SOURCE-TEXT assertion - reading the hook's
// own file as a string, the same idiom askAiSelection.wiring.test.ts and
// current-events-assignments.test.ts's own D4 guard section already use.
// This proves the ORDERING and the STRUCTURE the AC requires; it proves
// nothing about runtime behaviour, keyboard interaction, or markup - that is
// a real gap, not an oversight, and is recorded as such in the final report.
//
// Pinned facts, never spelling (source-text-tests-overspecify): the
// two-phase ordering (plan, then generate, then write); the empty-toCreate
// early return that makes no generate call; setOpBusy driven rather than a
// second local busy flag; the sequential (not concurrent) write loop; and
// describeOrphans imported from useBulkModuleActions rather than
// re-implemented - plus the chunk's two structural D4 guards, generalized
// across every non-test file in the current-events-assignment* family
// rather than just the one file 1E's own test already covers.

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

/** Strips // line comments and block comments before any assertion below
 * runs. This file's own header (above) names ".toISOString(",
 * "current-events-assignment-plan" and "use server" in prose - a raw-text
 * scan of ITS OWN source would trip on that, though only the hook's and the
 * actions' source are actually scanned here. Kept anyway so every file this
 * suite reads is stripped identically, and so a doc comment inside any of
 * them (1E's own file already has one - see its test's header) can never be
 * mistaken for real code. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const HOOK_PATH = path.join(process.cwd(), "src/app/components/content-tab/modules/useCurrentEventsAssignments.ts");
const PLAN_PATH = path.join(process.cwd(), "src/lib/current-events-assignment-plan.ts");
const ACTIONS_DIR = path.join(process.cwd(), "src/app/actions");

const hookRaw = fs.readFileSync(HOOK_PATH, "utf8");
const hookCode = stripComments(hookRaw);

describe("useCurrentEventsAssignments source is substantial and readable", () => {
  // Canary (AGENTS.md's emoji-scan lesson): every assertion below reads
  // hookCode - prove first that it is real, non-trivial source text, not an
  // empty or truncated read that would make every "not.toMatch" below pass
  // vacuously.
  it("read more than 1000 characters of real source", () => {
    expect(hookRaw.length).toBeGreaterThan(1000);
  });

  it("exports the hook and its return-type interface by the contracted names", () => {
    expect(hookCode).toMatch(/export\s+interface\s+UseCurrentEventsAssignmentsReturn\b/);
    expect(hookCode).toMatch(/export\s+function\s+useCurrentEventsAssignments\b/);
  });
});

describe("two-phase ordering: plan, then generate, then write - never interleaved", () => {
  const planIdx = hookCode.indexOf("planCurrentEventsAssignments(");
  const generateIdx = hookCode.indexOf("generateCurrentEventsAssignmentsAction(");
  const writeIdx = hookCode.indexOf("addContentToModuleDetailed(");

  it("calls the plan, the generate action, and the Canvas write, in that order", () => {
    expect(planIdx, "planCurrentEventsAssignments( not found").toBeGreaterThan(-1);
    expect(generateIdx, "generateCurrentEventsAssignmentsAction( not found").toBeGreaterThan(-1);
    expect(writeIdx, "addContentToModuleDetailed( not found").toBeGreaterThan(-1);

    // Sabotage: swap generateIdx and writeIdx's expected relation (assert
    // writeIdx < generateIdx instead) and this test goes red, because the
    // real file calls the write only after the generate action returns.
    expect(planIdx).toBeLessThan(generateIdx);
    expect(generateIdx).toBeLessThan(writeIdx);
  });
});

describe("the empty-toCreate pre-check makes no generate call (D2's zero-spend re-run)", () => {
  it("checks toCreate.length === 0 before ever calling generateCurrentEventsAssignmentsAction", () => {
    const guardIdx = hookCode.indexOf("toCreate.length === 0");
    const generateIdx = hookCode.indexOf("generateCurrentEventsAssignmentsAction(");
    expect(guardIdx, "the empty-toCreate guard was not found").toBeGreaterThan(-1);
    // Sabotage: change this to toBeGreaterThan and it goes red, since the
    // guard exists specifically to run BEFORE the model-spending call.
    expect(guardIdx).toBeLessThan(generateIdx);
  });

  it("the empty-toCreate branch's own block contains no generate call inside it", () => {
    // Isolate the if-block text between the guard and the first `return`
    // that follows it - the generate action name must not appear inside
    // that slice, or the "no model call" guarantee would be broken.
    const guardIdx = hookCode.indexOf("toCreate.length === 0");
    const blockEnd = hookCode.indexOf("return;", guardIdx);
    expect(blockEnd, "no return; found after the empty-toCreate guard").toBeGreaterThan(guardIdx);
    const block = hookCode.slice(guardIdx, blockEnd);
    expect(block).not.toMatch(/generateCurrentEventsAssignmentsAction/);
  });
});

describe("setOpBusy drives busy state - no second local busy flag", () => {
  it("calls the caller-supplied setOpBusy on both the early-return and the full-run paths", () => {
    const trueCalls = hookCode.match(/setOpBusy\(true\)/g) ?? [];
    const falseCalls = hookCode.match(/setOpBusy\(false\)/g) ?? [];
    // Sabotage: change trueCalls' expectation to toBe(0) and this goes red -
    // the hook does call setOpBusy(true) once, at the start of the run.
    expect(trueCalls.length).toBe(1);
    // Sabotage: change this to toBe(1) and it goes red - there are two
    // distinct setOpBusy(false) call sites: the empty-toCreate early return
    // and the final step-7 completion, and both must exist for busy state
    // to never get stuck true on the early-exit path.
    expect(falseCalls.length).toBeGreaterThanOrEqual(2);
  });

  it("declares exactly one useState call (armed-selection tracking), never a second one for busy", () => {
    const useStateCalls = hookCode.match(/useState[<(]/g) ?? [];
    // Sabotage: add a second `useState(false)` busy flag to the hook and
    // this goes red, catching exactly the local-busy-flag regression the
    // AC's "no busy flag of its own" rule forbids.
    expect(useStateCalls.length).toBe(1);
  });
});

describe("the Canvas write loop is sequential, not concurrent", () => {
  it("awaits addContentToModuleDetailed inside a for...of loop, never inside Promise.all/allSettled", () => {
    const loopIdx = hookCode.indexOf("for (const entry of toCreate)");
    const writeIdx = hookCode.indexOf("addContentToModuleDetailed(");
    expect(loopIdx, "sequential for...of loop over toCreate not found").toBeGreaterThan(-1);
    // Sabotage: change toBeLessThan to toBeGreaterThan and this goes red -
    // the write call site must sit inside (after) the loop's own opening.
    expect(loopIdx).toBeLessThan(writeIdx);
    expect(hookCode).toMatch(/await addContentToModuleDetailed\(/);
    // The generation call, by contrast, must never be inside a per-module
    // for loop of its own in this file - it is one batched round trip.
    expect(hookCode).not.toMatch(/for\s*\([^)]*\)\s*\{[^}]*generateCurrentEventsAssignmentsAction/);
  });
});

describe("describeOrphans is imported from useBulkModuleActions, never re-implemented", () => {
  it("imports describeOrphans and the OrphanNote type from ./useBulkModuleActions", () => {
    expect(hookCode).toMatch(/from\s+["']\.\/useBulkModuleActions["']/);
    // Sabotage: change this to require describeOrphans from a different
    // module path and this goes red - the import must name BOTH the value
    // and its type from the one sibling file that owns them.
    expect(hookCode).toMatch(/import\s*\{[^}]*describeOrphans[^}]*\}\s*from\s*["']\.\/useBulkModuleActions["']/);
    expect(hookCode).toMatch(/OrphanNote/);
  });

  it("does not declare its own describeOrphans function or const", () => {
    // Sabotage: paste a local `function describeOrphans` definition into the
    // hook and this goes red - the point is reuse, not a lookalike.
    expect(hookCode).not.toMatch(/function\s+describeOrphans\s*\(/);
    expect(hookCode).not.toMatch(/const\s+describeOrphans\s*=/);
  });
});

describe("D4 structural guards, generalized across every current-events-assignment* action file", () => {
  const files = fs
    .readdirSync(ACTIONS_DIR)
    .filter((name) => /^current-events-assignment.*\.ts$/.test(name) && !name.endsWith(".test.ts"));

  // Canary: proves the glob above actually found real files rather than
  // silently matching zero and passing every guard below vacuously.
  it("canary: finds the known non-test action files", () => {
    expect(files.length).toBeGreaterThanOrEqual(2);
    expect(files).toContain("current-events-assignments.ts");
    expect(files).toContain("current-events-assignment-generator.ts");
  });

  it("guard (b): .toISOString( appears in the plan module (positive canary the guard is meaningful)", () => {
    const planRaw = fs.readFileSync(PLAN_PATH, "utf8");
    expect(stripComments(planRaw)).toMatch(/\.toISOString\(/);
  });

  for (const file of files) {
    const raw = fs.readFileSync(path.join(ACTIONS_DIR, file), "utf8");
    const code = stripComments(raw);

    it(`guard (b): ${file} contains no .toISOString( call in code`, () => {
      // Sabotage: add a real (uncommented) `.toISOString(` call to this
      // file and this goes red - a server-computed instant is exactly
      // the class of bug docs/REGRESSION.md entry 328 already shipped once.
      expect(code).not.toMatch(/\.toISOString\(/);
    });
  }

  const serverActionFiles = files.filter((file) => {
    const raw = fs.readFileSync(path.join(ACTIONS_DIR, file), "utf8");
    return /^\s*["']use server["']/.test(stripComments(raw));
  });

  it("canary: at least one scanned file is a real \"use server\" boundary", () => {
    expect(serverActionFiles.length).toBeGreaterThanOrEqual(1);
    expect(serverActionFiles).toContain("current-events-assignments.ts");
  });

  for (const file of serverActionFiles) {
    const raw = fs.readFileSync(path.join(ACTIONS_DIR, file), "utf8");
    const code = stripComments(raw);

    it(`guard (a): ${file} ("use server") never imports the wave-2 plan module`, () => {
      // Sabotage: add `import { planCurrentEventsAssignments } from
      // "@/lib/current-events-assignment-plan";` to this file and this goes
      // red - a "use server" file must be structurally incapable of
      // computing a deadline (D4).
      expect(code).not.toMatch(/from\s+["'][^"']*current-events-assignment-plan["']/);
    });
  }
});

describe("an all-export (zero-live) selection is reported through setNote, never a silent return (regression: step-11's dead click)", () => {
  // Pins the FACT (a size check is followed by a real setNote call before
  // its return) and the ORDERING (the arm-time check runs before arming),
  // never the exact wording - source-text-tests-overspecify.
  const sizeZeroChecks = [...hookCode.matchAll(/selectedModules\.size === 0/g)];

  it("checks selectedModules.size === 0 at least twice: once before arming, once before the write phase", () => {
    // Sabotage: delete the arm-time refusal block (the one guarding
    // setArmedFor(selectionSig)) and this drops to 1, catching a regression
    // back to a state where an all-export selection could still be armed
    // into a "Create 0 assignments?" label.
    expect(sizeZeroChecks.length).toBeGreaterThanOrEqual(2);
  });

  it("every selectedModules.size === 0 branch calls setNote strictly before its return, never a bare return", () => {
    expect(sizeZeroChecks.length).toBeGreaterThanOrEqual(2);
    for (const match of sizeZeroChecks) {
      const idx = match.index ?? -1;
      expect(idx).toBeGreaterThan(-1);
      const returnIdx = hookCode.indexOf("return;", idx);
      expect(returnIdx, "no return; found after a selectedModules.size === 0 check").toBeGreaterThan(idx);
      const setNoteIdx = hookCode.indexOf("setNote(", idx);
      // Sabotage: revert either branch back to a bare `return;` with no
      // setNote call in between, and this goes red - a real reason must be
      // stated on every path that stops the run, per docs/DEV_LOOP.md step
      // 8's "does an error's reason survive" rule.
      expect(setNoteIdx, "no setNote( call found between the size check and its return").toBeGreaterThan(idx);
      expect(setNoteIdx).toBeLessThan(returnIdx);
    }
  });

  it("both branches reuse one shared note constant rather than inventing a second outcome vocabulary", () => {
    const noteDeclIdx = hookCode.indexOf("NO_LIVE_MODULES_NOTE");
    expect(noteDeclIdx, "a shared NO_LIVE_MODULES_NOTE-style constant was not found").toBeGreaterThan(-1);
    const usages = [...hookCode.matchAll(/setNote\(NO_LIVE_MODULES_NOTE\)/g)];
    // Sabotage: change one branch to call setNote with a different inline
    // { kind: "error", text: "..." } literal instead of the shared
    // constant, and this drops from 2 to 1 - the AC forbids a second,
    // independently-drifting outcome message for the same real reason.
    expect(usages.length).toBe(2);
  });
});

describe("the arm-time refusal runs before arming ever happens", () => {
  it("checks selectedModules.size === 0 before ever calling setArmedFor(selectionSig)", () => {
    const armCallIdx = hookCode.indexOf("setArmedFor(selectionSig)");
    const firstSizeCheckIdx = hookCode.indexOf("selectedModules.size === 0");
    expect(armCallIdx, "setArmedFor(selectionSig) not found").toBeGreaterThan(-1);
    expect(firstSizeCheckIdx, "selectedModules.size === 0 not found").toBeGreaterThan(-1);
    // Sabotage: move the size check to after setArmedFor(selectionSig) (or
    // delete it) and this goes red - refusing before arming is the whole
    // point: it stops the misleading "Create 0 assignments?" label from
    // ever rendering, rather than only explaining it after a second click.
    expect(firstSizeCheckIdx).toBeLessThan(armCallIdx);
  });
});
