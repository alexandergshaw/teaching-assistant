# Test notes and oracles - walkthrough-announcement smoothing, waves W0 + W1

Status: TEST NOTES, authored by `loop-test-author` (Opus) on 2026-10-04 from the
SHIP-checked scope `docs/walkthrough-announcement-clicks-scope.md`. Not yet
checked. These notes specify WHAT IS MEASURED and HOW IT FAILS for W0 and W1
only. An implementer writes the test code from this; a fresh `loop-checker`
reads it first.

This file produces no production code and no test code. It produces: the frozen
oracles, the object/instrument/direction row for each requirement, the
discriminating sabotage for each, the executable-vs-argued split, the residual
register, and ONE reported conflict the orchestrator/owner must rule on before
the W1 `courseToAutoSelect` row is finalized (section W1-3).

Satisfiability was proven, not asserted: reference implementations of all four
W1 leaves and both W0 retarget regexes were run green in an isolated node script
(`scratchpad/ref.mjs`), including the sabotage that deletes `.trim()`. See
"Satisfiability" at the end of each leaf.

## Evidence tags

- `[MEASURED <cmd>]` the command was run in this checkout and its output quoted.
- `[READ file:line]` the file was opened at that line.
- `[ARGUED]` reasoned from READ facts; NOT executed here. Never asserted as
  verified.

## MACHINE vs OWNER (honest tagging - nothing renders under vitest)

`docs/loop/this-repo.md` section 2: vitest here is node-env, collects only
`src/**/*.test.ts`, renders NO component. Every W0/W1 oracle below is a
pure-function test or a source-text/structure test. The felt px / scroll /
cursor / click targets of the scope (AC-1, AC-5, AC-8, AC-13, AC-17) are
OWNER-verified by the section 3.4 browser snippet and are NOT in this wave's
machine set - they are listed in the residual register with owner, instrument
and step. This wave's MACHINE oracles are exactly four things: extraction stays
green (W0), the pure-leaf behavior (W1), the key canary holds at five (W0+W1),
and the 1000-line ceiling (W0).

## Gates (measured 2026-10-04)

File sizes `[MEASURED @(Get-Content <f>).Count]`:

| File | Lines |
|---|---|
| `src/app/components/walkthrough-announcement/WalkthroughAnnouncementPanel.tsx` | 991 |
| `.../announcement-draft-slots.ts` | 552 |
| `.../useAnnouncementDraftSlots.ts` | 526 |
| `.../walkthrough-announcement.structure.test.ts` | 692 |
| `.../announcement-draft-slots.test.ts` | 798 |
| `.../useAnnouncementDraftSlots.test.ts` | 251 |
| `.../AnnouncementDraftSlot.tsx` | 374 |
| `.../AnnouncementCourseFieldset.tsx` | 258 |

- Typecheck: `npx tsc --noEmit` (ONE caller at a time - it races on
  `tsconfig.tsbuildinfo`). No output = pass.
- The W0 + W1 structure/unit set, run together, uses
  `npm run test:paths <p1> <p2> ...` - NEVER a raw multi-path `vitest`/`npm test`,
  which silently drops any unmatched argument (`this-repo.md` "Running a named
  set of test files"). A single path may use `npx vitest run <path>`.
- The exact set to run as the wave gate:
  `npm run test:paths src/app/components/walkthrough-announcement/walkthrough-announcement.structure.test.ts src/app/components/walkthrough-announcement/walkthrough-run-decisions.test.ts src/app/components/walkthrough-announcement/announcement-draft-slots.test.ts src/app/components/walkthrough-announcement/useWalkthroughSetup.test.ts src/file-size-ceiling.structure.test.ts`
  (plus `.../useAnnouncementDraftSlots.test.ts` if W1 touches the hook export).
- Prove the tree, not a report: `git status --short` against the wave's write
  set, and confirm no `.claude/worktrees` copy was edited (`this-repo.md`
  section 7: `Glob` returns the worktree copy FIRST).

## Build-ordering facts that bound these notes

- W0 is an UNBLOCKER and MUST precede W1. The panel is 991/1000 and is NOT in
  `ALLOWED_OVERAGE` (`src/file-size-ceiling.structure.test.ts:75-92`
  `[READ]` - the four listed files are two `lms-generation*.test.ts`, one
  `registry-helpers...test.ts`, one `bulkBarGroups.test.ts`; the panel is not
  among them). The ceiling test recurses all of `src/` (`:101-111`,
  `listSourceFiles`), so a new file anywhere in `src/` is checked too.
- W1 exports have NO caller until W2 (the auto-draft effect, the new-run
  control, course auto-select, the hook's `reset()`). Per the scope's wave
  table and `traps-spec.md`'s leaf-with-no-caller trap, W1 + W2 ship as ONE
  push. These notes author W1's LEAVES and their unit tests (which exercise the
  functions DIRECTLY and need no caller); the AC-10 call-site wiring assertion
  is W2 work, flagged forward in the residual register, not authored here.

---

# W0 - EXTRACTION (no behavior change)

## What moves

Extract the SETUP state from `WalkthroughAnnouncementPanel.tsx` into a NEW
`src/app/components/walkthrough-announcement/useWalkthroughSetup.ts`. The block
is `[READ Panel:88-251]`:

- the five persisted key constants `STORAGE_KEY_COURSE/MODULE/NOTES/EMOJI/RESOURCES`
  (`:97-102`) and `MAX_NOTES_CHARS` (`:104`);
- `courses`/`coursesError` state and the `active`-gated, cancellation-guarded
  course-list load effect (`:136-163`), which filters `Boolean(c.canvasUrl)` and
  maps `{id,name,canvasUrl,institution}` (`:150-154`);
- `courseId` + its trim seed (`:169-171`) and persist effect (`:172-180`);
- `moduleLabel` + seed (`:182-184`) and persist effect (`:185-192`);
- `notesText` + `.slice(0, MAX_NOTES_CHARS)` seed (`:194-197`), the clamping
  `setNotesText` (`:198`), and its persist effect (`:199-207`);
- `emojiOn`/`researchOn` state (`:217-218`), their MOUNT-EFFECT restore (`:219-235`,
  the `await Promise.resolve()` + `=== "true"` parse idiom - NOT a lazy
  initializer, per the panel's own comment `:209-216`), and their persist
  effects (`:236-249`);
- `selectedCourse = (courses ?? []).find((c) => c.id === courseId) ?? null`
  (`:251`).

The hook signature the panel then calls:
`useWalkthroughSetup(active: boolean)` returning
`{ courses, coursesError, courseId, setCourseId, moduleLabel, setModuleLabel,
notesText, setNotesText, emojiOn, setEmojiOn, researchOn, setResearchOn,
selectedCourse }`.

## The frozen before/after oracle (refactor-disarms-tests / guard-before-migration)

The oracle is NOT a comparison of the new file to itself. It is the complete set
of EXISTING assertions in `walkthrough-announcement.structure.test.ts`,
captured as the resolved behavior BEFORE the move, held byte-green AFTER it -
with exactly one block retargeted and given an independent literal expectation.

### B0-1. All existing structure-test assertions EXCEPT the G6 block stay byte-identical and byte-green

- Object: the assertions in `walkthrough-announcement.structure.test.ts` other
  than the two in the `describe("G6: the courseId seed from localStorage is
  TRIMMED")` block (`[READ :441-469]`).
- Instrument: `npx vitest run .../walkthrough-announcement.structure.test.ts`
  before the W0 edit and after it; the test file text of every non-G6 block is
  unchanged (`git diff`).
- Direction of failure: RED if the extraction changed any non-G6 assertion's
  text, or if any such assertion that was green on HEAD goes red after the move.
- Why this is safe to claim `[ARGUED, grounded by READ]`: I opened every block
  and confirmed none except G6 reads the moved symbols. The directory key canary
  (`:104-129`) scans ALL non-test files in the directory and so counts the five
  keys wherever they live (see B0-3). `useState<SavedFormatsState>("loaded")`
  (`:437`), the raceWithTimeout sites (`:328-354`), `emojiOn={emojiOn}` /
  `researchOn={researchOn}` passed to the fieldset (`:313-316`), the Generate
  gate (`:409-423`), the empty-material hint (`:480-519`), `draftOne`'s
  `emojiPolicy: ctx.emojiOn` (`:282-295`), and the A18 video-script block
  (`:634-670`) all read code that STAYS in the panel - exemplar state, the run
  row, draftOne, the render - none of which is in the `:88-251` setup block.

### B0-2. The G6 trim block is RETARGETED to the new file, with an independent literal expectation and a discriminating sabotage

The two `it`s currently read `panelSource` (`[READ :442-445, :454-468]`). After
the extraction the panel no longer contains `localStorage.getItem(STORAGE_KEY_COURSE)`,
so on a naive extraction BOTH go RED (the seed regex finds nothing; the canary
count is 0, not 1). They MUST be retargeted to read the new hook file. The only
edit is the file handle:

```
// was: path.join(WALKTHROUGH_ANNOUNCEMENT_DIR, "WalkthroughAnnouncementPanel.tsx")
const setupSource = fs.readFileSync(
  path.join(WALKTHROUGH_ANNOUNCEMENT_DIR, "useWalkthroughSetup.ts"), "utf-8");
```

The two assertions keep their EXISTING frozen literals, now read off
`setupSource`:

| # | Object | Instrument (frozen literal) | Direction of failure |
|---|---|---|---|
| G6-trim | the courseId seed in `useWalkthroughSetup.ts` | `expect(setupSource).toMatch(/localStorage\.getItem\(STORAGE_KEY_COURSE\)\s*\?\?\s*""\)\.trim\(\)/)` - the SAME regex as `[READ :455]`, a frozen pattern, not a comparison of the file to itself | RED if the seed does not read `getItem(STORAGE_KEY_COURSE) ?? ""` through `.trim()` |
| G6-canary | that there is exactly one such read | `const reads = setupSource.match(/localStorage\.getItem\(STORAGE_KEY_COURSE\)/g) ?? []; expect(reads.length).toBe(1)` - frozen count, `[READ :465-467]` | RED if the key/initializer moved or duplicated so the read count is not 1 |

- SABOTAGE (must go RED, then GREEN on restore): in `useWalkthroughSetup.ts`
  delete `.trim()` from the courseId seed. The G6-trim regex requires the
  trailing `)\.trim\(\)`, so it stops matching -> RED. Restore -> GREEN.
  Discriminates: YES. Proven in `scratchpad/ref.mjs` (the seed-line model with
  and without `.trim()`).
- This pins the load-bearing `.trim()` (`[READ Panel:165-168]`: a
  whitespace-only stored value is truthy, passes the `if (!courseId)` guards,
  and reaches both exemplar actions whose `!courseId.trim()` arms return an
  empty SUCCESS before querying - "did not query" becomes indistinguishable
  from "this course has none"). Trimming at the seed makes that unrepresentable.
- CONSTRAINT: the extraction MUST carry the identifier `STORAGE_KEY_COURSE`
  into the new file unchanged (the assertion matches that identifier, not the
  string literal). It must also keep the seed as a single read (count 1) - do
  not split it or add a second `getItem(STORAGE_KEY_COURSE)`.

### B0-3. The five-key canary stays at FIVE and the five key names stay byte-frozen

- Object: the distinct `ta-` keys across every non-test `.ts`/`.tsx` in
  `src/app/components/walkthrough-announcement/`.
- Instrument: the EXISTING canary `[READ :104-124]`,
  `expect(distinctKeys.size).toBe(5)`, scanning the whole directory
  (regex `/(?<![a-zA-Z])ta-[a-z-]*[a-z]/g`). UNCHANGED by W0 - no bump.
- Direction of failure: RED if the extraction adds, drops, renames or
  mis-spells a key, or places the new hook OUTSIDE this directory (then the five
  keys vanish from the scan and the count drops to 0).
- Why it stays green: the five literals MOVE from the panel into
  `useWalkthroughSetup.ts`, which lives in the SAME directory, so the set is
  still `{ta-rec-wta-course, -module, -notes, -emoji, -resources}` -> 5. The
  sibling Discussion scope reads `ta-rec-wta-course` by that exact name
  (scope section 9), so the names are byte-frozen: `ta-rec-wta-course`,
  `ta-rec-wta-module`, `ta-rec-wta-notes`, `ta-rec-wta-emoji`,
  `ta-rec-wta-resources`.
- This canary is simultaneously the enforcer that the new hook is in-directory:
  misplacing it is caught here as a RED (0 != 5), which is the useful failure.

### B0-4. The byte-frozen privacy disclosure test is NOT touched by W0

- Object: the A18 5.9 frozen-whole disclosure (`[READ :599-623]`) and the
  A18 AC-3 first/second-sentence blocks (`[READ :529-590]`).
- Instrument: both read `AnnouncementCourseFieldset.tsx`, which W0 does NOT
  write. They stay byte-green, untouched.
- Direction of failure: these are not W0's to change; if the extraction somehow
  edits the fieldset, that is OUT OF SCOPE and RED is correct.

### B0-5. The ceiling: panel under 1000, new file under 1000

- Object: line counts of the panel and `useWalkthroughSetup.ts`.
- Instrument: `@(Get-Content <f>).Count` and
  `src/file-size-ceiling.structure.test.ts` (`LIMIT = 1000`, `:41`).
- Direction of failure: RED if the panel ends over 1000 (AC-16 target: at or
  under 900; scope projects ~830 after moving ~165 lines) or the new hook
  exceeds 1000 (scope estimate ~120).
- Note: this is an EXECUTING gate (never capped). Measure after the move;
  do not trust the ~830 estimate.

## W0 write set (exact paths)

- `src/app/components/walkthrough-announcement/WalkthroughAnnouncementPanel.tsx`
  (extract out `:88-251`, call the new hook)
- NEW `src/app/components/walkthrough-announcement/useWalkthroughSetup.ts`
- `src/app/components/walkthrough-announcement/walkthrough-announcement.structure.test.ts`
  (retarget the G6 block's file handle only, per B0-2)

DO NOT touch, in W0: `walkthrough-announcement-link-guard.ts`,
`walkthrough-announcement.ts`, `RecordingTab.tsx`, `AnnouncementCourseFieldset.tsx`,
`AnnouncementDraftSlot.tsx`, `announcement-draft-slots.ts`,
`useAnnouncementDraftSlots.ts`, or any A29/grader/repo-grader file. No new
comment-strip helper; the retarget uses plain regex/`match` on the new file and
needs none, so do NOT add any mention of the comment-strip helper literal to
this test (it already imports it at `[READ :5]` for the A18 AC-4 block, which is
untouched). No `/s` regex. No emojis. No cross-`*.test.ts` imports.

---

# W1 - PURE LEAVES (land with W2's wiring, one push)

New pure leaf file: `src/app/components/walkthrough-announcement/walkthrough-run-decisions.ts`
holding `shouldAutoDraft`, `isRunComplete`, `courseToAutoSelect`. Its test:
`walkthrough-run-decisions.test.ts` (same directory). The reducer `reset` lands
in `announcement-draft-slots.ts` with its test in the existing
`announcement-draft-slots.test.ts`.

General rules for all W1 tests: import the functions UNDER TEST from the source
leaf (`./walkthrough-run-decisions`, `./announcement-draft-slots`) - never from
another `*.test.ts` (that re-runs its describe blocks). No `/s` flag (fails tsc,
TS1501). No emojis. Frozen literals only; no recomputation of an expected value
by calling the function under test or a helper that shares its logic.

## W1-1. shouldAutoDraft (F1=c: auto-draft on stop, default ON)

Signature (type-only import of `SavedFormatsState` from `./announcement-draft-slots`
keeps the leaf faithful to Generate's own `savedFormatsState === "loading"`
gate, `[READ Panel:866]`):

```
interface AutoDraftState {
  readonly autoDraftOn: boolean;
  readonly capturing: boolean;
  readonly extracting: boolean;
  readonly pendingFrames: number;
  readonly hasMaterial: boolean;
  readonly hasEmptySlot: boolean;
  readonly savedFormatsState: SavedFormatsState;
  readonly alreadyDraftedThisStop: boolean;
}
export function shouldAutoDraft(s: AutoDraftState): boolean;
```

Reference impl (proven green in `scratchpad/ref.mjs`):
`autoDraftOn && !capturing && !extracting && pendingFrames === 0 && hasMaterial
&& hasEmptySlot && savedFormatsState !== "loading" && !alreadyDraftedThisStop`.

- Object compared: the predicate's boolean output over a table.
- Instrument: a unit-test table, EVERY row asserted (not a sample). Coverage is
  by CONSTRUCTION: one baseline (all conditions satisfied -> true) plus exactly
  one row per conjunct where that single conjunct is flipped to its failing
  value -> false. Eight conjuncts, so eight single-flip false rows + one true
  row = nine rows. For a monotone AND this set uniquely pins the function:
  all-true true proves sufficiency; each single-flip false proves that conjunct
  is necessary, which for a monotone boolean forces every multi-flip input false
  too. (AC-9: "one test row per failing condition.")
- Direction of failure: RED if the baseline row is not true, or if ANY single
  failing row returns true.

FROZEN TABLE. Baseline B = `{autoDraftOn:true, capturing:false, extracting:false,
pendingFrames:0, hasMaterial:true, hasEmptySlot:true, savedFormatsState:"loaded",
alreadyDraftedThisStop:false}`.

| Row | Change from B | Expected |
|---|---|---|
| R0 | (none) | `true` |
| R1 | `autoDraftOn:false` | `false` |
| R2 | `capturing:true` | `false` |
| R3 | `extracting:true` | `false` |
| R4 | `pendingFrames:3` | `false` |
| R5 | `hasMaterial:false` | `false` |
| R6 | `hasEmptySlot:false` | `false` |
| R7 | `savedFormatsState:"loading"` | `false` |
| R8 | `alreadyDraftedThisStop:true` | `false` |

Add one two-flip spot row (`capturing:true, hasEmptySlot:false` -> `false`) only
as a monotonicity sanity check; it is not required for coverage.

- SABOTAGE (each must go RED, then GREEN on restore):
  - Drop the `!alreadyDraftedThisStop` conjunct -> R8 flips to true -> RED.
    Discriminates: YES. (This is the once-per-stop guard, the double-draft risk
    the scope names in M3.)
  - Change `pendingFrames === 0` to `pendingFrames >= 0` -> R4 flips -> RED.
    Discriminates: YES.
  - Change `savedFormatsState !== "loading"` to `=== "loading"` (or drop it)
    -> R7 flips -> RED. Discriminates: YES.
  - Change any top-level `&&` to `||` -> most rows flip -> RED. Discriminates:
    YES.
- CANNOT-OVERWRITE pin (the scope's explicit "pin that it cannot overwrite"):
  shouldAutoDraft never returns true when `hasEmptySlot` is false (row R6).
  That is the FIRST of two independent guards. The SECOND is in the reducer and
  is pinned by W1-4b below: `generate-started` targeting a drafted slot leaves
  it unchanged. State both layers so the checker sees the predicate is not the
  sole protection.
- Satisfiability: PROVEN - `scratchpad/ref.mjs` ran R0-R8 + the two-flip row
  green against the reference impl.

## W1-2. isRunComplete (F4: drives the auto-fresh run)

Signature: `export function isRunComplete(slots: readonly Pick<DraftSlot,
"postedTo">[]): boolean;` - reference impl `slots.length > 0 &&
slots.every((s) => s.postedTo !== null)`.

Fixtures match the EMITTED shape (fixtures-must-match-emitted-shape): `postedTo`
is `string | null` on `DraftSlot` (`[READ announcement-draft-slots.ts:120]`),
set to the course NAME string by the reducer `post-result` success case
(`[READ :533-537]` `postedTo: action.result.course`) and to `null` by
`makeSlot` (`:369`) and by every fresh-draft `result` (`:504`). So a posted slot
is `{postedTo: "Course X"}` and an unposted one is `{postedTo: null}`.

- Object compared: the boolean output over a table.
- Instrument: unit-test table, every row asserted.
- Direction of failure: RED if any row disagrees.

FROZEN TABLE (`P = {postedTo: "Course X"}`, `U = {postedTo: null}`):

| Row | Input | Expected |
|---|---|---|
| C0 | `[]` | `false` |
| C1 | `[U]` | `false` |
| C2 | `[P]` | `true` |
| C3 | `[P, P]` | `true` |
| C4 | `[P, U]` | `false` |
| C5 | `[U, U]` | `false` |

- The `[]` row (C0) is pinned so the function's own `slots.length > 0` guard is
  required: a bare `slots.every(...)` returns `true` on `[]` (vacuous truth),
  which would silently claim an impossible empty slot list is a completed run.
  Production never passes `[]` (the slot collection is never empty,
  `[READ announcement-draft-slots.ts:376-378]` `initialSlots`), so C0 is an
  ARGUED boundary that makes the vacuous-true state unrepresentable rather than
  a reachable case. State it as such.
- SABOTAGE:
  - Change `.every` to `.some` -> C4 flips false->true -> RED. Discriminates: YES.
  - Change `!== null` to `=== null` -> C1-C5 invert -> RED. Discriminates: YES.
  - Drop the `slots.length > 0` guard -> only C0 flips false->true -> RED.
    Discriminates: YES (C0 is the only row that catches this mutation).
- Satisfiability: PROVEN - all six rows green against the reference impl.

## W1-3. courseToAutoSelect (F3: single-course auto-select) - CONTAINS ONE REPORTED CONFLICT

Signature: `export function courseToAutoSelect(courses: readonly {id: string}[],
storedId: string | null): string | null;`

### The conflict I must report (refuse a ruling you can disprove)

Three sources specify this function and NO single implementation satisfies all
three. I adopt none silently; I freeze the rows they AGREE on, isolate the one
contested row, and route it.

1. TASK / scope precedent: "mirror the repo/grader single-course reading." The
   repo reading is `resolveSelectedCourse` `[READ bulk-message-model.ts:90-97]`:
   `if (storedId && eligible.some(id===storedId)) return storedId; if
   (eligible.length === 1) return eligible[0].id; return null;`. Measured
   `[MEASURED node scratchpad/ref.mjs]`: this returns the SOLE course even for a
   STALE stored id (`resolveSelectedCourse([c1], "c2") === "c1"`).
2. Scope M5 `[READ scope:349-352]`: auto-select "If `ta-rec-wta-course` has never
   been written (raw `null` or `""`) and exactly one Canvas-linked course loaded
   ... Never overrides an explicit value; never changes a persisted course."
3. Scope AC-12 `[READ scope:444]`: "returns an id ONLY when the raw stored value
   was never written, exactly one course loaded, and the id is in the loaded
   list | ... RED if any failing row still returns an id."

The one CONTESTED input: a stale (ineligible) stored id with exactly one
eligible course. The precedent returns the sole course (an OVERRIDE of the
persisted value); M5's "never changes a persisted course" and AC-12's "only
when never written" both say null. A second, softer divergence: on a
present-AND-eligible stored id the precedent and reading R return that id, while
AC-12's literal "only when never written" wants null - but this is a NO-OP at
the call site (the panel seeds `courseId` from the stored value first,
`[READ Panel:169-171]`, so returning the already-seeded id changes nothing).

### Recommended reading R (what the frozen table below encodes), and why

R (proven green in `scratchpad/ref.mjs`):
`if (storedId) return courses.some((c) => c.id === storedId) ? storedId : null;
return courses.length === 1 ? courses[0].id : null;`

R honors M5 strictly (it NEVER changes a persisted course: a present+eligible id
is returned unchanged, a stale id yields null rather than being silently
re-homed to the sole course) and satisfies the task's three outcomes. It
DIVERGES from the precedent ONLY on the contested stale+single row (R=null,
precedent=sole), and from AC-12 ONLY on the present+eligible no-op row
(R=storedId, AC-12=null). I recommend R for THIS panel specifically because the
panel pre-seeds `courseId` from the stale value, so the precedent's "return the
sole course" would be an ACTIVE overwrite of where a future announcement could
post - a silent change to the destination of an irreversible publish - which is
exactly what M5 forbids.

### Routing (iteration-caps: stopping point = RULINGS)

The orchestrator/owner must rule on ONE row before the implementer finalizes it:
stale stored id + exactly one eligible course -> `null` (reading R, recommended)
OR the sole course id (precedent). The discriminating test input is
`courseToAutoSelect([{id:"c1"}], "c2")`. Cost of being wrong: one function line
and one table row. The implementer builds reading R now; if the owner picks the
precedent, flip that single expected value and the one conjunct. This is a
RULING, not a seat revision - no amount of re-authoring resolves a scope AC that
contradicts the scope's own mechanism statement.

### Frozen table (reading R; every row except the one marked is agreed by all three sources)

`c1 = {id:"c1"}`, `c2 = {id:"c2"}`:

| Row | courses | storedId | Expected (R) | Note |
|---|---|---|---|---|
| A0 | `[]` | `""` | `null` | agreed |
| A1 | `[]` | `null` | `null` | agreed |
| A2 | `[c1]` | `""` | `"c1"` | agreed - THE F3 auto-select |
| A3 | `[c1]` | `null` | `"c1"` | agreed - never-written as null |
| A4 | `[c1, c2]` | `""` | `null` | agreed - the null path with two eligible (scope requires this one) |
| A5 | `[c1, c2]` | `null` | `null` | agreed |
| A6 | `[c1]` | `"c1"` | `"c1"` | present+eligible; AC-12-literal wants null (no-op at call site) |
| A7 | `[c1, c2]` | `"c1"` | `"c1"` | explicit choice preserved despite >1 eligible |
| A8 | `[c1]` | `"c2"` | `"c1"` under precedent / **`null` under R - CONTESTED, needs the ruling above** |
| A9 | `[c1, c2]` | `"c9"` | `null` | agreed - stale + multiple |

- Object compared: the returned id-or-null over the table.
- Instrument: unit-test table, every row asserted. "stored `""` vs `null`" and
  "0/1/2 courses" and "stale stored id" are all exercised (AC-12's own
  instrument list).
- Direction of failure: RED if any row disagrees with the adopted reading.
- SABOTAGE (against reading R):
  - Change `courses.length === 1` to `>= 1` -> A4/A5 flip to a non-null id ->
    RED. Discriminates: YES.
  - Drop the `if (storedId) ... return null` stale guard (collapse to the
    precedent) -> A8 flips `null`->`"c1"` -> RED under R. This row IS the
    precedent/R discriminator; it is the ONE the ruling decides.
  - Change `courses.some(...)` to `!courses.some(...)` -> A6/A7 flip -> RED.
    Discriminates: YES.
- Satisfiability: PROVEN - all ten rows green against reference impl R; the
  precedent's A8 value (`"c1"`) was also measured, which is how the conflict was
  found rather than assumed.

## W1-4. The reducer `reset` action (F4 new-run)

Add `| { type: "reset" }` to `SlotsAction` `[READ announcement-draft-slots.ts:384-404]`
and a `case "reset":` to `slotsReducer` `[READ :423-552]` returning the initial
single empty slot. The hook's `reset()` (dispatching `{type:"reset"}` and
resetting `nextIdRef`) and the panel clearing `batchBlocksRef`/`legibleBlockCount`
are W1/W2 WIRING, not this leaf; the reducer action is the pure leaf.

### W1-4a. `reset` returns the initial single empty slot (frozen literal, not self-comparison)

- Object compared: `slotsReducer(messyState, {type:"reset"})`.
- Instrument: `toEqual` against a FROZEN OBJECT LITERAL - NOT `initialSlots(...)`
  or `makeSlot(...)`, which would compare the reducer to the same construction
  it may use internally and could pass even if that construction were broken
  (refactor-disarms-tests).
- Direction of failure: RED if reset returns anything other than exactly one
  empty, default slot.

Frozen expected literal (one element array):

```
[{
  id: "wta-slot-1", choice: { kind: "default" }, timing: "beginning-of-week",
  scheduledAt: "", draft: { phase: "empty", error: null },
  postArmedFor: null, regenerateArmed: false, posting: false, postError: null,
  postedTo: null, postedScheduledLabel: null, copyError: null, copied: false,
}]
```

The `messyState` input must be a genuinely dirty multi-slot state so the
assertion discriminates: e.g. two slots, one `drafted` with a non-null
`postedTo`, `postArmedFor` set, `scheduledAt` non-empty, `copied:true` - build
it with `makeSlot` + reducer actions (`generate-started`, a `result`, an
`arm-post`), never hand-typed, so the input is a real emitted shape.

- SABOTAGE:
  - Make `case "reset"` return `state` (no-op) -> from the messy multi-slot
    input, `toEqual` the single-slot literal fails -> RED. Discriminates: YES.
  - Make it return the initial slot but with `copied: true` (destroy one field)
    -> `toEqual` fails -> RED. Discriminates: YES.
- `timing` is frozen to `"beginning-of-week"` (`DEFAULT_TIMING`,
  `[READ :22]`). NOTE for W2: F2 (persist "Written for") may want the hook's
  `reset()` to seed the persisted timing AFTER dispatching reset; the reducer
  action itself stays unparameterized and default-timed. If the owner wants
  reset to seed the persisted tone, that is a W2 hook decision and a new row,
  flagged in the residual register - do not bake it into this leaf.
- Satisfiability: PROVEN - the frozen literal equals a reference `reset` output
  in `scratchpad/ref.mjs`.

### W1-4b. The C1 action-count canary MUST be bumped in the SAME change

`announcement-draft-slots.test.ts` holds the exhaustive
`Record<SlotsAction["type"], true>` at `[READ :772-797]` with 16 keys and
`expect(Object.keys(memberTypes)).toHaveLength(16)` (`:796`). Adding the
17th member `reset` without adding `"reset": true` to that Record makes
`npx tsc --noEmit` FAIL (the object literal is missing a required property -
this is the compile-time half, and it is the real gate per the block's own
comment `:774-777`); the `toHaveLength(16)` must become `toHaveLength(17)` or
the runtime assertion fails.

- Object: the union membership, checked at compile time; and the key count.
- Instrument: `npx tsc --noEmit` (compile) + the `toHaveLength` count.
- Direction of failure: tsc error if the Record omits `reset`; RED if the count
  is not bumped to 17. This is a count-canary with a demonstrated failure mode
  (headless-count-canary pattern): the number is bumped in the same commit as
  the member.
- SABOTAGE: add `reset` to the union but NOT to the Record -> tsc fails. Add it
  to both but leave `toHaveLength(16)` -> runtime RED.

### W1-4c. (Recommended) pin the SECOND cannot-overwrite layer

Independent of shouldAutoDraft, pin the reducer invariant that an auto-draft (or
any `generate`) can never overwrite a drafted slot:

- Object: `slotsReducer([draftedSlot], {type:"generate-started", ids:[draftedSlot.id]})`.
- Instrument: `toEqual` the input unchanged (frozen: the drafted slot's `draft`
  is still the same `drafted` object).
- Direction of failure: RED if the drafted slot transitions to `drafting`.
- SABOTAGE: remove `if (slot.draft.phase !== "empty") return slot;`
  (`[READ :461-463]`) -> the drafted slot moves to drafting -> RED.
  Discriminates: YES. This is the production-path guard that makes "auto-draft
  never overwrites" true even if shouldAutoDraft mis-fired.

## W1 write set (exact paths)

- NEW `src/app/components/walkthrough-announcement/walkthrough-run-decisions.ts`
  (`shouldAutoDraft`, `isRunComplete`, `courseToAutoSelect`)
- NEW `src/app/components/walkthrough-announcement/walkthrough-run-decisions.test.ts`
- `src/app/components/walkthrough-announcement/announcement-draft-slots.ts`
  (the `reset` action member + reducer case)
- `src/app/components/walkthrough-announcement/announcement-draft-slots.test.ts`
  (the `reset` behavior test, the C1 Record bump to 17, W1-4c)

DO NOT touch, in W1: `walkthrough-announcement-link-guard.ts`,
`walkthrough-announcement.ts`, `RecordingTab.tsx`, or any A29/grader/repo-grader
file. The hook `useAnnouncementDraftSlots.ts` gains `reset()` and the initial
timing parameter per the scope's wave table, but those are hook wiring with no
caller until W2 - author their tests with W2, not here, and ship W1 + W2 as one
push.

---

# W3 CARRY-FORWARD (do NOT build in W0/W1 - recorded as the AC-5 source-order requirement)

The armed-post consequence notice (`[READ AnnouncementDraftSlot.tsx:270-288]`,
scope section 0 item 3 / S4) must move BELOW the Post/Regenerate/Copy button row
(the row at `[READ scope 2.1 row 20 -> Slot:295-318]`) so Confirm does not shift
under the cursor at the moment of arming. This is a W3 requirement; stated here
so it is not lost.

AC-5 source-order assertion to author IN W3 (MACHINE half; the no-pixel-shift
half is OWNER, scope AC-5):

- Object: `AnnouncementDraftSlot.tsx` source order.
- Instrument: a structure test asserting `indexOf` of the button row's own
  anchor is LESS than `indexOf("wta-post-consequence")` - with BOTH anchors
  asserted `> -1` first (the slice/indexOf -1 widening trap). The notice content,
  the `id` `wta-post-consequence-...`, the `aria-describedby` link
  (`[READ scope AC-4 / timing.structure.test.ts:138-146]`), the two-click
  arm+confirm contract, and `postSignatureFor` (including `scheduledAt`,
  `[READ useAnnouncementDraftSlots.ts:205-214]`) all UNCHANGED.
- Direction of failure: RED if the consequence node precedes the button row, or
  if the id / describedby link / signature changed.
- The existing A32 slice `[READ timing.structure.test.ts:135-173]` anchors on
  `wta-post-consequence` and slices to the next `</p>`; it survives the reorder
  only if the notice stays one `<p>`. Re-run it in W3; do not assume.

This is NOT in the W0/W1 machine set. It is a residual owned by W3.

---

# Executable here vs argued

EXECUTABLE (MACHINE, run in this wave's gate):
- W0 B0-2 (G6 retarget regex + canary, with the `.trim()` sabotage) - PROVEN
  satisfiable in `scratchpad/ref.mjs`.
- W0 B0-3 (five-key canary == 5), B0-5 (ceiling) - structure tests + measurement.
- W1 W1-1 shouldAutoDraft table, W1-2 isRunComplete table, W1-3 courseToAutoSelect
  table (reading R), W1-4a reset frozen literal, W1-4b C1 bump (tsc + count),
  W1-4c cannot-overwrite - ALL proven satisfiable in `scratchpad/ref.mjs`.

ARGUED (grounded by READ, NOT executed here) - labelled so, never asserted as
verified:
- B0-1 (every non-G6 assertion stays byte-green): argued from opening each block
  and confirming none reads the moved `:88-251` symbols. The checker should
  re-walk; the executable confirmation is running the structure test before and
  after the W0 edit.
- That the extraction is behavior-preserving at RUNTIME (the mount-effect restore
  still shows on reload, the course list still loads): NOT verifiable here -
  no component renders (`this-repo.md` section 6). OWNER residual R-1/R-2 below.

# Residual register

| ID | Not proven now | Owner | Instrument | Step that measures it |
|---|---|---|---|---|
| T-RULING-1 | courseToAutoSelect stale+single row: null (R) or sole course (precedent) | repo owner / orchestrator | the row `courseToAutoSelect([{id:"c1"}],"c2")`; decide the expected value | BEFORE W1 build finalizes W1-3 row A8 |
| T-AC12 | AC-12's literal "returns an id ONLY when never written" is RED against R/precedent on row A6 (a call-site no-op) | orchestrator | reconcile AC-12 wording to "never returns an id DIFFERENT from the stored one" or accept R | with T-RULING-1 |
| T-F2-RESET | whether the hook's `reset()` should seed the persisted "Written for" (F2) rather than default timing | repo owner | product call; one row if yes | W2 (hook wiring) |
| T-AC10 | the W2 auto-draft effect calls shouldAutoDraft with the SAME predicate (exported-but-uncalled trap) | test seat (W2 notes) | a structure/wiring assertion in the file that calls it | W2 test notes |
| T-REMOVAL | leverage claim is click/scroll/cursor cost; no MACHINE removal test is buildable (nothing renders) | repo owner | the scope section 3.4 browser snippet + a click count on a fresh and a returning profile | Verify after W3 (scope AC-1/AC-5/AC-8/AC-13) |
| T-RUNTIME | W0 extraction is behavior-preserving at runtime (restore-on-reload, course-list load) | repo owner | a real browser: set course/module/notes + toggles, reload, look | before/after W0 (scope R-1/R-2) |

A residual missing owner, instrument or step is a deletion - all six carry all
three.

# Attribution of readings

Reading R for `courseToAutoSelect` and the F2-reset default-timing choice are MY
readings, acted on so the implementer is not blocked, recorded as mine - not an
owner ruling. When the owner answers T-RULING-1, the record shows which value
was theirs.
