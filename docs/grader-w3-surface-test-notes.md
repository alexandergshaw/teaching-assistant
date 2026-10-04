# GRADING-CHAT grader W3 SURFACE - test notes

Seat: `loop-test-author` (Opus), 2026-10-04. Backlog row SMOOTH-GRADER
(Priority 4: the scroll-distance / cursor-travel cut for the grader Chat
sub-tab, co-equal with click count; no confirm or guard dropped). Consumer: a
`loop-implementer` writes the production + test code from these notes; a fresh
`loop-checker` reads them first. I author notes only - no production or test
code here.

W1 (pure leaves: `chatSetupFill.ts`, `chatFileBatch.ts`, `chatSetupMemory.ts`),
W2 (panel wiring: Canvas prefill, scoped memory, multi-file batch), and the W2
wiring guard have all shipped and verified (last grading-chat commit path per
`git log --oneline -1`, HEAD `24036a5b`). Every quantity below names the command
that produced it.

## What governs

`docs/grader-smooth-scope.md` is the scope and it governs the surface boundary,
the mechanisms (R3/R4/R5), and the acceptance criteria AC-S1..S4. The scope's W3
line (section 6): "surface and layout: NEW `grading-chat.module.css`,
`GradingChatPanel.tsx`, `ChatComposer.tsx` (sticky composer, collapse strip,
compact fields)". The brief that dispatched me names the same three deliverables
plus "Send grouped with its controls". I do not add a mechanism the scope did
not propose; the one place the scope offers a FORK (F1, composer position) I
route in section 7 and build its recommended reading (a) as a firm pin while
naming it a proxy.

Unlike the walkthrough sibling (`docs/walkthrough-w3-surface-test-notes.md`,
which I used as the pattern), the grader scope does NOT reject the collapse or
the sticky composer - R3 proposes the collapse and F1(a) recommends the sticky.
So I pin both firmly here, where the walkthrough routed them as forks. The
`docs/repo-grader-w3-surface-test-notes.md` sibling DOES exist (committed
`6ba5f55b`, present at HEAD - `git log --oneline --diff-filter=A` on the path);
its sticky run-bar pin is the same `position: sticky` + bounded-slice + offset
construction, reinforcing the F1(a) pattern this file pins.

## The hard constraint on every instrument here

NOTHING renders under vitest (node-env; it collects only `src/**/*.test.ts`).
Every firm pin below is a SOURCE-TEXT or CSS-STRUCTURE pin. A green suite proves
the mechanism is PRESENT IN THE SOURCE - never that a pixel moved, that the
composer actually sticks, or that a field is shorter on screen. Every pixel and
scroll criterion (AC-S1..S4) is therefore an OWNER criterion, routed in section
10 to the SMOOTH-BASELINE walk (`docs/run-setup-baseline-walk.md` section 3,
snippet 1, at 1366x768). I did not invent a vitest pixel pin for any distance.

---

## 1. Measured facts (each names its command)

Source read in full: `GradingChatPanel.tsx` (238 lines; `wc -l` and
`@(Get-Content).Count` agree - W2 grew it from 198, so this file's own
citations at `:233`/`:208-212`/`:214-231` are the current layout),
`ChatComposer.tsx` (174, `wc -l`), the two grading-chat structure tests, the CSS orphan
ratchet, and the scope + baseline walk + walkthrough sibling notes.

- `grep -n "min-height: 220px" src/app/page.module.css` -> line 230, inside the
  `.field textarea { ... }` rule (opener `:229`, closer `:236`). This is the
  villain the scope section 3 names: the two setup fields sit in `styles.field`
  (`GradingChatPanel.tsx:169,183`) and MUI multiline renders a `<textarea>`, so
  each setup field is >= 220px regardless of `minRows={3}`.
- `.field` is `display:flex; flex-direction:column; gap` (`page.module.css:148-152`);
  `.field label` carries the uppercase label styling (`:154-160`). The 220px
  lives specifically on the DESCENDANT selector `.field textarea` (`:229`),
  specificity (0,1,1).
- `.form` (`:99`), `.adaptRow` (`:890`), `.ghActions` (`:1574`), `.ghMeta`
  (`:1565`) are the house classes the panel/composer already reuse.
- `grep -n "position: sticky" src/app/page.module.css` -> lines 3197, 3231,
  3242, 5585, 6151. So a NAIVE `cssText.match(/position:\s*sticky/)` over
  `page.module.css` passes vacuously five times over. W3 adds a NEW module file
  instead, and the pin slices one named class block - see section 8.
- `ls src/app/components/grading-chat/*.module.css` -> none. `grading-chat.module.css`
  is a BRAND-NEW file. A sibling module import precedent:
  `GradingTable.tsx:29` does `import rowStyles from "./GradingTable.module.css"`
  (a distinct local binding, not `styles`).
- Panel landmarks (`GradingChatPanel.tsx`): instructions field 169-181, rubric
  field 183-195, `.ghActions` block (not-saved disclosure, locked note,
  `setupNote`, New session button) 197-206, `submitError` `role="alert"` block
  208-212 (ABOVE the results today), `hasRows`/`<GradingResults` block 214-231,
  `<ChatComposer>` mount 233 (LAST in DOM).
- Composer landmarks (`ChatComposer.tsx`): text-mode `.adaptRow` 123-151 (text
  field `label="Submission text"` at 131, `aria-label="Send submission"`
  IconButton at 147-149); url-mode `.adaptRow` 153-169 (`Add` Button 165).
- Existing structure-test pins I must keep green or retarget
  (`GradingChatPanel.structure.test.ts`): `styles.field`/`styles.form` present
  `:62-67`; `disabled={sessionReady}` on both fields `:82-98`; New session
  confirm-before-reset `:111-118`; the governance-neutral `withoutLineComments`
  helper `:129-131` (uses the UNANCHORED `/\/\/[^\n\r]*/g` form - keep it, do
  not introduce the anchored trailing-comment-blind form); `resultsMountSlice`
  `:133-138`.
- Key canary (`grading-chat-storage-keys.structure.test.ts`): EXPECTED is the
  four keys `ta-grading-chat-input-mode|instructions|rubric|rubric-memory`
  (`:13-18`), asserted exact at `:48-50`. W2 already added the 4th
  (`-rubric-memory`); the canary sits at 4 today.
- Orphan ratchet (`page-module-css-orphan-classes.test.ts`): discovers EVERY
  `*.module.css` under `src/` (`:64-80`, so it auto-discovers the new module),
  pins `PINNED_ORPHAN_CEILING = 118` with BOTH `toBeLessThanOrEqual` and `toBe`
  (`:316,431,436`), and REGENERATES `docs/css-orphans.md` on every run
  (`:459-530`). `git status --short docs/css-orphans.md` shows it already
  MODIFIED in the working tree - an in-flight collision to coordinate (section
  9).

---

## 2. W3 cut decision - ONE wave; W3b and W4 stay OUT

**Decision: W3 is a single wave, confined to the `grading-chat/` directory.**
Write set: `GradingChatPanel.tsx`, a NEW `grading-chat.module.css`, and the
EXISTING `GradingChatPanel.structure.test.ts` (new pins appended). `ChatComposer.tsx`
is touched ONLY if the implementer places the sticky wrapper INSIDE the composer
(see F1) - the cleaner construction wraps `<ChatComposer>` in the panel and
leaves `ChatComposer.tsx` unchanged, which I recommend.

**W3b (page.tsx `active` prop + focus-on-activation, scope R8) stays OUT.**
Folding is NOT cheaper: its write set is `src/app/page.tsx` (a shared,
high-collision file the two sibling smoothing scopes also touch), disjoint from
W3's grading-chat directory, so folding buys zero parallelism and ADDS collision
risk. R8 also serves click-count ACs (AC-C3/C5), not the paramount scroll/cursor
ACs this wave owns. Defer it to its own sequential wave gated on any sibling
holding `page.tsx` (scope section 8).

**W4 (needs-grading picker, scope F3/R10) stays OUT.** It imports
`listGradingQueueAction` and is unverifiable here (needs Canvas credentials);
it is owner-walk-only and belongs on its own backlog row.

---

## 3. CSS-orphan and key-canary impact (confirmed against the tests)

**Orphan ratchet: stays at 118, NO `PINNED_ORPHAN_CEILING` change expected.**
The new module adds classes (section 8 uses `stickyComposer`, `compactField`,
`setupSummary` as the reference names). The ratchet auto-discovers the new file
(`:64-80`). Every class defined in it MUST be referenced via the module's own
local import binding (`chat.<class>`) in a file that imports it (the panel), or
`totalOrphanCount` rises above 118 and the gate goes RED. If every new class is
applied, the net orphan delta is 0 and the count stays 118 - so do NOT touch the
pinned literal. A class defined-but-unapplied is exactly what the ratchet exists
to catch; that RED is correct, fix it by applying or deleting the class, never by
raising the pin.

**Import the new module under a DISTINCT local binding.** The panel already does
`import styles from "../../page.module.css"`. Add `import chat from
"./grading-chat.module.css"` (binding `chat`, NOT `styles`) and reference every
new class as `chat.foo`. Reusing the name `styles` for both imports shadows one
and the orphan scan - which keys references by the import's local name
(`:165-176,205-222`) - would see the new classes as unreferenced. Apply all new
classes in the PANEL (the setup fields, the summary, and the composer wrapper all
live there), so only the panel imports the new module; this keeps `ChatComposer.tsx`
off the new module entirely.

**Key canary: stays at 4. W3 adds NO new persisted control.** The collapse of
the setup strip (R3, F2 below) is driven by SESSION STATE (`sessionReady =
driver.headerState === "ready"`), not by a user toggle - it collapses when the
session begins and returns on New session. There is no open/closed preference to
persist, so no new `ta-` key, no canary bump, no mount-effect restore pin. Leave
`grading-chat-storage-keys.structure.test.ts:13-18` at its four keys and run it
in the gate to prove no stray key crept in.

A manual "expand while ready" affordance is explicitly OUT of W3: the fields are
locked once ready (the W2 attack-9 fix, `GradingChatPanel.tsx:71-78`,
`disabled={sessionReady}`), so an expand could not edit anything, and unlocking
them to allow it would reopen the stale-rubric-grades-the-wrong-student hazard
that lock closes. If the owner ever wants it, that is a scope change with a 5th
key, a canary bump to 5, and a mount-effect restore pin (the
persisted-details-open-hydration lesson) - NOT this wave.

---

## 4. Executable here vs argued-only

**Executable now (machine, this environment):** F1 (sticky class applied +
rule), F2 (collapse conditional + summary present), F3 (compact class applied
AND `styles.field` dropped from both setup wrappers + reduced min-height in the
module), F4 (error inside the sticky wrapper), F5
(Send grouped), the orphan-ratchet gate (stays 118), the key-canary gate (stays
4). I validated the LOGIC of F1-F4 against a reference implementation and its
sabotages before writing them (section 11): 11/11 correct.

**Argued only, NOT asserted as verified:** that the composer actually STICKS at
runtime (depends on no ancestor clipping `overflow` and on there being room -
scope residual R-2), that the compact class actually SHORTENS the field on
screen (depends on it out-cascading `.field textarea` - section 7), that any
distance fell, that a refusal lands in the composer's viewport (AC-S4). These are
OWNER claims. The source/CSS pins are proxies for "the mechanism is present",
never proof the pixel moved. Labelled argued wherever they appear.

---

## 5. Numbered firm requirements - object, instrument, direction, sabotage

All new pins go into the EXISTING `GradingChatPanel.structure.test.ts` (already
governance-neutral: it does NOT mention the comment-stripping helper name the
enumerator in `strip-comments-agreement.structure.test.ts` tracks, so it is not
enumerated there). Do NOT introduce that tracked helper name anywhere, including
a test-description string, and do NOT add a new `*.test.ts` file (that would need
classifying). Reuse the existing
`withoutLineComments` for `.tsx` source. For `.module.css` reads, add a local
`withoutCssComments` that strips ONLY `/\/\*[\s\S]*?\*\//g` (CSS has no `//`
line comments; do not run the JS `//` stripper over CSS). No `/s` dotAll flag
(passes vitest, fails tsc TS1501) - use `[\s\S]`. No emojis, LF endings.

Every sabotage is a NAMED mutation of PRODUCTION source, applied with a `cp`
backup and restored FROM THE COPY (never `git checkout --` on an uncommitted
file - it reverts to the index and destroys the chunk's work). One `npx tsc
--noEmit` / sabotage run on the tree at a time.

### F1 (scope R5 / F1(a); AC-S1/S2 proxy) - sticky composer. THE LOOSEST PIN.

- **Object:** `GradingChatPanel.tsx` (the wrapper around `<ChatComposer>`) and
  `grading-chat.module.css`.
- **Instrument - TWO parts, both required:**
  1. **Component (panel):** over `withoutLineComments` source, find the
     `<ChatComposer` mount, then `lastIndexOf("chat.stickyComposer", mountIdx)`.
     Assert it resolves (`> -1`) AND the distance `mountIdx - classIdx` is small
     (a bounded window, e.g. `< 400` chars) so it is the IMMEDIATE wrapper, not
     a far-away reference. This asserts the composer is enclosed by the specific
     sticky class.
  2. **Stylesheet:** over `withoutCssComments(read(MODULE))`, find
     `.stickyComposer`, then its `{` and the NEXT `}`; assert BOTH braces
     resolve and `braceClose > braceOpen`. Slice BETWEEN them and assert the
     block contains `position: sticky` AND an offset
     `/(^|[\s;{])(bottom|top):\s*[^;]+/`. The leading boundary `(^|[\s;{])` is
     load-bearing: it stops `padding-top:`/`margin-top:` from counting as the
     offset (verified in section 11 - the "no offset" sabotage, which leaves
     `padding-top`, correctly reads offset=false). Do NOT match `position:
     sticky` anywhere else in the file.
- **Direction of failure:** RED if the wrapper lacks `chat.stickyComposer`, if
  the class's rule block lacks `position: sticky`, or if it lacks a `bottom`/`top`
  offset.
- **Sabotage (two, both discriminate):**
  - In the module, change `.stickyComposer`'s `position: sticky` to `position:
    static`. Expect RED on part 2. Restore -> GREEN. **Discriminates** the sticky
    fact.
  - In the panel, rename the wrapper's class token off `chat.stickyComposer`.
    Expect RED on part 1 AND on the orphan ratchet (the defined-but-unapplied
    `.stickyComposer` becomes an orphan, 118 -> 119). Restore -> GREEN.
    **Discriminates** the application.
- **MECHANISM PROXY, argued:** `position: sticky` only works if no ancestor
  clips `overflow` and the element has room to stick. Neither is checkable here
  (nothing renders). The REAL test is OWNER AC-S1/S2 (section 10, residual R-2).
  Say so in the pin's own comment. This is the pin most likely to be built loose
  - section 8.

### F2 (scope R3; AC-S2 proxy) - setup strip collapses once the session is ready

- **Object:** `GradingChatPanel.tsx`.
- **Instrument:** over `withoutLineComments` source, assert (a) a session-ready
  conditional guard - `/!sessionReady|sessionReady\s*\?/` - appears at an index
  BEFORE both `id="grading-chat-instructions"` and `id="grading-chat-rubric"`
  (the two editable fields live under the not-ready branch), and (b) a summary
  element referencing `chat.setupSummary` is present (the ready-branch compact
  strip; its presence is independently forced referenced by the orphan ratchet).
- **Direction:** RED if the setup fields are rendered unconditionally (no guard
  precedes them), or the summary class is absent.
- **Sabotage:** replace the `{!sessionReady ? (` guard with `{true ? (` (render
  the fields always) and drop the `chat.setupSummary` reference. Expect RED
  (verified section 11). Restore -> GREEN. **Discriminates** the collapse.
- **KEEP `disabled={sessionReady}` on both fields** even though, gated behind
  `!sessionReady`, it is now belt-and-suspenders. It keeps the existing pins at
  `:82-98` green (minimal change) and double-enforces the attack-9 lock. Do NOT
  remove it; that would redden `:82-98` for no benefit.
- **Argued:** that the collapse actually saves vertical pixels is OWNER (AC-S2).
  The pin proves only that the fields are replaced by a summary in source.

### F3 (scope R4; AC-S1/S3 proxy) - compact setup fields. NEUTRALIZES ITS HAZARD BY ABSENCE, AS RIGOROUSLY AS F1.

- **Object:** the two setup field wrappers in `GradingChatPanel.tsx` and
  `grading-chat.module.css`.
- **THE FACT PINNED (not the spelling):** `styles.field` is GONE from both setup
  wrappers (so the competing `.field textarea` 220px selector no longer matches
  them), `chat.compactField` is PRESENT on both, and the module sets the compact
  textarea `min-height < 220`. Presence of `chat.compactField` ALONE is not
  enough - that is the B1 hazard below.
- **Instrument - TWO parts, both required:**
  1. **Component (presence AND absence, per wrapper, slice-bounded).** For each
     id (`id="grading-chat-instructions"`, then `id="grading-chat-rubric"`):
     resolve `idIdx = source.indexOf(id)` (assert `> -1`); resolve the enclosing
     wrapper open `divIdx = source.lastIndexOf("<div", idIdx)` (assert `> -1`
     AND `< idIdx`, so BOTH ends of the slice resolve - the className sits on the
     enclosing `<div>`, which opens BEFORE the id, so the slice runs BACKWARD
     from the id to that div); slice `wrapperOpen = source.slice(divIdx, idIdx)`.
     Assert `wrapperOpen` CONTAINS `chat.compactField` AND does NOT contain
     `styles.field`. (The id anchor does not collide with the
     `<label htmlFor="grading-chat-instructions">` above it: the substring
     `id="grading-chat-instructions"` is not inside `htmlFor="..."` - verified
     by read AND by the executed harness in section 11, idIdx lands on the
     `TextField`'s `id`.)
  2. **Stylesheet:** over `withoutCssComments(read(MODULE))`, find
     `.compactField`, resolve its `{`/`}` (assert both and `close > open`),
     slice between, and assert a `min-height:\s*(\d+)px` whose value is strictly
     `< 220` (verified section 11: the "min-height 220" sabotage reads RED).
- **Direction of failure:** RED if a setup wrapper lacks `chat.compactField`, if
  a setup wrapper STILL carries `styles.field`, or if the compaction rule's
  min-height is `>= 220` or absent.
- **Sabotage (two, both discriminate):**
  - In the module, set `.compactField`'s textarea `min-height` to `220px`.
    Expect RED on part 2. Restore -> GREEN. **Discriminates** the reduction.
  - **B1 keep-both sabotage:** in the panel, change one setup wrapper's className
    back to `` className={`${styles.field} ${chat.compactField}`} `` - the exact
    build that keeps BOTH classes. Expect RED on part 1's ABSENCE assertion AND
    on the retargeted `:62-67` whole-file pin. Restore -> GREEN. **Discriminates**
    the removal of the competing selector. I ran this passing-but-wrong build
    against the instrument logic (section 11): the OLD presence-only form GREEN,
    the new absence form RED - the absence half is what kills it, and that is the
    whole point of B1.
- **THE HAZARD, now closed by ABSENCE rather than by cascade luck (B1):** the
  220px lives on `.field textarea` (specificity (0,1,1)) in `page.module.css`.
  `.compactField textarea` is EQUAL specificity (0,1,1), so a build that keeps
  `styles.field` on the wrapper AND adds `chat.compactField`
  (`` className={`${styles.field} ${chat.compactField}`} ``) would leave both
  `.field textarea` (220px) and `.compactField textarea` matching, the winner
  decided only by cascade order, which is NOT deterministic across module load
  order. A presence-only pin would ship that field at 220px GREEN - the
  "criterion satisfied one step short of the user-visible effect" class. The
  orchestrator's F1 ruling MANDATES dropping `styles.field`, so this wave uses
  ONE mechanism and the instrument REDs any build that keeps the competitor:
  - **MANDATED - drop `styles.field` from the two setup wrappers** and let
    `chat.compactField` own the layout (see M4 below for exactly what it must
    replace). Then `.field textarea` no longer matches the setup textareas and
    nothing competes. This RETARGETS the existing `styles.field` pin at
    `GradingChatPanel.structure.test.ts:62-67`: in the SAME COMMIT, keep the
    `expect(source).toContain("styles.form")` half, REPLACE the
    `styles.field`-present half with `expect(source).not.toContain("styles.field")`,
    and ADD `expect(source).toContain("chat.compactField")`. The whole-file
    absence is faithful because `styles.field` appears in the panel EXACTLY on
    the two setup wrappers today (`grep -n "styles.field" GradingChatPanel.tsx`
    -> `:169`, `:183`, no other use), so dropping both removes it from the panel
    entirely. Pin the FACT (competing selector gone, compaction class present),
    not the spelling of the className expression.
  - **`!important` on the min-height is NO LONGER AN OPTION.** It keeps
    `styles.field` on the wrapper, which the B1 absence assertion (part 1 and
    the retargeted `:62-67`) now REDs. The earlier "(ii)" alternative is RETIRED
    by the F1 ruling; do not use it.
  - **FORBIDDEN:** a compound selector naming `.field` INSIDE the new module
    (e.g. `.field.compact textarea`) to out-specify. `extractDefinedClasses`
    would register `field` as a defined class OF grading-chat.module.css, never
    referenced via `chat.field`, creating a NEW orphan -> ratchet 118 -> 119 ->
    RED. See section 9, trap 2.
- **M4 - what dropping `.field` strips, and what the compact class MUST replace.**
  `.field textarea` does not only carry the 220px; dropping `styles.field` from a
  wrapper removes ALL of the following (cited in `page.module.css`), and
  `chat.compactField` (or a sibling class applied to the same wrapper) must
  replace everything except the 220px:
  - `.field` (`:148-152`): `display:flex; flex-direction:column; gap:var(--space-2)`.
  - `.field label` (`:154-160`): the uppercase label styling (font-size 2xs,
    weight 700, letter-spacing `0.06em`, `text-transform:uppercase`,
    `color:var(--text-secondary)`).
  - `.fileField, .field textarea` (`:162-168`): `width:100%`, `1px solid
    var(--field-border)`, `border-radius:var(--radius-sm)`,
    `background:var(--field-background)`.
  - `.field textarea` (`:229-236`): `padding:var(--space-4) var(--space-4)`,
    `resize:vertical`, `font:inherit`, `color:var(--text-primary)`,
    `line-height:var(--line-normal)` - KEEP these, DROP only `min-height:220px`.
  - `.field textarea:focus, .fileField:focus-within` (`:488-493`): the focus
    treatment (`outline:2px solid var(--focus-ring-color)`, `outline-offset:2px`,
    `border-color:var(--accent)`).
  - `.field textarea::placeholder` (`:238-240`): `color:var(--text-muted)`.
  - the responsive `.field textarea` (`:4983-4985`): `min-height:180px` at the
    narrow breakpoint - also gone; the compact class should carry its own
    responsive floor if the narrow layout needs one.
  MUI's `TextField` supplies SOME of this by default (a border, a focus ring,
  internal padding), so a wrapper stripped of `.field` still FUNCTIONS - it does
  not render raw and the pins above do not require it to. Whether the compact
  field is a VISUAL REGRESSION against the `.field`-styled baseline (label
  casing, field border token, focus ring, placeholder colour) is NOT
  machine-checkable here; it is OWNER residual RG3-8.

### F4 (scope R5; AC-S4 proxy) - intake error rides with the sticky composer

- **Object:** `GradingChatPanel.tsx`.
- **Instrument:** over `withoutLineComments` source, resolve the
  `chat.stickyComposer` wrapper open, the `<ChatComposer` mount, the `role="alert"`
  submitError block, and the `<GradingResults` mount; assert all resolve, then
  assert the submitError index is INSIDE the sticky wrapper (`> wrapperOpen` AND
  `< mountIdx`) and BELOW the results (`> resultsIdx` when results are present).
- **Direction:** RED if submitError sits above the results table (today's
  position, `:208-212`) or outside the sticky wrapper.
- **Sabotage:** move the submitError `role="alert"` block back above the
  `hasRows`/results block (its current location). Expect RED (verified section
  11). Restore -> GREEN. **Discriminates** the placement.
- **Argued:** that the refused-file/empty-instructions message is actually in
  the composer's VIEWPORT is OWNER (AC-S4). Placing it inside the sticky wrapper
  is the mechanism proxy - the error then rides with the pinned composer rather
  than off-screen above a tall table.

### F5 (brief: "Send grouped with its controls") - preservation guard

- **Object:** `ChatComposer.tsx`.
- **Instrument:** over `withoutLineComments` source, slice the text-mode row
  wrapper by its own anchors - from the `.adaptRow` opener that contains
  `label="Submission text"` to its matching close / next sibling anchor, BOTH
  anchors resolving - and assert the `aria-label="Send submission"` IconButton
  falls inside that one slice. Bound the slice at both ends; an unresolved
  `indexOf` + `slice(start, -1)` silently widens to the whole file (the slice
  trap).
- **Direction:** RED if the Send control is outside the row that holds the text
  field.
- **Sabotage:** move the `aria-label="Send submission"` IconButton out of the
  `.adaptRow` into its own `<div>`. Expect RED. Restore -> GREEN.
  **Discriminates.** This is a PRESERVATION pin: Send is already grouped
  (`ChatComposer.tsx:123-151`); the pin guards W3 from separating them. It is
  net-new coverage (no existing pin asserts the grouping).

### Confirms untouched (not a new pin; a constraint)

W3 must not alter `handleNewSession` or its `window.confirm` (pinned
`:111-118`), nor the bulk Post confirm in the shared `GradingResults.tsx` (which
W3 does not touch). The per-row Post confirm question (GR-POST-ONE-CONFIRM) is a
SEPARATE owner item: W3 neither adds nor removes it. Running the existing
structure test in the gate proves the New session confirm stays green.

---

## 6. The W3-vs-W3b cut, restated for the checker

Firm and in this wave: F1, F2, F3, F4, F5, orphan gate (118), key gate (4).
Out of this wave (separate later work): the `page.tsx` `active` prop + focus
(W3b, R8), the needs-grading picker (W4, F3-scope). Neither blocks the firm
pins.

---

## 7. Routed fork and named hazard (adopt neither value silently)

**FORK F1 (scope section 7) - composer position - RULED IN AS (a); NOT REOPENED.**
The scope lists (a) keep the composer last in DOM, pin it sticky to the viewport
bottom, collapse setup after ready; (b) move the composer ABOVE the results; (c)
keep the order, only collapse and compact. The scope RECOMMENDS (a); the
orchestrator has now RULED F1=(a), so the firm F1 sticky pins stand as authored
and the fork is not re-argued here. Recorded for the history: (b) would have
reversed the explicit UX ruling at `grading-chat-ux.md:187-197`; (c) would have
dropped F1's sticky pin.
**Pin dependence on the ruling (corrects an earlier blanket claim):** F2
(collapse) and F3 (compact) are composer-position-INDEPENDENT - their anchors are
the two setup fields and the summary, not the composer - so they would have
survived ANY of (a)/(b)/(c) unchanged. F4 is NOT position-independent: its
instrument resolves the `chat.stickyComposer` wrapper and asserts submitError
sits INSIDE it and BELOW the results, which is only constructible under (a)
(there is no sticky wrapper under (c), and the composer is not below the results
under (b)). F4 is therefore sound AS-BUILT precisely BECAUSE F1=(a) is ruled in;
had the ruling gone (b) or (c), F4's instrument would have needed rework, not a
one-line offset edit. So: F2/F3 survive all three readings; F4 holds on (a).

**Named hazard (NOT a fork - a build requirement):** F3's compaction only takes
effect at runtime if it out-cascades `.field textarea` (section 5, F3 hazard).
The implementer MUST use mechanism (i) or (ii) and MUST NOT use the forbidden
compound. The owner walk (AC-S1/S3) is what confirms the field actually shrank.

---

## 8. The ONE pin most likely to be built loose - flag for the checker

**F1, the sticky pin.** The naive form -
`expect(read(MODULE)).toMatch(/position:\s*sticky/)` - passes if ANY rule (or
comment) in the file contains it, and `page.module.css` already contains
`position: sticky` five times (`:3197,3231,3242,5585,6151`); even in the NEW
module it would pass when the sticky class is never APPLIED to the composer or is
applied to the wrong element. That is the "test that could not fail" / "slice
that silently widened" class. The robust construction in section 5 F1 defeats it
three ways: (1) the component part asserts the SPECIFIC class token encloses the
`<ChatComposer` mount within a bounded window; (2) the stylesheet part SLICES
that one class's rule block (both braces resolving) and checks `position: sticky`
+ an offset INSIDE the slice only, with the offset boundary-anchored so
`padding-top` cannot satisfy it; (3) the orphan ratchet independently forces the
class to be applied. Even so it is a MECHANISM PROXY - say so in the pin comment,
and route the does-it-actually-stick question to OWNER (R-2).

---

## 9. Instrument traps specific to this wave

**Trap 1 - new module needs a distinct import binding.** Import as `chat`, not
`styles`; reference new classes as `chat.foo`; apply them in the panel (which
imports the module). Reusing `styles` shadows the binding and the orphan scan
sees the classes as unreferenced. (Section 3.)

**Trap 2 - a compound selector naming an existing class inside the new module
reddens the orphan ratchet.** `.field.compact textarea` in grading-chat.module.css
defines `field` there; `field` is never `chat.field`; it becomes an orphan; 118
-> 119 -> RED. Use mechanism (i) drop-`.field` or (ii) `!important`. (Section 5,
F3.)

**Trap 3 - the orphan test REGENERATES `docs/css-orphans.md`, which is already
modified in the working tree.** `git status --short docs/css-orphans.md` shows
`M`. Running the gate rewrites it; that regeneration is EXPECTED - coordinate
with whoever is editing it, and do not hand-edit it to make the gate pass.

**Trap 4 - CSS comment stripping, not line stripping, for the module.** Add a
local `withoutCssComments` (`/\/\*[\s\S]*?\*\//g` only). Do NOT reuse
`withoutLineComments` on CSS, and do NOT give any helper the comment-stripping
name the enumerator tracks or write that name in a test (it reddens the repo).
No `/s` flag; `[\s\S]`.

**Trap 5 - sabotage restore.** `cp`-backup the mutated file; restore from the
copy, never `git checkout --`. One tsc/sabotage run on the tree at a time.

**Trap 6 - do not over-specify the conditional shape in F2.** F2 asserts a
`sessionReady` guard precedes the fields and a summary class exists - it does
NOT dictate `&&` vs ternary vs a nested fragment. Pin the fact (fields gated off
when ready; summary present), not the spelling.

---

## 10. Residual register - owner / instrument / step (the numeric + runtime ACs)

Missing any of owner + instrument + step, a residual is a deletion. These are
the criteria NO pin here can measure; every one routes to the SMOOTH-BASELINE
walk (`docs/run-setup-baseline-walk.md` section 3, snippet 1, at 1366x768). The
grader verify is AFTER W3; the walk ratifies these.

| ID | What no machine pin proves | Owner | Instrument | Step that measures it |
|---|---|---|---|---|
| RG3-1 (AC-S1) | Before the first submit, Instructions + Rubric + composer field + Send/Add are all visible without scrolling | repo owner | snippet 1, stage A: `allFourAboveFold` / `allFourInViewport` | SMOOTH-BASELINE walk; F5-ratify the 1366x768 reference and the fold-vs-viewport reading (walk residual I-9) |
| RG3-2 (AC-S2) | After N = 1, 10, 40 rows the composer is reachable with 0px page scroll; the table scrolls in its own region | repo owner | snippet 1, stage B at 1/10/40 rows: START row `inViewport` | SMOOTH-BASELINE walk (needs a model key, owner-run). F1 sticky is the machine PROXY. |
| RG3-3 (AC-S3) | Pre-session cursor band Instructions->Rubric->composer->Send <= ~400px vertical (fork F5, an UNVALIDATED proposal, scope `:117`) | repo owner | snippet 1 `bandH_AC_S3` | SMOOTH-BASELINE walk; the owner ratifies or overrides ~400 (the scope calls it not derived from anything). F3 compaction is the machine PROXY. |
| RG3-4 (AC-S4) | An intake refusal (file type, ceiling, empty instructions) lands in the composer's viewport | repo owner | snippet 1 then trigger a refusal and look (walk residual I-8) | after W3 build. F4 (error inside sticky wrapper) is the machine PROXY. |
| RG3-5 (R-2) | Whether the composer ACTUALLY sticks (no ancestor clips `overflow`; there is room) | repo owner | the walk, scrolling with rows present | with AC-S2 |
| RG3-6 (F3 hazard) | Whether the compact field actually renders shorter than 220px (cascade/specificity) | repo owner | snippet 1 field `top`/height, stage A | with AC-S1/S3 |
| RG3-7 | Chrome above the panel (TopBar, rails, page padding) is unmeasured; the scope estimates exclude it | repo owner | snippet 1 `fromPanel` vs `top` (walk residual I-4) | first run of snippet 1 |
| RG3-8 (M4 / F3 drop-`.field`) | Whether the compact setup field is a VISUAL REGRESSION against the `.field`-styled baseline once `styles.field` is dropped - uppercase label, field border token, focus outline, placeholder colour (MUI supplies defaults so it still functions, but may not match) | repo owner | snippet 1 stage A: compare the compact field's computed border / focus outline / label casing / placeholder colour against the pre-W3 `.field` baseline | SMOOTH-BASELINE walk, with AC-S1/S3. F3 part 1 (absence of `styles.field` + presence of `chat.compactField`) and part 2 (min-height < 220) are the machine PROXIES for the mechanism, never for the visual parity |

Forks and these residuals are also the SMOOTH-GRADER backlog row's concern; this
register is the test-seat copy, not a substitute for the row.

---

## 11. Satisfiability - the instruments are green on a reference and red on sabotage

A set of failing pins is not a spec until something passes it. I did NOT stand up
a Next tree (nothing renders under vitest; the firm pins are pure source/CSS text
assertions executable the moment the files exist). Instead I built a reference
(satisfying) panel JSX + module CSS and ran the LOGIC of F1-F4 against it and
against each sabotage in a scratch node script. Result: **11/11 correct** - every
pin GREEN on the reference, RED on its sabotage. Notably the F1 offset check
correctly reported `offset=false` when only `bottom: 0` was removed and
`padding-top: var(--space-2)` remained, proving the boundary anchor
`(^|[\s;{])(bottom|top):` excludes `padding-top` (the exact false-match this seat
exists to prevent). The reference construction the implementer can build to green
is: the two setup fields, each wrapper `<div className={chat.compactField}>` (NO
`styles.field`), under a `{!sessionReady ? (...) : <div
className={chat.setupSummary}>...}` conditional; a `<div
className={chat.stickyComposer}>{submitError && <p role="alert">...</p>}<ChatComposer/></div>`
below the results; and a module with `.stickyComposer { position: sticky; bottom:
0; ... }`, `.compactField textarea { min-height: 72px }`, `.setupSummary { ... }`.

**B1 re-execution (this revision, round 2).** I executed the rewritten F3 part 1
(per-wrapper absence+presence) and the retargeted `:62-67` whole-file pin against
a correct build and the keep-both hazard build (`` `${styles.field}
${chat.compactField}` `` on each wrapper) in a scratch node script. Measured:
correct build GREEN on all three forms; keep-both build RED on F3 part 1's
absence assertion AND on the retargeted `:62-67` pin, while the OLD
presence-only form PASSED keep-both - demonstrating the precise gap B1 closes (a
presence-only instrument is a silent-green of the 220px field). The CSS part read
`min-height:72` GREEN and the `min-height:220` sabotage RED, and the id anchor
`id="grading-chat-instructions"` landed on the `TextField`, not the label's
`htmlFor`. So the B1 absence instrument is satisfiable and discriminating, not an
assertion I only argued.

The genuine satisfiability RISK is entirely runtime and OWNER, not a pin: the
sticky overflow dependency (R-2) and the compaction specificity war (F3 hazard).
If either cannot be satisfied at runtime, that is a finding for the orchestrator,
not a pin to quietly drop.

---

## 12. The gate command (explicit paths, every one produced-or-pre-existing)

Two or more files -> `npm run test:paths -- <p1> <p2> ...` ONLY (a raw
multi-path `vitest`/`npm test` silently drops any argument it does not match).
All paths exist today except the new module, which exists in the same commit the
tests run against.

```
npm run test:paths -- \
  src/app/components/grading-chat/GradingChatPanel.structure.test.ts \
  src/app/components/grading-chat/grading-chat-storage-keys.structure.test.ts \
  src/app/components/courses/page-module-css-orphan-classes.test.ts
```

- `GradingChatPanel.structure.test.ts` holds F1-F5 and the retargeted
  `styles.field` pin (`:62-67`: `styles.form` kept, `styles.field` asserted
  ABSENT, `chat.compactField` asserted present - the drop is mandated, no longer
  conditional); it reads the new `grading-chat.module.css` via its `read()`
  helper.
- `grading-chat-storage-keys.structure.test.ts` proves the key canary stays at 4
  (no stray `ta-` key).
- `page-module-css-orphan-classes.test.ts` is REQUIRED because W3 adds a CSS
  module; it must stay at 118 and it regenerates `docs/css-orphans.md` (trap 3).
- `ChatComposer.structure` pins (F5) live in the same structure test file
  (it already reads both `PANEL` and `COMPOSER`), so no extra path.
- Separately run `npx tsc --noEmit` once (no `/s` flags). `GradingChatPanel.tsx`
  is 238 lines (`@(Get-Content).Count`) + ~25 for W3 = ~263, nowhere near the
  1000 ceiling, so
  `file-size-ceiling.structure.test.ts` need not be in the paths, but it is free
  to include and will pass.
- Gate the wave on `git status --short` against the W3 write set
  (`src/app/components/grading-chat/GradingChatPanel.tsx`,
  `.../grading-chat.module.css`, `.../GradingChatPanel.structure.test.ts`;
  `ChatComposer.tsx` only if the sticky wrapper went inside it), and confirm no
  `.claude/worktrees` copy was edited instead of the real tree.
