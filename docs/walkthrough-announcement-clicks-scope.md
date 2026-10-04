# Announcement from a walkthrough: smoother, fewer clicks, shorter scroll and cursor path - recon and scope

Status: SCOPE, authored by a `loop-seat` (Sonnet) on 2026-10-04. Not yet checked.
Owner request (verbatim): "the announcement from walkthrough ... need[s] to be far
more smoother and easier and less clicks to use." Second paramount dimension added
mid-task by the coordinator: minimize SCROLL DISTANCE and CURSOR TRAVEL to set up a
run, co-equal with click count, OWNER-verified. No production code was written; this
file is the only artifact.

Evidence tags:

- `[MEASURED <cmd>]` a command was run in this checkout and its output is quoted.
- `[READ file:line]` I opened that file at that line. Nothing in this repo renders a
  component, so every UI behaviour claim is a READ claim, not an observation.
- `[ARITHMETIC]` computed from READ facts; the runtime was not observed.
- `[ESTIMATE]` a pixel figure derived from CSS tokens and remembered MUI sizes; NOT
  measured. Section 3 gives the owner instrument that replaces every one of them.
- `[UNDETERMINED]` I could not establish it here and say so.

What I could not do, stated once (`docs/loop/this-repo.md` section 6): run the app,
open the browser's screen-share picker, observe a reload, measure a pixel, or feel a
click count. Nothing in sections 2 and 3 was observed in a browser.

Surface boundary: WALKTHROUGH-announcement only (Recording tab, sub-tab "Announcement
from a walkthrough", `RecordingTab.tsx:596` key `walkannounce`, panel mounted at
`RecordingTab.tsx:879-881`). Not the take/recording announcement route, not the
graders, not Discussion/Message replies.

---

## 0. Headline

1. THE RETURNING-INSTRUCTOR PATH IS ALREADY NEAR ITS CLICK FLOOR: 5 in-app clicks
   (Start, Stop, Generate, Post, Confirm post) with nothing required before Start.
   The guard (arm then confirm on Post) is 2 of the 5 and is not touched. Click cuts
   that remain are real but small: Generate (-1, auto-draft on stop, fork F1), the
   "Written for" select (-2 per midweek run, fork F2), the course select (-2 once,
   fork F3), and arrival (0 to 3, mostly already done by 47554810).
2. THE LARGER COST IS VERTICAL. By section 3's arithmetic the Start button sits
   below roughly 500 px of setup form (course/module, a 4-row paste box, label, two
   buttons, two checkboxes, a notes box, a three-line privacy disclosure) and the
   Post button sits below roughly another 800 px of stacked fields, a raw Markdown
   box AND a rendered preview of the same text. Those are `[ESTIMATE]` and the
   owner instrument in section 3.3 replaces them. This is where "far smoother" is
   most likely to be won, and it costs ZERO clicks to fix.
3. A REAL CURSOR FINDING, `[READ]`: arming Post inserts a multi-line warning notice
   ABOVE the button row (`AnnouncementDraftSlot.tsx:270-288` renders before the row
   at `:295`), so the Confirm button moves down by the notice height at the moment the
   cursor is on it. The Regenerate consequence line already sits BELOW its row
   (`:336-340`); Post's is the inconsistent one. Fix is a reorder, no click, no guard.
4. A REAL REPEAT-USE GAP, `[READ]`: nothing ever clears the accumulated captured
   material (`batchBlocksRef`, `WalkthroughAnnouncementPanel.tsx:441`, appended at
   `:478`, no other write in the file), the panel is mounted for the whole app session
   (`RecordingTab.tsx:879-881`, `page.tsx:699`), and "Generate" never overwrites a
   drafted slot (`announcement-draft-slots.ts:380-382`). So a second walkthrough in the
   same page session appends to the first week's material and cannot be drafted
   without Regenerate or adding a slot. Only a reload resets it. Fork F4.
5. THREE HYPOTHESES I CANNOT RULE OUT FROM THE TREE and that would explain "not smooth"
   better than click counts: H1 persisted values not visibly restoring after reload,
   H2 the course select showing blank until the course list loads, H3 the "Written for"
   tone silently resetting each run. All are owner checks (section 10).

Triage (per `docs/loop/seats.md` table): acceptance criteria (always); architect +
reuse (new modules, more than two files); UX (user-visible); data/storage (possible
new `ta-rec-wta-*` keys, F1/F2, and the five-key canary); visual (layout);
accessibility (markup order and a live-region move; reading claims only);
security/reliability/operability triaged OUT EXCEPT: the auto-draft trigger (F1) is a
new path to an existing LLM call and an existing web-research call, so security and
reliability run on W2 only. Leverage claim in section 6.

---

## 1. Where the surface is and how an instructor reaches it

Files `[MEASURED @(Get-Content <f>).Count in PowerShell]`:

| File | Lines | Role |
|---|---|---|
| `src/app/components/walkthrough-announcement/WalkthroughAnnouncementPanel.tsx` | 991 | panel, owns capture wiring, setup state, exemplar fetch, run rows |
| `.../AnnouncementCourseFieldset.tsx` | 258 | "Course and format" fieldset |
| `.../AnnouncementDraftSlot.tsx` | 374 | one draft row |
| `.../useAnnouncementDraftSlots.ts` | 526 | reducer host, generate/regenerate/post |
| `.../announcement-draft-slots.ts` | 552 | pure leaf, reducer |
| `src/app/components/RecordingTab.tsx` | 909 | mounts the panel; NOT written by this scope |
| `src/app/components/recording/useDiscussionCapture.ts` | 579 | capture hook, shared with other panels; NOT written |

THE PANEL IS 9 LINES FROM THE 1000-LINE CEILING (`src/file-size-ceiling.structure.test.ts:41`
`LIMIT = 1000`). Any wave that adds JSX or state to it must extract first (W0).

Arrival (secondary; not this scope's write set):

| Route | In-app clicks to the panel | Cite |
|---|---|---|
| Reload or return, last Recording view was this one | 0 | `RecordingTab.tsx:62-76` reads `ta-rec-view`; the nav restore is per the sibling scope `docs/discussion-recording-setup-clicks-scope.md` section 2.3, NOT re-opened by me |
| Floating action button | fab (1) + "Recording tools" (1) = 2 when the last view was this one, else + the sub-tab click = 3 | `FabQuickActionsMenu.tsx:161-166` entry, `AiChatFab.tsx:441-443` `navigateToRecordingTool("remembered")` (shipped 47554810, which `RecordingTab.tsx:108` guards so `recView` is not overwritten) |
| Another Recording sub-tab | 1 | `RecordingTab.tsx:596-616` |
| Modules bulk bar | NO entry for this view today: only `moduledeck` is launched (`ModulesView.tsx:431`) | fork F5 |

Persisted today `[READ]`: `ta-rec-wta-course` (`:97`), `-module` (`:98`), `-notes`
(`:99`), `-emoji` (`:101`), `-resources` (`:102`), plus `ta-rec-view`
(`RecordingTab.tsx:64,79`). The directory canary pins exactly FIVE keys
(`walkthrough-announcement.structure.test.ts:118-124`, `expect(distinctKeys.size).toBe(5)`),
scanning every non-test file in the directory, comments included. NOT persisted:
"Written for" timing (`announcement-draft-slots.ts:18-22`, a seat-level decision in
`docs/a19-scope.md` section 4.1, not an owner decision), format choice, the schedule
time (`:103-113`, DELIBERATE, owner-level Branch A in
`docs/owner-decisions-2026-09-23.md:164`, and it STAYS), the pasted exemplar text (decision P3, Supabase),
the drafts themselves, the captured material. Decisions record checked first (per
`traps-spec.md`): `docs/owner-decisions-2026-09-23.md` and `-09-27.md` contain no
decision about persisting timing, auto-drafting, or this panel's layout.

---

## 2. CURRENT FLOW, click by click

Convention: an in-app click is a click on this app; the browser's screen-share picker
(up to 3 clicks, browser-owned, `[UNDETERMINED]`, not measurable here) and the walk
through Canvas itself are EXCLUDED. Focusing a text field counts 1; typing is not
counted. A MUI select costs 2 (open, choose).

### 2.1 Every control, in DOM order

| # | Control | file:line | Default | Persisted | Class |
|---|---|---|---|---|---|
| 1 | Course select | `AnnouncementCourseFieldset.tsx:118-131` | `""`, blank until the list loads (`courses ?? []`, `Panel:136,150-154`) | `ta-rec-wta-course` | INCIDENTAL: only Canvas-linked courses are options (`Panel:152`), Post is disabled without it (`Slot:305`), drafting works without it |
| 2 | Module or week | `:132-138` | `""` | `ta-rec-wta-module` | INCIDENTAL; feeds extraction (`Panel:459-464`) and the draft |
| 3 | Paste a previous announcement | `:147-155` | empty | NO (P3) | INCIDENTAL; wins over saved formats when non-empty (`announcement-draft-slots.ts:339-341`) |
| 4 | Label | `:157-164` | disabled until text | NO | INCIDENTAL |
| 5 | Save for reuse | `:167-176` | disabled until text AND course | writes Supabase | INCIDENTAL; makes the paste survive a reload |
| 6 | Browse saved exemplars | `:177-179` | closed | NO | INCIDENTAL |
| 6a | Add a draft from this | `:201-208` | per row | - | INCIDENTAL |
| 6b | Remove / Confirm remove (exemplar) | `:211-221` | arm then confirm | - | REQUIRED-FOR-SAFETY (guard G3) |
| 7 | Use emojis | `:232-235` | off | `ta-rec-wta-emoji` | INCIDENTAL |
| 8 | Research and cite | `:236-239` | off | `ta-rec-wta-resources` | INCIDENTAL (also an egress consent, section 5) |
| 9 | Notes | `:242-250` | empty | `ta-rec-wta-notes` | INCIDENTAL; feeds extraction |
| 10 | Privacy disclosure | `:252-255` | text | - | REQUIRED-FOR-SAFETY, frozen whole by test (guard G4) |
| 11 | Start / Stop capture | `Panel:816-818`, handler `:507-520` | - | - | REQUIRED (arming action; no `disabled`) |
| 12 | Run legibility probe | `Panel:819-821` | disabled while capturing | - | OPTIONAL |
| 13 | Generate announcement | `Panel:856-871`, gate `:865-867` | disabled: capturing, extracting, no material, drafting, formats loading, no empty slot | - | REQUIRED today; incidental if F1 |
| 14 | Generate video script | `Panel:872-882` | - | - | OPTIONAL, other output |
| 15 | Format to match | `Slot:121-137` | "Default - your most recent" (`slots.ts:200-211,339-347`) | NO | INCIDENTAL: default is usually right |
| 16 | Written for | `Slot:139-152` | "Beginning of week" (`slots.ts:22`) | NO | INCIDENTAL on the default path, 2 clicks on every midweek run |
| 17 | Visible to students | `Slot:154-176` | blank = immediately | NO, deliberate | INCIDENTAL; changes the button labels |
| 18 | Subject, Message | `Slot:235-250` | the draft | in-memory only | review/edit; 1 focus click if edited |
| 19 | Rendered preview | `Slot:251-252` | - | - | REQUIRED for review (guard G9) |
| 20 | Post to Canvas, then Confirm post | `Slot:295-318`, hook `useAnnouncementDraftSlots.ts:460-473` | arm, then same button confirms | - | REQUIRED-FOR-SAFETY, 2 clicks (guard G1) |
| 21 | Regenerate, Confirm regenerate | `Slot:319-331` | - | - | guard G2 (overwrites hand edits) |
| 22 | Copy | `Slot:332-334` | - | - | OPTIONAL |
| 23 | Add another draft slot / Remove slot | `Panel:934-941`, `Slot:365-371` | 1 slot | - | OPTIONAL |

### 2.2 Measured click counts (in-app, `[ARITHMETIC]` over the rows above)

| Path | Clicks | Derivation |
|---|---|---|
| P1 Returning, saved format exists, course persisted, immediate post, no edit | 5 | Start (11), Stop (11), Generate (13), Post (20), Confirm (20) |
| P2 P1 but a midweek check-in | 7 | + row 16 (2) |
| P3 P1 but scheduled | 6+ | + row 17: 1 focus plus the native datetime picker, `[UNDETERMINED]` |
| P4 First ever, no saved format, accept defaults, pick the course | 7 | row 1 (2) + P1 (5); a paste is not needed, drafting works with no format (`slots.ts:254`) |
| P5 First ever, everything set | 13 | course 2, module focus 1, paste focus 1, Save 1, emoji 1, research 1, notes focus 1 = 8, + P1 (5) |
| P6 Edit the draft first | +1 | focus Subject or Message |
| P7 SECOND walkthrough in the same page session | not a counted path | accumulated material is never cleared and a drafted slot blocks Generate; section 0 item 4. Only a reload resets it |

Floor with every guard intact and no auto-draft: 5. Floor with auto-draft: 4. Anything
below 4 means a guard was removed or Stop was bypassed (the browser sharing-bar Stop
is also a click, `Panel:823`).

### 2.3 Guards that MUST survive, with their enforcers

| ID | Guard | Where | Enforcer |
|---|---|---|---|
| G1 | Post arm then confirm, signature includes the schedule time | `Slot:295-318`, `hook:205-214,460-473` | `walkthrough-announcement-timing.structure.test.ts:137-` (slices `Slot` from the anchor `wta-post-consequence` to the next `</p>`), `useAnnouncementDraftSlots.test.ts` |
| G2 | Regenerate arm then confirm | `Slot:319-331` | `announcement-draft-slots.test.ts` |
| G3 | Exemplar Remove arm then confirm | `Fieldset:211-221` | none read; `[UNDETERMINED]` |
| G4 | Privacy disclosure, byte-frozen, in the settings block BEFORE the capture controls | `Fieldset:252-255`; `Panel:31-33` | `walkthrough-announcement.structure.test.ts:599-632` (anchors inside the fieldset file) |
| G5 | Screen-share consent | browser | not ours |
| G6 | beforeunload while capturing or frames pending | `Panel:522-530` | none read |
| G7 | Post disabled without course, subject, message, valid visibility | `Slot:304-309` | wiring tests, `[UNDETERMINED]` which |
| G8 | Generate gating, only "loading" of the saved formats blocks it (owner decision G1) | `Panel:865-867` | `walkthrough-announcement.structure.test.ts:409-423` |
| G9 | The rendered preview is on screen before Post | `Slot:251-252` | `walkthrough-announcement.structure.test.ts:226-245` |
| G10 | Server-side link guard on the posted body | `src/lib/walkthrough-announcement-link-guard.ts` | untouched here, section 9 |

Observation O1 (not in scope, filed in the residual register): after a SUCCESSFUL post
the same slot's button returns to idle "Post to Canvas" (`announcement-draft-slots.ts:
post-result` clears `postArmedFor`, keeps the draft, `:528-539`), so a second post of
the same text is two more clicks with nothing saying "already posted" except the status
line (`Slot:342-359`). Observation O2: a drafted or edited announcement lives only in
memory and the beforeunload guard covers capture only (`Panel:522-530`), so a reload
silently discards unposted work.

---

## 3. SCROLL AND CURSOR COST

### 3.1 What is measurable here and what is not

Nothing in this repo measures a pixel. The figures below are `[ESTIMATE]`: CSS tokens
read from `globals.css:71,74,75,83,88-94` (space 4/8/12/16/20/24, base text 14px,
line 1.55), flex gaps read from `RecordingControls.module.css:24-32` (`.section`,
gap `--space-2` = 8) and `page.module.css:903-911` (`.adaptPanel`, padding 20/24, gap
16), and a small MUI TextField at 37.7 px (recorded in memory as verified on
2026-09-02, NOT re-measured by me). Multiline heights are my arithmetic. Treat the
ORDER of the stack and the ratios as the finding; the owner instrument in 3.3
replaces the absolutes.

### 3.2 Current vertical stack above Start capture `[ESTIMATE]`

Offsets are from the panel's top edge, inside `.adaptPanel` (`Panel:728`). The tab
shell title, subtitle and the 10-tab strip above the panel (`RecordingTab.tsx:567-620`)
are NOT counted and are not this scope's to change.

| Element | file:line | Est. height px |
|---|---|---|
| panel padding top + header (title, subtitle, 2 to 3 lines) | `Panel:729-736` | 20 + 65 |
| gap | | 16 |
| fieldset legend + gap | `Fieldset:116` | 29 |
| Course + Module row | `:117-139` | 38 |
| hint "Only courses linked to Canvas..." | `:145` | 22 |
| Paste box, 4 rows | `:147-155` | 110 |
| Label row | `:156-165` | 38 |
| Save / Browse row | `:166-180` | 31 |
| Emoji + Research row | `:231-240` | 38 |
| Notes, 2 rows | `:242-250` | 63 |
| Privacy disclosure, 3 lines | `:252-255` | 65 |
| inter-element gaps inside the fieldset (about 8 x 8) | | 64 |
| gap + "A capture in progress does not survive a reload" hint (2 lines) | `Panel:810-813` | 16 + 44 |
| run row top padding + border | `controls.runRow`, `RecordingControls.module.css:69-72` | 17 |
| TOP OF Start capture (sum) | `Panel:816` | about 670 |

So Start sits about 670 to 700 px into the panel `[ESTIMATE]` and the Course/Module
controls near the top, i.e. setup and Start are about 600 px apart on the page and the
cursor must scroll between them. The Notes box, which the capture reads
(`Panel:459-464`), is the control closest to Start; the Course select, which the draft
and the post need, is the furthest.

### 3.3 Draft to Post stack `[ESTIMATE]` and what shifts

After the capture, the Generate row (`Panel:855-883`) is immediately under the Start
row, so Stop to Generate is a short path (same row group, about 130 px horizontal).
The preview video (`controls.previewVideo`, 240 px wide, 16:9, `RecordingControls.module.css:300-307`)
appears only while capturing (`Panel:826-846`), so Generate moves up by about 135 px
when capture stops; the Stop button does not move.

Inside the first draft slot, top to Post (`AnnouncementDraftSlot.tsx`), all stacked
vertically at full width:

| Element | file:line | Est. px |
|---|---|---|
| legend | `:119` | 29 |
| Format select | `:121-137` | 38 |
| Written for select | `:139-152` | 38 |
| Visible to students + hint | `:154-176` | 38 + 22 |
| receipt lines (2) | `:213-214` | 44 |
| Subject | `:235-241` | 38 |
| Message, 6 rows | `:242-250` | 160 |
| "Preview (how this renders)" label + preview of the SAME text | `:251-252` | 22 + 200 to 400 (unbounded) |
| Markdown explainer, 3 lines | `:253-257` | 65 |
| consequence notice (only after the first Post click) | `:270-288` | 0, then about 100 |
| TOP OF Post to Canvas | `:296` | about 760 to 960 |

Findings, in order of cost:

- S1. THE MESSAGE IS RENDERED TWICE, a 6-row editable box and a full-height preview,
  stacked. At 2 columns the pair is about max(160, preview) instead of the sum.
- S2. THREE SELECT-LIKE FIELDS STACK IN A COLUMN (Format, Written for, Visible to), each
  `controls.fieldMd` (`min-width: 220px`, `RecordingControls.module.css:82-84`). Laid in
  one `.adaptRow` they are one 38 px row, a saving of about 90 px, and the cursor
  crosses them left to right instead of down.
- S3. THE ONE CONTROL THAT DECIDES WHEN STUDENTS SEE IT (Visible to students) sits
  about 600 px above the button it relabels (Schedule post). Beside the Post row it is
  adjacent to the act. This also honours the A32 naming-hazard ruling
  (`docs/owner-decisions-2026-09-23.md:153-162`, "Timing" content framing versus the
  publication time): content controls on top, publication control at the button.
- S4. THE ARM NOTICE SHIFTS THE CONFIRM BUTTON about 100 px at the moment of the second
  click (section 0 item 3). The cursor is on the button; the button moves; an
  unmodified second click can land on whatever slid under it. Same-place Confirm is a
  pure reorder and is NOT a removed guard: the notice, the `aria-describedby` link
  (`ConfirmArmButtons.tsx:105`) and the two-click contract all stay.
- S5. Generate and the drafts are in the same panel but the drafts fieldset begins
  below the Generate row and its hints (`Panel:893-902`); when Generate finishes the
  drafted slot may be below the fold with nothing bringing it into view. `[UNDETERMINED]`
  whether it is, depends on the viewport.

### 3.4 OWNER INSTRUMENT (replaces every [ESTIMATE])

In the browser console on the Recording tab, sub-tab "Announcement from a walkthrough",
before and after the build:

```js
const p = document.getElementById('rec-panel-walkannounce');
const pt = p.getBoundingClientRect().top + scrollY;
const want = /^(Start capture|Generate announcement|Post to Canvas|Schedule post)$/;
({ vh: innerHeight, vw: innerWidth,
   rows: [...p.querySelectorAll('button,[role=combobox],input,textarea')]
     .filter(e => e.offsetParent)
     .map(e => [(e.getAttribute('aria-label') || e.textContent || e.name || e.tagName).trim().slice(0, 30),
                Math.round(e.getBoundingClientRect().top + scrollY - pt),
                Math.round(e.getBoundingClientRect().left)]) })
```

Record `top` (offset from the panel) and `left` per control at a 1280 x 720 viewport.
Scroll cost of a hop is `top(B) - top(A)` once it exceeds `vh` less the control
height; cursor cost of a hop is the Euclidean distance between the two controls'
centres, which the same rows give. The Post row exists only after a draft. Take the
rows again after clicking Post once, to see S4's shift directly.

---

## 4. WHERE THE CLICKS AND THE SCROLL GO, AND THE MECHANISM FOR EACH

Each states what it removes, what it does NOT touch, and what it does to a guard.

M1. SETUP + START IN ONE SHORT GROUP, FORMAT BELOW. Split "Course and format" into
(a) a CAPTURE fieldset: Course, Module, Notes, the privacy disclosure, then the run
row, and (b) a "Draft format and options" fieldset: paste, label, save, browse, the
two toggles. Course and Module go in one `.adaptRow`; Start, Generate announcement,
Generate video script and the probe go in ONE row directly under the disclosure.
Removes: about 250 to 350 px of scroll between setup and Start `[ESTIMATE]` (Start top
about 670 to about 330 to 430 px; sum for the new stack about 375). Does NOT touch: any click count. Guards: G4 is kept
BEFORE the capture controls (it stays in fieldset (a), above the run row), but its
test slices from anchors INSIDE `AnnouncementCourseFieldset.tsx`, so that file's
anchors and the test move with it (section 7, W3). Trade-off, stated: a first-time
instructor reaches Generate before seeing "Use emojis" and "Research and cite". Both
default off and persist, so Generate cannot silently do more than it did, and the
paste/format choice is already defaulted (`slots.ts:339-347`).

M2. START AND GENERATE ADJACENT (already in a row pair; make it one row). Cursor path
Stop to Generate becomes one adjacent button, about 130 px. Removes no click.

M3. AUTO-DRAFT ON STOP (F1). When a stop completes AND extraction has drained
(`pendingFrames === 0 && !extracting`, `Panel:489-501`) AND material exists AND an
empty slot exists AND the toggle is on, call the existing `generate()`. Removes 1
click per run (P1 5 to 4). Does NOT touch: Post, its confirm, the signature, or the
rule that Generate never overwrites a drafted slot. Egress: the draft call sends
text the extraction already produced to the same provider class the disclosure names;
with "Research and cite" on it also triggers `gatherWalkthroughResourcesAction`, which
today fires on a Generate click. The checkbox is the standing consent; a status line
must say "Drafting automatically - turn this off under Draft options" while it runs.
Fires once per stop (a ref set by the Stop handler and cleared when it fires), never
from a remount or a reload, since neither material nor slots persist.

M4. PERSIST THE LAST "WRITTEN FOR" (F2). A new `ta-rec-wta-timing` seeds new slots.
P2 7 to 5. Persistence needs a MOUNT-EFFECT restore (a lazy `useState` initializer
does not show on first paint in an SSR'd client component, the panel's own comment at
`Panel:209-216` and `docs/a19-scope.md:435-446`), the five-key canary bumped in the
same commit (5 to 6, or more with F1), and the receipt line that already states the
timing a draft was built with (`Slot:214`, `timingLabel`) is the guard against a stale
tone. The schedule time stays unpersisted.

M5. SINGLE-COURSE AUTO-SELECT (F3). If `ta-rec-wta-course` has never been written
(raw `null` or `""`) and exactly one Canvas-linked course loaded, select it. P4 7 to 5.
Never overrides an explicit value; never changes a persisted course; the Post
consequence names the course (`Slot:281`) and so remains the confirm of WHERE.

M6. LAYOUT INSIDE THE DRAFT SLOT. (i) Format and Written for in one `.adaptRow` (S2);
(ii) Message and Preview side by side in the existing `.adaptFieldGrid2`
(`page.module.css:957-970`, collapses at 640 px, no new CSS), preview still BEFORE the
Post row in source order (G9); (iii) the Visible-to field moves into the Post row (S3);
(iv) the arm notice moves BELOW the Post/Regenerate/Copy row (S4), matching the
Regenerate line at `Slot:336-340`; (v) the Markdown explainer stays, its wording is a
tested notice (`walkthrough-announcement.structure.test.ts:200-203`), and moves under
the row. Do NOT cap the preview height: clipping the tail of a message that is about
to publish to every student would weaken G9.

M7. REPEAT RUN (F4). A "Start a new run" control, arm then confirm (it discards the
accumulated material and every draft), plus an automatic fresh run when the next Start
follows a state where EVERY drafted slot has been posted. Removes the reload-and-lose-
everything detour, which today is the only reset. Does NOT touch: the post confirm.
The auto-fresh branch never fires while an unposted draft exists.

M8. BRING THE FIRST DRAFT INTO VIEW. When a slot goes drafting to drafted and its top
is below the viewport, `scrollIntoView({ block: "nearest" })` once. No focus move
(moving focus is the accessibility seat's call, and a reading claim at best). Honour
`prefers-reduced-motion`. Optional cut line: if W3 runs long, M8 is the first thing
dropped, and it is recorded as a residual, not deleted.

M9. ENTRY FROM MODULES (F5). A "Announce from a walkthrough" action next to the
existing "Capture module walkthrough" (`GenerateFromSelectionSection.tsx:269-277`),
launching `view: "walkannounce"` with `capturePrefill`, consumed in this panel the way
`ModuleDeckCapturePanel.tsx:262-268` consumes it for `moduledeck`. Removes: the
Recording navigation (1 to 3), the course select (2) and typing the module name.
`[UNDETERMINED]` whether a live selection can fill the course: `ModulesView.tsx:431-445`
puts `courseId` only for an export selection and `courseUrl` for a live one, and the
deck panel reads only `courseId` (`ModuleDeckCapturePanel.tsx:264`); this panel HAS
`canvasUrl` per course (`Panel:153`) so a `courseUrl` match is possible, but whether
the two strings are equal is not established here.

### Considered and NOT proposed

| Idea | Why not |
|---|---|
| Remove "Confirm post" or auto-confirm after a delay | Removes the only barrier before an irreversible, unrecallable publish to every student (`Slot:281-283`). Out of bounds by the brief. |
| Cap the preview height | Hides what is about to be published; G9. |
| Collapse the format/options behind a disclosure | Adds 1 click to change anything on first use for no repeat-path saving; M1's reorder gets the scroll without it. |
| Start the screen share on tab entry | A consent prompt with no user gesture; not a click-cost trade worth making. |
| `displaySurface` hint on `getDisplayMedia` | Changes the browser picker, `[UNDETERMINED]`, shared hook `useDiscussionCapture.ts:410-413` serves other panels. |
| Persist the schedule time | Owner-decided NO (Branch A). |
| Sticky action bar for Post | Layout-pinned irreversible control; a second place to post is a second place to misclick. Not priced. |

---

## 5. Required versus incidental, in one place

REQUIRED: Start, Stop, Post, Confirm post. REQUIRED-FOR-SAFETY and untouched: Post arm,
Post confirm, Regenerate arm/confirm, exemplar Remove arm/confirm, the disclosure, the
browser's share consent.
INCIDENTAL and reducible: Generate (F1), course select (F3, F5), Written for (F2),
scroll between setup and Start (M1), scroll between draft and Post (M6, M8), cursor
travel across the three selects (M6), the Confirm button's shift (M6 iv), the reload
detour for a second run (M7).
INCIDENTAL and NOT reducible without a decision: Module, Notes, paste, Save, the two
checkboxes (each is a deliberate input, none is required).

---

## 6. ACCEPTANCE CRITERIA

Leverage claim (`docs/loop/leverage.md`, one paragraph): CLICK COST and SCROLL/CURSOR
COST on an existing capability, named as such (the sibling scope's
`discussion-recording-setup-clicks-scope.md` section 4 makes the same claim). Today the
instructor scrolls past a long setup form to reach Start, scrolls again past two copies
of the draft to reach Post, re-picks "Midweek check-in" every run, re-picks a course
that has only one option, and reloads the page to start a second announcement. The cost
is a long vertical hop twice per run plus 0 to 4 incidental clicks. A chat can do none of
this and the claim does not pretend otherwise: it claims nothing categorical. Its
removal test is OWNER-only (AC-13) because no test here observes a pixel or a click.

MACHINE = a pure-function test or a source-text/structure test can pin it (nothing
renders). OWNER = only a browser can show it. Per `docs/loop/traps-spec.md` every
pass condition names the object, the instrument and the direction of failure.

| ID | Criterion | Object compared | Instrument | Direction of failure | Tag |
|---|---|---|---|---|---|
| AC-1 | Start capture is no further from the panel top than 0.65 x M_now and no more than 450 px, at 1280 x 720 | the `top` of the Start button in the 3.4 snippet, after vs before | owner runs the 3.4 snippet; M_now is the same snippet on HEAD | RED if the after value exceeds either bound | OWNER |
| AC-2 | Source order: Course select, Module field, privacy disclosure, Start capture, Generate announcement all precede the paste box, the Save button and the two checkboxes; the disclosure precedes Start (G4/P15) | the JSX text order across the capture fieldset and the panel | structure test using `indexOf` comparisons over the files that hold them, anchored on the label strings, not on line numbers | RED if any format/option control precedes Start, or the disclosure follows it | MACHINE |
| AC-3 | Start and both Generate buttons are siblings inside ONE wrapper element | the panel's run row | structure test slicing the run row (the existing tests slice by anchor, e.g. `walkthrough-announcement.structure.test.ts:409-423`) | RED if either Generate button is outside the row that holds Start | MACHINE |
| AC-4 | The post-arm consequence node follows the Post/Regenerate/Copy row in source order; the `id` `wta-post-consequence-` and the `aria-describedby` link are intact | `AnnouncementDraftSlot.tsx` | source-order assertion plus the existing slice at `walkthrough-announcement-timing.structure.test.ts:138-146` re-run | RED if the notice precedes the row, or the id or the describedby link is gone | MACHINE |
| AC-5 | The Confirm button's top does not change between idle and armed | the Post button rect, before and after one click | the 3.4 snippet run twice | RED if the two `top` values differ by more than 2 px | OWNER |
| AC-6 | Message and Preview share one `.adaptFieldGrid2` container; the preview precedes the Post row in source order; the preview has no `max-height` or `overflow` | `AnnouncementDraftSlot.tsx` | source-text assertions | RED if the preview is outside the pair, after the Post row, or clipped (G9) | MACHINE |
| AC-7 | The Visible-to field is inside the Post row; the label "Visible to students (optional)" and the Clear link are unchanged; the field is still absent from the persisted keys | `AnnouncementDraftSlot.tsx`, the key canary | source-text assertion plus the directory key canary | RED if the field is outside the row, or a `ta-` key mentioning it appears | MACHINE |
| AC-8 | Top of the Post button, relative to the top of its slot, is at most 0.7 x its current value | the Post `top` minus the slot legend `top` | 3.4 snippet, before and after, on the same draft | RED if the ratio exceeds 0.7 | OWNER |
| AC-9 | Auto-draft predicate returns true ONLY when: toggle on, not capturing, not extracting, `pendingFrames === 0`, material exists, at least one empty slot, saved formats not "loading", and this stop has not already fired. One test row per failing condition | the pure function's output over a table | unit test, EVERY row asserted, not a sample | RED if any single failing row returns true | MACHINE |
| AC-10 | The auto-draft call site is gated on the SAME predicate AC-9 tests, and the Stop handler sets the once-per-stop ref | the file that CALLS it | wiring assertion in the file that calls the predicate (the exported-but-uncalled trap, `traps-spec.md`) | RED if the effect calls `generate` without the predicate | MACHINE |
| AC-11 | Fresh-run predicate: reset ONLY when every slot's `postedTo` is non-null, or the user confirmed "Start a new run". Never when any drafted, unposted slot exists without that confirm | pure function + reducer action `reset` | unit test table plus a reducer test that `reset` returns the initial single empty slot and clears nothing else | RED if a drafted unposted slot can be cleared without the confirm | MACHINE |
| AC-12 | Course auto-select predicate returns an id ONLY when the raw stored value was never written, exactly one course loaded, and the id is in the loaded list | pure function output over a table | unit test: stored `""` vs `null`, 0/1/2 courses, stale stored id | RED if any failing row still returns an id | MACHINE |
| AC-13 | THE FELT COUNT AND PATH. P1 is 5 (or 4 with F1), P2 is 5, P4 is 5, a second run needs no reload; the three scroll hops (setup to Start, Generate to Post, Post to Confirm) are each under one viewport at 1280 x 720; the Confirm does not move | the instructor's real sequence | owner counts clicks and runs 3.4, on a fresh and a returning profile | RED if any count or hop exceeds the figure | OWNER |
| AC-14 | Guards unchanged: G1, G2, G3, G4, G7, G8, G9 enforcers all pass; the `ConfirmArmButtons` use count is 2 in `AnnouncementDraftSlot.tsx` and 1 in the exemplar list; Start has no new `disabled=` | the existing suites plus a count | `npm run test:paths <p1> <p2> ...` over the files in W4's list; count by `symbol-count` AST tool, not `grep -c` (`traps-spec.md`, RULING 135) | RED if any case fails, a count drops, or Start gains a `disabled` | MACHINE |
| AC-15 | The persisted-key canary equals 5 plus the number of ACCEPTED new keys, bumped in the same commit as each key | `walkthrough-announcement.structure.test.ts:118-124` | the canary itself | RED if a key was added without the bump, or a bump without a key | MACHINE |
| AC-16 | No file in the write set ends over 1000 lines; the panel ends at or under 900 | `@(Get-Content <f>).Count` and `src/file-size-ceiling.structure.test.ts` | both | RED if any exceeds | MACHINE |
| AC-17 | NO PICKER CLAIM: the scope asserts nothing about the share picker's click count | - | owner counts (R-4) | not a gate | OWNER |

Number-bearing criteria and their instruments: "5 to 4", "7 to 5" are `[ARITHMETIC]`
over section 2's rows; the 0.65 and 0.7 ratios and 450 px are chosen from the section 3
`[ESTIMATE]` and are proposals the owner may re-set after running 3.4 on HEAD. The
MACHINE criteria pin the MECHANISM that produces the count or the order, not the count.

---

## 7. WAVE PROPOSAL

Order inside each wave is pure leaves, then wiring, then surface, and every wave
contains the file that CALLS each new export (`seats.md` "Architect"). Waves land
sequentially: W0 first (it is an unblocker), then W1 and W3 may overlap only if their
write sets stay disjoint, and they do not (both touch the panel), so run W0, W1, W2, W3
in order. Line figures `[MEASURED @(Get-Content <file>).Count]`.

| Wave | Write set (exact paths) | Lines now | Notes |
|---|---|---|---|
| W0 EXTRACT (no behaviour change) | `WalkthroughAnnouncementPanel.tsx` (991); NEW `useWalkthroughSetup.ts` (about 120): the five persisted controls with their mount-effect restore, the course-list load, `selectedCourse`; `walkthrough-announcement.structure.test.ts` (692) | 991 | Moves `Panel:88-251` (about 165 lines incl. comments) out. Retarget the tests that read the panel for this block: the G6 trim test at `:441-478` (it asserts "exactly one STORAGE_KEY_COURSE read in the panel") and `:313-326`. FROZEN-ORACLE RULE (memory: refactors disarm tests): the moved tests must keep an independent literal expectation, not compare the new file to itself, and a sabotage run (delete `.trim()`) must go red in the new location. Panel ends about 830 |
| W1 LEAVES (pure) | NEW `walkthrough-run-decisions.ts` (about 90) + `.test.ts` (about 160): `shouldAutoDraft`, `isRunComplete`, `courseToAutoSelect`; `announcement-draft-slots.ts` (552) + `announcement-draft-slots.test.ts` (798): action `reset`; `useAnnouncementDraftSlots.ts` (526) + `.test.ts` (251): initial timing parameter, `reset` | 526 / 552 | The `reset` and timing parameter are exports whose CALLER is W2's panel edit; W1 must not ship alone (`traps-spec.md`: a leaf with no caller is dead with every gate green). Treat W1+W2 as one push |
| W2 WIRING | `WalkthroughAnnouncementPanel.tsx`, `useWalkthroughSetup.ts`, `useAnnouncementDraftSlots.ts`, the structure test | about 830 after W0 | Calls W1's three functions: the auto-draft effect after the drain effect at `Panel:489-501`; "Start a new run" state; course auto-select in the setup hook; `ta-rec-wta-timing` (F2) and, if F1 is (b), `ta-rec-wta-autodraft`, canary bumped. Security and reliability seats run here: a new automatic path to `draftWalkthroughAnnouncementAction` and `gatherWalkthroughResourcesAction`, and a once-per-stop ref whose stale state is a double-draft |
| W3 SURFACE | `AnnouncementCourseFieldset.tsx` (258): split into capture fieldset and format/options fieldset; `AnnouncementDraftSlot.tsx` (374): M6; `WalkthroughAnnouncementPanel.tsx`: the run row restructure; `walkthrough-announcement.structure.test.ts`, `walkthrough-announcement-timing.structure.test.ts` (339) | 258 / 374 | The A18 5.9 tests anchor INSIDE the fieldset file (`:529-632`); they move with the disclosure. The A32 REQ-A32-1 slice (`timing.structure.test.ts:138-146`) slices from `wta-post-consequence` to the next `</p>`, which survives the reorder if the notice stays one `<p>`; re-run it, do not assume. No new CSS if M6 uses `.adaptFieldGrid2` and `.adaptRow`; any new class must be referenced or `src/app/components/courses/page-module-css-orphan-classes.test.ts` goes red, and `docs/css-orphans.md` is being edited by in-flight work (section 9) |
| W4 REGRESSION + OWNER WALK | `docs/REGRESSION.md` (orchestrator-owned) | - | The orchestrator writes it; this scope writes no backlog or regression file |
| W5 ENTRY (only if F5 = yes; its own activity) | `ModulesView.tsx` (924), `modules/GenerateFromSelectionSection.tsx` (not measured), `recording-launch.ts` (349 per the sibling scope, not re-measured) + `.test.ts`, the panel | 924 | `ModulesView.tsx` has 76 lines free and the memory file `modulesview-at-ceiling.md` records an extraction that grew it; size against THIS wave's additions. The panel consumer needs the W0 headroom |

`componentStorageKeys.structure.test.ts` scans top-level `src/app/components/*.tsx`
non-recursively for any `ta-` string (per the sibling scope, not re-opened by me); this
scope writes no such file, and `RecordingTab.tsx` is NOT in any write set.

Each wave ends with its own gates and a `git status --short` check against its list.
Multi-file test runs use `npm run test:paths <p1> <p2> ...`, never a raw multi-path
vitest. `npx tsc --noEmit` has one caller at a time.

---

## 8. OPEN FORKS (each shaped so every answer terminates the activity)

I have acted on my recommended reading in the wave plan and recorded it as MY reading,
not an owner ruling. Nothing is built; the plan is paper.

F1. AUTO-DRAFT ON STOP. Terminating: (a) no, keep the Generate click (W1 drops
`shouldAutoDraft`; P1 stays 5); (b) a persisted toggle, default OFF (`ta-rec-wta-autodraft`,
canary +1; saves 1 click only for instructors who turn it on); (c) a persisted toggle,
default ON. RECOMMENDED: (c). A draft is non-destructive, Generate never overwrites a
drafted slot, nothing posts without the unchanged two-click guard, and the cost if
wrong is one wasted LLM call per stop. Rework if you pick (a) after build: one effect
and one leaf, about 60 lines.

F2. PERSIST "WRITTEN FOR". Terminating: (yes) `ta-rec-wta-timing`, mount-effect
restore, canary bump, P2 7 to 5; (no) status quo, a midweek instructor pays 2 clicks
each run. RECOMMENDED: yes. It reverses a seat-level decision (`docs/a19-scope.md`
section 4.1), not an owner one; I searched `docs/owner-decisions-2026-09-23.md` and
`-09-27.md` and none bears on timing persistence. The schedule time stays unpersisted
either way.

F3. SINGLE-COURSE AUTO-SELECT. Terminating: (yes) M5; (no) status quo. RECOMMENDED: yes
(2 clicks, once, only for a one-course instructor; costs one pure function). If you
mostly have several courses, answer no and the saving is nil.

F4. SECOND RUN IN ONE PAGE SESSION. Terminating: (a) leave it, the reload stays the
reset; (b) a "Start a new run" control (arm then confirm), no automatic reset;
(c) (b) plus an automatic fresh run when every drafted slot is already posted.
RECOMMENDED: (c). (a) leaves a correctness hazard (last week's frames feeding this
week's draft) that I am reporting rather than deciding.

F5. MODULES ENTRY. Terminating: (yes) W5 as its own activity, sequenced after W3;
(no) dropped, recorded as a residual. RECOMMENDED: yes, last. Largest single saving for
an instructor who starts from Modules (arrival 1 to 3, course 2, module typing), but it
is the only item touching a file at its ceiling.

F6. NOTES ABOVE OR BELOW START. Terminating: (above) keep Notes in the capture
fieldset because extraction reads it (`Panel:459-464`), about +70 px before Start;
(below) move it to the options fieldset, Start about 70 px higher, and notes typed after
Start only affect later batches. RECOMMENDED: above.

---

## 9. COLLISIONS

- `src/lib/walkthrough-announcement-link-guard.ts` (211 lines): NOT in any write set.
  Last commit `df881d49` `[MEASURED git log -1 -- <file>]`; `git diff --stat HEAD --`
  on it is empty. It is shared with the take route; nothing here needs it. If a wave
  later finds it must change, that is a new finding for the orchestrator, not a quiet
  edit.
- `src/app/actions/walkthrough-announcement.ts` (609): not written. No server action
  changes; the auto-draft only calls existing actions.
- `src/app/components/RecordingTab.tsx` (909, 91 free): the walkthrough panel mounts
  through it at `:879-881` but NO wave writes it, so the discussion W-B and sibling
  waves are not blocked by this scope. (F5's launch handling is in this panel, and
  `recording-launch.ts` already validates `walkannounce`, `recording-launch.ts:67,82`.)
- `git status --short` at authoring `[MEASURED]`: modified `docs/a29-acceptance-criteria.md`,
  `docs/a29-architecture.md`, `docs/css-orphans.md`, `src/app/actions/bulk-course-message.test.ts`,
  `src/app/actions/bulk-course-message.ts`, `src/app/components/CanvasTab.tsx`; untracked
  `docs/loop-retro-roles-acceptance-criteria.md`, `src/app/components/bulk-course-message/`.
  Exact-path intersection of this scope's full write set (W0 to W5 plus this doc) with
  that list, `sort mine inflight | uniq -d`, is EMPTY; the canary (the write set
  against itself) is non-empty, so the instrument can see an overlap. One non-path
  overlap to watch: `docs/css-orphans.md` is being edited by someone else and W3 may
  need a new CSS class; if it does, sequence W3's CSS after that edit lands.
- The sibling Discussion scope's W-A (course seed) READS `ta-rec-wta-course` as a
  source (`discussion-recording-setup-clicks-scope.md` section 2.4). M5 and W0 keep
  that key name, value domain and write behaviour unchanged, so it is not disturbed;
  F3's auto-select writes the same key the same way a user choice does.
- Shared resources no file list shows: `npx tsc --noEmit` has one caller; no two
  agents sabotage on the tree at once; `docs/BACKLOG.md` belongs to the orchestrator.

---

## 10. RESIDUAL REGISTER

| ID | What is not proven now | Owner | Instrument | Step that measures it |
|---|---|---|---|---|
| R-1 | H1: after a reload, do course, module and notes visibly restore (they use a lazy `useState` initializer in an SSR'd client component, `Panel:169-207`, against the panel's own warning at `:209-216`)? | repo owner | a real browser: set course, module, notes, reload, look | before W0 is dispatched; under a minute; if it fails, a mount-effect restore for those three is the FIRST item and is already inside W0's `useWalkthroughSetup.ts` |
| R-2 | H2: does the course select show blank until `listCourseHubAction` returns (`Panel:136,150-154`)? | repo owner | same reload, watch the select | same check |
| R-3 | The absolute pixel stack of section 3 and every `[ESTIMATE]` | repo owner | the section 3.4 snippet on HEAD at 1280 x 720 | before W3 (sets M_now for AC-1 and AC-8) |
| R-4 | The browser share picker's click count (AC-17) | repo owner | count clicks in Chrome | only if the owner still feels setup is slow after W3 |
| R-5 | The felt count and the three hops (AC-13) | repo owner | owner count plus 3.4 on a fresh and a returning profile | the Verify step after W3 |
| R-6 | O1: a second post of the same text is two clicks with no "already posted" lock | orchestrator (files a backlog row) | read `Slot:342-359` and the reducer `post-result` case | next backlog reconcile |
| R-7 | O2: an unposted drafted or edited announcement is lost on reload; beforeunload covers capture only (`Panel:522-530`) | orchestrator (files a backlog row) | same | next backlog reconcile |
| R-8 | Whether a live Modules selection's `courseUrl` equals a loaded course's `canvasUrl` (M9) | the W5 architect pass | open `ModulesView.tsx:431-445` and `listCourseHubAction`'s shape and compare | W5, only if F5 = yes |
| R-9 | G3 (exemplar Remove) and G7 and G6 have no enforcing test I could name | the test seat | `grep -rn` for `Confirm remove` and `beforeunload` in `*.test.ts`, paired with a canary | the test-notes step for this item |
| R-10 | Click cost of the native `datetime-local` picker (P3) | repo owner | count in Chrome | with R-5 |
| R-11 | Whether auto-draft (F1 c) surprises an instructor who stops the capture only to pause | repo owner | use it for two weeks | after W2 ships |

Disposition table: not applicable. This is the first version of this scope, not a
restructure of a prior one.

---

## 11. What I opened, so a checker can re-walk it

`docs/DEV_LOOP.md`, `docs/loop/seats.md` (`:1-240`), `docs/loop/traps-spec.md`,
`docs/discussion-recording-setup-clicks-scope.md` (whole, for the click convention and
the arrival rows), `WalkthroughAnnouncementPanel.tsx` (whole),
`AnnouncementCourseFieldset.tsx` (whole), `AnnouncementDraftSlot.tsx` (whole),
`useAnnouncementDraftSlots.ts` (whole), `announcement-draft-slots.ts`
(`:1-135`, `:196-552`), `RecordingTab.tsx` (`:40-170`, `:560-660`, `:855-885`),
`recording-launch.ts` (whole), `ConfirmArmButtons.tsx` (`:30-118`),
`useDiscussionCapture.ts` (`:395-470`), `walkthrough-announcement.structure.test.ts`
(headings `:1-692`, bodies `:100-126`), `walkthrough-announcement-timing.structure.test.ts`
(`:125-160`), `ModulesView.tsx` (`:415-450`), `ModuleDeckCapturePanel.tsx` (`:255-270`
by grep), `RecordingControls.module.css` and `page.module.css` (the named class
bodies), `globals.css` (tokens), `docs/a19-scope.md` (`:400-450`),
`docs/owner-decisions-2026-09-23.md` (`:138-170`), `AiChatFab.tsx` (`:438-446`),
`FabQuickActionsMenu.tsx` (`:155-170`).

Not opened and therefore not claimed: `useAnnouncementDraftSlots.test.ts` and
`announcement-draft-slots.test.ts` bodies (so "enforcer" cells for G2 and G7 are
`[UNDETERMINED]` where marked), `walkthrough-announcement.ts` beyond its header, the
`TabShell` heights, `useAppNavigation.ts` (the 0-click restore is the sibling scope's
reading), `GenerateFromSelectionSection.tsx` beyond `:269-277`, `useDiscussionCapture.ts`
beyond the start path, the browser share picker, any rendered pixel.
