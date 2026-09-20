// A15 - Live Feed Auto Grade never showed as pending because
// GradingTab.tsx's handleAutoGrade called formAction(fd) from a bare
// onClick, outside startTransition, so React's dispatchActionState took the
// isTransition = false branch and never set pending. vitest here is
// node-env and collects only src/**/*.test.ts, so neither component is ever
// rendered - this file reads both sources as TEXT, the established idiom in
// this codebase (repoGrades.wiring.test.ts, markLate.wiring.test.ts) for
// wiring guarantees no render-based test can check.
//
// NO LINE NUMBERS ANYWHERE BELOW. The fix shifts every line after the old
// handler by a few lines, so every anchor here is a literal string.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const GRADING_TAB_PATH = join(process.cwd(), "src/app/components/GradingTab.tsx");
const LIVE_FEED_PATH = join(process.cwd(), "src/app/components/LiveFeedPanel.tsx");

/** Source with line/block comments stripped - duplicated verbatim from
 * bulkBar.wiring.test.ts:57 (never imported - importing a helper from
 * another *.test.ts re-runs that file's describe blocks). CRLF-safe: this
 * is the multiline form, not the split-on-bare-linefeed variant that goes
 * silently blind on this repo's CRLF working tree (filed as backlog L13). */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

describe("stripComments (canary first)", () => {
  it("removes a // comment but leaves real code alone", () => {
    const fixture = ["// <GenerateFromSelectionSection used to live here", "const x = <GenerateFromSelectionSection />;"].join("\n");
    const stripped = stripComments(fixture);
    expect(stripped).not.toContain("used to live here");
    expect(stripped).toContain("<GenerateFromSelectionSection />");
  });
});

/** Verbatim from repoGrades.wiring.test.ts:78-88. */
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

/** Same depth-counting algorithm as findMatchingBraceEnd, over ( and )
 * instead of { and }. A startTransition(...) call's scope is paren-
 * delimited, which is correct for both `() => {...}` and `() => expr`. */
function findMatchingCloseParen(text: string, openParenIdx: number): number {
  let depth = 0;
  for (let i = openParenIdx; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Smallest {...} span in `text` containing `idx`. Scanning left to right
 * with a stack of open-brace indices: the first close brace whose span
 * contains idx is necessarily the innermost one, because an inner brace
 * pair always closes before any outer pair that also contains idx. */
function innermostEnclosingBraceSpan(text: string, idx: number): { start: number; end: number } | null {
  const stack: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "{") {
      stack.push(i);
    } else if (text[i] === "}") {
      const start = stack.pop();
      if (start === undefined) continue;
      if (start <= idx && idx <= i) {
        return { start, end: i };
      }
    }
  }
  return null;
}

/** From the nearest preceding `<Button`, scans forward to the first `>`
 * whose preceding character is NOT `=` - attribute values here contain
 * `=>` (arrow functions), which a naive "first >" scan would stop at. */
function openingTagAround(text: string, attrIdx: number): string {
  const tagStart = text.lastIndexOf("<Button", attrIdx);
  if (tagStart === -1) return "";
  for (let i = tagStart; i < text.length; i++) {
    if (text[i] === ">" && text[i - 1] !== "=") {
      return text.slice(tagStart, i + 1);
    }
  }
  return text.slice(tagStart);
}

const gtSource = stripComments(readFileSync(GRADING_TAB_PATH, "utf8"));
const lfSource = stripComments(readFileSync(LIVE_FEED_PATH, "utf8"));

// HANDLER = the brace body of `const handleAutoGrade`.
const handlerNameIdx = gtSource.indexOf("const handleAutoGrade");
const handlerBraceOpen = gtSource.indexOf("{", handlerNameIdx);
const handlerBraceEnd = findMatchingBraceEnd(gtSource, handlerBraceOpen);
const HANDLER = gtSource.slice(handlerBraceOpen, handlerBraceEnd + 1);

// TXN = the paren span of `startTransition(` inside HANDLER.
const startTransitionMatches = [...HANDLER.matchAll(/startTransition\(/g)];
const startTransitionOpenIdx =
  startTransitionMatches.length > 0
    ? startTransitionMatches[0].index! + "startTransition".length
    : -1;
const startTransitionCloseIdx =
  startTransitionOpenIdx >= 0 ? findMatchingCloseParen(HANDLER, startTransitionOpenIdx) : -1;

describe("A15: Live Feed Auto Grade dispatch runs inside a transition", () => {
  it("A1: startTransition is a non-type React import, or useTransition is used", () => {
    const importMatches = [...gtSource.matchAll(/import\s+(?!type\b)\{([\s\S]*?)\}\s*from\s*"react";/g)];
    const allSpecifiers = importMatches.map((m) => m[1]).join(",");
    const hasStartTransitionImport = allSpecifiers.includes("startTransition");
    const hasUseTransition = /useTransition\s*\(/.test(gtSource);
    expect(hasStartTransitionImport || hasUseTransition).toBe(true);
  });

  it("A2: startTransition( appears exactly once in the handler, and formAction( is called exactly once, strictly inside it", () => {
    expect(startTransitionMatches.length).toBe(1);
    expect(startTransitionOpenIdx).toBeGreaterThanOrEqual(0);
    expect(startTransitionCloseIdx).toBeGreaterThan(startTransitionOpenIdx);

    const formActionMatches = [...HANDLER.matchAll(/formAction\(/g)];
    expect(formActionMatches.length).toBe(1);
    const formActionIdx = formActionMatches[0].index!;
    expect(formActionIdx).toBeGreaterThan(startTransitionOpenIdx);
    expect(formActionIdx).toBeLessThan(startTransitionCloseIdx);
  });

  it("A3: setGradingTarget( is inside the transition, setCanvasUrl( stays outside it", () => {
    const setGradingTargetMatches = [...HANDLER.matchAll(/setGradingTarget\(/g)];
    expect(setGradingTargetMatches.length).toBe(1);
    const setGradingTargetIdx = setGradingTargetMatches[0].index!;
    expect(setGradingTargetIdx).toBeGreaterThan(startTransitionOpenIdx);
    expect(setGradingTargetIdx).toBeLessThan(startTransitionCloseIdx);

    const setCanvasUrlMatches = [...HANDLER.matchAll(/setCanvasUrl\(/g)];
    expect(setCanvasUrlMatches.length).toBe(1);
    const setCanvasUrlIdx = setCanvasUrlMatches[0].index!;
    const isOutsideTxn = setCanvasUrlIdx < startTransitionOpenIdx || setCanvasUrlIdx > startTransitionCloseIdx;
    expect(isOutsideTxn).toBe(true);
  });

  it("A4: the transition body never smuggles the dispatch onto a later tick", () => {
    const txn = HANDLER.slice(startTransitionOpenIdx, startTransitionCloseIdx + 1);
    for (const forbidden of ["setTimeout", "setInterval", "queueMicrotask", "requestAnimationFrame", ".then(", "await ", "async"]) {
      expect(txn).not.toContain(forbidden);
    }
  });

  it("A5: formAction( is called exactly once in the whole file, and it is the transition's call", () => {
    const wholeFileMatches = [...gtSource.matchAll(/formAction\(/g)];
    expect(wholeFileMatches.length).toBe(1);
  });

  it("A6: the loading-state region is gated off while Live Feed owns its own status region", () => {
    const literal = 'source !== "livefeed"';
    // `literal` is load-bearing: every occurrence is found from it, so the
    // assertion cannot drift from the string it claims to be checking.
    const offsets: number[] = [];
    for (let at = gtSource.indexOf(literal); at !== -1; at = gtSource.indexOf(literal, at + 1)) {
      offsets.push(at);
    }
    expect(offsets.length).toBeGreaterThan(0);
    const satisfied = offsets.some((at) => {
      const span = innermostEnclosingBraceSpan(gtSource, at);
      if (!span) return false;
      const spanText = gtSource.slice(span.start, span.end + 1);
      // The guard must be a LIVE conjunction. Presence of the literal is not
      // enough: `(source !== "livefeed" || true) && pending &&` contains it and
      // gates nothing. A disjunction anywhere in the guard span neutralises it.
      const guardIsConjunctive = /source !== "livefeed"\s*&&/.test(spanText) || /&&\s*source !== "livefeed"/.test(spanText);
      return (
        guardIsConjunctive &&
        !spanText.includes("||") &&
        spanText.includes("styles.loadingState") &&
        spanText.includes("pending") &&
        !spanText.includes("const handleAutoGrade")
      );
    });
    expect(satisfied).toBe(true);
  });

  it("A7: disabled={pending} gates all three Auto Grade entry points, and only those three", () => {
    const anchors = ["onClick={startSequence}", "onClick={() => onAutoGrade(row)}", "e.stopPropagation();"];
    for (const anchor of anchors) {
      const idx = lfSource.indexOf(anchor);
      expect(idx).toBeGreaterThanOrEqual(0);
      const tag = openingTagAround(lfSource, idx);
      expect(tag).toContain("disabled={pending}");
    }
    const countMatches = [...lfSource.matchAll(/disabled=\{pending\}/g)];
    expect(countMatches.length).toBe(3);
  });

  it("A8: activeRun is unrenderable unless the row, the selection and pending all agree", () => {
    // Anchor on the full declarator: "const activeRun" alone also matches a
    // decoy like `const activeRunIfSafe = ...` declared above it.
    const idx = lfSource.indexOf("const activeRun = ");
    expect(idx).toBeGreaterThanOrEqual(0);
    const semiIdx = lfSource.indexOf(";", idx);
    expect(semiIdx).toBeGreaterThan(idx);
    const statement = lfSource.slice(idx, semiIdx + 1).replace(/\s+/g, " ").trim();
    // Match the WHOLE expression. Term-by-term containment passes a semantic
    // inversion: `gradingRowKey === selectedKey || !pending ? run : null`
    // contains every term and renders another row's run.
    expect(statement).toBe(
      "const activeRun = gradingRowKey && gradingRowKey === selectedKey && !pending ? run : null;"
    );
  });

  it("A9: the detail-pane Auto Grade label is row-scoped, not the global pending flag", () => {
    // Pin the fact, not the wording: the un-row-scoped form must be absent, and
    // the label must be bound to the row-scoped flag. Its true arm is in fact
    // statically unreachable (the enclosing chain only reaches this branch when
    // isGradingSelected is false), so do not pin the dead ternary's spelling -
    // a later cleanup to a bare "Auto Grade" must not go red for that alone.
    expect(/\{pending \?\s*"Grading/.test(lfSource)).toBe(false);
    expect(lfSource).toContain("isGradingSelected ?");
  });

  it("A10: the in-detail grading status region survives, gated on the row-scoped flag", () => {
    // Ruling 4: this region is the mask over the pending-true stale-run state.
    // An earlier revision of the scoping required DELETING it, which would have
    // unmasked the very state Ruling 3 exists to prevent - with every gate
    // green. Nothing else in this file pins it, so deleting the arm passed.
    const idx = lfSource.indexOf("isGradingSelected ?");
    expect(idx).toBeGreaterThanOrEqual(0);
    // Bounded span: the ternary's consequent, not an open-ended walk.
    const span = lfSource.slice(idx, idx + 400);
    expect(span).toContain("styles.loadingState");
  });
});
