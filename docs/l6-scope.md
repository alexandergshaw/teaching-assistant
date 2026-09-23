# L6 scope: the two residuals the L4 build owes

Source row: `docs/backlog.yml`, `- id: 'L6'` (measured today at line 185 with
`grep -n "id: 'L6'" docs/backlog.yml`). Also read in full: `AGENTS.md`,
`docs/DEV_LOOP.md`, `docs/loop/this-repo.md`, `docs/loop/seats.md`,
`docs/loop/iteration-caps.md`, `docs/loop/traps-search.md`, and
`docs/loop/leverage.md` (the card L6's instrument points at).

Write set for this pass: this file only. No other file was touched. Verified
at the end with `git status --short`.

L6 files two residuals "together because they share an instrument." Per the
brief, the shared-instrument claim is checked FIRST, below, because that
claim turns out not to hold as stated.

---

## 0. What L4 actually was, so "the L4 build" is not taken on faith

`docs/backlog.yml` has no row named `L4` today - it was closed. Read from git
history instead of from a live row, per the "brief from the tree" rule:

- `git log --oneline --all | grep -i "L4"` shows four commits: `590f13a`
  (queues N14), `6bf9f13` (records the owner's leverage directive as L4's
  authority), `c9c6401` (files L4's residuals - this is where L6 itself was
  created), `69cabe2` (closes L4 and L5).
- `git show 6bf9f13 -- docs/backlog.yml` shows L4 build the loop's leverage
  step: `docs/DEV_LOOP.md`, `docs/loop/seats.md`, `docs/loop/leverage.md`,
  `docs/loop/iteration-caps.md`, `AGENTS.md`, `src/loop-docs.structure.test.ts`.
  `docs/loop/leverage.md` is where the six advantage classes (CORPUS, CAPTURE,
  LIVE-LOOP, INTEGRATION, SCALE, GUARANTEED) were derived and where the
  LIVE-LOOP row cites the snapshot-grading keyboard layer as its worked
  instance (`docs/loop/leverage.md:39`, confirmed by direct read).
- `git show c9c6401 -- docs/backlog.yml` is the commit that filed L6 itself,
  with the exact text still in the row today (unchanged since filing).

So "the L4 build" = the leverage directive's own authoring pass, and its
"verification" = the same pass re-reading its own output against the tree
before closing, which is what caught these two residuals as things the build
had not covered.

---

## 1. What each residual actually is, re-measured against the tree today

### Residual (a): "LIVE-LOOP has no removal test ... its example is the
snapshot keyboard layer (SnapshotGradingPanel.tsx:516-558)"

**The citation has drifted. The substance has not.**

The row's own cite, `SnapshotGradingPanel.tsx:516-558`, is stale. Today that
file has no `keydown`/`addEventListener` code at all in that range or anywhere
in the file except a `paste` listener:

```
grep -n "keydown\|addEventListener\|KeyboardEvent" \
  src/app/components/snapshot-grading/SnapshotGradingPanel.tsx
```
returns exactly one line: `555:    el.addEventListener("paste", handlePaste);`
(canary: the same grep DOES find a real `addEventListener` call in this file,
so the search mechanism is not silently broken - it correctly reports there is
no *keydown* listener here anymore).

The `window`-level keydown layer moved out of the panel in the N14 wave 1
extraction (commit `ef630ee`, "fix(snapshot-grading): the keyboard layer gets
a testable leaf and two real fixes" - `git log --oneline -- src/app/components/
snapshot-grading/useSnapshotKeyboardShortcuts.ts`) into a dedicated hook. This
is the exact extraction `docs/loop/this-repo.md` section 1 ("Extracting a hook
out of SnapshotGradingPanel.tsx can fail lint...") already documents from the
build side; it just was never fed back into the leverage citation.

Current location, each verified by direct read and by
`Select-String -Path <file> -Pattern <pattern>`:

- The effect that does the actual binding:
  `src/app/components/snapshot-grading/useSnapshotKeyboardShortcuts.ts:80-122`
  (`useEffect(() => { ... }, [...])`), with
  `window.addEventListener("keydown", onKey)` at `:121` and
  `window.removeEventListener("keydown", onKey)` at `:122`.
- The panel's call site, which is what actually wires it into the mounted
  tree: `src/app/components/snapshot-grading/SnapshotGradingPanel.tsx:579-588`
  (`useSnapshotKeyboardShortcuts({ activeRef, handleSnap, ... })`).
- The eligibility guard the keystroke is gated on, moved to a pure leaf per
  the same wave: `src/app/components/snapshot-grading/snapshot-keys.ts:52-59`
  (`isSnapshotShortcutEligible`), taking three plain booleans -
  `isActive`, `isInsideEditableTarget`, `isModalOpen` - none of which reads
  anything mouse-related.
- File sizes named by `@(Get-Content <file>).Count` (PowerShell, per
  `this-repo.md` section 3's mandated tool): `SnapshotGradingPanel.tsx` = 910,
  `useSnapshotKeyboardShortcuts.ts` = 133, `snapshot-keys.ts` = 165.

**Does a test exist that would fail if this layer stopped being reachable
without a mouse?** Searched with a canaried grep:

```
grep -rniE "without a mouse|no.?mouse|keyboard.only|hands.*keyboard|reachab.*keyboard" \
  src --include=*.test.ts
```
returns exactly one hit, and it is unrelated to snapshot grading:
`src/app/components/knowledge/knowledgeBulkBar.wiring.test.ts:111` ("no tag is
wired through a `title` attribute (unreachable by keyboard, unannounced)").
Restricting to `*.test.ts` is not a blind spot here: `vitest.config.ts`
collects only `src/**/*.test.ts` (`docs/loop/this-repo.md` section 2), so a
`*.test.tsx` file would never run anyway. Canary that the search itself works:
the same pattern, run without the `src --include=*.test.ts` restriction,
also finds real "keyboard-only" language in `docs/lms-credentials-copy.md:429`,
`docs/tasks-group-toggle-focus-acceptance-criteria.md:20`,
`docs/tasks-tab-acceptance-criteria.md:404`, and
`src/app/components/tasks/TasksGrid.module.css:562` - so a zero for the
snapshot-grading directory specifically is a real absence, not a broken
pattern.

The one test that does exist over this mechanism,
`src/app/components/snapshot-grading/snapshot-grading.structure.test.ts:403-430`
(describe: "N14 wave 1: SnapshotGradingPanel is actually wired to
useSnapshotKeyboardShortcuts (the reachability canary for the whole keyboard
layer)"), asserts three things, read directly: the panel imports the hook
(`:415-419`), the panel actually calls it, comment-stripped (`:421-425`), and
the hook's own body actually registers and cleans up a `window` `keydown`
listener, comment-stripped (`:427-429`). All three are existence/wiring
assertions. None of them touches `isSnapshotShortcutEligible`'s guard clauses,
so a change that added a fourth guard requiring, say, a prior click on an "arm
keyboard mode" button would leave this canary fully green while quietly ending
the "hands and attention elsewhere" property LIVE-LOOP claims.

**Verdict: residual (a) still holds.** The gap it describes is real today, the
tree has moved under its own citation, and the citation in both
`docs/backlog.yml`'s L6 row and `docs/loop/leverage.md:39` should point at
`useSnapshotKeyboardShortcuts.ts:80-122` / `SnapshotGradingPanel.tsx:579-588`,
not `SnapshotGradingPanel.tsx:516-558`.

### Residual (b): "the six classes were derived ... on 2026-09-15 and are a
snapshot, not a standing truth ... nothing schedules [re-derivation]"

**Literally still true, and there is now a concrete candidate for the trigger
condition the row's own note proposes.**

`docs/loop/leverage.md` has been edited five times since it was authored
(`git log --follow --format="%h %ad %s" --date=short -- docs/loop/leverage.md`):

```
6c1fbed 2026-09-23 docs(a38): scope single-row grading, and correct a stale constant in two loop cards
5ed14cd 2026-09-20 docs(loop): correct a stale cite in my own leverage card, with its cost
966c545 2026-09-15 docs(loop): the leverage directive learns to check its own removal tests
8239810 2026-09-15 docs(loop): the negative example records a decision, not an open question
f04dd78 2026-09-15 feat(loop): every feature answers what a chat with an LLM cannot do
```

Read directly: the two later edits (`5ed14cd`, `6c1fbed`) are corrections to
citations and a stale numeric constant (`DEFAULT_MAX_SUBMISSIONS`, see
`docs/loop/leverage.md:63`, corrected 2026-09-23 from a wrong "5" to the
measured 40). Neither re-ran the card's own "Re-deriving this list" procedure
(`docs/loop/leverage.md:66-81`, "Failure mode A - run against the live queue"
/ "Failure mode B - grep each candidate class's mechanism") against the
current tree. So the six rows in the table are still exactly the ones
clustered on 2026-09-15; only their prose around them has been patched.
Confirmed there is no scheduling hook anywhere in the loop cards:

```
grep -n "re-derive\|reclustering\|re-cluster" docs/DEV_LOOP.md \
  docs/loop/seats.md docs/loop/leverage.md docs/loop/iteration-caps.md \
  docs/loop/wave-dispatch.md
```
returns two hits, both in `docs/loop/wave-dispatch.md` (`:8` and `:106`) and
both about design SEATS re-deriving each other's findings within one chunk -
unrelated to re-deriving the leverage taxonomy itself. Canary that "derive"
still matches in this file when present: `grep -c "derive"
docs/loop/leverage.md` returns 2 (the word appears in the taxonomy's own
derivation sentence and in the "Re-deriving this list" heading), so the
zero-hit result above is a real absence, not a broken pattern.

**New finding, not in the original row:** `docs/loop/leverage.md`'s own
recommended re-derivation trigger is "when a feature needs a class STRETCHED
to fit" (`docs/loop/leverage.md:76-77`, the L6 row's own note repeats this).
`docs/a24-scope.md:345-349` already claims LIVE-LOOP for a feature whose
mechanism is not the ambient, hands-off control layer the class's own worked
example describes (`docs/loop/leverage.md:39`: "hands and attention elsewhere,
while an activity is in progress"); A24's claim is "a disclosed cohort
boundary" - a disclosure PARAGRAPH becoming visible without an extra click,
read directly at `docs/a24-scope.md:347-349`. Whether that is a legitimate
second instance of "usable at a glance" or a stretch of "ambient control layer
running underneath an activity" is a judgment call I am not making here - but
it is exactly the kind of instance the row's own proposed trigger is supposed
to catch, and nothing caught it. It has NOT shipped: `grep -rn "cohortSpread"
src` returns 0 hits (canary: `grep -rn "useSnapshotKeyboardShortcuts" src`
from the same shell, same directory, returns 18, so the grep engine is finding
real matches when they exist - the zero for `cohortSpread` is a real absence,
meaning A24 is still an unbuilt scope document, not shipped code). `A24`'s
`state` in `docs/backlog.yml` is `'verification'` today (`grep -n "id: 'A24'"
-A2 docs/backlog.yml`), which per `docs/BACKLOG.md`'s own legend means "Never
worked by an agent. Needs a live system or a real credential; the owner
reports" - so this candidate stretch has an owner-facing checkpoint of its own
already, independent of L6.

**Verdict: residual (b) still holds as stated**, and is now better evidenced:
the absence of a schedule is a standing condition (true by construction, since
nothing checks for it), and the specific trigger the row's own note names as
the cheap option ("re-derive when a feature needs a class STRETCHED to fit")
has a live, if unshipped, candidate sitting in the tree right now that nothing
is watching for.

---

## 2. The shared-instrument claim, checked

L6's `instrument` field: "L4 verification, 2026-09-15, against
`docs/loop/leverage.md` and a grep for any test asserting on the keyboard
layer's reachability."

Read as one sentence, this is two different procedures joined by "and":

1. **"against `docs/loop/leverage.md`"** - open the card, read what it says
   about how the six classes were derived and when. This produces a date and a
   sentence ("derived from this tree" / "re-derive... by clustering shipped
   features" per the owner's directive quoted in the row) - not a number, not
   a pass/fail, not anything a future run reproduces mechanically. It answers
   residual (b): "is the taxonomy still exactly what it was on 2026-09-15."
   It says nothing whatsoever about the snapshot-grading keyboard layer -
   `docs/loop/leverage.md` mentions it only as LIVE-LOOP's example row, one
   line among six.
2. **"a grep for any test asserting on the keyboard layer's reachability"** -
   an executable, repeatable search (reproduced above with a canary,
   Section 1). It answers residual (a): "does a removal test exist." It has
   nothing to do with whether the six-class table has been re-clustered since
   2026-09-15 - running it again tomorrow would return the same shape of
   answer regardless of how stale the taxonomy is.

I ran both. Neither one's output feeds the other's question. The grep
(component 2) cannot tell you whether the taxonomy is stale; reading the card
(component 1) cannot tell you whether a removal test exists for the keyboard
layer. They were bundled under one `instrument:` field because both were
found during the same L4 verification PASS - that is a shared origin, not a
shared instrument. Per this brief's own framing: **filing them together under
one instrument was the mistake, and splitting them is the finding.**

Concretely, if this row is next edited (out of this doc's write set, so not
done here - `docs/backlog.yml` is explicitly excluded), it should become two
rows:

- **L6a** (residual (a), LIVE-LOOP removal test): instrument = the canaried
  grep in Section 1, re-run per change to
  `src/app/components/snapshot-grading/`.
- **L6b** (residual (b), class re-derivation cadence): instrument = today,
  none exists that produces a quantity; the honest instrument field is "none -
  this is a standing process gap, not a measured condition" until the owner
  picks a trigger mechanism (Section 4 below).

---

## 3. Is either live today?

**Residual (a): the GAP is live; the ADVANTAGE has not (yet) visibly eroded.**
Read directly, today: `isSnapshotShortcutEligible`
(`snapshot-keys.ts:52-59`) still gates on exactly three booleans -
`isActive`, `isInsideEditableTarget`, `isModalOpen` - and the hook that calls
it (`useSnapshotKeyboardShortcuts.ts:81-90`) resolves all three from `activeRef`,
`target.closest(...)`, and `document.querySelector(...)`, none of which
requires a prior mouse action. So as read (a reading claim - `docs/loop/
this-repo.md` section 6: no component renders here, so "usable without a
mouse" cannot be confirmed by execution), the mechanism is intact. What is
live is the EXPOSURE: nothing in this repo would go red if a future change
added a fourth guard requiring, e.g., a prior click to "arm" keyboard mode -
exactly the erosion shape the row warns about, and the same shape by which the
GUARANTEED class's own guard eroded before L4 caught it (`docs/loop/
leverage.md:151-165`: that erosion was also an ADDITION - a new import - not a
deletion, so the parallel is precise, not loose).

**Residual (b): live by construction, and the specific trigger condition may
already have fired once, unacted on.** There is no cadence to be "on time" or
"overdue" against, so the absence itself is a constant, not an event. The more
useful question - has the row's own proposed trigger ("a class gets
stretched") already occurred - has a candidate answer: `docs/a24-scope.md`'s
LIVE-LOOP claim for a disclosure-visibility feature (Section 1 above),
unshipped as of this measurement (`cohortSpread` returns 0 hits in `src`).
Whether that candidate is real stretch or a legitimate second instance is
exactly what a re-derivation pass would settle, and no such pass has run.

---

## 4. Remedies, separately - they are not the same kind of fix

**Residual (a) has a small, mechanical, buildable remedy - but building it is
still an owner call, not a default.** `docs/loop/leverage.md:176-181` ("Honest
limit") already states LIVE-LOOP is the one class with no buildable TRUE
removal test here, because nothing renders. What IS buildable is the weaker
"guard-growth" canary the row's own note gestures at ("a source-order or
handler-presence assertion, weaker than the GUARANTEED class's ... guard"):
pin `isSnapshotShortcutEligible`'s parameter set to exactly
`{ isActive, isInsideEditableTarget, isModalOpen }` via the same
anchored-slice, comment-stripped technique already used repeatedly in
`snapshot-grading.structure.test.ts` (e.g. `:263-264`, `:322-323`, as read for
a different row in `docs/a24-scope.md:365-368`). This does not prove "usable
without a mouse" - it proves the guard SURFACE has not silently grown, which
is a construction-style disposal (`docs/loop/iteration-caps.md`'s entry gate
2, and the same shape as GUARANTEED's own import-prefix guard). Per
`docs/loop/leverage.md:110-121`'s own rule, the choice between (i) building
this weak guard and (ii) formally accepting the honest limit and closing the
residual as accepted-risk is "decided by the human who scoped it, never
defaulted by the agent" - so this scope document names the buildable design
(Section 5's wave) and does not pick for the owner.

**Residual (b) has no code remedy at all - it is a pure process/scope
question, and the row's own note already names both live options.** Either
(i) re-derive the six classes whenever a claim needs one STRETCHED to fit -
the honest version of this needs a place that actually asks the stretch
question, which today is nobody's job (the AC checker's brief in
`docs/loop/seats.md:96-149` asks whether a claim IS a class, never whether the
class itself still fits its own definition after the claim is made) - or (ii)
accept no schedule at all and let drift accumulate until a checker happens to
notice, which is cheaper and matches how (a) itself was actually found (an
agent's own verification pass, not a scheduled run). I recommend surfacing
this as one batched owner question rather than picking silently, per
`AGENTS.md`'s "never stall" rule (ride the question alongside other work,
never as a gate) and `docs/loop/leverage.md:110-121`'s disposal principle. The
exact question and its cost are in the residual register below (R4).

---

## 5. Wave plan

Only residual (a) has a buildable wave, and it is contingent on the owner
choosing to build the weak guard rather than accept the honest-limit residual
(Section 4). It is recorded here as the design for IF that choice is made; no
code in this wave has been written by this pass (write set is this file only).

**Wave 1 (contingent on owner authorization) - the guard-growth pin for
`isSnapshotShortcutEligible`.**

- `src/app/components/snapshot-grading/snapshot-grading.structure.test.ts` -
  the file that would gain the new `describe` block. It already reads two
  other files' source via `fs.readFileSync` in adjacent blocks (the pattern to
  copy is the block at `:403-430`); the new block adds a third
  `fs.readFileSync` call, this time over `snapshot-keys.ts`, and asserts the
  comment-stripped parameter list of `isSnapshotShortcutEligible` is exactly
  `isActive`, `isInsideEditableTarget`, `isModalOpen` - no more, no fewer -
  using the same anchored-slice idiom already in this file.
- `src/app/components/snapshot-grading/snapshot-keys.ts` - NOT modified by
  this wave. Listed because it is the file the new test reads and asserts
  against; per `docs/loop/seats.md`'s architect brief, a file that is read but
  not written still belongs in the wave's file list so a checker can confirm
  the anchor text the new test depends on (the exact signature at `:52-59`)
  actually resolves against this file, not an assumption about it.

No second wave: there is no caller to wire up, because this wave adds a test
over EXISTING, already-wired code - it does not add an export. This is the
"type-only module" style exception `docs/loop/seats.md:162-164` names ("a
type-only module... emits no runtime code... the brief must say so explicitly"),
adapted to a test-only wave: nothing here is reachable from the app, so there
is no separate "caller" wave to add.

No wave exists for residual (b): it is not a file-list problem. If the owner
picks option (i) in Section 4 (build a stretch-detection question into the AC
checker), that is a NEW, separate scoped item touching `docs/loop/seats.md`,
outside this row and outside this document's write set.

---

## 6. Residual register

| # | Residual | Owner | Instrument | Object under comparison | Direction of failure | Step |
|---|---|---|---|---|---|---|
| R1 | LIVE-LOOP still has no test that fails when the snapshot keyboard layer stops being reachable without a mouse. | Repo owner (build-vs-accept is a disposal call per `docs/loop/leverage.md:110-121`, not an agent default). | The canaried grep in Section 1: `grep -rniE "without a mouse\|no.?mouse\|keyboard.only\|hands.*keyboard\|reachab.*keyboard" src --include=*.test.ts`, re-run after any change under `src/app/components/snapshot-grading/`. | Whether any `*.test.ts` file asserts a failure mode tied to mouse-free reachability of `useSnapshotKeyboardShortcuts.ts`. | RED (residual stays open) if the grep keeps returning zero AND no guard-growth pin (Section 5) exists; discharged the moment either a true removal test or the Wave 1 pin lands, OR the owner formally accepts the honest-limit disposal. | Next agent scoping snapshot-grading keyboard work (N14/A16/A24-adjacent) builds Wave 1 once authorized, or records the accepted-risk disposal explicitly in `docs/backlog.yml`. |
| R2 | The row's own citation for residual (a) (`SnapshotGradingPanel.tsx:516-558`) and `docs/loop/leverage.md:39`'s matching citation are both stale - the mechanism moved to `useSnapshotKeyboardShortcuts.ts:80-122` / call site `SnapshotGradingPanel.tsx:579-588` in commit `ef630ee`. | Whoever next edits `docs/backlog.yml`'s L6 row or `docs/loop/leverage.md`'s LIVE-LOOP table row (not this pass - both files are outside this doc's write set). | Re-open both cited files at the line numbers given and confirm the keydown listener is or is not there; this document's Section 1 is the measurement already taken. | The `file:line` string inside the row/card versus what `useEffect`/`addEventListener` code actually exists at that address today. | A reader who opens the cited lines expecting the keyboard layer and finds a `paste` listener instead is the failure this residual exists to prevent - already reproducible today. | Update both citations to `useSnapshotKeyboardShortcuts.ts:80-122` (mechanism) and `SnapshotGradingPanel.tsx:579-588` (call site) the next time either file is edited. |
| R3 | L6's single `instrument` field actually names two unrelated procedures (a doc-read for (b), a grep for (a)); Section 2 shows neither answers the other's residual. | Whoever next edits `docs/backlog.yml` (not this pass). | Re-read the `instrument:` field on the L6 row and trace which residual each clause actually settles - Section 2 above is that trace. | The single `instrument:` string on the L6 row versus the two independent measurements it is supposed to stand for. | The failure is already latent: anyone who runs "the instrument" expecting it to check both residuals gets only one answer and may believe the other was also checked. | Split L6 into L6a (instrument = the Section 1 grep) and L6b (instrument = none, pending Section 4's owner decision) at the next backlog edit. |
| R4 | The six leverage classes are an unrevisited 2026-09-15 snapshot; no mechanism watches for a class being stretched, and `docs/a24-scope.md:345-349` is a first, unshipped candidate of exactly that. | Repo owner - this is a product/process decision, not a measurement (`docs/loop/leverage.md:110-121`, `docs/DEV_LOOP.md` disposal (b) Reduce). | None exists today. Candidate instrument if option (i) below is chosen: a seventh question added to the AC checker's brief (`docs/loop/seats.md:96-149`) asking whether a claimed class matches its own canonical definition in `docs/loop/leverage.md`, or is stretched to fit. | The six-row class table in `docs/loop/leverage.md` versus every backlog item's leverage claim that cites one of its rows (A16, A20, A24, A29 all do today, per `grep -rn "LIVE-LOOP\|live-loop" docs`). | A class stretched once and never re-examined becomes permanent by repetition - the next feature that copies A24's usage will cite A24 as precedent, not the original definition. | Escalate to the owner as one batched question, riding alongside other work per `AGENTS.md`'s never-stall rule: (i) re-derive now given A24's candidate stretch, (ii) wait until A24 actually ships and re-derive then, or (iii) accept "no schedule" explicitly and close this residual as accepted-risk. |

---

## 7. What this pass could not determine

- Whether `docs/a24-scope.md`'s LIVE-LOOP usage is a genuine stretch or a
  legitimate second instance of the same class is a judgment call this pass
  deliberately did not make - it is the exact question a re-derivation pass
  exists to answer, and pre-answering it here would just be a third opinion
  competing with the two already in the tree (A16's and A24's own scoping
  passes).
- No component renders under vitest in this repo (`docs/loop/this-repo.md`
  section 6), so every claim above about the keyboard layer being reachable
  "without a mouse" is a reading claim over `snapshot-keys.ts` and
  `useSnapshotKeyboardShortcuts.ts`, never an executed one. Labelled as such
  throughout Sections 1 and 3.
- Whether the owner wants residual (b) resolved by process (option (i)),
  by acceptance (option (iii)), or left exactly as filed is not decided here -
  see R4.

---

## 8. Verification of this document itself

- ASCII check: `tr -d -c '\000' < docs/l6-scope.md | wc -c` -> checked below;
  this command counts NUL bytes specifically (the same instrument
  `docs/loop/this-repo.md` section 4 and `docs/loop/traps-search.md` use for
  `docs/REGRESSION.md`), not general non-ASCII bytes. A separate byte-range
  scan was run to confirm no character outside ASCII (0x00-0x7F) is present,
  since the NUL count alone does not establish that.
- No file other than `docs/l6-scope.md` was created or modified by this pass:
  confirmed with `git status --short` below.
- Final test command, per the brief - two files via the wrapper, never a raw
  multi-path `vitest run`: `npm run test:paths -- src/lib/no-emojis.test.ts
  src/source-bytes.structure.test.ts`, exit code captured to a file and read
  back below.
