# A17 acceptance criteria

- Item: A17, area `walkthrough-announcement-surface`, kind chore, state unscoped
  (`docs/backlog.yml:439-450`).
- Source: owner request 2026-09-20, mid-turn - a "regenerate" control on the
  announcement-from-walkthrough tool - MEASURED the same turn to already exist,
  fully wired, labelled "Regenerate", with an aria-label and an arm-then-confirm
  contract (`docs/backlog.yml:443,447,449`).
- Seat: `loop-ac` (Opus). A fresh `loop-checker` gates this document before any
  later consumer acts on it.
- This is the AC round only. No mechanism, no wave plan, no oracle, no code.
- THIS IS A DISCOVERABILITY / LABELLING ROW, NOT A FEATURE ROW. The control is
  on the screen. The work is finding out WHY it read as absent to the person who
  built the tool, then either confirming it was a momentary miss (close, no code)
  or naming one specific small relabel / reposition / emphasis fix. DO NOT
  re-build the control. DO NOT build a second Regenerate.

## The owner's words (quoted, from `docs/backlog.yml:443` and the note `:449`)

The row title records the ask and its same-turn reframe:

> "Owner asked 2026-09-20 for a regenerate feature on the
> announcement-from-walkthrough tool. MEASURED THE SAME DAY: IT ALREADY EXISTS,
> FULLY WIRED, WITH AN ARM-THEN-CONFIRM CONTRACT. So the real work is finding out
> why it reads as absent to the person who built the tool, not building it. Treat
> this as a discoverability and labelling row, not a feature row."

And the note's founding judgement (`docs/backlog.yml:449`):

> "The owner uses this tool and asked for a control that is already on the
> screen, already labelled Regenerate, and already has an aria-label. That is a
> finding about the surface, not about the owner. Something is hiding it".

Where any criterion below and these sentences diverge, the sentences win.

## Environment ceilings that bind every criterion

Measured facts, not assumptions (`docs/loop/this-repo.md`; `AGENTS.md` memory
`ac-sonnet-opus-loop.md`):

- NO component is rendered by any test here (vitest is node-env,
  `include: ["src/**/*.test.ts"]`). Every gate is GREEN today with the control
  live, so a green suite proves nothing about whether the control is FINDABLE on
  the rendered page. This is the crux of the row: the only instrument that can
  observe discoverability is a human (or a browser check) looking at the rendered
  page. Every criterion below states this per instrument, so that no one writes a
  green source-text test that "proves" a discoverability fix it structurally
  cannot observe (the invisible-enforcer failure this seat has paid for,
  `.claude/agents/loop-ac.md:27-28`).
- No API key, network blocked. Irrelevant to this row - nothing here calls the
  model; the question is purely about the rendered surface.
- The capability's EXISTENCE is already reading-verified below (re-measured at
  HEAD). What is NOT verifiable in this checkout is whether it is SEEN.

## Leverage claim - FIRED AND DECLINED (no claim)

Trigger fired: this is a chore / discoverability row, not a feature that builds
or changes a capability a user reaches (`docs/loop/seats.md:74-75`,
`DEV_LOOP.md` "The loop / Criteria"). There is no leverage class to claim,
because nothing new is being built - the capability already ships. What closing
this row EARNS is narrower and worth stating plainly: the owner (and every
instructor) actually USING an arm-then-confirm regenerate capability they
already have and could not find. That is a reachability gain on an existing
mechanism, not a categorical advantage over a chat, and forcing it into a
`docs/loop/leverage.md` class would be exactly the invented-claim failure that
card warns against (`docs/loop/leverage.md:85-98`). Recorded as declined, per
`docs/loop/seats.md:74-75`.

## The capability-exists finding (RE-MEASURED at HEAD, 2026-09-29)

Re-measured from the repo root by `grep -rn` over
`src/app/components/walkthrough-announcement/`. THE 2026-09-22 CITES IN THE ROW
HAVE DRIFTED - the A24-A32 timing waves (`3d2f07f` / `26bf0d0` / `33f7557` and
the A24 timing structure work) moved every line - so the numbers below supersede
the row's `instrument` field. THE CAPABILITY ITSELF IS UNCHANGED AND FULLY
PRESENT. None of it is gone or broken, so the row stays a DISCOVERABILITY row and
does NOT flip to repair.

- THE STATE MACHINE (`announcement-draft-slots.ts`):
  - `regenerateArmed` slot field declared at `:117` (was `:105`); initialised
    `false` at `:366`.
  - `SlotsAction` union members: `regenerate-started` `:392` (was `:367`),
    `arm-regenerate` `:396` (was `:371`), `cancel-regenerate` `:397` (was `:372`).
  - Reducer cases: `regenerate-started` `:468` (was `:436`), `arm-regenerate`
    `:474` (was `:442`), `cancel-regenerate` `:481` (was `:449`).
  - `regenerateArmed` is CLEARED on choose-choice `:435`, choose-timing `:438`,
    the drafted/post result path `:451`, and regenerate-started `:471`.
- THE HOOK (`useAnnouncementDraftSlots.ts`):
  - `regenerate` at `:391` (was `:298`), `armRegenerate` at `:413` (was `:320`),
    `cancelRegenerate` at `:414` (was `:321`); all three returned at
    `:514,:518,:519` (was `:404-409`); `resolveRegenerateResearchOutcome` at
    `:123` (was `:122`).
- THE UI - PANEL (`WalkthroughAnnouncementPanel.tsx`):
  - destructures the three at `:674,:678,:679` (was `:669-674`) and passes them
    to the slot as `onRegenerateArm` / `onRegenerateConfirm` / `onRegenerateCancel`
    at `:924-926` (was `:918-920`).
- THE UI - SLOT (`AnnouncementDraftSlot.tsx`):
  - the control is a `ConfirmArmButtons` at `:319-331` with `idleLabel="Regenerate"`
    (`:321`), `confirmLabel="Confirm regenerate"` (`:322`),
    `idleAriaLabel={`Regenerate draft ${ordinal}`}` (`:329`) and
    `confirmAriaLabel={`Confirm regenerating draft ${ordinal}`}` (`:330`); armed
    off `slot.regenerateArmed` at `:320`. (Was `:254-263`.)
  - the arm consequence line ("Regenerating replaces this draft's hand-edited
    text - anything typed above will be lost.") at `:336-340` (was `:270-271`).
- TWO user-facing strings still point at it: panel `:896` ("Every draft slot
  already has a draft - add another slot, or use Regenerate on one.", was `:891`,
  and itself gated on `readyToDraftCount === 0`), and slot `:226` ("This draft
  was made from a different format - Regenerate to apply your new choice.", was
  `:177`). A THIRD such string was added by the timing feature: slot `:231`
  ("This draft was made with a different timing - Regenerate to apply your new
  choice.").
- Behaviour is covered by committed tests: `announcement-draft-slots.test.ts`
  has a `"regenerate-started"` describe at `:456` (was `:418`), an
  `"arm-regenerate" / "cancel-regenerate"` describe at `:477`, and the action
  union exhaustiveness map lists all three at `:786-791`.

THE TWO RENDER FACTS THAT DRIVE THE CANDIDATE CAUSES, both read directly:

- THE CONTROL IS GATED ON A DRAFTED SLOT. It renders only inside
  `phase === "drafted" && slot.draft.phase === "drafted"` (`AnnouncementDraftSlot.tsx:211`).
  Before a slot has a completed draft, there is no Regenerate control to see.
- THE CONTROL IS THE MIDDLE OF THREE IN ONE ROW. The `.ghActions .runRow` at
  `AnnouncementDraftSlot.tsx:295` holds, in DOM order: [Post to Canvas / Schedule
  post] (primary, `idleVariant="contained"`, `tone="primary"`, `:296-318`),
  [Regenerate] (`idleVariant="outlined"`, `tone="warning"`, `:319-331`), then
  [Copy] (`variant="outlined"`, `:332-334`). Regenerate is visually SECONDARY to
  the contained Post button beside it, and this whole row sits low in a long
  panel, below the capture controls, the video-script section, and the drafted
  message editor.

## Numbered acceptance criteria

Each criterion names object / instrument / direction of failure, and its class:
[READING] verified by reading source only; [OWNER] verified only by the owner (or
a browser check) against the RENDERED page. There is NO [MACHINE] discoverability
criterion, by construction - see the environment ceiling.

### AC-1 - The Regenerate capability EXISTS and is fully wired at HEAD (anti-repair guard) [READING]
- Owner's words: "IT ALREADY EXISTS, FULLY WIRED, WITH AN ARM-THEN-CONFIRM
  CONTRACT" (`docs/backlog.yml:443`).
- Object: the state machine (`regenerateArmed` field + `regenerate-started` /
  `arm-regenerate` / `cancel-regenerate` actions and their reducer cases), the
  hook (`regenerate` / `armRegenerate` / `cancelRegenerate`), and the rendered
  control (a `ConfirmArmButtons` with idleLabel "Regenerate", an arm consequence
  line, and an aria-label "Regenerate draft N"), all present and wired end to end.
- Instrument: [READING] the re-measured citations above, plus the committed
  behavioural coverage in `announcement-draft-slots.test.ts` (`:456`, `:477`,
  `:786-791`). This criterion is satisfied by READING, not by a new test - the
  wiring is already covered.
- Direction of failure: FAILS if a `grep -rn` over
  `src/app/components/walkthrough-announcement/` shows ANY of the arm / confirm /
  cancel actions, the hook exports, or the rendered `ConfirmArmButtons` with
  idleLabel "Regenerate" is ABSENT at the time this row is worked. If it fails,
  the row is no longer a discoverability row - it has become a REPAIR row, and
  that reclassification must be recorded before anything else. (Confirmed present
  as of 2026-09-29; this guard exists so a future worker re-checks rather than
  inherits the finding.)

### AC-2 - The candidate causes are checked AGAINST THE RENDERED PAGE, in order, and the matching one is recorded [OWNER]
- Owner's words / row: "the candidates are cheap to check but MUST be checked
  against the RENDERED page rather than the source, because NO COMPONENT IS
  RENDERED BY ANY TEST HERE and every gate is green today" (`docs/backlog.yml:449`).
- Object: the ordered observation checklist in the next section (OBS-1..OBS-4),
  run by the owner (or a browser check) against the deployed tool, producing a
  recorded answer to "which observation matches what you see".
- Instrument: [OWNER] owner-verification against the RENDERED page (or an
  equivalent real-browser check). EXPLICITLY NOT a vitest test: nothing renders
  under vitest here, so no source-text assertion can observe whether the control
  is findable. A green suite must never be read as discharging this criterion.
- Direction of failure: FAILS if this row is closed WITHOUT any record of the
  owner (or a browser) having looked at the rendered control and reported which
  observation matched - i.e. closed on reading or on a green gate alone. Closing
  it on an invisible enforcer is the exact failure this seat has paid for
  (`.claude/agents/loop-ac.md:27-28`).

### AC-3 - DONE is one of exactly two outcomes, and no code change precedes the rendered-page check [OWNER]
- Owner's words / framing: the row is a discoverability row; "the fix is
  disclosure and placement, never removing the confirm" (`docs/backlog.yml:449`).
- Object: the terminal state of A17, which is EXACTLY ONE of:
  - (a) MOMENTARY MISS - the owner, looking now, finds and can use the control.
    No code change. The row closes; record that it was a discoverability miss and
    what surfaced it (e.g. OBS-1: the owner looked before a draft existed).
  - (b) NAMED SMALL FIX - the rendered-page check identifies ONE specific, small
    relabel / reposition / emphasis / disclosure change (from OBS-1..OBS-4),
    scoped as its own follow-up row with an owner, an instrument and a step. The
    fix does NOT remove the arm-then-confirm step (a confirm step this repo does
    not trade away for fewer clicks, `docs/backlog.yml:449`; `AGENTS.md` memory
    `minimize-clicks.md`), and does NOT build a second Regenerate control (the
    shipped-twice class, `docs/backlog.yml:449`; `AGENTS.md` memory
    `verify-reachability-not-just-correctness.md`).
- Instrument: [OWNER] the checklist result from AC-2 selects (a) or (b). If (b),
  the named fix is a NEW scoped row; this document does not author it.
- Direction of failure: FAILS if the row ships a code change (relabel /
  reposition / emphasis) that the rendered-page check did NOT justify - i.e. a
  fix pre-committed on a guessed cause. FAILS if the row is left open with neither
  (a) nor (b) recorded. FAILS if any proposed fix removes the confirm step or adds
  a second Regenerate control.

## The owner-observation checklist (OBS-1..OBS-4), in the order worth testing

Each item is ONE observation the owner (or a browser check) makes against the
rendered tool, plus what each outcome implies for the fix. Refined from the
row's three candidates (`docs/backlog.yml:449`) using the two render facts read
above. Ordered cheapest-and-most-likely first. Run them until one matches; record
which.

- OBS-1 - IS THERE A DRAFTED SLOT ON SCREEN RIGHT NOW? The Regenerate control
  renders ONLY inside a slot whose draft phase is "drafted"
  (`AnnouncementDraftSlot.tsx:211`). Before any draft exists - or while a slot is
  still empty, drafting, or errored - there is no Regenerate control to see.
  - Observe: capture and stop a walkthrough, generate a draft, and confirm a slot
    now shows a drafted message editor.
  - If NO drafted slot was present when the owner looked -> MOMENTARY MISS
    (AC-3(a)); the control was correctly absent because its precondition was
    unmet. Possible tiny follow-up: a hint that Regenerate appears once a draft
    exists. Not a bug in the control.
  - If a drafted slot IS present but no Regenerate is visible -> go to OBS-2.

- OBS-2 - WHEN A DRAFT IS ON SCREEN, DO YOU SEE THREE BUTTONS IN THE ACTION ROW?
  The action row (`AnnouncementDraftSlot.tsx:295`) shows, left to right, [Post to
  Canvas] (filled/contained), [Regenerate] (outlined, warning tone), [Copy]
  (outlined). Regenerate is the MIDDLE, visually secondary button.
  - Observe: with a draft on screen, look at the row of buttons under the message
    editor.
  - If Regenerate is present but read as part of a cluster / secondary to the
    filled Post button -> VISUALLY DE-EMPHASISED (OBS-3 refines this). 
  - If the row is BELOW where the owner looked (they read the top of the panel -
    capture, video script, message editor - and stopped) -> BELOW-THE-FOLD /
    PLACEMENT. Implication for AC-3(b): a small reposition or a reference to
    Regenerate nearer the message editor, without removing it from the action row.
  - If all three buttons are visible and read clearly -> likely MOMENTARY MISS
    (AC-3(a)).

- OBS-3 - DOES "REGENERATE" READ AS THE PRIMARY WAY TO REDO A DRAFT, OR AS A
  MINOR/AMBIGUOUS CONTROL? It is `idleVariant="outlined"`, `tone="warning"`
  (`:323-324`), beside a contained primary Post button - deliberately secondary.
  Its label is the single word "Regenerate".
  - Observe: does the label and its emphasis communicate "redo this draft with my
    new choice", or does it read as a destructive/secondary action the owner
    skipped past?
  - If the label or emphasis is the problem -> RELABEL / EMPHASIS. Implication for
    AC-3(b): a clearer label or slightly stronger emphasis, still NOT a second
    control and still arm-then-confirm.

- OBS-4 - ON FIRST CLICK, DOES THE CONTROL APPEAR TO DO NOTHING? The shape is
  arm-then-confirm: the first click ARMS (revealing the consequence line at
  `:336-340` and swapping to a "Confirm regenerate" button), the second click
  regenerates. A control that "does nothing" on first click is indistinguishable
  from a broken one.
  - Observe: click Regenerate once. Does a consequence line appear and the button
    change to "Confirm regenerate"? Is that transition noticeable?
  - If the arm step went unnoticed / read as broken -> DISCLOSURE OF THE ARM STEP.
    Implication for AC-3(b): make the arm transition more legible (the confirm
    step STAYS - the row forbids removing it, `docs/backlog.yml:449`).
  - If the owner never reached a first click because they never found the button
    -> the cause is upstream (OBS-1/2/3), not this one.

## Open questions for the owner (shaped so every answer terminates the row)

- Q1 (THE terminating question). When you open the announcement-from-walkthrough
  tool now, generate a draft, and look at the action row under the drafted
  message: DO YOU SEE the "Regenerate" button (middle of Post / Regenerate /
  Copy)?
  - If YES and you can use it -> this was a momentary miss; A17 CLOSES with no
    code change (AC-3(a)). Please say briefly what threw you (e.g. you looked
    before drafting - OBS-1 - or it read as secondary next to Post - OBS-3), so
    the record names the miss.
  - If NO, or it is there but you would not have found/trusted it -> tell us WHICH
    of OBS-1..OBS-4 matches what you see. That answer NAMES the one small fix
    (AC-3(b)), which we scope as its own follow-up row and build; A17 CLOSES as a
    discoverability finding either way.

  Both answers end the activity. Nothing here waits on a third round.

## Residual register

Each residual carries owner, instrument, and the step that will measure it. A
residual missing any of the three is a deletion (`iteration-caps.md:36-37`).
These must be filed as rows in `docs/BACKLOG.md` by the orchestrator (this seat
does not write the backlog under concurrency); until then they exist only here,
which `iteration-caps.md` counts as not yet real.

| id | Residual | Owner | Instrument | Step |
|---|---|---|---|---|
| R-1 | Which candidate cause (OBS-1..OBS-4) actually matches - cannot be observed in this checkout (nothing renders under vitest; network blocked; no `.env`). This is the whole row. | Owner | Owner-verification (or a real-browser check) against the rendered tool per AC-2 | Owner runs Q1 / the OBS checklist against the deployed feature |
| R-2 | If the answer is AC-3(b), the specific relabel / reposition / emphasis / disclosure fix, scoped as its own follow-up (must not remove the confirm step, must not add a second Regenerate). | Owner to approve scope; then a later authoring + build wave | The named OBS outcome becomes a new scoped row with its own AC | After Q1 is answered (b) |
| R-3 | Re-confirm AC-1 (capability still wired) at the moment the row is next worked, in case a later wave removed it and flipped the row to repair. | Whoever next works A17 | `grep -rn` over `src/app/components/walkthrough-announcement/` for the arm/confirm/cancel actions, hook exports, and the "Regenerate" `ConfirmArmButtons` | At the start of the next A17 work |

## Disposition table

Not applicable: this is the first AC version for A17; no prior criteria were
restructured, so there is nothing to map to kept / handed-over / withdrawn.

## Out of scope for this document (routed)

- Any code change (relabel, reposition, emphasis, disclosure) - not authored here;
  it is gated behind the owner's Q1 answer and, if warranted, its own scoped row.
- Building or re-wiring the Regenerate control - it exists and is not to be
  rebuilt (`docs/backlog.yml:449`).
- Removing or altering the arm-then-confirm contract - forbidden by the row and
  by `AGENTS.md` memory `minimize-clicks.md`.
- Mechanism, wave ordering, oracle construction - not applicable; there is no
  build to design until the owner's answer selects AC-3(b).
