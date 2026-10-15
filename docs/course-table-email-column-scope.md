# Scope: copy icon for course-table emails + email at row start

Owner request, 2026-10-11, verbatim: "cop[y] icon for emails on course table -
and put emails on row start".

Author: architecture seat (Opus). A `loop-checker` reads this before any build.
This artifact is a SCOPE with embedded acceptance criteria. It writes no
production code. Every quantity below names the command that produced it;
every `file:line` was opened.

---

## 0. What the request resolves to (located from the tree, not a doc)

The "course table" is `src/app/components/courses/CoursesTable.tsx` - one row
**per course** (`:750` maps `sorted` -> `<CourseRow>`), NOT a per-student
table. There is no per-student email anywhere in these tables: the student
roster table (`StudentRepoRoster.tsx:584-617`) has columns Student / GitHub
username / Repository / Status / Action and no email at all.

The only email on the course table is the **instructor contact email**,
`course.email`, rendered today as the `email` column:

- Column id and label: `email` -> "Email" (`courses-table-labels.ts:57`).
- Current cell: `CourseRow.tsx:534` -
  `email: <EditableCell kind="text" rawValue={course.email ?? ""} placeholder="instructor@school.edu" onSave={save("email")} menu={cellMenuFor("email")} />`.
- Column lives in the "People and contact" group at
  `courses-table-helpers.ts:62-64` (`roster`, then `email`, then `emailClient`),
  i.e. deep in the default left-to-right order, NOT at the start.
- The save field mapping is `computeFieldPatch` case `"email"`
  (`courses-table-helpers.ts:804`).

So "emails" (plural) = one instructor email per course row. "Copy icon" = a
per-row copy-to-clipboard control on that cell. "Row start" = move the `email`
column to the first position among the data columns.

### How columns are ordered (the mechanism "row start" acts on)

The table renders two structurally different kinds of leading cell:

1. The **sticky Name cell** - `CourseRow.tsx:642-664` renders it as its own
   frozen `<td className={tableStyles.stickyName}>` BEFORE the mapped columns;
   the header mirrors it at `CoursesTable.tsx:728-735`. `name` is deliberately
   NOT a member of `ALL_COLUMN_IDS` - it is never toggleable and never
   reorderable (`courses-table-helpers.ts:22-24`). It is the row's frozen
   identity column.
2. The **reorderable data columns** - `orderedVisibleColumns`
   (`CoursesTable.tsx:271` = `columnOrder.filter(id => visibleColumns.includes(id))`)
   are mapped into both the header (`:736-745`) and each row
   (`CourseRow.tsx:666-676`) from ONE ordered list, so header and cells cannot
   drift.

The data-column order is: a per-user **persisted** order
(`ta-courses-column-order`, `CoursesTable.tsx:55,239-241`) parsed by
`parseColumnOrder` (`courses-table-helpers.ts:219-250`), which falls back to
`[...ALL_COLUMN_IDS]` when nothing is stored. The key is WRITTEN only inside
`moveColumn` (`CoursesTable.tsx:273-279`) - so a user who has never used the
"Move left/right" controls has **no** persisted order and gets the default.

**SHAPE RULING (not a fork): "row start" means the first DATA column, i.e. the
first of `orderedVisibleColumns`, rendered immediately after the frozen Name
cell.** Placing `email` before `name` is rejected: the Name cell is the frozen
row-identity column, is rendered outside the `ALL_COLUMN_IDS` machinery, and
would require restructuring the sticky-cell rendering to displace - a far larger
change than requested, and bizarre UX (hiding a row's identity behind a contact
email). Name stays the frozen first column; `email` becomes the first column
AFTER it.

### THE ONE FORK FOR THE OWNER (reachability - do not default this)

Making `email` the first data column has two possible depths, and they differ
only in whether the change **reaches an owner who has already reordered their
columns**. This repo's recorded failure is shipping a capability that is dead
for the actual user with every gate green ("Verify reachability, not just
correctness"; the A-level "library + endpoint with no surface" instance). The
owner is the sole user, so this matters.

- **Reading A - default-order change only.** Move `email` to the front of
  `ALL_COLUMN_IDS`. Reaches any user with NO persisted `ta-courses-column-order`
  (never pressed Move left/right). A user WITH a persisted order keeps `email`
  where they had it - `parseColumnOrder` preserves stored positions and only
  appends ids it does not already contain (`courses-table-helpers.ts:235-245`),
  and `email` is always already contained.
- **Reading B - default change PLUS a version-gated forced reposition
  (RECOMMENDED).** Reading A, and additionally: bump the SINGLE existing version
  constant `CURRENT_COLUMNS_VERSION` 13 -> 14 (`courses-table-helpers.ts:119`),
  and give `parseColumnOrder` NEW machinery it does not have today - it must
  READ the stored `v` (it currently reads ONLY `.order` at `:227` and ignores
  `v` entirely, unlike `parseColumnSet` which reads `v` at `:158-166`) and, when
  the stored version is below 14, move `email` to index 0 of the assembled
  order. `serializeColumnOrder` already stamps `CURRENT_COLUMNS_VERSION`
  (`:253-255`), so the threshold MUST be that same constant (14) or the
  "re-stamp ends it" logic is incoherent. **Honest mechanics (not "runs exactly
  once"):** until a `moveColumn` write re-stamps the order at v=14,
  `parseColumnOrder` repositions `email` to the front on EVERY load - the output
  is stable (email stays first), so this is invisible, but the promise "move it
  away and it stays" holds only AFTER the first `moveColumn` write re-stamps
  v=14. This couples the migration to the column-SET schema version (the same
  constant `parseColumnSet` uses), which is an acknowledged coupling, not an
  accident. This reaches the owner **regardless** of their current saved order.

**Recommendation: Reading B.** It is the only reading that provably delivers
"email at row start" to the existing owner. Reading A is the correct reading
ONLY if the owner confirms they have never reordered their course-table columns
(or wants only the default changed for the future).

**SHAPE RULING (not a fork): move the PRIMARY email `email` ALONE to row start;
leave `emailClient` in the People-and-contact group, and RETIRE the "email pair
sits together" adjacency invariant.** The owner said "put emails on row start."
`email` is the instructor's email ADDRESS; `emailClient` is a provider enum
(Outlook / Gmail / Other - `courses-table-labels.ts:93-98`), not an email.
"Emails on row start" means the address, so only `email` moves. This breaks the
default-grouping assertion `courses-table-helpers.test.ts:782`
(`expect(at("emailClient")).toBe(at("email") + 1)`, comment `:781` "The email
pair sits together") - that assertion is UPDATED to the new reality in the same
wave (see I2/AC2), not worked around. (If the owner later says they meant the
`email` + `emailClient` PAIR moved together, scope that instead and keep `:782`
by moving both to the front as a contiguous pair - but the recommended reading
is `email`-alone + retire `:782`, and that is what is scoped.)

**Terminating question for the owner (every answer ends the activity):** "Email
at row start ships as (A) a default-order change you will see only if you have
never used the column Move controls, or (B) a one-time reposition that moves it
to the front of your current saved layout as well. B is recommended and is what
I have scoped; A drops wave 1's migration half. Which do you want?" The scope
is authored against **B**; if the owner answers A, strike the migration
(wave 1b) and its instrument I3 - nothing else changes.

---

## 1. Leverage assessment (input to the AC seat; not the final claim)

Per `docs/loop/leverage.md`: the honest class here is **click-cost only**, and
it must be named as such, never dressed up. Copying an instructor's email
becomes one click instead of click-into-cell / select / Ctrl+C (and the cell is
a click-to-edit `<td>`, so today selecting its text without opening the editor
is fiddly). This is the leverage.md "accept the cost explicitly" disposal: a
click-cost saving, **not** a categorical advantage over a chat window, and not
CORPUS/CAPTURE/SCALE/etc. The column reorder is pure presentation and claims
nothing.

Consequence for the test seat: click-cost has **no buildable removal test in
this repo** (no component is rendered by any test here, so clicks/latency are
unobservable - leverage.md "Honest limit"). This is recorded as a residual
(RES below), not papered over with a database-row assertion that would pass the
removal test trivially and prove nothing.

---

## 2. Diagnostics assessment (owner rule 2026-10-11: "any new feature always
needs rep in the diagnostics")

Grepped the diagnostics system first: it is the app-wide **session diagnostic
log** (`src/lib/session-diagnostic-log.ts`) with per-surface views
(`contentDiagnosticLog.ts`, `gradingDiagnosticLog.ts`, `chatSeamDiagnostic.ts`).
Every instrumented surface records **operations that fail otherwise-invisibly
and carry data the owner cannot diagnose from the screen** - Canvas/export
course listing and content loads (`contentDiagnosticLog.ts:71-92`), grading
runs, chat seam calls. The log exists "so that failure is diagnosable from a
file the owner can send" (`contentDiagnosticLog.ts:7-11`).

**Ruling: this change warrants NO session-diagnostic-log entry, and inventing
one would be the hollow diagnostic the rule warns against.** Reasoning:

- The column reorder has **no failure mode at all** - a pure array-order change
  plus a `localStorage` read. Nothing to log.
- The copy action's only failure mode is a **local** clipboard write throwing
  (insecure context or denied permission - `ui/clipboard.ts:19-21`). It is (a)
  immediately visible to the user (nothing lands on the clipboard), (b) required
  by AC7 below to show a visible inline failure, so it is **never silent**, (c)
  carries no student/Canvas data, and (d) is not a network/data operation of the
  kind every existing surface instruments. A downloadable session-log line for
  "copy email" would never help diagnose anything a screenshot would not.

The rule's own named exception - "if the copy action could fail silently" -
is satisfied by AC7's **visible** failure feedback, which is the right place for
it, not a log file. (If the owner later insists on a log line, the only
non-hollow option is a new `session-diagnostic-log` surface recording a clipboard
failure outcome; I argue against it and leave it as the owner's call, filed as a
residual, not built.)

---

## 3. Reuse survey (vetted; each opened)

| Symbol | `file:line` | What it gives us | Reuse? |
|---|---|---|---|
| `writeClipboardText(text, html?)` | `src/app/components/ui/clipboard.ts:18` | The app's shared clipboard guard - throws under the same no-`navigator.clipboard`/insecure-origin condition every copy site treats as failure | **Yes.** The copy handler calls this. Never inline `navigator.clipboard`. |
| `CopyIcon` / `CheckIcon` SVG paths | `recording/discussion-icons.tsx:24-39`; byte-identical copy glyph at `grading-results/icons.tsx:13-20`, `chat/AiChatWindowIcons.tsx` | The app's established "copy, swap to check on success" two-glyph idiom; `@mui/icons-material` is NOT a dependency here (`courses/icons.tsx:40`, `CellMenu.tsx:7`) | **Reuse the PATH DATA**, re-declared in `courses/icons.tsx` at the courses dense-table size (see below). Do not cross-import a 20px sibling. |
| `courses/icons.tsx` size tier | `courses/icons.tsx:38-61` (`HamburgerIcon` is `width/height={16}`) | AM23: courses icons are the 16px "dense table rows" tier, not the 20px toolbar tier (`discussion-icons.tsx:10-16`) | **Yes** - new CopyIcon/CheckIcon are 16px to match this file, not 20px. |
| `EditableCell` `actions` slot | `EditableCell.tsx:37-40,116` | A slot rendered in the display (non-editing) cell for per-cell action controls; already used by `textbook`/`description` | **Yes** - the copy control renders here. No change to `EditableCell` is needed. |
| `e.stopPropagation()` on cell action onClick | `CourseRow.tsx:366,420` (textbook/description action buttons) | The display `<td>` has `onClick={startEdit}` (`EditableCell.tsx:114`); existing action buttons stop propagation so a click does not open the editor | **Yes** - the copy control MUST do the same, or copying opens the inline editor. |
| Copy confirmation idiom (icon swap + hidden live region + stable label) | `AssessmentFeedbackFields.tsx:174-194`; `DiscussionReplyRow.tsx:663` | Icon swaps to check for `COPY_RESET_MS`; visible label stable (WCAG 2.5.3 Label in Name); `role="status" aria-live="polite"` + `visuallyHidden` announces for AT | **Yes** - the new control follows this exact shape. |
| `visuallyHidden` | `src/app/components/ui/visuallyHidden.ts` | The hidden-live-region style the idiom above uses | **Yes.** |

Do-not-reuse: the CoursesTable header "Copy all" path (`runCopyAll`,
`CoursesTable.tsx:445-462`, via `columnTextForCopy`) copies the whole column for
every course - a different feature (all rows, prefixed, one blob). The per-row
copy is NOT built on it; they share only `writeClipboardText` semantics.

---

## 4. Shape / file layout and seams

New and changed files (per-file line estimate; current counts from
`@(Get-Content <file>).Count`):

**Wave 1a - column order (always):**
- `src/lib/courses-table-helpers.ts` (currently 834). Move the string `"email"`
  from its current slot (`:63`) to the FIRST element of `ALL_COLUMN_IDS`
  (before `"institution"` at `:32`). `emailClient` does NOT move. Net line
  change ~0. `DEFAULT_VISIBLE_COLUMNS` (`:101`), `SORT_FIELDS` (`:365`) and
  `COLUMN_MIN_WIDTHS` (`:301-347`) are all derived-by-membership or keyed-by-id,
  so they need NO edit - only the order of `ALL_COLUMN_IDS` changes.
- `src/lib/courses-table-helpers.test.ts` (currently 928). The ONLY wave-1a
  breaker is the default-grouping adjacency at `:782`:
  `expect(at("emailClient")).toBe(at("email") + 1)`. Moving `email` to index 0
  while `emailClient` stays put makes `at("email")===0` and `at("emailClient")`
  ~18, so this fails - it is UPDATED in the same wave to the new invariant (I2).
  **The `parseColumnSet` exact-array expectations at `:335-398` do NOT break and
  MUST be left UNTOUCHED:** `parseColumnSet`'s tail is appended from
  `COLUMNS_ADDED_IN` (`courses-table-helpers.ts:179-187`), NOT from
  `ALL_COLUMN_IDS`, and `email`/`emailClient` live in the `COLUMNS_ADDED_IN[6]`
  bucket (`:130`) whose order is unchanged by this reorder. Reordering those
  arrays would be a self-inflicted red. (My first draft's claim that `:335-391`
  break was wrong - corrected here.)

**Wave 1b - version-gated reposition migration (Reading B only; strike if owner
picks A):**
- `src/lib/courses-table-helpers.ts`: (i) bump `CURRENT_COLUMNS_VERSION`
  13 -> 14 (`:119`) - the SINGLE shared constant, NOT a new one, because
  `serializeColumnOrder` (`:253-255`) stamps exactly this constant. (ii) Give
  `parseColumnOrder` NEW code to read the stored version: today it reads ONLY
  `.order` (`:227`) and never looks at `v`; add a read of `v` (defaulting the
  bare-array shape to v=0, matching how `parseColumnSet` treats it at `:153-155`),
  and after the existing stored-then-missing assembly (`:233-245`), if the
  stored version is `< 14`, move `email` to index 0 (remove-then-unshift;
  idempotent when already first; preserves "each id exactly once"). When the
  stored version is `>= 14`, leave the order exactly as assembled. Est. +14
  lines -> ~848. NOT a type-only module; the caller is `parseColumnOrder` itself
  (already called at `CoursesTable.tsx:240`), so no new wiring is owed.
- `src/lib/courses-table-helpers.test.ts`: THREE existing `parseColumnOrder`
  tests break under the migration and are updated in the same wave (their stored
  version is below 14, so `email` is forced to the front):
  - `:702-705` `{v:1, order:["weeks","tests"]}` - `slice(0,2)` is no longer
    `["weeks","tests"]`; email is unshifted to index 0. Update to the
    email-first reality.
  - `:709-714` `{v:8, ...}` - `order[0]` becomes `"email"`, not `"institution"`.
  - `:717-719` `{v:0, order:["rosterCount"]}` - `order[0]` becomes `"email"`,
    not `"roster"`.
  These STAY green and are NOT touched (they prove the threshold is coherent):
  `:681-686` (fallback path returns before any migration), `:688-697` and
  `:728-730` (both built with `serializeColumnOrder`, which stamps v=14, so the
  migration does not fire - `:728-730` round-trips green ONLY because the
  threshold equals the stamped version), `:722-726` (bare array `["email"]` -
  email is already first, so the reposition is a no-op). Add the I3 tests.

**Wave 2 - the copy control (always):**
- `src/app/components/courses/icons.tsx` (currently 61). Add `CopyIcon` and
  `CheckIcon`, 16px, `viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"
  focusable="false"`, path data reused from `discussion-icons.tsx:24-39`. Est.
  +18 -> ~79. Purely additive; the one importer `CellMenu.tsx:42` takes only
  `HamburgerIcon` and is unaffected.
- `src/app/components/courses/EmailCopyButton.tsx` (NEW, est. ~55 lines). A leaf
  client component: props `{ email: string; label: string }` (label = the
  course name, for the aria-label and title). An MUI `IconButton size="small"`
  showing `CopyIcon`, swapping to `CheckIcon` for a reset window on success;
  stable `aria-label={`Copy email for ${label}`}`, title swaps to "Copied"; an
  `onClick` that calls `e.stopPropagation()` then
  `await writeClipboardText(email)`; a `catch` that sets a visible error state;
  and a `visuallyHidden` `role="status"` region announcing
  `` `Copied email for ${label}` `` on success. Renders NOTHING when `email`
  trimmed is empty (nothing to copy).
- `src/app/components/courses/CourseRow.tsx` (currently 707). In the `email`
  cell (`:534`), add `actions={<EmailCopyButton email={course.email ?? ""}
  label={course.name} />}` and the import. Est. +2 -> ~709. **This is the wave's
  caller of `EmailCopyButton`** (which is itself the caller of the new
  CopyIcon/CheckIcon), satisfying the "every wave contains the caller of what it
  exports" rule - all three live in wave 2.

Disjointness: wave 1 (`src/lib/*`) and wave 2
(`src/app/components/courses/*` except the two lib files) share no files and
neither designs against a fact the other establishes, so they MAY run
concurrently. Within wave 2, `icons.tsx` + `EmailCopyButton.tsx` + `CourseRow.tsx`
are one write set (caller + callee together) and are NOT split.

Nothing new is persisted. No `ta-` key is added (AC9). Reading B changes only
the INTERPRETATION of the existing `ta-courses-column-order` value and the
version it is re-stamped with; it adds no key and no new stored field.

Not trivially revertible: Reading B's version bump is a one-way interpretation
change for stored orders (reverting the code after it has re-stamped a user's
order to the new version leaves that order as the user last arranged it - benign,
but note it). Wave 1a and wave 2 are plain code, fully revertible.

---

## 5. ACCEPTANCE CRITERIA

Each criterion names the object under comparison, the instrument, and the
direction of failure. "Owner-walk" marks a criterion no test in this repo can
execute because no component is rendered by any test here
(`docs/loop/this-repo.md`); it is verified by the owner in the running app and
is recorded with an owner and a step in the residual register.

**AC1 - email is the first data column (default).** In
`courses-table-helpers.ts`, `ALL_COLUMN_IDS[0] === "email"` and
`ALL_COLUMN_IDS.indexOf("email") === 0`; `DEFAULT_VISIBLE_COLUMNS[0] === "email"`
(derived). Instrument I1. Failure: email not at index 0 -> RED.

**AC2 - the retired adjacency invariant describes the shipped order.** The
default-grouping assertion `courses-table-helpers.test.ts:782` (the "email pair
sits together" adjacency) is updated to the new reality - `email` is the first
column (`at("email") === 0`) and the People-and-contact remainder stays
contiguous (removing `email` from between `roster` and `emailClient` makes those
two adjacent, so `at("emailClient") === at("roster") + 1`). The `parseColumnSet`
exact-array expectations (`:335-398`) are NOT changed (they do not depend on
`ALL_COLUMN_IDS` order - section 4). Instrument I2. Failure: `:782` left as the
old `at("emailClient")===at("email")+1` (goes RED on the reorder), or the
`parseColumnSet` arrays needlessly edited (self-inflicted RED).

**AC3 - the Name column stays the frozen first cell.** `name` remains absent
from `ALL_COLUMN_IDS` and is still rendered as the sticky cell before the mapped
columns (`CourseRow.tsx:642`, `CoursesTable.tsx:728`). Instrument: I1 asserts
`"name"` is not a member of `ALL_COLUMN_IDS`; the sticky rendering is unchanged
by this scope (owner-walk confirms Name is still leftmost and frozen). Failure:
`name` appears in `ALL_COLUMN_IDS`, or email renders before Name -> RED / owner
sees email left of Name.

**AC4 (Reading B only) - the owner's existing saved order gets email moved to
the front.** `parseColumnOrder` takes ONE argument (`raw`). For a stored value
whose version is `< 14` (including the bare-array shape, treated as v=0),
`parseColumnOrder(raw)` returns an array with `[0] === "email"` containing every
`ALL_COLUMN_IDS` member exactly once (no duplicate, no drop). For a stored value
at version `>= 14` (what `serializeColumnOrder` now stamps),
`parseColumnOrder(raw)` leaves `email` at its stored position. Instrument I3.
Failure: email not repositioned for a `v<14` order, email repositioned for a
`v>=14` order, or any id duplicated/dropped -> RED.

**AC5 - each row's email cell has a copy control when an email is present.**
When `course.email` is non-empty, the email cell renders `EmailCopyButton`; when
empty, it does not. Instrument: source pin I4 (the `actions` prop is present and
`EmailCopyButton` early-returns on empty `email`); owner-walk confirms the icon
appears only on rows with an email. Failure: no control on a row with an email,
or a control on an empty-email row -> owner-walk red.

**AC6 - the copy copies THAT row's own email (per-row correctness - the
A36 / RES-FILL-11 key-collision class).** The value written to the clipboard for
a given row is that row's `course.email`, never a shared, stale, or
neighbouring-row value. Structural guarantee: `EmailCopyButton` is a leaf that
writes only its own `email` prop, and `CourseRow` constructs it inside the
per-row `cells` map where `course` is the per-row prop in closure, passing
`email={course.email ?? ""}`. Instrument: source pin I4 (CourseRow passes
`course.email`; `EmailCopyButton`'s handler writes its `email` prop, not a
module/captured-once variable). The end-to-end behaviour (click row A's icon,
A's email is on the clipboard; repeat for B) is **owner-walk**. Failure: the
handler writes anything other than its `email` prop, or CourseRow passes
anything other than `course.email` -> source pin RED.

**AC7 - a clipboard failure is never silent.** When `writeClipboardText` throws
(insecure context / denied permission), the control shows a visible inline
failure (the app's `.fieldHint`/`.dangerLink` idiom), not a silent no-op.
Instrument: owner-walk (no render in tests). This is also the diagnostics-rule
answer (section 2). Failure: a thrown write leaves no visible signal.

**AC8 - the control is accessible and uses this app's voice, no emoji.** The
icon is an SVG from `courses/icons.tsx` (never an emoji or other non-ASCII); the
visible affordance has a stable accessible name (`Copy email for <course name>`,
WCAG 2.5.3) and success is announced via a `visuallyHidden` `role="status"`
region; copy is one click (minimize-clicks). Instrument: I5 (`no-emojis.test.ts`
+ `source-bytes.structure.test.ts` scan the new files - do NOT hand-roll an
emoji scan); the a11y/keyboard behaviour is a **reading claim / owner-walk**.
Failure: any emoji/non-ASCII byte in the new files -> RED; missing accessible
name/announcement -> owner-walk red.

**AC9 - nothing new is persisted.** No new `ta-` key is introduced; Reading B
reuses the existing `ta-courses-column-order` and adds no field to it.
Instrument: owner-walk / review of the diff (no new `localStorage.setItem` key).
Failure: a new persisted key appears -> review red.

---

## 6. Instruments (machine-checkable where this repo allows)

Gate command (names 2+ test files, so spelled with the wrapper, never a raw
multi-path `vitest` - `docs/loop/this-repo.md` / the test:paths memo):

```
npm run test:paths -- src/lib/courses-table-helpers.test.ts src/lib/courses-table-labels.test.ts src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts src/app/components/courses/emailCopyButton.wiring.test.ts
```

- **I1 (AC1, AC3) - column order, pure.** New assertions in
  `courses-table-helpers.test.ts`: `expect(ALL_COLUMN_IDS[0]).toBe("email")`,
  `expect(ALL_COLUMN_IDS.indexOf("email")).toBe(0)`,
  `expect(DEFAULT_VISIBLE_COLUMNS[0]).toBe("email")`,
  `expect(ALL_COLUMN_IDS).not.toContain("name")`. Object: the exported const.
  Direction: email not first / name present -> red. Satisfiable: trivially (it
  is a const).
- **I2 (AC2) - the adjacency breaker, existing suite.** The default-grouping
  test `courses-table-helpers.test.ts:782`, repointed from
  `at("emailClient")===at("email")+1` to `at("email")===0` plus
  `at("emailClient")===at("roster")+1`. Object: `ALL_COLUMN_IDS` index positions.
  Direction: the reorder with `:782` left unchanged -> RED (proof the reorder
  changed real behaviour and the owns-member was reconciled); any needless edit
  to the `parseColumnSet` `:335-398` arrays -> RED. Under **Reading A** this is
  the SOLE breaker in the suite; under **Reading B** the three `parseColumnOrder`
  tests (`:702-705`, `:709-714`, `:717-719`) also update (their coverage folds
  into I3).
- **I3 (AC4, Reading B only) - migration, pure.** New/updated tests in
  `courses-table-helpers.test.ts`, `parseColumnOrder` taking its single `raw`
  arg: (a) a stored order string at `v < 14` with `email` mid-list ->
  `[0] === "email"` and a no-dup/no-drop permutation of `ALL_COLUMN_IDS`; (b) the
  bare-array shape (v=0) with `email` mid-list -> `[0] === "email"`; (c) a stored
  order at `v >= 14` (built via `serializeColumnOrder`) -> `email` left at its
  stored index (the round-trip at `:728-730` is this case and must stay green).
  Object: `parseColumnOrder` output. Direction: as AC4. Satisfiable: pure array
  transform; the test seat proves it green with a reference transform before
  hand-off.
- **I4 (AC5, AC6) - per-row-correctness source pin.** New
  `src/app/components/courses/emailCopyButton.wiring.test.ts`, a source-text pin
  (reads the two `.tsx` as text, the committed `*.wiring.test.ts` idiom):
  asserts (a) `CourseRow.tsx` passes `course.email` into `EmailCopyButton`'s
  `email` prop in the `email` cell, and (b) `EmailCopyButton.tsx`'s copy handler
  passes its `email` prop to `writeClipboardText` and calls `stopPropagation`.
  Object: the wiring source. Direction: the write argument or the passed prop is
  anything other than the row's own `email` -> red. This is the honest ceiling;
  the behavioural per-row check is owner-walk (no component renders).
- **I5 (AC8) - emoji/non-ASCII, committed scans.** `no-emojis.test.ts` and
  `source-bytes.structure.test.ts` already scan `src/` (per the emoji-scan and
  write-tool-escapes memos - do not hand-roll). Object: the new files' bytes.
  Direction: any emoji/non-ASCII -> red.
- **Owner-walk (AC3 sticky, AC5/AC6 behaviour, AC7, AC8 a11y, AC9):** verified
  in the running app by the owner; recorded as RES-CT-EMAIL-WALK below. No
  component is rendered by any test here, and nothing in this scope proposes a
  requirement whose only enforcer would be a render.

Reference-implementation obligation (test seat): I1 and I3 are pure and must be
shown green against a throwaway implementation before hand-off; I4 is a
source-text pin and is shown red against a sabotaged wiring (e.g. passing a
sibling row's email) and green against the real one.

---

## 7. `owns` file list

Derived with (run with `grep -r` / the Grep tool; the recursive `-Path` form in
PowerShell 5.1 does NOT recurse):

```
grep -rl 'courses-table-helpers' src --include=*.ts --include=*.tsx         # importers of the reordered const
grep -rnE 'at\("email"\)|at\("emailClient"\)' src --include=*.test.ts       # the :782 adjacency breaker
grep -rnE 'parseColumnOrder\(' src --include=*.test.ts                      # version-gated tests (Reading B)
grep -rl 'from "./icons"' src/app/components/courses --include=*.tsx        # importers of courses/icons
```

Reconciled against the tree. The order-sweep confirms the ONLY assertions a
correct reorder/migration turns red are inside `courses-table-helpers.test.ts`:

Files this scope EDITS or ADDS:
- `src/lib/courses-table-helpers.ts` (edit: ALL_COLUMN_IDS order; +Reading B: bump CURRENT_COLUMNS_VERSION 13->14, teach parseColumnOrder to read v and reposition)
- `src/lib/courses-table-helpers.test.ts` (edit: add I1; repoint I2's `:782`; +Reading B: update `:702-705`/`:709-714`/`:717-719` and add I3)
- `src/app/components/courses/icons.tsx` (edit: add CopyIcon/CheckIcon)
- `src/app/components/courses/CourseRow.tsx` (edit: wire EmailCopyButton into the email cell)
- `src/app/components/courses/EmailCopyButton.tsx` (new)
- `src/app/components/courses/emailCopyButton.wiring.test.ts` (new; I4)

Files that READ a changed file AS SOURCE TEXT or assert on its behaviour (a
correct change can turn one red):
- `src/lib/courses-table-helpers.test.ts` - the breakers: `:782` adjacency
  (wave 1a, Reading A and B) and, under Reading B, the three `parseColumnOrder`
  version tests (`:702-705`/`:709-714`/`:717-719`). Its `parseColumnSet` exact
  arrays (`:335-398`) do NOT break (they append from `COLUMNS_ADDED_IN`, not
  `ALL_COLUMN_IDS`) and are left untouched. In the edit set above.
- `src/lib/courses-table-labels.test.ts` - asserts the CELL_COLUMN_LABELS **key
  set** (`:20-26`, sorted, order-INsensitive) and label non-emptiness. The reorder
  does not change the key set, so this stays green; listed because it imports
  `ALL_COLUMN_IDS`.
- `src/lib/no-emojis.test.ts`, `src/source-bytes.structure.test.ts` - scan all of
  `src/`, so they read the new files. In the gate.

Order-sweep: checked NOT in owns (opened/spot-checked to confirm the reorder
does not turn them red):
- `src/lib/cell-copy.test.ts` - the column-id canaries at `:153` and `:200` use
  `.sort()` (order-INsensitive) and a length count (`CELL_COPY_COLUMN_IDS` has
  length 38); no order assertion.
- `src/app/actions/syllabus-upload.preserves-columns.test.ts` - matches the
  persisted column-set OBJECT shape, not column order.
- `src/app/components/content-tab/content-selection.test.ts` - only MENTIONS
  `parseColumnSet` in a comment (`:5`); no courses-column assertion.
- `src/lib/workflows/types.scope.test.ts` - its `"institution","modality"` is a
  workflows scope fixture, unrelated to course columns.
- `grading-results/FilesCell.tsx`, `tasks/TaskCell.tsx` - `from "./icons"` resolves
  to THEIR OWN local icons files, not `courses/icons.tsx`.
- `courses/CellMenu.tsx` - imports only `HamburgerIcon` from `courses/icons.tsx`;
  adding CopyIcon/CheckIcon is additive and cannot break it.

Tree hazard for the implementer: a stale worktree exists at
`.claude/worktrees/friendly-meninsky-8032bc` (`git worktree list`). Edit the real
tree; gate every wave with `git status --short` against the assignment, and prove
no `.claude/worktrees` copy was edited instead (the Glob-shadow memo).

---

## 8. Disposition table

Not a restructure of a prior version - this is a new scope for a new owner
request. No prior requirement ids to map. (No disposition table owed.)

---

## 9. Residual register

Each entry names an owner, an instrument, and the step that measures it. A
residual not in `docs/BACKLOG.md` does not exist - the orchestrator files these
at disposal/push.

- **RES-CT-EMAIL-FORK (owner: repo owner; instrument: the owner's answer; step:
  the terminating question in section 0).** Reading A vs B. Blocks only wave 1b;
  wave 1a and wave 2 proceed under either answer. Scoped against B; answering A
  strikes wave 1b + I3 and nothing else.
- **RES-CT-EMAIL-WALK (owner: repo owner; instrument: owner-walk in the running
  app; step: after the build lands, click a row's copy icon on a secure origin
  and confirm that row's email is on the clipboard, the icon swaps to a check,
  AT announces it, the editor does NOT open, an empty-email row shows no icon,
  and a denied/insecure clipboard shows the visible failure).** Covers every
  AC that no test here can execute (AC5/AC6 behaviour, AC7, AC8 a11y, AC3 sticky,
  AC9). Named because no component is rendered by any test in this repo.
- **RES-CT-EMAIL-LEVERAGE (owner: repo owner; instrument: Verify's leverage
  re-judgement against the built diff; step: record at Verify that the claimed
  advantage is click-cost only and has no buildable removal test here).** Per
  leverage.md's "Honest limit" - the advantage is clicks, which this suite
  cannot observe; no hollow row-write removal test is substituted.
- **RES-CT-EMAIL-DIAG (owner: repo owner; instrument: section 2 ruling; step: if
  the owner wants a diagnostics line despite the ruling, the only non-hollow
  build is a new session-diagnostic-log surface recording a clipboard-failure
  outcome - argued against above, not built unless the owner asks).** Records
  that the diagnostics rule was assessed and deliberately produced no entry,
  with the reasoning, so a later reader does not mistake the absence for an
  oversight.

---

## 10. For the loop-checker

Attack hardest: (1) the fork framing - is Reading B genuinely the reachable one,
and is the terminating question shaped so every answer ends the activity? (2) I2
- does the reorder really only break `courses-table-helpers.test.ts`, or did a
second order-sensitive assertion escape the grep? (3) I4 - is a source-text pin
the honest ceiling for per-row correctness, or is a stronger pure instrument
buildable (e.g. extracting the "email for this row" selection into a pure
function)? (4) the diagnostics ruling - is "no entry" defensible against the new
owner rule, or is there a real silent-failure path I dismissed? (5) the sticky
Name decision - is "row start = first DATA column" the right reading of the
owner's words, or did I rule out "before Name" too quickly?
