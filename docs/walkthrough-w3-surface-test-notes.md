# Walkthrough-announcement W3 SURFACE - test notes

Seat: `loop-test-author` (Opus), 2026-10-04. Backlog row SMOOTH-WALKTHROUGH
(Priority 4: scroll-distance / cursor-travel cut, co-equal with click count).
Consumer: a `loop-implementer` writes the production + test code from these
notes; a fresh `loop-checker` reads them first.

This wave is W3 SURFACE. W0 (setup-hook extract, df2dff8d), W1+W2 (run-decision
leaves + wiring, ffaba04f, verified SHIP a4b8fbaf) and the AC-10 wiring guard
(6cac33d2, 12 pins) have all shipped. I measured every quantity below in this
checkout; each names its command.

## What governs, and the one place I diverge from it

`docs/walkthrough-announcement-clicks-scope.md` is the scope and it governs the
surface boundary, the guards, and the mechanisms. The brief that dispatched me
adds two mechanisms the scope did NOT propose and in one case explicitly
REJECTED - a **sticky run/Start bar** and a **collapsible setup strip with a
persisted open-state**. I do not silently adopt either. Section 3 routes both as
forks, names the conflict, and gives a tested instrument for each SO THAT the
mechanism is measurable IF the orchestrator/owner confirms it - it is not a
licence for the implementer to build a scope-rejected mechanism on my say-so.

The scope's own mechanism for the Start scroll cut is **M1 (a reorder)**, not a
sticky bar: Course/Module/Notes/disclosure then the run row, format and options
below. M1, M6 (draft-slot layout) and the arm-notice reorder are UNCONTESTED and
are the firm machine pins in section 5.

## The hard constraint on every instrument here

NOTHING renders under vitest (node-env; `vitest.config.ts` collects only
`src/**/*.test.ts`). Every pin below is a **source-text / structure** pin or a
**pure-function** pin. A green suite proves the MECHANISM is in the source, never
that a pixel moved, focus landed, or a bar stuck. Every pixel/click criterion
(AC-1, AC-5, AC-8, AC-13) is therefore an OWNER criterion, routed to the
SMOOTH-BASELINE walk (`docs/run-setup-baseline-walk.md` section 4 at 1280x720) in
section 8. I did not invent a vitest pin for any distance.

---

## 1. Measured facts (each names its command)

`@(Get-Content <f>).Count` in PowerShell (the mandated instrument; `Measure-Object
-Line` reads 42 low on one file in this repo):

| File | Lines | Role in W3 |
|---|---|---|
| `src/app/components/walkthrough-announcement/WalkthroughAnnouncementPanel.tsx` | 934 | run-row restructure, R-AC16 extraction source, R-F1-TOGGLE wiring |
| `.../AnnouncementCourseFieldset.tsx` | 258 | M1 split into capture + format/options |
| `.../AnnouncementDraftSlot.tsx` | 374 | M6 layout + arm-notice reorder |
| `.../useWalkthroughSetup.ts` | 171 | hosts the new auto-draft toggle's persisted state |
| `.../walkthrough-announcement.structure.test.ts` | 815 | holds the disclosure freeze, key canary, AC-10 wiring pins |
| `.../walkthrough-announcement-timing.structure.test.ts` | 339 | holds the REQ-A32-1 slice, Visible-to pins |
| `src/app/components/courses/page-module-css-orphan-classes.test.ts` | 531 | CSS orphan ratchet (pinned at 118) |
| `src/file-size-ceiling.structure.test.ts` | 151 | repo-wide 1000-line ceiling |
| `src/tools/strip-comments-agreement.structure.test.ts` | 649 | enumerates every `*.test.ts` mentioning `stripComments` |

- `grep -rn "sticky" src/app/components/recording/RecordingControls.module.css`
  returns nothing: a sticky bar needs NEW CSS (no existing class).
- `grep -n "adaptFieldGrid2" src/app/page.module.css` -> defined at :951/:957/:966
  (the two-column grid collapsing at 640px). M6 can reuse it; no new class needed
  for the Message/Preview pair.
- `src/file-size-ceiling.structure.test.ts` does NOT cover the walkthrough dir via
  the recording-split carve-out (that carve-out is only `RecordingTab.tsx`,
  `TabShell.tsx` and direct children of `recording/`). The panel IS checked here,
  but only at LIMIT=1000. The AC-16 `<=900` panel target is NOT enforced by any
  test; it is HAND-MEASURED (section 5, W3-R6).
- The directory key canary (`walkthrough-announcement.structure.test.ts:118-124`)
  asserts `distinctKeys.size === 5` over `/(?<![a-zA-Z])ta-[a-z-]*[a-z]/g` across
  every non-test file in the dir. A camelCase key is captured only up to its first
  capital: `ta-rec-wta-setupOpen` DOES match, as the TRUNCATED `ta-rec-wta-setup` (the
  `[a-z-]*[a-z]` tail stops at the `O`), so a camelCase key silently registers a
  different, truncated key than intended. Use all-lowercase-hyphen
  (`ta-rec-wta-setup-open`) so the whole key is captured. The W3 key
  `ta-rec-wta-autodraft` is all-lowercase-hyphen and matches in full and cleanly; the
  bidirectional canary sabotages (W3-R8: add-key-without-bump, bump-without-key) do not
  depend on the key spelling and still discriminate.
- The shared `stripComments` from `@/app/components/ui/modalAdoptionScan` is the
  string-aware, CRLF-safe, block-comment-supporting tokenizer (proven safe in
  `strip-comments-agreement.structure.test.ts` R1b). `walkthrough-announcement.
  structure.test.ts` already imports it and is classified in that probe's
  EXCLUSIONS (:480-481). `walkthrough-announcement-timing.structure.test.ts` does
  NOT currently mention it and is NOT classified (see section 7, trap 4).

---

## 2. W3 cut decision - ONE wave, not W3b (R-AC16, R-F1-TOGGLE)

**Decision: keep W3 as a single wave.** R-AC16's extraction, M1, M6, the
arm-notice reorder, and R-F1-TOGGLE all write the SAME three files
(`WalkthroughAnnouncementPanel.tsx`, `AnnouncementCourseFieldset.tsx`,
`AnnouncementDraftSlot.tsx`) plus the two structure tests. They are not disjoint
by write set, so splitting into W3b buys zero parallelism and costs a push.

**R-AC16 (panel 934 > the 900 target) is the wave's FIRST step, an unblocker, not
an afterthought.** W3 ADDS to the panel (run-row restructure; the R-F1-TOGGLE
reading). Adding to a 934-line file risks the 1000 ceiling. So the extraction
that pulls the panel under 900 lands first, then the surface work consumes the
headroom. The backlog's stated intent is "extract the auto-draft effect." I
measured that the auto-draft machinery (the two effects at `:596-621`, the
`autoDrafted` state at `:399`, the `AUTO_DRAFT_ON` constant) is ~33 lines - a
`useWalkthroughAutoDraft(...)` hook nets only about -25 after plumbing, landing
near ~907, and R-F1-TOGGLE then adds lines back. **So the auto-draft effect alone
is very likely insufficient to reach <=900.** The implementer/architect must size
the extraction to the MEASURED target, not to the named effect; section 5 W3-R6
makes <=900 a hard gate step, and section 7 trap 1 gives the per-candidate
pin-retarget map so the boundary is chosen with eyes open.

**R-F1-TOGGLE (persisted auto-draft toggle, default ON) stays in W3.** The scope
M1 creates the "Draft format and options" fieldset that hosts it, and the owner
note on the SMOOTH-WALKTHROUGH row wants this toggle to also be the opt-out for
the `researchOn`+auto-draft web-egress that fires every stop. It is the F1
recommended reading (default ON), acted on as the orchestrator's reading, NOT an
owner ruling - record it that way; if the owner later picks F1(a) no-toggle or
F1(b) default-OFF it is a small change (section 5 W3-R8).

**Cut line if the wave runs long** (recorded as residuals, not dropped): scope M8
(`scrollIntoView`) is dropped first (the scope already names it the first cut),
then R-F1-TOGGLE (its write set is a subset of W3's, so a W3b for it is
sequential-after-W3, not parallel). The sticky bar / collapse strip (section 3)
are forks, not in the firm plan. **The arm-notice reorder (W3-R3), the fieldset
split (W3-R1), and M6 (W3-R4/R5) must not be dropped - they are the paramount
scroll/cursor deliverables the owner walk measures.**

---

## 3. The two routed forks (name the conflict; adopt neither value silently)

### FORK A - sticky run/Start bar (brief) vs M1 reorder (scope)

The scope's "Considered and NOT proposed" table rejects a **sticky action bar for
Post**: "Layout-pinned irreversible control; a second place to post is a second
place to misclick. Not priced." The brief wants a sticky bar for **Start**. Start
is reversible (Stop undoes it), so the misclick-on-irreversible objection does not
transfer - but the scope's own Start-scroll mechanism is M1 (move Start UP near
its controls), which needs NO sticky and NO new CSS. A sticky Start bar is a NEW
mechanism the scope did not check and which requires new CSS (`position: sticky`,
measured absent today).

Terminating question for the owner/orchestrator: **the Start scroll cut is
achieved by (a) M1's reorder only (scope's mechanism, no new CSS, AC-1 met by Start
sitting high in the panel), or (b) M1 PLUS a sticky run/Start bar (new CSS module,
the brief's mechanism).** Either answer ends it. I build the firm M1 pins (W3-R1/R2)
unconditionally and provide the conditional sticky pin (W3-F-STICKY) so (b) is
measurable if chosen. **W3-F-STICKY is the one pin most likely to be built loose -
see section 6.**

### FORK B - collapsible setup strip with persisted open-state

The scope's "Considered and NOT proposed" table EXPLICITLY rejects this: "Collapse
the format/options behind a disclosure | Adds 1 click to change anything on first
use for no repeat-path saving; M1's reorder gets the scroll without it." The brief
asks for a collapse control with a PERSISTED open-state (a new `ta-` key). The
persistence answers the scope's objection (a returning instructor who collapsed it
keeps the short scroll with no per-run click), but it is still a control the scope
rejected and it adds a 6th-or-7th `ta-` key.

Terminating question: **add the collapse control + persisted open-state (brief), or
rely on M1's reorder alone (scope)?** Either ends it. If added, its key canary and
persisted-state pins are W3-F-COLLAPSE (section 5). I do NOT pin it as a firm
requirement, because it contradicts the scope's own rejection and I cannot resolve
that conflict from the tree - only a decision resolves it.

**Neither fork blocks the firm pins.** M1, M6, the arm reorder, R-AC16 and
R-F1-TOGGLE are built and gated regardless of how A and B resolve.

---

## 4. Executable here vs argued-only

**Executable now (machine, this environment):** W3-R1, R2, R3, R4, R5, R6
(ceiling half; the <=900 half is a hand-measured command, not a vitest assert),
R7 (retarget discipline), R8 (key canary + persisted-state source pins), R9
(disclosure re-anchor + freeze), R10 (guard suites + counts). Conditional
machine pins W3-F-STICKY, W3-F-COLLAPSE if their fork is confirmed.

**Argued only, NOT asserted as verified:** that the sticky bar actually sticks,
that Confirm actually does not move (AC-5), that the preview is not clipped at
runtime, that focus/keyboard behave, that any distance fell. These are READ/OWNER
claims. The source pins are proxies for "the mechanism is present," never proof
the pixel moved. Labelled argued wherever they appear.

---

## 5. Numbered requirements - object, instrument, direction, sabotage

Every sabotage is a NAMED mutation of PRODUCTION source (never the test), applied
with a `cp` backup and restored with the backup copy (NEVER `git checkout --` on an
uncommitted file - it reverts to the index and destroys the chunk's work). For each
I state whether it discriminates. A sabotage red in both directions, or green in
both, discriminates nothing.

All new/changed pins go into the EXISTING `walkthrough-announcement.structure.test.ts`
(already `stripComments`-classified) unless stated. Do NOT add a comment-stripping
pin to the timing test without classifying it first (section 7 trap 4).

### W3-R1 (AC-2) - source order: capture controls + Start precede format/options

- **Object:** JSX text order in `AnnouncementCourseFieldset.tsx` (and the panel for
  Start).
- **Instrument:** `indexOf` comparisons over COMMENT-STRIPPED source, anchored on
  label strings, never line numbers. In the fieldset: the Course `label="Course"`
  and the disclosure's frozen opening (`Frames from your screen`) precede the paste
  box `label="Paste a previous announcement to match its format (optional)"`, the
  `Save for reuse` button text, and both checkbox labels (`Use emojis in the draft`,
  `Research and cite relevant resource links`). In the panel: the
  `<AnnouncementCourseFieldset` mount and the disclosure precede the Start run row;
  Start (`Start capture`) precedes the format/options content. Assert every anchor
  resolves (`> -1`) before comparing.
- **Direction of failure:** RED if any format/option control precedes the capture
  controls or Start, or the disclosure follows Start.
- **Sabotage:** in `AnnouncementCourseFieldset.tsx`, move the paste `<TextField>`
  above the Course row. Expect RED (paste index < course index). Restore -> GREEN.
  **Discriminates** the order fact.

### W3-R2 (AC-3) - Start and both Generate buttons are siblings in ONE run-row wrapper

- **Object:** the panel's run row.
- **Instrument:** slice the single run-row wrapper by its own anchors over
  comment-stripped panel source (the wrapper that holds `Start capture`), and assert
  BOTH `Generate announcement` and `Generate video script` button texts fall inside
  that one slice. Bound the slice at BOTH ends (opening `<div ...runRow...>` to its
  matching close or the next sibling anchor) and assert both anchors resolve - an
  unresolved `indexOf` + `slice(start, -1)` silently widens to the whole file.
- **Direction:** RED if either Generate button is outside the wrapper that holds
  Start.
- **Sabotage:** move the `Generate video script` `<Button>` out of the run-row
  wrapper into its own `<div>`. Expect RED. Restore -> GREEN. **Discriminates.**
- **NOTE for the implementer:** today Start+probe are in one `runRow` (`:753`) and
  the two Generate buttons in a second `runRow` (`:793`), with the `researching`/
  `autoDrafted` status lines between. M1/M2 merges them into one row. Those status
  `<p role="status">` lines and the Generate `disabled` gate (which includes
  `savedFormatsState === "loading"`, pinned by the G1 block at `:409-423`) must
  survive the merge; re-run the G1 block (section 5 W3-R10).

### W3-R3 (AC-4) - post-arm consequence FOLLOWS the Post/Regenerate/Copy row

This is the arm-notice reorder - the machine proxy for AC-5 (Confirm does not move;
OWNER). Today the consequence `<div>` renders ABOVE the button row
(`AnnouncementDraftSlot.tsx:270-288`, before the row at `:295`), so Confirm shifts
~100px down when the notice appears. M6(iv) moves it BELOW the row, matching the
Regenerate consequence already below at `:336-340`.

- **Object:** `AnnouncementDraftSlot.tsx`.
- **Instrument:** over comment-stripped source, resolve THREE anchors and assert
  order: (1) the Post/Regenerate/Copy row open (`<div className={\`${styles.ghActions}
  ${controls.runRow}\`}>` that contains the Post `ConfirmArmButtons`), (2) the
  post-arm consequence `id={\`wta-post-consequence-${slot.id}\`}`, (3) prove
  consequence index > row-open index. Separately assert the `id` and the
  `aria-describedby`/`consequenceId={\`wta-post-consequence-${slot.id}\`}` link are
  still present (the ConfirmArmButtons `aria-describedby={armed ? consequenceId :
  undefined}` contract, `ConfirmArmButtons.tsx:105`).
- **Direction:** RED if the consequence precedes the row, or the id / consequenceId
  link is gone.
- **Sabotage:** move the `{postArmed && (...)}` consequence block back ABOVE the
  button row (un-reorder - the exact regression this exists to catch). Expect RED
  (consequence index < row index), both anchors still resolving. Restore -> GREEN.
  **Discriminates.**
- **Anchor-destruction warning:** do NOT sabotage by DELETING the consequence - that
  removes the `wta-post-consequence` anchor and the pin errors on "anchor not found"
  rather than cleanly failing the order. The intended mutation KEEPS both anchors and
  flips their order. The order pin MUST assert both anchors resolve first.
- **Re-run, do not assume:** the REQ-A32-1 slice
  (`walkthrough-announcement-timing.structure.test.ts:135-238`) anchors on
  `wta-post-consequence` and slices to the next `</p>`; it finds that `<p>` wherever
  it sits, so the move does not break it - but the implementer RE-RUNS the timing
  test to confirm (the five-ConfirmArmButtons-labels block `:181-237` requires the
  Post `ConfirmArmButtons` to stay the FIRST of the two in source order; M6 must not
  reorder Post after Regenerate).

### W3-R4 (AC-6) - Message and Preview share one `.adaptFieldGrid2`; preview before the row; no clip

- **Object:** `AnnouncementDraftSlot.tsx`.
- **Instrument:** source-text. Assert the `Message (Markdown)` `<TextField>` and the
  preview `<div className={controls.draftPreview} dangerouslySetInnerHTML=...>` are
  both inside one `<div className={styles.adaptFieldGrid2}>` (slice the grid open to
  its close, both anchors resolving, both inside). Assert the preview `<div>`'s
  index precedes the Post row open (G9 - the rendered preview is on screen before
  Post). Assert the preview div's own tag carries NO `max-height` or `overflow`
  attribute/style.
- **Direction:** RED if the preview is outside the grid, after the Post row, or
  carries a clip.
- **Sabotage:** add `style={{ maxHeight: 200, overflow: "auto" }}` to the preview
  div. Expect RED (clip assertion). Restore -> GREEN. **Discriminates** the
  no-clip fact. (A second sabotage - move the preview div after the Post row - RED on
  the order assertion, confirming the G9 half.)
- **Keep intact:** the B2 pin (`walkthrough-announcement.structure.test.ts:226-236`)
  asserts the preview `dangerouslySetInnerHTML={{ __html: previewHtml }}` and
  `markdownToHtml(` in THIS file; the grid move must keep both. Re-run B2.

### W3-R5 (AC-7) - Visible-to field moves INTO the Post row; label verbatim; not persisted

- **Object:** `AnnouncementDraftSlot.tsx` and the directory key canary.
- **Instrument:** source-text. Assert the `label="Visible to students (optional)"`
  `<TextField>` opening falls between the Post row open and its close (slice-bound,
  both anchors resolving). Assert the label literal is unchanged (the A32/RULING 35
  pin at `timing.structure.test.ts:121-123` already freezes it verbatim - re-run it).
  Assert no `ta-` key mentioning visibility/scheduled appears (the directory canary
  stays at its W3 value; see W3-R8).
- **Direction:** RED if the field is outside the row, the label changed, or a
  `ta-rec-wta-*` visibility key appears.
- **Sabotage:** leave the Visible-to `<TextField>` at the top of the slot (do not
  move it into the row). Expect RED (its index not within the Post-row slice).
  Restore -> GREEN. **Discriminates.**
- **Anchor dependency:** the A32/RULING 66/M6 pin (`timing.structure.test.ts:240-259`)
  slices from `label="Visible to students (optional)"` to the next `</p>` (the
  "Leave blank to post immediately..." hint) and asserts `onChange` forwards
  `onSetScheduledAt(slot.id, e.target.value)`. The field's trailing hint `<p>` must
  MOVE WITH the control into the row, or that slice's end anchor (`</p>`) resolves to
  the wrong paragraph. Re-run the M6 pin after the move.

### W3-R6 (AC-16) - size

- **Object:** `@(Get-Content <f>).Count` for every file in the W3 write set, and
  `src/file-size-ceiling.structure.test.ts`.
- **Instrument (two, distinct):**
  1. CEILING (machine): `src/file-size-ceiling.structure.test.ts` catches any file
     `> 1000`. Run it; no W3 file may exceed 1000.
  2. PANEL TARGET (hand-measured, NOT a vitest assert - the ceiling test does not
     see 900): `@(Get-Content src/app/components/walkthrough-announcement/WalkthroughAnnouncementPanel.tsx).Count`
     must be `<= 900` as a WAVE-GATE STEP. This is the R-AC16 target.
- **Direction:** RED if any file > 1000 (ceiling), or the hand-measured panel count
  > 900 (gate step).
- **Sabotage:** not applicable to a count gate in the usual mutate-and-restore sense;
  the demonstrated failure mode is "the extraction was skipped, panel stays 934 >
  900" - the implementer confirms the count fell by running the command before and
  after. (The ceiling test's own demonstrated failure mode: a file crosses 1000.)

### W3-R7 (R-AC16 extraction) - retarget the moved wiring pins, frozen-oracle discipline

The R-AC16 extraction moves code that EXISTING pins slice. Whatever lands in the new
file, its pins RETARGET to that file and keep an INDEPENDENT literal expectation
(never a self-comparison of the new file to itself - that is the refactor-disarms
tautology). A sabotage applied in the NEW location must go RED there; a sabotage in
the OLD (now-empty) location must be impossible (the code is gone). See section 7
trap 1 for the per-candidate map of which pins move for which extraction boundary.

- **Object:** the moved code and the pins that read it.
- **Instrument:** the retargeted pins (same assertions, new `fs.readFileSync` path).
- **Direction:** RED if a retargeted pin still reads the old path (it would find
  nothing and either error on an unresolved anchor or pass vacuously - both are
  defects; assert the anchor resolves).
- **Sabotage (discrimination proof, mandatory):** after retargeting, re-apply ONE of
  the moved pins' original sabotages (e.g. the AC-10 A2 mutation: change
  `alreadyDraftedThisStop: !autoDraftPendingRef.current` to drop the `!`) in the NEW
  file and confirm the retargeted pin goes RED. Restore -> GREEN. If it stays green,
  the retarget read the wrong file or lost its anchor. **Discriminates only if the
  new-location sabotage reddens; prove it, do not assume it.**

### W3-R8 (R-F1-TOGGLE / AC-15) - persisted auto-draft toggle, default ON, canary bumped

- **Object:** `useWalkthroughSetup.ts` (persisted state), `AnnouncementCourseFieldset.tsx`
  (the control, in the format/options fieldset), `WalkthroughAnnouncementPanel.tsx`
  (the `AUTO_DRAFT_ON` constant replaced by the toggle value), and the directory key
  canary.
- **Key:** `ta-rec-wta-autodraft` (all-lowercase-hyphen so the canary regex matches).
- **Instrument (four pins, all source-text):**
  1. **Canary bump, SAME commit:** `walkthrough-announcement.structure.test.ts:118-124`
     `expect(distinctKeys.size).toBe(5)` -> `toBe(6)`, and the `it(...)` title + comment
     list the new key. The bump and the key land in ONE commit (the headless/key-canary
     precedent). If FORK B (collapse) is also confirmed, this is `toBe(7)` with both keys
     listed.
  2. **Persisted-state restore pin:** the toggle is a BOOLEAN rendered as a
     checked/unchecked control, so it MUST restore via a MOUNT EFFECT, never a lazy
     `useState` initializer (a localStorage-seeded initializer does not paint its
     restored value on first render of this SSR'd client component -
     `persisted-details-open-hydration.md`; the file's own emoji/research toggles do
     exactly this at `useWalkthroughSetup.ts:120-138`). Pin: `useWalkthroughSetup.ts`
     declares `useState(true)` (default ON) for the toggle AND a mount effect
     (`useEffect(..., [])`) that reads `STORAGE_KEY_AUTODRAFT` and calls the setter,
     AND a persist effect writing it. Assert the key const equals the literal
     `"ta-rec-wta-autodraft"`.
  3. **Default-ON pin:** assert the `useState(` initializer for the toggle is `true`
     (default ON is the F1(c) reading).
  4. **Consumption pin (WRITE-SET-WIDE - binds the TOGGLE, not a location).** The R-AC16
     extraction may relocate the auto-draft machinery (and with it `AUTO_DRAFT_ON` at
     `:105`) into a new hook file (section 7 trap 1 names `:596-621` + `AUTO_DRAFT_ON`
     `:105` as the FIRST extraction boundary). A panel-scoped "`AUTO_DRAFT_ON = true` is
     gone from the panel" assertion would then pass GREEN when the implementer merely
     MOVED the constant verbatim into the hook and never wired the toggle - shipping
     R-F1-TOGGLE (this wave's own deliverable) DEAD on a green gate. So the pin binds the
     toggle over the WHOLE W3 write set, never a fixed path:
     - **(a) no hard-coded-on constant survives ANYWHERE in the write set.** Over
       comment-stripped source of EVERY file in the W3 write set - the panel AND the new
       auto-draft hook file IF the extraction creates one - assert none matches
       `/const\s+AUTO_DRAFT_ON\s*=\s*true/`. Build the file list from the write set
       (section 9 paths), never one fixed path, so a relocated constant is caught wherever
       it lands.
     - **(b) the call site reads a threaded identifier, not `true` and not the constant.**
       Find `shouldAutoDraft({` by searching each write-set file's comment-stripped source;
       EXACTLY ONE file must contain it - fail loudly on zero or more than one (that is the
       anchor-resolves guard; it also finds the call whether it stayed in the panel or moved
       to the hook). Slice that one call with the SAME anchors AC-10 block A uses AFTER its
       retarget (block A and this pin slice the same firing-effect call and retarget together
       - section 7 trap 1), asserting BOTH slice anchors resolve. In that slice capture the
       argument via `/autoDraftOn:\s*([A-Za-z_$][\w$]*)/`, assert the capture MATCHED (guards
       the empty-slice-passes failure mode), and assert the captured identifier is NEITHER
       `true` NOR `AUTO_DRAFT_ON`.
     - **(c) that identifier is the persisted toggle, not some other variable.** Assert the
       SAME captured identifier appears in the panel's `useWalkthroughSetup(` return
       destructuring (the panel always consumes the setup hook - W0). This binds consumption
       to the persisted `autoDraftOn` value from pin 2 WITHOUT pinning a chosen name (pin the
       fact, not the spelling). Together (a)+(b)+(c) go RED when the constant merely relocated
       and the toggle was not wired.
- **Direction:** RED if the canary is not bumped with the key, if the restore is a
  lazy initializer instead of a mount effect, if the default is not `true`, or if a
  hard-coded `AUTO_DRAFT_ON = true` survives anywhere in the write set / the predicate
  still reads a hard-coded constant instead of the threaded toggle identifier.
- **Sabotage (per sub-pin):**
  - Change `useState(true)` -> `useState(false)`: RED on the default-ON pin.
    **Discriminates** default.
  - Delete the mount-effect restore (leave only the lazy initializer or nothing): RED
    on the restore pin. **Discriminates** the restore mechanism. (It does NOT prove
    the value paints on reload - that is an OWNER check, section 8, labelled argued.)
  - Add the key without bumping the canary: the canary goes RED (size 6 vs asserted
    5). **Discriminates** - this IS the canary's job.
  - Bump the canary without adding the key: RED (size 5 vs asserted 6).
    **Discriminates** - the bidirectional canary catches the stale bump too.
  - Relocate the constant, do not wire the toggle: set `autoDraftOn:` back to a hard-coded
    `true`, or re-introduce `const AUTO_DRAFT_ON = true` (in the panel OR in the new hook)
    and feed it: RED on consumption pin (a) (write-set-wide finds the constant wherever it
    lands) and/or (b) (the `autoDraftOn:` argument reads `true`/`AUTO_DRAFT_ON`, both
    excluded). Restore -> GREEN. **Discriminates** the relocated-but-unwired silent-green
    this pin exists to kill. This sabotage MUST be re-applied IN THE NEW FILE after the
    R-AC16 retarget (W3-R7 discipline) and confirmed RED there, not only in the
    pre-extraction panel - a consumption pin that stays green on the new-file sabotage read
    the wrong file or lost its anchor.
- **Egress note (fold into the owner's F1 decision, argued):** with `researchOn`
  persisted ON, auto-draft fires `gatherWalkthroughResourcesAction` (web egress) every
  stop; the toggle is the opt-out. This is a RELIABILITY/SECURITY property, not
  machine-checkable here (nothing calls the action under vitest); record it for the
  owner walk.

### W3-R9 (disclosure freeze) - re-anchor to survive the fieldset split

**THE SHARPEST ANCHOR HAZARD IN THIS WAVE.** The A18 5.9 freeze
(`walkthrough-announcement.structure.test.ts:605-629`) and the A18 AC-3 block
(`:535-596`) locate the privacy disclosure by:
```
const fieldsetCloseIdx = fieldsetSource.lastIndexOf("</fieldset>");
const pOpenIdx = fieldsetSource.lastIndexOf('<p className={styles.fieldHint}>', fieldsetCloseIdx);
```
M1 splits `AnnouncementCourseFieldset.tsx` into TWO `<fieldset>` elements (capture +
format/options). `lastIndexOf("</fieldset>")` then returns the SECOND (format/options)
fieldset's close, and `lastIndexOf(hint, that)` returns the last hint in the WRONG
fieldset. The freeze would then compare a DIFFERENT paragraph to the frozen literal -
going RED for the wrong reason, or (if that paragraph happened to match) GREEN on a
mangled disclosure. Either way the instrument stops measuring the disclosure.

- **Re-anchor (construction):** change `lastIndexOf("</fieldset>")` to
  `indexOf("</fieldset>")` (the FIRST fieldset close). The scope M1 places the
  disclosure in the CAPTURE fieldset, which is FIRST. `indexOf` is robust to BOTH
  readings: one fieldset (first == only close) and two fieldsets (disclosure in the
  first). Keep `lastIndexOf('<p className={styles.fieldHint}>', firstCloseIdx)` to
  find the disclosure as the last hint before that close.
- **Add a guard** (proves the anchor resolved to the disclosure, not a mis-resolved
  sibling): assert there is NO `<p className={styles.fieldHint}>` occurrence between
  the disclosure's `</p>` and the first `</fieldset>`. If one appears, the disclosure
  is not the last hint of the capture fieldset and the anchor is wrong - fail loudly.
- **Frozen oracle (unchanged literal, the spelling IS the fact):**
  ```
  FROZEN_DISCLOSURE =
    "Frames from your screen are sent to a third-party AI provider to be read while you capture. " +
    "Share a single window rather than your whole screen, and close any gradebook, inbox, or student submission first.";
  ```
  This is byte-identical to `walkthrough-announcement.structure.test.ts:617-619`. The
  whitespace-normalized disclosure text must `toBe(FROZEN_DISCLOSURE)`. It is a FROZEN
  COPY LITERAL - never a self-comparison to the source. Construction is possible from
  the tree: the literal exists verbatim in `AnnouncementCourseFieldset.tsx:252-255`
  today and the scope keeps the disclosure in the capture fieldset (G4 preserved).
- **Direction:** RED if the disclosure text changes by one byte, or if the re-anchor
  resolves to a non-disclosure paragraph (the "no later hint" guard).
- **Sabotage:** change one word of the disclosure (e.g. "third-party" -> "external")
  in `AnnouncementCourseFieldset.tsx`. Expect RED. Restore -> GREEN.
  **Discriminates.** SECOND sabotage (proves the re-anchor is live under the split):
  add a second `<fieldset>` after the capture fieldset holding a trailing
  `<p className={styles.fieldHint}>` with different text, WITHOUT changing the
  disclosure. Expect GREEN (re-anchor still finds the disclosure in the first
  fieldset). If instead it goes RED, the re-anchor latched onto the second fieldset -
  the exact bug this re-anchor exists to prevent.
- **If the implementer instead splits into a SEPARATE component file** (not two
  fieldsets in one file): the freeze retargets to whichever file holds the
  disclosure, byte-identical literal, same guard. This is the FORK of W3-R1's
  structural placement - flag to the checker.

### W3-R10 (AC-14) - guards unchanged

- **Object:** the existing guard suites + two counts.
- **Instrument:** run `npm run test:paths -- <W3 paths>` (section 9). The enforcers
  for G1, G4 (disclosure, W3-R9), G8 (Generate loading gate, `:409-423`), G9 (preview
  before Post, W3-R4), the REQ-A32-1 slice and the Visible-to pins must all pass.
  COUNT pins: `ConfirmArmButtons` used exactly 2 times in `AnnouncementDraftSlot.tsx`
  (Post + Regenerate) and 1 time in the exemplar list (`AnnouncementCourseFieldset.tsx`);
  Start has NO new `disabled=` attribute. Count with a word-boundary regex over
  comment-stripped source, not `grep -c`.
- **Direction:** RED if any enforcer fails, a count drifts, or Start gains `disabled`.
- **Sabotage:** delete one `ConfirmArmButtons` usage in the slot -> count pin RED
  (2 -> 1). Restore -> GREEN. **Discriminates.**

---

## 6. The ONE pin most likely to be built loose - flag for the checker

**W3-F-STICKY (conditional, only if FORK A = sticky).** A naive pin -
`expect(cssText).toMatch(/position:\s*sticky/)` - passes if ANY rule anywhere in the
stylesheet (or a comment) contains `position: sticky`, and passes even when the
sticky class is never APPLIED to the run bar, or applied to the wrong element. That
is the "a slice instrument that silently widened" / "a test that could not fail"
failure class. It would ship a non-sticky bar green.

**The robust construction (a two-file wiring pin):**
1. In the component (panel or a new run-bar component), resolve the run-bar element by
   a stable anchor (the wrapper holding `Start capture`) and assert it carries a
   SPECIFIC class token, e.g. `className={\`...${controls.runBarSticky}...\`}` -
   capture the exact local-name.class.
2. In the stylesheet it imports, slice THAT class's own rule block (`.runBarSticky {`
   to its closing `}`, both anchors resolving) and assert the block contains
   `position: sticky` AND a `top:` offset. Do not match `position: sticky` anywhere
   else in the file.
3. The CSS-orphan ratchet (section 7 trap 2) independently forces the class to be
   referenced, so a defined-but-unapplied sticky class fails that gate too.

**Even this is a MECHANISM PROXY, argued, not proof the bar sticks.** position:sticky
only works if no ancestor has `overflow` clipping and the element has room to stick -
neither is checkable here (nothing renders). The REAL test is OWNER AC-1 (section 8).
Say so in the pin's own comment. Sabotage: change the class's rule to `position:
static` -> RED on the CSS-slice pin; remove the class from the element -> RED on the
component pin AND on the orphan ratchet. Both **discriminate**.

---

## 7. Instrument traps specific to this wave

**Trap 1 - R-AC16 extraction retargets different pins depending on the boundary.**
Map (so the architect chooses with eyes open; all paths relative to the walkthrough dir):

| Extraction candidate (panel lines) | Pins that RETARGET to the new file |
|---|---|
| Auto-draft machinery (two effects `:596-621`, `autoDrafted` `:399`, `AUTO_DRAFT_ON` `:105`) | AC-10 block A (`shouldAutoDraft({` slice) and block B (arming effect `prevCapturingRef`) at `structure.test.ts:723-756`, AND the W3-R8 consumption pin (section 5). AC-10 block A and the consumption pin slice the SAME firing-effect call and RETARGET TOGETHER, as one unit. Blocks C (runExtraction) and D (handleStartStop) retarget ONLY if that code also moves. |
| Exemplar/saved-formats fetch (`:168-306`) | G1 raceWithTimeout pins (`structure.test.ts:328-354`); the G6 canary already moved to the hook in W0. |
| Generation adapters (`buildRequest`/`draftOne`/`postDraft`/`fetchResources`/`researchFingerprint`, `:448-521`) | A19 AC-6 draftOne slice (`timing.structure.test.ts:30-51`), G3 M5 (`structure.test.ts:282-295`), A19 AC-15 researchFingerprint slice (`timing.structure.test.ts:297-318`). |

**Consumption-pin retarget (pairs with AC-10 block A).** When the auto-draft machinery
moves, the W3-R8 consumption pin moves WITH AC-10 block A: they slice the same
`shouldAutoDraft({` call, share one end anchor, and must retarget as a unit - retarget one
without the other and the two pins read different files. W3-R7-style discrimination proof
is MANDATORY: after retargeting, re-apply a moved sabotage IN THE NEW FILE - set
`autoDraftOn:` back to a hard-coded `true`, or re-introduce `const AUTO_DRAFT_ON = true` in
the hook and feed it - and confirm the consumption pin goes RED there; restore -> GREEN.
Assert both call-site slice anchors resolve and the `autoDraftOn:` capture matched, so the
pin cannot pass vacuously on an empty slice (the empty-slice-passes failure mode). A
consumption pin that stays GREEN on the new-file sabotage read the wrong file or lost its
anchor - treat it as unfinished, not as a kill.

Every retarget keeps an independent literal expectation and proves a new-location
sabotage reddens (W3-R7). The auto-draft machinery alone likely will not reach <=900
(section 2) - if the implementer pairs it with the generation adapters, BOTH pin sets
retarget. Recommend the auto-draft machinery first (backlog's intent, fewest pins -
only the recently-authored AC-10 A/B), and extend only as the measured count requires.

**Trap 2 - CSS orphan ratchet is pinned EXACTLY at 118 and auto-discovers new
modules.** `page-module-css-orphan-classes.test.ts` walks every `*.module.css` under
`src/` and asserts `totalOrphanCount === 118` (both `toBeLessThanOrEqual` AND `toBe`).
If W3 adds a new CSS module (sticky bar, FORK A) OR adds classes to an existing one,
EVERY new class must be referenced via `styles.foo`, or the count rises and the gate
goes RED. A class defined-but-unapplied fails here. Wave-gate step: run this test; it
must stay at 118. This test also REGENERATES `docs/css-orphans.md` (it writes it) -
which is the in-flight-edit collision the scope flagged; the regeneration is expected,
coordinate with whoever is editing that doc. **Prefer reusing existing classes
(`.adaptFieldGrid2`, `.adaptRow`, `.runRow`) - M6 needs no new CSS. New CSS is only
the sticky bar (FORK A).**

**Trap 3 - the ceiling test does not see 900.** `file-size-ceiling.structure.test.ts`
only fails `> 1000`. The `<=900` panel target (W3-R6) is hand-measured; do not expect
a vitest assert to catch a 934-line panel.

**Trap 4 - do NOT mention `stripComments` in a NEW or newly-mentioning test file.**
`strip-comments-agreement.structure.test.ts:507-537` enumerates every `*.test.ts`
that mentions `stripComments` and reddens repo-wide until each is classified. The
EXISTING `walkthrough-announcement.structure.test.ts` is already in its EXCLUSIONS
(:480) - add W3's comment-stripped pins THERE. The timing test
(`walkthrough-announcement-timing.structure.test.ts`) is NOT classified; if a W3 pin
there needs comment stripping, EITHER keep it in the already-classified structure test,
OR add the timing test to that probe's EXCLUSIONS map in the SAME commit (reason:
imports `stripComments` from the shared module). Never hand-roll a new comment stripper;
reuse the shared `stripComments` from `@/app/components/ui/modalAdoptionScan` (it is the
safe string-aware tokenizer). Never use the anchored `/^[ \t]*\/\/.*$/gm` form (it is
trailing-comment-blind). No `/s` dotAll flag (passes vitest, fails tsc TS1501 - use
`[\s\S]`). No emojis in `docs/` (scanned). LF line endings.

**Trap 5 - sabotage restore.** `cp`-backup the mutated production file and restore from
the copy. `git checkout --` on an uncommitted file reverts to the index and destroys
the chunk's work. One `npx tsc --noEmit` caller at a time; no two sabotage runs on the
tree concurrently.

---

## 8. Residual register - owner / instrument / step (numeric targets, argued items)

Missing any of owner + instrument + step, a residual is a deletion. These are the
numeric and runtime criteria that NO test here can measure.

| ID | What is not proven by any machine pin | Owner | Instrument | Step that measures it |
|---|---|---|---|---|
| RW3-1 (AC-1) | Start's top `<= 0.65 x M_now` AND `<= 450px` from panel top at 1280x720 | repo owner | `docs/run-setup-baseline-walk.md` section 4 snippet (and scope 3.4), before vs after | SMOOTH-BASELINE walk; sets M_now first (scope R-3). Proposal until ratified. |
| RW3-2 (AC-5) | Confirm button's top does not change between idle and armed (|delta| <= 2px) | repo owner | the 3.4 snippet run twice, clicking Post once between | SMOOTH-BASELINE walk. W3-R3 is the machine PROXY (notice now below the row). |
| RW3-3 (AC-8) | Post button top, relative to slot legend, `<= 0.7 x` its current value | repo owner | 3.4 snippet before/after on the same draft | SMOOTH-BASELINE walk. Proposal. |
| RW3-4 (AC-13) | Felt count (P1 5 or 4; P2 5; P4 5), second run needs no reload, three scroll hops each < one viewport, Confirm does not move | repo owner | owner counts clicks + runs 3.4 on a fresh and a returning profile | SMOOTH-BASELINE walk / the Verify after W3. DO NOT click Confirm post during the walk - it publishes irrevocably to every student (the walk doc says so). |
| RW3-5 | Does the restored auto-draft toggle value actually PAINT on reload (W3-R8 pin proves a mount effect exists, not that it paints) | repo owner | set toggle off, reload, look | with the SMOOTH-BASELINE walk |
| RW3-6 (FORK A) | Whether a sticky Start bar is wanted at all, and whether it actually sticks at runtime | repo owner / orchestrator | the fork decision (section 3) then, if yes, AC-1 in the walk | before the implementer builds FORK A |
| RW3-7 (FORK B) | Whether a collapsible setup strip is wanted (scope rejected it) | repo owner / orchestrator | the fork decision (section 3) | before the implementer builds FORK B |
| RW3-8 | Egress: auto-draft fires `gatherWalkthroughResourcesAction` every stop when `researchOn` is persisted ON; the toggle is the opt-out | repo owner | use it; reliability/security seat reading | folded into the F1 toggle decision (W3-R8) |

Forks A and B themselves are also recorded on the SMOOTH-WALKTHROUGH backlog row as
open; this register is the test-seat copy, not a substitute for the backlog entry.

---

## 9. The gate command (explicit paths, every one produced-or-pre-existing)

Two or more files -> `npm run test:paths -- <p1> <p2> ...` ONLY (a raw multi-path
`vitest`/`npm test` silently drops any argument it does not match). Every path below
exists today (verified by `ls`):

```
npm run test:paths -- \
  src/app/components/walkthrough-announcement/walkthrough-announcement.structure.test.ts \
  src/app/components/walkthrough-announcement/walkthrough-announcement-timing.structure.test.ts \
  src/app/components/walkthrough-announcement/announcement-draft-slots.test.ts \
  src/app/components/walkthrough-announcement/useAnnouncementDraftSlots.test.ts \
  src/app/components/walkthrough-announcement/walkthrough-run-decisions.test.ts \
  src/app/components/courses/page-module-css-orphan-classes.test.ts \
  src/file-size-ceiling.structure.test.ts \
  src/tools/strip-comments-agreement.structure.test.ts
```

- `walkthrough-run-decisions.test.ts` is included only because the R-AC16 extraction
  may move callers of the leaves; the leaf itself should not change. If W3 does not
  touch it, it still passes (credited by the wrapper).
- `page-module-css-orphan-classes.test.ts` is required ONLY if W3 adds/changes CSS
  (FORK A). It regenerates `docs/css-orphans.md` (trap 2).
- `strip-comments-agreement.structure.test.ts` is required if any new/newly-mentioning
  test file references `stripComments` (trap 4).
- Separately, HAND-MEASURE the panel: `@(Get-Content
  src/app/components/walkthrough-announcement/WalkthroughAnnouncementPanel.tsx).Count`
  must be `<= 900` (W3-R6). Run `npx tsc --noEmit` once (no `/s` flags; one caller).
- Gate the wave on `git status --short` against the W3 write set, and confirm no
  `.claude/worktrees` copy was edited instead of the real tree.

---

## 10. Reference implementation note (satisfiability)

I did not stand up a throwaway tree for W3 because every firm pin here is a
retarget or a reorder of an instrument that is ALREADY GREEN against the current
source (the disclosure freeze, the AC-10 wiring pins, the REQ-A32-1 slice, the key
canary), plus straightforward source-order/containment pins whose satisfying source
is the scope's M1/M6 layout. The satisfiability risk is concentrated in TWO places,
both called out: (a) the R-AC16 extraction reaching <=900 while retargeting its pins
(trap 1 / W3-R7 - the implementer MUST hand-measure after extracting and prove the
new-location sabotage reddens), and (b) the disclosure re-anchor surviving the split
(W3-R9 - the second sabotage, adding a decoy second fieldset, is the proof the
re-anchor is live). If either cannot be satisfied, that is a finding for the
orchestrator, not a pin to quietly drop.
