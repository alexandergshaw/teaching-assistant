// Wiring guard for the visible, WCAG-compliant keyboard focus indicator
// described in docs/focus-ring-acceptance-criteria.md (backlog group A,
// docs/REGRESSION.md entry 256 is the measured baseline this file checks
// against).
//
// vitest here is node-env and collects only src/**/*.test.ts, so no .tsx is
// ever rendered and no CSS is ever computed by a real browser - nothing in
// this file can measure a painted pixel. What it CAN do is read globals.css,
// page.module.css, TopBar.module.css, login.module.css, security.module.css
// and TasksGrid.module.css as TEXT, and compute WCAG contrast itself. That
// idiom (readFileSync + small hand-rolled CSS-body/selector parsers) is
// copied from taskNoteIndicator.wiring.test.ts in this same repo - see that
// file's own header for why a text scan of CSS is trustworthy here (comment
// stripping, @media exclusion, last-declaration-wins, exact-selector
// matching) and its "canaries: the CSS readers actually discriminate" block,
// which already proves those primitives work. This file reuses the same
// shape rather than inventing a new one, and adds a WCAG contrast oracle on
// top for the parts of the AC that are about colour, not geometry.
//
// THE TOKEN MODEL this file asserts against (post-review revision): the ring
// is a THREE-token design, not a single solid colour.
//   --focus-ring-default : theme-aware, resolved solid hex (light/dark differ)
//   --focus-ring-on-navy : one solid hex, defined ONLY in :root (the navy
//                           chrome is navy in both themes, so it needs only
//                           one value)
//   --focus-ring-color   : the token everything actually paints with;
//                           defaults to var(--focus-ring-default), and navy
//                           containers override it locally to
//                           var(--focus-ring-on-navy) - which then LEAKS by
//                           inheritance into any light-surfaced descendant
//                           unless that descendant resets it back.
// Group A therefore targets --focus-ring-default directly for the solid/
// contrast checks (that is the token that actually resolves to a hex), and
// separately checks that --focus-ring-color forwards to it via var().
//
// This test was originally written before the fix existed, so most of it was
// expected to be RED at HEAD. Adversarial review of that draft found it was
// UNDER-CONSTRAINED - it would have passed a design shipping four real
// defects (incomplete surface lists, an untested AC4 value claim, the wrong
// backdrop for C2's contrast check, and no coverage at all for the reset-
// on-nested-light-surface bug class) - plus four meta-quality problems in the
// test itself (a tautological slice check, an over-specified CSS-in-JS
// assertion, a duplicated no-op canary, and comment-blind block parsing).
// This revision fixes all eight; see each group's comments for which defect
// it now catches.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const GLOBALS_PATH = join(process.cwd(), "src/app/globals.css");
const globalsCss = readFileSync(GLOBALS_PATH, "utf8");
const PAGE_CSS_PATH = join(process.cwd(), "src/app/page.module.css");
const pageCss = readFileSync(PAGE_CSS_PATH, "utf8");
const TOPBAR_CSS_PATH = join(process.cwd(), "src/app/components/TopBar.module.css");
const topBarCss = readFileSync(TOPBAR_CSS_PATH, "utf8");
const LOGIN_CSS_PATH = join(process.cwd(), "src/app/login/login.module.css");
const loginCss = readFileSync(LOGIN_CSS_PATH, "utf8");
const SECURITY_CSS_PATH = join(process.cwd(), "src/app/account/security/security.module.css");
const securityCss = readFileSync(SECURITY_CSS_PATH, "utf8");
const TASKS_GRID_CSS_PATH = join(process.cwd(), "src/app/components/tasks/TasksGrid.module.css");
const tasksGridCss = readFileSync(TASKS_GRID_CSS_PATH, "utf8");
const THEME_PATH = join(process.cwd(), "src/app/theme.ts");

// -----------------------------------------------------------------------
// CSS text-reading primitives. Copied in shape from
// taskNoteIndicator.wiring.test.ts (same directory tree, src/app/components/
// tasks/) rather than reinvented: strip comments, drop conditional (@media /
// @supports) rule bodies, match a rule by its EXACT selector (one entry of a
// possibly comma-separated list), and read the LAST declaration of a
// property (the one the cascade actually applies).

/** Strips CSS block comments, so a selector or property NAMED in an
 * explanatory comment (this repo's CSS narrates itself constantly) can never
 * be mistaken for a real declaration. */
function stripCssComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * Removes every at-rule BLOCK (`@media`, `@supports`, ...) together with its
 * contents, leaving only rules that apply unconditionally. Without this, a
 * declaration parked inside `@media print` would read exactly like a live
 * one - the exact failure mode taskNoteIndicator.wiring.test.ts's own
 * canaries pin.
 */
function unconditionalRules(text: string): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const at = text.indexOf("@", i);
    if (at === -1) {
      out += text.slice(i);
      break;
    }
    const brace = text.indexOf("{", at);
    const semi = text.indexOf(";", at);
    if (brace === -1 || (semi !== -1 && semi < brace)) {
      const end = semi === -1 ? text.length : semi + 1;
      out += text.slice(i, end);
      i = end;
      continue;
    }
    out += text.slice(i, at);
    let depth = 0;
    let j = brace;
    for (; j < text.length; j++) {
      if (text[j] === "{") depth += 1;
      else if (text[j] === "}") {
        depth -= 1;
        if (depth === 0) {
          j += 1;
          break;
        }
      }
    }
    i = j;
  }
  return out;
}

function normalizeSelector(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

/** Trims and collapses internal whitespace runs to a single space. Used to
 * compare CSS VALUE expressions (e.g. two spellings of the same color-mix()
 * call) without the comparison being sensitive to incidental formatting -
 * distinct name from normalizeSelector even though the body is identical, so
 * call sites read as "comparing a value" vs "matching a selector". */
function normalizeWhitespace(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

/**
 * The declaration bodies of every unconditional rule whose selector list
 * contains EXACTLY `selector` (as one comma-separated entry, whitespace-
 * normalized), joined in FILE ORDER, or "" when no such rule exists.
 */
function ruleBody(text: string, selector: string): string {
  const want = normalizeSelector(selector);
  const scope = unconditionalRules(stripCssComments(text));
  const bodies: string[] = [];
  const blocks = /([^{}]+)\{([^{}]*)\}/g;
  let match = blocks.exec(scope);
  while (match !== null) {
    if (match[1].split(",").map(normalizeSelector).includes(want)) bodies.push(match[2]);
    match = blocks.exec(scope);
  }
  return bodies.join("\n");
}

/** The WINNING value of `prop` in a declaration body (the last one
 * declared), or "" when unset. Longhands only: `declaration(body, "--accent")`
 * never matches `--accent-wash` or `--accent-ink`, because the pattern
 * requires `${prop}\s*:` immediately after the property name. */
function declaration(body: string, prop: string): string {
  const pattern = new RegExp(`(?:^|[;{])\\s*${prop}\\s*:\\s*([^;]*)`, "gm");
  let last = "";
  for (const found of body.matchAll(pattern)) last = found[1].trim();
  return last;
}

/** Resolves a CSS custom-property VALUE one level of `var()` indirection,
 * looking the referenced token up in `fallbackBlock` (the globals.css block
 * that owns it - :root, for the tokens this file resolves). Returns the
 * input unchanged when it is not a var() reference. This codebase's navy
 * containers set --focus-ring-color to EITHER a literal hex (page.module.css)
 * or `var(--focus-ring-on-navy)` (TopBar.module.css) - both are legitimate
 * wiring, and C2's real concern is the RESOLVED colour's contrast, not which
 * of the two equally-valid authoring styles a given file happens to use. */
function resolveVarOneLevel(value: string, fallbackBlock: string): string {
  const match = /^var\(\s*(--[\w-]+)\s*(?:,[\s\S]*)?\)$/.exec(value.trim());
  if (!match) return value;
  return declaration(fallbackBlock, match[1]);
}

// -----------------------------------------------------------------------
// WCAG contrast oracle. Implemented locally rather than imported from
// anywhere in the app - there is no runtime contrast utility in this
// codebase, and even if there were, importing it would let a bug in it
// masquerade as a passing test. Formula is the WCAG 2.x relative-luminance /
// contrast-ratio definition: sRGB channel -> linear-light channel (the
// 0.03928 / 12.92 vs `((c+0.055)/1.055)^2.4` branches) -> 0.2126R + 0.7152G +
// 0.0722B -> (L1+0.05)/(L2+0.05) with L1 the lighter of the pair.

/** sRGB 0-255 channel -> linear-light channel. */
function linearizeChannel(channel255: number): number {
  const c = channel255 / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance of an {r,g,b} (0-255) colour. */
function relativeLuminance(rgb: { r: number; g: number; b: number }): number {
  return 0.2126 * linearizeChannel(rgb.r) + 0.7152 * linearizeChannel(rgb.g) + 0.0722 * linearizeChannel(rgb.b);
}

/** Parses a strict 6-digit "#rrggbb" hex colour, throwing a message that
 * names the offending string - so feeding the oracle a color-mix()
 * expression, a var(), or "" fails loudly with a readable cause instead of
 * silently becoming NaN math that could accidentally read as "passing". */
function parseHex(value: string): { r: number; g: number; b: number } {
  const trimmed = value.trim();
  const match = /^#([0-9a-fA-F]{6})$/.exec(trimmed);
  if (!match) {
    throw new Error(`parseHex: expected a solid 6-digit hex colour, got "${value}"`);
  }
  const n = parseInt(match[1], 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

/** True only for a strict solid "#rrggbb" hex literal - false for a
 * color-mix()/rgba()/var() expression or "". This is the check AC1 needs:
 * the fix must land a solid colour, not a differently-translucent one. */
function isSolidHex(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value.trim());
}

/** WCAG contrast ratio between two solid hex colours. */
function contrastRatio(hexA: string, hexB: string): number {
  const lA = relativeLuminance(parseHex(hexA));
  const lB = relativeLuminance(parseHex(hexB));
  const lighter = Math.max(lA, lB);
  const darker = Math.min(lA, lB);
  return (lighter + 0.05) / (darker + 0.05);
}

/** The worst (lowest) contrast ratio `hex` achieves against any surface in
 * `surfaces`. */
function worstContrast(hex: string, surfaces: string[]): number {
  return Math.min(...surfaces.map((surface) => contrastRatio(hex, surface)));
}

/** Flattens a translucent foreground ("rgba(r, g, b, a)"; a solid "#rrggbb"
 * flattens to itself) over an opaque hex backdrop by standard alpha
 * compositing: result = fg*a + backdrop*(1-a) per channel, rounded. This is
 * the "alpha flattened over the real backdrop" step the AC's own worst-case
 * numbers were produced with, and it is how the frozen sabotage-canary
 * literals in group B below were derived from the CURRENT color-mix()
 * tokens (see the two tests that reproduce them from first principles). */
function flattenOverBackdrop(foreground: string, backdropHex: string): string {
  const trimmed = foreground.trim();
  if (isSolidHex(trimmed)) return trimmed.toLowerCase();
  const backdrop = parseHex(backdropHex);
  const rgbaMatch = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(trimmed);
  if (!rgbaMatch) {
    throw new Error(`flattenOverBackdrop: cannot parse foreground colour "${foreground}"`);
  }
  const [, rs, gs, bs, as] = rgbaMatch;
  const alpha = as === undefined ? 1 : Number(as);
  const mixChannel = (fg: number, bg: number) => Math.round(fg * alpha + bg * (1 - alpha));
  const r = mixChannel(Number(rs), backdrop.r);
  const g = mixChannel(Number(gs), backdrop.g);
  const b = mixChannel(Number(bs), backdrop.b);
  const toHex = (channel: number) => channel.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// -----------------------------------------------------------------------
// Parsed source. Comments are stripped from the WHOLE file BEFORE rootBlock/
// darkBlock are sliced out (not after), so a comment containing what looks
// like a declaration - and this repo's CSS comments narrate constantly,
// including ones that literally spell out token names and values - can never
// be mistaken for a real one by `declaration()`, which takes the LAST regex
// match in whatever text it is given. See the "comment-blind" canary below
// for a worked example of exactly this failure mode.
//
// rootBlock / darkBlock slice the same way taskNoteIndicator.wiring.test.ts
// slices the dark block: from the selector to the first `\n}`. Neither
// `:root` nor the dark block contains a nested `{`, so that first `\n}` is
// genuinely the block's own close - Group D below proves this structurally
// rather than asserting the tautological "starts with its own selector".

const globalsCssNoComments = stripCssComments(globalsCss);
const rootIdx = globalsCssNoComments.indexOf(":root {");
const rootBlock = globalsCssNoComments.slice(rootIdx, globalsCssNoComments.indexOf("\n}", rootIdx));
const darkIdx = globalsCssNoComments.indexOf('html[data-theme="dark"] {');
const darkBlock = globalsCssNoComments.slice(darkIdx, globalsCssNoComments.indexOf("\n}", darkIdx));

const lightFocusRingColorRaw = declaration(rootBlock, "--focus-ring-color");
const darkFocusRingColorRaw = declaration(darkBlock, "--focus-ring-color");
const lightFocusRingDefaultRaw = declaration(rootBlock, "--focus-ring-default");
const darkFocusRingDefaultRaw = declaration(darkBlock, "--focus-ring-default");
const focusRingOnNavyRaw = declaration(rootBlock, "--focus-ring-on-navy");
const rootAccentWash = declaration(rootBlock, "--accent-wash");
const darkAccentWash = declaration(darkBlock, "--accent-wash");

// FROZEN LITERALS. Written into the test file, not re-read from globals.css
// or page.module.css - if the oracle derived both the colour under test AND
// the surfaces it is checked against from the same file, the test could
// never fail no matter what that file said. These are exactly the surfaces
// docs/focus-ring-acceptance-criteria.md AC1 lists as measured, PLUS the
// surfaces the original draft of this file was missing (review finding 1):
// light --border-soft, --accent-soft-strong (resolves to #d3e0fb) and the
// two light row-highlight tokens; dark's two row-highlight tokens. Missing
// these is exactly how a design that only cleared 3:1 against the ORIGINAL
// five surfaces - but not against --navy-highlight-strong (light) or dark
// --navy-highlight-strong - passed review undetected.
const LIGHT_SURFACES = [
  "#ffffff",
  "#f8fafc",
  "#f1f5f9",
  "#f4f7fb",
  "#e8eef7",
  "#e2e8f0", // --border-soft
  "#d3e0fb", // --accent-soft-strong (resolved)
  "#c3cee9", // --navy-highlight
  "#a7b9e0", // --navy-highlight-strong - the binding constraint (3.40:1)
];
const DARK_SURFACES = [
  "#0b1120",
  "#0e1626",
  "#1e293b",
  "#111a2e",
  "#182338",
  "#2b3a5c", // dark --navy-highlight
  "#364a75", // dark --navy-highlight-strong - the binding constraint (6.18:1)
];

describe("oracle sanity - the WCAG formula itself is correct before anything is trusted to it", () => {
  it("black on white is the theoretical maximum ratio, 21:1 (catches a sign error or swapped L1/L2 in the formula)", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 5);
  });

  it("matches the canonical WCAG reference point: #767676 on white is the widely-cited ~4.5:1 AA boundary grey (catches a wrong linearization branch point/exponent)", () => {
    const ratio = contrastRatio("#ffffff", "#767676");
    expect(ratio).toBeGreaterThan(4.5);
    expect(ratio).toBeLessThan(4.6);
  });

  it("isSolidHex rejects a color-mix() expression and accepts a plain hex literal (catches a check that only looks at the leading '#') - the ONE place this literal pairing is asserted (see group B for why it is not repeated there)", () => {
    expect(isSolidHex("color-mix(in srgb, var(--accent) 20%, transparent)")).toBe(false);
    expect(isSolidHex("#1d4ed8")).toBe(true);
  });
});

// -----------------------------------------------------------------------
// Comment-blindness guard (review finding 8). rootBlock/darkBlock above are
// sliced from RAW text and, unlike ruleBody()'s scope, were never comment-
// stripped in the original draft - so a comment written AFTER a real
// declaration, that happens to spell out the same property, would win: the
// declaration() regex takes the LAST match in whatever text it is given, and
// a comment's text is indistinguishable from real CSS to a regex. These two
// tests both prove the failure mode is real (first) and prove the fix (the
// up-front stripCssComments call feeding rootBlock/darkBlock above)
// neutralises it (second).
describe("comment-blindness guard - a commented-out declaration must never win (review finding 8)", () => {
  // The fake declaration sits on its OWN line inside the comment (as a real
  // "here is the old value" comment in this codebase would read) so it is
  // reached by declaration()'s multiline `^` alternative, not just its `;`/`{`
  // one - reproducing the actual risk (a comment line that happens to spell a
  // token declaration) rather than a contrived one that could never occur.
  const trap = ':root {\n  --focus-ring-color: #111111;\n  /*\n  --focus-ring-color: #ffffff;\n  */\n}';

  it("demonstrates the bug class: declaration() on RAW, unstripped text lets a LATER comment's spelled-out property win over the real one", () => {
    expect(declaration(trap, "--focus-ring-color")).toBe("#ffffff");
  });

  it("stripCssComments applied first (as rootBlock/darkBlock now do) removes the comment, so declaration() returns the real value", () => {
    expect(declaration(stripCssComments(trap), "--focus-ring-color")).toBe("#111111");
  });
});

// -----------------------------------------------------------------------
// A. AC1 - --focus-ring-default resolves to a real, compliant colour in both
// themes, and --focus-ring-color forwards to it. --focus-ring-on-navy exists,
// is solid, clears 3:1 against navy, and is theme-invariant (defined only in
// :root - review's CONTEXT for why C2/E exist at all).

describe("A. --focus-ring-default is a real, compliant indicator, and --focus-ring-color forwards to it (AC1)", () => {
  it("the :root block declares --focus-ring-default", () => {
    expect(lightFocusRingDefaultRaw).not.toBe("");
  });

  it("the dark block declares --focus-ring-default", () => {
    expect(darkFocusRingDefaultRaw).not.toBe("");
  });

  it("light --focus-ring-default is a solid hex colour, not color-mix()/rgba() (catches shipping a differently-translucent wash)", () => {
    expect(isSolidHex(lightFocusRingDefaultRaw), `--focus-ring-default (light) is "${lightFocusRingDefaultRaw}"`).toBe(
      true
    );
  });

  it("dark --focus-ring-default is a solid hex colour, not color-mix()/rgba()", () => {
    expect(isSolidHex(darkFocusRingDefaultRaw), `--focus-ring-default (dark) is "${darkFocusRingDefaultRaw}"`).toBe(
      true
    );
  });

  it("light --focus-ring-default clears 3:1 (WCAG 1.4.11 AA) against EVERY frozen light surface, including the row-highlight surfaces (review finding 1: the original surface list was missing exactly the surfaces that would have caught a too-pale colour)", () => {
    const ratio = worstContrast(lightFocusRingDefaultRaw, LIGHT_SURFACES);
    expect(ratio).toBeGreaterThanOrEqual(3);
  });

  it("dark --focus-ring-default clears 3:1 against every frozen dark surface, including the row-highlight surfaces", () => {
    const ratio = worstContrast(darkFocusRingDefaultRaw, DARK_SURFACES);
    expect(ratio).toBeGreaterThanOrEqual(3);
  });

  it("--focus-ring-color in :root forwards to --focus-ring-default via var(), rather than duplicating a hardcoded hex that could drift out of sync", () => {
    expect(normalizeWhitespace(lightFocusRingColorRaw)).toBe("var(--focus-ring-default)");
  });

  it("--focus-ring-color in the dark block forwards to --focus-ring-default", () => {
    expect(normalizeWhitespace(darkFocusRingColorRaw)).toBe("var(--focus-ring-default)");
  });

  it("--focus-ring-on-navy is defined in :root, is a solid hex, and clears 3:1 against navy #1a2744 (the token C2's five containers point at)", () => {
    expect(focusRingOnNavyRaw).not.toBe("");
    expect(isSolidHex(focusRingOnNavyRaw), `--focus-ring-on-navy is "${focusRingOnNavyRaw}"`).toBe(true);
    expect(contrastRatio(focusRingOnNavyRaw, "#1a2744")).toBeGreaterThanOrEqual(3);
  });

  it("--focus-ring-on-navy is theme-invariant: NOT redefined in the dark block (the navy chrome is navy in both themes, so one value covers both)", () => {
    expect(declaration(darkBlock, "--focus-ring-on-navy")).toBe("");
  });
});

// -----------------------------------------------------------------------
// B. Sabotage canary. Every test in this block MUST be GREEN today, and stay
// green after the fix - it proves the oracle above is capable of failing at
// all, by feeding it the values the AC measured as non-compliant.

describe("B. sabotage canary - the oracle demonstrably REJECTS the pre-change colours (must be green today AND after the fix)", () => {
  it("flattening the light wash's own formula (--accent #2563eb at 20% opacity, over white) reproduces the frozen canary literal #d3e0fb", () => {
    // Ties the frozen literal below back to its derivation instead of being
    // an unexplained magic string, and separately proves flattenOverBackdrop
    // itself is correct.
    expect(flattenOverBackdrop("rgba(37, 99, 235, 0.2)", "#ffffff")).toBe("#d3e0fb");
  });

  it("flattening the dark wash's own formula (--accent-ink #60a5fa at 35% opacity, over dark --field-background #1e293b) reproduces the frozen canary literal #35547e", () => {
    expect(flattenOverBackdrop("rgba(96, 165, 250, 0.35)", "#1e293b")).toBe("#35547e");
  });

  it("the oracle REJECTS the pre-change light wash #d3e0fb: worst-case ratio against the frozen light surfaces is under 3:1", () => {
    // If this were >= 3, the oracle would rubber-stamp the exact colour the
    // AC measured at 1.14:1 and the whole test file would be worthless.
    const ratio = worstContrast("#d3e0fb", LIGHT_SURFACES);
    expect(ratio).toBeLessThan(3);
  });

  it("the oracle REJECTS the pre-change dark wash #35547e: worst-case ratio against the frozen dark surfaces is under 3:1", () => {
    const ratio = worstContrast("#35547e", DARK_SURFACES);
    expect(ratio).toBeLessThan(3);
  });

  // This uses a FROZEN literal of the pre-change dark expression, not the
  // live value parsed out of globals.css. An earlier draft read the live
  // token and asserted it was still non-solid, which made it a time bomb: it
  // was green only while the defect existed and was guaranteed to turn red
  // the moment AC1 landed CORRECTLY. A canary must prove the check can reject
  // a bad value; it must not encode "the bug is still here" as a passing
  // test.
  //
  // The equivalent light-wash literal ("color-mix(in srgb, var(--accent) 20%,
  // transparent)") is NOT repeated here (review finding 7: it was a verbatim
  // duplicate of the oracle-sanity assertion above, and on a hardcoded
  // literal it said nothing about the codebase either place it appeared) -
  // the oracle-sanity block above is its one home now.
  it("the pre-change dark wash expression is recognised as non-solid by the same check A uses", () => {
    expect(isSolidHex("color-mix(in srgb, var(--accent-ink) 35%, transparent)")).toBe(false);
  });
});

// -----------------------------------------------------------------------
// C1. AC4 - --accent-wash carries the token's OLD expression, verbatim, for
// the two non-focus consumers. Review finding 2: the original draft only
// checked --accent-wash was non-empty and that both consumers referenced it
// by name - never its VALUE, so `--accent-wash: red` would have passed the
// whole file. These tests pin the exact expression (whitespace-normalized)
// and separately confirm it is translucent, not a solid hex - the actual
// claim being tested is "identical to what --focus-ring-color used to be".

describe("C1. --accent-wash is introduced for the two non-focus consumers, with the EXACT old expression (AC4)", () => {
  it("--accent-wash is defined in the :root block", () => {
    expect(rootAccentWash).not.toBe("");
  });

  it("--accent-wash is defined in the dark block", () => {
    expect(darkAccentWash).not.toBe("");
  });

  it("--accent-wash in :root is EXACTLY color-mix(in srgb, var(--accent) 20%, transparent) - the wash --focus-ring-color used to be, not just some non-empty value", () => {
    expect(normalizeWhitespace(rootAccentWash)).toBe(
      normalizeWhitespace("color-mix(in srgb, var(--accent) 20%, transparent)")
    );
  });

  it("--accent-wash in the dark block is EXACTLY color-mix(in srgb, var(--accent-ink) 35%, transparent)", () => {
    expect(normalizeWhitespace(darkAccentWash)).toBe(
      normalizeWhitespace("color-mix(in srgb, var(--accent-ink) 35%, transparent)")
    );
  });

  it("both live --accent-wash values are translucent expressions, not a solid hex (proves they still carry the WASH, not a compliant ring colour)", () => {
    expect(isSolidHex(rootAccentWash), `--accent-wash (light) is "${rootAccentWash}"`).toBe(false);
    expect(isSolidHex(darkAccentWash), `--accent-wash (dark) is "${darkAccentWash}"`).toBe(false);
  });

  it(".lfCardSelected's background no longer reads --focus-ring-color, and reads --accent-wash instead (page.module.css)", () => {
    const body = ruleBody(pageCss, ".lfCardSelected");
    expect(body, "expected to find a .lfCardSelected rule").not.toBe("");
    const background = declaration(body, "background");
    expect(background).not.toContain("--focus-ring-color");
    expect(background).toContain("--accent-wash");
  });

  it(".deadlinesUploadStatus's border no longer reads --focus-ring-color, and reads --accent-wash instead (page.module.css)", () => {
    const body = ruleBody(pageCss, ".deadlinesUploadStatus");
    expect(body, "expected to find a .deadlinesUploadStatus rule").not.toBe("");
    const border = declaration(body, "border");
    expect(border).not.toContain("--focus-ring-color");
    expect(border).toContain("--accent-wash");
  });
});

// -----------------------------------------------------------------------
// C2. AC2 - the five navy chrome containers each get a scoped
// --focus-ring-color override, and that override clears 3:1 against ITS OWN
// real backdrop (computed by the oracle, not string-compared). Review finding
// 3: the original draft checked every container against --navy #1a2744, but
// .ccItem:hover's actual background is --navy-soft #243450 - a genuinely
// different colour, not a rounding difference.
//
// Live wiring uses two equally valid styles for the override's VALUE: a
// literal hex (page.module.css's four containers) and a var(--focus-ring-
// on-navy) reference (TopBar.module.css's .bar) - resolveVarOneLevel handles
// either, because the AC's actual concern is the resolved colour's contrast,
// not which spelling a given file uses.

describe("C2. the five navy containers override --focus-ring-color, and the override clears 3:1 against ITS OWN backdrop (AC2)", () => {
  const containers: Array<{ label: string; css: string; selector: string; backdrop: string; backdropLabel: string }> = [
    { label: "TopBar.module.css .bar", css: topBarCss, selector: ".bar", backdrop: "#1a2744", backdropLabel: "--navy" },
    { label: "page.module.css .lfRail", css: pageCss, selector: ".lfRail", backdrop: "#1a2744", backdropLabel: "--navy" },
    {
      label: "page.module.css .lfDetail",
      css: pageCss,
      selector: ".lfDetail",
      backdrop: "#1a2744",
      backdropLabel: "--navy",
    },
    {
      label: "page.module.css .bulkBarHead",
      css: pageCss,
      selector: ".bulkBarHead",
      backdrop: "#1a2744",
      backdropLabel: "--navy",
    },
    {
      label: "page.module.css .ccItem:hover",
      css: pageCss,
      selector: ".ccItem:hover",
      backdrop: "#243450",
      backdropLabel: "--navy-soft",
    },
  ];

  for (const { label, css, selector, backdrop, backdropLabel } of containers) {
    it(`${label} declares --focus-ring-color, solid (or resolving to solid) and >= 3:1 against its own backdrop ${backdropLabel} ${backdrop}`, () => {
      const body = ruleBody(css, selector);
      expect(body, `expected to find a ${selector} rule`).not.toBe("");
      const raw = declaration(body, "--focus-ring-color");
      expect(raw, `expected ${selector} to declare --focus-ring-color`).not.toBe("");
      const resolved = resolveVarOneLevel(raw, rootBlock);
      expect(
        isSolidHex(resolved),
        `--focus-ring-color on ${selector} is "${raw}", which resolves to "${resolved}" - expected a solid hex`
      ).toBe(true);
      expect(contrastRatio(resolved, backdrop)).toBeGreaterThanOrEqual(3);
    });
  }
});

// -----------------------------------------------------------------------
// C3. AC2 negative case - the two navy pages whose interactive controls all
// render inside a nested WHITE card must NOT get the override: inheriting a
// navy-tuned ring there would put a light-blue ring on white inputs (1.24:1
// per the AC). This is expected to be GREEN already (neither page declares
// the token today) and must STAY green - a correct implementation adds the
// override to exactly the five containers above and no more.

describe("C3. login and account/security pages must NOT get a navy override (AC2 negative case - guards against over-applying the fix)", () => {
  it("login.module.css .page does not declare --focus-ring-color", () => {
    const body = ruleBody(loginCss, ".page");
    expect(body, "expected to find a .page rule in login.module.css").not.toBe("");
    expect(declaration(body, "--focus-ring-color")).toBe("");
  });

  it("account/security/security.module.css .page does not declare --focus-ring-color", () => {
    const body = ruleBody(securityCss, ".page");
    expect(body, "expected to find a .page rule in security.module.css").not.toBe("");
    expect(declaration(body, "--focus-ring-color")).toBe("");
  });
});

// -----------------------------------------------------------------------
// C3b. The reset must go on CONTAINERS, never on the focusable itself.
//
// This is the single most misread rule in this whole change - three separate
// implementers got it wrong in the same round, each reasoning "this element
// paints --field-background, so it is a light surface, so it needs the
// reset". That is the wrong test. `outline-offset: 2px` paints the ring 2px
// OUTSIDE the focused element's border box, so the colour the ring is
// actually adjacent to is the PARENT's fill, not the element's own.
//
// So the rule is: an element that CONTAINS the thing that takes focus (a
// dropdown panel, a modal, a MUI FormControl root wrapping the real <input>)
// needs the reset, because the ring lands on its fill. An element that IS the
// thing that takes focus (a button, an icon button, a chip) needs NOTHING,
// however light its own background - its ring lands on whatever it sits on.
//
// These three are all light-painted controls sitting on .ccItem, which is
// --navy-soft while hovered. Each of them correctly has NO reset. Adding one
// would pin the ring to the light default and yield 1.86:1 against
// --navy-soft - turning a passing indicator into a failing one. .ccPublish in
// particular HAD such a reset added during this change and it was reverted.
describe("C3b. light-painted controls that ARE the focusable must NOT reset the ring (guards a fix that would be a regression)", () => {
  const lightControlsOnHoverNavy = [".ccPublish", ".ccDue", ".ccDueEmpty"];

  for (const selector of lightControlsOnHoverNavy) {
    it(`page.module.css ${selector} does not declare --focus-ring-color`, () => {
      const body = ruleBody(pageCss, selector);
      expect(body, `expected to find a ${selector} rule in page.module.css`).not.toBe("");
      expect(
        declaration(body, "--focus-ring-color"),
        `${selector} is a focusable control, not a container - its ring paints outside it on .ccItem, ` +
          "so it must inherit .ccItem:hover's navy ring rather than resetting to the light default"
      ).toBe("");
    });
  }

  it("the reset value would in fact be non-compliant on --navy-soft, which is why the rule matters", () => {
    // Pins the REASON, not just the absence: if --focus-ring-default ever
    // became a colour that did clear 3:1 on --navy-soft, the assertions above
    // would be preserving a rule that no longer protects anything, and this
    // test says so by failing.
    const lightDefault = declaration(rootBlock, "--focus-ring-default");
    expect(contrastRatio(lightDefault, "#243450")).toBeLessThan(3);
  });
});

// -----------------------------------------------------------------------
// C4. AC3 - MUI buttons receive the ring via theme.ts.

describe("C4. theme.ts wires MuiButtonBase's focus-visible outline to the token (AC3)", () => {
  it('components.MuiButtonBase.styleOverrides.root["&:focus-visible"] sets outline: var(--focus-ring-color) with an outline offset of 2px', async () => {
    // Prefer importing the real module: it proves the shape MUI will
    // actually consume (a JS object with the right property path and
    // values), not just that the right substring appears somewhere in the
    // file. Only falls back to parsing theme.ts as text if importing
    // "@mui/material/styles" (transitively, via theme.ts) throws under
    // vitest's node environment.
    let buttonBaseRoot: Record<string, unknown> | undefined;
    let importFailed: unknown = null;
    try {
      const themeModule = (await import("./theme")) as { default?: { components?: Record<string, unknown> } };
      const components = themeModule.default?.components as
        | { MuiButtonBase?: { styleOverrides?: { root?: Record<string, unknown> } } }
        | undefined;
      buttonBaseRoot = components?.MuiButtonBase?.styleOverrides?.root;
    } catch (err) {
      importFailed = err;
    }

    if (importFailed === null) {
      expect(
        buttonBaseRoot,
        "expected the real theme object to define components.MuiButtonBase.styleOverrides.root"
      ).toBeDefined();
      const focusVisible = (buttonBaseRoot as Record<string, { outline?: unknown; outlineOffset?: unknown }> | undefined)?.[
        "&:focus-visible"
      ];
      expect(focusVisible, 'expected a "&:focus-visible" entry under MuiButtonBase.styleOverrides.root').toBeDefined();
      expect(
        String(focusVisible?.outline ?? ""),
        `outline was "${focusVisible?.outline}", expected it to reference var(--focus-ring-color)`
      ).toContain("var(--focus-ring-color)");
      // Accept either the number 2 or the string "2px" - both are equally
      // correct MUI CSS-in-JS for a 2px offset. Review finding 6: pinning
      // `toBe(2)` over-specifies spelling, not the fact under test (this
      // project has twice had a source-text assertion like that force a
      // worse implementation - pin the FACT, never the spelling).
      expect(
        [2, "2px"],
        `outlineOffset was ${JSON.stringify(focusVisible?.outlineOffset)}, expected 2 or "2px"`
      ).toContain(focusVisible?.outlineOffset);
    } else {
      // Fallback: parse theme.ts as source text. Pins the FACT (the property
      // path exists and its value references the token) rather than exact
      // formatting, per this project's "pin the fact, not the spelling" rule.
      const themeSource = readFileSync(THEME_PATH, "utf8");
      const idx = themeSource.indexOf("MuiButtonBase");
      expect(idx, "expected theme.ts to mention MuiButtonBase").toBeGreaterThan(-1);
      const window = themeSource.slice(idx, idx + 400);
      expect(window).toMatch(/styleOverrides/);
      expect(window).toMatch(/&:focus-visible/);
      expect(window).toMatch(/outline\s*:\s*["'][^"']*var\(--focus-ring-color\)/);
      expect(window).toMatch(/outlineOffset\s*:\s*(2\b|["']2px["'])/);
    }
  });

  // Tab is the one ButtonBase descendant the general rule gets WRONG.
  // `.MuiTabs-scroller` sets `overflow: hidden` and its height equals the
  // tab's, so a ring at a POSITIVE offset is clipped top and bottom - measured
  // in headless Chrome, a focused tab showed only two disconnected vertical
  // bars. A negative offset draws the ring inside the tab's own border box
  // where nothing clips it. This assertion exists because the failure is
  // invisible to every other gate in this repo: nothing renders, so a
  // positive offset here would ship looking correct in the source.
  it("MuiTab overrides the offset to a NEGATIVE value, so the ring is not clipped by .MuiTabs-scroller's overflow", async () => {
    let tabRoot: Record<string, unknown> | undefined;
    let importFailed: unknown = null;
    try {
      const themeModule = (await import("./theme")) as { default?: { components?: Record<string, unknown> } };
      const components = themeModule.default?.components as
        | { MuiTab?: { styleOverrides?: { root?: Record<string, unknown> } } }
        | undefined;
      tabRoot = components?.MuiTab?.styleOverrides?.root;
    } catch (err) {
      importFailed = err;
    }

    if (importFailed === null) {
      expect(tabRoot, "expected the real theme object to define components.MuiTab.styleOverrides.root").toBeDefined();
      const focusVisible = (tabRoot as Record<string, { outline?: unknown; outlineOffset?: unknown }> | undefined)?.[
        "&:focus-visible"
      ];
      expect(focusVisible, 'expected a "&:focus-visible" entry under MuiTab.styleOverrides.root').toBeDefined();
      expect(String(focusVisible?.outline ?? "")).toContain("var(--focus-ring-color)");
      // Pin the FACT (the offset pulls the ring inward), not the spelling -
      // -2 and "-2px" are equally correct CSS-in-JS.
      const offset = focusVisible?.outlineOffset;
      const asNumber = typeof offset === "number" ? offset : Number(String(offset).replace("px", ""));
      expect(
        asNumber,
        `MuiTab outlineOffset was ${JSON.stringify(offset)}; it must be negative or the ring is clipped away`
      ).toBeLessThan(0);
    } else {
      const themeSource = readFileSync(THEME_PATH, "utf8");
      const idx = themeSource.indexOf("MuiTab:");
      expect(idx, "expected theme.ts to define a MuiTab override").toBeGreaterThan(-1);
      const window = themeSource.slice(idx, idx + 400);
      expect(window).toMatch(/&:focus-visible/);
      expect(window).toMatch(/outlineOffset\s*:\s*(-\d+\b|["']-\d+px["'])/);
    }
  });
});

// -----------------------------------------------------------------------
// C5. AC5 - the Tasks grid keeps its inset ring and stops double-painting
// the (broken, per AC5's headless-Chrome measurement) outline on top of it.

describe("C5. .gridFocusRing:focus-visible suppresses the outline and keeps its inset ring (AC5)", () => {
  it("sets outline: none AND still sets its inset box-shadow with var(--accent-ink)", () => {
    const body = ruleBody(tasksGridCss, ".gridFocusRing:focus-visible");
    expect(body, "expected to find a .gridFocusRing:focus-visible rule").not.toBe("");
    // The AC's whole reason for this rule: once AC1 makes the global token
    // opaque, this cell would paint the (clipped/occluded) outline on top of
    // the already-compliant inset ring unless outline is explicitly killed.
    expect(declaration(body, "outline")).toBe("none");
    // And the inset ring itself - already compliant per the AC - must
    // survive the change untouched.
    expect(declaration(body, "box-shadow")).toContain("var(--accent-ink)");
  });
});

// -----------------------------------------------------------------------
// E. AC2's reset-on-nested-light-surface bug class (review finding 4 - the
// defect the original draft missed entirely). Any light-background element
// nested inside a navy container inherits --focus-ring-on-navy through the
// DOM unless it resets back to --focus-ring-default. This is load-bearing,
// not decorative, BECAUSE --focus-ring-on-navy fails contrast on white - the
// first test below proves that reason with the same contrast oracle used
// everywhere else in this file, rather than asserting it as an unverified
// comment.

describe("E. light surfaces nested in navy chrome reset back to --focus-ring-default (AC2, review finding 4)", () => {
  it("--focus-ring-on-navy measures UNDER 3:1 against white - this is what makes the resets below load-bearing rather than decorative", () => {
    expect(isSolidHex(focusRingOnNavyRaw), `--focus-ring-on-navy is "${focusRingOnNavyRaw}"`).toBe(true);
    expect(contrastRatio(focusRingOnNavyRaw, "#ffffff")).toBeLessThan(3);
  });

  it("TopBar.module.css .menu resets --focus-ring-color: var(--focus-ring-default) (a light dropdown popping out of the navy .bar)", () => {
    const body = ruleBody(topBarCss, ".menu");
    expect(body, "expected to find a .menu rule").not.toBe("");
    expect(normalizeWhitespace(declaration(body, "--focus-ring-color"))).toBe("var(--focus-ring-default)");
  });

  it("page.module.css .previewModal resets --focus-ring-color: var(--focus-ring-default)", () => {
    const body = ruleBody(pageCss, ".previewModal");
    expect(body, "expected to find a .previewModal rule").not.toBe("");
    expect(normalizeWhitespace(declaration(body, "--focus-ring-color"))).toBe("var(--focus-ring-default)");
  });

  it("page.module.css .ccDueInput resets --focus-ring-color: var(--focus-ring-default) (a white input nested inside the navy-soft .ccItem:hover)", () => {
    const body = ruleBody(pageCss, ".ccDueInput");
    expect(body, "expected to find a .ccDueInput rule").not.toBe("");
    expect(normalizeWhitespace(declaration(body, "--focus-ring-color"))).toBe("var(--focus-ring-default)");
  });
});

// -----------------------------------------------------------------------
// D. Guards the exact invariants taskNoteIndicator.wiring.test.ts depends on
// when reading the SAME globals.css dark block this change edits. These
// should be GREEN today and must STAY green after the fix - if any of them
// goes red, this change broke that other test's assumptions, not this one's.

describe("D. guards the invariants taskNoteIndicator.wiring.test.ts depends on in globals.css's dark block", () => {
  it('the dark block is found, closes at its own "}" with no stray nested selector+brace, and reaches the tokens near the end of the real block (review finding 5: replaces a tautological startsWith check)', () => {
    expect(darkIdx).toBeGreaterThan(-1);
    // Exactly one "{" - the selector's own opening brace. `darkBlock` was
    // sliced up to the first "\n}" after darkIdx; if that search had instead
    // matched the WRONG closing brace (e.g. because a rule moved and the dark
    // block grew a nested at-rule), this slice would swallow a later
    // selector's own rule - which has its own "{" - and this count would be
    // > 1. The old `darkBlock.startsWith('html[data-theme="dark"] {')`
    // assertion was true BY CONSTRUCTION (darkBlock is sliced starting at the
    // indexOf of that exact literal) and could never catch a slice-END bug;
    // this does.
    const braceCount = (darkBlock.match(/\{/g) || []).length;
    expect(braceCount, `expected exactly one "{" in the sliced dark block, found ${braceCount}`).toBe(1);
    // The slice didn't end too EARLY either - it still reaches a token
    // declared near the very bottom of the real dark block.
    expect(darkBlock).toContain("--field-background");
    expect(darkBlock).toContain("--accent-ink");
    expect(darkBlock).toContain("--shadow-lg");
    // And it didn't run too LONG: it must not reach into the next rule
    // (`html { ... color-scheme: light; }`), which would also have shown up
    // as more than one "{" above - asserted again here independently, by
    // content rather than brace count.
    expect(darkBlock).not.toContain("color-scheme: light");
  });

  it("the dark block still contains --field-background: #1e293b", () => {
    expect(declaration(darkBlock, "--field-background")).toBe("#1e293b");
  });

  it("the dark block still has a non-empty --accent-ink", () => {
    expect(declaration(darkBlock, "--accent-ink")).not.toBe("");
  });

  it('declaration(darkBlock, "--accent") is still "" even once --accent-wash exists alongside it', () => {
    // The helper's regex requires `${prop}\s*:` immediately after the name,
    // so "--accent-wash: ..." can never satisfy a lookup for "--accent" -
    // this is a property of the regex, not of the file's current contents,
    // so this stays true both before and after AC4 adds --accent-wash.
    expect(declaration(darkBlock, "--accent")).toBe("");
  });
});
