// N15c. This hook is a useCallback/useRef/useState wrapper - React throws
// "Invalid hook call" the moment any of those run outside React's render
// machinery, and this repo's vitest is node-env with no renderer
// (docs/loop/this-repo.md section 2: no component is ever rendered by any
// test here). So this file is SOURCE-TEXT ONLY, mirroring
// useSnapshotGrade.wiring.test.ts's own documented convention: reading
// useSnapshotAutoGrade.ts as TEXT and pinning the FACTS that make its
// dispatch correct, never the runtime behaviour those facts imply (that is
// what snapshot-auto-grade-decision.test.ts's direct execution of
// decideAutoGrade/planAutoGradeStep covers).

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const HOOK_PATH = join(process.cwd(), "src/app/components/snapshot-grading/useSnapshotAutoGrade.ts");
const hookSource = readFileSync(HOOK_PATH, "utf8");

// BLOCKER B fix: matches snapshot-grading.structure.test.ts's own
// stripComments exactly - the two copies must agree on what a comment is
// (this repo forbids importing a helper across test files, so duplication
// is correct, but a mismatched definition is not). The old version here
// was line-start-only (`/^[ \t]*\/\/.*$/gm`, so a TRAILING comment was
// never stripped) and, like the sibling copy before its own fix, CRLF-blind
// (`.` never matches "\r", so a bare `.` up to end-of-line stops one
// character short on a CRLF file). Splitting on /\r?\n/ first and matching
// `//` anywhere on the line (not just at its start) closes both holes.
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

const stripped = stripComments(hookSource);

// CANARY (BLOCKER 3, round 3 remediation - this file's own copy already
// stripped trailing comments correctly, but had no canary proving it; added
// so a future regression here is caught the same way the sibling copy's
// regression in useSnapshotGrade.wiring.test.ts was), built with
// String.fromCharCode(13) (never a \r escape in source text - Write/Edit
// materialize that as a literal character).
describe("stripComments handles CRLF line endings and trailing comments (BLOCKER 3 canary)", () => {
  const CR = String.fromCharCode(13);

  it("strips both a trailing and a whole-line // comment on CRLF-terminated lines", () => {
    const fixture = `const x = 1;${CR}\nconst y = 2; // trailing comment must go${CR}\n// whole-line comment must go${CR}\nconst z = 3;`;
    const result = stripComments(fixture);
    expect(result).not.toContain("trailing comment must go");
    expect(result).not.toContain("whole-line comment must go");
    expect(result).toContain("const y = 2;");
    expect(result).toContain("const z = 3;");
  });
});

// ---------------------------------------------------------------------------
// Instruction 3 (overrides the design where it conflicts): pin the gather
// site TEXTUALLY. Without this, a sabotage that hardcodes `armed: true` (or
// `confirmedThisLoad: true`, or `inFlight: false`) at the call site
// reproduces the original defect with every test in
// snapshot-auto-grade-decision.test.ts still green, since that suite only
// ever executes decideAutoGrade with WHATEVER input it is handed - it cannot
// see what the real caller actually passed. STATED PLAINLY (per instruction
// 3): this is aliasing-defeatable - a sabotage that renames its own
// fabricated value to the same identifier defeats it identically - and is
// not a behavioural guarantee, only a guard against the specific,
// measured hardcoding sabotage.
// ---------------------------------------------------------------------------

describe("the gather site passes the REAL armed/confirmedThisLoad/inFlight values, not hardcoded literals (instruction 3)", () => {
  it("decideAutoGrade( is called with the literal `armed: autoGradeArmed`", () => {
    expect(stripped).toMatch(/decideAutoGrade\(\{[\s\S]*?armed:\s*autoGradeArmed/);
  });

  it("decideAutoGrade( is called with the literal `confirmedThisLoad: confirmedThisLoadRef.current`", () => {
    expect(stripped).toMatch(/decideAutoGrade\(\{[\s\S]*?confirmedThisLoad:\s*confirmedThisLoadRef\.current/);
  });

  it("decideAutoGrade( is called with the literal `inFlight: inFlightRef.current`", () => {
    expect(stripped).toMatch(/decideAutoGrade\(\{[\s\S]*?inFlight:\s*inFlightRef\.current/);
  });
});

// ---------------------------------------------------------------------------
// BLOCKER 1: the gather site's eligibility.shotCount must read the SAME
// arrivals-inclusive list the dispatch payload (shotsForGrade, this
// function's own parameter) uses - not gateRef.current.shots, which is only
// synced by a LATER-committing effect and so still holds the PRE-arrival
// tray at the moment a synchronous event-handler trigger reads it. Reading
// gate.shots.length there means the first arrival into an empty committed
// tray is judged against a shotCount of 0 (isGradeEligible's own "shotCount
// === 0 && no transcript" branch returns false), so decideAutoGrade never
// fires it even though it is genuinely fireable.
//
// PROVEN RED THEN GREEN (this wave's own report quotes both runs): reverting
// this one line in useSnapshotAutoGrade.ts back to `shotCount:
// gate.shots.length,` makes the assertion below fail; the shipped line
// (`shotCount: shotsForGrade.length,`) makes it pass.
// ---------------------------------------------------------------------------

describe("BLOCKER 1: decideAutoGrade's eligibility.shotCount reads shotsForGrade (the arrivals-inclusive list), never gateRef.current.shots", () => {
  it("decideAutoGrade( is called with the literal `shotCount: shotsForGrade.length`", () => {
    expect(stripped).toMatch(/decideAutoGrade\(\{[\s\S]*?shotCount:\s*shotsForGrade\.length/);
  });

  it("never reads gate.shots.length as the eligibility shotCount - the exact pre-fix defect", () => {
    expect(stripped).not.toMatch(/shotCount:\s*gate\.shots\.length/);
  });
});

// ---------------------------------------------------------------------------
// AC 13: the gateRef-sync assignment (this file's own "always-latest"
// pattern - not a useEffect keyed on unrelated state) contains no call to
// handleGrade(/decideAutoGrade(/any action name - it exists ONLY to keep the
// gather inputs fresh for the drain, never to dispatch anything itself.
// ---------------------------------------------------------------------------

describe("AC 13: the gateRef-sync assignment contains no dispatch call", () => {
  it("gateRef.current is assigned a plain object literal - no handleGrade(/decideAutoGrade(/planAutoGradeStep( call on that line", () => {
    const start = stripped.indexOf("gateRef.current = {");
    expect(start).toBeGreaterThan(-1);
    const end = stripped.indexOf("};", start);
    expect(end).toBeGreaterThan(start);
    const body = stripped.slice(start, end);
    expect(body).not.toMatch(/handleGrade\(/);
    expect(body).not.toMatch(/decideAutoGrade\(/);
    expect(body).not.toMatch(/planAutoGradeStep\(/);
  });
});

// ---------------------------------------------------------------------------
// AC 13 (continued): inFlightRef.current = true textually precedes the
// void handleGrade( call in fireRef's own body - proves the synchronous
// guard is POSITIONED correctly (cannot prove the runtime race is closed
// under real concurrent Promise timing - that is residual R-5, unverified
// here per docs/loop/this-repo.md's network-blocked/no-render constraints).
// ---------------------------------------------------------------------------

describe("AC 13 (continued): inFlightRef.current is set BEFORE the handleGrade call it guards", () => {
  it("fireRef.current's body sets inFlightRef.current = true before void handleGrade(", () => {
    const fireStart = stripped.indexOf("fireRef.current = (shotsForGrade: SnapshotShot[]) => {");
    expect(fireStart).toBeGreaterThan(-1);
    const inFlightIdx = stripped.indexOf("inFlightRef.current = true;", fireStart);
    const handleGradeIdx = stripped.indexOf("void handleGrade(", fireStart);
    expect(inFlightIdx).toBeGreaterThan(fireStart);
    expect(handleGradeIdx).toBeGreaterThan(inFlightIdx);
  });
});

// ---------------------------------------------------------------------------
// Instruction 5: the decline path. `const ok = window.confirm(` (result
// BOUND, never discarded) and `if (!ok) return;` occurs textually BETWEEN
// that call and the single `confirmedThisLoadRef.current = true;` write. A
// one-line ordering slip otherwise arms the session when the user DECLINES.
// ---------------------------------------------------------------------------

describe("instruction 5: window.confirm's result is bound and the decline path returns before arming", () => {
  it("binds window.confirm's result to `ok` - never discards it", () => {
    expect(stripped).toMatch(/const ok = window\.confirm\(/);
  });

  it("`if (!ok) return;` appears textually between window.confirm( and the confirmedThisLoadRef.current = true; write", () => {
    const confirmIdx = stripped.indexOf("const ok = window.confirm(");
    const declineIdx = stripped.indexOf("if (!ok) return;", confirmIdx);
    const armIdx = stripped.indexOf("confirmedThisLoadRef.current = true;", confirmIdx);
    expect(confirmIdx).toBeGreaterThan(-1);
    expect(declineIdx).toBeGreaterThan(confirmIdx);
    expect(armIdx).toBeGreaterThan(declineIdx);
  });

  it("confirmedThisLoadRef.current = true; appears exactly once in this file", () => {
    const matches = stripped.match(/confirmedThisLoadRef\.current = true;/g) ?? [];
    expect(matches.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Instruction 6: the unhandled-rejection fix. void handleGrade(...) is
// followed by .catch( (a named, if empty, reason) and .finally( - never a
// bare .finally with no .catch, which crashed node with an unhandled
// rejection when actually run.
// ---------------------------------------------------------------------------

describe("instruction 6: handleGrade's promise is caught before it is finally-ed", () => {
  it("void handleGrade( is followed by .catch( before .finally(", () => {
    const callIdx = stripped.indexOf("void handleGrade(");
    expect(callIdx).toBeGreaterThan(-1);
    const catchIdx = stripped.indexOf(".catch(", callIdx);
    const finallyIdx = stripped.indexOf(".finally(", callIdx);
    expect(catchIdx).toBeGreaterThan(callIdx);
    expect(finallyIdx).toBeGreaterThan(catchIdx);
  });

  it("the .finally( body clears inFlightRef.current and drains the queue unconditionally", () => {
    const finallyIdx = stripped.indexOf(".finally(");
    expect(finallyIdx).toBeGreaterThan(-1);
    const finallyEnd = stripped.indexOf("});", finallyIdx);
    const body = stripped.slice(finallyIdx, finallyEnd);
    expect(body).toMatch(/inFlightRef\.current = false;/);
    expect(body).toMatch(/drainQueueRef\.current\(\);/);
  });
});

// ---------------------------------------------------------------------------
// C4's boolean-serialization fix (also pinned in the panel's own
// instructorInstructions hydration, mirrored here for the NEW persisted
// key). AC 15: hydration reads with `stored !== null` (never bare-truthy
// `if (stored)`), and writes with `String(value)`.
// ---------------------------------------------------------------------------

describe("AC 15: the ta-snap-auto-grade-armed hydration never uses bare-truthy `if (stored)`", () => {
  it("reads with `stored !== null`, not `if (stored)`", () => {
    expect(stripped).toMatch(/if\s*\(\s*stored !== null\s*\)/);
    expect(stripped).not.toMatch(/if\s*\(\s*stored\s*\)/);
  });

  it("parses the stored string explicitly with `stored === \"true\"`", () => {
    expect(stripped).toMatch(/stored === "true"/);
  });

  it("writes with String(armed) - an explicit serialization, not string coercion left implicit", () => {
    expect(stripped).toMatch(/window\.localStorage\.setItem\(\s*AUTO_GRADE_ARMED_KEY,\s*String\(armed\)\s*\)/);
  });

  it("declares the ta-snap-auto-grade-armed key literal", () => {
    expect(hookSource).toMatch(/const AUTO_GRADE_ARMED_KEY = "ta-snap-auto-grade-armed";/);
  });
});

// ---------------------------------------------------------------------------
// Instruction 1: the queue holds PAIRS, never bare shots, and is never read
// as gateRef.current.shots directly in place of the queued arrivals.
// ---------------------------------------------------------------------------

describe("instruction 1: the pending queue holds {added, shotsForGrade} pairs, drained by union, not by reading gateRef.current.shots alone", () => {
  it("pendingAddedShotsRef holds an array of {added, shotsForGrade} entries (queue push includes both fields)", () => {
    expect(stripped).toMatch(/pendingAddedShotsRef\.current\.push\(\{\s*added,\s*shotsForGrade:/);
  });

  it("the drain builds `added` by concatenating every queued entry's own `added` (flatMap), not by reading a single tray snapshot", () => {
    expect(stripped).toMatch(/const added = queued\.flatMap\(\s*\(entry\)\s*=>\s*entry\.added\s*\)/);
  });

  it("the drain unions shotsForGrade by shot.id across every queued entry AND the current tray - never `gateRef.current.shots` alone in place of the union", () => {
    const drainStart = stripped.indexOf("drainQueueRef.current = () => {");
    expect(drainStart).toBeGreaterThan(-1);
    const drainEnd = stripped.indexOf("attemptFireRef.current(added, shotsForGrade", drainStart);
    expect(drainEnd).toBeGreaterThan(drainStart);
    const body = stripped.slice(drainStart, drainEnd);
    expect(body).toMatch(/byId\.set\(\s*shot\.id,\s*shot\s*\)/);
    expect(body).toMatch(/gateRef\.current\.shots/);
  });
});

// ---------------------------------------------------------------------------
// Wiring A (design section 1.5): shotsIncludingArrivals is imported and used
// by the PANEL, not this hook - this file only ever forwards whatever
// shotsForGrade it is handed through planAutoGradeStep, never recomputing
// it. Asserted negatively here so a future edit cannot quietly duplicate
// that computation inside this hook.
// ---------------------------------------------------------------------------

describe("this hook never recomputes shotsForGrade itself - only planAutoGradeStep's own pass-through and the queue's union", () => {
  it("does not import shotsIncludingArrivals - that composition belongs to the panel's call sites, not this hook", () => {
    expect(stripped).not.toMatch(/shotsIncludingArrivals/);
  });
});

// ---------------------------------------------------------------------------
// SHOULD-FIX 5: a "not-eligible" no-fire is a genuinely dropped arrival (the
// checkbox's own confirm copy promises "every future one automatically"),
// not the same as "not-armed" or "no-arrivals" (neither of those is an
// arrival being dropped at all) - so only that one reason is announced.
// ---------------------------------------------------------------------------

describe("SHOULD-FIX 5: a not-eligible no-fire is announced through the panel's own announce() channel", () => {
  it("the 'none'/default step branch calls announce( guarded by decision.reason === \"not-eligible\"", () => {
    const noneIdx = stripped.indexOf('case "none":');
    expect(noneIdx).toBeGreaterThan(-1);
    const defaultIdx = stripped.indexOf("return;", noneIdx);
    const body = stripped.slice(noneIdx, defaultIdx);
    expect(body).toMatch(/decision\.reason === "not-eligible"/);
    expect(body).toMatch(/announce\(/);
  });

  it("does not announce for 'not-armed' or 'no-arrivals' - only a genuine dropped arrival, never an expected no-op", () => {
    const noneIdx = stripped.indexOf('case "none":');
    const defaultIdx = stripped.indexOf("return;", noneIdx);
    const body = stripped.slice(noneIdx, defaultIdx);
    expect(body).not.toMatch(/"not-armed"/);
    expect(body).not.toMatch(/"no-arrivals"/);
  });
});

// ---------------------------------------------------------------------------
// SHOULD-FIX 4: the boundary reset this hook exposes for the panel's
// handleNextStudentConfirm to call - see the panel-side wiring proof in
// snapshot-grading.structure.test.ts for confirmation the panel actually
// calls it.
// ---------------------------------------------------------------------------

describe("SHOULD-FIX 4: clearPendingAutoGrade clears the pending queue, with a stable (empty-deps) identity", () => {
  it("clearPendingAutoGrade is declared with useCallback and an empty dependency array", () => {
    expect(stripped).toMatch(/const clearPendingAutoGrade = useCallback\(\(\) => \{[\s\S]*?\}, \[\]\);/);
  });

  it("its body sets pendingAddedShotsRef.current to an empty array", () => {
    const start = stripped.indexOf("const clearPendingAutoGrade = useCallback(() => {");
    const end = stripped.indexOf("}, []);", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(stripped.slice(start, end)).toMatch(/pendingAddedShotsRef\.current = \[\];/);
  });

  it("is returned from the hook, alongside triggerAutoGradeIfDue", () => {
    expect(stripped).toMatch(/return \{ autoGradeArmed, setAutoGradeArmed, triggerAutoGradeIfDue, clearPendingAutoGrade \};/);
  });
});
