# Repo Grades - Wave A (sticky working-header SHELL) - test notes

Backlog RG-SEARCH-STICKY, Wave A. Scope: `docs/repo-grades-search-sticky-scope.md`
(SHIPped; round-2 blocker resolved by transcription, commit 45cc8001). Wave A is
the FIRST and independently-verifiable wave: the sticky working-header SHELL,
CSS-and-wiring only. NO search / typeahead / auto-filter logic (Waves B/C).

Authoring seat: test-notes / oracle. This file is NOTES for the Wave A
implementer and the loop-checker. It writes no production and no test code. Every
quantity below names the command that produced it; every CSS instrument was run
against the real source before being written down (see section 3).

---

## 0. Measured facts (every quantity names its command)

Line counts via `@(Get-Content <file>).Count` in PowerShell on 2026-10-04 (the
mandated instrument; `Measure-Object -Line` is banned here):

| File | Lines | Note |
|---|---|---|
| `src/app/components/repo-grades/index.tsx` | **960** | 40 under the 1000 ceiling - the binding constraint |
| `src/app/components/repo-grades/repo-grades.module.css` | **895** | the CSS subject of this wave |
| `src/app/components/repo-grades/RepoGradesRunBar.tsx` | **115** | relocated into the sticky header this wave |
| `src/app/components/repo-grades/RepoGradesGrid.tsx` | **641** | holds `.gridWrap` + the `<table>`/thead |

Root count via `(Get-ChildItem ... non-test non-.d.ts .ts/.tsx | Measure).Count`
= **35** - matches `FROZEN_REPO_GRADES_ROOTS` in
`repoGradesFeedbackAndFiles.wiring.test.ts:304-345` and its `it(...)` title
"exactly the 35 frozen basenames" (`:348`). Adding `RepoGradesStickyHeader.tsx`
takes it to **36**.

CSS uses **CRLF** line endings (measured: the `.gridWrap` block came back with
`\r\n`). Every comment-strip / slice helper written for this wave must be
CRLF-safe. Nothing renders under vitest (node-env, collects only
`src/**/*.test.ts`), so every structural/scroll/sticky behaviour is a SOURCE or
CSS-text pin or an OWNER browser check - never a render assertion.

---

## 1. Wave A scope boundary (what IS and is NOT in this wave)

IN (CSS + wiring only):
- Fix the sticky root cause: the ONE bounded scroll shell `.stickyShell`
  (`max-height` + `overflow:auto`) with two sticky tiers inside - the working-
  header container (`position:sticky; top:0; left:0; z-index:3`) and the table
  whose `thead th` is `position:sticky; top:var(--rg-working-header-h); z-index:2`.
- NEW `RepoGradesStickyHeader.tsx` (new R-2 root), mounted in index.tsx.
- RELOCATE the existing run bar (`RepoGradesRunBar.tsx`) into the sticky header
  as a tier. The search box and typeahead are EMPTY / not-yet-present slots
  (Waves B/C populate them); do not add them in Wave A.
- `--rg-working-header-h` is published by a ResizeObserver on the header element
  (recommended mechanism, scope F2-a) so the thead offset tracks the header's
  rendered height.

OUT (and a Wave A change touching these REDS a scope-boundary pin or the git gate):
- NO search / typeahead / auto-filter. No `repoGradesSearch.ts`,
  `repoGradesGradeSet.ts`, `repoGradesVisibleRows.ts`, no `visibleRepoRows`,
  `bodyRows` or `planRows` identifiers anywhere in Wave A's touched files.
- NO change to any plan-count / label / disabled logic. The run bar is RELOCATED
  with the SAME props and SAME `rows` value it has today (`displayedRows`), not
  re-wired. Its `selectionOnly: bulkSelectionOnly` (`RepoGradesRunBar.tsx:66`)
  and `scopedToSelection: bulkSelectionOnly && selected.size > 0` (`:70`) stay
  verbatim.
- NO touch to the F3-c grade-execution site
  (`useRepoGradesGradingActions.ts:784`: `... selectionOnly: bulkSelectionOnly })`)
  and NO touch to the grid's grade-plan expression
  (`RepoGradesGrid.tsx:350/:352`). Those are Wave C (F3-c=X). They are not in
  Wave A's write set; the `git status --short` gate is their primary guard, and
  W-A10 adds a source pin on the one file Wave A does edit (the run bar).
- NO new storage key. `repoGradesStorageKeys.structure.test.ts` `FROZEN_KEYS`
  stays **18**.

Independent verifiability (why this is a legitimate standalone wave): with just
the run bar + thead present, the owner can confirm "the working header and the
column header stick together all the way down the scroll" (AC-F2-4 owner walk).
Nothing search/selection-shaped is needed to verify the shell.

---

## 2. Executable here vs argued-only (be honest about the instrument)

EXECUTABLE (machine-checkable in vitest, node-env, no render):
- Every CSS-text structure pin in section 4 (W-A1..W-A5): class-rule-block
  slices and a file-wide bounded-scroll invariant, proven to discriminate in
  section 3.
- Source-text wiring pins (W-A6..W-A10): import+render reachability, run-bar
  relocation, var publish/consume, scope-boundary absence pins.
- The three ratchet/canary obligations (W-A11..W-A13): R-2 roots, orphan count,
  file-size ceiling.

ARGUED ONLY / mechanism proxy (SOURCE proves the mechanism is PRESENT, NOT that
it works on screen - labelled as such wherever it appears):
- That the thead actually sticks to `.stickyShell` rather than to `.gridWrap` or
  the page. `position:sticky` engages only when no ancestor clips overflow and
  the scroll container is the intended one - unobservable in vitest. Pinned as a
  proxy (the bounded shell exists + the old unbounded scroll container is gone +
  the thead offset references the header height); the real check is OWNER
  AC-F2-4.
- That `--rg-working-header-h` resolves to the CORRECT rendered height under
  wrap. W-A9 pins only that the var is published (JS side) and consumed (CSS
  side); the rendered value is owner residual R6.
- That the two tiers "travel together" / the header does not eat the viewport /
  both themes / narrow width. OWNER AC-F2-4 and AC-F2-5.

---

## 3. CSS-structure helpers and the ONE pin most likely to be built loose

All CSS pins share a robust slice construction, modelled on the SHIPPED W3 sticky
pins (`grading-chat/GradingChatPanel.structure.test.ts` `ruleBlock`, and
`walkthrough-announcement/...structure.test.ts` W3-F-STICKY). Duplicate these
helpers into the new test; do NOT import from another `*.test.ts`. Name the CSS
stripper `withoutCssComments` and the source stripper `withoutLineComments` - do
NOT name either `stripComments` and do NOT write that literal anywhere in the new
test (`src/tools/strip-comments-agreement.structure.test.ts` enumerates every
`*.test.ts` that mentions it and reddens the gate repo-wide until classified).

```
// CRLF-safe. CSS has no line comments, so block-only is enough for CSS.
function withoutCssComments(css) { return css.replace(/\/\*[\s\S]*?\*\//g, ""); }
// For .tsx/.ts source: block comments, then an UNANCHORED line-comment strip
// per line (the anchored /^[ \t]*\/\/.*$/gm form is trailing-comment-blind and
// has an executed defeat on record in this repo).
function withoutLineComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/).map((l) => l.replace(/\/\/.*$/, "")).join("\n");
}
// Rule-block slice: BOTH anchors must resolve (assert > -1 and close > open).
function ruleBlock(css, selector) {
  const sel = css.indexOf(selector);
  expect(sel, `expected a ${selector} rule`).toBeGreaterThan(-1);
  const open = css.indexOf("{", sel);
  const close = css.indexOf("}", open);
  expect(open, `open brace for ${selector}`).toBeGreaterThan(-1);
  expect(close, `close brace for ${selector}`).toBeGreaterThan(open);
  return css.slice(open + 1, close);
}
```

**FLAGGED - the sticky pin is the one most likely to be built loose.** The grid
ALREADY has a `position: sticky` thead (`repo-grades.module.css:50-57`) AND the
run bar already has `.runBar { position: sticky; top: 0 }` (`:871-883`). A bare
file-wide `/position:\s*sticky/` match therefore passes VACUOUSLY on code that
fixed nothing. Every sticky pin below MUST slice the SPECIFIC class's own rule
block (both anchors resolve) and assert the property WITHIN that slice. The thead
offset pin must assert `top: var(--rg-working-header-h`, not a bare `top:` - the
whole point of Wave A is that the thead stops using `top: 0` (which overlaps the
header) and references the header height instead.

I ran the four trickiest instruments against the REAL current CSS to prove they
RED today (TDD) and discriminate:

| Instrument | Result on current source | Means |
|---|---|---|
| File-wide bounded-scroll invariant (every block with `overflow[-x|-y]:auto\|scroll` also has `max-height`) | **1 unbounded block today** (`.gridWrap`) | RED today, GREEN after fix. Discriminates. |
| thead base-rule slice: has `top: var(--rg-working-header-h`? | **false** (`top: 0` today) | offset pin RED today, GREEN after fix. Discriminates. |
| `.stickyShell` / `.stickyWorkingHeader` present? | **false / false** | existence pins RED today. |
| `.gridWrap` block today | `overflow-x: auto; border...; border-radius...` (no `max-height`) | the exact bug line the fix removes. |

(Command: `node -e` reading the file, `.replace(/\/\*...\*\//g,"")`, then the
per-instrument match. Reproduce before building.)

---

## 4. Requirements - object, instrument, direction, sabotage

Each names the OBJECT under comparison, the INSTRUMENT, the DIRECTION of failure,
a named SABOTAGE that goes RED then GREEN after restore, and whether the sabotage
DISCRIMINATES.

### W-A1 - the one bounded scroll shell EXISTS (CSS)
- OBJECT: the `.stickyShell` rule block.
- INSTRUMENT: `ruleBlock(withoutCssComments(css), ".stickyShell")`; assert it
  matches `/max-height\s*:/` AND `/overflow\s*:\s*(auto|scroll)/` (or
  `overflow-y`). Both anchors of `ruleBlock` resolve.
- DIRECTION: fails if `.stickyShell` is absent (anchor unresolved) or is not
  bounded (no `max-height`) - i.e. the current unbounded state.
- SABOTAGE: delete `max-height` from `.stickyShell` -> RED; restore -> GREEN.
  DISCRIMINATES (an unbounded shell is exactly the root-cause bug reintroduced).

### W-A2 - the OLD unbounded scroll container is gone (the bug is resolved) (CSS)
This is the counterpart to W-A1 and the direct kill of the root cause
(`repo-grades.module.css:21-25` - `.gridWrap { overflow-x: auto }` with no
bounded height makes the full-height wrapper the scroll container, so the thead
sticks to nothing).
- OBJECT (primary, class-agnostic): every rule block in the file that declares a
  horizontal/both-axis scroll container.
- INSTRUMENT (file-wide bounded-scroll invariant): over `withoutCssComments(css)`,
  for every match of `/overflow(?:-x|-y)?\s*:\s*(auto|scroll)/g`, slice the
  ENCLOSING rule block as `css.slice(css.lastIndexOf("{", idx)+1,
  css.indexOf("}", idx))` (innermost rule - correct even inside `@media`, since
  the inner rule's braces are nearer) and assert that slice contains
  `/max-height\s*:/`. Proven on current source: exactly ONE block fails today
  (`.gridWrap`), so the invariant is RED today and GREEN only once the fix lands.
- OBJECT (reinforcing, per-class): IF `.gridWrap` still exists as a rule, its
  block must NOT contain `overflow-x: auto|scroll` or `overflow: auto|scroll`
  (recommended fix: keep `.gridWrap` as a plain non-scroll wrapper and simply
  remove `overflow-x`, so `styles.gridWrap` in `RepoGradesGrid.tsx` stays valid -
  see note below). This per-class pin is secondary because removal is also a
  valid shape; the file-wide invariant above is the authoritative one and
  handles both "removed" and "repurposed".
- DIRECTION: fails if any unbounded scroll container survives.
- SABOTAGE: restore `overflow-x: auto` to `.gridWrap` (no `max-height`) -> the
  invariant RED; remove it again -> GREEN. DISCRIMINATES - this is the exact
  failure mode the wave exists to fix.
- NOTE for the implementer: `page-module-css-classes.test.ts` checks the OTHER
  direction (every `styles.x` resolves to a defined class). If you REMOVE
  `.gridWrap` from the stylesheet you must also remove its `styles.gridWrap`
  reference in `RepoGradesGrid.tsx`, or that sibling test REDS. The least-churn
  path is: keep `.gridWrap`, drop only its `overflow-x`. Run that sibling test
  too if you touch class names.

### W-A3 - the working-header container is a sticky top tier (CSS)
- OBJECT: the `.stickyWorkingHeader` rule block.
- INSTRUMENT: `ruleBlock(withoutCssComments(css), ".stickyWorkingHeader")`;
  assert it matches `/position\s*:\s*sticky/`, `/top\s*:\s*0\b/`,
  `/left\s*:\s*0\b/` (scope 2.2: left-pinned so it does not drift when the shell
  scrolls horizontally), `/z-index\s*:\s*3\b/`, and an opaque background token
  (`/background\s*:\s*var\(/`, scope 2.2/AC-F2-3: rows must not show through).
- DIRECTION: fails if the header is not sticky, is not left/top-pinned, is below
  the thead in z-order, or is transparent.
- SABOTAGE: remove `position: sticky` from `.stickyWorkingHeader` -> RED;
  restore -> GREEN. DISCRIMINATES (sliced to this class, so it cannot pass
  vacuously on the pre-existing `.runBar`/thead stickies).

### W-A4 - the thead offset REFERENCES the header height, z-index 2 (CSS)
- OBJECT: the FIRST `.grid thead th` rule (the base rule at `:50`; the narrow-
  width override at `:511-513` is the SECOND occurrence - see W-A5).
- INSTRUMENT: `ruleBlock(withoutCssComments(css), ".grid thead th")` (first
  match); assert `/position\s*:\s*sticky/` AND
  `/top\s*:\s*var\(--rg-working-header-h/` AND `/z-index\s*:\s*2\b/` AND the
  opaque `background: var(` stays. The `top` assertion is the load-bearing one -
  it must reference the var, NOT a literal.
- DIRECTION: fails if `top` is a literal `0` (overlaps the header) or the var
  reference is absent, or z-index is not raised to 2.
- SABOTAGE: change the thead `top` back to `0` -> RED (proven: the current
  `top: 0` already makes this pin RED today); restore
  `var(--rg-working-header-h, <fallback>)` -> GREEN. DISCRIMINATES.
- NOTE: z-order is header 3 > thead 2 > body (scope 2.5). The run bar's old
  standalone `.runBar { z-index: 2 }` is subsumed into the header's 3; if the run
  bar keeps its own `.runBar` sticky inside the header that is harmless, but the
  thead's 2 and header's 3 are the pinned facts.

### W-A5 - narrow-width posture preserved (CSS; partly reading claim)
- OBJECT: the `@media (max-width: 700px)` block's `.grid thead th` override
  (`:511-513`, the SECOND `.grid thead th` occurrence).
- INSTRUMENT: find the SECOND occurrence of `.grid thead th` (e.g.
  `css.indexOf(".grid thead th", css.indexOf(".grid thead th") + 1)`), slice its
  block, assert `/position\s*:\s*static/` survives. Then assert that if
  `.stickyShell` appears inside the `@media (max-width: 700px)` block it either
  sets `max-height` to `none`/a cap or `overflow: visible` (un-stick/cap at
  narrow width, consistent with the existing thead un-stick). If the shell is not
  re-declared at narrow width, this second assertion is vacuously satisfied -
  which is acceptable and a READING CLAIM (the real narrow-width behaviour is
  OWNER AC-F2-5).
- DIRECTION: fails if the narrow-width thead un-stick is deleted.
- SABOTAGE: delete the `position: static` narrow-width override -> RED; restore
  -> GREEN. DISCRIMINATES for the un-stick; the shell-at-narrow assertion is
  argued (owner AC-F2-5), say so.

### W-A6 - RepoGradesStickyHeader.tsx is MOUNTED in index.tsx (reachability) (SOURCE)
- OBJECT: `index.tsx` imports AND renders the new component.
- INSTRUMENT: over `withoutLineComments(INDEX_SOURCE)`, assert
  `/import\s+RepoGradesStickyHeader\s+from\s+["']\.\/RepoGradesStickyHeader["']/`
  AND `/<RepoGradesStickyHeader\b/`. An import alone is NOT enough (dead import),
  mirroring `walkthrough-announcement.structure.test.ts`'s "an import alone
  proves nothing".
- DIRECTION: fails if the component exists but nothing mounts it (ships dead).
- SABOTAGE: delete the `<RepoGradesStickyHeader` mount (keep the import) -> RED;
  restore -> GREEN. DISCRIMINATES.

### W-A7 - the run bar is RELOCATED into the sticky header, not duplicated (SOURCE)
- OBJECT: who renders `<RepoGradesRunBar`.
- INSTRUMENT:
  - `RepoGradesStickyHeader.tsx` imports AND renders `<RepoGradesRunBar` (over
    `withoutLineComments`): `/import\s+RepoGradesRunBar\s+from/` AND
    `/<RepoGradesRunBar\b/`.
  - `index.tsx` NO LONGER renders it directly: assert
    `withoutLineComments(INDEX_SOURCE)` does NOT match `/<RepoGradesRunBar\b/`
    (the relocation actually happened; it was not left in place or double-
    mounted).
- DIRECTION: fails if the run bar still renders in index.tsx (double mount /
  not relocated) or is absent from the sticky header.
- SABOTAGE A: leave the `<RepoGradesRunBar` mount in index.tsx -> the "no longer
  in index.tsx" assertion RED. SABOTAGE B: remove `<RepoGradesRunBar` from the
  new component -> the "renders it" assertion RED. Both restore -> GREEN. Both
  DISCRIMINATE.

### W-A8 - the shell encloses both tiers (SOURCE ordering proxy; nesting is OWNER)
RECOMMENDED reading (see FORK A-SHELL-SCOPE): `.stickyShell` and both sticky
tiers live in `RepoGradesStickyHeader.tsx`, which renders
`.stickyShell` > `.stickyWorkingHeader` (holding the run bar) > `{children}`,
and index.tsx passes the grid as that child
(`<RepoGradesStickyHeader ...>{model && <RepoGradesGrid .../>}</RepoGradesStickyHeader>`).
- OBJECT: the render order inside `RepoGradesStickyHeader.tsx`.
- INSTRUMENT: over `withoutLineComments(STICKY_HEADER_SOURCE)`, let
  `shell = indexOf("stickyShell")`, `hdr = indexOf("stickyWorkingHeader")`,
  `kids = indexOf("{children}")`; assert all three resolve (> -1) and
  `shell < hdr < kids`. Separately assert the run bar mount sits after `hdr` and
  before `kids` (`indexOf("<RepoGradesRunBar")` between them). This is the same
  ordering-with-resolved-anchors proxy the shipped W3 pins use (e.g. W3-R4's
  grid-enclosure). It proves the SOURCE places the tiers inside the shell; it
  does NOT prove the DOM scroll-container relationship (OWNER AC-F2-4).
- DIRECTION: fails if the working header or the grid children render OUTSIDE the
  `.stickyShell` wrapper in source order.
- SABOTAGE: move the `{children}` mount before the `.stickyShell` open (outside
  the shell) -> RED; restore -> GREEN. DISCRIMINATES in source; label as a
  proxy.
- NOTE: if the owner takes the alternative (index.tsx owns the `.stickyShell`
  wrapper), re-anchor this pin on `index.tsx` instead; the CSS facts W-A1..W-A4
  and the owner walk are unchanged.

### W-A9 - --rg-working-header-h is PUBLISHED and CONSUMED (SOURCE + CSS proxy)
- OBJECT: the custom property publish side (JS) and consume side (CSS).
- INSTRUMENT:
  - Consume: W-A4 already asserts the thead reads `var(--rg-working-header-h`.
  - Publish: assert `RepoGradesStickyHeader.tsx` source contains the literal
    `--rg-working-header-h` (set via `style.setProperty("--rg-working-header-h"`
    or an inline `style={{ "--rg-working-header-h": ... }}`), so the var is not
    dead/undefined and the CSS fallback is not the only value. Recommended
    mechanism: a `ResizeObserver` on the header element (scope F2-a); pin the
    var publish, NOT the exact API, to avoid over-specifying.
- DIRECTION: fails if the thead references a var nothing ever sets (silent
  overlap, falling back to the token default forever).
- SABOTAGE: delete the `setProperty("--rg-working-header-h"...)` call -> the
  publish assertion RED; restore -> GREEN. DISCRIMINATES that the mechanism is
  PRESENT. It does NOT prove the measured value is correct - that is OWNER
  residual R6; say so.

### W-A10 - SCOPE BOUNDARY: Wave A does not change plan logic or start Wave C (SOURCE)
This is the "leaves the run bar's plan inputs unchanged" pin the brief requires.
- OBJECT: the run bar's grade-plan expressions, and the absence of Wave C row-
  split identifiers in Wave A's touched files.
- INSTRUMENT (run bar unchanged): over `withoutLineComments(RUNBAR_SOURCE)`,
  assert it STILL contains `selectionOnly: bulkSelectionOnly` (the bare form)
  and `scopedToSelection: bulkSelectionOnly && selected.size > 0`, and does NOT
  contain `selected.size > 0 || bulkSelectionOnly` (the F3-c=X form, which is
  Wave C). Assert the run bar's `rows` value threaded to it is still
  `displayedRows` (no `bodyRows`/`planRows`).
- INSTRUMENT (no Wave C start): assert NONE of the Wave A touched files
  (`index.tsx`, `RepoGradesStickyHeader.tsx`, `RepoGradesRunBar.tsx`) contain the
  identifiers `visibleRepoRows`, `bodyRows`, or `planRows`.
- DIRECTION: fails if Wave A alters grade-plan scoping or pre-empts Wave C's
  bodyRows/planRows split or F3-c=X.
- SABOTAGE: change the run bar's `selectionOnly: bulkSelectionOnly` to
  `selectionOnly: selected.size > 0 || bulkSelectionOnly` (applying F3-c early)
  -> RED; restore -> GREEN. DISCRIMINATES (a Wave A change that altered plan
  inputs is exactly out of scope).
- LIFETIME NOTE: these absence/verbatim pins are WAVE-A-SCOPED. Wave C's F3-c=X
  change will replace them with AC-F3-3's positive expression pins IN THE SAME
  COMMIT that applies F3-c at all four sites. The checker should expect this pin
  to be retired by Wave C, not treated as permanent.
- The F3-c EXECUTION site (`useRepoGradesGradingActions.ts:784`) and the grid's
  grade plan (`RepoGradesGrid.tsx:350/:352`) are NOT in Wave A's write set; their
  primary guard is `git status --short` vs the Wave A file list. A source pin on
  them is not added here (they are out of the write set; adding a pin would
  invite editing them).

---

## 5. Ratchet / canary obligations (each a named gate member)

### W-A11 - R-2 frozen roots 35 -> 36, SAME commit, title bumped
`RepoGradesStickyHeader.tsx` is a NEW non-test root. In
`repoGradesFeedbackAndFiles.wiring.test.ts`, in the SAME commit:
- add `"RepoGradesStickyHeader.tsx"` to `FROZEN_REPO_GRADES_ROOTS` (`:304-345`);
- bump the `it(...)` title at `:348` from "exactly the 35 frozen basenames" to
  "...36..." (the title is prose, asserted only by the array equality - but
  leaving it at 35 is a dishonesty the loop treats as a defect).
- The new file must pass the client-boundary closure walk
  (`R-1/R-3/R-4`, `:356-369`): browser-safe imports ONLY. React,
  `RepoGradesRunBar`, the CSS module, and a `ResizeObserver` (a browser DOM API,
  not an import) are all browser-safe. Do NOT import any `"use server"` leaf or
  server-only module into it.
- Direction/discriminate: adding the file WITHOUT updating the array REDS R-2
  (directoryRoots returns 36, array has 35). Adding a server-only import REDS
  `R-1/R-3/R-4`. This test is gate-mandatory for this wave
  (gate-must-include-directory-canary).

### W-A12 - CSS-orphan ratchet stays 118
`page-module-css-orphan-classes.test.ts` pins the repo-wide orphan count at
`PINNED_ORPHAN_CEILING = 118` (`:316`) and fails if it RISES (`:419-437`). Every
NEW class added to `repo-grades.module.css` this wave (`.stickyShell`,
`.stickyWorkingHeader`, and any header-row/slot class) must be referenced via
`styles.<name>` dot-notation in a file that imports that sheet (e.g.
`RepoGradesStickyHeader.tsx`), or it counts as an orphan and the ratchet rises to
119. `page.module.css` is untouched this wave.
- Direction/discriminate: an UNAPPLIED new class (defined, never referenced via
  `styles.`) RAISES the count to 119 -> RED. Reference it -> back to 118 -> GREEN.
- Gate-mandatory.

### W-A13 - index.tsx stays < 1000 (hand-measured each wave)
`src/file-size-ceiling.structure.test.ts` (`LIMIT = 1000`, `:41`) is the repo-
wide gate. index.tsx is at **960** (`@(Get-Content).Count`). Wave A grows it by a
child mount + a shell wrapper and SHRINKS it by removing the inline
`<RepoGradesRunBar>` block (~9 lines) - net small, but RE-MEASURE with
`@(Get-Content).Count` after the edit. If it crosses 1000, extract a block FIRST
(the scope names the status-banner props block or the rubric-source prop fan-out
as candidates) - do not ship over the ceiling.
- Direction/discriminate: index.tsx at 1001 -> RED with a named violation.
- Gate-mandatory.

---

## 6. Gate command (PowerShell; multi-path uses the wrapper)

Never a raw multi-path `vitest`/`npm test` (it silently drops unmatched args).
Use:

```
npx tsc --noEmit
npm run lint
npm run test:paths -- src/app/components/repo-grades/repoGradesWaveASticky.structure.test.ts src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts src/app/components/courses/page-module-css-orphan-classes.test.ts src/file-size-ceiling.structure.test.ts src/app/components/repo-grades/repoGradesStorageKeys.structure.test.ts
git status --short
```

- `repoGradesWaveASticky.structure.test.ts` - the NEW Wave A structure test
  (section 4). (Name is a suggestion; it must NOT contain the forbidden
  comment-strip literal in name or body.)
- `repoGradesFeedbackAndFiles.wiring.test.ts` - R-2 roots + client-boundary walk
  (W-A11). Gate-mandatory.
- `page-module-css-orphan-classes.test.ts` - orphan ratchet (W-A12). Gate-
  mandatory.
- `file-size-ceiling.structure.test.ts` - ceiling (W-A13). Gate-mandatory.
- `repoGradesStorageKeys.structure.test.ts` - regression guard: Wave A adds NO
  key, so this must stay GREEN at 18 (if it reddens, a key was added out of
  scope).
- `tsc`: watch for the dotAll `/s` regex flag (passes vitest, FAILS tsc TS1501)
  if any slice regex is written with it - do not use `/s`.
- `git status --short`: must match the Wave A file list exactly - no
  `.claude/worktrees` copy edited, and `useRepoGradesGradingActions.ts` /
  `RepoGradesGrid.tsx` grade-plan sites unchanged (except `RepoGradesGrid.tsx`
  may change ONLY if `.gridWrap` class removal forces a `styles.gridWrap` cleanup
  - recommended path avoids that).

Tests here are network-blocked (`vitest.setup.ts` throws on real fetch); this
wave touches no Canvas path, so no `canvasFetch` mock is needed. No emojis, LF in
the test file, no cross-`*.test.ts` imports (duplicate helpers).

---

## 7. Reference-implementation satisfiability (honest limit)

The brief restricts this seat to NOTES - no production or test code - so I did
NOT build a throwaway reference tree to score the RED pins green (that would
require writing both). Instead satisfiability is established two ways, and I state
the limit plainly:

1. Every CSS instrument (W-A1, W-A2, W-A4, and the existence pins) was RUN against
   the real current source and confirmed to RED today and to flip GREEN under the
   fixed shape described in section 2 (section 3 table). The file-wide bounded-
   scroll invariant finds exactly the one block the fix removes; the thead offset
   pin flips on exactly the `top: 0` -> `top: var(--rg-working-header-h` change.
2. Every source-text pin shape (import+render reachability, relocation, var
   publish/consume, ordering-with-resolved-anchors, verbatim/absence scope pins)
   is a SHIPPED-AND-PASSING shape in this repo - the W3 sticky pins in
   `grading-chat/GradingChatPanel.structure.test.ts` and
   `walkthrough-announcement/...structure.test.ts` use the identical `ruleBlock`
   slice, `<Component>`-mount reachability, and ordering proxies on real green
   code.

What I could NOT determine here: whether the recommended component boundary
(shell + tiers in `RepoGradesStickyHeader.tsx` taking the grid as children)
keeps index.tsx under 1000 - it depends on how many status elements move relative
to the shell. The implementer MUST re-measure (W-A13) and the loop-checker should
confirm the RED->GREEN on a reference shape before trusting the suite, since I
could not.

---

## 8. Residual register (owner, instrument, step)

- **R6 (sticky offset correctness + above-fold height under wrap):** OWNER
  (browser) + Wave A implementer. INSTRUMENT AC-F2-4 owner walk; W-A4/W-A9 pin
  only that the thead REFERENCES the header height and the var is published, not
  that the rendered value is right. STEP owner confirms no rows hide behind the
  header and the band is not too tall. Nothing in vitest can measure a rendered
  height. (Not a deletion - a named owner step.)
- **R-STICK (does it actually stick to the shell):** OWNER (browser), AC-F2-4.
  INSTRUMENT: W-A1+W-A2+W-A4 are a SOURCE PROXY (bounded shell exists, no rival
  unbounded scroll container, thead references header height); `position:sticky`
  engaging against the intended ancestor is unobservable in vitest. STEP owner
  scrolls a long roster and confirms the working header + column header travel
  together all the way down.
- **R-NARROW (narrow-width posture):** OWNER (browser), AC-F2-5. INSTRUMENT W-A5
  pins the thead un-stick survives; the shell's own narrow behaviour is a reading
  claim. STEP owner confirms the sticky header does not eat the narrow viewport.
- **R-THEME (light + dark):** OWNER (browser), AC-F2-4. INSTRUMENT none here (no
  render); the opaque-background token pins (W-A3/W-A4) are the only machine
  proxy. STEP owner confirms both themes.

---

## 9. Fork for the caller (recommend-and-proceed; I am a scoped seat, I do not gate)

**FORK A-SHELL-SCOPE (a scope-document inconsistency I must surface).** The scope
is internally inconsistent about WHAT `.stickyShell` wraps:

- Section **2.2** (explicitly "the load-bearing shape every later wave is built
  against"): ONE bounded scroll shell contains BOTH the working-header tier AND
  the `<table>`, so the two sticky tiers share one vertical sticky context and
  travel together.
- Section **4.1** (Wave A shorthand): "`.gridWrap` becomes the bounded
  `.stickyShell`". But `.gridWrap` lives INSIDE `RepoGradesGrid.tsx` and wraps
  ONLY the table - if `.stickyShell` IS the renamed `.gridWrap`, the working-
  header tier is OUTSIDE it and does NOT share the scroll context, which is
  exactly the "separate sticky elements fighting for the top offset" that 2.2
  forbids and the root-cause fix is meant to prevent.

RECOMMENDED reading (proceeding on this; recorded as MY reading, not an owner
ruling): **section 2.2 governs.** `.stickyShell` is a NEW wrapper enclosing the
working-header tier AND the grid; `.gridWrap` loses its scroll-container role
(drop its `overflow-x`; keep the class as a plain wrapper so `styles.gridWrap`
stays valid). The CSS pins W-A1..W-A4 are valid under EITHER reading; only the
enclosure pin W-A8 depends on this fork, and the real "tiers travel together"
check is the owner walk AC-F2-4 either way.

COST IF WRONG: W-A8 re-anchors (a few lines of the new test) and the implementer
moves the `.stickyShell` wrapper from the component to index.tsx (a JSX move, not
a redesign). Everything else holds.

This is reported to the caller for the orchestrator/owner to reconcile 4.1's
wording with 2.2; it does NOT gate the wave.
