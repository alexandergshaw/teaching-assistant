# REPO-HEADER-VISUAL W1 - VH-10 test-pin notes (test seat)

Scope: `docs/repo-header-visual-scope.md` (SHIP-checked), section 6 row VH-10 and
section 5.2 classes #3, #8, #11. These are the four source-text / CSS-text pins
the scope flags as "proposed, test seat to author", added to the EXISTING file
`src/app/components/repo-grades/repoGradesWaveASticky.structure.test.ts` in the
SAME W1 commit as the CSS. They are the ONLY gates catching two real
silent-green holes (overflow-on-header, one-input-loses-the-class); adversarial
separation requires the test seat, not the implementer, to author them.

Authored at HEAD `ebf32aea`. This document is NOTES ONLY. I did not edit any
CSS, did not edit the test file, and did not run the orphan/css gate (a
concurrent GRADING-CHAT-VISUAL build is editing grading-chat CSS; this item's
write set stays inside `src/app/components/repo-grades/`). The satisfiability of
every RED pin is PROVEN BY READING the scope's committed source changes, not by
execution here (execution is blocked by the notes-only + no-run constraint and
is the implementer's step). Each pin below states the exact post-overhaul source
that makes it GREEN and the exact mutation that makes it RED.

Everything here is a SOURCE/CSS-TEXT read. Nothing renders under vitest
(`docs/loop/this-repo.md` section 6). These prove a mechanism is PRESENT in the
text, never that it paints. What they do NOT prove is listed in section 5.

---

## 0. Instruments already in the file (reuse, do not reinvent)

`repoGradesWaveASticky.structure.test.ts` already defines, at the top:

- `read(name)` - `readFileSync(join(__dirname, name), "utf8")`.
- `withoutCssComments(css)` - strips `/* ... */`.
- `withoutLineComments(src)` - strips `/* ... */` then an UNANCHORED `//.*$`
  per line split on `/\r?\n/` (CRLF-safe; this is the approved comment-strip
  form - do NOT name it `stripComments`, it is already `withoutLineComments`).
- `ruleBlock(css, selector, from=0)` - `indexOf(selector)` then the text between
  the first `{` after it and the first `}` after that. It ALREADY asserts the
  anchor resolves at BOTH ends (`sel > -1`, `open > -1`, `close > open`), so a
  missing selector or an unterminated block fails loudly instead of silently
  widening. Brace-flat: every rule block it reads is flat (no nested braces),
  which is true of all repo-grades rule blocks.
- Module constants: `CSS`, `INDEX`, `HEADER` (RepoGradesStickyHeader.tsx),
  `RUNBAR`.

**Two additions the implementer makes once, at the top of the file (NOT imported
from any other `*.test.ts` - duplicate, per the no-cross-test-import rule):**

```ts
// VH-10: the typeahead source is not read by Wave A today; add it.
const TYPEAHEAD = withoutLineComments(read("RepoGradesGradeSetTypeahead.tsx"));

// VH-10: slice one element by its own anchors. BOTH ends must resolve, or the
// test fails here rather than silently widening to the whole file (the
// slice(start,-1) hazard). Mirrors the slice() idiom in the Wave B/C files; it
// is DUPLICATED here on purpose (importing it would re-run their describe blocks).
function sliceBetween(src: string, start: string, end: string): string {
  const a = src.indexOf(start);
  expect(a, `start anchor ${start}`).toBeGreaterThan(-1);
  const b = src.indexOf(end, a);
  expect(b, `end anchor ${end} after ${start}`).toBeGreaterThan(a);
  return src.slice(a, b);
}
```

Both anchors used below are PROVEN resolvable and PROVEN unique at HEAD:
`<input` occurs exactly once per file (StickyHeader and Typeahead), its self-
close `/>` is the first `/>` after it (the only `>` characters between are JSX
arrows `=>`, never `/>`), and lowercase `<button` occurs exactly once in the
typeahead (the MUI action buttons are capital `<Button`, which `indexOf("<button")`
does not match). The scope's TSX changes are className swaps with "no markup
structure change" (section 5.3), so these counts hold after the overhaul.

---

## 1. VH-10(a) - THE OVERFLOW BAN (functional-regression guard)

| | |
|---|---|
| Object | the `.stickyWorkingHeader` CSS rule block in `repo-grades.module.css` |
| Instrument | `ruleBlock(CSS, ".stickyWorkingHeader")`, then `.not.toMatch` an `overflow` property declaration |
| Direction of failure | adding ANY `overflow` (auto/scroll/hidden/clip) to the header block => RED |

**Why it is needed.** The typeahead listbox is absolutely positioned, hangs
BELOW the header (`top: 100%`, z-index 5) and must escape the header box
(scope section 2.3, class #11). If the overhaul gives the header
`overflow: hidden/auto/clip`, the popup is clipped and the control silently
breaks. NO existing pin catches this: W-A3 (`:64-71`) only asserts the PRESENCE
of position/top/left/z-index/background; it never bans a property. The header
must have NO `overflow` at all (scope class #3: "NO overflow").

**Pin (exact):**

```ts
it("VH-10(a): .stickyWorkingHeader never clips (no overflow => popup escapes)", () => {
  const block = ruleBlock(CSS, ".stickyWorkingHeader");
  expect(block).not.toMatch(/overflow(?:-x|-y)?\s*:/);
});
```

- Instrument: `ruleBlock(CSS, ".stickyWorkingHeader")` (first occurrence; see the
  shared-assumption note R1 in section 6).
- Regex: `/overflow(?:-x|-y)?\s*:/` matches the property declaration
  `overflow:`, `overflow-x:`, or `overflow-y:` with optional space before the
  colon. It catches EVERY clipping value (auto, scroll, hidden, clip) because it
  anchors on the property, not the value. No `/s` flag, no `\u` escape.

**GREEN (proven by reading):** the overhauled block (scope class #3) is
`position; top; left; z-index; background; display:flex; flex-wrap; align-items;
gap; padding; border-bottom` - none contains the substring `overflow`, so
`.not.toMatch` passes. The HEAD block (lines 29-35) also has no overflow, so the
pin is green today too (it is a forward guard, not a red TDD pin).

**Sabotage (named, discriminating):** add `overflow: auto;` (or `hidden`) to the
`.stickyWorkingHeader` rule in `repo-grades.module.css`. The regex matches =>
`.not.toMatch` fails => RED. Restore (delete the line) => GREEN. Discriminates:
RED only under the mutation, GREEN otherwise. No OTHER pin in the suite reddens
on this mutation (W-A1 bans overflow only on the SHELL's absence, W-A2 only
flags an overflow block that LACKS max-height - an `overflow:auto` WITH a
max-height on the header would sail past W-A2 and is exactly what this catches).

---

## 2. VH-10(b) - BOTH INPUTS CARRY THE SHARED CLASS (reachability, one per file)

| | |
|---|---|
| Object | the search `<input>` (RepoGradesStickyHeader.tsx) AND the typeahead `<input>` (RepoGradesGradeSetTypeahead.tsx) |
| Instrument | `sliceBetween(file, "<input", "/>")` per file, then assert the slice references `styles.headerInput` |
| Direction of failure | dropping the class from EITHER input => RED (while the orphan ratchet stays GREEN) |

**Why it is needed, and why the ratchet cannot do it.** The overhaul gives BOTH
inputs one shared class `.headerInput` (scope class #8: "Applied to BOTH
inputs"). The orphan ratchet (`page-module-css-orphan-classes.test.ts`) asserts
every DEFINED class is referenced SOMEWHERE in the TSX closure. If ONE input
silently loses `styles.headerInput`, the class is STILL referenced by the other
input, so the ratchet stays GREEN - the regression is invisible to it. No Wave
B/C pin checks the class either: Wave B (`:94-98`) checks the search input's
`value`/`onSearchChange`/`aria-label`; Wave C (`:65-73`) checks the typeahead's
props and bans selection-state, never the class. This pin is the only gate.

**Pin (exact):**

```ts
it("VH-10(b): both header inputs carry the shared .headerInput class", () => {
  const searchInput = sliceBetween(HEADER, "<input", "/>");
  expect(searchInput, "search input (StickyHeader) must carry styles.headerInput")
    .toMatch(/styles\.headerInput\b/);

  const typeaheadInput = sliceBetween(TYPEAHEAD, "<input", "/>");
  expect(typeaheadInput, "typeahead input must carry styles.headerInput")
    .toMatch(/styles\.headerInput\b/);
});
```

- Anchors: `<input` ... `/>` per file. `sliceBetween` asserts BOTH ends resolve.
- Regex `/styles\.headerInput\b/`: pins the FACT (this input element references
  the `headerInput` CSS-module class) without over-specifying the spelling of
  the attribute. The `\b` prevents a false green on a longer name like
  `headerInputWide`. Inside an `<input ... />` slice there is no attribute other
  than `className` that would take `styles.headerInput`, so this is the input's
  class.

**GREEN (proven by reading):** scope class #8 applies `.headerInput` to both
inputs; scope section 5.3 swaps `style={SEARCH_INPUT_STYLE}` ->
`className={styles.headerInput}` on the StickyHeader input and each `style=` ->
the matching class on the typeahead (so its `<input>` gets
`className={styles.headerInput}`). Both slices then contain `styles.headerInput`.

**Sabotage (named, discriminating - and this IS the point of the pin):** in
`RepoGradesGradeSetTypeahead.tsx`, revert the typeahead input's
`className={styles.headerInput}` to any non-referencing form (delete the
attribute, or restore `style={INPUT_STYLE}`). The typeahead slice no longer
matches => VH-10(b) RED. Restore => GREEN. CRUCIAL DISCRIMINATION: under this
sabotage the orphan ratchet STAYS GREEN, because the StickyHeader search input
still references `styles.headerInput`, so the class is not orphaned. VH-10(b) is
the single instrument that distinguishes "both inputs carry it" from "the class
is referenced somewhere". Run the ratchet alongside (section 7) to SHOW it stays
green under this mutation - that demonstration is what proves the pin earns its
place.

---

## 3. VH-10(c) - THE LISTBOX STAYS ABOVE AND BOUNDED

| | |
|---|---|
| Object | the NEW `.gradeSetList` CSS rule block (replaces the inline `LIST_STYLE`) |
| Instrument | `ruleBlock(CSS, ".gradeSetList")`, then assert position/top/z-index/max-height |
| Direction of failure | the listbox loses `z-index: 5` (drops below the thead) or `max-height` => RED |

**Why it is needed, and the honest overlap.** The popup must stack ABOVE the
sticky thead (thead is z-index 2; the listbox must stay z-index 5) and must be
height-bounded. `z-index` on the listbox is caught by NOTHING today - that is
the unique kill this pin owns. `max-height` is PARTIALLY covered by W-A2
(`:48-57`), which flags any `overflow: auto/scroll` block that lacks a
`max-height`; since `.gradeSetList` keeps `overflow-y: auto`, W-A2 would catch a
dropped `max-height` AS LONG AS the overflow stays. This pin also pins
`position: absolute` and `top: 100%` - the "hangs below the header" facts that
make VH-10(a)'s overflow ban meaningful (a non-absolute, in-flow list would not
be clipped by the header and the overflow ban would be moot). I state the max-
height overlap plainly rather than claim an exclusive kill for it; the z-index
assertion is the exclusive kill.

**Pin (exact):**

```ts
it("VH-10(c): .gradeSetList hangs below the header, above the thead, and is bounded", () => {
  const block = ruleBlock(CSS, ".gradeSetList");
  expect(block).toMatch(/position\s*:\s*absolute/);
  expect(block).toMatch(/top\s*:\s*100%/);
  expect(block).toMatch(/z-index\s*:\s*5\b/);
  expect(block).toMatch(/(^|[\s;{])max-height\s*:/);
});
```

- The `max-height` regex reuses W-A1's exact form for consistency.
- `/z-index\s*:\s*5\b/`: the `\b` prevents a false green on `z-index: 50`.

**GREEN (proven by reading):** scope class #11 keeps the values of `LIST_STYLE`
(`Typeahead:37-52`): `position: absolute; top: 100%; left: 0; z-index: 5;
max-height: 240px; overflow-y: auto; min-width: 260px; ...` and ADDS
`box-shadow`. All four asserted facts are present.

**NOTE - this pin is RED until the CSS lands, by design.** `.gradeSetList` does
not exist at HEAD (it is a new class this overhaul creates). Before the CSS,
`ruleBlock(CSS, ".gradeSetList")` fails its own `sel > -1` anchor assertion =>
RED. After the W1 CSS defines the class => GREEN. This is correct for a pin
authored in the SAME commit as the CSS it guards (scope section 6). It is the
one TDD-red pin of the four; the other three are forward guards that are green
before and after and red only under their sabotage.

**Sabotage (named, discriminating):** change `z-index: 5` to `z-index: 1` in
`.gradeSetList`. `/z-index\s*:\s*5\b/` fails => RED; restore => GREEN. This
mutation is caught by NO other pin (W-A4's z-index pin is on the thead, not the
listbox). A SECOND, independent mutation for the bound: delete `max-height:
240px`. VH-10(c) reds on the max-height assertion; W-A2 ALSO reds (because
`overflow-y: auto` remains) - so for max-height the two pins corroborate. If the
implementer wants a max-height mutation that ONLY VH-10(c) catches, delete BOTH
`max-height` and `overflow-y: auto` together: then W-A2 stays green (no overflow
block to flag) and VH-10(c) is the sole RED. Prefer the `z-index: 5 -> 1`
mutation as the clean discriminator.

---

## 4. VH-10(d) - THE CHIP REMOVE BUTTON KEEPS ITS ACCESSIBLE NAME

| | |
|---|---|
| Object | the chip remove `<button>` in RepoGradesGradeSetTypeahead.tsx (Typeahead:123) |
| Instrument | `sliceBetween(TYPEAHEAD, "<button", "</button>")`, then assert its `aria-label` |
| Direction of failure | dropping the `aria-label` (or its grade-set wording) from the remove button => RED |

**Why it is needed.** The remove button's only visible content is the literal
`x` (Typeahead:124). Its sole accessible name is
`aria-label={`Remove ${row.repo} from the grade set`}` (Typeahead:123). The
overhaul ADDS `className={styles.gradeSetChipRemove}` to this button (scope
section 5.3); the risk is the className swap accidentally drops the aria-label,
yielding an unlabeled "x" button - an a11y regression nothing renders to expose.
No existing pin covers it: Wave B (`:97`) checks the SEARCH input's aria-label
(contains "search"), never the remove button; Wave C checks none.

**Pin (exact):**

```ts
it("VH-10(d): the chip remove button keeps its grade-set remove aria-label", () => {
  const removeBtn = sliceBetween(TYPEAHEAD, "<button", "</button>");
  expect(removeBtn).toContain("aria-label");
  expect(removeBtn).toContain("from the grade set");
});
```

- Anchor `<button` ... `</button>`: lowercase `<button` is unique in the file
  (MUI are `<Button`); `sliceBetween` asserts both ends resolve.
- Two `toContain` assertions pin the FACT twice: the button is labeled, and the
  label is the GRADE-SET remove label (the phrase `from the grade set`), not
  some other aria-label. Pinning the phrase (not the full template spelling)
  avoids over-specification while still distinguishing it from the input's
  "Choose repositories to grade" label.

**GREEN (proven by reading):** scope section 5.3: "role, aria-*, handlers and the
`x` text untouched" on the typeahead; only `className` is added to the remove
button. The slice still contains `aria-label={`Remove ${row.repo} from the grade
set`}` => both `toContain` pass.

**Sabotage (named, discriminating):** delete the
`aria-label={`Remove ${row.repo} from the grade set`}` attribute from the remove
`<button>`. The slice no longer contains `aria-label` nor `from the grade set`
=> RED (both assertions). Restore => GREEN. Discriminates: no other pin reddens
on this mutation.

---

## 5. Executable here vs argued (labelled)

**EXECUTABLE under vitest (node env, source-text reads) once the implementer
adds them** - pins (a), (b), (c), (d). I could NOT execute them in this seat:
authoring is notes-only, and running requires writing the test code plus the CSS,
which is the implementer's step and is fenced off by the concurrent CSS edit.
Satisfiability is instead PROVEN BY READING the scope's committed source changes
(each pin above states the exact GREEN source and the exact RED mutation). The
implementer MUST, after adding the pins + CSS, watch each sabotage go RED and the
restore go GREEN (cp-backup the mutated file first; `git checkout --` reverts to
the index and can destroy uncommitted chunk work - see MEMORY
"sabotage-restore-needs-a-copy").

**ARGUED ONLY, never asserted by these pins (owner walk / Browser pane):**
- that the popup actually paints ABOVE the thead and is NOT clipped on screen
  (scope R3, R11) - VH-10(a)+(c) prove the text mechanism, not the pixels;
- that the remove button is actually announced by a screen reader (scope R11) -
  VH-10(d) proves the attribute is present in source, not that AT reads it;
- that both inputs actually look identical/aligned (scope R1) - out of scope for
  a text pin.

These are reading/visual claims by construction (nothing renders under vitest);
they belong to the verify seat and the owner walk, not to a green suite.

---

## 6. Residual register

| Id | Residual | Owner | Instrument | Step that measures it |
|---|---|---|---|---|
| R1 | VH-10(a) and W-A3 both assume the FIRST `.stickyWorkingHeader` occurrence is the main rule; VH-10(c) assumes the first `.gradeSetList`. True at authoring (one occurrence each; the overhaul adds no `.stickyWorkingHeader`/`.gradeSetList` DESCENDANT selector). | W1 implementer / verifier | `grep -c '.stickyWorkingHeader' repo-grades.module.css` after the overhaul; if a descendant selector is ever added BEFORE the main rule, both pins must switch to a brace-anchored selector | verify step |
| R2 | VH-10(c) `max-height` assertion overlaps W-A2 while `overflow-y:auto` remains (stated, not hidden). The z-index assertion is the exclusive kill. | W1 verifier | run both pins under the dual mutations in section 3 | sabotage check |
| R3 | VH-10(c) is RED until the CSS class exists (by design, same-commit). | W1 implementer | the pin's own anchor assertion | W1 build |
| R4 | On-screen clipping / stacking / SR-announcement (scope R3, R11) | owner + verify seat | Browser pane, manual Tab/Escape/Enter + popup-open screenshot | owner walk |

None of the above is a deletion: each names owner, instrument, and the step that
measures it.

---

## 7. Gate commands (every quantity names its command)

Single file (the implementer's quick loop over just these pins), one path, so a
bare run is acceptable - but `test:paths` is fine too:

```
npm run test:paths -- src/app/components/repo-grades/repoGradesWaveASticky.structure.test.ts
```

VH-10(b) discrimination demonstration - the pin reds while the orphan ratchet
stays green (TWO files, so `test:paths` is MANDATORY; a raw multi-path `vitest`
silently drops an unmatched argument):

```
npm run test:paths -- \
  src/app/components/repo-grades/repoGradesWaveASticky.structure.test.ts \
  src/app/components/courses/page-module-css-orphan-classes.test.ts
```

Full W1 regression is the scope's ten-argument `npm run test:paths` set
(`docs/repo-header-visual-scope.md` section 11): quote the per-argument
`COVERED` / `NOT COVERED` line for each path and the `Tests N passed` total. Do
NOT run the orphan/css gate from THIS seat while the sibling GRADING-CHAT-VISUAL
build is editing CSS; that is the implementer's/verifier's step inside this
item's own write set.

---

## 8. Build reminder for the implementer (NOT a pin - VH-9 tsc/lint)

Deleting the inline-style constants leaves a `type CSSProperties` import unused.
tsc/eslint (VH-9) will RED unless the implementer drops it in the SAME edit:

- `RepoGradesStickyHeader.tsx:11` -
  `import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";`
  After deleting `SEARCH_INPUT_STYLE` (`:16-25`, its only use), DROP
  `type CSSProperties` -> `import { useEffect, useRef, type ReactNode } from "react";`.
  Also remove the stale `:15` comment ("no new CSS class: the orphan ratchet is
  exact") - it is wrong as a rule (the ratchet moves only for UNREFERENCED
  classes; see scope section 7).
- `RepoGradesGradeSetTypeahead.tsx:10` -
  `import { useState, type CSSProperties } from "react";`
  After deleting all six inline constants (`WRAP_STYLE`, `INPUT_STYLE`,
  `CHIP_STYLE`, `LIST_STYLE`, `OPTION_STYLE`, `STATUS_STYLE`, `:16-54`), DROP
  `type CSSProperties` -> `import { useState } from "react";`.
- `RepoGradesGradeSetTypeahead.tsx` imports NO stylesheet today. It now
  references `styles.headerInput`, `styles.gradeSet`, `styles.gradeSetChip`,
  `styles.gradeSetChipRemove`, `styles.gradeSetList`, `styles.gradeSetOption`,
  `styles.gradeSetStatus`, so it MUST add
  `import styles from "./repo-grades.module.css";` (scope section 5.3) or
  VH-10(b)/(c)/(d) and tsc all fail. StickyHeader already imports `styles`.
```
