# A29 Wave W3 - acceptance criteria and surface design: the confirm surface for sendBulkCourseMessageAction

- Item: A29 (`docs/backlog.yml:586`), Wave W3 of the three-wave cut in
  `docs/a29-architecture.md:541-547`. W1 (`e5950ad7`) and W2 (`0ff48952`) are on main.
- Seat: `loop-seat` (Sonnet), authoring criteria + surface design (UX and surface
  architecture). A fresh `loop-checker` gates this before any W3 build. No production
  code and no test code is in this document; oracle construction belongs to the test seat.
- **FRAMING - read first.** The host fork Q-1 (fold the control into
  `MessageDraftsTab.tsx` vs a dedicated compose surface) is OPEN with the owner. This
  document is the orchestrator's ACTED-ON READING (b), not an owner ruling. The design
  isolates the host mount to ONE file so that an owner answer of (a) costs one file
  (section 3 says exactly which, and where that claim needs a footnote).
- Inputs read from the TREE this pass, not from the docs: `src/app/actions/bulk-course-message.ts`
  (78 lines), `src/lib/bulk-course-message/{refusal,plain-text}.ts`,
  `src/lib/canvas/inbox.ts:420-490`, `src/app/components/MessageDraftsTab.tsx`,
  `src/app/components/CanvasTab.tsx`, `src/app/components/canvas-tab/*`, the gate tests named
  in section 11. The two A29 docs I was pointed at, `docs/a29-acceptance-criteria.md` and
  `docs/a29-architecture.md`, are both UNCOMMITTED working-tree edits (`git status --short`
  shows ` M` on both; `git diff --stat` shows 211 and 2737 changed lines). I read the
  working-tree versions. If the orchestrator reverts either, section 4 should be re-read.

## 1. Findings from the tree that change the W3 brief

Each finding names the command or `file:line` that produced it. F-1 and F-2 are the ones
the orchestrator needs to rule on before a W3 build is dispatched (section 12, D-1/D-2).

**F-1. The shipped action cannot drive a server-count confirm. W3 needs a second, read-only
server action, which is OUTSIDE the write set `docs/a29-architecture.md:547` gave W3.**
`sendBulkCourseMessageAction` (`src/app/actions/bulk-course-message.ts:47-77`) reads the
count at `:65`, classifies at `:71` and POSTS at `:74` in ONE call, and returns
`{status:"accepted"}` (no count, `:26-29`), a refusal, or `unknown`. The count exists only
inside that call and is exposed only inside a REFUSAL reason string. There is no way to
show the instructor the number before the irreversible send without a second call. The
two alternatives both break AC-8 (`docs/a29-acceptance-criteria.md:329-330`, "FAILS if
the count shown is not the one the refusal predicate used"):
(i) the client derives a count from an existing roster action (`listStudents`/
`listCourseRoster` carry no state filter, `src/lib/canvas/listings.ts:248,286`, per the
AC measurements row at `docs/a29-acceptance-criteria.md:96`) - a different number from the
predicate's; (ii) omit the count from the confirm - drops a required clause of AC-8.
Design (section 5.3): add `previewBulkCourseMessageAction(courseId)` to the SAME file,
sharing one internal resolver with the send action so the two cannot diverge by
construction. This adds two files to W3's write set (the action and its test).

**F-2. The `src/app/actions.ts` barrel line is not needed for reachability.** Measured:
116 non-test `.ts` files in `src/app/actions/`, 54 `export * from` lines in
`src/app/actions.ts`, 62 action files NOT in the barrel (command in section 13, M-1).
Client components already import actions directly:
`src/app/components/canvas-tab/announcements-panel.tsx:16-18` imports three action modules
by file path. `src/lib/canvas-client-boundary.test.ts:21-26` records that a `"use server"`
file is a wall for the bundler, so a direct import is as safe as a barrel import. What the
barrel line COSTS: the irreversible send identifier becomes reachable from the one
specifier 148 workflow modules and many components already import
(`docs/a29-acceptance-criteria.md:101`); `src/app/actions/action-guard-coverage.test.ts:20-27`
says action ids ship in the bundle of routes whose tree imports the action - whether
that makes a barrel export widen id exposure under this Next version I did NOT verify
against `node_modules/next/dist/docs/`. The guard is `requireUser()` either way
(`bulk-course-message.ts:52`). Recommendation: omit the barrel line and import directly,
the `announcements-panel.tsx` precedent (D-2). Both readings are criteria-compatible:
AC-W3-1 accepts either import specifier.

**F-3. Two shipped-vs-doc divergences, so no seat builds against the doc's shape.**
The architecture doc types the predicate result as `{decision:"send"...}`
(`docs/a29-architecture.md:184-186`); the shipped leaf is `{send:true} | {send:false;
kind; count}` (`src/lib/bulk-course-message/refusal.ts:11-13`). W3 never touches the
predicate (it consumes the action's outcome types), so this is informational. And the W2
commit message claims 35 tests; `npx vitest run src/app/actions/bulk-course-message.test.ts`
printed `Tests 17 passed (17)` this pass. I did not reconcile the two; the W3
non-regression pin (AC-W3-10) uses the measured 17.

**F-4. A literal `role="alertdialog"` in a new `.tsx` turns a gate red.**
`src/app/components/ui/modalAdoptionScan.ts:60-62` classifies any `.tsx` whose
comment-stripped source contains `role="alertdialog"` as a dialog site; a non-adopting
site must be named in `PERMANENT_EXCLUSIONS` (`:236-248` lists `KnowledgeTab.tsx` and
`MessageDraftsTab.tsx` for exactly this inline-banner shape). That file is outside any W3
write set. Design (D-3): the confirm banner is an inline row, not an overlay, so it uses
`role="group"` with an `aria-label` and carries no dialog marker. The alternative is
`alertdialog` plus a registered exclusion, which adds `modalAdoptionScan.ts` to the write set.

**F-5. The in-flight guard must be a synchronous ref, not a state flag.** R-2 reads as "a
client in-flight flag". This repo measured that exact shape failing: backlog row A26,
"two clicks while the rubric fetch was pending sent SIX grading calls", fixed by a lock held
in a ref and claimed at click time (`src/app/components/repo-grades/useRepoGradesBulkGrade.ts:216`
declares it, `:228-229` claims it before any await, `:244` releases it in a `finally`).
A `useState` flag read in the handler's closure has the same stale window. AC-W3-6 binds
the ref construction, not the disabled button.

**F-6. Copy trap: "Sent" is a forbidden word even as Canvas's own folder label.** The
forbidden list (Ruling 26, `docs/a29-architecture.md:349-351`) includes `sent`. Canvas
Inbox has a "Sent" filter, so natural recovery copy ("check your Sent folder") would fail
AC-W3-9. The unknown-outcome copy below says "Canvas Inbox" without the filter name.

**F-7. `grep` and the AST disagree on the existing builder copy.** `sed -n 420,490p
src/lib/canvas/inbox.ts | grep -nwiE "delivered|received|emailed|sent"` returns ONE hit,
a JSDoc comment ("does not prove the message was not delivered"). The two user-facing
literals at `inbox.ts:484,486` say "delivery is unconfirmed" - negations, and `delivery`
is not on the four-word list. A line-based grep over-reports (flags the comment) and a
stem rule would under-pass (flag the negations); the AC-W3-9 instrument is therefore an
AST literal scan, scoped explicitly (D-4).

## 2. Leverage claim (W3's share)

A29's class is GUARANTEED (`docs/a29-acceptance-criteria.md:105-126`): the code holds the
emitted shape and the two-bound refusal. W3 adds no new advantage class; what it must NOT do
is let the surface route around that guarantee. W3's earned contribution is one structural
property: the surface can reach the send only with a SERVER-issued `ready` preview, and the
number it shows is that preview's count. A plain chat has no send path and no count at
all. The removal test for W3 is AC-W3-2 (red when the construction that ties the send to a
ready preview is removed) together with AC-W3-3 (red when the shown count stops being the
server's). The class call itself remains the owner's (A29 RA2); it is not re-asked here.

## 3. Host isolation: the ONE swappable section

**Reading (b), the default this document designs:** the panel is mounted by exactly one
host file, `src/app/components/CanvasTab.tsx` (13 lines, `wc -l`). Its only render
expression is `return view === "announcements" ? <AnnouncementsPanel /> : <InboxPanel />;`
(`CanvasTab.tsx:12`). Under (b) the announcements branch becomes a fragment holding
`<AnnouncementsPanel />` followed by `<BulkCourseMessagePanel />`. No test reads
`CanvasTab.tsx` (`grep -rln "CanvasTab" src --include=*.test.ts` returns nothing), so the
edit flips no existing gate.

**What is host-independent (confirmed against the design, not assumed):**

| Element | Why it does not depend on the host |
|---|---|
| Confirm flow, arming signature, `ConfirmedMessage` | Pure leaf `bulk-message-model.ts`; the panel owns its own state |
| Count display | Comes from the server preview inside `ConfirmedMessage`; no host data |
| Draft-accept strip | A branch of the leaf reducer; no host data |
| Double-submit guard | `createSendLock()` leaf plus a ref inside the panel |
| Action calls | The panel imports and calls both actions itself |
| Course list | The panel calls `listCourseHubAction()` itself (same call `MessageDraftsTab.tsx:92` and `announcements-panel.tsx:96` make) |
| Persistence | Own `ta-` keys, own storage leaf; no host prop or context |
| `src/app/actions.ts` barrel line | Optional (F-2); either way it is host-independent |

The panel takes ZERO required props and reads no host context. That is what makes the host
a one-line mount.

**If the owner picks (a), the single file that changes is the HOST FILE.** Two sub-readings
of "(a) a new action on the existing Messages / message-drafts surface"
(`docs/a29-acceptance-criteria.md:433-436`), and the one-file claim needs a footnote:
- **(a1) the same self-contained panel rendered inside `MessageDraftsTab.tsx`** (525 lines,
  `wc -l`; a mount adds a few lines, far under 1000). Cost: ONE file; `CanvasTab.tsx` reverts to
  its current content. The panel, the leaf, the action and every test are byte-identical.
- **(a2) a "message the whole class" button on each drafted `message` card, seeded from that
  draft's body.** NOT a mount swap: the panel would need optional seed props
  (`{courseId?, subject?, body?}`) and `MessageDraftsTab.tsx` would pass them. Cost: the host
  file PLUS a small, additive prop on the panel. L1-L4 (builder, count reader, predicate,
  normalizer, action) are still untouched. I flag that "one file" is true of (a1) and not of
  (a2); the orchestrator's brief did not distinguish them.

One host-dependent item that no leaf can isolate: the panel's own heading level
(`<section aria-labelledby>` with an `h2`) must be re-read in whichever host is chosen.
Residual W3-R4.

## 4. What W3 consumes (read from the tree)

| Symbol | Where | Used for |
|---|---|---|
| `sendBulkCourseMessageAction(courseId, subject, body)` | `src/app/actions/bulk-course-message.ts:47` | the one irreversible call |
| `BulkCourseMessageOutcome`, `RefusalKind` (types) | `bulk-course-message.ts:17-29` | outcome rendering |
| `canvasInboxPlainText(body)` | `src/lib/bulk-course-message/plain-text.ts:6` | draft-accept strip only |
| `MAX_COURSE_RECIPIENTS = 100`, `MIN_COURSE_RECIPIENTS = 2` | `src/lib/bulk-course-message/refusal.ts:7-8` | copy that names the bounds without hardcoding 100 |
| `canLms(c)` | `src/lib/courses-table-helpers.ts:603` (value-imported by client files, e.g. `CourseRow.tsx:14` imports from that module) | eligibility filter; NOT re-implemented |
| `listCourseHubAction()` -> `{courses}` or `{error}` | `src/app/actions/course-hub-core.ts:25` | the course list |
| `draftAnnouncementAction(instruction, provider)` -> `{title,message}` or `{error}` | `src/app/actions/messaging.ts:405` (plain-text-instructed prompt at `:436`; `embedded` provider returns a scaffold with no model call, `:417-418`) | optional drafter |
| `useLlmProvider()` | `src/lib/llm-provider.ts:38` (used at `announcements-panel.tsx:51`) | provider choice for the drafter |
| `selectionSignature`, `isConfirmArmed` | `src/app/components/content-tab/modules/confirmArming.ts:20,26` | derived arming - an edit disarms by construction |
| `.kbWarnBanner`, `.kbWarnActions` | `src/app/page.module.css:6820,6833` (reused by `MessageDraftsTab.tsx:497-513`) | the inline confirm row |
| `.adaptRow`, `.ghActions`, `.fieldHint`, `.error`, `.emptyState`, `.draftSection` | `page.module.css:890,1574,258,538,543,6536` | layout and states |
| `browserLocalStorage` thunk idiom | `canvas-tab/promptAnnouncementTemplate.ts:115-125` | storage idiom (duplicated, not imported; see section 6.5) |

**Do-not-reuse list.**
- The A21 drafter `draftPromptAnnouncementAction` (`announcements-panel.tsx:18,221`): it is the
  Markdown source, couples to saved-exemplar templates and a hub-course join
  (`resolveHubCourseIdForCanvasUrl`), and is the wrong default for a private class message
  (R-5). The strip protects a future swap to it.
- `sendCanvasMessageAction` / `createConversation` (`messaging.ts:254`, `inbox.ts:384`):
  one numeric recipient and unconditional `force_new=1` (`inbox.ts:406`); the wrong shape.
- The `role="alertdialog"` marker (F-4) unless D-3 chooses it.
- Any roster action for the count (F-1).

## 5. The surface design

### 5.1 File layout (estimates are NOT measured; no new file is near the 1000-line ceiling)

New directory `src/app/components/bulk-course-message/`. A subdirectory, not
`src/app/components/` itself, because `src/app/components/componentStorageKeys.structure.test.ts`
(header, lines 1-30) is an exact-set canary over the NON-RECURSIVE listing of
`src/app/components/`; a new `ta-` key placed directly in that directory turns it red.

| File | Role | Est. lines |
|---|---|---|
| `BulkCourseMessagePanel.tsx` (`"use client"`, default export, zero required props) | markup, effects, the two action calls, the ref lock | 300-380 |
| `bulk-message-model.ts` | pure leaf: types, `confirmFromPreview`, `confirmSignature`, `eligibleLiveCourses`, `resolveSelectedCourse`, `reduceCompose`, `outcomeNotice`, `createSendLock`, the COPY constants | 140-190 |
| `bulk-message-storage.ts` | pure leaf: the two keys, read/write with explicit field lists | 60-90 |
| `bulk-message-model.test.ts`, `bulk-message-storage.test.ts`, `bulk-course-message.wiring.test.ts` | the test seat owns the final list and content | - |

Edited: `src/app/actions/bulk-course-message.ts` (78 lines now; +preview and one shared
internal resolver), `src/app/actions/bulk-course-message.test.ts` (256 lines now; the
existing 17 tests unchanged), and the host `src/app/components/CanvasTab.tsx` (13 lines now).
Conditionally (D-2) `src/app/actions.ts` (78 lines). Sizes: section 13, M-4.

Logic that needs testing lives in the two `.ts` leaves, never inline in the `.tsx`: no
component renders under vitest (`docs/loop/this-repo.md:116-118`).

### 5.2 Seam types (design, for the architect/implementer; not code)

```
// server, in bulk-course-message.ts (W3 edit)
type BulkCoursePreview =
  | { status: "ready"; courseName: string; count: number }
  | Extract<BulkCourseMessageOutcome, { status: "refused" }>;
previewBulkCourseMessageAction(courseId: string): Promise<BulkCoursePreview>

// leaf, in bulk-message-model.ts
interface ConfirmedMessage { courseId; courseName; count; subject; body }   // all strings/number
confirmFromPreview(preview, courseId, subject, body): ConfirmedMessage | null   // null unless preview.status === "ready"; trims subject and body
confirmSignature(c: ConfirmedMessage): string          // via selectionSignature over [courseId, count, subject, body]
eligibleLiveCourses(courses): Course[]                 // === courses.filter(canLms)
resolveSelectedCourse(storedId, eligible): string | null   // null if not in eligible; the only eligible course when exactly one
reduceCompose(fields, action): fields                  // action kinds: typed | drafted | cleared-after-accept
outcomeNotice(outcome, courseName): { tone: "success"|"warning"|"error"; text: string }
createSendLock(): { tryClaim(): boolean; release(): void }
```

`ConfirmedMessage` is constructible ONLY by `confirmFromPreview`. The send handler's
parameter is a `ConfirmedMessage`, so the send call is unreachable without one (AC-W3-2).

### 5.3 The preview action, and why the two actions share one resolver

`previewBulkCourseMessageAction(courseId)` runs the identical chain the send runs up to the
permit decision - `requireUser()` -> `getCourse(user.id, courseId)` -> `canLms` ->
`countActiveCourseStudents` -> `classifyRecipientCount` - and returns the count and the
STORED course name (`course.name`, so the confirm cannot show a client-chosen name) or the
same refusal the send would produce, with ZERO conversation POSTs. Construction, not
assertion: both exports call a non-exported internal resolver, so a permit/refuse
divergence between display and send is unrepresentable. Each export still writes
`requireUser()` literally in its OWN body, because `action-guard-coverage.test.ts:61`
tests `GUARD_CALL = /\brequire(Owner|User|AppOwner)\s*\(/` against each exported function
body, so a guard hidden inside the shared helper would read as unguarded. The send action's
externally visible behaviour must not change; its non-regression instrument is the existing
17 tests, unedited (AC-W3-10).

The count shown is a PRE-FLIGHT figure from Review time; the send re-reads and re-classifies,
so a class that changed in between is refused with the send's own count in the reason. The
confirm copy says "Canvas lists N active students", never "will reach N" (A-R2: Canvas's
real `course_<id>` expansion is unverified, `docs/a29-architecture.md:263-268`).

### 5.4 Flow (the instructor's path)

1. The panel mounts and calls `listCourseHubAction()`; courses failing `canLms` are dropped
   from the picker (never rendered, so no control exists for them).
2. The instructor picks a course (auto-selected if exactly one is eligible; restored from
   storage otherwise), types a subject and a message, or types a brief and presses Draft.
3. **Review message** -> `previewBulkCourseMessageAction(courseId)`. A refusal renders its
   reason (N=1, over 100, not linked, credential, unreachable) and no banner arms.
   A `ready` result builds a `ConfirmedMessage` and arms the banner.
4. The inline banner shows course name, count and the message, as in 5.7. **Confirm send**
   takes the lock, calls `sendBulkCourseMessageAction(confirmed.courseId, confirmed.subject,
   confirmed.body)`, releases the lock in a `finally`, and renders `outcomeNotice`.

Editing any field after Review changes the signature, so the banner disappears without any
reset code (the `confirmArming.ts:1-12` idiom). Cancel simply disarms.

**Click count (a reading of this layout, never measured in a browser).** Counting pointer
interactions, including the two field-focus clicks, excluding keystrokes and navigation to
the Announcements subtab: **first use, typed message: 5** (pick course 1, focus subject 1,
focus message 1, Review 1, Confirm 1) - **4** if exactly one eligible course auto-selects.
**First use, AI-drafted: 5** (pick course, focus brief, Draft, Review, Confirm; the drafter
fills the editable fields with no accept click). **Repeat use, course restored: 4** (focus
subject, focus message, Review, Confirm), of which exactly 2 are buttons that cost
anything. No step can be removed without dropping the confirm, which the owner wants kept
(AC-8). Keyboard Tab traversal removes the field-focus clicks.

### 5.5 State and persistence (`ta-` keys; standing rule `persist-ui-control-state`)

Four controls persist: course select, subject, body, drafting brief. Two keys:
- `ta-bulk-msg-course` - the selected app course id (a string).
- `ta-bulk-msg-drafts` - ONE JSON object keyed by course id, each value exactly
  `{subject, body, prompt}`. The write path enumerates those three fields explicitly; it
  does not spread, so a future field cannot leak in (data-seat checker question,
  `docs/loop/seats.md:217-226`).

Never persisted: the armed signature, the `ConfirmedMessage`, the preview, the outcome, the
lock. A reload must NEVER reopen a confirmation the instructor has not re-reviewed
(AC-W3-11); the armed state is plain component state.

Hydration idiom: text fields seed from a lazy `useState` initializer through the
`browserLocalStorage` thunk idiom (`promptAnnouncementTemplate.ts:100-125` states why an
initializer, not a mount effect, is right for a controlled TEXT value; the mount-effect
rule is for boolean attributes like `<details open>`). The thunk exists so a blocked-storage
throw lands inside the caller's `try`. I DUPLICATE the four-line thunk into the storage
leaf rather than import it, because that module also pulls the A21 template machinery.

Storage lifecycle: sign-out erases it by default, which is the wanted behaviour (a previous
user's unsent class message must not appear for the next sign-in). `DEVICE_PREFERENCE_KEYS`
is `["ta-theme"]` (`src/lib/client-state-sweep.ts`) and these keys are deliberately NOT added.
A successful accept clears that course's entry. Size: NOT measured; a typical message is
short text, but the per-course map is unbounded and I did not quantify it. Whether to cap
field length is the data seat's call (W3 UX pass); I assert no figure.

### 5.6 Draft-accept: where the strip applies, exactly

"Draft-accept" is the instant a drafter's result is committed into the editable fields: the
`drafted` action of `reduceCompose`. There is no separate accept click (minimizing clicks);
the result fills the fields and the instructor edits or presses Review.
- `drafted` -> `subject = canvasInboxPlainText(result.title)`, `body =
  canvasInboxPlainText(result.message)`. Applying it to the drafter's title as well as the
  body is my choice, since a model title can carry markup too; the strip is conservative
  (`plain-text.ts:1-5`).
- `typed` -> value stored byte-for-byte. A typed `**x**` stays `**x**`: AC-9's own text says
  the strip fires "only when a drafter feeds the body". The body field carries the hint "Plain
  text only. Canvas Inbox does not render formatting." so a typed asterisk is not a surprise.
- The send path never strips. `sendBulkCourseMessageAction` passes the body verbatim
  (`bulk-course-message.ts:74`, header comment `:5-6`), and what is confirmed is what is stored.
- A drafter `{error}` result dispatches nothing; fields stay as they were and the error text
  shows in the notice area.

### 5.7 Copy (exact; no emojis; ASCII here, with the ellipsis character the sibling copy uses)

Self-scanned for the four forbidden words (M-6). Strings that carry a value show it in braces.

| State | Copy |
|---|---|
| Section title | `Message your class` |
| Subtitle | `Compose one Canvas Inbox message addressed to a whole course. It is not an announcement: nothing is posted on the course page.` |
| Loading courses | `Loading your courses...` (sibling copy uses the single ellipsis character, `MessageDraftsTab.tsx:310`) |
| Courses failed | `Could not load your courses.` plus the action's `error` text |
| No eligible course | `No course is connected to Canvas yet. Link a course to Canvas and choose its institution to message its students.` |
| Course field | label `Course` |
| Subject field | label `Subject (what students see in their Canvas Inbox)` (mirrors `MessageDraftsTab.tsx:453`) |
| Message field | label `Message`, hint `Plain text only. Canvas Inbox does not render formatting.` |
| Drafting | label `Draft with AI (optional)`, field label `What should the message say?`, button `Draft`, busy `Drafting...` |
| Review disabled | hint `Choose a course and add a subject and a message to review.` |
| Review | button `Review message`, busy `Checking class size...` |
| Refused at review or send | the action's `reason`, verbatim, in the `.error` style (e.g. `A course message needs at least 2 students; this course has 1.`, `bulk-course-message.ts:37`) |
| Confirm banner | `Send this message to {course}? Canvas lists {n} active students. It uses Canvas Inbox, not a course announcement. Sending cannot be undone.` then `Subject: {subject}` and the body in a pre-wrap block |
| Confirm / cancel | `Confirm send` (busy `Sending...`) / `Cancel` |
| Accepted | `Canvas accepted the message for {course}. Whether each student also gets an email depends on their Canvas notification settings, which this app cannot see.` |
| Unknown | `Canvas did not confirm the message.` then `It may or may not have gone out. Check your Canvas Inbox before trying again, so it is not posted twice.` then the action's `reason` as a detail line |
| Partial | none exists: one request, one outcome (OC9) |

The confirm shows `confirmed.subject` and `confirmed.body`, which are already trimmed, because
the builder trims both (`inbox.ts:464` for the body, `:465-466` for the subject).

### 5.8 Visual language (reused, nothing invented)

Container `.draftSection` (`page.module.css:6536`, a 1px `--card-border` card, the Drafts-tab
pattern); control rows `.adaptRow` (`:890`) and `.ghActions` (`:1574`); hints `.fieldHint`;
errors `.error`; empty `.emptyState`; the confirm row `.kbWarnBanner`/`.kbWarnActions`
(`:6820,6833`) exactly as `MessageDraftsTab.tsx:497` reuses it, rendered BELOW the compose
fields so the confirming click is never at the pixel the arming click was (B2 precedent,
`MessageDraftsTab.tsx:490-495`). Spacing uses the `--space-*` tokens already used inline at
`MessageDraftsTab.tsx:320,363,497`; no new CSS is added to `page.module.css` (7034 lines,
`wc -l`; `.css` is outside the size-ceiling test's extension filter, so this is a
preference, not a gate). Outcome tones use tokens that exist: `--success-ink`
(`globals.css:181`, flipped to `#4ade80` in the dark block at `:305`), `--warning-ink`
(`:167`, `#fcd34d` dark at `:304`), `--warning-surface`/`--warning-border` (`:189-190`), and
`.error`'s `--danger`. Their contrast in BOTH themes is NOT measured here (`html[data-theme="dark"]`
is the only route to dark, `docs/loop/seats.md:305-308`); residual W3-R5.

Reading-only accessibility notes, handed to the Wave-3 accessibility seat; none is machine
checked: the outcome notice sits in a `role="status"` region mounted unconditionally (a
region that mounts with its first message often does not announce); the banner is
`role="group"` with an `aria-label` (F-4); every button sets `type="button"` explicitly; no
`onKeyDown` is added, so the MUI `slotProps.input`/`htmlInput` trap does not apply; fields and
the course select are disabled while the send is in flight.

### 5.9 The three places this design could mislead the user

1. **The count reads as a promise.** "N active students" is a Review-time estimate, not who
   Canvas will message (A-R2). Fix: copy says "Canvas lists", never "will reach". Load-bearing:
   AC-W3-9 forbids the verbs that would turn it into a delivery claim.
2. **The unknown outcome invites a second whole-class send. This is the worst one**: it is
   irreversible and reaches every student. The draft is retained after `unknown` so the
   instructor can retry, which makes a duplicate one click closer. Fix that is load-bearing,
   not decorative: no path skips Review and Confirm (AC-W3-2/4), the lock is released only
   after the call settles, and the notice says to check Canvas Inbox first. The warning copy
   alone would be decorative.
3. **An announcement and this message sit side by side.** Under (b) the panel is mounted
   under the announcement composer, so the instructor could post publicly when they meant
   privately, or the reverse (A29 R-3). Fix: the subtitle and the confirm banner each name
   the channel in plain words. Placement above or below the composer is a visual-seat call.

## 6. Acceptance criteria

Class tags: [MACHINE] a node-env test or the type checker can fail it; [READING] verified only
by reading source; [OWNER] verified only in a real browser by the owner. Nothing renders under
vitest, so no criterion's pass condition is a rendered fact; section 7 separates them. Each
criterion names the object, the instrument, and the direction of failure. Counts of call sites
use `src/tools/symbol-count/count.ts` (AST CALL bucket), never `grep -c`
(`docs/loop/traps-spec.md:160-178`).

### AC-W3-1 - the control reaches the actions with the right arguments, and is mounted [MACHINE + READING]
- Object: the call expressions in `BulkCourseMessagePanel.tsx`, and the set of non-test files
  outside the panel directory that render the panel.
- Instrument: [MACHINE] an AST wiring test (the `typescript` compiler API, the precedent is
  `repoGradesClassTrends.wiring.test.ts`): (i) exactly ONE call whose callee is
  `sendBulkCourseMessageAction`, with exactly THREE arguments; (ii) exactly ONE call of
  `previewBulkCourseMessageAction` with ONE argument; (iii) both identifiers import from a
  module specifier ending `/actions/bulk-course-message` OR from the actions barrel
  (accepts either, so D-2 does not bind); (iv) exactly ONE non-test file outside
  `src/app/components/bulk-course-message/` contains the JSX element
  `BulkCourseMessagePanel`, and it is the chosen host file. Canary: the same scan over a
  fixture with a second call must report 2.
- Direction of failure: FAIL when the send-call count is 0 (a dead surface with every gate
  green - the standing reachability trap, `docs/loop/traps-spec.md:58-64`) or 2 or more (a
  second send path that bypasses the confirm); FAIL on arity other than 3 or 1; FAIL when no
  host mounts the panel, or two do.

### AC-W3-2 - nothing sends without a SERVER-issued ready preview [MACHINE + READING]
- Object: the type of the function that contains the send call, and the one constructor of
  `ConfirmedMessage`.
- Instrument: [MACHINE] `npx tsc --noEmit` (no output) plus an AST pin: the function
  enclosing the send call has a parameter annotated `ConfirmedMessage`, and
  `ConfirmedMessage` objects are created only inside `confirmFromPreview`. A leaf test over
  `confirmFromPreview`: a `ready` preview yields an object whose `count` and `courseName`
  equal the preview's; EVERY refused preview (one row per `RefusalKind`, derived from the
  closed type, not hand-listed) yields `null`. [READING] the Confirm button is rendered only
  inside the armed branch.
- Direction of failure: FAIL if any refused preview yields a `ConfirmedMessage`; FAIL if the
  send call's enclosing function lacks the parameter; FAIL if a second constructor exists.
  This is W3's removal test (section 2): remove the construction and these go red.

### AC-W3-3 - the confirm shows course name, count and message, and every one is server-driven (AC-8) [MACHINE + OWNER]
- Object: the three values the banner renders and where each comes from.
- Instrument: [MACHINE] (a) the leaf that builds the banner content, given a
  `ConfirmedMessage`, returns text containing `courseName`, the decimal count, the trimmed
  subject and the trimmed body (table over counts 2, 50 and 100, and a course name carrying
  `&`, `<` and a quote). (b) an AST allowlist: the set of server-action identifiers the panel
  directory imports is EXACTLY {`sendBulkCourseMessageAction`, `previewBulkCourseMessageAction`,
  `listCourseHubAction`, `draftAnnouncementAction`}; type-only imports excluded. An allowlist,
  not a denylist (`docs/loop/seats.md:115-122`: the denylist version of this kind of boundary
  was lengthened 1 -> 3 -> 6 -> 9 and stayed open). So no roster or student-list action can
  supply a number. (c) the panel directory has no value import from `@/lib/canvas`,
  `@/lib/canvas-modules` or `@/lib/supabase/*` (`src/lib/canvas-client-boundary.test.ts`
  already walls the first two for `"use client"` files; this pins the third). [OWNER] OV-2a:
  the rendered banner shows all three.
- Direction of failure: FAIL if the banner content omits any of the three; FAIL if the
  panel imports any server action outside the allowlist; FAIL (owner) if the rendered banner
  lacks any of the three; FAIL if the displayed count is not the number the preview returned.
  The machine half cannot see what the DOM shows - that is OV-2a.

### AC-W3-4 - what was confirmed is what is sent; editing disarms; reload never reopens a confirm [MACHINE + OWNER]
- Object: `confirmSignature` against the current inputs, and the persisted state.
- Instrument: [MACHINE] a leaf table: `confirmSignature` differs when any of course id, count,
  subject or body differs, and is equal when only leading/trailing whitespace differs (the
  builder trims, so that edit does not change what leaves). A storage-leaf test:
  after writing the full state, no stored value contains the armed signature, the preview or
  the `ConfirmedMessage`. An AST pin: the three send arguments are member accesses on the one
  `ConfirmedMessage` parameter, never on component state read at click time. [OWNER] OV-2e:
  edit a field with the banner open and the banner disappears; reload with the banner open
  and no banner returns.
- Direction of failure: FAIL if editing the subject or body after Review leaves the banner
  armed (text the instructor never confirmed would go out); FAIL if the send arguments come
  from live state rather than the confirmed object; FAIL if any arming state is persisted
  (a reload would offer a one-click irreversible send).

### AC-W3-5 - the plain-text strip is applied at draft-accept and NOT to a typed body (AC-9) [MACHINE]
- Object: the `subject`/`body` fields produced by `reduceCompose` for a `drafted` action
  versus a `typed` action.
- Instrument: [MACHINE] a leaf table over `reduceCompose`: for a `drafted` result whose
  `message` contains a heading marker, bold markers, a list bullet and an HTML tag, the
  resulting `body` contains none of them and keeps the words; the same text through a
  `typed` action is stored byte-identical. The strip is the shared W1 leaf, whose own
  oracle already exists (`plain-text.test.ts`), so this table pins the FACT of invocation,
  not its spelling. An AST pin: `canvasInboxPlainText` has exactly ONE call in the panel
  directory, inside `reduceCompose`'s `drafted` branch, and the body field's change handler
  dispatches `typed` only. The send handler references `canvasInboxPlainText` zero times.
- Direction of failure: FAIL if a drafted body keeps markup; FAIL if a typed body is altered;
  FAIL if the strip runs at send time (the confirmed text would differ from the text the
  instructor edited); FAIL if the drafter-error path commits anything to the fields.

### AC-W3-6 - one send per confirm; the guard is a synchronous ref lock, released in a finally (R-2) [MACHINE + OWNER]
- Object: the number of `sendBulkCourseMessageAction` calls produced by repeated activation of
  Confirm.
- Instrument: [MACHINE] a leaf test of `createSendLock`: the first `tryClaim()` returns
  true, an immediate second returns false, and after `release()` a third returns true. An AST
  pin on the confirm handler: a `tryClaim()` call precedes the first `await`, and
  `release()` appears inside a `finally`. The test seat may escalate to driving the real
  handler with a stand-in React, as `useRepoGradesBulkGrade.lifecycle.test.ts` did for A26.
  [OWNER] OV-2c: a double-click on Confirm shows ONE server-action request in the browser's
  network panel, and Confirm is disabled while it is in flight.
- Direction of failure: FAIL if two back-to-back claims both succeed; FAIL if the claim comes
  after an `await` (the A26 stale window, F-5); FAIL if `release()` is not in a `finally` (a
  rejected call would leave the surface stuck, the A27 shape); a `useState` flag alone is NOT a
  pass.

### AC-W3-7 - the control is absent on a course without a live LMS connection (AC-5, display half) [MACHINE + READING + OWNER]
- Object: the set of courses the picker offers, and whether compose controls render for a
  selection that fails `canLms`.
- Instrument: [MACHINE] a leaf table over `eligibleLiveCourses` on the cross product of
  `canvasUrl` in {empty, whitespace, set} and `institution` in {empty, whitespace, set}:
  exactly the (set, set) row is eligible. The axes come from `canLms`'s definition
  (`courses-table-helpers.ts:603-605`), the expected table is written independently. An AST
  pin: the panel directory reads no `canvasUrl` or `institution` property (it delegates to
  `canLms`, not a second predicate). A leaf table over `resolveSelectedCourse`: a stored id
  absent from the eligible set resolves to `null` (a course unlinked since the last visit must
  not render compose controls); exactly one eligible course resolves to itself.
  [READING] compose controls render only when the resolved id is non-null; the empty-state
  copy of 5.7 shows when none is eligible. [OWNER] OV-2b.
- Direction of failure: FAIL if a row with a blank `canvasUrl` or blank `institution` is
  eligible; FAIL if the surface defines its own predicate; FAIL if a stale stored id still
  yields compose controls; FAIL (owner) if the controls are visible for a non-live course. The
  server already refuses these with zero Canvas requests (`bulk-course-message.ts:54-62`,
  proven by the W2 tests); this criterion is the display half, a convenience, not the guard.

### AC-W3-8 - outcome rendering never claims delivery (AC-7 at the surface) [MACHINE + OWNER]
- Object: `outcomeNotice(outcome, courseName)` over the closed outcome union.
- Instrument: [MACHINE] a leaf table: `accepted` -> tone `success`, text contains
  `Canvas accepted` and the course name; `unknown` -> tone `warning`, text contains
  `did not confirm`, does NOT contain `Canvas accepted`; every `refused` kind (one row per
  `RefusalKind`, derived from the type) -> tone `error` and the text CONTAINS the outcome's
  `reason` verbatim. The three tones are pairwise distinct. After `accepted`, `reduceCompose`
  `cleared-after-accept` empties subject and body; after `refused` and `unknown` the fields are
  unchanged (retry without retyping; the accepted case clears so the same text is not
  re-sent by habit).
- Direction of failure: FAIL if `unknown` maps to the success tone or to the accepted copy
  (an ambiguous 5xx or timeout must never read as success, Ruling 26,
  `docs/a29-acceptance-criteria.md:310-312`); FAIL if a refusal drops its `reason`; FAIL if
  `accepted` copy asserts that a student received anything; FAIL if a non-accepted outcome
  clears the draft. [OWNER] OV-2f: the three notices read correctly in light and dark theme.

### AC-W3-9 - no delivery word in user-facing copy: AST literal scan (A29W2-R3) [MACHINE]
- Object: every string-bearing node (string literal, no-substitution template, template
  head/middle/tail text, JSX text, JSX attribute string) in three scopes: (1) every non-test
  `.ts`/`.tsx` in `src/app/components/bulk-course-message/`; (2) `src/app/actions/bulk-course-message.ts`;
  (3) the body of the function `createCourseConversation` in `src/lib/canvas/inbox.ts`
  (`:444-488`), because its `reason` strings reach the unknown and refused notices.
- Instrument: [MACHINE] a source-text test using the TypeScript AST (comments are not nodes,
  so the JSDoc at `inbox.ts:441` is not flagged - the point of F-7), matching
  `\b(delivered|received|emailed|sent)\b` case-insensitively. Over-inclusive on purpose: it
  scans every string-bearing node, not only ones a human would call copy, because that
  definition cannot be argued. Required canaries: (a) a fixture `.tsx` containing
  `<p>Sent</p>` is flagged (proves the JSX-text channel is scanned); (b) a fixture with a
  forbidden word only in a comment is NOT flagged; (c) each scope visits at least one
  string node (non-vacuity). Measured on the shipped scopes this pass: scope 2 returns no
  `grep -nwiE` hit and scope 3 only the comment (M-5).
- Direction of failure: FAIL if any scanned node matches; FAIL if a scope yields zero nodes
  or the JSX canary is not flagged (a vacuous scan is a pass that measures nothing).
- Instrument limits, stated: runtime-assembled strings (`"se" + "nt"`), the dynamic `reason`
  from any scope outside the three above, and the Canvas notification email itself are
  invisible to a source scan. The word `delivery` and the stems `deliver*`/`email` are NOT
  on the list (D-4).

### AC-W3-10 - the preview action is a read-only twin of the send, and the send is unchanged [MACHINE]
- Object: `previewBulkCourseMessageAction`'s outputs and side effects, and the existing send
  action's behaviour.
- Instrument: [MACHINE] the W2 test file's mock seams (`bulk-course-message.test.ts`,
  `h.order` recorder): (1) `requireUser` is called first; (2) for counts 2, 50, 100 ->
  `{status:"ready", courseName: course.name, count}` and the key set is a subset of
  {status, courseName, count}; (3) count 1 -> refused `one-student`, 101 -> refused
  `over-max`, each carrying the count in the reason; (4) a course failing `canLms`, and a
  null `getCourse`, -> refused with ZERO `countActiveCourseStudents` calls; (5) a count read
  that throws the credential message -> `no-credential`, any other throw ->
  `canvas-unreachable`; (6) `createCourseConversation` is called ZERO times in every case;
  (7) PARITY: for each count fixture, the preview refuses iff the send refuses, with the same
  `kind`, and the preview is `ready` iff the send POSTs. Non-regression: the 17 existing tests
  in that file pass UNEDITED (`npx vitest run src/app/actions/bulk-course-message.test.ts`,
  17 passed at HEAD) and `action-guard-coverage.test.ts` stays green (literal `requireUser()`
  in each export's own body, section 5.3).
- Direction of failure: FAIL if the preview ever calls the builder; FAIL if preview and send
  disagree on any fixture in either direction; FAIL if `requireUser` is not first; FAIL if the
  ready arm carries a roster or per-student field; FAIL if any of the 17 existing tests needs
  editing to pass (that is a finding, not a fix).

### AC-W3-11 - persistence: the right keys, explicit fields, nothing that authorises a send (R-4) [MACHINE + READING]
- Object: the localStorage keys the panel directory writes and the values written.
- Instrument: [MACHINE] a storage-leaf test: read of an absent, a malformed and a
  throwing-thunk storage returns defaults and never throws; write of an object carrying extra
  fields stores ONLY `{subject, body, prompt}` per course; round trip is the identity for
  those three; `cleared-after-accept` removes the course's entry. A directory-scoped key
  canary in the style of `componentStorageKeys.structure.test.ts`: the pattern
  `/(?<![a-zA-Z0-9_])ta-[a-z0-9-]*[a-z0-9]/g` over the non-test source of the panel directory
  matches EXACTLY {`ta-bulk-msg-course`, `ta-bulk-msg-drafts`}. [READING] text fields seed
  from a lazy initializer; no module-scope `*Cache` is declared (`client-state-sweep.registry.test.ts`
  would require registration).
- Direction of failure: FAIL if a third key appears or either key is missing; FAIL if an extra
  field is persisted; FAIL if armed or confirmed state is persisted; FAIL if a storage throw
  escapes the leaf.

### AC-W3-12 - host isolation: a zero-prop panel, one mount, no host reach-through [MACHINE + READING]
- Object: the panel's props and imports.
- Instrument: [MACHINE] AST: the default export takes no parameters or only optional ones;
  no file in the panel directory imports a path under `canvas-tab/`, `MessageDraftsTab`,
  `CanvasTab`, or any host module; mount count per AC-W3-1(iv). [READING] section 3's table.
- Direction of failure: FAIL if the panel reads a host prop or context, or imports host
  code (this is what would turn the owner's (a1) answer from a one-file change into several);
  FAIL if more than one host mounts it.

### AC-W3-13 - neighbouring gates stay green; model and server text reaches the DOM only as text [MACHINE]
- Object: the new files against the existing structural gates, and the panel's DOM sinks.
- Instrument: [MACHINE] these must stay green with the new files present:
  `src/lib/no-emojis.test.ts`, `src/source-bytes.structure.test.ts`,
  `src/file-size-ceiling.structure.test.ts`, `src/app/components/ui/modalAdoption.wiring.test.ts`
  (F-4), `src/app/components/componentStorageKeys.structure.test.ts` (F: the keys live in a
  subdirectory), `src/lib/canvas-client-boundary.test.ts`, `src/lib/use-server-exports.test.ts`,
  `src/app/actions/action-guard-coverage.test.ts`, and the unchanged
  `src/lib/bulk-course-message/unattended-callers.structure.test.ts`. Run as a set with
  `npm run test:paths -- <p1> <p2> ...` (never a raw multi-path vitest; `this-repo.md:40-45`).
  An AST pin: the panel directory contains zero `dangerouslySetInnerHTML` uses and zero
  `innerHTML` assignments, because drafter text and server `reason` strings are model- or
  network-derived and must reach the DOM as React text only.
- Direction of failure: any of the named gates red; any DOM-HTML sink in the panel directory.
  The orchestrator's gate list is a FLOOR: the implementer derives the full walker set with
  `grep -rl "readdirSync" src --include=*.test.ts` (50 files at HEAD, per
  `docs/a29-architecture.md:637`, which I did not re-count) and runs the full suite before push.

## 7. MACHINE versus OWNER: what each side can and cannot show

Nothing here renders. Every row's right-hand column is what the machine half CANNOT establish.

| Criterion | Machine-pinnable (instrument) | What it cannot show | Owner-verified (browser) |
|---|---|---|---|
| AC-W3-1 reaches the action | AST: 1 send call, 3 args; 1 preview call; 1 host mount | that a click lands | OV-1 whole flow against a sandbox |
| AC-W3-2 no send without a ready preview | tsc + AST + leaf `confirmFromPreview` table | that the Confirm button is hidden before Review | OV-2a |
| AC-W3-3 confirm contents | leaf banner-text table; AST action allowlist; import wall | what the DOM shows | OV-2a: course, count and message visible |
| AC-W3-4 confirmed is sent | leaf signature table; storage leaf; AST send args | disarm on edit as a rendered fact; reload behaviour | OV-2e |
| AC-W3-5 strip at draft-accept | leaf `reduceCompose` table; AST single call site | the text in the textarea after a real drafter run | OV-2g (with R-5, draft voice) |
| AC-W3-6 one send per confirm | `createSendLock` leaf; AST claim-before-await and finally | real double-click timing; button disabled | OV-2c |
| AC-W3-7 absent when not live | leaf `eligibleLiveCourses` 3x3 table; `resolveSelectedCourse` | that no control is on screen | OV-2b |
| AC-W3-8 no delivery claim | leaf `outcomeNotice` table | how the notices look in either theme | OV-2f; OV-3 |
| AC-W3-9 copy scan | AST literal scan, three scopes, canaries | dynamic strings; the notification email | OV-3 |
| AC-W3-10 preview twin | action driven with mocked store and Canvas | real Canvas counts | OV-2d (N=1 and over-100 courses) |
| AC-W3-11 persistence | storage leaf; key canary | hydration in a real browser | OV-2e (reload) |
| AC-W3-12 host isolation | AST props and imports | visual fit in the host | OV-2h (heading and spacing in the mounted host) |
| AC-W3-13 gates | the named tests; AST sinks | - | - |

**Owner verification, extending OV-2 (`docs/a29-acceptance-criteria.md:369`) into atomic checks.**
Instrument for all: a real browser against the deployed app; steps: the Verify pass before the push.
OV-2a the banner shows course, count and message; OV-2b no control on a non-live course, with the
empty-state copy when none is eligible; OV-2c a double-click on Confirm issues one request and the
button disables; OV-2d a one-student course and an over-100 course each show their own reason and
send nothing; OV-2e edit-after-Review disarms and a reload never reopens a confirm and every field
is restored; OV-2f the three notices read correctly in light and dark; OV-2g a real drafter run
fills the fields with plain text; OV-2h the panel's heading level and spacing in the chosen host.
OV-1 (a sandbox send arrives as a private conversation per student) and OV-3 (the notification
email is outside the app's view) are unchanged. No browser behaviour above is asserted as
machine-verified.

## 8. Write set, order and disjointness

W3 sub-order (the plan seat owns the cut; the dependency is real): the preview action first,
because the panel's type imports it; then the leaves and panel; the host mount last.

| Path | New / edit | Why |
|---|---|---|
| `src/app/actions/bulk-course-message.ts` | edit | preview + shared resolver (F-1) |
| `src/app/actions/bulk-course-message.test.ts` | edit (append only) | AC-W3-10 |
| `src/app/components/bulk-course-message/BulkCourseMessagePanel.tsx` | new | the surface |
| `src/app/components/bulk-course-message/bulk-message-model.ts` | new | pure leaf |
| `src/app/components/bulk-course-message/bulk-message-storage.ts` | new | pure leaf |
| `src/app/components/bulk-course-message/bulk-message-model.test.ts` | new | test seat |
| `src/app/components/bulk-course-message/bulk-message-storage.test.ts` | new | test seat |
| `src/app/components/bulk-course-message/bulk-course-message.wiring.test.ts` | new | test seat (AST pins) |
| `src/app/components/CanvasTab.tsx` | edit | THE HOST MOUNT; the file that moves under (a) |
| `src/app/actions.ts` | edit, ONLY if D-2 keeps the barrel line | one `export * from` line |

Caller rule (`docs/loop/seats.md:160-164`): the panel calls both actions, the host calls the
panel, the leaves are called by the panel. Disjointness against shipped W1/W2: W3 EDITS one W2
file and its test and no W1 file; the implementer re-runs the exact-path `sort | uniq -d`
intersect against the assignment with its duplicate-a-set canary. Gate: the wave's tests via
`npm run test:paths -- <the three panel-directory tests> src/app/actions/bulk-course-message.test.ts`,
then `npx tsc --noEmit` (one caller only), `npm run lint` (exit 0, no NEW warning in these
files), the build `Compiled successfully` line (not the exit code), `git status --short`
against this table, and no `.claude/worktrees` copy edited. Not trivially revertible: the
preview action is additive and the edit to the send action is a pure extraction; reverting
W3 means reverting one commit that edits W2's file.

## 9. Triage record (which design seats this chunk's triggers fire)

Per `docs/loop/seats.md:46-59`. Security FIRES (a new `"use server"` export, and model-authored
text reaching the DOM). Data/storage FIRES (two `ta-` keys). Accessibility FIRES (markup and
focus). Visual FIRES (a new surface). UX is this document. Reliability FIRES lightly (the
unknown outcome and the lock; the preview doubles the count reads, two pages at most per
`docs/a29-architecture.md:248-253`). Operability and admin: does not fire (nothing the owner
configures). External-facts: the one open fact is R-7, which this environment cannot measure.

## 10. Carried obligations (nothing from the A29 AC dropped by this document)

| Inherited requirement | Disposition |
|---|---|
| AC-5 display half (control absent) | KEPT, AC-W3-7; server half already shipped and tested in W2 |
| AC-7 reading half (copy) | KEPT, AC-W3-8 and AC-W3-9 (A29W2-R3, routed here) |
| AC-8 confirm with course, count, message; count equals the predicate's | KEPT, AC-W3-3, via the preview action (F-1) |
| AC-9 strip at draft-accept only | KEPT, AC-W3-5 |
| AC-10 no unattended caller | HANDED to the existing W2 test, which stays green (AC-W3-13). The preview is a read; the identifier test names only the send, unchanged |
| R-2 double-submit guard | KEPT, AC-W3-6 (a ref, not a flag, F-5) |
| R-3 not choosing blind between message and announcement | KEPT as copy, section 5.7 and 5.9 item 3; the placement is the visual seat's |
| R-4 persistence | KEPT, AC-W3-11 |
| R-5 does the drafter's voice suit a private message | CARRIED, residual below |
| A-R4 host size | KEPT: no touched file is near 1000 (section 13, M-4) |
| A-R6 / Q-1 placement | CARRIED, section 3; one file moves |
| OV-1, OV-3 | KEPT unchanged; OV-2 split into OV-2a..h |

## 11. Neighbour tests I opened (the floor, not the set)

`modalAdoptionScan.ts:60-62,236-248`; `componentStorageKeys.structure.test.ts` header;
`client-state-sweep.ts` header and `DEVICE_PREFERENCE_KEYS`; `action-guard-coverage.test.ts:1-60`
and `:60-63` guard regex; `canvas-client-boundary.test.ts:1-70`; `file-size-ceiling.structure.test.ts:30-110`;
`unattended-callers.structure.test.ts` (whole file); `bulk-course-message.test.ts:1-80,248-256`
(the egress pin at `:250-255` reads the action's source and forbids `callLlm`, `@/lib/llm` and
mail-provider names - the preview must not add any).

## 12. Decisions for the orchestrator (each terminates; either answer ends the activity)

- **D-1 - the preview action.** (A, recommended) W3 adds `previewBulkCourseMessageAction`
  and edits W2's file, as designed. (B) Ship the confirm WITHOUT a count; this fails AC-8's
  count clause and your own server-count requirement, so it needs an owner ruling to waive.
- **D-2 - the barrel line.** (A, recommended) Omit it; import directly (F-2). (B) Add the one
  `export * from "./actions/bulk-course-message";` line; then `grep -c "^export \* from"
  src/app/actions.ts` goes 54 -> 55 and AC-W3-1 is unchanged.
- **D-3 - the confirm marker.** (A, recommended) `role="group"` plus `aria-label`, no gate
  edit. (B) `role="alertdialog"` plus a `PERMANENT_EXCLUSIONS` entry in
  `modalAdoptionScan.ts`, matching the two siblings; that file joins the write set.
- **D-4 - the forbidden-word scope.** (A, recommended) The four AC-7 words, over the three
  scopes. (B) Add `deliver*`/`email*` stems; that would fail the two shipped W1 literals at
  `inbox.ts:484,486` and force an edit to a W1 file, so it widens W3.

Choices inside this design that a checker should attack hardest, because they are mine and
new: the preview action and its shared resolver; the `ConfirmedMessage` construction as the
only route to a send; the AST claim-before-await pin for the lock; the typed-versus-drafted
reducer split; scope (3) of the copy scan reaching into `inbox.ts`; applying the strip to the
drafted title; clearing the draft only on `accepted`; avoiding the dialog marker.

## 13. Measurements (every quantity names the command that produced it)

| Id | Quantity | Command | Result |
|---|---|---|---|
| M-1 | non-test action files / barrel lines / files not in barrel | `ls src/app/actions/*.ts \| grep -v "\.test\.ts" \| wc -l`; `grep -c "^export \* from" src/app/actions.ts`; a shell loop testing each file's basename against `actions.ts` | 116 / 54 / 62 (116 = 54 + 62) |
| M-2 | W2 tests at HEAD | `npx vitest run src/app/actions/bulk-course-message.test.ts` | `Tests 17 passed (17)`; the W2 commit message says 35, unreconciled |
| M-3 | `createCourseConversation` string literals mention delivery | `grep -n "delivery is unconfirmed" src/lib/canvas/inbox.ts` | lines 484 and 486 |
| M-4 | sizes now | `wc -l` (agrees with `@(Get-Content).Count` on 13 files, `this-repo.md:7-9`) | `CanvasTab.tsx` 13, `MessageDraftsTab.tsx` 525, `bulk-course-message.ts` 78, `actions.ts` 78, `canvas-tab/announcements-panel.tsx` 533, `inbox-panel.tsx` 733, `page.module.css` 7034 |
| M-5 | forbidden words in shipped scopes | `grep -nwiE "delivered\|received\|emailed\|sent" src/app/actions/bulk-course-message.ts`; same over `sed -n 420,490p src/lib/canvas/inbox.ts` | scope 2: no hit; scope 3: one hit, a JSDoc comment (an AST scan ignores it) |
| M-6 | forbidden words in THIS document's copy table (section 5.7, lines 318-343) | `sed -n 318,343p docs/a29-w3-surface-ac.md \| grep -nwiE "delivered\|received\|emailed\|sent"`; canary `echo "Canvas sent it" \| grep -nwiE ...` | copy table: no hit (exit 1); canary: hit (exit 0). `send`/`Sending` appear and are not matched (word boundary) |
| M-9 | docs gate over this file | `npm run docs:gate` | 3 files, 49 tests passed; COVERED per-argument lines for `no-emojis.test.ts` (18), `source-bytes.structure.test.ts` (3), `gate-commands.structure.test.ts` (28) |
| M-7 | no test reads the host file | `grep -rln "CanvasTab" src --include=*.test.ts` | empty |
| M-8 | `.css` is outside the size gate | `src/file-size-ceiling.structure.test.ts` extension regex `/\.(ts\|tsx)$/` | confirmed by reading `:107-111` |

## 14. Residual register (owner, instrument, step - a residual missing any is a deletion)

These need rows in `docs/BACKLOG.md`, which the orchestrator owns under concurrency; until
filed they are not yet real (`docs/DEV_LOOP.md` step 0).

| Id | Residual | Owner | Instrument | Step |
|---|---|---|---|---|
| R-7 / DECISION-1 / OC11 | Whether one POST to `course_<id>` expands to N private conversations (false at N=1, which the surface refuses), and whether an email actually arrives per each student's notification setting | Repo owner | A live authenticated send to a Canvas sandbox course of a known size, then a test student's Canvas Inbox and mailbox (OV-1, OV-3) | Verify, before the push |
| A-R2 | The Review-time active count may differ from the set Canvas expands to; the confirm copy says "lists", not "will reach" | Repo owner | The same sandbox send; compare who Canvas messaged to the displayed count | Verify, before the push, with R-7 |
| R-5 | Whether `draftAnnouncementAction`'s announcement voice suits a private class message | Repo owner | Read a real drafted message in the panel (OV-2g) | Post-deploy owner verification |
| A-R6 / Q-1 | The host fork itself | Repo owner | Section 3's two readings; (a2) needs the extra prop | Owner answers before the Verify pass; the panel and leaves are unaffected |
| W3-R1 | The preview action and the shared-resolver edit land in W2's file; the 17 existing tests are the only instrument that the send is unchanged | Test seat | `npx vitest run src/app/actions/bulk-course-message.test.ts` before and after, original titles unedited | W3 verify |
| W3-R2 | Whether a barrel `export *` of the send widens action-id exposure under this Next version (F-2) - unverified | Orchestrator, only if D-2 chooses (B) | Read `node_modules/next/dist/docs/` for server-action id emission | Before W3 build, only on D-2 (B) |
| W3-R3 | `listCourseHubAction()` returns whole course rows (including CSV and rubric blobs) and the Announcements subtab would call it twice (panel and `announcements-panel.tsx:96`) | As-built follow-up architect pass | Network panel request count on the Announcements subtab | The follow-up pass on the as-built diff |
| W3-R4 | The panel's heading level depends on the host | Accessibility seat | Read the chosen host's heading structure | Wave-3 accessibility pass after build |
| W3-R5 | Contrast of the success, warning and error notice tokens in both themes is unmeasured | Visual seat, then the repo owner | Open both theme definitions of each token and state the ratio; then OV-2f in a browser | Wave-3 visual pass, then Verify |
| W3-R6 | Size and caps of the persisted per-course drafts map are unmeasured | Data/storage seat | Byte length of a realistic stored map | Wave-1 data pass for W3 |

## 15. What I could not determine

- Anything Canvas actually does: the expansion, the notification email, a blank-subject
  default (the surface requires a subject, so that case is never exercised). Network is blocked
  and there is no key.
- Anything rendered: the confirm, the absence, the disabled button, the notice tones, focus
  order, heading levels. Every such claim above is a READING routed to an OV item.
- Whether a barrel export widens server-action id exposure (W3-R2).
- Why the W2 commit message says 35 tests where the file runs 17 (M-2).
- Whether `draftAnnouncementAction` is the right default drafter beyond "it is plain-text
  instructed and has no component caller today" (grep over `src` shows only server callers);
  that is R-5.
