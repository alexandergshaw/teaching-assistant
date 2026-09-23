# A17: why a shipped, wired Regenerate reads as absent

Discovery pass, 2026-09-23, `loop-seat`. Write set: this file only.

**This is not a build document and must not be treated as one.** The owner
asked on 2026-09-20 for a regenerate feature on the announcement-from-
walkthrough tool. The feature exists, is wired end to end, and is labelled
"Regenerate". Section 1 proves that. The deliverable is sections 2 through 5:
what could make it read as absent, which explanation the code actually
supports, and what class of defect this is.

**Read it with A39 in hand.** A39 measured that the app already wins on six of
seven grading paths while feeling slower than a chat. A17 is the same gap
between what the code costs and what the user perceives, at a scale small
enough to have a definite answer. Section 5 is written for an A39 reader, not
only for someone working this panel.

## 0. The instrument limit, stated before any claim

**Nothing in this repo renders a component.** `vitest.config.ts` is
`environment: "node"` and collects only `src/**/*.test.ts`
(`docs/loop/this-repo.md` section 2); there is no jsdom, no testing-library, no
render call. This pass ran no browser and had no `.env`.

So every statement below about *what a screen shows* - position, visibility,
salience, how far you scroll - is a **READING CLAIM** derived from source, and
each one is labelled `[READING]`. A reading claim is not covered by any test
here and a green suite says nothing about it. Statements about *what the code
contains or does* are labelled `[MEASURED]` and name the command that produced
them.

This constraint bites harder on A17 than on any other row in the queue,
because A17's subject is literally what the screen looks like. Section 4
therefore ends in an owner check, and the check is specified precisely rather
than gestured at.

Every quantity below names its command. Every absence claim below was paired
with a canary grep on the same files with the same tool, and the canary output
is shown. No absence grep in this pass was piped through `head`.

---

## 1. The feature exists and is reachable - the whole path

`[MEASURED]` Traced 2026-09-23 with
`grep -rn "walkannounce\|WalkthroughAnnouncementPanel" src --include=*.ts --include=*.tsx | grep -v "\.test\."`
and `grep -rn "egenerate" <panel> <hook>`, then each file opened at the cited
line.

### 1.1 Mount: how an instructor reaches the panel at all

| Step | Evidence |
|---|---|
| Sub-tab strip, `role="tablist"` `aria-label="Recording tools"`, 12 entries as one inline literal | `src/app/components/RecordingTab.tsx:592` |
| The entry: `["walkannounce", "Announcement from a walkthrough"]`, the **8th** of the 12 | `src/app/components/RecordingTab.tsx:592` |
| The panel div, shown by `display: recView === "walkannounce" ? undefined : "none"` | `src/app/components/RecordingTab.tsx:887` |
| The panel itself, receiving `active` | `src/app/components/RecordingTab.tsx:888` |
| The component | `src/app/components/walkthrough-announcement/WalkthroughAnnouncementPanel.tsx:126` |

The selected sub-tab is persisted: `localStorage.getItem("ta-rec-view")` seeds
the state at `RecordingTab.tsx:66`, and `RecordingTab.tsx:82-83` writes it back
on every change. This matters in section 3.5.

### 1.2 The control, the handler, the action, and the return

| Layer | What it is | Citation |
|---|---|---|
| **Control** | `<ConfirmArmButtons armed={slot.regenerateArmed} idleLabel="Regenerate" confirmLabel="Confirm regenerate" tone="warning" idleVariant="outlined" />` | `AnnouncementDraftSlot.tsx:253-265` |
| **Accessible name** | idleAriaLabel is the template literal "Regenerate draft N"; confirmAriaLabel is "Confirm regenerating draft N", both interpolating the slot's `ordinal` | `AnnouncementDraftSlot.tsx:263-264` |
| **Click dispatch** | `onClick={armed ? onConfirm : onArm}` - one Button element, two handlers | `src/app/components/ui/ConfirmArmButtons.tsx:107` |
| **Props in** | `onRegenerateArm={armRegenerate}` / `onRegenerateConfirm={regenerate}` / `onRegenerateCancel={cancelRegenerate}` | `WalkthroughAnnouncementPanel.tsx:918-920` |
| **Hook bindings** | destructured from `useAnnouncementDraftSlots` at `:669` (`regenerate`), `:673` (`armRegenerate`), `:674` (`cancelRegenerate`) | `WalkthroughAnnouncementPanel.tsx:669,673-674` |
| **Hook: arm** | `const armRegenerate = useCallback((id) => dispatch({ type: "arm-regenerate", id }), [])` | `useAnnouncementDraftSlots.ts:320` |
| **Hook: cancel** | `const cancelRegenerate = useCallback((id) => dispatch({ type: "cancel-regenerate", id }), [])` | `useAnnouncementDraftSlots.ts:321` |
| **Hook: confirm** | `regenerate` dispatches `regenerate-started`, rebuilds the request context, resolves the research outcome, calls `runDraft` | `useAnnouncementDraftSlots.ts:298-318` |
| **Research reuse** | `resolveRegenerateResearchOutcome(ctx.researchOn, researchCacheRef.current, fingerprint)` - exact fingerprint match or falls back to `off`; regenerate never awaits a fresh research call | `useAnnouncementDraftSlots.ts:122`, called at `:313` |
| **Draft adapter** | `runDraft` calls `argsRef.current.draftOne(ctx, resolved.outline)` | `useAnnouncementDraftSlots.ts:225` |
| **Injected adapter** | `draftOne` in the panel, passed into the hook at `:676` | `WalkthroughAnnouncementPanel.tsx:615-642, 676` |
| **Server action call** | `await draftWalkthroughAnnouncementAction({ courseLabel, moduleLabel, materialsText, outline, coverageBlock, notes, provider, emojiPolicy, researchedResources, researchOutcome, timing })` | `WalkthroughAnnouncementPanel.tsx:625-637` |
| **The action** | `export async function draftWalkthroughAnnouncementAction(input): Promise<({title, message, researchNotice} \| {error}) & {diag}>` | `src/app/actions/walkthrough-announcement.ts:385-391` |
| **Result back into state** | `dispatch({ type: "result", id: slotId, result: {...} })` on success, and on rejection `"Could not reach the server - nothing was drafted."` | `useAnnouncementDraftSlots.ts:210-223` |

**Nothing in that chain is dead and nothing in it is a stub.** Both failure
shapes this repo has recorded - a library with no surface above it, and a
surface that calls nothing - are absent here: the control's `onConfirm` reaches
a real server action, and the action's result reaches the reducer that repaints
the slot.

### 1.3 The state that backs it

`[MEASURED]` `grep -n "regenerateArmed\|regenerate-started\|arm-regenerate\|cancel-regenerate" src/app/components/walkthrough-announcement/announcement-draft-slots.ts`

| Element | Line |
|---|---|
| `readonly regenerateArmed: boolean` on the slot | `announcement-draft-slots.ts:105` |
| Initialised `false` on a new slot | `:343` |
| Action union: `regenerate-started` / `arm-regenerate` / `cancel-regenerate` | `:367`, `:371`, `:372` |
| `case "regenerate-started"`: moves the draft to `{ phase: "drafting", restore: slot.draft.draft }` and clears `regenerateArmed` | `:436-439` |
| `case "arm-regenerate"`: no-op if already armed, else sets `true` | `:442-446` |
| `case "cancel-regenerate"`: no-op if not armed, else sets `false` | `:449-452` |
| Arming is cleared by changing the format choice | `:406` |
| Arming is cleared by changing the timing | `:409` |

**Behaviour coverage.** `grep -c "egenerate" src/app/components/walkthrough-announcement/announcement-draft-slots.test.ts` returns **37**. The reducer is genuinely exercised.

**Surface coverage is zero, and this is a finding.**
`grep -c "egenerate" src/app/components/walkthrough-announcement/walkthrough-announcement.structure.test.ts` returns **0**, and
`grep -c "ConfirmArmButtons\|Post to Canvas" <same file>` also returns **0**.
Canary on the same file with the same tool:
`grep -c "AnnouncementDraftSlot"` returns **25** and `grep -c "readFileSync"`
returns **28**, so the grep fires. The source-text structure test is the only
instrument in this repo that can assert anything about a rendered surface, and
it pins nothing about this control: not its label, not its presence, not where
it sits. A rename, a removal or a relocation of the Regenerate button would
leave every gate green.

---

## 2. The arm-then-confirm contract, exactly as implemented

### 2.1 Interaction count

`[MEASURED]` `AnnouncementDraftSlot.tsx:253-265` passes no `disabled` prop, and
`ConfirmArmButtons.tsx:65` defaults `disabled = false`. So the control is never
disabled, and a regeneration costs **exactly two clicks, unconditionally** -
arm, then confirm. There is no path that costs one.

### 2.2 The three states, as rendered

`[READING]` from `ConfirmArmButtons.tsx:86-116` and
`AnnouncementDraftSlot.tsx:253-274`.

| | Idle | Armed | In flight |
|---|---|---|---|
| Main button label | `Regenerate` (`:255`) | `Confirm regenerate` (`:256`) | n/a - the drafted block unmounts |
| Computed at | `label = armed ? (loading && loadingLabel ? loadingLabel : confirmLabel) : idleLabel`, `ConfirmArmButtons.tsx:87` | same | - |
| MUI `variant` | `outlined` (`idleVariant`, `:258`) | `contained` (`ConfirmArmButtons.tsx:101`) | - |
| MUI `color` | `warning` (`tone="warning"` -> `TONE_COLOR.warning = "warning"`, `ConfirmArmButtons.tsx:15-19`) | `warning` | - |
| `aria-label` | `Regenerate draft N` (`:263`) | `Confirm regenerating draft N` (`:264`) | - |
| `aria-describedby` | absent (`ConfirmArmButtons.tsx:105`) | `wta-regenerate-consequence-<slotId>` | - |
| Second button | none | `Cancel`, `variant="text"` (`ConfirmArmButtons.tsx:111-115`) | - |
| Consequence line | not rendered | `Regenerating replaces this draft's hand-edited text - anything typed above will be lost.` (`:270-274`) | - |
| Escape key | - | `Escape` cancels (`ConfirmArmButtons.tsx:92-94`) | - |
| The slot body | drafted block (`:162-282`) | drafted block | `Drafting...` only (`:284`) |

Focus survives arming by construction: the idle and armed states are the
**same Button element** with its label, variant and handler swapped in place,
not a remount (`ConfirmArmButtons.tsx:3-8` states this as the design, and
`:96-110` is one JSX element). Cancel moves focus back to the main button
before calling the prop (`ConfirmArmButtons.tsx:81-84`).

### 2.3 The sharp question: does the armed state look like it worked?

**No, this is not the explanation here, and I want to be explicit that I
looked for it and did not find it.** The first press changes five things at
once:

1. the label, `Regenerate` -> `Confirm regenerate`;
2. the variant, `outlined` -> `contained` (an unfilled button becomes a filled one);
3. a new `Cancel` button appears beside it;
4. a consequence paragraph appears below the button row;
5. the accessible name changes, and `aria-describedby` starts pointing at the consequence line.

`[READING]` A control that changes its own text, fills itself in, grows a
sibling and prints a sentence is not mistakable for a dead button. The generic
form of the hazard is real - this repo has already been bitten by it, and
`useAnnouncementDraftSlots.ts:188-193` records the instance in a comment: a
suppressing boolean once left a second Generate click doing nothing,
"indistinguishable from a broken button - the exact complaint this chunk opened
with". But the arm state here is the well-behaved version of the pattern.

**What is wrong with the contract is different and smaller: it charges two
clicks for a consequence that is often vacuous.**

`[MEASURED]` `grep -n "touched\|Touched\|dirty\|Dirty\|handEdited\|edited"` over
`announcement-draft-slots.ts` and `AnnouncementDraftSlot.tsx` returns exactly
one hit, and it is the consequence string itself
(`AnnouncementDraftSlot.tsx:272`). Canary on the same files: `grep -n '"edit"\|case "edit"'` returns `:365` and `:411`, so the edit action exists and the
grep fires. **There is no `touched` / `dirty` flag anywhere in the slot state.**
So the slot cannot distinguish a draft the instructor has hand-edited from one
that came back from the model thirty seconds ago and has not been typed in -
and it charges the confirm step, and shows a warning about losing typed text,
in both cases.

**The sibling panel in the same tab strip already solved this.**
`src/app/components/recording/TakeAnnouncementPanel.tsx:455-468`:

```
armed={fieldsTouched && regenArmed}
idleLabel="Regenerate announcement"
onArm={() => {
  if (fieldsTouched) setRegenArmed(true);
  else handleRegenerateConfirm();
}}
```

with the reason stated in its own comment at `:449-454`: "When fields are
untouched, arming performs the regeneration directly instead of showing a
confirm step (armed stays false) - a fresh, un-edited draft has nothing to
lose."

This is the repo's own precedent, in the same component library, for keeping
the confirm step exactly where it protects something and skipping it where it
protects nothing. It is **not** trading away a confirmation - the standing rule
that click cost never buys away a confirm step is intact, because the confirm
still fires whenever there is hand-edited text to lose.

---

## 3. Every way this control can be invisible, checked one at a time

Each candidate is stated, then ruled HOLDS / PARTLY HOLDS / DOES NOT HOLD with
the evidence that settled it.

### 3.1 It renders only in a state the owner may rarely reach - **HOLDS**

`[MEASURED]` The whole drafted block, including the button row, is inside
`{phase === "drafted" && slot.draft.phase === "drafted" && (...)}` at
`AnnouncementDraftSlot.tsx:162-282`. Before a draft exists the slot renders
only the two selects, the status hints and (conditionally) `Remove this slot`.

So: **no draft, no Regenerate control.** An instructor who opened the tool to
look for it, rather than while holding a draft, would find nothing. The row's
own note predicted this candidate and it is confirmed by the guard at `:162`.

### 3.2 It is below the fold - **HOLDS, and this is the strongest structural candidate**

`[READING]` Inside a drafted slot, the button row at `:236-269` is the
**last** interactive element, and everything between the top of the slot and
that row is content whose height is unbounded:

| Order | Element | Height |
|---|---|---|
| 1 | `<legend>Draft N</legend>` `:94` | fixed |
| 2 | `Format to match` select `:96-112` | fixed |
| 3 | `Timing` select `:114-127` | fixed |
| 4-6 | saved-formats status `:138`, unavailable-format hint `:153`, error alert `:157` | conditional |
| 7-8 | receipt line `:164`, timing line `:165` | fixed, always present |
| 9-11 | research notice `:171`, stale-format hint `:176-178`, stale-timing hint `:181-183` | conditional |
| 12 | `Subject` TextField `:186-192` | fixed |
| 13 | **`Message (Markdown)` TextField, `multiline`, `minRows={6}`, `fullWidth`** `:193-201` | **grows with the draft** |
| 14 | `Preview (how this renders on Canvas):` `:202` | fixed |
| 15 | **`<div className={controls.draftPreview} dangerouslySetInnerHTML>`** `:203` | **grows with the draft** |
| 16 | 3-line markdown explanation `:204-208` | fixed |
| 17-19 | copy error / copied / post-arm consequence / post error | conditional |
| **20** | **the button row: Post to Canvas, Regenerate, Copy** `:236-269` | - |

Two facts make this a real distance rather than a theoretical one:

- `[MEASURED]` `grep -n "maxRows" src/app/components/walkthrough-announcement/AnnouncementDraftSlot.tsx` returns nothing (exit 1). Canary: `grep -c "minRows"` on the same file returns **1**. With `minRows` and no `maxRows`, MUI's multiline TextField auto-grows to its content, so item 13's height is the whole announcement.
- `[MEASURED]` `.draftPreview` in `src/app/components/recording/RecordingControls.module.css:389-445` declares **no `max-height` and no vertical `overflow`**. The only `overflow` declarations in that block are `overflow-wrap: anywhere` on `a` (`:422`) and `overflow-x: auto` on `pre` (`:436`). Canary: `grep -c "max-height\|overflow"` over the whole file returns **3**, so the token is present in the file and the grep fires. So item 15's height is also the whole announcement.
- `[MEASURED]` `.adaptPanel` (`src/app/page.module.css:903-911`) sets no `max-height` and no `overflow`, so the panel does not scroll internally - the page does.

**The draft body is rendered twice at full height, one after the other, above
the Regenerate button.** How far down that pushes it scales with the length of
the announcement. `src/lib/walkthrough-announcement-bounds.ts:95-104` sizes the
model's output budget from the outline and its own worked estimate is
"12 * 8 * 20 = 1920 words"; `MIN_OUTPUT_TOKENS = 896` at `:92` is the floor.
`[READING]` a 400-1900-word announcement rendered twice is several screens.

### 3.3 It is inside a collapsed section - **DOES NOT HOLD**

`[MEASURED]`
`grep -rn "details\|summary\|Collapse\|Accordion" src/app/components/walkthrough-announcement/ --include=*.tsx | grep -v "\.test\."`
returns exactly one line, `WalkthroughAnnouncementPanel.tsx:216`, and it is a
code comment naming a memory file (`persisted-details-open-hydration.md`), not
markup. Canary: `grep -rnc "fieldset"` over the same three components returns
2 / 5 / 4, so the grep fires on these files.

Nothing in this tool collapses. The slot is a plain `<fieldset>` with a
`<legend>` (`AnnouncementDraftSlot.tsx:93-94`), always expanded.

### 3.4 Its label does not name the thing the owner would look for - **DOES NOT HOLD locally, but see 5.1**

`[MEASURED]` The visible label is the literal string `Regenerate`
(`AnnouncementDraftSlot.tsx:255`); the accessible name is `Regenerate draft N`
(`:263`); two body-copy lines point at it by name - `WalkthroughAnnouncementPanel.tsx:891` ("add another slot, or use Regenerate on one") and
`AnnouncementDraftSlot.tsx:177` ("Regenerate to apply your new choice"); and
`:153` says "choose another before regenerating".

If the owner said "regenerate", the word on the button is the word they said.
This candidate fails here. It does **not** fail repo-wide - section 5.1.

### 3.5 A persisted UI state hides it across reloads - **HOLDS, in the opposite direction from the usual shape**

`[MEASURED]` Two greps, both with canaries:

- The panel persists five things under `ta-rec-wta-*` keys - course, module, notes, emoji, resources (`WalkthroughAnnouncementPanel.tsx:97-102`, read back at `:170,183,196,227,229`). The sub-tab itself persists under `ta-rec-view` (`RecordingTab.tsx:66,83`).
- `grep -n "localStorage\|sessionStorage" src/app/components/walkthrough-announcement/useAnnouncementDraftSlots.ts src/app/components/walkthrough-announcement/announcement-draft-slots.ts` returns **nothing, exit 1**. Canary on the same two files with the same tool: `grep -c "useRef\|export"` returns **15** and **30**. So the grep fires and the absence is real.

**The drafts are not persisted.** State comes from
`useReducer(slotsReducer, FIRST_SLOT_ID, initialSlotsFromId)`
(`useAnnouncementDraftSlots.ts:166`) and nothing writes it anywhere.

The consequence is sharp: after any reload, the persisted sub-tab puts the
owner **back on this exact tool**, with every text field they filled in still
populated, and **no draft and therefore no Regenerate control**. The panel's
own hint at `:806-808` warns that a capture in progress does not survive a
reload; nothing warns that a finished draft does not either. `[READING]` A tool
that restores five of its inputs and silently discards its output is a tool
whose output looks like it should still be there.

### 3.6 It is disabled with no explanation - **DOES NOT HOLD for Regenerate; HOLDS for the button next to it**

`[MEASURED]` The Regenerate `ConfirmArmButtons` at `:253-265` passes no
`disabled` prop; the default is `false` (`ConfirmArmButtons.tsx:65`). It is
never disabled.

But the panel's **primary** button is. `WalkthroughAnnouncementPanel.tsx:860-862`:

```
disabled={
  capturing || extracting || !hasMaterial || anyDrafting || savedFormatsState === "loading" || readyToDraftCount === 0
}
```

Six disjuncts. Two have an adjacent explanation - `!hasMaterial` at `:888`,
`readyToDraftCount === 0` at `:889-892`. `savedFormatsState === "loading"` has
none in the panel. And the button is `variant={variantFor(!capturing && hasMaterial)}` (`:852`), which returns `"contained"` when true
(`src/app/components/ui/buttonVariant.ts:6`) - so after a capture it is a
filled primary button in the disabled state.

### 3.7 Something else on the panel looks more like the thing being sought - **HOLDS, and it is the hinge of section 4**

`[MEASURED]` `git show b3701cd -- src/app/components/walkthrough-announcement/WalkthroughAnnouncementPanel.tsx` (commit b3701cd, 2026-09-13, "multiple drafts from one walkthrough, and a rendered preview") contains exactly this pair of lines:

```
-          disabled={capturing || extracting || !hasMaterial || annGenerating}
+          disabled={capturing || extracting || !hasMaterial || anyDrafting || savedExemplarsLoading || readyToDraftCount === 0}
```

and, in the same diff, the addition of the hint
`Every draft slot already has a draft - add another slot, or use Regenerate on one.`

`[MEASURED]` Before that commit there was **no regenerate control of any kind**
in this tool:
`git show b3701cd^:src/app/components/walkthrough-announcement/WalkthroughAnnouncementPanel.tsx | grep -n "egenerate\|Redraft\|draftPreview"`
returns only four `minRows` hits and no regenerate/redraft/preview line.
Canary on the same blob: `grep -c "Button"` returns **27**.

**So the regenerate mechanism the owner had, before 2026-09-13, was clicking
`Generate announcement` a second time** - it stayed enabled once a draft
existed, because `readyToDraftCount === 0` was not yet in its disabled list.
b3701cd removed that, and put the replacement affordance at the bottom of a
newly long per-slot row underneath two full-height copies of the draft.

`[MEASURED]` What is still *enabled* on that screen once a draft exists:
`Add another draft slot` (`:928-935`, disabled only at
`MAX_ANNOUNCEMENT_BATCH_SIZE = 3`, `announcement-draft-slots.ts:24`),
`Generate video script` (`:867-877`), `Start capture` (`:811-813`),
`Run legibility probe` (`:814-816`). `[READING]` The nearest enabled control to
the greyed-out primary is `Add another draft slot`, which produces a *second*
draft rather than replacing the first - and at three slots it too goes
disabled, at which point the only way forward is the control at the bottom of
each slot.

---

## 4. The ranked answer

Ranked by likelihood times cheapness-to-confirm.

### Rank 1 - THE AFFORDANCE THE OWNER ALREADY KNEW WAS TAKEN AWAY AND NOT REPLACED IN PLACE (3.7 + 3.2)

This is the only candidate that explains the specific thing that happened -
that the person who *built* the tool asked for a feature that is on the screen.
Someone who has never used the tool cannot have this bug; someone who used it
before 2026-09-13 has it by construction.

The mechanism, in one sentence: **b3701cd made the control the owner regenerated
with (`Generate announcement`) permanently disabled the moment a draft exists,
and put the new control several screens lower, at the foot of a row that now
renders the draft body twice at full height.**

Every step is `[MEASURED]`: the disabled-list diff (3.7), the absence of any
regenerate before that commit (3.7), the unbounded `multiline` with no
`maxRows` (3.2), the `.draftPreview` block with no `max-height` (3.2).

What is `[READING]` is only the last inch - that the resulting distance is
enough to lose the button. A person who scrolls the whole slot will find it;
a person who looks at the action area they have always used, sees it greyed
out, and stops, will not.

The one mitigation in the tree: the hint at `:889-892` names Regenerate and
sits immediately below the disabled button. `[MEASURED]` it is a
`className={styles.fieldHint}` paragraph - `src/app/page.module.css:258-262`,
`font-size: var(--font-size-md)` in `var(--text-secondary)`, so normal-size
secondary text, not fine print - but it carries **no `role="status"` and no
`aria-live`** (compare `:883-887`, `:216-219`, `:276-280`, which do), so it is
not announced to a screen reader and does not draw a sighted user's eye the way
a status does.

**What would confirm it:** the owner check in 4.4.

**Smallest fix,** in increasing cost - the first alone may be sufficient:

- **(a)** Turn the hint at `WalkthroughAnnouncementPanel.tsx:889-892` from a passive paragraph into the control itself: when `readyToDraftCount === 0` and exactly one slot is drafted, render a `Regenerate` action in the primary button row instead of a sentence pointing downward. Cost is small; risk is duplicating a control, which section 4.3 addresses.
- **(b)** Cap the two unbounded renderings so the button row stays within a screen of the slot's top: `maxRows` on `AnnouncementDraftSlot.tsx:193-201` and a `max-height` plus `overflow-y: auto` on `.draftPreview`. Two-line CSS/prop change, no logic touched, and it fixes the problem for every future control added to that row.
- **(c)** Move the button row above the preview. Cheapest to describe, worst of the three: it puts a destructive-ish action above the thing it destroys, and it breaks the read-then-act order.

### Rank 2 - THE DRAFT DOES NOT SURVIVE A RELOAD, SO NEITHER DOES THE CONTROL (3.5)

`[MEASURED]` and independent of rank 1: `ta-rec-view` restores the sub-tab and
five `ta-rec-wta-*` keys restore the inputs, while the slots are pure
`useReducer` state that nothing persists. An owner returning to the tool after
a reload sees a fully-populated form and a slot with no draft - and the
Regenerate control is not merely hard to find, it does not exist in the DOM.

**Smallest fix:** persist the slots under a `ta-rec-wta-slots` key, seeded in a
mount effect rather than a `useState` initializer (the repo's recorded
hydration idiom). This is a real feature, not a one-liner; it belongs on the
backlog rather than in this row's fix. A cheaper honest alternative is to say
so on screen, next to the existing `:806-808` warning.

### Rank 3 - THE TWO-CLICK CONTRACT CHARGES A CONFIRM FOR A CONSEQUENCE THAT IS OFTEN VACUOUS (2.3)

`[MEASURED]` no `touched` flag exists; the sibling `TakeAnnouncementPanel.tsx:455-468` already implements the fix. This does not explain the feature reading
as *absent* - a button you cannot find is not a button you found and disliked -
but it is a real cost on the same control, it is cheap, and the precedent is
already written. **Smallest fix:** add a `touched` boolean to the slot, set by
`case "edit"` (`announcement-draft-slots.ts:411`), cleared by `case "result"`,
and mirror `TakeAnnouncementPanel`'s `onArm` branch.

### 4.4 What I could not determine, and the exact owner check that settles it

**I cannot tell from the code alone, and I am saying so rather than inferring
it.** Rank 1 and rank 2 predict the same complaint and are distinguished only
by what was on the owner's screen at the moment they asked. This checkout has
no `.env`, no live database, a blocked network under vitest, and renders no
component, so no instrument available to this pass can observe the rendered
panel. `docs/loop/this-repo.md` section 6 lists all four limits.

**The check, in a real browser, on the running app. Five steps, one answer.**

1. Open the app, go to the **Recording** tab, and select the sub-tab
   **"Announcement from a walkthrough"** (8th of 12 in the strip).
2. Capture a walkthrough and click **Generate announcement** so that Draft 1
   holds a real announcement. Do **not** reload after this point.
3. **Without scrolling**, answer: is the **Regenerate** button visible on
   screen? Yes / No.
4. Look at the **Generate announcement** button. Is it greyed out? Is the line
   directly beneath it - "Every draft slot already has a draft - add another
   slot, or use Regenerate on one." - visible, and did you read it?
5. Now reload the page. Answer: does Draft 1 still have its text, or is the
   slot empty?

**How to read the answers.**

- Step 3 "No" and step 4 "greyed out, did not read the line" -> **rank 1
  confirmed.** Apply fix (a) and (b).
- Step 3 "Yes" but the owner asked anyway, and step 5 shows the slot empty ->
  **rank 2 confirmed.** The owner was looking at a post-reload screen. Apply
  the rank-2 fix.
- Step 3 "Yes" and step 5 shows the draft preserved -> both ranks are wrong,
  and the honest next question is a different one: what did the owner expect
  Regenerate to *do* that it does not (regenerate with different notes? a
  different exemplar? the video script, which has no regenerate at all - see
  5.3).

**A second question worth asking in the same breath, and only one line:** when
the owner said "regenerate", were they looking at the announcement drafts, or
at the **video script**? Section 5.3 shows the script half genuinely has no
regenerate control, and that would make the row's premise partly right rather
than wrong.

---

## 5. The generalisation - the class, and where else it has instances

**The class: an affordance that was RELOCATED rather than ADDED, with the
user's prior path to it closed and no instrument able to notice.**

It has three parts, and all three are needed for the failure:

1. **A prior affordance is withdrawn** (a control goes permanently disabled, or a habit stops working) while the surface stays otherwise identical.
2. **The replacement is placed somewhere the eye does not already go** - below unbounded content, in a per-row action bar, behind a state the user is not in.
3. **No test in this repo can observe either fact**, because nothing renders, so the change ships with every gate green and the only detector is the user's confusion, arriving days later as a feature request.

This is the same shape A39 is looking at, one scale down. A39 measured that
the app wins six of seven grading paths on interaction count while feeling
slower. The reconciliation A39 needs is not "the count is wrong" - it is that
**interaction count measures a path the user has found**, and it says nothing
about the cost of not finding it, or of finding the closed door where the old
path used to be. In A17 that cost is total: the feature's effective
interaction count is infinity, and every instrument in the repo reports it as
two clicks. Any census that counts steps along a known path inherits this blind
spot, and A39's per-path step lists should say so explicitly.

### 5.1 Instance: one act, five names, no shared vocabulary

`[MEASURED]` `grep -rhn "idleLabel=" src/app --include=*.tsx | grep -v "\.test\."`
then filtered - 22 `idleLabel` sites total, of which the "make this again"
family is:

| Label | File:line |
|---|---|
| `Regenerate` | `src/app/components/walkthrough-announcement/AnnouncementDraftSlot.tsx:255` |
| `Regenerate announcement` | `src/app/components/recording/TakeAnnouncementPanel.tsx:457` |
| `Redraft` | `src/app/components/message-replies/MessageThreadRowActions.tsx:245` |
| `Redraft every reply` | `src/app/components/recording/DiscussionCaptureSettings.tsx:185` |
| `{redraftLabel}` (computed) | `src/app/components/recording/DiscussionReplyRow.tsx:689` |

Two of these - `Regenerate` and `Regenerate announcement` - are **in the same
12-entry sub-tab strip**, on the two tools that both produce a Canvas
announcement (`RecordingTab.tsx:592`, entries `announcement` and
`walkannounce`). A user who learns the word in one does not find it in the
other by searching for it. Section 3.4 said the label candidate fails *locally*;
this is where it does not fail.

### 5.2 Instance: the precondition for "action below unbounded content" is nearly universal here

`[MEASURED]`
`grep -rl "multiline" src/app/components --include=*.tsx | grep -v "\.test\." | wc -l` = **82**;
`grep -rl "maxRows" src/app/components --include=*.tsx | grep -v "\.test\." | wc -l` = **3**, and the three are
`AiChatWindow.tsx`, `CopilotChatPanel.tsx`, `ModuleDeckSettings.tsx`.

So **79 of 82** component files with a multiline TextField let it auto-grow to
its content. That is the *precondition*, not the defect - whether an action
control sits beneath it is per-file and I did not audit all 79. But it means
the layout hazard in 3.2 is the house default rather than a one-off, and any
panel that renders a long generated body above its action row has it.

`[MEASURED]` The `.draftPreview` class - the second full-height rendering - has
two consumers: `AnnouncementDraftSlot.tsx:203` and
`src/app/components/drafted-grades/ClassTrendsDraftPanel.tsx:98`
(`grep -rn "draftPreview" src/app --include=*.tsx | grep -v "\.test\."`).
**`ClassTrendsDraftPanel.tsx` is a named candidate for the same layout audit**
and I did not open its action row this pass - recorded as a residual, not as a
finding.

### 5.3 Instance: the same tool's other output half has no regenerate at all

`[MEASURED]` The video-script half of this panel - `Generate video script`
(`WalkthroughAnnouncementPanel.tsx:867-877`) and the `Video script draft`
fieldset (`:941-980`) - offers `Copy` and `Download .txt` (`:961-975`) and
nothing else. Its Generate button's disabled list is
`capturing || extracting || !hasMaterial || scriptGenerating` (`:873`) - the
*pre-b3701cd* shape, with no "already produced" disjunct - so clicking it again
does regenerate, silently and with no confirm, overwriting `scriptText`
including any edits the instructor typed into the `Script` field at `:951-959`.

So within one panel there are two generated outputs with **opposite**
contracts: the announcement charges two clicks and warns about losing edits;
the script charges one click and loses them without a word. Neither is
discoverable from the other.

### 5.4 Instance: the instrument gap is structural, not local to A17

`[MEASURED]` Section 1.3 showed `walkthrough-announcement.structure.test.ts`
pins nothing about either arm-then-confirm control (0 hits for `egenerate`,
0 for `ConfirmArmButtons|Post to Canvas`, canaries 25 and 28). `[MEASURED]`
`ConfirmArmButtons` has **18** non-test consumer files
(`grep -rln "ConfirmArmButtons" src/app --include=*.tsx | grep -v "\.test\." | wc -l`),
one of which is the component itself, so **17 calling surfaces**.

I did not check the other 16 surfaces' structure tests this pass. The
generalisable point does not need that count: this repo's *only* mechanism for
asserting anything about a rendered surface is a source-text test, those tests
are written per feature by hand, and nothing requires one to cover a control's
label or placement. A control can be renamed, relocated below the fold, or
removed from a row entirely, and the full gate set - tsc, lint, 20,200 tests,
the build's compile line - stays green. That is the enabling condition for the
whole class, and it is the thing an A39 reader should take away: **a green
suite in this repo is evidence about logic and silence about findability.**

---

## 6. Residual register

Each entry names an owner, an instrument, and the step that will measure it.
An entry missing any of the three would be a deletion and is not listed here.

| Id | Residual | Owner | Instrument | Step that measures it |
|---|---|---|---|---|
| R1 | Which of rank 1 / rank 2 / neither is the true cause | Repo owner | A real browser running the app | The five-step check in 4.4, answered in one message |
| R2 | Whether the owner meant the announcement drafts or the video script | Repo owner | The owner's own recollection | The one-line question at the end of 4.4 |
| R3 | Whether `ClassTrendsDraftPanel.tsx` (the other `.draftPreview` consumer, `:98`) puts an action control below its unbounded preview | A later `loop-seat` layout pass | Source reading of that file's JSX order plus its CSS | Open `ClassTrendsDraftPanel.tsx` and list its element order the way 3.2 does for the slot |
| R4 | Whether the other 16 `ConfirmArmButtons` surfaces have any structure-test coverage of their labels or placement | A later `loop-seat` or `loop-test-author` pass | `grep -c` per surface against its sibling `*.structure.test.ts`, each with a canary | Enumerate the 17 calling files, grep each one's structure test for the label literal |
| R5 | Whether any of the 79 auto-growing multiline fields (5.2) actually has an action row beneath it | A later pass, only if R3 confirms the shape recurs | Source reading per file | Deferred by design - 79 files is not worth auditing until the shape is confirmed twice |
| R6 | Whether fix (a) in 4.1 would duplicate a control in a way that violates the repo's "do not build a second regenerate" ruling | `loop-architect`, if A17 proceeds to a build | Design reading against the A17 row's own note | An architect pass on the chosen fix, before any implementer brief |

**Explicitly NOT residuals - things this pass settled:** the feature exists and
is wired (section 1); the armed state is not mistakable for a dead button
(2.3); nothing in the tool is collapsed (3.3); the button label is the word the
owner used (3.4); the Regenerate control is never disabled (3.6).

## 7. What this document deliberately does not contain

No acceptance criteria, no wave plan, no file list, no implementer brief. A17
is a discovery row and its next step is an owner answer, not code. Building a
second regenerate control before 4.4 is answered would be the exact failure the
row's own note names.
