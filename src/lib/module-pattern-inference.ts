// Chunk D ("carry one module's pattern forward"), primitive G2:
// docs/carry-module-pattern-forward-acceptance-criteria.md, D1-D4b.
//
// Turns a module item's title into a re-renderable NAME PATTERN, anchored to
// the module it came from, and renders that pattern back out for a different
// target module number. This is the missing half of the three name-pattern
// schemes already in this codebase (fillNamePattern's {module}/{n},
// expandModuleNameTemplate's {x} zero-padded, composeModuleTitle's
// "Module NN:") - all three render a pattern FORWARD; nothing runs one
// backward from an existing title. This file adds that, and only that.
//
// D1: there are already FIVE module-number extractors in this repo
// (fillNamePattern's inline regex, extractModuleNumber, parseWeekToken,
// renumberWeekLabel, expandModuleNameTemplate's {x} expansion). This file
// adds NO sixth. The one thing it needs - "what number is this module" - is
// extractModuleNumber, imported and reused as-is.
//
// D2 (the scheme, and why): the pattern is scheme A's unpadded `{n}` PLUS a
// recorded digit WIDTH taken from the source title's own first tokenised
// run. Measured against real fixture titles (see the round-trip test table
// in module-pattern-inference.test.ts): scheme A + width round-trips 31/31,
// including "Module 007 Lab" (width 3) and "Module 3: Week 3 Reading" (two
// tokens, one recorded width). The zero-padded alternative (pad every
// rendered number to a fixed width of 2, `expandModuleNameTemplate`'s own
// scheme) fails 20/29 on the same titles - "Week 5 Homework" would re-render
// as "Week 05 Homework", and "Module 007 Lab" would LOSE A DIGIT ("Module 07
// Lab"). A pattern that cannot round-trip against its own source cannot be
// used as an idempotency key (AC8), so the width has to travel with the
// pattern rather than being imposed as a fixed convention.
//
// D3 (the disambiguation rule): tokenise a digit run in the item title IF AND
// ONLY IF its numeric value equals extractModuleNumber(sourceModuleName).
// Every other digit run in the title is left as literal text. This is value
// equality against a KNOWN ANCHOR (the source module's own number), not a
// vocabulary guess about which words mean "this is the module number" - which
// is exactly the question that made the two pre-existing extractors disagree
// with each other in the first place. The match is GLOBAL: every digit run in
// the title is checked, not just the first, so "Module 3: Week 3 Reading" in
// Module 3 tokenises both occurrences of "3", not only the first.
//
// D3b (the false positives are real, and are NOT this file's problem to
// fix): a digit run that COINCIDENTALLY equals the module number is
// tokenised even when it means something else entirely - "Chapter 12
// Discussion" in Module 12 renders "Chapter 03 Discussion" in Module 3. See
// the "KNOWN FALSE POSITIVE" tests below, which pin this as CURRENT,
// documented behaviour. No regex can distinguish "12 because this is module
// 12" from "12 because the book has twelve chapters" from the title text
// alone - the AC's own mitigation is the caller's proposal step (AC5),
// which shows the resolved title before anything is written. Do not "fix"
// this here with a smarter pattern; the AC is explicit that the proposal is
// the fix.
//
// D4 / D4b (zero tokens is BLOCKED, never a pattern with no tokens): a title
// with no tokenisable digit run cannot be represented as "a pattern that
// renders the same everywhere" - if it were, a caller re-rendering it for N
// different target modules would produce N items with the IDENTICAL name,
// which is indistinguishable from success until a second run's idempotency
// check silently no-ops every one of them. So this file returns a
// discriminated union: a successful inference always carries at least one
// token (enforced by construction - there is no code path that returns
// `kind: "pattern"` with tokenCount 0), and every other case returns
// `kind: "blocked"` with a reasonCode a caller can branch on without
// string-matching prose. Three blocked reasons, matching the AC's own
// classes:
//   - "source-module-unnumbered": extractModuleNumber(sourceModuleName) is
//     null. Covers D4b's class 1 (no number in the module name at all) AND
//     class 3 (the module uses vocabulary extractModuleNumber does not
//     recognise, e.g. "Unit 5" - extractModuleNumber("Unit 5") is null even
//     though a human reading "Unit 5"/"Week 5 Homework" sees the 5 in both).
//   - "no-token-match": the module IS numbered, but the item title has no
//     digit run whose value equals that number - covers a title with no
//     digits at all, a title whose digits mean something unrelated ("Essay
//     1" in Module 3), and D4b's class 2 (offset numbering: Module 1 is
//     orientation, its items say "Week 2").
//   - "authored-pattern-missing-token": only from parseAuthoredItemPattern
//     below, for the instructor-typed alternative input.
//
// D4's one affordance - a blocked row's inline title-pattern field, typed
// once by the instructor - is what parseAuthoredItemPattern serves. It is
// valid exactly when it contains `{n}`, and requires no source module number
// at all (the instructor is authoring the pattern directly, not having one
// inferred), which satisfies AC8 (a title that is code-derived, i.e.
// deterministic per target, never model-authored) the same way an inferred
// pattern does.
//
// Pure module: no I/O, no Date, no React, no Canvas call. Importable from
// both client and server code.

import { extractModuleNumber } from "./workflows/module-value";

/** Every digit run in a title, scanned left to right. Shared by both the
 * source-side tokeniser and (indirectly, via its counterpart in the AC's
 * width story) nothing else - this is the ONLY place this file matches
 * digits, so there is exactly one definition of "what counts as a number"
 * to keep in sync with the round-trip tests. */
const DIGIT_RUN = /\d+/g;

/** The rendered token itself. Always `{n}`, scheme A - see D2 above for why
 * this file does not invent a fourth scheme or reuse `{x}`. */
const TOKEN = "{n}";
const TOKEN_PATTERN = /\{n\}/g;

/** A successfully inferred (or instructor-authored) pattern. `tokenCount` is
 * always >= 1 - there is no constructor path in this file that produces this
 * shape with zero tokens, which is what makes "blocked" and "a pattern with
 * no tokens" impossible to confuse (D4). `width` is the digit width to pad
 * every rendered token to (see renderItemPattern) - 0 for an
 * instructor-authored pattern, since there is no source digit run to measure
 * a width from and natural (unpadded) rendering is the only sane default. */
export interface RenderableItemPattern {
  kind: "pattern";
  /** The title with every tokenised digit run replaced by literal `{n}`. */
  template: string;
  /** How many `{n}` tokens `template` contains. Always >= 1. */
  tokenCount: number;
  /** Digits to zero-pad every rendered token to (padStart only ever ADDS
   * digits, never truncates - a target number wider than this never loses a
   * digit). 0 means "no padding, render the number as-is". */
  width: number;
}

/** Why a title could not be turned into (or accepted as) a pattern. See the
 * file header for what each code covers - branch on `reasonCode`, not on
 * `message`, which is prose for display only and not a stable contract. */
export type BlockedReasonCode =
  | "source-module-unnumbered"
  | "no-token-match"
  | "authored-pattern-missing-token";

export interface BlockedItemPattern {
  kind: "blocked";
  reasonCode: BlockedReasonCode;
  /** Human-readable explanation for display in the proposal (AC5). Not a
   * stable contract - tests pin `reasonCode`, never this string. */
  message: string;
}

export type ItemPatternResult = RenderableItemPattern | BlockedItemPattern;

/**
 * Infer a re-renderable pattern from one module item's title, anchored to
 * the module it lives in.
 *
 * Rule (D3): extract the source module's own number via
 * extractModuleNumber(sourceModuleName). If that is null, the whole
 * inference is blocked ("source-module-unnumbered") - there is no anchor to
 * disambiguate against. Otherwise, scan every digit run in `itemTitle`
 * (global, not first-run-only) and tokenise exactly the runs whose numeric
 * value equals the module's number; every other digit run is left literal.
 * If no run matches, the result is blocked ("no-token-match") rather than a
 * pattern with zero tokens (D4). Otherwise the width of the FIRST tokenised
 * run (its original string length, so a zero-padded run like "007" records
 * width 3) travels with the pattern and is used to render every token in it
 * - this file does not attempt to record a separate width per token; see the
 * file header's D2 note on why one recorded width is the documented design,
 * not an oversight.
 */
export function inferItemPattern(sourceModuleName: string, itemTitle: string): ItemPatternResult {
  const moduleNumber = extractModuleNumber(sourceModuleName);
  if (moduleNumber === null) {
    return {
      kind: "blocked",
      reasonCode: "source-module-unnumbered",
      message: `The source module's name ("${sourceModuleName}") carries no recognizable module or week number, so no item in it can be carried forward.`,
    };
  }

  let tokenCount = 0;
  let width: number | null = null;
  const template = itemTitle.replace(DIGIT_RUN, (run) => {
    if (Number(run) !== moduleNumber) return run;
    if (width === null) width = run.length;
    tokenCount += 1;
    return TOKEN;
  });

  if (tokenCount === 0) {
    return {
      kind: "blocked",
      reasonCode: "no-token-match",
      message: `"${itemTitle}" has no digit run matching module ${moduleNumber}, so it cannot be carried forward without instructor input.`,
    };
  }

  return { kind: "pattern", template, tokenCount, width: width ?? 1 };
}

/**
 * Accept an instructor-typed pattern string as an alternative to inference -
 * D4's affordance for a blocked row. Valid exactly when it contains `{n}`
 * (at least once; an instructor is free to use the token more than once,
 * exactly as an inferred multi-token pattern can). No module number is
 * needed or read here: the instructor is authoring the substitution
 * directly, not having one inferred from a source title, so there is no
 * digit run to measure a width from - width is 0 (render the target number
 * with no padding).
 */
export function parseAuthoredItemPattern(patternText: string): ItemPatternResult {
  const template = patternText.trim();
  const tokenCount = (template.match(TOKEN_PATTERN) ?? []).length;
  if (tokenCount === 0) {
    return {
      kind: "blocked",
      reasonCode: "authored-pattern-missing-token",
      message: `An authored pattern must contain "{n}" at least once; "${patternText}" does not.`,
    };
  }
  return { kind: "pattern", template, tokenCount, width: 0 };
}

/**
 * Render a successfully inferred (or authored) pattern for one target
 * module number. Takes the narrowed `RenderableItemPattern` shape, not the
 * full `ItemPatternResult` union - the caller must discriminate on `kind`
 * before rendering, which is what makes "render a blocked result" a
 * compile-time impossibility rather than a runtime check this file would
 * otherwise have to remember to make.
 *
 * Every `{n}` in `pattern.template` is replaced with `targetModuleNumber`,
 * zero-padded to `pattern.width` (padStart only ever adds digits, so a
 * target number wider than the recorded width is rendered in full, never
 * truncated - e.g. width 1, target 100 renders "100", not "1").
 */
export function renderItemPattern(pattern: RenderableItemPattern, targetModuleNumber: number): string {
  const rendered = String(targetModuleNumber).padStart(pattern.width, "0");
  return pattern.template.replace(TOKEN_PATTERN, rendered);
}
