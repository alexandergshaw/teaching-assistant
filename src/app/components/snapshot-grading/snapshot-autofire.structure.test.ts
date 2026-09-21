import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

// N15c remediation round 3, BLOCKER 1. Split out of
// snapshot-grading.structure.test.ts (Ruling: split by SEAM, not by line
// budget - that file sat at 999/1000 lines and every fix below adds lines).
// This file owns the auto-fire reachability construction: the A7c effect
// scan, the AC10 "no synchronous dispatch at effect commit" check, and the
// per-identifier call-site pins for the five dispatch names. Helpers are
// DUPLICATED from the sibling file rather than imported - importing a helper
// from another *.test.ts re-runs that file's describe blocks under the
// wrong setup (docs/loop/traps-tests.md).

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

const SNAPSHOT_GRADING_DIR = path.resolve(process.cwd(), "src/app/components/snapshot-grading");

// ---------------------------------------------------------------------------
// WAVE 5, A7c: "the snap path calls no server action" from wave 4 extends to
// "the read/grade actions are called ONLY from a click handler, never a
// useEffect". GradingRecordingPanel.tsx:532-544 is the shape this must never
// copy (restated citation - wave 2 (docs/a16-plan.md 9.3) shifted this
// effect again by +4 (three new imports plus one new useState above it);
// re-measured post-wave-2 by `sed -n '505,545p' <panel> | cat -n'. The
// real auto-drain effect that fires runExtraction the moment pendingFrames
// crosses a threshold, with no button in the path, is :532-544): a useEffect
// that fires a server action, or (per BLOCKER 1) a dispatch ref that leads
// to one, the moment some piece of state crosses a threshold. This file
// isolates every useEffect/useLayoutEffect/useInsertionEffect BLOCK
// (bracket-counting from each "use*Effect(" to its own matching close) in
// every non-test file in this directory and asserts none of the five
// dispatch names is reachable SYNCHRONOUSLY when that effect commits.
// ---------------------------------------------------------------------------

describe("no auto-drain effect (A7c): the read/grade/OCR actions are reachable ONLY from a click handler or a chord", () => {
  const panelPath = path.join(SNAPSHOT_GRADING_DIR, "SnapshotGradingPanel.tsx");
  const panelSource = fs.readFileSync(panelPath, "utf-8");
  // Backlog 3.5's line-budget extraction (Ruling B35-9, amended) moved
  // handleGrade - and its snapshotGradeAction call - out of the panel into
  // its own hook file, so this file's own scan needs to cover it too, or the
  // whole "calls both actions somewhere" assertion would go dark rather than
  // red the moment the extraction happened.
  const hookPath = path.join(SNAPSHOT_GRADING_DIR, "useSnapshotGrade.ts");
  const hookSource = fs.readFileSync(hookPath, "utf-8");
  const allNonTestFiles = fs
    .readdirSync(SNAPSHOT_GRADING_DIR)
    .filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith(".test.ts"));
  const allSources = allNonTestFiles.map((f) => ({
    file: f,
    source: fs.readFileSync(path.join(SNAPSHOT_GRADING_DIR, f), "utf-8"),
  }));
  const rubricCaptureHookSource = fs.readFileSync(
    path.join(SNAPSHOT_GRADING_DIR, "useSnapshotRubricCapture.ts"),
    "utf-8"
  );

  // BLOCKER 1 fix: widened to useLayoutEffect( and useInsertionEffect( too -
  // the old version searched only the literal "useEffect(" and would not
  // even SEE an entire useLayoutEffect block, let alone check its contents.
  // Also: a useEffect( that looks unterminated now THROWS rather than a bare
  // `break` that silently dropped it (and everything after it) from every
  // check below.
  const EFFECT_MARKERS = ["useEffect(", "useLayoutEffect(", "useInsertionEffect("];

  function extractEffectBodies(rawSource: string): string[] {
    const source = stripComments(rawSource);
    const bodies: string[] = [];
    for (const marker of EFFECT_MARKERS) {
      let searchFrom = 0;
      for (;;) {
        const start = source.indexOf(marker, searchFrom);
        if (start === -1) break;
        let depth = 0;
        let i = start + marker.length - 1; // sit on the opening "("
        let end = -1;
        for (; i < source.length; i++) {
          if (source[i] === "(") depth++;
          else if (source[i] === ")") {
            depth--;
            if (depth === 0) {
              end = i;
              break;
            }
          }
        }
        if (end === -1) {
          throw new Error(
            `extractEffectBodies: found a ${marker} at index ${start} with no matching close - this used to be silently dropped (a bare 'break'), which hid it (and every effect after it) from every check in this file.`
          );
        }
        bodies.push(source.slice(start, end + 1));
        searchFrom = end + 1;
      }
    }
    return bodies;
  }

  // BLOCKER 1 fix: throws instead of returning "" when there is no brace at
  // all - the old version's `if (braceStart === -1) return "";` is exactly
  // what let `useEffect(mainEffect)` (a hoisted, named callback with no
  // inline brace) sail through every check below with an empty, trivially
  // clean "body".
  function extractCallbackBody(effectCallText: string): string {
    const braceStart = effectCallText.indexOf("{");
    if (braceStart === -1) {
      throw new Error(
        "extractCallbackBody: no opening brace found - a hoisted/named effect callback (e.g. useEffect(mainEffect)) is invisible to this scan and must not be used here."
      );
    }
    let depth = 0;
    for (let i = braceStart; i < effectCallText.length; i++) {
      if (effectCallText[i] === "{") depth++;
      else if (effectCallText[i] === "}" && --depth === 0) return effectCallText.slice(braceStart + 1, i);
    }
    throw new Error("extractCallbackBody: found an opening { with no matching close");
  }

  it("finds at least two useEffect blocks in the panel - a scan over none proves nothing", () => {
    expect(extractEffectBodies(panelSource).length).toBeGreaterThanOrEqual(2);
  });

  it("calls both actions somewhere - snapshotReadBatchAction in the panel, snapshotGradeAction in the extracted grade hook - a check that neither is called anywhere proves nothing", () => {
    expect(stripComments(panelSource)).toMatch(/snapshotReadBatchAction\(/);
    expect(stripComments(hookSource)).toMatch(/snapshotGradeAction\(/);
  });

  it("no useEffect block in the panel calls snapshotReadBatchAction or snapshotGradeAction", () => {
    const effectBodies = extractEffectBodies(panelSource);
    for (const body of effectBodies) {
      expect(body).not.toMatch(/snapshotReadBatchAction\(/);
      expect(body).not.toMatch(/snapshotGradeAction\(/);
    }
  });

  it("the extracted grade hook contains no useEffect at all - snapshotGradeAction is reachable only through the handleGrade it returns, never auto-fired", () => {
    expect(hookSource).not.toMatch(/useEffect\(/);
  });

  it("handleRead and handleGrade are wired to onClick, not to a dependency-array effect", () => {
    expect(panelSource).toMatch(/onClick=\{\(\)\s*=>\s*void handleRead\(\)\}/);
    expect(panelSource).toMatch(/onClick=\{\(\)\s*=>\s*void handleGrade\(\)\}/);
  });

  it("calls snapshotTranscribeRubricAction somewhere in the rubric-capture hook - a check that it is called nowhere proves nothing", () => {
    expect(stripComments(rubricCaptureHookSource)).toMatch(/snapshotTranscribeRubricAction\(/);
  });

  it("the rubric-capture hook contains no useEffect at all - snapshotTranscribeRubricAction is reachable only through captureAndTranscribe, never auto-fired", () => {
    expect(rubricCaptureHookSource).not.toMatch(/useEffect\(/);
  });

  it("BY CONSTRUCTION: no useEffect block in ANY non-test file in this directory calls snapshotReadBatchAction, snapshotGradeAction, or snapshotTranscribeRubricAction - generalized so a future file cannot pass this by not being on a hardcoded list (Ruling N14-15)", () => {
    for (const { file, source } of allSources) {
      const effectBodies = extractEffectBodies(source);
      for (const body of effectBodies) {
        expect(body, `${file} has a useEffect calling snapshotReadBatchAction`).not.toMatch(/snapshotReadBatchAction\(/);
        expect(body, `${file} has a useEffect calling snapshotGradeAction`).not.toMatch(/snapshotGradeAction\(/);
        expect(body, `${file} has a useEffect calling snapshotTranscribeRubricAction`).not.toMatch(
          /snapshotTranscribeRubricAction\(/
        );
      }
    }
  });

  it("useSnapshotKeyboardShortcuts.ts's own keydown effect never calls an action directly - only through the callback parameters it receives (captureAndTranscribe is passed in as onCaptureRubric, never imported)", () => {
    const keyboardHookSource = fs.readFileSync(
      path.join(SNAPSHOT_GRADING_DIR, "useSnapshotKeyboardShortcuts.ts"),
      "utf-8"
    );
    expect(stripComments(keyboardHookSource)).not.toMatch(/snapshotReadBatchAction\(/);
    expect(stripComments(keyboardHookSource)).not.toMatch(/snapshotGradeAction\(/);
    expect(stripComments(keyboardHookSource)).not.toMatch(/snapshotTranscribeRubricAction\(/);
  });

  // -------------------------------------------------------------------------
  // N15c AC 10 (BLOCKER 1, restated a THIRD time). The old brace-depth-0
  // heuristic ("depth 0 == runs synchronously on commit") is FALSE: any
  // block statement (if/for/try/switch/a plain arrow passed to .then or
  // setTimeout) raises the depth, so wrapping a forbidden call in any of
  // those defeated the check while genuinely running it synchronously at
  // commit. THE REAL PROPERTY is reachability without a deferral boundary,
  // where the only genuine deferral boundary in this codebase's own idiom is
  // a function literal ASSIGNED TO A REF (attemptFireRef.current = (...) =>
  // {...}, etc - see useSnapshotAutoGrade.ts's own header comment on why
  // this three-way cycle is held in refs at all). A call reached through
  // if/for/try/switch, or through a non-ref-assigned literal (an inline
  // .then/.setTimeout/useLayoutEffect callback), is flagged.
  // -------------------------------------------------------------------------

  const FORBIDDEN_DISPATCH_NAMES = [
    "decideAutoGrade(",
    "handleGrade(",
    "attemptFireRef.current(",
    "fireRef.current(",
    "drainQueueRef.current(",
  ];

  // Returns true when the `{` at `braceIndex` opens the body of a function
  // literal that is itself the right-hand side of a `<name>Ref.current = `
  // assignment - i.e. a genuine deferral boundary in this codebase's idiom.
  // Any OTHER brace (if/for/try/switch/else/a plain non-ref-assigned
  // function literal such as one passed to .then(/setTimeout() is NOT a
  // deferral boundary and does not shield what it contains.
  function opensRefAssignedFunctionLiteral(text: string, braceIndex: number): boolean {
    const before = text.slice(Math.max(0, braceIndex - 240), braceIndex);
    // The parameter list uses `.*` (not `[^)]*`) because this codebase's own
    // ref-assigned callbacks carry parenthesized union types in their
    // annotations (e.g. `(added: (SnapshotShot | null)[], ...)`) - a
    // single-paren-class char class stops at the FIRST inner ")" and never
    // matches the real parameter list at all, which silently failed to
    // recognize attemptFireRef's own assignment as a deferral boundary.
    return /[A-Za-z_$][\w$]*Ref\.current\s*=\s*(?:async\s*)?\(.*\)\s*=>\s*$/.test(before);
  }

  // Reports every forbidden identifier invocation that is reachable
  // SYNCHRONOUSLY when `callbackBody` runs (i.e. not nested inside a
  // ref-assigned function literal at any depth).
  function invocationsReachableSynchronously(callbackBody: string, forbiddenIds: string[]): string[] {
    const found: string[] = [];
    const deferredBoundary: boolean[] = [];
    for (let i = 0; i < callbackBody.length; i++) {
      const ch = callbackBody[i];
      if (ch === "{") {
        deferredBoundary.push(opensRefAssignedFunctionLiteral(callbackBody, i));
      } else if (ch === "}") {
        deferredBoundary.pop();
      } else if (!deferredBoundary.some(Boolean)) {
        for (const id of forbiddenIds) if (callbackBody.startsWith(id, i)) found.push(id);
      }
    }
    return found;
  }

  it("N15c AC 10 (construction, restated): no useEffect/useLayoutEffect/useInsertionEffect callback body in this directory invokes decideAutoGrade(/handleGrade(/attemptFireRef.current(/fireRef.current(/drainQueueRef.current( while reachable synchronously at commit - each may only be reached from inside a function literal actually ASSIGNED TO A REF (the one genuine deferral boundary this codebase uses), never merely nested inside an if/for/try/switch or a plain .then/setTimeout/useLayoutEffect callback", () => {
    for (const { file, source } of allSources) {
      for (const effectCall of extractEffectBodies(source)) {
        const found = invocationsReachableSynchronously(extractCallbackBody(effectCall), FORBIDDEN_DISPATCH_NAMES);
        expect(
          found,
          `${file} makes ${found.join(", ")} reachable synchronously at effect commit - the GradingRecordingPanel.tsx:532-544 shape`
        ).toEqual([]);
      }
    }
  });

  // ---------------------------------------------------------------------------
  // BLOCKER 1's fifth defeat (the alias): `const f = attemptFireRef.current; f(
  // shots, shots, false);` evades EVERY textual/identifier-based check above,
  // since the call is spelled `f(`, never `attemptFireRef.current(`. The
  // construction that actually closes this hole is a WHITELIST, not a
  // blacklist: the main dispatch effect in useSnapshotAutoGrade.ts (the one
  // that assigns gateRef/drainQueueRef/fireRef/attemptFireRef) may contain
  // EXACTLY those four assignments and nothing else. Any fifth statement -
  // an alias-and-call, an appended if-wrapped call, a stray
  // Promise.resolve().then(...) - leaves a nonempty remainder once the four
  // known assignments are subtracted out, and this test fails loudly rather
  // than needing to anticipate the sabotage's exact shape.
  // ---------------------------------------------------------------------------

  function stripAssignmentBlock(text: string, startMarker: string): string {
    const start = text.indexOf(startMarker);
    if (start === -1) throw new Error(`stripAssignmentBlock: could not find ${JSON.stringify(startMarker)}`);
    const braceStart = text.indexOf("{", start);
    let depth = 0;
    let end = -1;
    for (let i = braceStart; i < text.length; i++) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}") {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end === -1) throw new Error(`stripAssignmentBlock: unterminated block for ${JSON.stringify(startMarker)}`);
    let sliceEnd = end + 1;
    if (text[sliceEnd] === ";") sliceEnd++;
    return text.slice(0, start) + text.slice(sliceEnd);
  }

  it("BLOCKER 1 (the alias defeat): useSnapshotAutoGrade.ts's main dispatch effect contains EXACTLY the four ref assignments (gateRef/drainQueueRef/fireRef/attemptFireRef) and nothing else - a fifth statement of any shape leaves a nonempty remainder", () => {
    const autoGradeHookSource = fs.readFileSync(path.join(SNAPSHOT_GRADING_DIR, "useSnapshotAutoGrade.ts"), "utf-8");
    const stripped = stripComments(autoGradeHookSource);
    const effectBodies = extractEffectBodies(stripped).filter((body) => body.includes("gateRef.current = {"));
    expect(effectBodies.length, "expected to find exactly one main dispatch effect").toBe(1);
    let remainder = extractCallbackBody(effectBodies[0]);
    remainder = stripAssignmentBlock(remainder, "gateRef.current = {");
    remainder = stripAssignmentBlock(remainder, "drainQueueRef.current = () => {");
    remainder = stripAssignmentBlock(remainder, "fireRef.current = (shotsForGrade: SnapshotShot[]) => {");
    remainder = stripAssignmentBlock(
      remainder,
      "attemptFireRef.current = (added: (SnapshotShot | null)[], shotsForGrade: SnapshotShot[], isRetry = false) => {"
    );
    expect(remainder.replace(/\s/g, "")).toBe("");
  });

  // ---------------------------------------------------------------------------
  // The call-site pin, extended to ALL FIVE names (round 2/3 only pinned
  // attemptFireRef.current). Each name is pinned to the exact set of bodies
  // allowed to invoke it, located by brace-matching from its own
  // declaration/assignment - never by a formatting-dependent literal.
  // ---------------------------------------------------------------------------

  function boundsOfCallback(source: string, declMarker: string): { start: number; end: number } {
    const declIdx = source.indexOf(declMarker);
    if (declIdx === -1) throw new Error(`boundsOfCallback: could not find ${JSON.stringify(declMarker)}`);
    const braceStart = source.indexOf("{", declIdx);
    const body = extractCallbackBody(source.slice(declIdx));
    return { start: declIdx, end: braceStart + 1 + body.length };
  }

  function callSites(source: string, name: string, declPrefix: string): number[] {
    const sites: number[] = [];
    for (let i = source.indexOf(`${name}(`); i !== -1; i = source.indexOf(`${name}(`, i + 1)) {
      if (declPrefix.length > 0) {
        const before = source.slice(Math.max(0, i - declPrefix.length), i);
        if (before === declPrefix) continue; // exclude the declaration itself
      }
      sites.push(i);
    }
    return sites;
  }

  it("attemptFireRef.current( is invoked (called, not assigned) only from triggerAutoGradeIfDue's own body and drainQueueRef's own assigned body", () => {
    const autoGradeSource = stripComments(fs.readFileSync(path.join(SNAPSHOT_GRADING_DIR, "useSnapshotAutoGrade.ts"), "utf-8"));
    const sites = callSites(autoGradeSource, "attemptFireRef.current", "");
    expect(sites.length, "expected at least one call site").toBeGreaterThan(0);

    const trigger = boundsOfCallback(
      autoGradeSource,
      "const triggerAutoGradeIfDue = useCallback((added: (SnapshotShot | null)[], shotsForGrade: SnapshotShot[]) => {"
    );
    const drain = boundsOfCallback(autoGradeSource, "drainQueueRef.current = () => {");

    for (const idx of sites) {
      const insideTrigger = idx > trigger.start && idx < trigger.end;
      const insideDrain = idx > drain.start && idx < drain.end;
      expect(insideTrigger || insideDrain, `attemptFireRef.current( at index ${idx} is invoked outside both`).toBe(true);
    }
  });

  it("fireRef.current( is invoked only from attemptFireRef's own assigned body (the 'fire' and 'confirm' dispatch branches)", () => {
    const autoGradeSource = stripComments(fs.readFileSync(path.join(SNAPSHOT_GRADING_DIR, "useSnapshotAutoGrade.ts"), "utf-8"));
    const sites = callSites(autoGradeSource, "fireRef.current", "");
    expect(sites.length).toBeGreaterThan(0);

    const attemptFire = boundsOfCallback(
      autoGradeSource,
      "attemptFireRef.current = (added: (SnapshotShot | null)[], shotsForGrade: SnapshotShot[], isRetry = false) => {"
    );
    for (const idx of sites) {
      expect(idx > attemptFire.start && idx < attemptFire.end, `fireRef.current( at index ${idx} is invoked outside attemptFireRef's own body`).toBe(true);
    }
  });

  it("drainQueueRef.current( is invoked only from fireRef's own assigned body (its .finally callback)", () => {
    const autoGradeSource = stripComments(fs.readFileSync(path.join(SNAPSHOT_GRADING_DIR, "useSnapshotAutoGrade.ts"), "utf-8"));
    const sites = callSites(autoGradeSource, "drainQueueRef.current", "");
    expect(sites.length).toBeGreaterThan(0);

    const fire = boundsOfCallback(autoGradeSource, "fireRef.current = (shotsForGrade: SnapshotShot[]) => {");
    for (const idx of sites) {
      expect(idx > fire.start && idx < fire.end, `drainQueueRef.current( at index ${idx} is invoked outside fireRef's own body`).toBe(true);
    }
  });

  it("decideAutoGrade( is invoked only from attemptFireRef's own assigned body", () => {
    const autoGradeSource = stripComments(fs.readFileSync(path.join(SNAPSHOT_GRADING_DIR, "useSnapshotAutoGrade.ts"), "utf-8"));
    const sites = callSites(autoGradeSource, "decideAutoGrade", "function ");
    expect(sites.length).toBeGreaterThan(0);

    const attemptFire = boundsOfCallback(
      autoGradeSource,
      "attemptFireRef.current = (added: (SnapshotShot | null)[], shotsForGrade: SnapshotShot[], isRetry = false) => {"
    );
    for (const idx of sites) {
      expect(idx > attemptFire.start && idx < attemptFire.end, `decideAutoGrade( at index ${idx} is invoked outside attemptFireRef's own body`).toBe(true);
    }
  });

  it("handleGrade( is invoked only from the panel's own Grade button onClick and fireRef's own assigned body", () => {
    const panelStripped = stripComments(panelSource);
    const autoGradeSource = stripComments(fs.readFileSync(path.join(SNAPSHOT_GRADING_DIR, "useSnapshotAutoGrade.ts"), "utf-8"));

    const onClickLiteral = "onClick={() => void handleGrade()}";
    const onClickStart = panelStripped.indexOf(onClickLiteral);
    expect(onClickStart, "expected the Grade button's own onClick literal").toBeGreaterThan(-1);
    const panelSites = callSites(panelStripped, "handleGrade", "");
    for (const idx of panelSites) {
      expect(
        idx >= onClickStart && idx < onClickStart + onClickLiteral.length,
        `handleGrade( at index ${idx} in the panel is invoked outside the Grade button's own onClick`
      ).toBe(true);
    }

    const fire = boundsOfCallback(autoGradeSource, "fireRef.current = (shotsForGrade: SnapshotShot[]) => {");
    const hookSites = callSites(autoGradeSource, "handleGrade", "");
    for (const idx of hookSites) {
      expect(idx > fire.start && idx < fire.end, `handleGrade( at index ${idx} in useSnapshotAutoGrade.ts is invoked outside fireRef's own body`).toBe(true);
    }
  });

  it("useSnapshotKeyboardShortcuts.ts's own keydown effect never calls handleGrade/decideAutoGrade directly either - only handleSnap, passed in as a parameter, ultimately reaches the auto-grade trigger (one hop, never zero)", () => {
    const keyboardHookSource = fs.readFileSync(
      path.join(SNAPSHOT_GRADING_DIR, "useSnapshotKeyboardShortcuts.ts"),
      "utf-8"
    );
    expect(stripComments(keyboardHookSource)).not.toMatch(/decideAutoGrade\(/);
    expect(stripComments(keyboardHookSource)).not.toMatch(/handleGrade\(/);
  });
});
