# User experience: the Grading chat surface

Seat: User experience (`loop-seat`), wave 3. Consumes
`docs/grading-chat-acceptance-criteria.md` (AC-1..17, AC-L),
`docs/grading-chat-architecture.md` (wave 1, R1-R4 decisions, the seams, the
mount, the storage table in section 12), and its check
`docs/grading-chat-architecture-check.md` (SOUND ENOUGH, one BLOCKER on
`pointsPossible` not yet folded into the architecture doc I read - see section
7 and the residual register).

Visual/aesthetic and Accessibility are separate wave-3 seats. I cover the
keyboard/copy story that is genuinely mine (`seats.md` "User experience");
every claim about actual rendered look, spacing, colour, or screen-reader
behaviour is marked **OWNER-WALK** below and left to those seats and the
owner, because **no component is rendered by any test in this repo**
(`docs/loop/this-repo.md`) - I did not invent a proxy for that ceiling.

## 0. Instruments - every quantity names its command

| Quantity | Instrument |
|---|---|
| Click counts (section 1) | Enumerated by hand against the design proposed in section 2/3, walking the exact controls that design specifies. This is **NOT owner-walk-verified** (nothing renders) - it is a re-countable enumeration, listed step by step so the checker can re-walk it, per `seats.md`'s own instruction ("Is the click count real, or asserted? Re-walk it against the proposed layout."). |
| Existing whole-run click count / row-replacement behaviour | `Read` of `src/app/components/GradingTab.tsx` and `src/app/components/grading/useIncrementalGradingRun.ts` at the cited lines, on the tree as checked out now (no separate commit pinned - `git status --short` at the end of this document is the tree state). |
| Keyboard-collision sweep | `Grep` for `window.addEventListener("keydown"` / `document.addEventListener("keydown"` across `src`, every hit opened and its gate read. |
| `slotProps` precedent | `Grep` for `slotProps` and `htmlInput` across `src`, plus the two documents that already state the rule (`docs/snapshot-grading-acceptance-criteria.md:612-613`, `docs/REGRESSION.md:39567`). |
| House layout classes | `Grep` for `adaptRow`/`ghActions` definitions in `src/app/page.module.css`, each opened to read its stated purpose. |
| Refusal/copy wording | `Read` of `src/lib/grade/run-header.ts`, `src/lib/grade/collisionRefusal.ts`, `src/lib/grade/single-file-entry.ts`, `src/app/actions/grading-incremental.ts`, `src/lib/upload-budget.ts`, `src/app/components/grading/runProgressCopy.ts`. |
| `ta-` key precedent | `Grep` for `ta-grading` in `src/app/components/GradingTab.tsx`. |
| docs gate | `npm run docs:gate` |

All `file:line` citations below were opened at that line on the tree as
checked out; none is recalled from the architecture doc without re-reading
the underlying source.

---

## 1. The flow, click by click, counted

### 1.1 The composer design this count assumes (stated so it is re-walkable)

Architecture (`docs/grading-chat-architecture.md` section 2.4, `ChatSubmissionInput`
section 3.1) left the composer's exact interaction model undecided - this is
mine to design (RES-GC-2 names the composer copy/layout as a UX-seat
obligation). The count below assumes this design, which section 3 states in
full:

- A mode toggle (text / file / url) using `SegmentedToggle`
  (`src/app/components/ui/SegmentedToggle.tsx:74-151` - the house component for
  exactly this shape, roving tabindex, native `<button>`s, `role="group"`),
  default `"text"`, persisted under `ta-grading-chat-input-mode`.
- Text mode: one multiline `TextField`, Enter-without-Shift sends, Shift+Enter
  inserts a newline, wired through `slotProps.input` exactly as
  `AiChatWindow.tsx:575-578` already does for its own composer. A `Send`
  `IconButton`, disabled when the field is empty or a session is not `ready`.
- File mode: an `Attach` `IconButton` opens a hidden `<input type="file">`
  (the exact hidden-input pattern at `AiChatWindow.tsx:544-550`); **selecting a
  file dispatches immediately** (no separate Send click) - my recommendation,
  named as a decision with its tradeoff in section 3.4.
- URL mode: one single-line `TextField` (`type="url"`), Enter submits via the
  existing `submitOnEnter` helper (`src/app/components/ui/submitOnEnter.ts:6-13`),
  applied the same way `GradingTab.tsx:393` already applies it to its own
  Canvas-URL field (top-level `onKeyDown`, not inside any `slotProps` - see
  section 3.2 for why that is a *different*, already-working path from the
  `slotProps.input` one text mode uses), plus an explicit `Add` button beside
  it, mirroring the existing `Retrieve from Canvas` button
  (`GradingTab.tsx:395-403`).
- **New requirement this design adds, not inherited free:** the Send button's
  own `onClick` must call `.focus()` back onto the composer field after
  clearing it. `AiChatWindow.tsx`'s `handleSend` (`:232-244`) does **not** do
  this - only its separate `resendMessage` helper does
  (`inputRef.current?.focus()`, `:535`). Pressing Enter naturally keeps focus
  on the field (no element takes focus on a keypress), but clicking the Send
  `IconButton` moves focus to that button, and without an explicit refocus the
  next paste would need an extra click back into the field. This is called
  out explicitly because it is exactly the kind of thing a click count can
  silently assume away.

### 1.2 First use: set instructions + rubric, submit student 1 (text paste)

Starting from the Tools tab already open (navigation cost is identical for
both surfaces being compared, so it is listed but does not change the
comparison):

| # | Click | Target |
|---|---|---|
| 1 | Click | "Grading" destination chip (existing `Grading` group, `manual-rail.ts:114-122`) |
| 2 | Click | "Chat" inner-nav destination (the new 6th entry, section 2) |
| 3 | Click | Into the Instructions textarea, then paste |
| 4 | Click | Into the Rubric textarea, then paste |
| 5 | Click | Into the composer text field (mode already defaults to `text`), then paste student 1's submission |
| 6 | Click | `Send` |

**6 clicks** to dispatch student 1's grading (paste actions themselves are not
counted as clicks, consistent with how `Start Review` is not preceded by a
counted "click to focus" step in the existing flow's own convention).

### 1.3 First use, existing whole-run surface (single-file path, the fairest comparison)

The zip surface's own A39 single-file path (`GradingTab.tsx:362-375`,
`classifyGradingUpload`, `single-file-entry.ts:36`) is the closest existing
analog - one file in, one student out, no archive required:

| # | Click | Target |
|---|---|---|
| 1 | Click | "Grading" destination chip |
| 2 | Click | "Submissions" inner-nav destination (`grading-run`) |
| 3 | Click | The file input (`GradingTab.tsx:367`), opening the OS picker |
| 4 | Click | Pick the file in the OS dialog |
| 5 | Click | Into Assignment Instructions, then paste (`:428-439`) |
| 6 | Click | Into Rubric, then paste (`:445-456`) |
| 7 | Click | `Start Review` (`:481-495`) |

**7 clicks.** So on a strict click count, first use is roughly even (6 vs 7) -
**the first-use comparison is not where this surface's advantage is**, and I
am not claiming it is. Section 1.4 is.

### 1.4 Repeat use: submit student N (the number that matters for "continuously submit")

**Chat surface, text mode, session already begun (instructions/rubric set,
student 1 already graded):**

| # | Click | Target |
|---|---|---|
| 1 | Click | `Send` (the composer field already holds focus if the previous submission was sent via Enter; if the previous submission was sent via the `Send` button, the explicit refocus in 1.1 is what keeps this at 1 click rather than 2) |

**1 click** (paste is not a click; pressing Enter instead of clicking Send
makes it **0 clicks**, 1 keypress). This is the number the AC-17/A39 "a rubric
pasted once should never be pasted again" remedy is actually for.

**Chat surface, file mode, repeat:** open the file picker (1) + pick in the OS
dialog (1) = **2 clicks** (no Send click, per the auto-submit-on-pick design
in 1.1/3.4).

**Existing whole-run surface, repeat (a second single-file submission):**

| # | Click | Target |
|---|---|---|
| 1 | Click | The file input again |
| 2 | Click | Pick the new file in the OS dialog |
| 3 | Click | `Start Review` again |

**3 clicks** - and this is where the comparison stops being about clicks at
all. `useIncrementalGradingRun.ts:240-244` resets `incrementalRun`,
`incrementalResults`, `incrementalDone` and `incrementalTotal` to
empty/zero/null at the **top of every `startReview` call**, before the new
plan is even built. `selectDisplayRun` (`incrementalRunPlan.ts:280-286`)
shows the whole-run object only while `phase === "idle"`; every other phase
shows `incrementalRun`, which is the object that call just reset. **A second
single-file submission on the existing surface does not add a row - it
replaces the table.** Student 1's row is gone from the screen the moment
student 2's run starts (the instructor must copy/post it first, or lose sight
of it). AC-7's "a row never moves, it only appears"
(`incrementalRunPlan.ts:172`, RULING 30) holds *within* one run; it says
nothing about what happens *across* two separate `startReview` calls, because
the existing surface has no concept of one growing run across multiple
submissions - that concept is what this feature adds for the first time
(architecture section 1's "one shape decision that governs everything").

**This is the concrete leverage the click count alone understates:** repeat
use on the chat surface is cheaper (1 click vs 3) **and** every prior row
stays visible (0 rows lost vs all of them), because the chat surface's driver
appends to one growing `GradingRun` across the whole session
(`mergeArrivedResults`, sourceIndex-keyed, append-safe by construction -
architecture section 2.2) instead of starting a fresh run per submission.

### 1.5 What this count does not establish (named plainly)

- The felt/wall-clock latency advantage (AC-L's user-visible half, R6 in the
  AC) is **not** something a click count measures, and I am not claiming it
  does. It is a `docs/BACKLOG.md` residual (R6) owned by an owner browser
  walk, not this document.
- I did not walk file mode's or URL mode's first-use count in the same table
  detail as text mode - the mode-toggle click (1, first time only, since the
  mode is persisted afterward) is the only structural difference; I state it
  here rather than triple the tables: first use in file mode is nav(2) +
  instructions(1) + rubric(1) + mode-toggle(1, first time only) + file-picker
  open+pick(2) = **7 clicks**, one more than text mode's 6, because file
  selection has no zero-click Enter-equivalent.

---

## 2. Panel layout, in DOM order

Architecture did not fix a DOM order beyond "three input panels + a results
table, always-mounted" (section 7). This is mine to decide (RES-GC-2).

**Recommended DOM order: Instructions panel -> Rubric panel -> Results table
-> Composer.** The composer is LAST in DOM, not first, so it sits nearest the
bottom of the surface and the results table is what a new row visibly
*joins* - "a submission composer that stays put while results stream into the
table above it" is exactly this order (the owner's own framing in the seat
brief, which the instructions/rubric-first placement satisfies: they read as
the session's "system config," set once, above a growing "conversation" of
one row per submission, with the composer anchored at the point new turns
enter). This is the closest reading of "mimic the look and feel of an llm
chat" that does not require inventing a new visual affordance nothing here
can render - it is a DOM-order and reuse claim, not a pixel claim.

**Which existing classes each region reuses, and why (per the seat brief's
explicit warning against reinventing inline flex):**

| Region | Class | Why this one, not another |
|---|---|---|
| Instructions field, Rubric field | `styles.field` wrapping a `<label>` + `TextField`, inside `styles.form` | Byte-for-byte the pattern `GradingTab.tsx:280,426-440,443-461` already uses for the identical pair of fields on the existing surface - this is the SAME data (AC-2), so it should look like the same kind of field, not a new one. |
| Mode toggle + Attach button (file mode) row | `styles.ghActions` (`page.module.css:1574-1579`: "display: flex; gap; align-items: center; flex-wrap: wrap; flex: none") | This is a row of discrete controls (a toggle, a button), not form inputs that need to bottom-align against a growing multiline field - `.ghActions` is the house pattern for exactly a control/button row (referenced 100 times per `seats.md`'s own measurement), and using it here is a **direct reuse of an existing named class**, not a new inline `display:flex`. |
| The text/url input + Send button row | `styles.adaptRow` (`page.module.css:890-895`: "A horizontal, wrapping row of inputs that bottom-align") | The composer's own doc comment at that class describes exactly this shape: an input that may grow (the multiline text field, `maxRows`-capped) sitting beside a button that must stay bottom-aligned as it grows. This is a closer fit than `.ghActions` for THIS one row specifically, and is why the composer needs both classes on two different rows rather than one class for the whole composer. |
| Results table | Reused `GradingResults` component unchanged (`src/app/components/GradingResults.tsx:552` `<section className={styles.results}>`, `:626` `<table className={styles.matrix}>`), fed the same `buildIncrementalRun` -> `GradingRun` object the existing incremental route already produces (architecture section 6) | Not a new table - the same component, same classes, same per-row `RowFeedbackBoxes` (`RowFeedbackBoxes.tsx:85-157`) the existing surface already ships. AC-12/AC-13 are explicit that this must not be a parallel shape. |

**What "chat-like" concretely means here, stated so it cannot be read as more
than it is:** a submission composer that does not move or reset as rows
arrive (the always-mounted host, architecture section 7, holds the driver's
state across navigation; within the panel itself, the composer is the last
DOM child and its own local state - the input mode, the pending text - is
unaffected by a new row appearing above it), and a results table that only
ever grows (never replaces) for the length of one session. It does **not**
mean bubble-styled messages, an avatar, or a transcript of the instructor's
own submissions rendered as "sent" chat bubbles - nothing in the AC or the
architecture asks for that, and inventing it here would be scope creep this
seat is not asked to author. **The actual rendered look - spacing, colour,
whether the results table reads visually as "chat-like" to a person looking
at it - is OWNER-WALK (OW-GC-1 in the architecture's own owner-walk list,
`docs/grading-chat-architecture.md` section 14). Nothing here renders under
vitest, so I am not asserting it looks right; I am only asserting which
existing classes and components are reused instead of reinvented, which is
checkable by reading the CSS/component source, not by looking at a screen.**

---

## 3. Control types and the keyboard story

### 3.1 The three persisted controls (AC-15/RES-GC-2/architecture section 12)

| Control | Type | `ta-` key |
|---|---|---|
| Instructions | multiline `TextField` | `ta-grading-chat-instructions` |
| Rubric | multiline `TextField` | `ta-grading-chat-rubric` |
| Composer input mode | `SegmentedToggle<"text"\|"file"\|"url">` | `ta-grading-chat-input-mode` |

These three are exactly architecture section 12's table, and exactly the set
AC-15 requires - I did not find a fourth persisted control to add, and I did
not find a reason to drop one of these three. The optional per-submission
label field (section 3.3 below) and the composer's own draft text are
correctly left ephemeral per architecture section 12 ("Optional label draft:
NO, ephemeral" and the submission stream itself is in-memory, not
localStorage, because it can carry base64 file content - "images are large").
**Confirmed complete against the controls I am proposing** (section 3.3's
optional label is the only new control this document adds beyond
architecture's three, and it is deliberately NOT on this list).

### 3.2 The `slotProps.input` vs `slotProps.htmlInput` rule, applied

The rule is already stated twice in this repo and both times traced to the
same InputBase spread-order hazard:

> `slotProps={{ input: { onKeyDown: submitOnEnter(handleGrade) }, htmlInput: { "aria-label": "Student name" } }}`.
> Handlers in `input`, ARIA in `htmlInput`. `onKeyDown` placed in `htmlInput`
> [would be silently overridden].
> - `docs/snapshot-grading-acceptance-criteria.md:612-613`

> onKeyDown in htmlInput would SILENTLY OVERRIDE the existing handler (InputBase
> spreads inputProps after ...
> - `docs/REGRESSION.md:39567`

The already-shipped precedent that does this correctly is
`AiChatWindow.tsx:575-596`: `onKeyDown`/`onKeyUp`/`onPaste` live in
`slotProps.input`; `role`/`aria-*`/`onClick`/`onSelect` live in
`slotProps.htmlInput`, and the file's own comment states the reason
(`:309-311,576-578`). **The chat composer's text-mode field must follow this
exact split**: `onKeyDown` (Enter-sends, Shift+Enter-newline) in
`slotProps.input`; if the composer ever needs an ARIA attribute on the raw
`<textarea>` (it does not need one beyond a plain `aria-label`, which any
`slotProps.htmlInput` value is safe for), that goes in `slotProps.htmlInput`
and must never carry a second `onKeyDown`.

**A second, already-working pattern exists for a single-line field and is not
the same rule**: `GradingTab.tsx:393`'s Canvas-URL field passes `onKeyDown` as
a **top-level** `TextField` prop (`onKeyDown={submitOnEnter(handleRetrieveCanvas)}`),
not inside any `slotProps` at all - this already ships and already works
for a single-line, non-multiline `TextField`. The composer's URL-mode field
should copy this exact precedent (top-level `onKeyDown`), not the multiline
composer's `slotProps.input` pattern, since they are different TextField
shapes with different working conventions already proven in this tree. Do
not "fix" the URL field by moving its `onKeyDown` into `slotProps.input` -
that would be changing a working pattern to match one that also works, for no
reason, and is exactly the kind of unforced change a checker should flag.

### 3.3 The optional per-submission label

A composer field labelled "Label (optional)" - a single-line `TextField`
beside or above the main input, ephemeral (not persisted, matches
architecture section 12's explicit call). Its purpose: `buildTextEntry`'s
label defaulter (architecture section 3.5) names an unlabelled text
submission `Submission ${ordinal}` - a real but weak per-row identifier once
several submissions are on screen (RowFeedbackBoxes' accessible names are
built from `student`, `RowFeedbackBoxes.tsx:96,109,120-127` - "Submission 3"
is a valid but unhelpful accessible name for a screen-reader user with many
rows open). This field is a recommendation, not a blocker - the surface is
fully dispatchable without it (architecture section 3.5's own statement).

### 3.4 File-mode auto-submit: the tradeoff, named

Section 1.1 recommends dispatching a file submission the instant it is
picked, with no separate Send click. The cost: the instructor loses a moment
to reconsider or add a label before the entry is sent (a mis-click on the
wrong file dispatches immediately, whereas a Send-gated design would let them
back out). The benefit: 1 fewer click per repeat file submission, and no
"how do I add a label to a file" friction, since there is no time to type one
before dispatch anyway. **This is a genuine judgment call, not a settled
fact** - if the owner/reliability seat prefers a cancel window, the fix is
additive (a brief "Sending..." state with an Undo affordance before the
actual dispatch fires), not a redesign.

### 3.5 Keyboard-collision sweep (every `window`/`document`-level `keydown` handler in `src`)

Every hit from `Grep "window.addEventListener(\"keydown\"|document.addEventListener(\"keydown\""`
across `src`, opened and its gate read:

| File:line | Keys handled | Gate | Can it fire while the composer/instructions/rubric field is focused? |
|---|---|---|---|
| `src/app/components/recording/useRecorder.ts:895` (handler at `:880-894`) | `r`/`p`/`m` | `if (!active) return;` (`:881`) then `if (t.closest("input, textarea, select, [contenteditable]")) return;` (`:882-883`). `active` traces to `recordSurfaceActive` (`RecordingTab.tsx:296-302`), true only while the Recording sub-view is the active manual view. | No. Double-gated: the Recording view and Grading > Chat are mutually exclusive manual views, AND every focused control on this surface is an `input`/`textarea`, which the handler explicitly excludes even if it somehow fired. |
| `src/app/components/snapshot-grading/useSnapshotKeyboardShortcuts.ts:121` (wired at `:121-122`) | Snapshot-grading chord shortcuts | "Guard 1: `activeRef.current` - this panel is the visible sub-tab" (`:37-38`) | No. Snapshot grading is a different, mutually exclusive `GradingView` member from `chat`. |
| `src/app/components/tasks/useColumnDrag.ts:176` | Column-drag cancel (Tasks grid) | Only wired during an active column-drag on the Tasks grid, an unrelated top-level tab. | No. |
| `src/app/components/TopBar.tsx:368` (`SettingsMenu`, `:359-373`) | `Escape` only (`:364-366`) | `useEffect` gated on `open` (`:373` dependency, `if (!open) return` pattern), the settings popover's own open state. | Only `Escape` closes the settings popover if it happens to be open at the same time - it does not intercept typing, and Escape is not a key the composer's own Enter-to-send logic reads, so there is no conflicting *action*, only the pre-existing, expected "Escape closes whatever overlay is open" behaviour every text field in this app already lives with. |
| `src/app/components/SelectionChatWidget.tsx:87` (handler at `:73-82`) | `Escape` only | Wired for the lifetime of the widget; closes its own floating chat if open. | Same as above - Escape-only, pre-existing, not a new interaction this feature introduces or must design around. |
| `src/app/components/ui/useModalDismiss.ts:411` (near `:395-413`) | `Escape`/Tab-trap, for whichever modal is open | Gated on `open`/`modalId` (`:413` dependency array) - the generic modal-dismiss hook used across the app. | Only relevant if the chat surface opens a modal that uses this hook (e.g. a reused `FilePreviewModal` for a submitted file's preview) - in which case Tab-trapping inside that modal while it is open is the CORRECT, expected behaviour, not a collision with the composer underneath it. |

**Conclusion: no key-binding collision exists between this surface and any
existing global handler.** The only two that are not view-gated
(`TopBar.tsx`'s settings menu and `SelectionChatWidget.tsx`) are Escape-only
and already apply identically to every text field in the app today - this
feature introduces no new exposure. This is a reading claim (grep + the gate
each handler states in its own code), not a live keyboard test - nothing here
renders, so I did not press a key in a browser; I read what each handler's
condition is and traced it to the view model.

---

## 4. User-facing copy, by state - exact strings, no emojis

Every string below either quotes an EXISTING refusal/copy string this
surface must reuse verbatim (cited), or is new copy written to match this
app's already-observed voice (short declarative sentences, a stated reason,
no exclamation points, no emoji - matching `GradingTab.tsx`'s own copy
throughout).

### 4.1 Before any submission (empty state)

- Results table area, before `beginSession` has ever resolved and before any
  submission: **"Set instructions and a rubric above, then drop in your
  first submission below."** (New copy; matches the declarative, imperative
  voice of `GradingTab.tsx:373`'s own file-field hint.)
- If the instructor tries to submit before instructions are set: reuse the
  EXISTING refusal, byte-identical - **"Please provide assignment
  instructions."** (`run-header.ts:39`, already reused byte-identical by
  `grading-incremental.ts:92` - the chat surface's `beginSession` must
  surface this exact string, per architecture section 4, not a paraphrase.)

### 4.2 While a submission grades (loading, partial)

- Per-row loading (a dispatched entry with no result yet): a lightweight
  per-row placeholder, not a page-level spinner - since submissions arrive
  continuously, a single "Grading in progress" banner for the whole surface
  would be misleading the moment a second submission starts while the first
  is still running (AC-6). Recommended text for that placeholder row:
  **"Grading..."** (short, matches `GradingTab.tsx:490`'s own button copy
  during a run, `Grading…` - reuse the same word, not a longer sentence,
  since it repeats per row).
- Whole-surface status line (visible while at least one submission is
  in-flight), reusing the existing progress-copy convention
  (`runProgressCopy.ts:19-32`'s `describeRunProgress`, which already has a
  `running` phase string `"${done} of ${total} submissions graded."`): for a
  continuous session with no fixed total, the corresponding line is
  **"${completedCount} of ${dispatchedCount} submitted this session graded."**
  - phrased against `dispatchedCount` (what has been submitted SO FAR, a
  number that itself grows), not a fixed `total`, because architecture
  section 5.1 confirms there is no fixed total for this surface. This is new
  copy, not a reuse of `describeRunProgress` itself (that function's `total`
  parameter assumes a closed set - reusing it here would misrepresent a
  growing session as one with a known size), but it is written in the exact
  same "N of M ... graded" register that function already established.

### 4.3 When some rows are in and more are coming (the defining chat-cadence state)

No special copy needed beyond the status line in 4.2 - the results table
simply has rows, and the status line's `dispatchedCount` denominator keeps
climbing as more are entered. This is deliberate: per AC-6/AC-L, the whole
point is that this state is not an edge case needing its own banner, it is
the surface's NORMAL operating state for the length of a session.

### 4.4 Refusals (each with its exact reused wording, and where it is new)

| Refusal | Copy | Source |
|---|---|---|
| Blank instructions | **"Please provide assignment instructions."** | Reused verbatim, `run-header.ts:39` |
| Zip collision (two files resolve to the same student) | **"Refused: N files resolve to the same student name "X", ..."** (exact template) | Reused verbatim, `collisionRefusal.ts:128`, tested at `collisionRefusal.test.ts:165,180` |
| Unsupported file extension | New copy, matching the existing "please upload a..." register: **"This file type isn't supported for grading. Upload a text file, document, image, or a zip archive."** (No existing string names this exact case for a single-file drop outside a zip - `single-file-entry.ts:36-45`'s `classifyGradingUpload` returns `"unsupported"` with no accompanying message of its own; this is new copy for a case the existing surface never had to word, because a single unsupported upload there just falls through the zip path's "Nothing to grade was found" message, `grading-incremental.ts:138`, which is the WRONG message for this surface - a truly empty zip and an unsupported single file are different problems and should not share a sentence.) |
| Oversized submission (over the 3.5MB wire budget) | Reuse the EXISTING wire-budget message shape - **"This submission is too large to upload in one request (X MB, limit 3.5MB)."** (`upload-budget.ts:88-93`'s `checkWireBudget`, quoting the FILE-size number the user can check against their own file, per that function's own doc comment `:79-81`) rather than the existing incremental route's blunter **"One submission is too large to grade incrementally."** (`grading-incremental.ts:150`) - the chat surface has no whole-run fallback to route an oversized entry TO (do-not-reuse, architecture section 6), so the message should tell the instructor the actual number, not just that it failed. |
| Arbitrary (non-Canvas, non-GitHub) URL | Reuse architecture's own proposed wording verbatim, since it is already precise and additive-safe (R3): **"This surface accepts Canvas assignment/discussion URLs and GitHub repo URLs. Arbitrary web URLs are not supported yet."** (`docs/grading-chat-architecture.md` section 3.3's own table, "not built this pass" row) |
| Session ceiling reached | Reuse architecture's own proposed wording (section 5.3), with the number substituted: **"This session has reached its 40-submission limit. Start a new session to grade more."** - **flagged, not endorsed as final**: the architecture checker's own RESIDUAL-1 (`docs/grading-chat-architecture-check.md:211-225`) names this as "the single choice most likely to ship green and disappoint" - a single Canvas URL or zip that expands past 40 entries on ONE drop refuses the WHOLE class with this exact sentence, after the fetch/extraction cost was already paid. I did not change the mechanism (that is R4/RES-GC-5's call, owner + reliability), but the copy should at minimum tell the instructor how many were about to be added versus how many the limit allows, e.g. **"This submission would add 47 entries, but this session has a 40-submission limit and has already used 0. Start a new session, or reduce what you're submitting."** - a strictly more informative version of the same refusal, not a mechanism change. |

### 4.5 Copy audit against the no-emoji rule

Every string above was written and re-read for emoji/pictographic characters;
none is present. The authoritative check remains `src/lib/no-emojis.test.ts`
(run via `npm run docs:gate`, section 8) - I am not asserting my own reading
is a substitute for that gate, only that I did not knowingly introduce one.

---

## 5. Persistence audit against AC-15

Every control this document introduces beyond architecture's own three (the
optional label field, section 3.3) is explicitly **ephemeral by design**, and
I checked that decision against the two failure modes AC-15 warns about (a
control silently not persisted; a "persisted" claim with no named key):

- Instructions, Rubric, input mode: all three named with their exact `ta-`
  key in section 3.1, matching architecture section 12's table exactly. I did
  not find a fourth control needing a key.
- Optional label field: deliberately NOT given a `ta-` key - it is
  per-submission, transient, and section 12 of the architecture already rules
  this correctly (persisting it would carry a stale label into the NEXT
  submission's default, which is a worse default than a fresh
  `Submission N` each time).
- The reload-safe idiom (`useState(() => typeof window === "undefined" ? ... )`
  lazy initializer, `GradingTab.tsx:109-113`'s own pattern, cited by
  architecture section 12) applies to all three persisted controls; I did not
  find a reason to deviate from it for any of them.
- **The reload round-trip itself is OWNER-WALK** (OW-GC-5 in the
  architecture's owner-walk list) - nothing here renders, so I cannot verify
  a reload actually restores the value; I verified only that each control
  NAMES its key, which is the testable half AC-15 itself carves out.

---

## 6. The three places this design would mislead the user, ranked

1. **WORST: the session ceiling's copy (section 4.4's last row) reads as a
   per-item problem when it is actually a whole-class refusal.** An
   instructor who pastes one Canvas URL for a 45-student class and reads "This
   session has reached its 40-submission limit" (architecture's own proposed
   wording) will reasonably think 40 students graded and 5 didn't - not that
   ZERO were graded and the whole class was refused before any grading
   started, because a single multi-entry submission event is refused as a
   whole (RES-GC-5/RESIDUAL-1, architecture check). This is the worst of the
   three because it actively contradicts the instructor's most reasonable
   reading of the sentence, for the single most common bulk case (a Canvas
   URL for a real class), and because the fetch/extraction cost was already
   paid before the refusal - so it also feels slow for no benefit. The fix
   is copy-only (section 4.4's proposed replacement, naming the actual count
   attempted vs. the limit) but the underlying mechanism (whole-event refusal
   vs. partial-admit) is a product decision this document does not make -
   see the residual register.
2. **The "results stream into the table" framing (section 2) could read as
   guaranteeing near-real-time completion, when the pool is bounded at
   `INCREMENTAL_CONCURRENCY = 3`** (`incrementalRunPlan.ts:31`) with no
   inter-request pacing on this path (the per-item route does none -
   architecture section 5.4/RES-GC-4). An instructor who drops 20 submissions
   in a row will see the first 3 start immediately and the rest queue - which
   is the correct, designed behaviour (a simultaneity ceiling, not a defect),
   but nothing in the surface currently proposed TELLS them a queue exists.
   The `inFlight`/`dispatchedCount`/`completedCount` fields architecture's
   seam already exposes (section 2.4) are sufficient to render a queue depth
   ("3 grading now, 4 waiting") - I recommend surfacing that number rather
   than leaving the gap implicit, but I did not design its exact placement
   (Visual seat's layout call).
3. **The Canvas-URL point-scale gap the architecture checker already flagged
   (BLOCKER-1, `docs/grading-chat-architecture-check.md:168-209`) is a UX risk
   too, not only a data-correctness one.** If a Canvas-URL submission's
   `pointsPossible` is silently dropped at the intake seam (as the checker
   found the current `IntakeOutcome` type does), a row on THIS surface could
   show a total on a different point scale than the identical URL graded on
   the batch `run` surface, with nothing in the UI distinguishing the two -
   an instructor comparing the two tables side by side would see a
   discrepancy with no explanation anywhere in the copy. I am not re-deciding
   this (it is the architect's fix to make, per the checker's own verdict),
   but I am naming it here because the UX consequence (a silently
   wrong-scale number, not merely a wrong one that errors) is worse than a
   refusal would be, and no copy in section 4 currently warns about it. This
   is ranked third, not first, because it is CONDITIONAL on the architecture
   fix not landing before build - if BLOCKER-1 is fixed as the checker
   recommends (threading `pointsPossible` through), this item disappears
   entirely, whereas items 1 and 2 are true regardless.

---

## 7. Dependency this document inherited, not resolved

`docs/grading-chat-architecture-check.md` (the fresh check over wave 1) found
ONE BLOCKER: `IntakeOutcome` (architecture section 3.2) has no slot for
Canvas's `pointsPossible`, so a Canvas-URL submission graded on this surface
would silently score on the wrong point scale relative to the identical URL
graded on the batch surface (`grading-incremental.ts:109-110`,
`incrementalRunPlan.ts:155`, `route.ts:173`, `engine.ts:195-196` - all cited
and traced by the checker). **I read the architecture document as it stands
today and it does NOT yet carry the fix** (section 3.2's `IntakeOutcome`
still has no `pointsPossible` field) - I did not assume the blocker was
already resolved elsewhere. This does not change section 1's click count or
section 2's DOM order (the fix is a seam-type addition, not a shape change,
per the checker's own verdict), but it does affect section 6 item 3's ranking
and the copy in section 4 should not claim Canvas-URL grading is
scale-correct on this surface until that fix lands.

---

## 8. Residual register (owner, instrument, step)

None of these is a `docs/BACKLOG.md` row yet - filing them is the
orchestrator's job, not this seat's (architecture section 13 states the same
constraint for its own residuals).

| id | Residual | Owner | Instrument | Step |
|---|---|---|---|---|
| RES-GC-UX-1 | Session-ceiling copy should name the attempted count vs. the limit, not just the limit (section 4.4, section 6 item 1) | UX + owner (the underlying whole-event-refusal-vs-partial mechanism is R4/RES-GC-5's, not this copy fix) | The driver's `submit()` return already carries `entryCount` (architecture section 2.4's `UseContinuousGradingRunResult.submit` signature) - a copy-only change reading it into the refusal string | Implementer wave, no design round needed |
| RES-GC-UX-2 | Queue-depth ("N grading now, M waiting") is not currently surfaced anywhere in the proposed copy, though the driver already exposes `inFlight`/`dispatchedCount`/`completedCount` (section 6 item 2) | UX + Visual seat (placement) | A status-line addition using fields architecture's seam already returns | Visual-seat pass on the as-built diff, or a follow-up |
| RES-GC-UX-3 | Composer Send-button focus-retention (section 1.1's "new requirement") needs to actually be implemented, not just specified - `AiChatWindow.tsx`'s own `handleSend` does not do this today, so it is not a free inheritance | implementer | A source-text/behavioural check that the Send handler calls `.focus()` on the composer field after clearing it | Build wave, test-seat instrument |
| RES-GC-UX-4 | The unsupported-file-extension refusal (section 4.4) is genuinely new copy - no existing string names this exact case for a single-file drop outside a zip. Confirm this wording with the owner before it ships, since it is the one refusal string in this document with no existing byte-identical source to point to | UX + owner | Owner review of the exact sentence at ship time | UX wave / owner walk |
| RES-GC-UX-5 (informational, not a blocker) | `SINGLE_SUBMISSION_EXTENSIONS`/`STUDENT_SUBMISSIONS_ACCEPT` (`GradingTab.tsx:47-57`) are module-private and hand-synced against `TEXT_EXTENSIONS`/`DOCUMENT_EXTENSIONS`/`IMAGE_EXTENSIONS` per that file's own comment (`:40-46`, "kept in sync ... by hand"). The new composer's file-mode `accept` attribute needs the SAME list and, unless extracted, would become a THIRD independently-maintained copy | implementer / architect (extraction is a design call, not mine) | `grep` for a third literal copy of the extension list once the composer file lands | Build wave |
| RES-GC-UX-6 | Section 6 item 3 (Canvas point-scale silent divergence) is conditional on BLOCKER-1 (section 7) not being fixed before build - re-check this section's ranking against the as-built diff | Follow-up UX/verify pass | Read the as-built `IntakeOutcome` type for a `pointsPossible` field | Verify stage, against the as-built diff, per `DEV_LOOP.md`'s "Follow-up design seats against the as-built diff, not the plan" |

## 9. Owner-walk items (nothing here renders under vitest)

- Everything in section 2 about how the surface actually LOOKS (spacing,
  whether it visually reads as "chat-like," the composer's position relative
  to the results table when the table is tall enough to scroll) - OW-GC-1,
  architecture section 14.
- The reload round-trip for all three persisted controls (section 5) -
  OW-GC-5.
- The clipboard copy controls actually copying the right box's text with many
  rows on screen (section 2's reuse of `RowFeedbackBoxes` claims the
  accessible-name guarantee is preserved by reuse, but the actual clipboard
  behaviour is unverifiable here) - OW-GC-6.
- Whether a later submission's grading visibly starts while an earlier one is
  still in progress (section 6 item 2's queue-depth gap is about the COPY;
  whether the underlying concurrency is felt correctly is OW-GC-3).
- Whether the Enter/Shift+Enter and Send-button behaviours described in
  section 3 actually fire as specified in a real browser - I traced the code
  paths and precedents but did not (could not) press a key.

## 10. What I could not determine

- Whether the owner wants a cancel/undo window before a file-mode submission
  dispatches (section 3.4's named tradeoff) - a product call, not something I
  can settle by reading code.
- The exact number and wording the owner wants for the session-ceiling
  refusal (RES-GC-UX-1) - I improved the informativeness of the string
  architecture proposed but did not re-decide the underlying 40-entry,
  whole-event-refusal mechanism, which is R4/RES-GC-5's call.
- Whether `GradingChatPanel.tsx`'s actual rendered spacing will make the
  "composer stays put" framing (section 2) feel true once built - the file
  does not exist yet (architecture section 10.3's own estimate), so there is
  nothing to check this against beyond the DOM-order and class-reuse claims
  already made.
- Real-model behaviour for distinct strengths/improvements text on a chat-mode
  submission - unchanged from the architecture's own statement (section 15
  item 2 there): no API key, no live model, owner-walk only.

---

## 11. Gate run on this document

```
npm run docs:gate
```
