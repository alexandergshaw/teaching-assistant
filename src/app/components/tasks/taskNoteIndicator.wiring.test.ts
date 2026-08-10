// Wiring guard for the PROMINENCE of the Tasks-grid note indicator.
//
// The instructor's report: a cell carrying a note is too easy to miss - the
// mark needs a bigger surface area and has to actually pull the eye. The
// indicator was a 7px x 7px CSS-drawn corner dog-ear (24.5 square pixels in
// a 120 x 36 cell - 0.57% of it) filled with `var(--accent)`, a variable the
// dark theme does NOT override, so it was dimmest exactly where it was
// already hardest to see.
//
// The fix is ONE mark, made much bigger, not a second visual channel. An
// earlier draft of this work also washed the whole cell in a translucent
// accent gradient; it was measured at 1.29-1.47:1 contrast against the cell
// at any tint subtle enough to be tasteful (i.e. invisible to many users and
// under the 3:1 non-text threshold), and it would have been the FIFTH accent
// tint composited on this one element, after `.statusButton:hover`, the row
// crosshair, the column crosshair and the outstanding highlight - the exact
// multi-tint collision TasksGrid.module.css:285-289 already refuses zebra
// striping to avoid. It was dropped for that reason, and these tests
// deliberately pin the mark's GEOMETRY instead, which is the one thing about
// visual weight that this test environment can actually verify.
//
// vitest is node-env and collects only src/**/*.test.ts, so no .tsx is ever
// rendered and no CSS is ever computed - nothing here can measure a painted
// pixel. These checks therefore read TasksGrid.module.css, globals.css and
// TaskCell.tsx as TEXT, the same idiom taskInstructionIndicator.wiring.test.ts
// (this same directory), repoGrades.wiring.test.ts and
// bulkCreateModules.wiring.test.ts already use. Every heuristic below is
// proven against inline fixtures first (REGRESSION entry 239 check 10: "a
// structural assertion without a canary is worthless"), including the three
// ways a text scan of CSS goes quietly wrong: a rule that is really inside an
// `@media` block, a rule DECLARED TWICE where the cascade takes the last one
// and a naive reader takes the first, and a selector that appears only in a
// comment.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const CSS_PATH = join(process.cwd(), "src/app/components/tasks/TasksGrid.module.css");
const css = readFileSync(CSS_PATH, "utf8");
const GLOBALS_PATH = join(process.cwd(), "src/app/globals.css");
const globalsCss = readFileSync(GLOBALS_PATH, "utf8");
const TASK_CELL_PATH = join(process.cwd(), "src/app/components/tasks/TaskCell.tsx");
const taskCellSource = readFileSync(TASK_CELL_PATH, "utf8");

/** Strips CSS block comments, so a selector or property NAMED in an
 * explanatory comment can never be mistaken for a real declaration. This
 * file's own subject matter makes that a live risk: TasksGrid.module.css
 * quotes selectors and property values in its comments constantly. */
function stripCssComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * Removes every at-rule BLOCK (`@media`, `@supports`, ...) together with its
 * contents, leaving only rules that apply unconditionally. Without this, a
 * declaration parked inside `@media print` reads exactly like a live one.
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
      // A statement at-rule (`@import ...;`) - it has no block to skip.
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

/**
 * The declaration bodies of every unconditional rule whose selector list
 * contains EXACTLY `selector` (as one comma-separated entry, whitespace-
 * normalized), joined in FILE ORDER, or "" when no such rule exists. File
 * order matters: `declaration` below reads the LAST occurrence, which is the
 * one the cascade actually applies when a property is declared twice.
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

function normalizeSelector(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

/**
 * Every selector in the file that mentions `.className`, INCLUDING ones
 * inside `@media` blocks. `ruleBody` above matches an exact selector and
 * returns matches in source order, which models the cascade only among
 * equally-specific rules - it does NOT model specificity. A rule like
 * `.table .noteMarker { ... }` appended anywhere would beat `.noteMarker`
 * in a browser (0,2,0 against 0,1,0) while every other assertion in this
 * file still passed. This is what closes that hole.
 */
function selectorsMentioning(text: string, className: string): string[] {
  const token = new RegExp(`\\.${className}\\b`);
  const stripped = stripCssComments(text);
  const found: string[] = [];
  const blocks = /([^{}]+)\{([^{}]*)\}/g;
  let match = blocks.exec(stripped);
  while (match !== null) {
    for (const selector of match[1].split(",").map(normalizeSelector)) {
      if (token.test(selector)) found.push(selector);
    }
    match = blocks.exec(stripped);
  }
  return found;
}

/** The WINNING value of `prop` in a declaration body (the last one declared),
 * or "" when unset. Longhands only: `declaration(body, "top")` never matches
 * `border-top`, and `declaration(body, "background")` never matches
 * `background-color`. */
function declaration(body: string, prop: string): string {
  const pattern = new RegExp(`(?:^|[;{])\\s*${prop}\\s*:\\s*([^;]*)`, "gm");
  let last = "";
  for (const found of body.matchAll(pattern)) last = found[1].trim();
  return last;
}

/** Every `<number>px` in `value`, as numbers. */
function pxValues(value: string): number[] {
  return [...value.matchAll(/(-?\d*\.?\d+)px/g)].map((m) => Number(m[1]));
}

/** The single px length a custom property is set to, failing loudly rather
 * than returning `undefined` if the property is missing entirely - so a
 * missing declaration reports as a missing declaration, not as a TypeError
 * from destructuring `[]`. */
function pxVar(body: string, name: string): number {
  const raw = declaration(body, name);
  expect(raw, `expected ${name} to be declared`).not.toBe("");
  const values = pxValues(raw);
  expect(values, `expected ${name} to be a single px length, got "${raw}"`).toHaveLength(1);
  return values[0];
}

describe("canaries: the CSS readers actually discriminate", () => {
  const fixture = `
    /* .fakeMarker { border-width: 0 99px 99px 0; } */
    .noteMarker { top: 0; right: 0; border-width: 0 28px 14px 0; }
    .a, .b { color: red; }
    @media (hover: none) { .nested { opacity: 1; } }
    @media print { .noteMarker { border-width: 0 1px 1px 0; } }
  `;

  it("finds a rule body by its exact selector", () => {
    expect(declaration(ruleBody(fixture, ".noteMarker"), "border-width")).toBe("0 28px 14px 0");
  });

  it("returns nothing for a selector that appears only inside a comment", () => {
    expect(ruleBody(fixture, ".fakeMarker")).toBe("");
  });

  it("finds a selector that is one entry of a comma-separated list", () => {
    expect(declaration(ruleBody(fixture, ".b"), "color")).toBe("red");
  });

  it("IGNORES a rule nested inside an @media block - a conditional rule is not a live one", () => {
    expect(ruleBody(fixture, ".nested")).toBe("");
    // ...and the @media copy of .noteMarker did not contribute its 1px value.
    expect(declaration(ruleBody(fixture, ".noteMarker"), "border-width")).not.toContain("1px");
  });

  it("does not treat a prefix as a match - .note must not find .noteMarker", () => {
    expect(ruleBody(fixture, ".note")).toBe("");
  });

  it("reads the LAST declaration of a duplicated property, the one the cascade applies", () => {
    const twice = ".x { border-width: 0 28px 14px 0; }\n.x { border-width: 0 7px 7px 0; }";
    expect(declaration(ruleBody(twice, ".x"), "border-width")).toBe("0 7px 7px 0");
  });

  it("matches longhands only - `top` never matches `border-top`", () => {
    expect(declaration("border-top: 4px;", "top")).toBe("");
    expect(declaration("top: 0;", "top")).toBe("0");
  });

  it("pxValues reads every px number in a value", () => {
    expect(pxValues("0 28px 14px 0")).toEqual([28, 14]);
    expect(pxValues("none")).toEqual([]);
  });

  it("selectorsMentioning finds EVERY rule targeting a class, including a more specific one and one inside @media", () => {
    const many = `
      .noteMarker { border-width: 0 28px 14px 0; }
      .table .noteMarker { border-width: 0 7px 7px 0; }
      @media print { .noteMarker { border-width: 0; } }
      .otherMarker { top: 0; }
    `;
    expect(selectorsMentioning(many, "noteMarker")).toEqual([
      ".noteMarker",
      ".table .noteMarker",
      ".noteMarker",
    ]);
    expect(selectorsMentioning(".noteMarkerish { top: 0; }", "noteMarker")).toEqual([]);
  });

  it("sabotage canary: the PRE-CHANGE declarations fail the size and ink checks group B makes", () => {
    const old = ".noteMarker { border-width: 0 7px 7px 0; border-color: transparent var(--accent) transparent transparent; }";
    const body = ruleBody(old, ".noteMarker");
    expect(declaration(body, "border-width")).not.toContain("var(--ttg-note-mark)");
    expect(declaration(body, "border-color")).not.toContain("var(--accent-ink)");
  });
});

// -----------------------------------------------------------------------
// B. The mark itself: same corner, same CSS-drawn-triangle family, but a
//    WEDGE (wide along the top edge, shallower down the right edge) rather
//    than a 45-degree dog-ear, drawn in a variable the dark theme overrides.

describe("B. the note mark is a bigger wedge in the same corner, in theme-aware ink", () => {
  const body = ruleBody(css, ".noteMarker");

  it("canary: the .noteMarker rule was found and still pins itself to the top-right corner", () => {
    expect(body).not.toBe("");
    expect(declaration(body, "position")).toBe("absolute");
    expect(declaration(body, "top")).toBe("0");
    expect(declaration(body, "right")).toBe("0");
  });

  it("keeps the CSS-drawn triangle technique (a zero-size box with solid borders), so no row can grow to fit it", () => {
    expect(declaration(body, "width")).toBe("0");
    expect(declaration(body, "height")).toBe("0");
    expect(declaration(body, "border-style")).toBe("solid");
  });

  it("takes BOTH legs from shared density variables rather than hardcoded px, and leaves the top/left legs at 0", () => {
    const width = declaration(body, "border-width");
    expect(width).toMatch(/var\(\s*--ttg-note-mark-w\b/);
    expect(width).toMatch(/var\(\s*--ttg-note-mark\s*[,)]/);
    // No bare px anywhere OUTSIDE a var() fallback - the variables are the
    // mechanism, and a hardcoded leg would silently stop scaling.
    expect(pxValues(width.replace(/var\([^)]*\)/g, ""))).toEqual([]);
    // `0 <horizontal> <vertical> 0`: only the right and bottom legs are
    // non-zero, which is what puts the wedge in the top-right corner. Each
    // var() collapses to one token first, since a fallback contains a space.
    const legs = width.replace(/var\([^)]*\)/g, "V").split(/\s+/).filter(Boolean);
    expect(legs).toHaveLength(4);
    expect(legs[0]).toBe("0");
    expect(legs[3]).toBe("0");
  });

  it("each leg carries a fallback, so a missing variable cannot collapse the mark to `medium` borders on all four sides", () => {
    // `border-width: 0 var(--x) var(--y) 0` with either property undeclared
    // is invalid at computed-value time: the whole declaration falls back to
    // `medium` (3px) on EVERY side, which paints a small solid box rather
    // than a corner wedge - a silently broken mark, not a missing one.
    const width = declaration(body, "border-width");
    expect(width).toContain("var(--ttg-note-mark-w, 28px)");
    expect(width).toContain("var(--ttg-note-mark, 14px)");
  });

  it("the fallbacks equal what .table actually declares, so the two cannot drift apart", () => {
    const base = ruleBody(css, ".table");
    expect(pxVar(base, "--ttg-note-mark-w")).toBe(28);
    expect(pxVar(base, "--ttg-note-mark")).toBe(14);
  });

  it("clips to the painted triangle, so forced-colors mode cannot fill the whole border box", () => {
    // Under `forced-colors: active` the UA overrides all four border-colors -
    // INCLUDING the two `transparent` ones - so the border-triangle technique
    // degenerates into a solid CanvasText rectangle. Measured in Chromium via
    // CDP `Emulation.setEmulatedMedia`, and it was already true of the 7x7
    // dog-ear; at 28x14 it becomes a 392-square-pixel slab covering 23% of the
    // cell's width, and the only mark on this cell with no silhouette left
    // (the other three are inline SVG, whose fill/stroke are NOT forced).
    // The clip is exactly the painted triangle, so it changes nothing in
    // normal mode - preferred over `forced-color-adjust: none`, which would
    // override the user's chosen palette.
    expect(declaration(body, "clip-path").replace(/\s+/g, " ")).toBe("polygon(0 0, 100% 0, 100% 100%)");
  });

  it("is filled with --accent-ink (which the dark theme overrides) and NOT bare --accent (which it does not)", () => {
    const color = declaration(body, "border-color");
    expect(color).toContain("var(--accent-ink)");
    expect(color).not.toContain("var(--accent)");
  });

  it("is targeted by exactly ONE selector in the whole file, so nothing more specific can silently revert it", () => {
    // Everything else in this describe reads the LAST rule whose selector is
    // exactly `.noteMarker`. That models source order, not specificity: a
    // `.table .noteMarker` rule appended anywhere would win in a browser
    // (0,2,0 over 0,1,0) and restore the old 7px mark while every assertion
    // above still passed. Verified by regression pass 2026-08-10, which did
    // exactly that and saw zero failures.
    expect(selectorsMentioning(css, "noteMarker")).toEqual([".noteMarker"]);
  });
});

// -----------------------------------------------------------------------
// C. The size lives with the grid's other density-scaled measurements, is
//    materially bigger at every density, and fits the space it has.

describe("C. the wedge is materially bigger, scales with density, and moves no other geometry", () => {
  const base = ruleBody(css, ".table");
  const compact = ruleBody(css, '.table[data-density="compact"]');
  const comfortable = ruleBody(css, '.table[data-density="comfortable"]');
  const densities = [
    { name: "compact", body: compact },
    { name: "default", body: base },
    { name: "comfortable", body: comfortable },
  ];

  it("canary: the three density rules were found and still carry their frozen row heights", () => {
    expect(declaration(base, "--ttg-row-h")).toBe("36px");
    expect(declaration(compact, "--ttg-row-h")).toBe("32px");
    expect(declaration(comfortable, "--ttg-row-h")).toBe("44px");
  });

  it("the default wedge covers at least 8x the 24.5 square pixels the old 7x7 dog-ear did", () => {
    const area = (pxVar(base, "--ttg-note-mark-w") * pxVar(base, "--ttg-note-mark")) / 2;
    expect(area).toBeGreaterThanOrEqual(196);
  });

  it("every density is at least 5x the old mark, so compact does not quietly revert the fix", () => {
    for (const { name, body } of densities) {
      const area = (pxVar(body, "--ttg-note-mark-w") * pxVar(body, "--ttg-note-mark")) / 2;
      expect(area, `${name} density`).toBeGreaterThanOrEqual(122.5);
    }
  });

  it("the wedge is wider than it is tall - it reads along the top edge rather than as a fatter 45-degree corner", () => {
    for (const { name, body } of densities) {
      expect(pxVar(body, "--ttg-note-mark-w"), `${name} density`).toBeGreaterThan(pxVar(body, "--ttg-note-mark"));
    }
  });

  it("both legs grow strictly with the row height: compact < default < comfortable", () => {
    const heights = densities.map(({ body }) => pxVar(body, "--ttg-note-mark"));
    const widths = densities.map(({ body }) => pxVar(body, "--ttg-note-mark-w"));
    expect(heights[0]).toBeLessThan(heights[1]);
    expect(heights[1]).toBeLessThan(heights[2]);
    expect(widths[0]).toBeLessThan(widths[1]);
    expect(widths[1]).toBeLessThan(widths[2]);
  });

  it("never collides with the error mark, which owns the bottom 12px of the same right edge", () => {
    // .errorMarker is `bottom: 1px` with an 11px glyph, so it occupies the
    // last 12px of the cell's height on the right-hand side. The wedge runs
    // DOWN that same edge from the top.
    for (const { name, body } of densities) {
      const rowHeight = pxVar(body, "--ttg-row-h");
      expect(pxVar(body, "--ttg-note-mark") + 12, `${name} density`).toBeLessThanOrEqual(rowHeight);
    }
  });

  it("never reaches the status glyph, which is 15px centred in a 120px cell", () => {
    // The glyph spans x = 52.5..67.5, so anything wider than 52.5px of
    // right-edge wedge would touch it.
    for (const { name, body } of densities) {
      expect(pxVar(body, "--ttg-note-mark-w"), `${name} density`).toBeLessThanOrEqual(52);
    }
  });

  it("the status cell's frozen 120px column width and zero padding are untouched", () => {
    const cell = ruleBody(css, ".statusCell");
    expect(declaration(cell, "width")).toBe("120px");
    expect(declaration(cell, "min-width")).toBe("120px");
    expect(declaration(cell, "max-width")).toBe("120px");
    expect(declaration(cell, "padding")).toBe("0");
  });

  it("the cell's own tints are untouched - this work restyles the mark, not the hover or highlight states", () => {
    expect(declaration(ruleBody(css, ".statusButton:hover"), "background")).toBe(
      "color-mix(in srgb, var(--accent) 8%, transparent)"
    );
    expect(
      declaration(ruleBody(css, '.table[data-highlight="true"] .statusButton[data-outstanding="true"]'), "background")
    ).toBe("color-mix(in srgb, var(--warning) 10%, transparent)");
  });
});

// -----------------------------------------------------------------------
// D. The reason --accent-ink is the right token is a fact about globals.css,
//    not a comment - so pin the fact. If someone later adds --accent to the
//    dark block, or drops --accent-ink from it, group B's swap stops buying
//    anything and this check says so.

describe("D. --accent-ink is the theme-aware token and --accent is not", () => {
  const darkIdx = globalsCss.indexOf('html[data-theme="dark"] {');
  const darkBlock = globalsCss.slice(darkIdx, globalsCss.indexOf("\n}", darkIdx));

  it("canary: the dark-theme block was found and overrides the tokens it is known to override", () => {
    expect(darkIdx).toBeGreaterThan(-1);
    expect(declaration(darkBlock, "--field-background")).toBe("#1e293b");
  });

  it("the dark theme redefines --accent-ink", () => {
    expect(declaration(darkBlock, "--accent-ink")).not.toBe("");
  });

  it("the dark theme does NOT redefine --accent, which is why the mark must not use it", () => {
    expect(declaration(darkBlock, "--accent")).toBe("");
  });
});

// -----------------------------------------------------------------------
// E. The other three corner marks are untouched: all four still coexist on
//    one cell, each owning a corner no other mark touches.

describe("E. the other three corner marks keep their own corners", () => {
  it(".errorMarker still owns bottom-right", () => {
    const body = ruleBody(css, ".errorMarker");
    expect(declaration(body, "bottom")).toBe("1px");
    expect(declaration(body, "right")).toBe("1px");
  });

  it(".instructionMarker still owns bottom-left", () => {
    const body = ruleBody(css, ".instructionMarker");
    expect(declaration(body, "bottom")).toBe("1px");
    expect(declaration(body, "left")).toBe("1px");
  });

  it(".cellMenuTrigger still owns top-left", () => {
    const body = ruleBody(css, ".cellMenuTrigger");
    expect(declaration(body, "top")).toBe("1px");
    expect(declaration(body, "left")).toBe("1px");
  });

  it("all three still render inside the same button as the note mark and the status glyph", () => {
    const open = taskCellSource.indexOf("<StatusGlyph status={effectiveStatus} />");
    const close = taskCellSource.indexOf("</button>", open);
    expect(open).toBeGreaterThan(-1);
    expect(close).toBeGreaterThan(open);
    const between = taskCellSource.slice(open, close);
    expect(between).toContain("styles.noteMarker");
    expect(between).toContain("styles.instructionMarker");
    expect(between).toContain("styles.errorMarker");
  });
});

// -----------------------------------------------------------------------
// F. A purely visual change must leave every other channel byte-for-byte
//    alone - including the ones that carry the note's MEANING, so colour and
//    size are never the only thing communicating it (WCAG 1.4.1).

describe("F. the component's logic and its non-visual channels are unchanged", () => {
  it("the mark still renders off taskCellIndicatorSet's own result, never a re-derived cell.note check", () => {
    expect(taskCellSource).toContain("const indicators = taskCellIndicatorSet(cell.note, instruction, error, attachmentCount);");
    const idx = taskCellSource.indexOf("styles.noteMarker");
    expect(taskCellSource.slice(Math.max(0, idx - 60), idx)).toContain("indicators.note &&");
  });

  it("the title tooltip still carries the note text itself", () => {
    expect(taskCellSource).toContain("if (cell.note) statusTitleParts.push(cell.note);");
  });

  it("the accessible name is still built by taskCellAccessibleName, now also passing attachmentCount", () => {
    expect(taskCellSource).toContain(
      "taskCellAccessibleName(courseName, task, cell, nowMs, indicators.instruction, attachmentCount)"
    );
  });

  it("the note field's 200-char cap and commit-on-blur path are untouched", () => {
    expect(taskCellSource).toContain("onChange={(e) => setNoteDraft(e.target.value.slice(0, 200))}");
    expect(taskCellSource).toContain("onBlur={commitNote}");
  });
});
