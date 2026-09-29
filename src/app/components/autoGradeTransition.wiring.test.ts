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
// A42: the local stripComments below was a regex pair blind to a `/*` opened
// inside a string literal (e.g. accept="image/*") whose matching `*/` lies
// outside any string, later in the file - it deletes everything in between,
// including real code. Converted to import the string-aware tokenizer
// already proven for this exact defect (RULING 79,
// src/tools/strip-comments-agreement.structure.test.ts R1). This file no
// longer defines its own stripComments, so it moved from SAFE_FILES to
// EXCLUSIONS in that probe in this same change.
import { stripComments } from "@/app/components/ui/modalAdoptionSourceScan";

const GRADING_TAB_PATH = join(process.cwd(), "src/app/components/GradingTab.tsx");
const LIVE_FEED_PATH = join(process.cwd(), "src/app/components/LiveFeedPanel.tsx");

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

  it("A2 (A39 incremental-fill W5, F11): startTransition( appears exactly once in the handler, and beginWholeRun( - the ONE door (architecture 5.4) - is called exactly once, strictly inside it", () => {
    expect(startTransitionMatches.length).toBe(1);
    expect(startTransitionOpenIdx).toBeGreaterThanOrEqual(0);
    expect(startTransitionCloseIdx).toBeGreaterThan(startTransitionOpenIdx);

    // WATCHED: written first against today's file, this goes RED on the
    // presence clause below while A3's setGradingTarget clause (below) stays
    // GREEN - proving the handler span is found rather than the whole
    // assertion failing for want of an anchor.
    const beginWholeRunMatches = [...HANDLER.matchAll(/beginWholeRun\(/g)];
    expect(beginWholeRunMatches.length).toBe(1);
    const beginWholeRunIdx = beginWholeRunMatches[0].index!;
    expect(beginWholeRunIdx).toBeGreaterThan(startTransitionOpenIdx);
    expect(beginWholeRunIdx).toBeLessThan(startTransitionCloseIdx);
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

  it("A5 (A39 incremental-fill W5, F10): every formAction( occurrence lies strictly inside a startTransition( paren span, and there is exactly ONE (architecture 5.4 - beginWholeRun is now the ONE door both whole-run routes share, so handleAutoGrade no longer calls formAction directly)", () => {
    // WATCHED: change this to 1 and run it against TODAY's unchanged file -
    // it must go RED at 2, proving the count is the thing discriminating.
    const wholeFileMatches = [...gtSource.matchAll(/formAction\(/g)];
    expect(wholeFileMatches.length).toBe(1);
    const allTransitionMatches = [...gtSource.matchAll(/startTransition\(/g)];
    const spans = allTransitionMatches.map((m) => {
      const open = m.index! + "startTransition".length;
      return { open, close: findMatchingCloseParen(gtSource, open) };
    });
    for (const m of wholeFileMatches) {
      const idx = m.index!;
      const inside = spans.some((s) => idx > s.open && idx < s.close);
      expect(inside).toBe(true);
    }
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

// A39 wave 5 (docs/a39-waves.md 8.5): the credential has a route, and the
// rubric-provenance receipt reaches the Live Feed surface too.
describe("W5: the credential CTA is reachable and conditional, and RubricProvenance mounts on Live Feed", () => {
  it("W5-1: both surfaces detect the credential-required error via the shared predicate, never a copied literal", () => {
    for (const src of [gtSource, lfSource]) {
      expect(src).toContain("isCanvasCredentialRequiredError");
      // The literal CANVAS_CREDENTIAL_REQUIRED_MESSAGE text must never appear
      // hand-copied in a caller - that is exactly the drift canvas-credential-
      // cta.test.ts's W5-1 block watches for.
      expect(src).not.toContain("Connect your Canvas account for this institution in Settings.");
    }
  });

  it("W5-2 (reachability): both surfaces render the shared CTA link (href + label), imported not re-typed", () => {
    for (const src of [gtSource, lfSource]) {
      expect(src).toContain('from "@/lib/canvas-credential-cta"');
      expect(src).toContain("CANVAS_CREDENTIAL_CTA_HREF");
      expect(src).toContain("CANVAS_CREDENTIAL_CTA_LABEL");
      // The route itself is asserted once, at its source of truth, in
      // canvas-credential-cta.test.ts - not re-typed as a literal here.
      expect(src).not.toContain("/account/integrations");
    }
  });

  it("W5 (no added step): the CTA render is gated on isCanvasCredentialRequiredError(...), not unconditional", () => {
    for (const src of [gtSource, lfSource]) {
      // The predicate call must sit directly inside a `{cond && (` guard -
      // an unconditional mount (e.g. assigned to a variable and rendered
      // regardless) would not match this shape.
      expect(/\{\s*isCanvasCredentialRequiredError\([^)]*\)\s*&&/.test(src)).toBe(true);
    }
  });

  it("W5-3: LiveFeedPanel mounts RubricProvenance before its GradingResults mount, same as GradingTab", () => {
    const rpIdx = lfSource.indexOf("<RubricProvenance");
    // `<GradingResults[\s>]` - not `.indexOf("<GradingResults")`, which also
    // matches the earlier, unrelated `useRef<GradingResultsHandle>` type
    // argument and would make this assertion pass by finding the wrong tag.
    const grMatch = /<GradingResults[\s>]/.exec(lfSource);
    expect(rpIdx).toBeGreaterThanOrEqual(0);
    expect(grMatch).not.toBeNull();
    expect(rpIdx).toBeLessThan(grMatch!.index);
  });

  it("canary: an absent tag reports -1, proving indexOf is not vacuously true (W5-3's own instrument)", () => {
    expect(lfSource.indexOf("<RubricProvenanceZZZ")).toBe(-1);
  });
});

// A39 wave 4c (docs/a39-waves.md 8.4.3, step S5): the incremental seam's own
// two pinned pieces of GradingTab.tsx's source text.
describe("W4-9b: the form's action= attribute is gone; onSubmit is the only dispatch path", () => {
  it("the opening <form ...> tag contains onSubmit={ and no action=, and preventDefault() is present in the file", () => {
    const formTagStart = gtSource.indexOf("<form");
    expect(formTagStart).toBeGreaterThanOrEqual(0);
    let depth = 0;
    let tagEnd = -1;
    for (let i = formTagStart; i < gtSource.length; i++) {
      if (gtSource[i] === "{") depth++;
      else if (gtSource[i] === "}") depth--;
      else if (gtSource[i] === ">" && depth === 0) {
        tagEnd = i;
        break;
      }
    }
    expect(tagEnd).toBeGreaterThan(formTagStart);
    const tagSpan = gtSource.slice(formTagStart, tagEnd + 1);
    expect(tagSpan).toContain("onSubmit={");
    expect(tagSpan).not.toContain("action=");
    expect(gtSource).toContain("preventDefault()");
  });

  it("WATCHED: today's <form ...> tag (before this wave) DOES contain action= - proving this check can fail", () => {
    // Reproduces the pre-wave-4c tag exactly (action={formAction} was the
    // only dispatch path before startReview existed).
    const before = '<form className={styles.form} action={formAction} onSubmit={() => {}}>';
    expect(before).toContain("action=");
  });
});

describe("W4-8: the stop control is not buried under its own results", () => {
  it("'Stop grading' and the progress region both precede the first <GradingResults mount", () => {
    const stopIdx = gtSource.indexOf("Stop grading");
    const progressIdx = gtSource.indexOf("incrementalRunning &&");
    const grMatch = /<GradingResults[\s>]/.exec(gtSource);
    expect(stopIdx).toBeGreaterThanOrEqual(0);
    expect(progressIdx).toBeGreaterThanOrEqual(0);
    expect(grMatch).not.toBeNull();
    expect(stopIdx).toBeLessThan(grMatch!.index);
    expect(progressIdx).toBeLessThan(grMatch!.index);
  });

  it("RED if the stop literal is spelled anything other than 'Stop grading'", () => {
    expect(gtSource).not.toContain("Cancel grading");
    expect(gtSource).toContain("Stop grading");
  });
});

// A39 W3 (docs/a39-fill-waves.md, F9 clause 2; RULING 131,
// docs/a39-incremental-fill-architecture.md 5.7): GradingResults.tsx's reset
// guard now decides "a new run arrived" from the run IDENTITY (runResetKey),
// not the run REFERENCE. A third source reader, comments stripped like the
// two above it, so a comment cannot satisfy or defeat either clause.
const GRADING_RESULTS_PATH = join(process.cwd(), "src/app/components/GradingResults.tsx");
const grSource = stripComments(readFileSync(GRADING_RESULTS_PATH, "utf8"));

describe("F9 clause 2: GradingResults' reset guard uses runResetKey, not a bare run reference", () => {
  it("runResetKey( appears exactly once, and the file contains no run !== prevRun", () => {
    const runResetKeyMatches = [...grSource.matchAll(/runResetKey\(/g)];
    expect(runResetKeyMatches.length).toBe(1);
    expect(grSource).not.toContain("run !== prevRun");
  });
});

// A39 incremental-fill W5 (docs/a39-fill-waves.md; docs/a39-incremental-fill-
// architecture.md 5.2, 5.6, 7.2): F5, F6, F13, F25 - "one machine, one mount,
// one door" and the terminal sentence's own region.
import { readdirSync, statSync } from "fs";

const GRADING_RESULTS_MATCH = /<GradingResults(?=[\s/>])/g;

function walkTsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...walkTsxFiles(full));
    } else if (name.endsWith(".tsx") && !name.includes(".test.")) {
      out.push(full);
    }
  }
  return out;
}

describe("F5: GradingTab.tsx has exactly one <GradingResults mount, not inside a .map(", () => {
  it("the lookahead-anchored match count is 1 (a bare \\b would also match <GradingResultsHandle>)", () => {
    const matches = [...gtSource.matchAll(GRADING_RESULTS_MATCH)];
    expect(matches.length).toBe(1);
  });

  it("its innermost enclosing brace span contains no .map(", () => {
    const m = /<GradingResults(?=[\s/>])/.exec(gtSource);
    expect(m).not.toBeNull();
    const span = innermostEnclosingBraceSpan(gtSource, m!.index);
    expect(span).not.toBeNull();
    const spanText = gtSource.slice(span!.start, span!.end + 1);
    expect(spanText).not.toContain(".map(");
  });
});

describe("F6 (docs/a39-incremental-fill-architecture.md 5.6): the edits-surface exclusivity GUARD, at REPO scope", () => {
  it("F6a: the set of src/app/**/*.tsx files containing editsSurface=\"canvas\" is exactly GradingTab.tsx and LiveFeedPanel.tsx", () => {
    const root = join(process.cwd(), "src", "app");
    const matches = walkTsxFiles(root)
      .filter((f) => stripComments(readFileSync(f, "utf8")).includes('editsSurface="canvas"'))
      .map((f) => f.split(process.cwd())[1].replace(/\\/g, "/").replace(/^\//, ""));
    expect(matches.sort()).toEqual(["src/app/components/GradingTab.tsx", "src/app/components/LiveFeedPanel.tsx"]);
  });

  it("F6b: the one <GradingResults mount's guard text is conjunctive on source !== \"livefeed\", with no || and nothing before the tag", () => {
    const m = /<GradingResults(?=[\s/>])/.exec(gtSource);
    expect(m).not.toBeNull();
    const span = innermostEnclosingBraceSpan(gtSource, m!.index);
    expect(span).not.toBeNull();
    const spanText = gtSource.slice(span!.start, span!.end + 1);
    const firstLt = spanText.indexOf("<");
    const guardText = spanText.slice(0, firstLt);
    const guardIsConjunctive =
      /source !== "livefeed"\s*&&/.test(guardText) || /&&\s*source !== "livefeed"/.test(guardText);
    expect(guardIsConjunctive).toBe(true);
    expect(guardText).not.toContain("||");
  });

  it("F6c: LiveFeedPanel is reached only from the source === \"livefeed\" ternary", () => {
    const lfMatches = [...gtSource.matchAll(/<LiveFeedPanel(?=[\s/>])/g)];
    expect(lfMatches.length).toBe(1);
    const lfIdx = lfMatches[0].index!;
    const lastTernaryIdx = gtSource.lastIndexOf('source === "livefeed"', lfIdx);
    expect(lastTernaryIdx).toBeGreaterThanOrEqual(0);
    const between = gtSource.slice(lastTernaryIdx, lfIdx);
    expect(between).not.toContain("{");
  });
});

describe("F13 (architecture 7.2): the terminal sentence's OWN region, gated on the sentence existing, not on a row existing", () => {
  it("terminalLine's innermost enclosing brace span contains no results.length and no <GradingResults, and precedes the one mount", () => {
    const idx = gtSource.indexOf("terminalLine &&");
    expect(idx).toBeGreaterThanOrEqual(0);
    const span = innermostEnclosingBraceSpan(gtSource, idx);
    expect(span).not.toBeNull();
    const spanText = gtSource.slice(span!.start, span!.end + 1);
    expect(spanText).not.toContain("results.length");
    expect(spanText).not.toContain("<GradingResults");

    const grMatch = /<GradingResults(?=[\s/>])/.exec(gtSource);
    expect(grMatch).not.toBeNull();
    expect(span!.start).toBeLessThan(grMatch!.index);
  });
});

describe("F25 (architecture 10, M6): the scroll effect fires at most once per run, not once per arrival", () => {
  it("the scrollIntoView effect's dependency array contains runResetKey(, not a bare displayRun or state.run", () => {
    const idx = gtSource.indexOf("scrollIntoView(");
    expect(idx).toBeGreaterThanOrEqual(0);
    const depsStart = gtSource.indexOf("}, [", idx);
    expect(depsStart).toBeGreaterThan(idx);
    const depsEnd = gtSource.indexOf(")", depsStart);
    const deps = gtSource.slice(depsStart, depsEnd + 1);
    expect(deps).toContain("runResetKey(");
    expect(deps).not.toMatch(/\[\s*displayRun\s*\]/);
    expect(deps).not.toMatch(/\[\s*run\s*\]/);
    expect(deps).not.toMatch(/\[\s*state\.run\s*\]/);
  });
});

describe("AC-1 (RES-FILL-13): the scroll effect's dependency gained a first-arrival signal", () => {
  it("the dependency array's WIDER slice (through the array's closing ]) differs from the frozen no-op literal, keeps runResetKey(, references a first-arrival signal, and is not a bare [displayRun]", () => {
    // Wider than F25's slice on purpose: F25's depsEnd stops at the FIRST ")"
    // (the one that closes runResetKey(...)), which truncates before any
    // appended term. This slice reaches the array's closing "]" so it can see
    // whatever was appended after runResetKey(runKey, displayRun).
    const FROZEN_TODAY = "[runResetKey(runKey, displayRun)]";
    const idxScroll = gtSource.indexOf("scrollIntoView(");
    const arrOpen = gtSource.indexOf("}, [", idxScroll);
    const arrClose = gtSource.indexOf("]", arrOpen);

    expect(idxScroll).toBeGreaterThanOrEqual(0);
    expect(arrOpen).toBeGreaterThan(idxScroll);
    expect(arrClose).toBeGreaterThan(arrOpen);

    const depArr = gtSource.slice(arrOpen + 3, arrClose + 1);
    expect(depArr.length).toBeLessThan(200);

    expect(depArr).not.toBe(FROZEN_TODAY);
    expect(depArr).toContain("runResetKey(");
    expect(depArr).toMatch(/incrementalDone|incrementalRun/);
    expect(depArr).not.toMatch(/\[\s*displayRun\s*\]/);
  });
});
