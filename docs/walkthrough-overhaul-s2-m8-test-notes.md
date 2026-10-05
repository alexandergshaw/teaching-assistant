# WALKTHROUGH-OVERHAUL (S2 + M8) - TDD test notes

Seat: `loop-test-author` (Opus). Authored 2026-10-04. These are notes an
implementer builds tests AND production from; this file contains NO production
or test code, only the instrument design, the oracles, the sabotages, and the
anchors. A fresh `loop-checker` reads this before the implementer.

This wave is **WALKTHROUGH-OVERHAUL / B-W1 RESIDUE** only. The SETUP/run overhaul
(SMOOTH-WALKTHROUGH W0-W3: sticky Start bar, two always-visible Generate buttons,
auto-draft-on-stop, message+preview side-by-side, Visible-to inside the Post row,
arm-notice reorder) is SHIPPED and VERIFIED and is **NOT re-scoped here**
(`docs/announcements-tab-and-walkthrough-scope.md` section 4;
commits `df2dff8d / ffaba04f / 6cac33d2 / 494826ec` `[MEASURED git log]`). Two
narrow residue items remain:

- **S2** - the two stacked selects ("Format to match", "Written for") onto one row.
- **M8** - scroll the just-generated draft into view (no `scrollIntoView` exists today).

ANNOUNCEMENTS-TAB has already landed: the walkthrough panel's MOUNT relocated to
`page.tsx` as an always-mounted, `display`-toggled sibling, but the **component
files did not move**. The S2/M8 controls are exactly where they were.

---

## 0. Grounding at HEAD - every anchor opened, every quantity names its command

| Fact | Value at HEAD | Command / how measured |
|---|---|---|
| S2 "Format to match" select | `AnnouncementDraftSlot.tsx:121-137`, `className={controls.fieldMd}` | `[READ]` + `grep -n` |
| S2 "Written for" select | `AnnouncementDraftSlot.tsx:139-152`, `className={controls.fieldMd}` | `[READ]` + `grep -n` |
| Both selects' parent | direct children of `<fieldset className={controls.section}>` opened at `:118` - **NO row wrapper between them** | `[READ 118-153]` |
| `.adaptRow` references in `AnnouncementDraftSlot.tsx` | **0** today | `grep -n adaptRow src/app/components/walkthrough-announcement/AnnouncementDraftSlot.tsx` (no hits) |
| `.adaptRow` definition | `src/app/page.module.css:890-895` = `display:flex; gap:var(--space-2); flex-wrap:wrap; align-items:flex-end` | `[READ]` |
| `.adaptRow` already referenced (so NOT an orphan) | yes - e.g. `AnnouncementCourseFieldset.tsx:136,195,239,270` wrap `.fieldMd` selects in `styles.adaptRow` (same directory, same `styles` import) | `grep -rn adaptRow src/app/components/walkthrough-announcement/` |
| `.fieldMd` | `RecordingControls.module.css:82-84` = `min-width:220px` | `[READ]` |
| `scrollIntoView` anywhere in `walkthrough-announcement/` | **0** | `grep -rn scrollIntoView src/app/components/walkthrough-announcement/` (exit 1, no hits) |
| Draft slots mapped | `WalkthroughAnnouncementPanel.tsx:752-780` (`slots.map(... <AnnouncementDraftSlot .../>)`) | `[READ]` |
| Draft phase union | `SlotDraft.phase ∈ {"empty","drafting","drafted"}` | `[READ announcement-draft-slots.ts:91-94]` |
| Only path INTO `"drafted"` | from `"drafting"` via the reducer `"result"` action | `[READ announcement-draft-slots.ts:490-497]`; "generate-started"/makeSlot set `"empty"→"drafting"` `:364,:465` |
| `AnnouncementDraftSlot.tsx` current React imports | `import { useMemo } from "react"` only - M8 adds `useEffect`, `useRef` | `[READ :14]` |
| Panel's existing `previewRef` | the capture-hook VIDEO ref (`:106,:699`), NOT reusable for the draft | `[READ]` |
| Orphan ratchet | `page-module-css-orphan-classes.test.ts` pins `PINNED_ORPHAN_CEILING = 118` with an EXACT `toBe(118)` (`:316,:436`) and regenerates `docs/css-orphans.md` (`:527`) | `[READ]` |
| Directory ta- key canary | `walkthrough-announcement.structure.test.ts:107` pins **exactly six** `ta-` keys across the dir | `[READ]` |
| Existing walkthrough test files | 7 files listed in section 7 | `ls src/app/components/walkthrough-announcement/*.test.ts` |

What I could not do (stated once): nothing renders under vitest (node-env,
network-blocked), so I did not observe a scroll, a reflow, a pixel, or a cursor.
Every claim about felt layout/scroll is an OWNER-walk item, labelled OWNER below.

---

## 1. Executable here vs ARGUED (read this before trusting any GREEN)

**Executable under vitest (node-env, source-text + pure leaf):**
- S2: a source-text/structure pin on `AnnouncementDraftSlot.tsx` (section 2).
- M8-gate: a PURE function `shouldScrollDraftIntoView` with a frozen 12-cell
  truth-table oracle - fully executable, and it is where the critical "not every
  render" property is actually MEASURED (section 3.A).
- M8-wiring: a source-text pin that the gate and the `scrollIntoView` call sit on
  the render path inside an effect, not in the JSX body (section 3.B).

**ARGUED / owner-walk only (NOT asserted as verified by any GREEN suite):**
- That the scroll *actually moves the viewport* when the draft is below the fold,
  that `block:"nearest"` leaves an already-visible first slot untouched, that no
  focus visibly jumps, that the two selects *visually* occupy one row and wrap
  gracefully under 440px. `scrollIntoView` and layout are browser APIs no test in
  this repo exercises (`docs/loop/traps-tests.md`: "A green suite proves nothing
  about markup, focus, or keyboard behaviour").
- That the effect, once correctly wired, *actually fires and moves the viewport*
  on a short screen at runtime. The source-text pins prove the gate is wired in
  and that the dep array + prev-advance are present and correct **as source**
  (W6/W7, section 3.B); they cannot prove the browser then scrolls. This
  runtime-firing part is R-M8-wiring - owner walk + reading. NOTE the dep-array
  shape (`[phase]` vs `[slot.draft]`) and the `prevPhaseRef.current = phase`
  advance ARE source-text facts, caught by W6/W7 exactly as W3 catches
  `.current?.scrollIntoView(` and W4 catches `block:"nearest"` - they are NOT in
  the un-measurable set.

Calling any of the ARGUED items "verified" because the suite is green is exactly
the instrument-that-does-not-measure failure this seat exists to prevent.

---

## 2. Requirement S2 - two selects share ONE `.adaptRow`

### 2.1 Verify row

| Field | Value |
|---|---|
| **Object under comparison** | the source text of `AnnouncementDraftSlot.tsx` after the fix vs HEAD |
| **Instrument** | a new `*.structure.test.ts` (node-env source-text), in-repo idiom of `walkthrough-announcement.structure.test.ts` |
| **Direction of failure** | RED when the two selects are NOT both inside exactly one `styles.adaptRow`; RED at HEAD (no row); RED on two separate wrappers; RED on "only one wrapped" |

### 2.2 The production change (recommended, matches the in-tree precedent exactly)

Wrap the two existing `.fieldMd` selects in a single `styles.adaptRow` div -
copy the idiom at `AnnouncementCourseFieldset.tsx:136-...`. No new component, no
new prop, no reorder required (order is not load-bearing, see 2.4).

```
<div className={styles.adaptRow}>
  <TextField select label="Format to match" className={controls.fieldMd} ... />
  <TextField select label="Written for"    className={controls.fieldMd} ... />
</div>
```

`styles` is already imported (`AnnouncementDraftSlot.tsx:16`). The two TextFields
are direct siblings in the row - **no intervening `<div>`** (the containment pin
in 2.3 relies on this, and the precedent has none).

### 2.3 The instrument - a 3-part CONSTRUCTION (not a denylist)

Resolve all three anchors first (anchor-resolves at BOTH ends), then assert:

- **A1 (construction / frozen count).** Exactly ONE `styles.adaptRow` reference in
  the file: `src.split("styles.adaptRow").length - 1 === 1`. RED on 0 (HEAD /
  revert) and RED on 2 (separate wrappers, or a stray second row).
- **A2 (ordering).** The single `styles.adaptRow` index is `< indexOf('label="Format to match"')` AND `< indexOf('label="Written for"')` - the row opens before both
  selects. (Deliberately does NOT pin the inter-label order.)
- **A3 (containment - kills the passing-but-wrong case).** No `</div>` appears
  between the two labels: `src.slice(min(idxF,idxW), max(idxF,idxW))` does not
  include `</div>`. This is what proves "Written for" is INSIDE the same row as
  "Format to match", not merely after a row that wrapped only "Format".

Each of `label="Format to match"`, `label="Written for"` must be asserted
present (`indexOf > -1`) before any slice, so a renamed label fails LOUD instead
of silently slicing a widened region (`docs/loop/traps-tests.md`: "Every slice
needs an anchor-resolves assertion at BOTH ends").

### 2.4 Attack on my own guard (I ran it - results below)

Driver `[MEASURED node on 7 variants]`:

| Variant | Result | Why |
|---|---|---|
| HEAD (no row, current) | **RED** | adaptRow count 0 != 1 |
| correct fix (both in one row) | GREEN | one shared adaptRow |
| sabotage: separate wrappers | **RED** | adaptRow count 2 != 1 |
| passing-but-wrong: only Format wrapped | **RED** | `</div>` between the two selects |
| passing-but-wrong: only Written wrapped | **RED** | row does not open before both |
| attack: stray 2nd adaptRow elsewhere in file | **RED** | adaptRow count 2 != 1 |
| attack: reordered (Written first) in one row | GREEN | one shared row (order not required) |

A1+A2+A3 together have no passing-but-wrong survivor among the shapes a lazy or
adversarial implementer would reach for. The reorder case is GREEN **by design** -
reordering within one row is functionally identical and pinning the order would
over-specify (`docs/loop/traps-tests.md`: pin the fact and the ordering, never the
spelling; MEMORY `source-text-tests-overspecify`).

### 2.5 Named SABOTAGE for the sabotage pass (implementer runs this)

- **Mutation S2-M1:** split the one `styles.adaptRow` into two, one per select.
  Expect A1 **RED** (count 2). Restore -> GREEN. **Discriminates: YES.**
- **Mutation S2-M2:** remove the row wrapper entirely (revert to HEAD shape).
  Expect A1 **RED** (count 0). Restore -> GREEN. **Discriminates: YES.**
- **Mutation S2-M3:** wrap only "Format to match"; leave "Written for" a bare
  sibling after the row. Expect A3 **RED** (`</div>` between). Restore -> GREEN.
  **Discriminates: YES** - this is the one A1 alone would miss, and the reason A3
  exists.

### 2.6 Frozen-count caveat (name it, do not let it rot)

A1 is a frozen count pinned at 1. If a LATER legitimate change adds a second
`styles.adaptRow` to this file, A1 must be bumped **in the same commit** and the
test's own comment must name the new row - the `headless.test.ts` /
`tab-rails.test.ts` count-canary discipline (MEMORY `headless-count-canary`). Say
so in the test comment so the next session does not silently raise it to pass.

### 2.7 No orphan bump, no `docs/css-orphans.md` edit, no new `ta-` key

- `.adaptRow` is ALREADY referenced (section 0), so it is NOT in the orphan set;
  adding a 67th reference cannot change the orphan count. `PINNED_ORPHAN_CEILING`
  stays **118** and `docs/css-orphans.md` regenerates byte-identical. **The
  implementer must NOT touch `docs/css-orphans.md` and must NOT change
  `PINNED_ORPHAN_CEILING`.** (This matters: `docs/css-orphans.md` is being edited
  by in-flight work - section 0 of the scope - and a spurious edit here would
  collide.) Confirmed because S2 introduces NO new CSS class.
- **persist-UI-control-state:** S2 is a LAYOUT change of selects that ALREADY
  persist via their existing bindings; it adds NO control and NO `ta-` key. The
  directory canary `walkthrough-announcement.structure.test.ts:107` ("exactly six
  `ta-` keys") must stay GREEN; if the implementer accidentally adds a key it goes
  RED, which is correct. **No new key is expected or permitted by S2.** Confirmed.
- **Minimize-clicks:** S2 removes a vertical hop; it adds zero clicks and removes
  no confirm step. Nothing in S2 touches the Post/Regenerate arm-then-confirm.

---

## 3. Requirement M8 - scroll the generated draft into view, gated on the generate edge

The property that MUST be measured is not "a scroll happens" but "**a scroll
happens on the drafting->drafted edge and NOT on every render**." In a repo where
no component renders, the only way to make that property EXECUTABLE is to lift the
gate decision into a pure function and test it against a frozen table. The browser
scroll itself stays an owner/reading claim. This is the recommended construction;
the inline-`if` alternative is REJECTED precisely because it leaves the gating
property unmeasurable (seat practice #3: drive the testable production path; make
the un-testable state unrepresentable in the source pin).

### 3.A The pure gate + its frozen-table oracle (EXECUTABLE - the load-bearing instrument)

**New export**, added to the pure leaf `announcement-draft-slots.ts` (beside the
`SlotDraft` type and the other pure helpers; its CALLER is `AnnouncementDraftSlot.tsx`,
and both ship in the SAME wave - `seats.md` "every wave includes the file that
CALLS each new export"):

```
export type SlotDraftPhase = SlotDraft["phase"];   // "empty" | "drafting" | "drafted"
export function shouldScrollDraftIntoView(prev: SlotDraftPhase | null, next: SlotDraftPhase): boolean
```

Required behaviour: returns `true` **iff** `prev === "drafting" && next === "drafted"`
(the sole generate/regenerate-completion edge; section 0 proved this is the only
path into `"drafted"`).

**Oracle - construction, not enumeration:**
- **Axis source (different from the generator):** the phase set is the TYPE union
  `SlotDraft["phase"]` = `{"empty","drafting","drafted"}`; `prev` additionally
  admits `null` (initial, no previous phase). `PREVS = [null,"empty","drafting","drafted"]`,
  `NEXTS = ["empty","drafting","drafted"]`.
- **Generator:** the full Cartesian product `PREVS × NEXTS` = **12 cases**. Assert
  `cases.length === 12` (a count canary: a dropped case can't hide - MEMORY
  `headless-count-canary`).
- **Expected values:** a FROZEN LITERAL table of 12 booleans - **do NOT compute
  the expected by calling `shouldScrollDraftIntoView` or by re-stating its rule**
  (MEMORY `refactor-disarms-tests`: a frozen literal oracle, never a
  self-comparison). Exactly one cell is `true`:

  | prev \ next | empty | drafting | drafted |
  |---|---|---|---|
  | null | false | false | false |
  | empty | false | false | false |
  | drafting | false | false | **true** |
  | drafted | false | false | false |

  Assert the table has 12 entries and exactly 1 `true`.

**Satisfiability + sabotage, PROVEN `[MEASURED node]`:** the reference impl
`prev==="drafting" && next==="drafted"` scores **12/12 GREEN** against the frozen
table. Four wrong impls all go RED:
- `next === "drafted"` (fires on every render while drafted, and on mount of an
  already-drafted slot) -> 3 mismatches -> **RED**. This is the "fired
  unconditionally / on every render" sabotage the task names, and it is KILLED
  EXECUTABLY here.
- `prev === "drafting"` (fires on any leave-drafting, incl. a failed draft that
  returns to empty... though the reducer does not do that) -> 2 mismatches -> **RED**.
- always `true` -> 11 -> **RED**. always `false` (no scroll) -> 1 -> **RED**.

All four discriminate. No mutant was rebuilt or banked; all are honest kills of
the gate function.

### 3.B The wiring pin (SOURCE-TEXT - proves the gate is on the render path, not in the body)

In `AnnouncementDraftSlot.tsx`, the recommended shape: a `useRef` holding the
previous phase, a root `ref` on the `<fieldset>`, and ONE `useEffect` keyed on the
phase that computes the gate and, only when true, scrolls the root ref into view.

```
const rootRef = useRef<HTMLFieldSetElement>(null);
const prevPhaseRef = useRef<SlotDraftPhase | null>(null);
useEffect(() => {
  if (shouldScrollDraftIntoView(prevPhaseRef.current, phase)) {
    rootRef.current?.scrollIntoView({ block: "nearest" });
  }
  prevPhaseRef.current = phase;
}, [phase]);
...
<fieldset ref={rootRef} className={controls.section}>
```

**Source-text assertions** (all anchor-resolve first):
- **W1 (call exists on the right path):** the file references BOTH
  `shouldScrollDraftIntoView` AND `scrollIntoView`. (Forces routing through the
  pure, testable gate - an inline `if (phase==="drafted")` that skips the function
  fails W1.)
- **W2 (gated inside an effect, not in render/JSX):** exactly one `useEffect(` in
  the file; and with `idxEffect = indexOf("useEffect(")`, `idxReturn = indexOf("\n  return (")`
  (the component's JSX return - assert it resolves), BOTH
  `indexOf("shouldScrollDraftIntoView")` and `indexOf("scrollIntoView")` fall in
  `(idxEffect, idxReturn)`. A `scrollIntoView` in the component body (before the
  effect) or in JSX/an onClick (after the return) lands OUTSIDE the window -> RED.
- **W3 (called on a DOM ref, not some object):** within the effect window,
  `scrollIntoView` is preceded by `.current` (expected shape `.current?.scrollIntoView(`
  or `.current.scrollIntoView(`). Rules out `window.scrollIntoView` / scrolling the
  wrong object.
- **W4 (minimal scroll, reduced-motion-safe by construction):** the call includes
  `block: "nearest"` and does NOT include `behavior: "smooth"`. `"nearest"` makes
  an already-visible slot a no-op (satisfies "only if below the fold"); omitting
  `smooth` means the scroll is instant, so `prefers-reduced-motion` needs no media
  query. **If** a future impl wants smooth animation, it must add a
  `prefers-reduced-motion` guard - but that is NOT this wave's recommended path,
  and W4 bans unguarded `smooth`.
- **W5 (no focus move):** the effect window does not contain `.focus(`.
- **W6 (dep array keyed on the phase edge - the EFFECT'S OWN array).** Resolve
  `idxEffect = indexOf("useEffect(")`, then match
  `/^\s*\}, \[([^\]]*)\]\);/m` against `src.slice(idxEffect)` - the FIRST closing
  `}, [ ... ]);` after the effect opens is the effect's own dep array. Assert the
  match is non-null and its capture group matches `/\bphase\b/`. This is NOT a
  window existence check: the pre-existing `useMemo` at the top of the component
  has `}, [phase, slot.draft])` and sits BEFORE `idxEffect`, so it cannot
  satisfy the pin. (The earlier whole-window regex false-matched that useMemo and
  left `[phase]` -> `[slot.draft]` silently green.) PASSES `[phase]` and
  `[phase, slot.id]`; **RED** on `[slot.draft]` `[MEASURED on the real file,
  M8-M6]`.
- **W7 (the prev-phase advance is present).** The effect window matches
  `/prevPhaseRef\.current\s*=\s*phase/`. Goes **RED** if the advance line is
  dropped - without it `prevPhaseRef.current` never leaves its initial value, so
  the gate can never see a `drafting -> drafted` edge (or fires wrongly forever).

W6 and W7 are ordinary source-text facts, no more "implementation detail" than
W3/W4 - the earlier draft wrongly called these two un-measurable; they are
pinned here. Both were run against the four variants `[MEASURED node]`: the good
form and `[phase, slot.id]` both PASS W6/W7; `[slot.draft]` -> W6 **RED**;
dropped advance -> W7 **RED**.

**W2's `useEffect` count is a frozen-count canary** (pinned at 1 for this file
today - zero effects at HEAD). If a later change adds a second effect, bump it in
the same commit and name the new effect in the comment (same discipline as S2-2.6).

### 3.C Named SABOTAGE for the sabotage pass

- **M8-M1 (gate logic):** change `shouldScrollDraftIntoView` to `next === "drafted"`.
  Expect the frozen-table oracle **RED** (3 mismatches). Restore -> GREEN.
  **Discriminates: YES** - this is the "every render" failure.
- **M8-M2 (gate removed from path):** delete the `shouldScrollDraftIntoView` call,
  call `scrollIntoView` unconditionally in the effect. Expect **W1 RED**
  (`shouldScrollDraftIntoView` absent). Restore -> GREEN. **Discriminates: YES.**
- **M8-M3 (scroll in render body):** move the `scrollIntoView` call out of the
  effect into the component body. Expect **W2 RED** (`scrollIntoView` index <
  `idxEffect`). Restore -> GREEN. **Discriminates: YES.**
- **M8-M4 (focus injected):** add `rootRef.current?.focus()` in the effect. Expect
  **W5 RED**. Restore -> GREEN. **Discriminates: YES.**
- **M8-M5 (aggressive smooth scroll):** change the call to
  `scrollIntoView({ block: "start", behavior: "smooth" })`. Expect **W4 RED**
  (contains `behavior: "smooth"` and lacks `block: "nearest"`). Restore -> GREEN.
  **Discriminates: YES.**

- **M8-M6 (dep-array mutation):** change the effect dep array `[phase]` ->
  `[slot.draft]`. Expect **W6 RED** (`\bphase\b` absent from the dep array).
  Restore -> GREEN. **Discriminates: YES** `[MEASURED node]`.
- **M8-M7 (dropped prev-advance):** delete the `prevPhaseRef.current = phase`
  line. Expect **W7 RED**. Restore -> GREEN. **Discriminates: YES** `[MEASURED node]`.

**The ONE thing no node-env test here can certify, stated plainly:** that the
effect, correctly wired (W1-W7 GREEN), then *actually causes the browser to
scroll the viewport* when the draft is below the fold. That is a render/layout
runtime fact, and nothing in this repo renders. It is R-M8-wiring - an OWNER-walk
+ reading-review item, NOT something a green suite certifies. Note the scope of
this is NARROW: the dep array and the prev-advance are source facts and ARE
pinned (W6/W7); only the actual viewport movement is the residual.

### 3.D persist / clicks / first-vs-each

- M8 adds NO control and NO `ta-` key - the six-key canary stays GREEN.
- M8 adds zero clicks and removes no confirm step (it is a passive scroll).
- **Recommended reading (first-vs-each slot):** per-slot gate with `block:"nearest"`.
  A fresh batch typically leaves slot 1 at/above the fold (no-op) and scrolls only
  the slots that landed below. Whether the owner instead wants *specifically slot 1*
  centred is a felt/owner call - recorded as R-M8-firstslot, recommended reading
  acted on, not an owner ruling. Do NOT block on it.

---

## 4. AC-R2-3 - prove the move + the two fixes changed NOTHING else

S2 and M8 touch `AnnouncementDraftSlot.tsx` (both) and `announcement-draft-slots.ts`
(M8 leaf) only. All existing walkthrough guards - arm-then-confirm on Post, the
schedule-time-in-signature, `wta-post-consequence` id + `aria-describedby`, the
rendered preview present before Post, the markdown-safe post path, the six-key
canary - must stay GREEN. Run the whole directory suite AFTER B-W1 (section 7). A
RED in any of these is a regression, not a new requirement.

---

## 5. Reference-implementation satisfiability (seat obligation #1)

- **M8 gate:** reference `prev==="drafting" && next==="drafted"` run against the
  frozen 12-cell table -> **12/12 GREEN** `[MEASURED node]`. The red oracle is
  satisfiable by a one-line function.
- **S2:** satisfiable by the EXACT idiom already in the tree
  (`AnnouncementCourseFieldset.tsx:136`); the guard goes GREEN on "both selects in
  one `styles.adaptRow`" and RED on every other shape tried `[MEASURED node, 7
  variants]`.

No criterion was changed to make it satisfiable; both were satisfiable as first
written.

---

## 6. What changed / nothing dropped from the scope's AC

This file REFINES scope AC-R2-1 (S2) and AC-R2-2 (M8) into executable instruments.
One deliberate refinement to AC-R2-2, flagged: the scope said "guarded by a
reduced-motion check". The recommended construction instead uses an **instant**
scroll (`block:"nearest"`, no `behavior:"smooth"`), which is reduced-motion-safe
WITHOUT a media query and avoids an un-testable `matchMedia` dependency. W4 bans
unguarded `smooth`; a reduced-motion guard is required only if someone later opts
into smooth. This is MY reading; if the owner wants an explicit animated scroll,
that reopens W4 (residual R-M8-motion). AC-R2-4 and AC-R2-5 remain OWNER-walk,
unchanged.

---

## 7. Exact gate commands (every multi-file run uses `test:paths`)

The B-W1 directory suite (run after the implementer's change; names the two NEW
test files the implementer creates for S2 and M8 plus the seven existing guards -
adjust the two new names to whatever the implementer files, but they MUST be
distinct `*.test.ts` and MUST NOT import a helper from another `*.test.ts`
- MEMORY `no-cross-test-file-imports`):

```
npm run test:paths -- \
  src/app/components/walkthrough-announcement/announcement-draft-slots.test.ts \
  src/app/components/walkthrough-announcement/useAnnouncementDraftSlots.test.ts \
  src/app/components/walkthrough-announcement/scheduled-visibility.test.ts \
  src/app/components/walkthrough-announcement/walkthrough-announcement.structure.test.ts \
  src/app/components/walkthrough-announcement/walkthrough-announcement-timing.structure.test.ts \
  src/app/components/walkthrough-announcement/walkthrough-announcement-coverage.test.ts \
  src/app/components/walkthrough-announcement/walkthrough-run-decisions.test.ts \
  <S2 new *.structure.test.ts> \
  <M8 new *.test.ts>
```

Never a raw multi-path `vitest run a b` / `npm test a b` - it drops unmatched args
and exits 0 (MEMORY `test-paths-wrapper`; `docs/loop/traps-tests.md`). The orphan
ratchet (`page-module-css-orphan-classes.test.ts`) and `src/file-size-ceiling.structure.test.ts`
run in their own existing gate; S2/M8 leave the orphan count at 118 and add no
file near 1000 lines (`AnnouncementDraftSlot.tsx` is 379, `announcement-draft-slots.ts`
gains one small function). `npx tsc --noEmit` has ONE caller at a time; a new
`/s` regex passes vitest and FAILS tsc (MEMORY `regex-s-flag-fails-tsc`) - neither
instrument here uses one.

---

## 8. Residual register (owner / instrument / measuring step - missing any one = a deletion)

| ID | Not proven by any GREEN here | Owner | Instrument | Step that measures it |
|---|---|---|---|---|
| R-M8-wiring | the correctly-wired effect (W1-W7 green) actually moves the viewport at runtime when the draft is below the fold - the browser scroll itself only. The dep array and prev-advance are NO LONGER part of this residual: they are source facts pinned by W6/W7. | repo owner | owner generates on a short viewport and watches the draft scroll into view | B-W2 owner walk |
| R-M8-firstslot | whether owner wants slot 1 specifically centred vs per-slot `nearest` | repo owner | owner walk on a multi-slot batch | B-W2 |
| R-M8-motion | whether an explicit animated (smooth) scroll is wanted (would reopen W4) | repo owner | owner walk | B-W2 |
| R-S2-felt | the two selects visually form one row and wrap cleanly under ~440px | repo owner | owner resize / reading of `.adaptRow` wrap behaviour | B-W2 |
| R-leverage | AC-R2-5 click-cost removal test - no vitest here observes a click or a scroll | repo owner | owner counts clicks/scroll at the new location | B-W2 (with the AC-R2-4 walk) |

All five are OWNER-blocked by construction (no render, no browser, no network
here). None is startable by an agent; they are listed so they are not forgotten.

---

## 9. What I opened (so the checker can re-walk)

`docs/DEV_LOOP.md`, `docs/loop/seats.md`, `docs/loop/traps-tests.md`,
`docs/announcements-tab-and-walkthrough-scope.md`;
`src/app/components/walkthrough-announcement/AnnouncementDraftSlot.tsx` (whole, 379),
`.../WalkthroughAnnouncementPanel.tsx` (`:688-808`, grep for refs/generate/phase),
`.../announcement-draft-slots.ts` (`:37-73,:91-94,:290-355,:364-497` by grep),
`.../AnnouncementCourseFieldset.tsx` (`:130-150` - the `.adaptRow`+`.fieldMd` precedent),
`.../walkthrough-announcement.structure.test.ts` (grep: anchors, six-key canary),
`.../walkthrough-announcement-coverage.test.ts` (grep: unrelated to S2/M8);
`src/app/page.module.css:888-900` (`.adaptRow`),
`src/app/components/recording/RecordingControls.module.css:82-91` (`.fieldMd`),
`src/app/components/courses/page-module-css-orphan-classes.test.ts` (grep: ratchet 118);
and two `[MEASURED node]` drivers: the M8 12-cell oracle+sabotages, the S2 7-variant guard.

Not opened and therefore not claimed: any rendered pixel, the real scroll/reflow,
`useAnnouncementDraftSlots.ts` reducer body beyond the phase-transition lines, any
browser behaviour.
