# ANNOUNCEMENT-VIEW-CHAT-MIMIC - scope and wave plan (round 2, revised)

Status: authored by the architecture/scoping seat (`loop-architect`); round-1
check returned DEFECTIVE and this round-2 revision applies ONLY the returned
folds (one blocker + two hygiene). Blocker: F-FRAME dropped the heading that
`headingRef` focus-on-open is anchored to - resolved in section 7 + a new
focus-anchor instrument in section 9. Fold 2: the grading-chat composer chain the
mimic waited on has ALL SHIPPED, so RES-ACM-SERIALIZE is DISCHARGED and the dead
"moving target" justification is removed from section 5. Fold 3: drifted line
refs re-measured at HEAD `c4137a72`. The design core the round-1 checker confirmed
sound (the double-frame finding, the CSS-replicate decision (c)/`annChat` alias,
the non-dialog + flow preservation, the "to a T" honesty, the Post-as-confirm
idiom, the one-wave cut) is UNCHANGED. Recon + mapping + wave plan only; no
production code, no CSS, no test was changed by this seat. First authored version
of this scope; it restructures no prior artifact, so the disposition table is N/A
(section 12).

Owner request (direct chat, 2026-10-06), verbatim: "the announcements from a
recording view needs to have a ui that mimics the grading llm chat view to a t".

Two surfaces:
- TARGET to mimic: the grading LLM chat view (`src/app/components/grading-chat/`).
- Surface to restyle: `src/app/components/recording/TakeAnnouncementPanel.tsx`
  ("draft, review, edit and post an announcement built from a recorded take").

Tree re-measured at HEAD `c4137a72` (`git rev-parse --short HEAD`) for this
round-2 revision; the round-1 figures were taken at `32214b3e`.

**This is a LOOK change, not a behavior change.** The draft -> review -> edit ->
post flow, the pipeline, the no-dialog property, the course picker, and the
`key={take.id}` reset contract are all preserved (section 6).

---

## 0. Measured quantities and the command that produced each

All commands run from repo root, this checkout, 2026-10-06.

| Quantity | Value | Command |
|---|---|---|
| `TakeAnnouncementPanel.tsx` lines | 663 | `wc -l < src/app/components/recording/TakeAnnouncementPanel.tsx` (Bash); re-measure at the wave gate with `@(Get-Content <f>).Count` (two tools disagree, `this-repo.md:182-195`) |
| `GradingChatPanel.tsx` lines | 360 | `wc -l < ...GradingChatPanel.tsx` (was 244 at round 1; grew as composite W2 + controls shipped) |
| `ChatComposer.tsx` lines | 353 | same instrument (was 203 at round 1) |
| `LatestResultCard.tsx` lines | 56 | same instrument (was 35 at round 1) |
| `grading-chat.module.css` lines | 165 | same instrument |
| `RecordingControls.module.css` lines | 444 | same instrument |
| `useTakeAnnouncement.ts` lines | 967 | same instrument (NOT edited by this item; near the 1000 ceiling - keep OFF the edit path) |
| grading-chat visual overhaul status | SHIPPED at `b344a549` | `git log --oneline -- src/app/components/grading-chat/` (`style(GRADING-CHAT-VISUAL): frame, session bar, dock, latest-card rail, danger notice, composer wrap fix`); backlog cites it at `448a7952` ("look=owner walk") |
| grading-chat drag-and-drop status | SHIPPED at `f30846d7` | same log (`feat(CHAT-GRADING-DND)`) |
| gdrive-url status | SHIPPED at `b9f27f5e` | `docs/grading-chat-composite-scope.md:44` ("gdrive-url has SHIPPED"), confirmed by the live Drive branch in `grading-chat-intake.ts` |
| harshness seam (controls W1) status | SHIPPED at `f87b5415` | `git log --oneline` (`feat(GRADING-CHAT-CONTROLS): harshness prompt seam (W1, byte-identical default)`) |
| composite W1 (seam + driver) status | SHIPPED (symbols live in `src`) | `grep -rln "mergeCompositeEntries\|CompositePartInput\|prepareCompositeSubmissionAction" src` -> hits in `chatSubmissionIntake.ts`, `grading-chat-intake.ts`, `useContinuousGradingRun.ts` (+ their tests) |
| composite W2 (composer tray) status | **SHIPPED** at `79ec4e44` | `git log --oneline -S onSubmitComposite -- GradingChatPanel.tsx` -> `79ec4e44 feat(COMPOSITE-SUBMISSION): W2 composer parts tray`; `grep -n "onSubmitComposite\|Add part" ChatComposer.tsx GradingChatPanel.tsx` -> `ChatComposer:59,70,175,232-233`, `GradingChatPanel:353` |
| controls W2/W3 status | **SHIPPED** at `9f5d3910` | `git log --oneline -S ta-grading-chat-harshness -- GradingChatPanel.tsx` -> `9f5d3910 feat(GRADING-CHAT-CONTROLS): ... clear fields, copy feedback, harshness, loading`; `grep -n "SegmentedToggle\|harshness\|ta-grading-chat-harshness" GradingChatPanel.tsx` -> `:28,:52,:54,:85,:284,:292` |
| gdrive W2 (URL-mode label) status | **SHIPPED** at `bbcb879e` | `grep -n "Google Drive URL" ChatComposer.tsx` -> `:338` (`label="Canvas, GitHub, or Google Drive URL"`); commit `bbcb879e feat(GDRIVE-URL): W2 widen the URL-mode label` |
| record-mode (screen submission) status | **SHIPPED** at `42da16d3` | `grep -n '"record"' ChatComposer.tsx` -> `:32,:38` (`InputMode = "text" | "file" | "url" | "record"`); commit `42da16d3 feat(RECORD-SCREEN-SUBMISSION)` |
| orphan-ratchet pin | `PINNED_ORPHAN_CEILING = 118`, asserted `toBe` | `src/app/components/courses/page-module-css-orphan-classes.test.ts:316,436` |
| orphan-ratchet scope | **every `*.module.css` under `src/`** | `page-module-css-orphan-classes.test.ts:387` (describe title), `:64-80` (`discoverStylesheets` walks `src/`) - see the correction in section 12 |
| `TakeAnnouncementPanel` is a dialog site | NO | file header `TakeAnnouncementPanel.tsx:4-10` ("Deliberately NOT a modal ... This file carries neither marker"); not in any list in `modalAdoptionScan.ts` |

---

## 1. The TARGET, as it is in the tree TODAY (post-ship inventory)

**Correcting the dispatch brief's premise.** The brief calls
`docs/grading-chat-visual-scope.md` "a pending visual overhaul of this very
view." It is not pending - its section-4 plan SHIPPED at `b344a549` and the
scope doc is a pre-ship snapshot. The grading-chat view in the tree now already
carries the framed card, session bar, sticky dock with a hairline edge, the
accent-rail latest-result card, and the danger notice. What the visual doc still
leaves open is an OWNER WALK on the shipped look (`docs/BACKLOG.md` row
GRADING-CHAT-VISUAL, "look=owner walk"), i.e. the look could still be tweaked,
but the structural visual LANGUAGE is in the tree and stable.

### 1.1 The STABLE visual language (shipped; safe to mimic now)

`GradingChatPanel.tsx` root is `<div className={`${styles.card} ${styles.form}`}>`
(`:238`) - note it reaches for `styles.card` itself because the panel is NOT
mounted inside `TabShell` (it is a bare display-toggled sibling in `page.tsx`;
`docs/grading-chat-visual-scope.md:71-82`). This is load-bearing for the mapping
(section 3, finding F-FRAME): the frame is a LAYER whose owner differs by
container.

grading-chat-private classes (`grading-chat.module.css`, imported ONLY by the
three grading-chat components via `chatStyles`; `grep -n "grading-chat.module.css"
src` shows 3 importers + 1 structure test):

| Class | `grading-chat.module.css` | Role |
|---|---|---|
| `.stickyComposer` | `:8-18` | bottom dock: `position: sticky; bottom: 0`, flex column, `background: var(--card-background)`, `border-top: 1px solid var(--border-soft)` - the hairline edge |
| `.compactField` (+ `label`, `textarea`) | `:73-93` | setup-field wrapper: house `.field` label chrome minus the 220px textarea floor |
| `.setupSummary` | `:96-107` | one-line "set for this session" status strip: `border: 1px solid var(--border-soft)`, `background: var(--surface-subtle)` |
| `.latestCard` (+ Header/Student/Score/Field/Label/Text) | `:112-165` | the read-only "newest reply" card: `border-left: 3px solid var(--accent)`, `background: var(--surface-subtle)`, `max-height: 30vh; overflow-y: auto` |
| `.sessionBar` / `.sessionMeta` | `:21-35` | meta column left, "New session" button right |
| `.stream` / `.streamEmpty` | `:38-52` | results region / dashed empty-state box |
| `.composer` / `.composerGrow` / `.composerLabel` | `:55-69` | composer rows inside the dock |

Classes it REUSES from genuinely-shared sheets (no duplication cost to mimic -
these are already available to `TakeAnnouncementPanel`):
- `styles.card`, `styles.form`, `styles.adaptRow`, `styles.ghActions`,
  `styles.ghMeta` (`page.module.css`).
- `controls.notice` + `controls.noticeDanger` (`RecordingControls.module.css:224,237`)
  for the intake error (`GradingChatPanel.tsx:340`).
- `SegmentedToggle` (shared `ui/` component) for the submission-mode selector.

### 1.2 The composer chain the mimic waited on - ALL SHIPPED (serialization DISCHARGED)

At round 1 these four efforts were still queued, which created the SERIALIZATION
dependency (RES-ACM-SERIALIZE): the mimic had to copy the FINAL composer/card/setup.
Re-measured at HEAD `c4137a72`, **every one has landed**, so the dependency is
DISCHARGED and the build is UNBLOCKED:

| Effort | What it changed in the grading-chat surface | Status (re-measured) |
|---|---|---|
| Composite W2 (`docs/grading-chat-composite-scope.md:614-633`) | PARTS TRAY, "+ Add part", "Grade submission (N parts)" primary, student-name field in `ChatComposer.tsx`; `onSubmitComposite` panel wiring | **SHIPPED** `79ec4e44` (`ChatComposer:59,70,232-233`, `GradingChatPanel:353`) |
| Controls W2 (`docs/grading-chat-controls-scope.md:466-475`) | clear controls + clear-all, composer-text Clear, COPY on `LatestResultCard.tsx`, loading/progress line | **SHIPPED** `9f5d3910` |
| Controls W3 (`...controls-scope.md:477-483`) | harshness `SegmentedToggle` + `ta-grading-chat-harshness` persist + lock summary | **SHIPPED** `9f5d3910` (`GradingChatPanel:28,52,54,284,292`) |
| gdrive W2 (`docs/grading-chat-gdrive-url-scope.md:495-513`) | URL-field label change in `ChatComposer.tsx` | **SHIPPED** `bbcb879e` (`ChatComposer:338` `"Canvas, GitHub, or Google Drive URL"`) |

(A fifth effort, record-mode screen submission `42da16d3`, also landed since round
1; it adds no element the mimic maps.) So the composer (`ChatComposer.tsx`), the
latest-result card (`LatestResultCard.tsx`), and the setup/dock
(`GradingChatPanel.tsx`) are now at their shipped state. **The internal control
layout is final; the mimic may copy it now.** RES-ACM-SERIALIZE is DISCHARGED
(section 11) and the W1 serialization precondition in section 8 is satisfied.

---

## 2. The surface to RESTYLE, as it is today

`TakeAnnouncementPanel.tsx` (663 lines), mounted at `RecordingTab.tsx:819` with
`key={announcementTake.id}` (`:820`) inside the Record/Announcement shared panel.

**Decisive container fact (shape finding F-FRAME).** `RecordingTab`'s root is
`TabShell` (`recording-split.structure.test.ts:112-114`), and `TabShell` renders
`<section className={styles.card}>` (`TabShell.tsx:26`), `.card` =
`padding: var(--space-6)` (`page.module.css:29-36`). So `TakeAnnouncementPanel`
ALREADY lives inside a 24px-padded `.card`. The grading-chat panel does NOT - it
added `styles.card` to its own root precisely because it has no `TabShell`
ancestor. **Copying grading-chat's `${styles.card} ${styles.form}` root onto
`TakeAnnouncementPanel` would produce a card inside TabShell's card - a double
frame.** The mimic therefore operates on the INNER regions; outer-frame parity is
already supplied by TabShell and must not be re-added.

Current structure (both return branches):
- Root `<div className={styles.adaptPanel}>` (`:255`, `:283`) - the panel draws
  its OWN bordered box (`.adaptPanel`, `page.module.css:903`) inside TabShell's
  card, with a title via `.adaptPanelTitle` (`:256,:284`). grading-chat has no
  such inner box and no title header.
- "Back to takes" text button (`:289-291`).
- Downloadable-log row (`:302`, `RunLogRow`).
- Live-region / lastMessage hints (`:308-314`, `styles.fieldHint`).
- Pipeline `LinearProgress` + label (`:316-333`).
- Cancel / real-time-confirm / failed / noSpeech branches (`:335-397`,
  `controls.notice` + tone classes).
- review | posting branch (`:399-660`): "Post to" course `<TextField select>`
  in a `controls.section` fieldset (`:410-435`); "Announcement style"
  `AnnouncementCompositionControls` in a fieldset with a Regenerate
  `ConfirmArmButtons` (`:445-482`); Subject + Message `<TextField>`s
  (`:484-507`); Image fieldset (`:531-589`); armed-state Post preview in
  `controls.noticeWarning` with `<code>` Subject/Body blocks (`:597-621`); the
  Post `ConfirmArmButtons` (`variant="contained"`, arm/confirm) + Save-to-drafts
  (`:629-657`).
- posted branch (`:253-277`): a `role="status"` "Posted to {course}" line, a
  success `ghBadge`, "Back to takes".

---

## 3. The element-by-element mapping (grading-chat -> announcement)

"Mimic to a T" is read as VISUAL/layout parity in the shared design LANGUAGE,
not semantic identity of the workflow. Each row says what maps, how, and the
honest limit.

| grading-chat element | Announcement equivalent | Mapping | Parity |
|---|---|---|---|
| Framed single card (`styles.card`) | the panel's outer frame | Supplied ALREADY by TabShell's `.card` (F-FRAME). Do NOT add a second `.card`. To match grading-chat's single-frame, headerless look, DROP the inner `.adaptPanel` box and let content sit directly in TabShell's card (Fork B1). **Non-negotiable: a focusable heading carrying `headingRef` MUST survive even if the visible title is dropped/restyled (F-FRAME, M-focus) - focus-on-open depends on it.** | FULL by result, via a different owner |
| Setup fields that lock (compactField -> setupSummary strip) | the "Post to" course picker (`:410-435`) | Render the course select in a `.compactField`-style block; once posted, the posted view's "Posted to {course}" line is the locked summary. | PARTIAL - the lock TRIGGER differs: grading-chat locks at session start; the announcement's course stays editable through review and "locks" only at post |
| Results STREAM (growing table of N rows) | - | NO MAP. One announcement is drafted, not a stream of graded rows. This is the core "cannot be to a T" element. | NONE |
| LatestResultCard (accent-rail read-only card above the dock) | the drafted-announcement PREVIEW | STRONGEST map. Render the draft (Subject + Message, or the armed `<code>` preview) in a card mirroring `.latestCard`: `border-left: 3px solid var(--accent)`, `background: var(--surface-subtle)`, `max-height` + scroll. | FULL (visual) |
| Sticky composer dock (hairline-edged input anchored at bottom) | the Subject/Message edit fields + Post action | Map the Subject/Message review fields as the "composer" input area and the primary action as the docked bottom bar with a `border-top` hairline. | PARTIAL - grading-chat's dock is a persistent send-the-next input; the announcement's is a one-shot edit-then-post; "sticky" behavior is an owner walk |
| Send button (outlined, Enter-to-send) | the Post button | Post publishes irreversibly to every student, so it KEEPS its `variant="contained"` + `ConfirmArmButtons` arm/confirm (`:629-643`). It mirrors "the primary action docked at the bottom" but NOT the outlined-Send idiom. | PARTIAL - deliberately diverges; the destructive confirm outranks visual parity |
| SegmentedToggle mode selector (Text/File/URL) | - | NO MAP. The announcement has no submission-mode selector. ("Announcement style" controls are a different set and stay.) | NONE |
| Composer "+ Add part" tray (composite W2) | - | NO MAP. One draft, not assembled parts. | NONE |
| Danger notice (`controls.notice noticeDanger`) | the existing error notices | Already identical idiom - the announcement panel ALREADY uses `controls.notice`/`noticeDanger`/`noticeWarning` (`:344,358,431,...`). No change needed; this is parity for free. | FULL (already) |
| Loading cue (controls W4 loading line) | the pipeline `LinearProgress` + label | The announcement already has a determinate/indeterminate pipeline bar. Optionally echo the chat-local text-swap loading idiom; largely already present. | FULL-ish (already) |
| Copy control (controls W2 on the card) | copy the announcement text | Optional: a copy control on the preview card, mirroring the chat card's planned copy. | OPTIONAL |
| Harshness toggle (controls W3) | - | NO MAP. Grading-only. | NONE |

**Net:** the shared LANGUAGE maps fully (framed card look, token palette,
accent-rail preview card, surface-subtle inset, danger/warning notices,
control-row patterns `ghActions`/`adaptRow`, uppercase-tracked field labels, the
docked primary-action bar with a hairline edge). The WORKFLOW-SPECIFIC structure
does not: there is no stream of rows, no submission-mode toggle, no parts tray,
and the Post action is a filled, confirmed button rather than an outlined Send.

---

## 4. The honest "to a T" assessment

**What CAN be "to a T":** the visual vocabulary. After the mimic, the
announcement panel and the grading-chat panel share: the same framed-card
surface (24px padding, `--radius`, `--card-border`), the same accent-rail
`--surface-subtle` card for "the thing just produced" (preview vs latest
result), the same `--border-soft` hairline marking the docked primary-action
area, the same danger/warning notice treatment, the same uppercase-2xs tracked
labels, and the same `--space-*`/type tokens throughout. An instructor moving
between the two surfaces sees one design system.

**What CANNOT be "to a T," and why:** the announcement flow is draft-one ->
review -> edit -> post, NOT a continuous submission stream. So four grading-chat
structures have no honest equivalent and must not be forced:
1. the growing RESULTS TABLE (no stream of rows);
2. the SUBMISSION-MODE SegmentedToggle (no modes to pick);
3. the "+ Add part" composite TRAY (one draft, not parts);
4. the outlined Send idiom - the Post button is irreversible (publishes to all
   students, `:600`) and rightly stays a filled arm/confirm button. Making it an
   outlined Send to match the chat would trade away a confirm step, which the
   repo's own click-cost standard forbids (`AGENTS.md` "Minimize clicks ...
   without trading away confirm steps").

The recommended reading: mimic the LANGUAGE and the three STABLE structural
idioms that DO map (framed single card, accent-rail preview card, docked
primary-action bar with a hairline), and explicitly record the four
non-mapping structures as "cannot be to a T given a one-shot post flow." Forcing
them would be a worse surface, not a more faithful one.

---

## 5. CSS-reuse decision: (a) cross-import, (b) extract-shared, or (c) replicate

**RECOMMEND (c) - REPLICATE the handful of chat-private classes the mapping uses
into a NEW recording-side module, referencing the SAME design tokens.** e.g.
`src/app/components/recording/announcement-chat.module.css`, imported by
`TakeAnnouncementPanel.tsx` as a new binding (`annChat`, not `chat` - the alias
`chat` collides with the `*.module` filename substring under the css guard;
`docs/grading-chat-visual-scope.md:146-154`, commit `503921ff`).

The module replicates ONLY the chat-private classes the mapping actually needs -
a `.latestCard`-equivalent (accent-rail preview card), a `.stickyComposer`-
equivalent (docked action bar with a hairline), a `.compactField`-equivalent
(setup block), maybe a `.setupSummary`-equivalent - roughly 6-8 classes, each
built from `--surface-subtle`, `--accent`, `--border-soft`, `--card-background`,
`--radius-md`, `--space-*`. The BULK of the visual language (the framed card,
the danger/warning notices, the control rows, the SegmentedToggle, the field
labels) is reused from genuinely-shared sheets already imported by this panel -
no duplication there.

Justification against the alternatives:

- **(a) import `grading-chat.module.css` into `TakeAnnouncementPanel`: REJECT.**
  (The round-1 "moving target" leg is WITHDRAWN as empirically false: the
  grading-chat composer chain has fully shipped and `grading-chat.module.css` is
  unchanged - `git log 32214b3e..HEAD -- src/app/components/grading-chat/grading-chat.module.css`
  is EMPTY, the file still measures 165 lines. The rejection stands on its other,
  structural legs:) (1) The classes are named for
  grading-chat semantics (`stickyComposer`, `latestCard`, `sessionBar`); reusing
  `.latestCard` for an announcement preview reads as a leak of another feature's
  vocabulary. (2) It is a feature-PRIVATE module (3 importers, all in
  `grading-chat/`); it was never built to be a shared asset. (Cross-directory
  CSS-module imports DO exist here - `GradingChatPanel` imports
  `recording/RecordingControls.module.css` - but that is a genuinely-shared
  utility sheet, 56 importers, not a feature's private module.)
- **(b) extract the shared classes into a new shared module both import:
  REJECT for THIS item, file as a follow-up.** It is the "right" long-term move,
  but it edits `grading-chat.module.css` AND retargets the imports in all three
  grading-chat components - the maximal collision with composite W2 + controls
  W2/W3, forcing this look change to serialize after ALL grading-chat work and
  to re-touch files three other efforts own. A large, risky blast radius for a
  look change. Record as RES-ACM-EXTRACT: if a THIRD surface ever needs this
  skin, do the extraction then (the rule-of-three), not now.
- **(c) replicate: RECOMMEND.** Disjoint write set (one NEW module +
  `TakeAnnouncementPanel.tsx`), zero contention with the grading-chat efforts,
  and because every class references the SAME tokens, theme/token changes
  propagate automatically - only a STRUCTURAL CSS change to grading-chat would
  drift. The drift risk is mitigated two ways: (i) the grading-chat composer/card
  work has now SETTLED (all shipped, section 1.2), so the replica copies the
  already-FINAL declarations - the serialization gate is discharged, not pending
  (section 8); (ii) a source-text pin that the replica's key declarations match
  the grading-chat originals at author time (section 9, M-mimic).

**The orphan ratchet governs all three options the same way (section 12
correction):** the ratchet is EXACT (`toBe(118)`) across EVERY `*.module.css`
under `src/`, NOT scoped to `page.module.css`. So every class in the new module
MUST be referenced by `TakeAnnouncementPanel.tsx` in the SAME commit, or the
orphan count rises and the test reddens; and the mimic must adopt NO
currently-orphaned class (which would lower the count and also redden). A new
class that is both defined and referenced is net-zero. The css-CLASSES guard
(`page-module-css-classes.test.ts`, walks every `*.module.css` under `src/`)
also then checks every `annChat.<class>` reference resolves - another reason a
replica is clean: it is self-contained and verifiable.

---

## 6. Behavior-preservation guards (the LOOK must not regress the flow)

Each is an instrument that goes red if the restyle changes behavior.

| Behavior to preserve | Guard / instrument | Direction of failure |
|---|---|---|
| NOT a dialog (no Escape-discards-draft) | `modalAdoption.wiring.test.ts` - `DIALOG_SITES.length` pinned to 53 (`:353`), and AC8 (`:428-439`) requires every dialog site to adopt-or-be-listed. The scan classifies by `role="dialog"`, `role="alertdialog"`, `styles.previewBackdrop`, a MUI `Dialog` import, or a `ModalShell`/`useModalDismiss` import (`modalAdoptionScan.ts`). | Introducing ANY of those markers makes the panel a new dialog site -> the count pin (53) breaks AND it must be classified. The mimic introduces none (grading-chat is an inline panel, not a dialog). |
| draft/review/edit/post flow + pipeline | `useTakeAnnouncement.ts` is NOT edited (logic stays in the hook; the panel only reformats). Re-run the panel's existing structure/wiring tests in the gate. | Any stage branch (`review`/`posting`/`failed`/`noSpeech`/`posted`) removed or reordered. |
| course picker | the `<TextField select>` "Post to" block stays; its `onChange={handleCourseChange}` -> `onCourseIdChange` wiring (`:224-227,419`) unchanged. | The select, its options map, or the `onCourseIdChange` call lost. |
| `key={take.id}` reset contract | `RecordingTab.tsx:820` is NOT in the write set. | The caller's `key=` changed (out of scope). |
| recording/ files < 1000 lines | `recording-split.structure.test.ts:76-93` (walks `recording/`, all `.ts`/`.tsx`). TakeAnnouncementPanel 663 + a NEW module is `.module.css` (not scanned by this gate). | A panel edit pushing it over 1000 (huge headroom; not a risk). |
| no stray `ta-rec-*` key | `recording-split.structure.test.ts:360-436` exact-set canary over `recording/` non-test `.ts`/`.tsx`. A LOOK restyle adds no persisted key. | Any new/typo `ta-rec-*` token, even in a comment. |
| downloadable-log row | keep `downloadLogRow` in both branches (`:264,302`) - `DEV_LOOP.md`'s log rule. | The log row dropped in the restyle. |

The "no dialog" guard is the most important: the file's whole header
(`TakeAnnouncementPanel.tsx:4-10`) exists because a dialog's Escape-to-close
would silently discard a drafted announcement. Mimicking the grading-chat LOOK
is safe because grading-chat is itself a non-dialog inline panel - the mimic
copies an inline surface onto an inline surface.

---

## 7. Forks, each with a recommended reading

The owner's answer to any one ends the activity and is applied as transcription
(`AGENTS.md` two-rounds rule). None gates the rest of this scope.

- **F-FRAME / B1 - the outer frame and the title header.** The panel's root is
  `.adaptPanel` (its own bordered box + `.adaptPanelTitle`) inside TabShell's
  `.card`. grading-chat has neither (single card, no title). RECOMMEND: drop the
  `.adaptPanel` BOX so content sits directly in TabShell's card like grading-chat,
  keeping "Back to takes" and the log row.

  **HARD CONSTRAINT - the focus anchor is non-negotiable (round-1 blocker,
  orchestrator ruling).** Focus-on-open is anchored to the title heading:
  `headingRef.current?.focus()` fires on mount (`TakeAnnouncementPanel.tsx:178`)
  and on the posted transition (`:189`), and `headingRef` is attached to the
  `<h2 ... className={styles.adaptPanelTitle}>` in BOTH return branches
  (`:256`, `:284`; ref declared `:122`). Dropping the heading nulls `headingRef`
  and SILENTLY breaks focus-on-open - no gate catches it (nothing renders under
  vitest, `this-repo.md:134`; no focus assertion exists). So **the implementer
  MUST NOT remove `headingRef`, and a heading element MUST still carry it after
  the restyle.** If the visible title is dropped or restyled for the headerless
  grading-chat look, the ref moves to a retained heading - a visually-hidden but
  focusable `<h2>` (e.g. an sr-only class, still `tabIndex={-1}`, still
  `ref={headingRef}`), OR a restyled lighter heading. M-focus (section 9) pins
  that `headingRef` stays attached to a rendered heading element so a future drop
  reddens.

  The TASTE call - keep the title visible, visually-hide it, or lighten it - is
  the "to a T" lever and goes to the owner walk (R-LOOK). The FOCUS ANCHOR does
  not: every option above keeps a focusable heading with `headingRef`.
  Alternative (a): keep `.adaptPanel` and only restyle the inner regions (less
  parity, but the panel keeps its labelled title; focus anchor untouched). Cost
  if wrong: one wrapper (the box); the heading stays either way.
- **F-PREVIEW - which draft artifact becomes the accent-rail card.** RECOMMEND
  the Subject/Message review fields' output rendered read-only in a
  `.latestCard`-equivalent during review, OR the armed `<code>` preview
  (`:597-621`) promoted into the rail card. Alternative: leave the review as
  editable `<TextField>`s and add the rail card only in the armed state. Cost if
  wrong: which block gets the card class.
- **F-POST - Post button idiom.** RECOMMEND keep `variant="contained"` +
  `ConfirmArmButtons` (do NOT mimic the outlined Send) because the post is
  irreversible. Alternative: outlined to match the chat exactly (rejected -
  trades away the confirm emphasis). Cost if wrong: one `idleVariant`.
- **F-STREAM - what fills the "stream" region.** RECOMMEND: nothing - the
  announcement has no stream; the preview card IS the produced artifact.
  Alternative: a single-row "draft summary" styled like one stream row (adds a
  structure with one member, arguably misleading). Cost if wrong: one wrapper.
- **F-SETUP-LOCK - mirror the lock behavior?** RECOMMEND: do NOT add a
  session-style lock to the course picker (the flow has no session; the posted
  view is the natural terminal state). Alternative: visually "lock" the course
  into a `.setupSummary` strip once a draft exists. Cost if wrong: a conditional
  swap. (A behavior-adjacent fork - keep it visual-only either way.)

---

## 8. Serialization dependency and wave plan

### 8.1 The serialization dependency - now DISCHARGED

At round 1 the grading-chat composer, latest-result card, and setup/dock had
QUEUED edits (composite W2 parts tray, controls W2 clear/copy/loading, controls W3
harshness toggle + lock summary, gdrive W2 label). The concern was that the mimic
would copy a composer/card/setup about to change and drift from "to a T," so the
build was gated behind those efforts (RES-ACM-SERIALIZE).

**Re-measured at HEAD `c4137a72`, ALL of those efforts have shipped** (composite
W2 `79ec4e44`, controls W2+W3 `9f5d3910`, gdrive W2 `bbcb879e`; section 1.2). The
grading-chat composer/card/setup are at their FINAL shipped state, so:

- Both tiers are now eligible. The stable-language elements (the framed single
  card from TabShell, the accent-rail preview card, the docked primary-action bar
  with a hairline, the danger notice) were always eligible - they derive from the
  shipped stable language (`b344a549`). The composer's EXACT final control layout
  (tray, clear row, harshness placement) is NOW also final, so a mimic of it no
  longer risks copying a layout about to change.
- **The serialization gate is SATISFIED, not pending. W1 is dispatchable now.**
  The replica copies the already-final declarations. (RES-ACM-SERIALIZE is marked
  DISCHARGED in section 11; the orchestrator does not need to re-confirm those
  rows are closed before W1 dispatch - they are shipped on `main`.)

### 8.2 Wave plan

Disjoint from every grading-chat file (the mimic touches `recording/`, not
`grading-chat/`), so it runs with no concurrency bar.

**W1 - the mimic (one wave, CSS-first).** The new module and the TSX that
references it must land together (an orphan or an undefined class is red on its
own). Write set (exact paths):
- `src/app/components/recording/announcement-chat.module.css` (NEW; replica
  classes, section 5).
- `src/app/components/recording/TakeAnnouncementPanel.tsx` (EDIT: import the new
  module as `annChat`; retarget the root frame per F-FRAME while KEEPING a
  focusable heading that carries `headingRef` - M-focus, do not remove the ref;
  wrap the draft preview in the accent-rail card; dock the primary-action bar;
  class bindings).
- Each new class's caller is in the same wave (the module + its only importer),
  so no class ships unreferenced (orphan ratchet, section 12).

Not in the write set: anything under `grading-chat/`, `page.module.css`
(frozen - add no class there), `RecordingControls.module.css` (reused as-is),
`RecordingTab.tsx` (the `key=` mount, out of scope), `useTakeAnnouncement.ts`
(logic, untouched), any test file except as the test seat adds a mimic pin.

Order inside the wave: (1) BEFORE screenshots of the announcement panel and the
grading-chat panel (the parity baseline); (2) the new module + bindings; (3)
owner/preview iteration with the two surfaces side by side; (4) gate; (5) AFTER
screenshots attached to the verify report.

**Gate (the wave):**
```
npm run test:paths src/app/components/courses/page-module-css-classes.test.ts src/app/components/courses/page-module-css-orphan-classes.test.ts src/app/components/recording/recording-split.structure.test.ts src/app/components/ui/modalAdoption.wiring.test.ts src/file-size-ceiling.structure.test.ts src/source-bytes.structure.test.ts src/lib/no-emojis.test.ts <any mimic pin the test seat adds>
```
(one path per argument, never a raw multi-path `vitest` - `this-repo.md:52-66`),
plus `npx tsc --noEmit` and `npm run lint` (exit 0, no NEW warning in the files
this wave writes) run by exactly one caller (they race on `tsconfig.tsbuildinfo`),
plus the `npm run build` compile-line check (the prerender tail failure is
expected, `this-repo.md` section 1), plus `git status --short` against the write
set and no `.claude/worktrees` copy edited (`this-repo.md:268-272`).

**Seats and triggers for this chunk** (verifier rules each against the built diff):
- Acceptance criteria: runs (always). No leverage claim - this is a visual
  refactor of an existing surface, not a new capability a user reaches
  (`DEV_LOOP.md` Criteria); fired trigger recorded.
- Visual / aesthetic: RUNS (layout/spacing/colour change; the parity judgment and
  the real-anchor check against TabShell's card are its work).
- User experience: RUNS (user-visible surface; re-walk the review/post clicks to
  confirm the restyle adds none).
- Accessibility: RUNS, reading-only (markup changes: the frame, the preview card,
  the docked bar; no component renders, `this-repo.md:134`). Keep the heading's
  focus-on-open (`:177-190`), the `role="status"`/`role="alert"` notices, and the
  armed preview's `role="group"` + `tabIndex={0}` (`:605-608`).
- Test seat: runs (always); owns the mimic source-text pins (section 9).
- Architect + reuse: ran here (new module, panel edit).
- Data/storage, Security, Reliability, Operability/admin: triaged OUT - no
  persisted shape, no new egress/action/model-text, no failure mode, no owner
  config; the restyle changes only presentation. Recorded triggers: none fired.

---

## 9. Machine-checkable vs owner-walk

**Machine-checkable (source-text/structure; none measures appearance):**
- M-class: every `annChat.X`/`styles.X`/`controls.X` reference in
  `TakeAnnouncementPanel.tsx` resolves to a defined class
  (`page-module-css-classes.test.ts`).
- M-orphan: orphan count stays exactly 118 across all stylesheets
  (`page-module-css-orphan-classes.test.ts`) - every new class referenced
  same-commit, no orphaned class adopted.
- M-nodialog: `DIALOG_SITES.length` stays 53 and `TakeAnnouncementPanel` appears
  on no dialog list (`modalAdoption.wiring.test.ts`).
- M-flow: the panel source still contains the course `<TextField select>`, the
  `onCourseIdChange` call, the Post `ConfirmArmButtons`, the Save-to-drafts
  button, the download-log row, and the stage branches (a structure pin the test
  seat authors/extends).
- M-focus (REQUIRED, test seat to author - round-1 blocker): a source-text pin
  on `TakeAnnouncementPanel.tsx` that `headingRef` remains attached to a rendered
  heading element after the restyle - i.e. the file still declares `headingRef`
  (currently `:122`), still calls `headingRef.current?.focus()` (`:178`, `:189`),
  and `ref={headingRef}` still sits on a heading element (an `<h2 ...>`) in BOTH
  return branches (currently `:256`, `:284`). Direction of failure: if the
  F-FRAME restyle drops the heading or detaches `headingRef`, the pin reddens.
  This is the ONLY guard on focus-on-open - no component renders under vitest
  (`this-repo.md:134`) and no focus assertion exists, so without this pin a
  dropped heading breaks keyboard focus SILENTLY. The implementer MUST NOT remove
  `headingRef`; a visually-hidden-but-focusable heading satisfies the pin if the
  visible title is dropped. Add this pin to the gate's `<mimic pin>` slot
  (section 8.2) so it runs in the wave gate and the verify.
- M-mimic (suggested, test seat to author): a source-text pin that the replica
  module's key declarations (the accent-rail `border-left: 3px solid var(--accent)`,
  the `--surface-subtle` background, the `--border-soft` dock hairline) are
  present - so a future grading-chat structural change is at least visible as a
  divergence when someone re-reads both.
- M-size: `TakeAnnouncementPanel.tsx` < 1000 and all `recording/` files < 1000
  (`file-size-ceiling` + `recording-split`).
- M-bytes/emoji: `source-bytes.structure.test.ts`, `no-emojis.test.ts`.

**Owner-walk ONLY (no `.env`, no auth, no rendered component -
`this-repo.md:245-264`):** whether the two surfaces actually READ as the same
design system; the real-anchor behavior of the docked bar inside TabShell's
scroll context; whether dropping `.adaptPanel` and hiding/lightening the VISIBLE
title (F-FRAME/B1) looks right - the focus-carrying heading is RETAINED either
way (M-focus), only its visibility is the taste call; contrast of the accent-rail
card in both themes; and that the draft/post
flow still works end to end on a deployed build. Recorded as residuals (section
11), never filled in here.

---

## 10. The `owns` list (tests that READ an edited file as source text)

Command (PowerShell):
```
Get-ChildItem -Recurse -Include *.test.ts src | Select-String -List -Pattern
"TakeAnnouncementPanel|recording/|announcement-chat|module\.css"
```
Classified (the load-bearing ones; re-run at the wave gate for the full set):
- `src/app/components/recording/recording-split.structure.test.ts` - ADOPT
  (scans `recording/` for the <1000 line rule and the `ta-rec-*` key set; a new
  `.module.css` is not `.ts`/`.tsx` so it is NOT scanned by either, but the panel
  edit is - re-run to confirm no key drift and the line count).
- `src/app/components/courses/page-module-css-classes.test.ts` - ADOPT (walks
  every `*.module.css` under `src/`; checks the new module's references resolve).
- `src/app/components/courses/page-module-css-orphan-classes.test.ts` - ADOPT
  (exact orphan ratchet across every `*.module.css`; the new module's classes
  must all be referenced same-commit).
- `src/app/components/ui/modalAdoption.wiring.test.ts` - ADOPT (the panel is a
  source it classifies; confirms it stays a non-dialog).
- `src/file-size-ceiling.structure.test.ts` - ADOPT (unconditional).
- any existing `TakeAnnouncement*`/`useTakeAnnouncement*` test - re-run
  checked-safe (logic in the hook is untouched; the panel reformats only).

---

## 11. Residual register (owner / instrument / step - each present, or it is a deletion)

Each MUST be filed in `docs/BACKLOG.md` by the orchestrator at disposal; a
residual living only here does not exist (`DEV_LOOP.md` step 0).

| ID | Residual | Owner | Instrument | Step |
|---|---|---|---|---|
| R-LOOK | Whether the restyled panel actually reads "to a T" like grading-chat; the F-FRAME/B1 drop of `.adaptPanel` and whether to hide/lighten the VISIBLE title (the focus-carrying heading is retained regardless, M-focus); theme contrast of the accent-rail card | Repo owner (taste) with the W1 implementer driving | Before/after screenshots of BOTH surfaces at 1280/768/375, light+dark, side by side | W1 steps 1 and 3, then the owner walk |
| R-ANCHOR | The docked primary-action bar's behavior inside TabShell's card/scroll context (grading-chat's dock is `position: sticky` against a different ancestor; the announcement panel's ancestor is TabShell, not `.tabContainer`) | W1 implementer / visual seat | compute the real container; a static (non-sticky) docked bar is the safe default here unless the anchor supports sticky | W1 design against the real anchor (Visual seat's "check the real anchor" rule, `seats.md`) |
| R-FLOW | The draft/review/edit/post flow and pipeline still work end to end | Repo owner | Owner walk on a deployed build (no `.env`/render here) | After W1 ships |
| RES-ACM-EXTRACT | Option (b) - extract the shared chat/announcement skin into one module both import - deferred (rule-of-three: do it when a third surface needs it) | Orchestrator (files the row) / next toucher | `grep` the chat-private class set across surfaces; extract when a third importer appears | A later refactor row |
| RES-ACM-SERIALIZE | **DISCHARGED at round 2.** Was: the mimic must copy the FINAL grading-chat composer/card/setup, sequenced AFTER composite W2 + controls W2/W3 + gdrive W2. All of those have shipped (`79ec4e44`, `9f5d3910`, `bbcb879e`; section 1.2), so the precondition is satisfied and W1 is dispatchable now | Orchestrator | `git log --oneline -S onSubmitComposite/ta-grading-chat-harshness/"Google Drive URL" -- src/app/components/grading-chat/` -> all three shipped on `main` | NONE REMAINING - no gate before W1 dispatch |
| RES-ACM-ORPHAN-FACT | The two sibling scopes (`grading-chat-composite-scope.md:437`, `grading-chat-controls-scope.md:544-547`) mis-state the orphan ratchet as "scoped to page.module.css"; it is every `*.module.css`, exact. Any implementer trusting them could ship an unreferenced class to `grading-chat.module.css` and redden the gate | Orchestrator | the measurement in section 12 | Note in those items' build briefs; correct on next touch |

---

## 12. Measured correction to the sibling scopes (refusing a disprovable ruling)

The composite scope (`docs/grading-chat-composite-scope.md:437`) and the controls
scope (`docs/grading-chat-controls-scope.md:544-547`) both state the orphan
ratchet is "scoped to `page.module.css`" and that `grading-chat.module.css` is
"NOT under the exact orphan ratchet." **Measured, this is false.**

`page-module-css-orphan-classes.test.ts`:
- `:387` describe title: "CSS Module orphan-class ratchet (**every `*.module.css`
  under `src/`**)".
- `:64-80` `discoverStylesheets` walks all of `src/` for `*.module.css`;
  `STYLESHEETS` is that full set.
- `:419-436` asserts `totalOrphanCount` across ALL those stylesheets, and it is
  EXACT in both directions: `:431` `toBeLessThanOrEqual(118)` AND `:436`
  `toBe(118)`.

Consequence: a class added to `grading-chat.module.css` (or any module) that is
not referenced same-commit raises the global count above 118 and reddens the
gate; adopting a currently-orphaned class lowers it below 118 and also reddens.
The sibling scopes' NET advice ("reference every new class same-commit") is still
right, but their stated REASON is wrong, and an implementer who trusted "this
module is not under the ratchet" could ship a dead class and break main. Filed as
RES-ACM-ORPHAN-FACT. This does not change my own recommendation (option c): the
new recording module's classes are all referenced by `TakeAnnouncementPanel.tsx`
same-commit, net-zero on the count.

---

## 13. What this seat could not determine; disposition

- Nothing in this document was seen rendered (no `.env`, no auth, no rendered
  component - `this-repo.md:245-264`). Every parity statement is a reading of
  source and tokens; the "to a T" verdict is an owner walk (R-LOOK).
- Whether a `position: sticky` dock works against TabShell's card/scroll ancestor
  the way grading-chat's works against `.tabContainer` (R-ANCHOR) - a static
  docked bar is the safe default.
- The final shipped state of the grading-chat composer/card/setup is now KNOWN -
  composite W2 (`79ec4e44`), controls W2/W3 (`9f5d3910`) and gdrive W2
  (`bbcb879e`) have all landed since round 1, so this is no longer an open
  unknown; RES-ACM-SERIALIZE is discharged (section 11) and the mimic may copy the
  final declarations.
- Disposition table: N/A (first authored version of this scope; restructures no
  prior artifact - the round-2 revision applies returned folds in place, it does
  not restructure).
- Round 2 of two: round-1 check returned DEFECTIVE (one blocker + two hygiene);
  this revision applies only those folds and goes to a fresh `loop-checker`.
