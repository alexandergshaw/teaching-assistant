# A40 scope check, round 1 of at most two

Adversarial check of `docs/a40-scope.md` (320 lines, `wc -l docs/a40-scope.md`),
committed at `2a00028`. I did not author it. Read first: `docs/DEV_LOOP.md`,
`docs/loop/traps-spec.md`, `docs/loop/iteration-caps.md`, `docs/loop/leverage.md`,
the A40 row via `grep -a -n "A40" docs/BACKLOG.md` (exit 0; no read of
`docs/backlog.yml`), and `docs/a39-census.md` sections 0, path H, 3 and 8.

**VERDICT: BUILDABLE IN PART.** 4 blockers, 6 majors, 6 minors.

**THE DEFECT'S CLASS, stated because the remedy's sufficiency turns on it: DATA
LOSS**, and more firmly than the scope states it. Not "a recovery path exists
but the window is short": the app NAVIGATES THE INSTRUCTOR OFF THE SURFACE the
instant the upload fires (blocker B3), `takeCartridgeDropAction` has already
CAS'd the row to `processing`, and the step holds the archive bytes in memory
(`steps.grading-cartridge.ts:76,88`), so deleting the drop row after the take
does not abort the grade that is already running. The recovery path exists in
code and is unreachable on the path the scope itself calls "the whole point of
this path". Disclosure-only is therefore NOT sufficient at the site the scope
specifies. At the drop-row site it is sufficient for the NEXT upload, which is
the honest claim to make.

---

## 0. What I re-derived myself and found SOUND - one line each, no padding

- **Claim 1, DOM order rather than a race: CONFIRMED.** All six fields carry
  `disabled={loading}` (`CartridgeDropPanel.tsx:393,409,422,435,450,470`) and
  `setLoading(true)` (`:215`) precedes the first `await` (`:221`) with no
  intervening await, so the form locks before the sniff resolves. The scope's
  strengthening of the row is correct.
- **Claim 2, delete-and-retry exists: CONFIRMED.** `deleteCartridgeDrop`
  (`src/lib/cartridge-drops.ts:95-111`) removes the Storage object and the DB
  row; wired at `CartridgeDropPanel.tsx:289-302`, rendered `:569-577`, no
  `status` gate anywhere in either.
- **Claim 3, the trigger fires immediately: CONFIRMED, and stronger than
  stated** - see B3 and minor m4. There is no cron and no poll interval in the
  attended path.
- **The refutation, server-side: CONFIRMED.** `steps.grading-cartridge.ts:96-98`
  reads only `takeResult.rubricText`; nothing in the step imports
  `rubric-memory`. But see B4 for what wrote the drop row.
- **Ceiling: 600 lines, both instruments agree** (`wc -l
  src/app/components/CartridgeDropPanel.tsx` = 600;
  `@(Get-Content "...\CartridgeDropPanel.tsx").Count` = 600). No extraction
  warranted. The scope is right and measured it correctly.
- **Section 5's last two bullets label the instrument correctly.**
  `vitest.config.ts` sets `include: ["src/**/*.test.ts"]` and `environment:
  "node"`, so render order and disclosure copy are reading claims, exactly as
  the scope says.
- **Section 4's "a legitimately empty rubric is a capability" is supported.**
  The placeholder at `:469` does say "If blank, the workflow will generate one."
  RULING 100's ground for rejecting Gate holds on that point.

---

## Blockers

### B1 - FALSE-ABSENCE-BY-MISREPORTED-COMMAND (NEW)

Scope `:249-253` states:

> `grep -rn "CartridgeDropPanel" src --include=*.test.ts` returned no match
> (exit 1) against the canary `grep -rn "GradingTab" src --include=*.test.ts`,
> which returned matches (exit 0) - so the absence is real, not a missed
> pattern.

Re-run, exit code read from the command and not through a pipe:

```
$ grep -rn "CartridgeDropPanel" src --include=*.test.ts; echo "EXIT=$?"
src/app/components/grading-results/rubricProvenanceLeaf.test.ts:32:  path.join(process.cwd(), "src/app/components/CartridgeDropPanel.tsx"),
src/lib/course-lms-options.test.ts:12:  it("uses the same brightspace slug CartridgeDropPanel.tsx uses ...
src/lib/course-lms-options.test.ts:17:  it("does not include Moodle - that is CartridgeDropPanel's ...
EXIT=0
```

Three matches, exit 0. The scope's canary fired correctly and the claim was
still wrong, so the failure is in the REPORTED OUTPUT, not in the filter - the
one shape a canary cannot catch.

`rubricProvenanceLeaf.test.ts:32` `readFileSync`s this exact file and asserts on
it at `:86-90`: `enclosingTextFieldTag(CARTRIDGE_DROP_SOURCE,
'id="cartridge-rubric"')` must contain `maxRows`. That helper takes
`lastIndexOf("<TextField", idIdx)` and scans forward to the first `>` not
preceded by `=`, so it is index-based rather than line-based and a pure reorder
probably survives it - but "probably survives a test nobody knew existed" is not
a gate. The other two matches are prose inside `it()` descriptions, as the
orchestrator already found.

**Consequence.** Wave 2 is specified as "a new `CartridgeDropPanel`-adjacent
structure test" with no obligation to keep the existing reader green, and wave 1
names no gate at all.

**Disposition: fixable in the one revision.** Name
`src/app/components/grading-results/rubricProvenanceLeaf.test.ts` in wave 1's
gate, and state the pass condition: the `id="cartridge-rubric"` TextField tag
keeps `maxRows` after the reorder.

### B2 - REPEAT-OF-B1 (FALSE-ABSENCE-INSTRUMENT)

The scope asks "does a test cover this component" with a name grep and never
asks "which whole-tree walkers include this file in their population". Derived
with my own instrument:

```
$ grep -rln "readdirSync\|readdir(" src --include=*.test.ts; echo "EXIT=$?"
... 41 files ...
EXIT=0
```

Five of those include `src/app/components/CartridgeDropPanel.tsx`:

| Walker | Population | What wave 1 could turn red |
|---|---|---|
| `src/file-size-ceiling.structure.test.ts:102,131` | every checked `.ts`/`.tsx` under `src/` | line ceiling; 600 now, ample headroom |
| `src/lib/no-emojis.test.ts:238-255` | `.ts/.tsx/.css/.md` under `src/` and `docs/` | an emoji in new copy. Floor is `> 500` (`:276`), not an exact count, so no bump owed |
| `src/source-bytes.structure.test.ts:49-69` | 13 text extensions, whole repo | a `\uXXXX` escape materialised by Write/Edit in new copy |
| `src/app/components/courses/page-module-css-classes.test.ts:92,162-167` | every non-test `.tsx` importing a discovered stylesheet | **a Disclose message using a `styles.X` that is not in `src/app/page.module.css`** |
| `src/app/components/courses/page-module-css-orphan-classes.test.ts:39,121-140` | same | **a reorder/edit that drops the last reference to a page.module.css class** |

The panel imports `styles from "../page.module.css"` (`:30`), so it is in both
css walkers' population. The orphan walker also regenerates `docs/css-orphans.md`
(`:360`) - a file already modified in this working tree - so running it has a
tree effect the wave gate must expect rather than treat as an implementer
overreach.

**No walker pins a LINE NUMBER in this file**, which is the good news the scope
could have established and did not. `rubricProvenanceLeaf.test.ts` pins
character indices, not lines.

**Disposition: fixable in the one revision.** Wave 1's and wave 2's gates name
these five plus `rubricProvenanceLeaf.test.ts`, with the css pair called out as
the live hazard.

### B3 - DISCLOSURE-SITE-OUTLIVED-BY-ITS-OWN-TRIGGER (NEW)

**This is the blocker that decides whether wave 1 as written delivers anything.**

Wave 1 (`:232-236`) specifies the Disclose half as a message rendered inside
`CartridgeDropPanel.tsx` "after a successful upload, before or alongside
clearing `rubricText`". Traced end to end:

1. `CartridgeDropPanel.tsx:279` dispatches `CARTRIDGE_DROP_UPLOADED_EVENT`.
2. `WorkflowTriggerWatcher.tsx:165` is the listener (**not `:162`** - see m1);
   handler `onCartridgeDropped` at `:88-119`.
3. `:114` calls `onRunScheduled()`.
4. `onRunScheduled` is `handleWorkflowScheduled`, `src/app/page.tsx:298-302`:
   `setWorkflowsView("workflows"); setToolsSection("workflows");
   setActiveTab("manual");`
5. `GradingTab` renders at `page.tsx:543`, inside `activeTab === "manual"`
   (`:480`) AND `toolsSection === "manual"` (`:494`) AND `manualView ===
   "content"` (`:538`). Flipping `toolsSection` to `"workflows"` unmounts that
   whole branch.

So `CartridgeDropPanel` and every piece of its component state are DESTROYED
inside the same handler chain the upload started, in exactly the case the scope
declares decisive: auto-grading on, tab open, instructor present (`:112-119`,
"the whole point of this path"). The message renders for the duration of a few
Supabase round trips and is then thrown away while the view changes underneath
the instructor. Returning to read it costs rail interactions AND finds nothing,
because the state is gone.

**This is the silent-green failure.** Built exactly as scoped, this passes
`npm run lint`, `npx tsc --noEmit`, `npm run build`'s compile line, every
vitest path including a source-text ordering guard asserting
`id="cartridge-rubric"` precedes `id="cartridge-file"`, and every structure
test in B2 - and the instructor never sees the disclosure. Nothing in this repo
renders a component, so no instrument here can observe it. The scope labelled
the render-order claim as a reading claim (`:202-211`) and correctly so; what it
did not do is trace where the instructor actually IS one second after the
upload, which is not a reading claim - it is a code path.

**Disposition: fixable in the one revision, and the fix stays inside wave 1's
one-file write set.** The durable site is the drops table row (`:543-580`),
which is derived from persisted data and survives unmount:
`CartridgeDrop.rubricText` is already on the type
(`src/lib/cartridge-drops.ts:15`), mapped at `:140`, and refetched by
`listCartridgeDrops`'s `select("*")` (`:84`). A per-row rubric fact is +0
interactions, survives the navigation, and needs no new export and no second
file.

### B4 - OWNER-DECISION-MISCITED-TO-CLOSE-A-FINDING (NEW)

A40-R3 (`:273`) parks the cross-scope rubric fallback as "a known,
owner-accepted tradeoff (DECISION 3, `docs/owner-decisions-2026-09-23.md:69-94`)".
Two things are wrong with that, and both bear directly on the remedy's copy.

**First, the residual is a deletion.** Its Direction of failure is literally
"N/A - not a residual seeking closure" and its Step is "None; recorded for
disambiguation only." `iteration-caps.md`'s anti-gaming rule already rules on
this: "A residual without an owner, an instrument and a step is a deletion. Call
it that." A40-R3 is a deletion of a live defect wearing a residual's row.

**Second, DECISION 3 says the opposite of what it is cited for.** Its own text,
`docs/owner-decisions-2026-09-23.md:88-92`:

> **The existing precedent is a warning, not a template.** Repo Grades already
> persists a rubric - as ONE GLOBAL VALUE for every assignment
> (`ta-repo-grades-rubric`). Copying that shape would silently apply one
> assignment's rubric to another, which is a correctness defect wearing a
> convenience feature's clothes. Key it to something the app actually knows.

DECISION 3 NAMES the cross-assignment substitution as the defect to avoid. What
authorises the newest-across-scopes fallback is a seat-authored architecture doc
(`rubric-memory.ts:27-33`, citing architecture 6.2/6.3), not the owner. That is
`traps-spec.md`'s newest precedent rule run in reverse: a seat-derived reading
of precedent used to CLOSE a finding by attributing it to an owner decision that
says something else.

**And the substitution is real. Measured against the REAL module**, not a
replica, with `node --experimental-strip-types` (v22.14.0) importing
`src/lib/grade/rubric-memory.ts` directly (no copy made, so no diff to record):

```
typeof window BEFORE: undefined
load exact, NO window stub: null
load other scope, NO window stub: null
typeof window AFTER: object
exact: cartridge:CS101|HW1 "RUBRIC ONE"
DIFFERENT assignment -> fallback: cartridge:CS101|HW1 "RUBRIC ONE"
origin label for that fallback: Rubric restored from your last saved rubric (CS101 / HW1), saved just now.
```

`loadRubricMemory(KEY, "cartridge:CS101|HW2")` returns HW1's rubric. The value
flow to the run, traced rather than grepped:

`loadRubricMemory` (`rubric-memory.ts:119-125`) -> `setRubricText`
(`CartridgeDropPanel.tsx:134`) -> `current.rubricText` (`:232`) ->
`mergeSniffedValues`, `current.rubricText || sniff.rubricText || null`
(`src/lib/submission-archive-sniff.ts:74`) -> `effective.rubricText` (`:268`)
-> the drop row -> `takeResult.rubricText` ->
`formData.append("rubric", ...)` (`steps.grading-cartridge.ts:96-98`).

So: the server never reads rubric-memory, AND a rubric the instructor never
typed for this assignment reaches the grade with zero keystrokes. Both are true.
The scope's refutation is narrowly right and materially misleading, and its
answer to "what wrote the drop row" is the defect.

**Why this blocks the remedy rather than sitting beside it.** The Disclose copy
as specified - "state plainly what rubric this specific upload used" - would, in
the fallback case, be the app ASSERTING that a rubric belonging to another
assignment "was used", which is true and is the worst possible thing to say
without naming where it came from. The only mitigation in the tree is the
`rubricOrigin` caption (`:472`), and that caption is broken across exactly this
boundary (minor m2: `setRubricOrigin` is called only at `:136` and is never
cleared, while `:274` clears the field).

**Disposition: owner decision.** See the question at the end - the fork is
whether A40's disclosure names the rubric's ORIGIN or only its PRESENCE, and the
write set differs between the two answers.

---

## Majors

### M1 - STALE-INSTRUMENT-READ-AS-CURRENT

Section 4 prices every candidate against `docs/a39-census.md` section 3, path H:
"WARM = 3 ... crossover N\* = 2". The census's WARM=3 is H5 + H6 + H7, and H6 is
"Paste the rubric - **BEFORE** touching the file input" (census path H table).

Commit `8a977b1` - the commit the scope's OWN HEADLINE says landed rubric memory
on this exact field - makes H6 zero on a warm return. Proven above: the
cross-scope fallback returns an entry even for a scope that has none, so the
field arrives pre-filled whenever `ta-cartridge-rubric` holds anything. By the
census's own counting unit (section 0: filling one field is one interaction; a
pre-filled field is zero, which is exactly how H4 got 0), warm path H is now
**s = 2, N\* = 1**, matching the census's own treatment of path E, the one path
it recorded as persisting a rubric (s = 2, N\* = 1).

DECISION 3 says this in so many words at
`docs/owner-decisions-2026-09-23.md:85-87`: "Persisting is not the same as
making it cheap to reach ... the retrieval interaction is part of this
decision's delivery."

**What it costs.** Section 4's strongest argument against Gate and
Defer-to-submit is "Raises path H's WARM from 3 to 4, N\* from 2 to 3 - a real,
measured backslide against A39's own headline finding". If warm is now 2/1, then
+1 lands on 3/2 - the census's published figure, not a backslide past it. The
instrument cannot observe the thing it is being read as settling: the census
counted a tree that had no rubric memory in it. This is `traps-spec.md`'s newest
entry exactly.

The scope diagnosed the row as half stale for the persistence claim and did not
propagate that to its own cost table. That is an internal contradiction between
the headline (`:14-22`) and section 4.

**This does not reopen RULING 100.** The ruling picks the remedy class; this
corrects the number the scope offers as the ruling's justification, which the
plan seat will otherwise inherit.

**Disposition: fixable in the one revision.** Re-derive path H's s and N\*
against today's tree, name the command, and restate section 4's Verdict column
against the new numbers. If the answer is that Gate now costs what the census
published rather than more than it, say so - the ruling still stands on the
empty-rubric capability argument, which I verified is sound.

### M2 - REMEDY-MECHANISM-NOT-DELIVERED-BY-ITS-WRITE-SET

Section 4 row 1 credits Reorder with "Makes the natural top-to-bottom path the
safe path". Wave 1 (`:229-230`) specifies: "Reorder the rubric field (and, if
the implementer/architect chooses, course/assignment/points/LMS) above the file
field."

If only the rubric moves, the file input still precedes course, assignment,
points and LMS, so the natural top-to-bottom path STILL meets the upload trigger
before the assignment label - which is the census's own required warm step H5,
"Edit the assignment label for this assignment". That value is not cosmetic:

- `effective.assignmentLabel` (`:266`) is written to the drop row;
- it is half of `assignmentInstructions` (`steps.grading-cartridge.ts:95`),
  which on this path is the ONLY assignment description the grader sees;
- it is half of the rubric-memory SAVE scope (`:258`), so a stale label files
  this upload's rubric under the wrong assignment for every future upload.

So a partial reorder fixes one field and leaves four on the identical mechanism,
while the scope's table claims the class is closed for free. The deciding choice
is delegated to the implementer with no criterion, which is the one thing a
wave-1 write set must not do.

**Disposition: fixable in the one revision.** Require all five fields above the
file input, and state it as a pass condition with a direction of failure (the
source-text ordering guard ranges over all five ids, not just
`id="cartridge-rubric"`), so it cannot go green on a partial fix -
`traps-spec.md`, "a pass condition narrower than the defect it closes".

### M3 - REMEDY-DEGRADES-THE-HAZARD-IT-DOES-NOT-ADDRESS

The restore effect's deps are `[courseLabel, assignmentLabel]` (`:142`). Today
the rubric field sits BELOW those two, so a silent cross-scope fill lands ahead
of where the instructor is reading. After the reorder the rubric field sits
ABOVE them, so the sequence "leave the rubric deliberately blank, then fill
course and assignment" silently populates a field the instructor has already
scrolled past, with another assignment's rubric, and then uploads it.

The reorder makes the B4 hazard LESS visible, not more. The scope prices reorder
as unambiguously safe and +0, and that is its only unqualified endorsement.

**Disposition: fixable in the one revision**, and it is the same fix as B3/B4 -
the disclosure must carry provenance, and it must live where the instructor
lands rather than where they were.

### M4 - REPEAT-OF-B1 (FALSE-ABSENCE-INSTRUMENT), on section 5

Two of section 5's three "executable today" bullets are already-shipped
coverage, and one of them is mischaracterised in a way that would produce a test
that cannot fail.

- **`mergeSniffedValues` current-wins is already asserted:**
  `src/lib/submission-archive-sniff.test.ts:510`, "keeps user-typed rubricText
  over sniff value" (`grep -n "it(" src/lib/submission-archive-sniff.test.ts`).
- **`loadRubricMemory`/`saveRubricMemory` are NOT "pure functions over a storage
  key and a scope string" (`:193-196`).** Measured above against the real
  module: with no `window`, `loadRubricMemory` returns `null` for BOTH the exact
  scope and the fallback scope, and `saveRubricMemory` silently no-ops
  (`rubric-memory.ts:37,55`). They need a `window`/`localStorage` stub - which
  the ALREADY-SHIPPED `src/lib/grade/rubric-memory.test.ts` supplies, with an
  opening comment saying exactly that, and which already covers exact-match-first
  (`:103-104`) and newest-across-scopes (`:74-75`, `:93`). **A test written from
  the scope's description verbatim, without the stub, asserts against a function
  that always returns null and passes green** - the class the scope's own closing
  paragraph (`:218-220`) warns about, inside the section that warns about it.
- **The FormData-shape bullet is genuinely new work, and its home already
  exists.** `src/lib/workflows/registry/steps.grading-cartridge.test.ts` (146
  lines, `wc -l`) already mocks `gradeAction` (`:7-14`), so the built FormData is
  observable from `mockGradeAction.mock.calls`. The scope proposes the assertion
  without noticing the file, and A40-R2's instrument ("the unit test over the
  step's built FormData, already specified in RES-A39-3") has the same gap.

**Disposition: fixable in the one revision.** Section 5 becomes: one new
assertion (FormData shape, in the existing step test), and two already-covered
items struck with their covering file named.

### M5 - SETTLED-FORK'S-RESIDUAL-LEFT-UNOWNED

RULING 100 ships reorder + disclose and thereby ACCEPTS that the mistake stays
possible on the file-first path. Section 4 row 1 concedes it ("Does not stop an
instructor who picks the file first out of habit or drag-and-drop. Not sufficient
alone") and section 9 hands it to FORK 1. With FORK 1 settled, no row in section
8 carries that accepted residual with an owner, an instrument and a step.
`DEV_LOOP.md`'s push reconciliation is explicit: "A design pass that ends with
five residuals and a push that records none has deleted five requirements while
reporting success."

Compounding it, section 9 as committed still POSES FORK 1 as open ("Which do you
want: ship the zero-cost pair now, or spend the one extra click ..."). RULING 100
has answered it, so the scope's own text is not consistent with the answer and
the plan seat will read an open fork and re-litigate it.

**Disposition: fixable in the one revision** (transcription, not a round):
rewrite section 9 as "settled by RULING 100", and add A40-R5 carrying the
accepted residual - object: the file-first path still uploads before the form is
complete; owner: repo owner; instrument: the owner verification walk already
specified for A40-R4; direction of failure: an instructor who drag-drops or
habitually clicks the file input first still gets a silent exclusion; step: the
owner verification pass.

### M6 - PRIOR-RULING'S-DEBT-UNCARRIED

`CartridgeDropPanel.tsx:34-35` carries its own debt:

> DECISION 9: ships with no exact-set canary; write one when a sixth `ta-` key
> lands in this directory, covering all of them.

Measured:

```
$ grep -o "\"ta-[a-z-]*\"" src/app/components/CartridgeDropPanel.tsx | sort -u | wc -l
6
```

Six unique keys in this one file: `ta-cartridge-assignment`, `-course`, `-lms`,
`-lms-chosen`, `-points`, `-rubric`. Whether "this directory" means this file or
all of `src/app/components/` is ambiguous in the comment, but DECISION 3's
closing bullet (`owner-decisions-2026-09-23.md:99-100`) is not: "Every new
control persists under a `ta-` prefixed key, and the relevant exact-key-set
canary tests must be bumped in the same commit." A40 wave 1 is the next chunk
touching this file, and the scope does not mention the debt.

`src/lib/client-state-sweep.registry.test.ts` walks (`:59`) but carries no
cartridge-specific pin (`grep -n "cartridge"` on it returns nothing), so no
existing canary is protecting this today.

**Disposition: orchestrator ruling** - whether the sixth key already triggered
the debt, and if so whether A40 wave 2 owes the canary or a separate row does.
Not a seat question; the comment is a ruling's residue and only a ruling
resolves its scope.

---

## Minors

**m1 - three citation off-by-ones, in the passages carrying claims 1 and 3**,
against a scope that opens (`:26-30`) by asserting every citation was reopened
this session:

| Scope says | Actual | Command |
|---|---|---|
| `steps.grading-cartridge.ts:97-99` (rubric append) | **:96-98** | `sed -n '94,100p' src/lib/workflows/registry/steps.grading-cartridge.ts \| cat -n` |
| `steps.grading-cartridge.ts:96` (`assignmentInstructions`) | **:95** | same |
| `WorkflowTriggerWatcher.tsx:162` (listener) | **:165** | `grep -n "addEventListener(CARTRIDGE" src/app/components/WorkflowTriggerWatcher.tsx` |

The second is the notable one: `:95` is the number `a39-census.md` (RES-A39-3)
got RIGHT, and the scope drifted off it while writing "I confirmed the line is
unchanged". Everything else I spot-checked resolved exactly, including all six
field ranges, `:392`, `:207-287`, `:215`, `:221`, `:227-237`, `:258-261`,
`:264`, `:274`, `:279`, `:289-302`, `:393`, `:466`, `:469`, `:470`, `:472`,
`:569-577`, `submission-archive-sniff.ts:64-89` and `:74`,
`cartridge-drops.ts:95-111`, `page.tsx:361`, `WorkflowTriggerWatcher.tsx:88-119`
and `:107-114`, `rubric-memory.ts:97-126`/`:108-126`/`:132-138`/`:17-21`, and
DECISION 3's range.

**m2 - `rubricOrigin` is never cleared, and the Disclose message would render
beside a stale one.** `setRubricOrigin` is called at exactly one place, `:136`;
the "Reset form" block (`:273-278`) clears `rubricText` and `sniffHint` but not
`rubricOrigin`. On the auto-grading-OFF path there is no navigation (B3's chain
never fires), so the panel is left showing "Rubric restored from ..." above an
empty field, indefinitely. The scope's own A40-R3 leans on that caption as the
only mitigation for B4 and does not notice it is broken across the upload
boundary. Fixable in the one revision.

**m3 - no gate command is named for either wave.** `docs/loop/this-repo.md:32`
and `:40` are explicit that `npx vitest run <p1> <p2>` silently DROPS any
argument matching no file and still exits 0, and that two or more paths require
`npm run test:paths` (`package.json:21`). Wave 2 must run, at minimum, the new
file plus `rubricProvenanceLeaf.test.ts` plus the two css walkers - four paths -
so the omission is a live silent-green route, not a formality. Wave 1 names no
gate at all, not even `npx tsc --noEmit` / `npm run lint` / the build's compile
line.

**m4 - A40-R1 is closed by measurement and should be struck, not carried.**
Traced: `enqueueScheduledRun` (`src/lib/workflow-schedule-handoff.ts:26-31`)
pushes and dispatches `SCHEDULED_RUN_EVENT` -> `WorkflowsTab.tsx:624-674`'s
`consume` effect, subscribed at `:673` and also called directly at `:672`, takes
the run (`:672`) and sets `pendingHandoff`. No cron and no poll interval in the
path; the handoff module's own comment (`:5`) says "A claimed run is consumed
within seconds of enqueueing." Carrying this as an open residual understates what
is now known, and the trace is a wave-1 DESIGN INPUT (it is how B3 was found),
not a deferral.

**m5 - A40-R4's instrument cannot observe what it is read as settling.** Its
instrument is "Upload an archive with the rubric box empty, then with it filled,
and read what the panel shows immediately after." Per B3, in the auto-grade case
the panel is unmounted and the owner is looking at the Workflows tab. The
residual's five fields are formally complete and its instrument is
unperformable - `traps-spec.md`'s newest entry applied to a residual rather than
to a count.

**m6 - leverage: the exemption is textually correct, and naming the class would
have changed the remedy argument.** `DEV_LOOP.md`'s Criteria section does exempt
a bug fix, and the row is kind `bug` in `docs/BACKLOG.md`, so section 7 owes
nothing. But `docs/loop/leverage.md`'s ATTRIBUTION row - added today - is
precisely the class this defect sits in ("a named output reaches the right
subject by construction, not by whoever was holding the inputs"), and its
shipped instance pairs a CONSTRUCTION with a REFUSAL BY NAME
(`src/lib/grade/collisionRefusal.ts`), not a caption. A40's defect is the same
shape one level up: the output is produced from inputs the instructor did not
intend for this subject. Naming the class would have put pressure on whether a
message is the right shape at all. One line, not a requirement.

---

## Residual register audit (scope section 8)

| id | Five fields complete? | Verdict |
|---|---|---|
| A40-R1 | yes | **Strike.** Closed by measurement this session (m4). |
| A40-R2 | yes | **Sound.** Object cites `:96`; correct is `:95` (m1). |
| A40-R3 | **no** - Direction "N/A", Step "None" | **DELETION, not a residual** (B4), and its authority miscites DECISION 3. |
| A40-R4 | yes, but instrument unperformable | **Sound in form, revise the instrument** (m5). |
| *missing* | - | **A40-R5 owed**: RULING 100's accepted file-first residual (M5). |

No disposition table is owed: this round restructured nothing, it is the first
scope for the row (`git log --oneline -3 -- docs/a40-scope.md` returned only
`2a00028`).

---

## The feature-already-exists case, argued at its strongest

It does not hold, and I looked for it. The row's persistence half IS already
built - `8a977b1` landed `ta-cartridge-rubric`, `loadRubricMemory`,
`saveRubricMemory`, `describeRubricOrigin`, a scope key derived from
course+assignment (`:36-40`), a restore effect (`:121-142`), a save at the
upload's own effective scope (`:258-261`) and a visible provenance caption
(`:472`). The scope is right that the row is half stale and right about which
half.

But the ordering half is not built, and the disclosure does not exist anywhere:
nothing in `CartridgeDropPanel.tsx` states, after an upload, what that upload
carried. What A39 wave 2 shipped is the opposite of a disclosure - it is a
mechanism that puts a rubric into the field WITHOUT an instructor act, which
raises rather than lowers what A40's disclosure has to say. So the reframe is
not "already exists"; it is "A39 wave 2 made A40's disclosure load-bearing",
which is B4.

## What is dispatchable now

**The Reorder half, revised per M2.** Write set
`src/app/components/CartridgeDropPanel.tsx` only; all five non-file fields above
the file input; pass condition ranging over all five ids with the direction of
failure stated; gate naming `rubricProvenanceLeaf.test.ts`,
`page-module-css-classes.test.ts`, `page-module-css-orphan-classes.test.ts`,
`file-size-ceiling.structure.test.ts`, `no-emojis.test.ts`,
`source-bytes.structure.test.ts`, run via `npm run test:paths`, plus
`npx tsc --noEmit`, `npm run lint` (exit 0, no NEW warning in this file) and
`npm run build`'s compile line. Ceiling is not a concern at 600.

**Not dispatchable while the rest is:** the Disclose half. Its SITE is wrong
(B3) and its CONTENT depends on an owner answer (B4). Both land in the same one
file, so splitting the wave costs nothing but a second commit.

---

## The one question that must come to you

Every answer below ends the activity; neither starts a round.

**A40's disclosure has two possible contents, and the code's current behaviour
conflicts with DECISION 3's own text (B4). Which does A40 ship?**

**(a) PRESENCE ONLY.** The drop row states whether this upload carried a rubric
or none, with the "the workflow will generate one" language the placeholder
already uses. Stays inside `CartridgeDropPanel.tsx`, +0 interactions, ships this
week. The cross-assignment fallback stays exactly as built, and A40 files it as
A40-R6 owned by you, with the `rubricOrigin` caption (repaired per m2) as its
instrument and the owner verification pass as its step. Cost if this is the
wrong call: an instructor whose rubric came from last week's assignment sees the
app confirm "a rubric was used" and is not told which.

**(b) PRESENCE PLUS ORIGIN.** The drop row names which course/assignment the
rubric came from, so a fallback-sourced rubric is visible on the row
permanently. This closes the DECISION 3 conflict inside A40 and is still +0
interactions - but it grows the write set, and honestly: the drop row does NOT
store the rubric's origin scope today (`CartridgeDrop`,
`src/lib/cartridge-drops.ts:9-25`, has `rubricText` and no provenance field), so
(b) is one of two things, and I need you to not have to choose between them:
either a new column on `cartridge_drops` (write set grows to
`src/lib/cartridge-drops.ts` plus a migration, and migrations auto-apply on push
to main), or the panel comparing the uploaded rubric against rubric-memory at
render time, which stays in one file but is only correct in the session that
uploaded. **If you answer (b), I will take the new column**, because the
render-time comparison is a disclosure that silently stops being true on reload,
which is the same class of defect A40 exists to fix.

**My recommendation: (b) with the new column.** RULING 100's zero-interaction
constraint survives either way; what (b) buys is that the sentence the app says
is true on every reachable state, which A31 Ruling 1 (quoted in DECISION 2's
tail) already requires of confirm copy. Cost of being wrong about (b): one
migration and one column for a caption most instructors will never need to read.

---

## Verdict and counts

**BUILDABLE IN PART.**

| Severity | Count |
|---|---|
| Blocker | 4 |
| Major | 6 |
| Minor | 6 |

**Blocker classes, NEW or REPEAT:**

1. **B1 - FALSE-ABSENCE-BY-MISREPORTED-COMMAND - NEW.** An absence claim whose
   canary fired and whose reported output was still wrong.
2. **B2 - REPEAT-OF-FALSE-ABSENCE-INSTRUMENT (B1's class).** Same corrective
   rule fixes both: derive the population with your own instrument and paste its
   real output. Not relabelled to buy a round - it is the same rule, so it is a
   repeat, and it goes to disposal now.
3. **B3 - DISCLOSURE-SITE-OUTLIVED-BY-ITS-OWN-TRIGGER - NEW.** The remedy's
   render site is unmounted by the event the remedy is disclosing.
4. **B4 - OWNER-DECISION-MISCITED-TO-CLOSE-A-FINDING - NEW.** A residual closed
   by attributing it to an owner decision whose text forbids the shape.

**M4 is also REPEAT-OF-FALSE-ABSENCE-INSTRUMENT** and carries the same disposal,
which makes that class 3 instances in one artifact - the signal
`traps-spec.md` says to name and move rather than patch: every absence claim in
the revision must paste its command AND its real exit code, and section 5 must
be re-derived rather than repaired.

**Honest stopping point: RULINGS and DESIGN.**

- **Rulings** - M6 (is the DECISION 9 canary debt due now, and who owes it) and
  M1 (the orchestrator consumed the census's WARM=3 into RULING 100's
  justification; the number needs re-deriving even though the ruling stands).
- **Design** - B3 and B4 change WHERE the disclosure lives and WHAT it says,
  which is shape, and the answer to the owner question above determines the
  write set.
- Not *measurement*: everything measurable here I measured, including the two
  claims the scope left as residuals.

---

## Concurrency

Read-only against the tree. One file written: this one. No production or test
file mutated; no scratch directory created inside the repo - the probe lives at
`C:\Users\alexa\AppData\Local\Temp\claude\...\scratchpad\probe.mts` and imports
`src/lib/grade/rubric-memory.ts` by `file:///` URL rather than copying it, so
there is no replica and no diff to record. Canary for the no-scratch claim:
`git status --short` below shows no untracked path under `src/`. No `git stash`,
no `git add -A`, no `git checkout --`. Siblings `docs/r2-wave1-subwaves.md` and
`docs/a46-scope.md` were not opened, written or referenced. `docs/backlog.yml`
was never read.

```
$ git status --short
 M docs/css-orphans.md
 M src/app/actions.ts
 M src/app/actions/action-guard-coverage.test.ts
 M src/lib/grade.ts
 M src/lib/grade/engine.ts
 M src/lib/module-graph/runtime-import-graph.test.ts
?? docs/a40-check.md
?? src/app/actions/action-guard-coverage-github-cohort.test.ts
?? src/app/actions/grading-incremental.test.ts
?? src/app/actions/grading-incremental.ts
?? src/app/api/grade-run-item/
?? src/app/components/grading/
?? src/lib/grade/reconcile.test.ts
?? src/lib/grade/reconcile.ts
```

**`docs/a40-check.md` is the only path I wrote.** `docs/css-orphans.md` was
already modified at conversation start. Every `src/` entry above appeared DURING
this check and is not mine - the paths (`src/lib/grade/engine.ts`,
`grading-incremental.ts`, `reconcile.ts`, a `grade-run-item` route) are the
CONCURRENCY class's own file set, i.e. a sibling working A46. I touched none of
them. Two consequences the orchestrator should note rather than read as my
overreach:

- `src/lib/grade/engine.ts` is modified, and `docs/loop/leverage.md`'s
  CONCURRENCY row cites it as the measured gap. Any A40 revision that quotes that
  row is quoting a moving file.
- `npm run lint`'s warning count and `npx tsc --noEmit` are shared under
  concurrency (`DEV_LOOP.md`, standing rules), so A40's wave 1 gate must be run
  against a `git status --short` taken at ITS OWN start, never against this one.

(Note for the wave gate, per B2: the orphan walker regenerates
`docs/css-orphans.md`, so a wave-2 test run will touch it again.)
