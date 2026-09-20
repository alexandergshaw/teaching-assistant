# A20 UX pass - as-built review of commit 13cef3b

Scope: the shipped diff at `13cef3b` (`git show 13cef3b --stat`, 21 files
changed, 598 insertions, 12 deletions), against the requirement and residual
list in `docs/a20-scope.md` Section 5.4 ("disable vs hide", relocated to this
pass) and Section 8 (owner verification, Trap 1). This is the promised Wave 3
review, not a rubber stamp - it reads the real files, not the scope doc's
intentions.

**What this pass could and could not check.** This repo's vitest is
`environment: "node"`, collects `src/**/*.test.ts` only, and renders no
component (`docs/loop/this-repo.md` section 2 / section 6). Every claim below
about how a control actually behaves in a browser - focus order, whether a
screen reader announces something, whether `a.click()` triggers a real
download - is a **reading claim**: derived from the shipped source and, where
named, from the installed library's own source in `node_modules`, never from
a render. Claims are labelled as such throughout. One finding below (Q1) is
sourced from reading `@mui/material@9.0.1`'s own implementation
(`node_modules/@mui/material/package.json:` `"version": "9.0.1"`) rather than
from training-data recall, per this repo's own rule that library behaviour in
this checkout must be read, not remembered.

---

## Verdict summary

| # | Question | Verdict |
|---|---|---|
| 1 | Disable vs hide | **Disable is the right call - CONFIRMED.** But the `aria-describedby` wiring that was supposed to make the reason reach assistive technology does not reach the control it is attached to, in either the enabled or the disabled state. This is a real defect, not a residual - concrete fix below. |
| 2 | Post-stop element copy | **Sound as built.** Hedged ("should already be"), never asserts a fact the app cannot know, and correctly says "above" given where it renders. Closed. |
| 3 | Two-surface consistency | **Sound as built.** Label, hint copy, disabled-reason copy, AC7 copy, ID-naming convention and DOM placement pattern are all identical modulo the surface-specific ID prefix. Closed, with one asymmetry noted (test coverage, not behaviour). |
| 4 | Zero-byte case | **Sound as built.** Traced end to end below; the design correctly never lets the new element assert success over a 0-byte capture. Closed, with one optional (non-blocking) enhancement noted. |
| 5 | Copy quality | **Sound as built.** No emojis, no developer voice, reuses the app's existing hint-paragraph idiom (`styles.fieldHint`) and quotes the sibling control's real label verbatim rather than paraphrasing it. Closed. |

---

## Q1 - Disable versus hide

**The call itself: disable, not hide - CONFIRMED as the right choice.**

`saveVideo` sits in the same `styles.adaptRow` block, one control away
(`DiscussionCaptureSettings.tsx:127-141` for the sibling, `:142-161` for the
new checkbox; same shape at `MessageCaptureSettings.tsx:239-253` and
`:254-273`), and is itself a checkbox the instructor can flip back in one
click. Hiding the auto-download checkbox entirely when `saveVideo` is off
would make it appear and disappear as the instructor toggles a neighbouring
box - a moving target - and would hide the option from an instructor who
wants to plan ahead (tick "download automatically" before separately
enabling "save the screen recording"). A greyed-out control with a visible
reason lets them see the dependency without the layout shifting under them.
This also matches the one real precedent this repo has for "the dependency is
another checkbox right next to it": `docs/a20-scope.md:451` already confirms
"disabled, not hidden" is a real, confirmed house pattern (via
`DiscussionReplyRow.tsx:665`, `MessageThreadRowActions.tsx:219,230`), even
though - as that same section admits - neither precedent supplies the visible
fieldHint mechanism used here. **What would change this verdict:** if the
owner's real-browser check (Section 8 of the scope doc) finds that instructors
routinely want to arm "download automatically" *before* turning on "save the
screen recording" and are confused by a greyed-out control blocking that
order, the fix would not be "hide it" but "never disable it" - see the
alternative pattern below, which this codebase already uses elsewhere for
exactly this reason.

**The persisted value survives the disabled state - CONFIRMED, not a
finding.** `checked={autoDownload}` is unconditional in both files
(`DiscussionCaptureSettings.tsx:148`, `MessageCaptureSettings.tsx:260`); only
`disabled={!saveVideo}` (`:150`, `:262`) is conditional. Native HTML
`disabled` never clears a control's bound value, and the two persisted-key
implementations read/write independently of `saveVideo`
(`discussion-persisted-controls.ts:152-158` for
`ta-rec-disc-auto-download`, `useMessagePersistedControls.ts:115-119` for
`ta-rec-msg-auto-download`, both defaulting to `false` via
`readLocalStorage(KEY) === "1"`). So Section 5.4's "not relocated" data-
integrity requirement - the checkbox's persisted value must exist and be
readable/writable regardless of the display choice, and must not be cleared
while disabled - is satisfied by construction. **Closed.**

**The `aria-describedby` wiring - THIS IS A DEFECT.** The prompt asks
specifically whether the shipped wiring "survives the disabled state." Having
opened the installed `@mui/material@9.0.1` source, the honest answer is that
it does not reach the right DOM node **in either state**, disabled or not - so
"does it survive being disabled" is close to moot; it does not work when
enabled either.

The shipped JSX (`DiscussionCaptureSettings.tsx:146-152`, identical at
`MessageCaptureSettings.tsx:258-264`):

```
<Checkbox
  size="small"
  checked={autoDownload}
  onChange={(e) => setAutoDownload(e.target.checked)}
  disabled={!saveVideo}
  aria-describedby={AUTO_DOWNLOAD_HINT_ID}
/>
```

passes `aria-describedby` as a bare top-level prop on `<Checkbox>`. Tracing
where that prop actually lands, hop by hop, in the installed library:

1. `node_modules/@mui/material/Checkbox/Checkbox.js:114-126` destructures the
   props `Checkbox` recognises (`checkedIcon`, `color`, `size`, `slots`,
   `slotProps`, etc.); `aria-describedby` is not among them, so it survives in
   `...other` (`:125`).
2. `Checkbox.js:143-147` forwards that `...other` into the **root** slot's
   `externalForwardedProps` (`:146`) - the root slot's `elementType` is
   `CheckboxRoot`, which is a styled `SwitchBase` (`Checkbox.js:29-33`
   defines `CheckboxRoot` as `styled(SwitchBase, ...)`). So `aria-describedby`
   is now a prop being passed into `SwitchBase`.
3. `node_modules/@mui/material/internal/SwitchBase.js:97-116` destructures
   the props `SwitchBase` recognises (`checked`, `disabled`, `onChange`,
   `id`, `name`, etc. - not `aria-describedby`), which again survives in
   `...other` (`:115`); `:117-119` renames that to `buttonBaseProps` (`other`
   minus `nativeButton`).
4. `SwitchBase.js:171` builds a **separate** `externalForwardedProps = {slots,
   slotProps}` object - this one does NOT include `buttonBaseProps`.
5. `SwitchBase.js:178-190` (the **root** slot, `useSlot('root', ...)`) spreads
   `...buttonBaseProps` into that call's `externalForwardedProps` (`:180-183`:
   `{...externalForwardedProps, component: 'span', ...buttonBaseProps}`).
   This is where `aria-describedby` goes.
6. `SwitchBase.js:204-230` (the **input** slot, `useSlot('input', ...)`, the
   one that renders the actual native `<input type="checkbox">` a keyboard or
   screen-reader user focuses) uses the *other*, `buttonBaseProps`-free
   `externalForwardedProps` from step 4, and its own `additionalProps`
   explicitly lists only `autoFocus, checked, defaultChecked, disabled, id,
   name, readOnly, required, tabIndex, type, value` (`:216-229`).
   `aria-describedby` is not in this list and is not reachable from
   `buttonBaseProps` here - **the input never receives it.**
7. The root slot (from step 5) is rendered as `SwitchBase`'s `RootSlot`, which
   `Checkbox.js`'s own root additional props renders as `component: 'span'`.
   In `node_modules/@mui/material/ButtonBase/ButtonBase.js:267,285`, that
   root element (`ButtonBaseRoot`, `as: ComponentProp` = `'span'`) receives
   `...other` (ButtonBase's own catch-all, which by this point still carries
   `aria-describedby`) spread directly as DOM attributes at `:285`.

Net result: `aria-describedby="…"` lands on the non-interactive wrapping
`<span>` that `Checkbox` renders around the real control, not on the native
`<input type="checkbox">` that keyboard focus and screen readers actually
land on. `SwitchBase.js:197` sets that span's own `role: undefined, tabIndex:
null` - it is not even meant to be a focus target itself. Per WAI-ARIA,
`aria-describedby` must be read off the element that needs the description;
an ancestor carrying it does not make the description reachable from the
descendant `<input>` that a screen reader actually names and focuses. This is
a reading claim about library behaviour, not a rendered observation, but it
is not a guess: every hop above is a specific line in the installed package,
and I opened all of them.

This is not something the A20 implementer invented. The identical idiom -
`<Checkbox ... aria-describedby={ID} />` on an always-enabled control -
already exists at `MessageCaptureSettings.tsx:182-184` for the pre-existing
`addressByName` checkbox, predating this commit. A20 correctly copied the
local house pattern; the pattern itself does not do what its authors likely
believed. I am not treating that pre-existing instance as in scope for this
review (it is outside the A20 diff), but it means the fix below should not be
read as "A20 did something unusual" - it is "A20 inherited a repo-wide MUI
Checkbox gotcha that happens to be checkable by reading `node_modules`."

**Recommended CHANGE.** Route the description through the `input` slot, which
`SwitchBase.js:204-207` DOES read from (`externalForwardedProps.slotProps.
input`, forwarded from `Checkbox.js:137,160-166`'s own `slotProps.input`
handling) - this is the same "the real native element is reached through the
`input` slot prop, not a bare top-level prop" principle this repo's own
memory already documents for `TextField`/`InputBase` (`slotProps.input` vs
`slotProps.htmlInput`).

File: `src/app/components/recording/DiscussionCaptureSettings.tsx`
Replace (lines 146-152):
```
                <Checkbox
                  size="small"
                  checked={autoDownload}
                  onChange={(e) => setAutoDownload(e.target.checked)}
                  disabled={!saveVideo}
                  aria-describedby={AUTO_DOWNLOAD_HINT_ID}
                />
```
with:
```
                <Checkbox
                  size="small"
                  checked={autoDownload}
                  onChange={(e) => setAutoDownload(e.target.checked)}
                  disabled={!saveVideo}
                  slotProps={{ input: { "aria-describedby": AUTO_DOWNLOAD_HINT_ID } }}
                />
```

File: `src/app/components/message-replies/MessageCaptureSettings.tsx`
Replace (lines 258-264), same substitution:
```
                <Checkbox
                  size="small"
                  checked={autoDownload}
                  onChange={(e) => setAutoDownload(e.target.checked)}
                  disabled={!saveVideo}
                  aria-describedby={AUTO_DOWNLOAD_HINT_ID}
                />
```
with:
```
                <Checkbox
                  size="small"
                  checked={autoDownload}
                  onChange={(e) => setAutoDownload(e.target.checked)}
                  disabled={!saveVideo}
                  slotProps={{ input: { "aria-describedby": AUTO_DOWNLOAD_HINT_ID } }}
                />
```

**This fix has a companion cost the implementer of the fix must not skip.**
`DiscussionCaptureSettings.wiring.test.ts:45-53` currently asserts the exact
literal pattern `aria-describedby=\{([A-Za-z0-9_]+)\}` (`:48`) directly after
the checkbox's own text. That regex will not match
`slotProps={{ input: { "aria-describedby": AUTO_DOWNLOAD_HINT_ID } }}`, so the
fix above turns that test red by construction (correctly - the test's own
comment at `:45` says it is checking "aria-describedby points at a visible
hint paragraph," and the fact being pinned should be "the description is
wired to the real input," not "the literal substring `aria-describedby={`
appears somewhere near the checkbox"). Recommended companion edit, same file,
same lines (`:45-53`):

```
  it("the disabled reason is discoverable by more than sighted mouse-hover alone - aria-describedby reaches the input via slotProps", () => {
    const idx = stripped.indexOf("Download automatically when recording stops");
    const block = stripped.slice(Math.max(0, idx - 400), idx);
    const describedByMatch = block.match(/slotProps=\{\{\s*input:\s*\{\s*"aria-describedby":\s*([A-Za-z0-9_]+)\s*\}\s*\}\}/);
    expect(describedByMatch).not.toBeNull();
    const hintId = describedByMatch?.[1] ?? "";
    expect(hintId.length).toBeGreaterThan(0);
    expect(stripped).toMatch(new RegExp(`<p id=\\{${hintId}\\}`));
  });
```

with the same substitution applied to `MessageCaptureSettings.wiring.test.ts`
if a matching assertion is added there (see the coverage gap noted under Q3 -
today that file has no equivalent assertion at all, on either the old or new
wiring).

I want to be precise about what this fix does and does not achieve. It makes
`aria-describedby` land on the DOM node that WAI-ARIA says it should describe
- that much is a verifiable library-source fact. Whether a specific real
screen reader then actually announces the hint on focus (or on browse-mode
traversal, for the disabled case, where focus never happens) is still outside
what any instrument in this repo can check - see Residual R1 below, which
folds into the scope doc's existing Section 8 / Residual R4.

---

## Q2 - The post-stop element's copy

Shipped, identically on both surfaces (`DiscussionRepliesPanel.tsx:791-795`,
`MessageRepliesPanel.tsx:378-382`):

> "This should already be in your Downloads folder - if it isn't there, use
> the link above."

Judged against the reason Section 5.6/RULING Y1 exists (a browser can refuse
`a.click()`-triggered downloads with no file and no error, so the instructor
must be able to tell "saved" from "silently dropped"):

- **It does not overclaim.** "Should already be" is a hedge, not an assertion
  of a fact the app cannot know. It does not say "has been downloaded" or "is
  in your Downloads folder" as a flat statement of fact - both of which this
  code genuinely cannot verify (`recorder.onstop` is an event callback with no
  visibility into whether the browser's download manager accepted the file,
  per `docs/a20-scope.md` Section 6, Trap 1). This is the calibration the
  scope doc asked for, and it is what ships.
- **It gives an actionable next step**, which is the actual requirement (Y1:
  "an instructor who sees the extra element and finds nothing in Downloads
  has actionable information"): it points at the fallback.
- **"Use the link above" is accurate, not just plausible-sounding.** I checked
  render order rather than assuming it: the unconditional `recordingUrl &&`
  link block is at `DiscussionRepliesPanel.tsx:777-781` /
  `MessageRepliesPanel.tsx:369-373`, and the new conditional block is after it
  at `:791-795` / `:378-382` in the same files. The link genuinely renders
  above this sentence in DOM order, so "above" is a correct spatial claim
  given the JSX as written - this is a reading claim about source order, not
  about rendered pixel position, but the two coincide here since nothing
  between them can reorder a block in normal document flow.

**Closed - no change recommended.**

---

## Q3 - The two surfaces

Quoting both directly, side by side.

**Checkbox label** (identical):
- Discussion: `DiscussionCaptureSettings.tsx:154` - `label="Download
  automatically when recording stops"`
- Message: `MessageCaptureSettings.tsx:266` - `label="Download automatically
  when recording stops"`

**Enabled-state hint** (identical):
- Discussion: `DiscussionCaptureSettings.tsx:158` - `"Applies to the next
  capture."`
- Message: `MessageCaptureSettings.tsx:270` - `"Applies to the next
  capture."`

**Disabled-state hint** (identical, and both quote the sibling control's real
label rather than a paraphrase - confirmed by grepping each file's own
`saveVideo` checkbox: `DiscussionCaptureSettings.tsx:137` and
`MessageCaptureSettings.tsx:126` both carry `label="Also save the screen
recording"`):
- Discussion: `DiscussionCaptureSettings.tsx:159` - `'Turn on "Also save the
  screen recording" first - there is nothing to download otherwise.'`
- Message: `MessageCaptureSettings.tsx:271` - `'Turn on "Also save the screen
  recording" first - there is nothing to download otherwise.'`

**AC7 post-stop copy** (identical, quoted in full under Q2 above).

**Placement and layout**: both checkboxes sit in a `styles.adaptRow` wrapper
(`DiscussionCaptureSettings.tsx:142`, `MessageCaptureSettings.tsx:254`) - the
same house pattern the sibling `saveVideo` row already uses one block above it
in both files, so the new control does not introduce a new layout idiom.

**Persisted-key naming** deliberately differs by surface prefix
(`ta-rec-disc-auto-download` vs `ta-rec-msg-auto-download`, matching each
surface's existing `ta-rec-disc-*` / `ta-rec-msg-*` convention) - this is an
internal storage detail the instructor never sees, so it does not create any
user-facing inconsistency. An instructor who learns this control on one
surface will find identical label, identical behaviour, identical wording,
and identical placement on the other. **Closed.**

**One asymmetry worth flagging, but it is a test-coverage gap, not a user-
facing inconsistency**: `DiscussionCaptureSettings.wiring.test.ts:39-53` has
two assertions the message-side equivalent lacks entirely -
`MessageCaptureSettings.wiring.test.ts:106-112` (M14) checks only the
`checked`/`onChange` binding and a placement constraint; it has no assertion
for `disabled={!saveVideo}` and no assertion for the `aria-describedby`
wiring, even though `MessageCaptureSettings.tsx:262-263` carries both. Today
this is invisible because the two files' source is symmetric by inspection,
but nothing here would catch the message side silently losing its `disabled`
guard or its hint wiring in a future edit while the discussion side keeps
its. See Residual R2.

---

## Q4 - The zero-byte case, traced end to end

Tracing the three states against the actual conditions in
`DiscussionRepliesPanel.tsx:777-795` (message side identical at
`MessageRepliesPanel.tsx:369-382`):

1. **Auto-download off** (`autoDownload` was false for the session that
   stopped, so `lastSessionAutoDownload === false`): the unconditional
   `recordingUrl && (...)` link (`:777`) renders if a recording exists at
   all; the new `lastSessionAutoDownload && recordingBytes > 0` block (`:791`)
   never renders, because its first condition is false regardless of byte
   count. The instructor sees exactly what they saw before A20 shipped.
   **Coherent** - nothing changed for instructors who never asked for this
   feature.

2. **Auto-download on, capture produced bytes** (`lastSessionAutoDownload ===
   true`, `recordingBytes > 0`): both blocks render - the existing sized link
   (`"Download recording (X.X MB)"`) and, below it, the new sentence
   confirming the request and pointing back at the link as a fallback.
   **Coherent**, and this is the case Y1 exists to make legible.

3. **Auto-download on, capture produced nothing**
   (`lastSessionAutoDownload === true`, `recordingBytes === 0`): the
   unconditional link still renders - unconditional means unconditional, and
   `recordingBytes / 1048576` with `recordingBytes === 0` produces `"Download
   recording (0.0 MB)"` exactly as it does today, pre-A20. The new block does
   **not** render, because its `recordingBytes > 0` gate (M-G's fix) is
   false. So the instructor sees only the pre-existing 0.0 MB link, with no
   second sentence at all.

   Is (3) coherent? I judge yes, on the following reasoning: the "(0.0 MB)"
   text is itself the signal that nothing was captured - it is not new, and
   it is not something A20 changed. Adding an affirmative "this should
   already be in your Downloads folder" sentence on top of a 0.0 MB link
   would have been actively worse (it is exactly the compounded-false-claim
   risk `docs/a20-scope.md`'s M-G correction identifies at `:515-527` and
   fixes by adding the byte gate). Suppressing the confirmation sentence
   instead of showing a wrong one is the safer failure mode, and it costs the
   instructor nothing they did not already have: the size label already told
   them nothing was captured.

   **One optional, non-blocking observation, not a defect**: in this state,
   an instructor who deliberately turned auto-download on gets *zero*
   acknowledgment that the feature was even attempted - the screen looks
   identical to state 1 (feature off) except for the "(0.0 MB)" text they'd
   have seen anyway on any empty capture, on or off. A more informative
   design could show a third, distinct sentence for exactly this case ("no
   recording was captured, so nothing was downloaded") rather than silence.
   I am not recommending this as a required change - the current behaviour
   is correct and the scope doc's AC7 explicitly limits itself to "does not
   assert success for a capture that produced nothing," which is satisfied -
   but it is worth recording as a possible follow-up rather than dropping it
   silently. See Residual R3.

**Closed** as built; R3 is an enhancement idea, not an open defect.

---

## Q5 - Copy quality against the house style

Every new user-facing string, quoted, with a verdict:

| String | Location | Verdict |
|---|---|---|
| "Download automatically when recording stops" | `DiscussionCaptureSettings.tsx:154`, `MessageCaptureSettings.tsx:266` | Earns its place. Plain, describes the action, matches the register of the sibling "Also save the screen recording." No emoji, no jargon. |
| "Applies to the next capture." | `DiscussionCaptureSettings.tsx:158`, `MessageCaptureSettings.tsx:270` | Reused verbatim from the existing `saveVideo` hint (`DiscussionCaptureSettings.tsx:139`, `MessageCaptureSettings.tsx:128` both already carry this exact sentence) - correct reuse of an established idiom, not a new invention. |
| 'Turn on "Also save the screen recording" first - there is nothing to download otherwise.' | `DiscussionCaptureSettings.tsx:159`, `MessageCaptureSettings.tsx:271` | Earns its place. States the dependency in plain language and quotes the real sibling label (verified byte-for-byte against `:137`/`:126`) rather than a stale paraphrase - this is exactly the kind of citation discipline this repo's own traps card asks implementers for, applied to UI copy instead of code. |
| "This should already be in your Downloads folder - if it isn't there, use the link above." | `DiscussionRepliesPanel.tsx:793`, `MessageRepliesPanel.tsx:380` | Earns its place - see Q2. Reads as a person talking to another person, not a developer's status message ("download triggered", "auto-download: success"). No emoji. |

No emoji anywhere in the diff (checked by reading every added string above,
consistent with `AGENTS.md`'s "No Emojis in Codebase" rule and this repo's
`src/lib/no-emojis.test.ts`, which scans `docs/` and `src/` but not this
review's own read of the diff - that test is a separate, executable gate this
pass does not need to duplicate). No string reads as developer voice (no
"triggered", "invoked", "config", "flag", or similar). All four new/changed
strings reuse the existing `styles.fieldHint` paragraph class
(`page.module.css:258-262` - plain, muted, visible text, not visually
hidden), so nothing here introduces a new visual idiom for Visual/aesthetic
to review separately. **Closed.**

---

## Confirmed sound, explicitly closed (do not re-litigate)

1. Disable-not-hide as the mechanism for the "Save video" dependency (Q1).
2. The persisted `autoDownload` value survives the disabled state
   unconditionally (Q1).
3. The AC7 post-stop copy's calibration - hedged, not asserting an unverifiable
   fact, correctly says "above" (Q2).
4. Cross-surface consistency of every new user-facing string and control
   placement (Q3).
5. The zero-byte state's suppression of the new confirmation sentence (Q4).
6. Copy quality and voice against the house style (Q5).

## Overturned / changed

1. **The `aria-describedby` wiring on both new checkboxes does not reach the
   native `<input>` element**, in either the enabled or disabled state - it
   lands on a non-interactive wrapper `<span>` per the library trace in Q1.
   Concrete fix given above for both component files, with the companion test
   edit it requires.

---

## Residual register

| # | What is not proven now | Owner | Instrument | Step that measures it |
|---|---|---|---|---|
| R1 | Whether a real screen reader, after the `slotProps.input` fix above lands, actually announces the hint text on focusing the (enabled) checkbox, and whether it is reachable at all via browse-mode/virtual-cursor navigation while the checkbox is disabled (native `disabled` removes it from the Tab sequence, per the established fact at `docs/modules-selection-ask-ai-acceptance-criteria.md:185`, though browse-mode/virtual-cursor traversal is a different navigation path than Tab and this repo has no instrument that can distinguish the two) | Owner | Real browser + real screen reader (NVDA/VoiceOver), manual check | Same owner-verification session as `docs/a20-scope.md` Section 8 / Residual R4 - this finding narrows what that session needs to check, it does not replace it |
| R2 | `MessageCaptureSettings.wiring.test.ts` has no assertion for `disabled={!saveVideo}` or the `aria-describedby`/`slotProps.input` wiring on the auto-download checkbox, unlike the discussion-side file - a future edit could silently drop either on the message side alone | Test seat | A new case in `MessageCaptureSettings.wiring.test.ts` mirroring `DiscussionCaptureSettings.wiring.test.ts:39-53`, updated for the `slotProps.input` fix above | Whichever chunk next touches either file's wiring test, or immediately alongside the Q1 fix if it lands as its own chunk |
| R3 | Whether an explicit "nothing was captured, so nothing was downloaded" sentence in the zero-byte-plus-auto-download-on case would be more informative than the current silence (Q4) - a product/UX judgment, not a defect | Owner | n/a - a design decision, not a measurement | Batch with any future A20 follow-up round, non-gating; not required for this row to close |

R1 and R2 narrow and extend, rather than duplicate, `docs/a20-scope.md`'s
existing Residual R4 (Section 9) and its Section 8 owner-verification item -
this pass does not re-open those, it hands them a sharper question to check.

---

## What I could not determine

- Whether the `slotProps.input` fix, once applied, is sufficient on its own
  for every screen reader in real use - I traced the prop through the
  installed library's source, which is a fact about this codebase's
  dependency, not a fact about assistive-technology behavior in general. No
  render, no AT, no browser exists in this checkout (`docs/loop/this-repo.md`
  section 6).
- Whether disabling (versus some other treatment) is what an actual
  instructor using a screen reader would prefer - Q1's "what would change my
  mind" condition names the observation that would flip this, but I have no
  way to observe it here.
- Whether real-world capture sessions produce the zero-byte case often enough
  to make the Q4 enhancement (R3) worth doing - I have no usage data and none
  is available in this repo.
