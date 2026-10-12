# A17 - Regenerate discoverability pass (UX seat, read-only)

- Item: A17, announcement-from-walkthrough tool. Row is a DISCOVERABILITY row,
  not a feature row (`docs/BACKLOG.md:35-37`; AC at
  `docs/a17-acceptance-criteria.md`).
- Seat: UX discoverability pass (`loop-seat`, Sonnet). A fresh `loop-checker`
  reads this before any build wave consumes it.
- Scope: inspect and propose only. No production code was edited. No behavior
  changes. The arm-then-confirm contract is not touched by anything below.
- Instruments: every `file:line` below was produced by the Grep tool
  (ripgrep) and then opened with the Read tool at the cited range, against the
  tree at `main` on 2026-10-11. Line numbers in
  `docs/a17-acceptance-criteria.md` ("re-measured 2026-09-29") are STALE again
  (for example it puts the control at `AnnouncementDraftSlot.tsx:319-331`; it is
  at `:294-306` now). Use the numbers here, and re-grep before a build wave.
- Nothing in this environment renders a component (vitest is node-env, collects
  `src/**/*.test.ts` only - `docs/loop/this-repo.md`). Every statement about
  what the user SEES is a READING claim from JSX and CSS, not an observation.

## 1. The capability exists and is fully wired (re-confirmed in the tree)

| Layer | Evidence (Grep + Read) |
|---|---|
| Slot flag | `announcement-draft-slots.ts:126` `readonly regenerateArmed: boolean;` initialised `false` at `:380` |
| Action union | `announcement-draft-slots.ts:414` `regenerate-started`, `:418` `arm-regenerate`, `:419` `cancel-regenerate` |
| Reducer | `:492-497` regenerate-started (only from `drafted`, moves to `drafting` with `restore`), `:498-504` arm-regenerate (only from `drafted`), `:505-510` cancel-regenerate; armed is cleared by choose-choice `:458`, choose-timing `:461`, regenerate-started `:495` |
| Hook | `useAnnouncementDraftSlots.ts:404-424` `regenerate`, `:426` `armRegenerate`, `:427` `cancelRegenerate`, returned at `:532` (regenerate) and `:536-537` (arm/cancel); `resolveRegenerateResearchOutcome` defined at `:124` |
| Panel wiring | destructured `WalkthroughAnnouncementPanel.tsx:469,473,474`; passed as `onRegenerateArm/Confirm/Cancel` at `:741-743` |
| Rendered control | `AnnouncementDraftSlot.tsx:294-306` (a `ConfirmArmButtons`) |

Command for the table: Grep `regenerateArmed|arm-regenerate|cancel-regenerate|
regenerate-started|armRegenerate|cancelRegenerate|resolveRegenerateResearchOutcome`
over `src/app/components/walkthrough-announcement` excluding `*.test.ts`.
Nothing is missing, so the row stays a discoverability row (AC-1's
anti-repair guard holds).

## 2. Trace: what the user actually sees today

### 2a. Gating - the control exists only on a drafted slot

The whole action row is inside
`{phase === "drafted" && slot.draft.phase === "drafted" && ( ... )}`
(`AnnouncementDraftSlot.tsx:200`). In the other phases the slot shows only:
- empty: the two pickers "Format to match" (`:136`) and "Written for" (`:154`)
  and, if more than one slot, "Remove this slot" (`:391`);
- drafting: the same plus the text "Drafting..." (`:387`; the source uses a
  Unicode ellipsis character).
No Regenerate button is rendered before the first draft completes, and none is
rendered while a regenerate is in flight (the reducer moves the slot to
`drafting`, `announcement-draft-slots.ts:495`).

### 2b. Position - middle of three, in a row below the editor

Inside the drafted block, top to bottom (all in `AnnouncementDraftSlot.tsx`):
1. receipt line, timing line, research notice (`:202-212`);
2. conditional stale-draft hints, which are the ONLY in-slot prose that names
   the control (`:213-222`, quoted below);
3. "Subject" field (`:224-230`);
4. "Message (Markdown)" editor beside a "Preview" pane (`:231-245`), then a
   four-line Markdown hint (`:246-250`);
5. copy/post error and "Copied." status lines (`:252-267`);
6. THE ACTION ROW, `className={`${styles.ghActions} ${controls.runRow}`}`
   (`:269`; `.runRow` is a top border plus padding, `RecordingControls.module.css:69-72`),
   holding in DOM order:
   - Post button: `idleLabel` "Post to Canvas" or "Schedule post" (`:272`),
     `idleVariant="contained"`, `tone="primary"` (`:274-275`) - the only filled
     button in the row;
   - Regenerate (`:294-306`): `idleLabel="Regenerate"` (`:296`),
     `confirmLabel="Confirm regenerate"` (`:297`), `tone="warning"` (`:298`),
     `idleVariant="outlined"` (`:299`), `idleAriaLabel={`Regenerate draft ${ordinal}`}`
     (`:304`), `confirmAriaLabel={`Confirm regenerating draft ${ordinal}`}` (`:305`);
   - "Copy" outlined button (`:307-309`);
   - a "Visible to students (optional)" datetime field plus a two-sentence hint
     (`:310-334`).
So the row is Post (filled) / Regenerate (outlined, amber text) / Copy
(outlined) / date field. This is below the editor and preview, i.e. low in a
long card. The panel itself is long (setup fieldset, capture status, drafts,
script, dock) - `WalkthroughAnnouncementPanel.tsx:574-846`.

### 2c. The arm-then-confirm flow, step by step

`ConfirmArmButtons.tsx` is one MUI `Button` whose label, variant, colour and
handler change in place (`:86-110`); Escape cancels (`:92-94`).
1. Idle: outlined warning-tone button, text "Regenerate"; aria-label
   "Regenerate draft N".
2. First click calls `onArm` -> `arm-regenerate` -> `slot.regenerateArmed = true`
   (`announcement-draft-slots.ts:498-504`). Visible changes: (a) the same button
   turns `contained` (filled amber) and its text becomes "Confirm regenerate"
   (`ConfirmArmButtons.tsx:87,101`); (b) a text button "Cancel" appears beside it
   (`:111-115`); (c) one sentence appears BELOW the whole row:
   "Regenerating replaces this draft's hand-edited text - anything typed above
   will be lost." (`AnnouncementDraftSlot.tsx:355-358`), rendered as a plain
   `styles.fieldHint` paragraph (small, `--text-secondary`,
   `page.module.css:258-262`).
3. Second click on "Confirm regenerate" calls `regenerate` ->
   `regenerate-started` (slot goes to `drafting`, text "Drafting...") and runs the
   draft again (`useAnnouncementDraftSlots.ts:404-424`).
4. Cancel / Escape / changing "Format to match" / changing "Written for" disarm
   (`announcement-draft-slots.ts:458,461,505-510`).
Note the asymmetry with Post: Post's armed consequence is a bordered
`controls.notice controls.noticeWarning` card (`AnnouncementDraftSlot.tsx:336-353`)
while Regenerate's is a bare grey line (`:355-359`). The Post consequence
renders first, directly under the row; if only Regenerate is armed, its
one-line hint is the only thing that appears.

### 2d. Every user-visible string that names the control (quoted)

| String | Where | When shown |
|---|---|---|
| "Regenerate" / "Confirm regenerate" / "Cancel" | `AnnouncementDraftSlot.tsx:296,297`; `ConfirmArmButtons.tsx:113` | drafted slot only |
| "Regenerating replaces this draft's hand-edited text - anything typed above will be lost." | `AnnouncementDraftSlot.tsx:357` | armed only |
| "This draft was made from a different format - Regenerate to apply your new choice." | `:215` | drafted, and the Format picker no longer matches the draft |
| "This draft was made with a different timing - Regenerate to apply your new choice." | `:220` | drafted, and the Written-for picker no longer matches |
| "This draft is already on Canvas. Edit the subject or message, or Regenerate, to post it again." | `:381` | after a successful post (`slot.postLocked`) |
| "This format is no longer available - choose another before regenerating." | `:191` | selected format was deleted |
| "Every draft slot already has a draft - add another slot, or use Regenerate on one." | `WalkthroughAnnouncementPanel.tsx:713` | `hasMaterial && readyToDraftCount === 0 && !anyDrafting` (`:711`) |

The label is the word the owner asked for. A label problem is therefore NOT
supported by the tree: the button says "Regenerate", the aria-label says
"Regenerate draft N", and the sibling announcement tool uses the same word
(`recording/TakeAnnouncementPanel.tsx:463` `idleLabel="Regenerate announcement"`).

### 2e. The always-visible control next to it - and what it does after a draft exists

The sticky bottom dock (`WalkthroughAnnouncementPanel.tsx:808-842`,
`position: sticky; bottom: 0` at `WalkthroughRunBar.module.css:12-20`) holds
"Start capture"/"Stop capture", "Run legibility probe", "Generate announcement",
"Generate video script". It is on screen the whole time the panel is.

"Generate announcement" is disabled whenever `readyToDraftCount === 0`
(`:825`). `readyToDraftCount` is `emptySlotIds(slots).length`
(`useAnnouncementDraftSlots.ts:518`) and `emptySlotIds` counts only slots
whose phase is `"empty"` (`announcement-draft-slots.ts:402-404`). So the moment
every slot holds a draft, the one big always-visible "Generate announcement"
button is greyed out, still labelled "Generate announcement", and nothing on or
near it says why or where redo lives. (The dock deliberately holds no
`ConfirmArmButtons` and no Post control - pinned by
`walkthrough-announcement.structure.test.ts:776-778`.)

The panel's only pointer from that state is the grey hint at `:711-715`, which
is a plain `styles.fieldHint` line sitting above the "Announcement drafts"
fieldset (`:719`).

## 3. Hypothesis (ranked, each tagged with how it was grounded)

H1 - GROUNDED IN THE TREE (strongest). "Regenerate" is the vocabulary of the
always-visible dock button. A person who wants to redo a draft reaches for the
dock's "Generate announcement" again, finds it disabled with the same label and
no reason (`WalkthroughAnnouncementPanel.tsx:825,829`), and concludes there is
no redo. The control that does redo is a different, outlined button inside a
slot, low in the card. The single pointer to it (`:713`) is small grey text, is
not near the disabled button, and is shown only once all slots are drafted.
This predicts "reads as absent" even though the label is right. It is
consistent with the owner's phrasing ("a regenerate feature on the tool").
- Cannot be confirmed from code: whether the owner was looking at the dock at
  that moment. Needs the owner's answer (section 6).

H2 - GROUNDED IN THE TREE, PROMINENCE ONLY. Regenerate is the middle of
Post (filled) / Regenerate (outlined) / Copy (outlined), below the editor
(`AnnouncementDraftSlot.tsx:269-309`). Outlined next to a contained primary is
a deliberate "secondary" signal. Weak on its own: it is a normal pattern in this
app (`ConfirmArmButtons.tsx:31-34` documents it), and the label is explicit.

H3 - GROUNDED, ARM STEP LOW-SALIENCE. After the first click the only
non-button feedback is a grey one-line hint below the row
(`AnnouncementDraftSlot.tsx:355-359`), while the button itself does change
colour and text. A first click is unlikely to read as "nothing happened"
because the button visibly turns filled amber and gains "Cancel"; this is
the least likely cause of "absent". It would matter only if the owner arrived at
the control and then distrusted it.

H4 - PRECONDITION (no draft on screen). The control is correctly absent before
any draft exists (`:200`, section 2a). The tool auto-drafts on stop when the
persisted toggle is on (`useWalkthroughAutoDraft`, panel `:705-709`), so many
sessions reach a draft without the owner ever clicking Generate - which
means the first time they see "Generate announcement" disabled is exactly the
H1 moment.

REJECTED: "the label does not say regenerate / icon only" - falsified by
`AnnouncementDraftSlot.tsx:296`. "Hidden in a menu" - falsified, it is a
top-level Button in the row (`:294-306`).

## 4. Recommended change (ONE, scoped to the panel)

Principle: put the redo path in words at the place the H1 failure happens,
without adding a second Regenerate control, without touching the confirm step,
and without touching the dock (dock constraints:
`walkthrough-announcement.structure.test.ts:776-778`).

CHANGE R1 - promote and sharpen the existing "all slots drafted" hint.

File: `src/app/components/walkthrough-announcement/WalkthroughAnnouncementPanel.tsx`,
the block at `:711-715` (condition unchanged:
`hasMaterial && readyToDraftCount === 0 && !anyDrafting`).

Before (current, verbatim from `:711-715`):

```
{hasMaterial && readyToDraftCount === 0 && !anyDrafting && (
  <p className={styles.fieldHint}>
    Every draft slot already has a draft - add another slot, or use Regenerate on one.
  </p>
)}
```

After (proposed; `controls` is already imported and used in this file, e.g.
`:585`, so no new import):

```
{hasMaterial && readyToDraftCount === 0 && !anyDrafting && (
  <p className={controls.notice}>
    Generate announcement is off because every draft slot already has a draft. To redo a draft, press
    Regenerate in the button row under it (Post to Canvas, Regenerate, Copy) - you will be asked to
    confirm before it is replaced. To write another, use Add another draft slot.
  </p>
)}
```

User-visible string, before -> after:
- BEFORE: "Every draft slot already has a draft - add another slot, or use Regenerate on one."
- AFTER: "Generate announcement is off because every draft slot already has a draft. To redo a draft, press Regenerate in the button row under it (Post to Canvas, Regenerate, Copy) - you will be asked to confirm before it is replaced. To write another, use Add another draft slot."
("Add another draft slot" is the existing button text at `:757`.)

Where it sits: unchanged position (directly above the "Announcement drafts"
fieldset, `:717-720`), so no layout move. What changes is salience: from the
small grey `fieldHint` line to the app's existing bordered neutral notice
(`RecordingControls.module.css:224-235`, `--surface-muted`, `--border-soft`),
which the same panel already uses for its other status lines (`:585,590,592,594`).
Neutral, not warning/danger: this is information, not an error, and the warning
surface is already reserved for the armed-post consequence. No emoji, no new
colour, no new component.

What it does NOT change: the `ConfirmArmButtons` for Regenerate
(`AnnouncementDraftSlot.tsx:294-306`), its labels, tone, variant, aria-labels,
arm consequence line (`:355-359`), the dock, the reducer, the hook. The confirm
step stays. The guard count of exactly two `ConfirmArmButtons` in the slot and
one in the fieldset (`walkthrough-announcement.structure.test.ts:967-968`) is
unaffected.

Why this one and not another (honest ranking of alternatives):
- Relabel idle "Regenerate" to "Regenerate draft": not recommended. The label
  already says the word (section 2d) and the aria-label already carries
  "draft N". It would also break the anchor in
  `AnnouncementDraftSlot.structure.test.ts:103`
  (`src.indexOf('idleLabel="Regenerate"')`, closing quote included) for no
  evidence-backed gain.
- Add a Regenerate button to the dock: rejected. It is a second Regenerate
  control (forbidden by AC-3(b)), and the dock is pinned non-destructive
  (`walkthrough-announcement.structure.test.ts:776-778`).
- Make the Regenerate consequence line a warning notice like Post's: a
  reasonable later polish if the owner reports OBS-4 (arm step unnoticed); not
  supported by evidence today (H3 is the least likely cause), so not bundled.
- Make idle Regenerate `contained`: rejected. It would compete with Post, the
  screen's primary, and invert the documented hierarchy
  (`ConfirmArmButtons.tsx:31-34`).

Pins that a build wave must check (all grep-verified):
- the hint string is asserted nowhere: Grep `Every draft slot` over
  `src/**/*.test.ts` returned no hits; Grep `Regenerate|Generate announcement`
  over `src/**/*.test.ts` hits in this directory only at
  `walkthrough-announcement.structure.test.ts:773,810,966`,
  `walkthrough-announcement-timing.structure.test.ts:141`,
  `AnnouncementDraftSlot.structure.test.ts:103,107`; none reads the hint text.
- the `controls.notice` class already exists
  (`RecordingControls.module.css:224`), so no CSS file is edited.
- file set for the build wave: `WalkthroughAnnouncementPanel.tsx` only. Run
  `npm run test:paths src/app/components/walkthrough-announcement/walkthrough-announcement.structure.test.ts src/app/components/walkthrough-announcement/AnnouncementDraftSlot.structure.test.ts src/app/components/walkthrough-announcement/walkthrough-announcement-timing.structure.test.ts`
  and quote each per-argument line (the wrapper from `docs/loop/this-repo.md`),
  plus `npx tsc --noEmit` and lint per the gates card. No component renders under
  vitest, so a green result proves the strings and anchors only - not that the
  notice is seen.
- diagnostics representation (`docs/DEV_LOOP.md`, "Diagnostics representation"):
  this is a presentational copy/class change with no new data path and no new
  failure mode, so it legitimately carries none. That absence is stated here, as
  the loop requires.

## 5. The "it is already discoverable - close it" branch (equal weight)

The code cannot prove the control is hard to find. What the tree shows:
- It is labelled exactly "Regenerate" (`AnnouncementDraftSlot.tsx:296`).
- It is a top-level, always-rendered button in the drafted slot's action row
  (`:294-306`), not in a menu, not icon-only, not behind a disclosure.
- Three separate in-slot sentences already say "Regenerate" when it is
  relevant (`:215,:220,:381`) and the panel adds a fourth (`:713`).
- The arm step visibly changes the button (filled, "Confirm regenerate",
  "Cancel" appears), per `ConfirmArmButtons.tsx:87,101,111-115`.

So if the owner, looking now at a screen that holds a drafted slot, sees
Post / Regenerate / Copy under the message, then the row is a momentary miss
(most likely the H1 moment: they looked at the disabled dock button, or looked
before any draft existed - H4). In that case DO NOT BUILD R1 for its own sake:
close A17 with no code change (AC-3(a)). R1 is justified only if the owner
confirms the H1 story (or any of OBS-2/OBS-3 in the AC); otherwise it is a
speculative change and `docs/a17-acceptance-criteria.md` AC-3 forbids shipping a
fix the rendered-page check did not justify.

My recommendation is conditional on that check, as the AC requires: R1 is the
single fix to build IF the owner answers "NO / would not have found it". It is
cheap (one file, one string, one class) and has no safety cost, which is why it
is recommended rather than merely listed. If the owner says YES (they see it),
close the row.

## 6. What cannot be determined from code alone

- Whether the owner saw the action row at all, was above the fold, or was
  looking at the dock. No browser here, nothing renders under vitest.
- How prominent "outlined, warning tone" reads against the filled Post button in
  the real theme (colours come from `--warning-*` tokens resolved at runtime).
- Whether the sticky dock actually sticks at the owner's viewport (the CSS file
  itself says that is an owner check, `WalkthroughRunBar.module.css:6-9`).
- Whether "regenerate" meant the announcement draft at all. The video script is
  a separate output: after a script exists its fieldset offers only Copy and
  Download (`WalkthroughAnnouncementPanel.tsx:783-799`); redoing it means pressing
  "Generate video script" again (`:831-841`, label never changes to
  "Regenerate"), which silently overwrites the textarea with no confirm (the
  handler sets `scriptText` at `:568`). If the owner meant the script, the row
  is NOT a no-op: it is a different small finding (script has no explicit
  regenerate wording, and re-running overwrites edits without arming). That is
  outside A17's brief and is recorded as a residual, not recommended here.
- Whether the owner meant a different tool: the sibling take-announcement panel
  has "Regenerate announcement" and "Regenerate image"
  (`recording/TakeAnnouncementPanel.tsx:463,562,576,586`), with one-click
  regenerate on untouched drafts (`:193-199`). The two tools differ (the
  walkthrough one always arms), which could read as inconsistency, but that is
  behavior and is not changed here.

## 7. Residual register

| id | Residual | Owner | Instrument | Step that measures it |
|---|---|---|---|---|
| R-1 | Which cause (H1..H4 / the AC's OBS-1..OBS-4) actually matches. Not observable here. | Repo owner | Owner walk of the deployed tool: generate a draft, then look at the dock button and the row under the message | Owner answers the AC Q1 (`docs/a17-acceptance-criteria.md`, "Open questions") |
| R-2 | Build R1 only if R-1 answers "NO / would not have found it". File set: `WalkthroughAnnouncementPanel.tsx` only. | Orchestrator dispatches a `loop-implementer` | the three structure tests via `npm run test:paths` (per-argument lines quoted), `npx tsc --noEmit`, lint; then owner re-walk | The build wave after R-1 |
| R-3 | Optional polish, ONLY if R-1 reports the first click seemed to do nothing: render the Regenerate consequence (`AnnouncementDraftSlot.tsx:355-359`) as `controls.notice controls.noticeWarning` like Post's (`:336-353`). Not recommended now. | Repo owner decides | Owner walk | After R-1, only if OBS-4 |
| R-4 | If the owner meant the video script: "Generate video script" re-run overwrites an edited script with no confirm and no "Regenerate" wording (`WalkthroughAnnouncementPanel.tsx:831-841,568`). Separate row, not A17. | Repo owner (file as a new row if confirmed) | Owner walk, then a scope pass | After R-1 |
| R-5 | Line numbers in this doc and in `docs/a17-acceptance-criteria.md` drift as the walkthrough files change (the AC's numbers are already stale). | Whoever builds R-2 | Re-run Grep for the strings quoted in section 2d | At the start of the R-2 build |

## 8. Verification log (commands behind the quantities)

- Existence/wiring (section 1): Grep over
  `src/app/components/walkthrough-announcement`, non-test files, for the
  regenerate identifiers; each hit then opened with Read.
- Control and strings (sections 2b-2d): Read of `AnnouncementDraftSlot.tsx` in
  full (398 lines) and `ConfirmArmButtons.tsx` in full (118 lines).
- Dock and hint (sections 2e, 4): Read of `WalkthroughAnnouncementPanel.tsx`
  lines 455-846 and `WalkthroughRunBar.module.css` in full.
- Disabled-dock derivation: Read `useAnnouncementDraftSlots.ts:518` and
  `announcement-draft-slots.ts:402-404`.
- Test pins: Grep for `Regenerate|Generate announcement|Every draft slot` over
  `src/**/*.test.ts`; opened `AnnouncementDraftSlot.structure.test.ts:85-128`,
  `walkthrough-announcement.structure.test.ts:755-826,960-977`,
  `walkthrough-announcement-timing.structure.test.ts:125-165`.
- CSS: Read `page.module.css:256-262`, `RecordingControls.module.css:64-84,218-245`.
- Not run: no test, tsc or lint (read-only pass; nothing was changed). Nothing
  here claims a gate result.
