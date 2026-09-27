# A32 wave 1 remediation: adversarial check of commit 327f3e3 (ROUND 2 of 2)

Fresh checker. I did not author the remediation and I did not author round 1.
Default is defective. Every quantity below names the command that produced it.
Read against `docs/a32-build-rulings.md` (RULINGS 64-68),
`docs/a32-build-check.md` (round 1), `docs/DEV_LOOP.md`,
`docs/loop/traps-spec.md` and `docs/loop/iteration-caps.md`.

**Verdict: DEFECTIVE. 2 blockers, 5 majors, 7 minors.**

The remediation's own central claim holds: each of the five named mutations from
round 1 is now RED, and I proved all five by replica rather than taking the
commit message's word for it. What is wrong is the generalisation. Four of the
five instruments still admit the NEXT mutation in their own family, and the two
expressions that actually decide whether a scheduled post is scheduled - both in
`useAnnouncementDraftSlots.ts`, both introduced or re-sited by this very commit -
have no instrument of any kind. The class RULING 65 named is therefore not
closed: `grep -rn 'readFileSync[^)]*useAnnouncementDraftSlots' src --include=*.test.ts`
still exits 1, exactly as it did at round 1.

**All but two findings are REPEATS.** Per `iteration-caps.md` that means the
artifact is wrong rather than underspecified: the remediation reproduced the
class it was built to close, one function call further out. The two NEW findings
(M-R2-4, M-R2-5) are process and copy, not mechanism.

---

## 0. Method, and what I deliberately did not do

I did **not** mutate any file under `src/`. Two sibling agents are live
(`src/lib/grade/*` + provenance, `docs/a25-*`) and `docs/loop/this-repo.md`
section 2 bans two concurrent sabotage-verifies on one tree. Instead:

1. **Proof the instruments execute and pass on the real tree.**

   ```
   npm run test:paths -- src/app/components/walkthrough-announcement/walkthrough-announcement.structure.test.ts src/app/components/walkthrough-announcement/useAnnouncementDraftSlots.test.ts src/app/components/walkthrough-announcement/announcement-draft-slots.test.ts src/app/components/walkthrough-announcement/scheduled-visibility.test.ts
   ```

   `Test Files 4 passed (4)`, `Tests 210 passed (210)`, `COVERED` on all four
   arguments (94 / 19 / 88 / 9), `EXIT=0` read from the command, not a pipe.

2. **Proof of what they can and cannot FAIL on, by replica.** Every new
   assertion in `walkthrough-announcement-timing.structure.test.ts:111-294` is a pure
   function of source TEXT (`fs.readFileSync` + `String.indexOf` +
   `String.slice` + `toMatch`). I transcribed them assertion-for-assertion into
   a Node script and evaluated them over mutated copies of the real file held in
   memory. The unmutated baseline evaluates GREEN, which agrees with the real
   vitest run in (1), so the replica is faithful. Results in section 3.

   **Residual (owner or next wave, instrument: `npm run test:paths` on the three
   A32 test paths after a `cp` backup):** re-run the eleven mutations in section
   3 against the real file when the tree is quiet. The replica cannot be wrong
   about the predicate; only a real run proves the vitest wiring too. This is
   the same residual round 1 filed and it is still open.

3. **`npx eslint src/app/components/walkthrough-announcement/`** returns no
   output, exit 0.

4. **`npx tsc --noEmit --incremental false`** exits 2 with 13 errors, **all** in
   `src/lib/github-grading-run-store.ts`, `src/lib/grading-drafts.ts`,
   `src/lib/grade-result-allowlist-coverage.test.ts` and
   `src/lib/grade/rubricProvenance.test.ts` - a sibling's in-flight work. **Zero
   errors in any A32 file.** So no clean full type gate exists for this commit
   right now; see MINOR 7.

5. Nothing renders under vitest and the network is blocked. Every statement
   below about markup, an aria-live region or what an instructor sees is a
   READING claim from source.

6. `git status --short` before and after my one write: only
   `docs/css-orphans.md` (pre-existing, not mine) plus this file.

---

## 1. BLOCKERS

### BLOCKER R2-1 - the two expressions that decide whether a scheduled post is scheduled have no instrument, and one of them was created by this commit

**Class: silent-green - the half of a two-sided contract that has no instrument.
REPEAT-OF round-1 BLOCKER 3 / RULING 65.**

RULING 65 ordered: "the decision half gets an executing assertion". What shipped
is an executing assertion on a NEW pure helper. The helper is correct and its
four cases are good. But the helper is not the decision half - `commitPost` is,
and `commitPost` is still un-instrumented in both directions.

Measured absence, with a positive canary in the same command form:

```
grep -rn 'readFileSync[^)]*useAnnouncementDraftSlots' src --include=*.test.ts   -> exit 1 (nothing)
grep -rn 'readFileSync[^)]*AnnouncementDraftSlot\.tsx' src --include=*.test.ts  -> exit 0, 5+ hits
grep -rn 'postDraft' src --include=*.test.ts                                    -> exit 1 (nothing, repo-wide)
grep -rn 'commitPost|renderHook|@testing-library' src --include=*.test.ts       -> comments only; no renderer in this repo
```

`delayedPostAt` appears in `useAnnouncementDraftSlots.test.ts` only as
`resolvePostCommit`'s RETURN value (`:108`, `:116`, `:124`), never as an argument
observed at a call site. Canary that the token is assertable elsewhere:
`grep -c delayedPostAt src/app/actions/walkthrough-announcement.test.ts` returns 4.

So both of these single-token edits keep lint, tsc, `next build`, all 210 A32
tests and every structure test green:

- `useAnnouncementDraftSlots.ts:436`
  `postDraft(slot.draft.draft.title, slot.draft.draft.message, decision.delayedPostAt)`
  -> `..., undefined)`. **Every scheduled post publishes immediately and
  irrevocably to every student**, while the consequence paragraph, all five
  labels and `resolvePostCommit`'s own green test still say "schedule". This is
  A32's original blocker, and it is the same mutation round 1 spelled out at
  `docs/a32-build-check.md:414`.
- `useAnnouncementDraftSlots.ts:447`
  `scheduledLabel: decision.scheduledLabel` -> `scheduledLabel: null`. `null` is
  assignable to `string | null`, so tsc is silent. **RULING 64's new field is
  then always null and the false sentence renders on every scheduled post,
  forever**, with all three of RULING 64's new instruments green: the reducer
  test writes the label from a hand-built action, and the structure test reads
  the render branch. Nothing asserts the wire between them.
- The RULING 65 mutation itself is also still green: replace
  `const decision = resolvePostCommit(slot.scheduledAt, Date.now());`
  (`:397`) with an inline truthiness resolution. `resolvePostCommit` stays
  exported and its four tests stay green because they test the function, not the
  caller; nothing reads the hook as source, so nothing notices it is unused.

**To be explicit about the brief's highest-value question: the field IS set
correctly at runtime as shipped.** The chain is complete and I traced every hop -
`resolveScheduledVisibility` returns `label` (`scheduled-visibility.ts:45`),
`resolvePostCommit` carries it (`useAnnouncementDraftSlots.ts:156`), `commitPost`
forwards it into the success payload (`:413`), the reducer writes it
(`announcement-draft-slots.ts:537`), the render branches on it
(`AnnouncementDraftSlot.tsx:355`). The defect is not that the field is null; it
is that **nothing holds it non-null**, so RULING 64's fix is one token deep.

**Disposition: (i) an implementer can fix this from this report.** Two options,
and the second is the one `iteration-caps.md` rule 1 requires, because a
source-text pin is the SAME KIND as the five source-text pins this round already
produced:

- Minimum (same kind, still worth having): a new describe in
  `walkthrough-announcement.structure.test.ts` that `readFileSync`s
  `useAnnouncementDraftSlots.ts`, slices between
  `const commitPost = useCallback(` (`:382`) and `const armPost = useCallback(`
  (`:426`), and pins all three of `resolvePostCommit(slot.scheduledAt, Date.now())`,
  `decision.delayedPostAt` as the third `postDraft` argument, and
  `scheduledLabel: decision.scheduledLabel`. Also closes the "no test reads the
  hook as source" fact that RULING 65 measured.
- Kind change (recommended): make the wire itself executable. Export a pure
  `postArgsFor(decision)` / `postResultFor(decision, result)` from
  `useAnnouncementDraftSlots.ts`, have `commitPost` call nothing else on that
  path, and pin the EMITTED argument tuple and the EMITTED success payload in
  `useAnnouncementDraftSlots.test.ts`. That converts a token pin into an emitted
  value, which is the bar the brief states and the bar RULING 66 states.

### BLOCKER R2-2 - `isScheduled`'s DEFINITION is unpinned, so round 1's MAJOR 1 and MAJOR 3 are both fully reintroducible in one line

**Class: an assertion written against the presence of a name rather than against
the mutation. REPEAT-OF RULING 66.**

The remediation pinned two things and left the line that connects them open:

- `walkthrough-announcement-timing.structure.test.ts:131` pins that
  `resolveScheduledVisibility` is imported and CALLED.
- `:818` and the five `twoBranches` regexes pin that the branch sites read the
  token `isScheduled`.
- **Nothing anywhere pins `AnnouncementDraftSlot.tsx:115`,
  `const isScheduled = visibility.kind === "scheduled";`.**

`grep -rln isScheduled src --include=*.test.ts` returns exactly one file, and
`grep -n isScheduled` on it returns 11 lines, all inside `:812-884`, all
transcribed into my replica. So the replica is the whole of the repo's coverage
of this token.

Replica result (MUT-1, section 3): replacing `:115` with
`const isScheduled = slot.scheduledAt.trim().length > 0;` - leaving the import
and the `resolveScheduledVisibility` call at `:114` in place, because the label
still needs `visibility.label` - is **GREEN on every assertion**. Consequence for
a past-dated pick: the consequence paragraph says "Confirming schedules this
announcement to become visible ... at " with an empty time (because
`visibility.kind` is `immediate`, so the inner narrowing yields `""`), all five
labels say "Schedule"/"Scheduling", and `commitPost` posts immediately. That is
round-1 MAJOR 1 and MAJOR 3 simultaneously, and it is REQ-A32-1's exact failure
mode.

The remediation's own comment at `:811-815` states that the old assertion was
defeated by "an inner re-narrowing" and that the fix "anchors on the ternary's
own condition token, the thing that actually decides which sentence renders."
The token is not the thing that decides; the token's DEFINITION is. Anchoring on
the token is the identifier-name check RULING 66 forbade, relocated.

**Disposition: (i) implementer-fixable.** Pin the emitted derivation, not the
token: assert `/const isScheduled = visibility\.kind === "scheduled";/` in the
`RULING 66/M4` describe alongside the import and call, and add the negative
`expect(source).not.toMatch(/const isScheduled =[^\n]*scheduledAt/)`. Stronger
and preferred: delete `isScheduled` and branch on `visibility.kind === "scheduled"`
at each site, so there is no intermediate boolean to redefine - the
"make the bad state unrepresentable" construction `iteration-caps.md` prefers.

---

## 2. MAJORS

### MAJOR R2-1 - the consequence paragraph's two sentences are searched over the whole slice, so swapping the branches is green

**REPEAT-OF RULING 66.** `walkthrough-announcement-timing.structure.test.ts:164-174`:

```
expect(slice).toMatch(/schedules this announcement to become visible/);
expect(slice).toMatch(/publishes this announcement to every student[\s\S]*immediately/);
```

Neither is bound to a branch. Replica MUT-2: swap the contents of the two `<>`
blocks in `AnnouncementDraftSlot.tsx:271-282` and both assertions still match,
because both strings are still somewhere in the slice - **GREEN**. An instructor
arming a scheduled post would then read "Posting publishes this announcement to
every student ... immediately", and an instructor arming an immediate post would
read the schedule sentence, in a `role="status" aria-live="polite"` region, which
is the fifth-false-sentence family this whole round exists to close.

The author already knows the technique that fixes it: the RULING 64 describe at
`:936-947` splits its ternary on `indexOf("?")` / `indexOf(":", qIdx)` and asserts
per branch - and my replica confirms that one DOES catch its swap (MUT-5, RED).
The same split was not applied 110 lines earlier.

**Disposition: (i).** Split the consequence slice on its own `?` / `:` and assert
each sentence inside its own branch, plus the negative in each.

### MAJOR R2-2 - RULING 64's condition can be weakened to always-false and stay green

**REPEAT-OF RULING 66.** `:934` is `expect(slice).toMatch(/slot\.postedScheduledLabel\s*\?/)`.
That regex matches `slot.postedScheduledLabel?` - i.e. an optional-chain. Replica
MUT-6: `{slot.postedScheduledLabel?.length === -1` is **GREEN** on every
assertion, and renders `Posted to CS 101. Students can see it now.` on the
scheduled path forever. Same outcome as BLOCKER R2-1's second mutation, reached
from the component side instead of the hook side.

**Disposition: (i).** Pin the whole condition, `/\{slot\.postedScheduledLabel\s*$/m`
or `/\{slot\.postedScheduledLabel\n\s*\?/`, and add
`expect(slice).not.toMatch(/postedScheduledLabel\s*\?\./)`.

### MAJOR R2-3 - the "Timing" substring guard only inspects double-quoted string literals

**REPEAT-OF RULING 66.** `:774-780` collects `source.match(/label="[^"]*"/g)` and
rejects `/Timing/` in each. Replica MUT-3b (`label="Timing preset"`) is RED, so
the named mutation is genuinely closed - credit. Replica MUT-3
(`label={"Timing preset"}`) is **GREEN**: a JSX-expression label is not in the
match set at all. `label={SOME_CONST}` and `` label={`Timing ${x}`} `` escape the
same way. The describe's own title claims the constraint is "neither per-slot
control may be named 'Timing' or contain it as a substring", which is a claim
about labels, not about label spellings.

**Disposition: (i).** Widen the match to `/label=\{?["'`][^"'`]*["'`]\}?/g` plus a
separate rejection of `/label=\{[A-Za-z_$][\w$]*\}/` (an identifier label cannot be
audited by source text at all, so ban the shape), and keep the existing canary.

### MAJOR R2-4 - the replacement success sentence misnames its own subject, and the mirror it cites does not say what it says

**NEW.** `AnnouncementDraftSlot.tsx:356`:

```
? `Scheduled for ${slot.postedTo}. Students will see it ${slot.postedScheduledLabel}.`
```

`postedTo` is a COURSE NAME, not a time: `WalkthroughAnnouncementPanel.tsx:657`
returns `{ course: selectedCourse.name }` and the reducer writes it to `postedTo`
(`announcement-draft-slots.ts:536`). So the rendered sentence is
`Scheduled for CS 101. Students will see it 6/20/2026, 9:30:00 AM.` -
"Scheduled for X" followed immediately by a time reads as "scheduled for that
time", and the immediate branch's parallel "Posted to CS 101." shows the
preposition the scheduled branch dropped. In a `role="status" aria-live="polite"`
region, this is announced as one utterance.

The comment at `:344-348` states this mirrors "the sibling's own branching
success copy at announcements-panel.tsx:280-283". Measured, the sibling
(`announcements-panel.tsx:280-282`) is:

```
text: scheduledLabel
  ? `Announcement scheduled. Students will see it ${scheduledLabel}.`
  : "Announcement posted to Canvas.",
```

The sibling interpolates **no course** and has no "Scheduled for" slot. The
citation supports the BRANCHING and not the wording, and the divergence is
exactly where the new sentence goes wrong. The instrument does not catch it: `:944`
asserts only `/Students will see it/`, which is the half that is fine.

**Disposition: (i)**, with one caveat: the exact string is a copy choice, so if
the owner wants different wording that is a preference, not a fork - nothing
downstream depends on it. Recommended:
`` `Scheduled in ${slot.postedTo}. Students will see it on ${slot.postedScheduledLabel}.` ``
and pin the emitted sentence in the instrument, not a fragment of it.

### MAJOR R2-5 - a restructuring round shipped no disposition table, and one assertion was narrowed inside it

**NEW.** `iteration-caps.md` entry gate 3: "Every restructuring round ships a
disposition table mapping each prior requirement to kept / handed over /
withdrawn... The checker audits that table before reading the new round on its own
terms." This round rewrote five describes and removed assertions; the commit
message describes the five fixes but maps nothing. There is no table, so I
derived the withdrawals from the diff. One is a real narrowing:

- **Withdrawn, unrecorded:** `expect(slice).not.toMatch(/scheduledAt\.(trim\(\)\.)?length/)`,
  a ban on `.length` ANYWHERE in the consequence slice. Its replacement,
  `not.toMatch(/aria-live="polite">\s*\{slot\.scheduledAt/)`, is anchored to the
  outer condition only. A length check placed inside the paragraph's inner
  expression was caught before and is not now.
- Kept and strengthened (verified by replica, no loss): the five
  `xLabel={isScheduled` pins became `twoBranches` extractions;
  `not.toMatch(/label="Timing"/)` became the per-label loop; the two
  anchor-resolves per block were merged into one each (85 -> 94 tests,
  `Tests 210 passed` above).

**Disposition: (ii) the orchestrator records it.** No revision 3 is dispatched,
so the table cannot be authored by the seat. The withdrawal is named above, which
is what the gate exists to produce; record it as a residual against A32 with the
restored assertion as the instrument, or restore the broader ban in the same
implementer pass that fixes MAJOR R2-1.

---

## 3. The instruments: the eleven mutations, measured

Replica of `walkthrough-announcement-timing.structure.test.ts:111-294`, evaluated over
in-memory mutated copies of `AnnouncementDraftSlot.tsx`. "Named" means the
mutation round 1 demonstrated the old instrument green under.

| # | Mutation | Verdict | Wanted | |
|---|---|---|---|---|
| baseline | unmutated real source | GREEN | GREEN | ok, agrees with the real vitest run |
| MUT-M1 | **named**: consequence outer condition -> inline `slot.scheduledAt.trim().length > 0` | RED | RED | **fixed** |
| MUT-M3 | **named**: `idleAriaLabel` identical on both branches | RED | RED | **fixed** |
| MUT-M4 | **named**: `resolveScheduledVisibility` replaced by a hand-rolled substitute with the same field names | RED | RED | **fixed** |
| MUT-M6 | **named**: datetime `onChange` forwards a constant `""` | RED | RED | **fixed** |
| MUT-M8 | **named**: a label of `"Timing preset"` | RED | RED | **fixed** |
| MUT-1 | `isScheduled` redefined from a raw length check, call left in place | **GREEN** | RED | BLOCKER R2-2 |
| MUT-2 | consequence paragraph's two branch CONTENTS swapped | **GREEN** | RED | MAJOR R2-1 |
| MUT-3 | a label of `{"Timing preset"}` (JSX expression) | **GREEN** | RED | MAJOR R2-3 |
| MUT-6 | RULING 64 condition weakened to `postedScheduledLabel?.length === -1` | **GREEN** | RED | MAJOR R2-2 |
| MUT-4 | `idleLabel`'s two branches swapped | RED | RED | ok |
| MUT-5 | RULING 64's two branches swapped | RED | RED | ok |

So: **all five named mutations are genuinely closed** - the commit message's
central claim is true as stated, and I verified it rather than accepting it. Four
of the five instruments admit the next mutation in their own family. The fifth
(MUT-M6, the datetime control) pins the exact call text
`onSetScheduledAt(slot.id, e.target.value)` and I found no green escalation for
it; it is the one instrument in this commit that meets the bar.

The two hook-side mutations in BLOCKER R2-1 are not in the table because no
instrument reads that file, so there is nothing to replicate: the absence itself
is the measurement, and its canary is in section 1.

---

## 4. RULING-by-RULING, against what was ordered

| Ruling | Ordered | Delivered | Verdict |
|---|---|---|---|
| 64 | branch the success sentence; the instrument asserts BOTH branches | branched; both branches asserted and the swap is RED | **the branch is real and the field IS set at runtime** - but the field's only producer is un-instrumented (BLOCKER R2-1), the condition is weakenable (MAJOR R2-2), and the new sentence misnames its subject (MAJOR R2-4) |
| 65 | the decision half gets an executing assertion | `resolvePostCommit` exported, 4 executing cases incl. the past-date discriminator; `commitPost` calls it at `:397` and holds NO residual inline copy - I checked, the only `resolveScheduledVisibility` use in the hook is inside `resolvePostCommit` | **the helper is right, the decision half still has none** - BLOCKER R2-1 |
| 66 (M1) | assert the emitted value, not the name | outer condition token pinned | REPEAT: the definition is open (R2-2) and the sentences are unbound (R2-1) |
| 66 (M3) | ditto | `twoBranches` extracts both literals, requires them to differ and each to carry its own wording; all five props | **closed** - swap is RED for all five |
| 66 (M4) | ditto | import + call pinned | partially: routing around the call is RED, routing around the RESULT is GREEN (R2-2) |
| 66 (M6) | ditto | exact call argument pinned | **closed** |
| 66 (M8) | ditto | per-label substring loop with a canary | REPEAT for expression labels (R2-3) |
| 67 (M6) | orchestrator's own correction | panel untouched; `@(Get-Content).Count` = 991 and `wc -l` = 991, so the 9-line headroom claim is accurate | not this commit's to close; the standing extraction obligation is correctly restated |
| 68 (M7) | `scheduledAt` in the confirm signature | see below | **closed, and the wiring genuinely produces the behaviour** |

**RULING 68/M7, verified end to end because the brief asked.** `postSignatureFor`
moved from a `useCallback` to a top-level export
(`useAnnouncementDraftSlots.ts:205-214`) and now hashes five elements. The
comparison site is `armPost` at `:432` (`slot.postArmedFor === signature`) and the
UI's own armed state is `isConfirmArmed(slot.postArmedFor, postSignatureFor(slot) ?? "")`
at `WalkthroughAnnouncementPanel.tsx:917`. The panel destructures
`postSignatureFor` out of the hook's return (`:486` / panel `:680`), so it gets the
NEW five-element function - there is no second copy. **Nothing keys off the old
four-element shape:** `grep -rn 'walkthrough-announcement"' src` finds the tag only
inside `postSignatureFor`, and the only other signature helper in play,
`content-tab/modules/confirmArming.ts`, is shape-agnostic. Result: changing the
time after arming makes the derived signature differ, `isConfirmArmed` returns
false, the row VISIBLY disarms (consequence paragraph gone, button back to idle),
and the next click re-arms. That is the intended behaviour and it is not the
silent double-click hazard I went looking for. Returning the time to its original
value re-arms without a click, which is `confirmArming.test.ts:48`'s documented
repo idiom, not a defect.

---

## 5. MINORS

1. **The `wta-post-consequence` anchor is not unique.**
   `grep -o -F 'wta-post-consequence' AnnouncementDraftSlot.tsx | wc -l` returns
   **2** (`:271` the paragraph's `id`, `:315` the Post block's `consequenceId`).
   `indexOf` happens to take the right one today because the paragraph precedes
   the button row. The remediation's comment at `:805-807` still names only
   `wta-regenerate-consequence` as the hazard, repeating the old claim, so a
   future reader will believe the anchor is unique. Low severity because a
   reordering would fail the test loudly rather than bind silently - but the
   repo's stated rule is exactly-once, and this is twice. Counts for the other
   anchors, same command: `<ConfirmArmButtons` 2 (the test deliberately takes the
   second), `idleLabel={isScheduled` 1, `label="Visible to students (optional)"` 1,
   `{slot.postedTo && (` 1, `const visibility = resolveScheduledVisibility(` 1.
2. **Two test titles cite ruling ids that mean something else.** The remediation
   labels its describes `RULING 66/M1`, `/M3`, `/M4`, `/M6`, `/M8`, which are the
   MUTATION ids from `docs/a32-build-check.md` section 3 - correct against that
   table. But RULING 66 itself says "M1 through M5", and in
   `docs/a32-build-rulings.md` **M6 is the extraction reversal (RULING 67) and M8
   is the docs re-pinning (RULING 68)**, both still open. So the tree now contains
   two passing tests titled `RULING 66/M6` and `RULING 66/M8` while ruling-M6 and
   ruling-M8 are undone. A grep for either id finds green. Correct form:
   `RULING 66 / round-1 mutation M6` and `... M8`.
3. **Round-1 MINOR 1 is now FROZEN INTO an instrument.** Round 1 found the clause
   "Canvas has no unpublished state before then" incoherent for a
   `delayed_post_at` announcement (`docs/a32-build-check.md:475-481`). It is
   unchanged at `AnnouncementDraftSlot.tsx:275`, and `:825` now asserts
   `/schedules this announcement to become visible/` - so fixing the sentence is
   still free, but any rewrite of the surrounding clause now has to touch a test.
   Worth knowing before someone treats the test as a spec.
4. **Round-1 MINOR 2 is still unstated, and this commit passed the natural place
   to state it.** There is no way to cancel a scheduled post between confirming
   and the chosen time; the new success sentence at `:350` was the obvious home
   for that fact and does not carry it.
5. **The new sentence is missing a preposition**: "Students will see it
   6/20/2026, 9:30:00 AM." Inherited verbatim from the sibling
   (`announcements-panel.tsx:281`), so it is precedent rather than invention -
   fix it in both or neither. Folded into MAJOR R2-4's recommended string.
6. **`postedScheduledLabel` is not cleared by `posting`.** `case "posting"` does
   not touch `postedTo` either, so a second post shows the previous post's
   success sentence while in flight - pre-existing family, now with a second
   field in it. The field IS correctly cleared by `case "result"`
   (`announcement-draft-slots.ts:505`) and correctly overwritten by the next
   `post-result`, and the doc comment at `:121-129` describes that accurately.
7. **No clean full type gate exists for this commit right now.**
   `npx tsc --noEmit --incremental false` exits 2 with 13 errors, all in a
   sibling's `src/lib/grade*` / provenance work, zero in A32's write set. Not an
   A32 defect; recorded so nobody later reads a red gate as A32's.

**What is sound, in one line each.** The line-count claims are accurate: both
counters agree, `@(Get-Content).Count` and `wc -l` each return **992** for
`walkthrough-announcement.structure.test.ts` and **991** for
`WalkthroughAnnouncementPanel.tsx`, so 8 and 9 lines of headroom against the 1000
ceiling as claimed, and `src/file-size-ceiling.structure.test.ts` passes. The
byte gates pass: `npm run test:paths -- src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts`
returns `Tests 21 passed (21)` - no emoji, no BOM, no stray control bytes in the
diff. The `SlotsAction` member count comment stays honest at 16 and the
exhaustive `Record` guard still compiles. `postSignatureFor`'s promotion out of
`useCallback` is correct (it closed over nothing) and its `[commitPost]`
dependency array was updated rather than left stale. `resolvePostCommit`'s
past-date case is a genuine discriminator and the `expect(raw.trim().length > 0).toBe(true)`
sanity line inside it is the right way to prove the input really is truthy.

**The feature-already-exists case.** Re-argued at its strongest and it still
fails, for round 1's reason: the library accepted `delayedPostAt` all along, the
walkthrough SURFACE had no date control, and this is a reachability fix already
treated as one. Nothing new. One correction to a possible worry I checked and
discarded: the sibling `announcements-panel.tsx:240-251` is NOT drifting - it sets
`delayedPostAt` and `scheduledLabel` inside one `if (when.getTime() > Date.now())`
on one clock read, at post time. **The sibling has no two-clock problem because it
has no arm-then-confirm and no render-time resolution.** The fork in B2 is created
by A32's own choice to resolve at render for the copy and the labels, not
inherited from the precedent it cites.

**The weakest requirement, this round.** RULING 64's "the instrument asserts BOTH
branches - not just that the scheduled wording exists." Implemented exactly as
written - both branches ARE asserted and the swap IS red - and it still produces
a bad result, because nothing in it constrains the PRODUCER of the fact the
branches read. It is the same shape as round 1's answer: a clause that constrains
the form of the assertion and says nothing about the object it must range over.

**The silent-green failure, named.** Build this, pass `npx eslint` (exit 0,
measured), pass tsc on every A32 file, pass all 210 A32 tests and every structure
test, and still ship either of: every scheduled post publishing immediately and
irrevocably under copy that promised a schedule; or the fifth false sentence
rendering on every scheduled post in an aria-live region. Both are one-token
edits in `useAnnouncementDraftSlots.ts`, which no test in this repo reads.

**Multi-path hazard: none in the artifact.** No gate, instrument or command in
this diff or in `docs/a32-build-rulings.md` runs vitest at all, so there is no
raw multi-path `vitest run` to drop arguments. Every multi-path run in this
document used `npm run test:paths --` and I read `COVERED` lines for each
argument.

---

## 6. B2 IMPACT - not a ruling, but the fork's shape has changed

I do not rule on B2. Two effects of THIS commit that materially affect the
question already in front of the owner:

1. **Option (a) got more expensive; nothing is foreclosed.** Option (a) is
   "schedule using the value resolved at ARM time". This commit freezes the
   success label at the **commit** clock (`resolvePostCommit(slot.scheduledAt, Date.now())`
   inside `commitPost`, `:397`), and the commit message states the freeze as a
   guarantee: "FROZEN AT COMMIT TIME rather than re-resolved at render, so it
   cannot drift under a later clock read." That is true against the RENDER clock
   and it silently picks the commit clock as the authority - which is the clock
   (a) rejects. Applying (a) would now mean re-siting the label's provenance as
   well as the post decision, so (a) is no longer transcription. Nothing stores
   the arm-time resolution today: `case "arm-post"`
   (`announcement-draft-slots.ts:513-517`) stores only the signature, so (a) still
   needs a new field either way. (b) and (c) are unaffected.
2. **`scheduledAt` entering the signature does NOT implement any part of (b).**
   `postSignatureFor` hashes no clock reading, so the signature is stable across
   the render-to-confirm gap. It closes "the instructor changed the FIELD after
   arming"; B2 is "the CLOCK moved while the field stood still". Worth stating
   plainly because the two are easy to conflate, and the commit message's
   "changing the time after arming re-arms" is a true claim about a different
   hazard.
3. **A genuinely new, and arguably useful, consequence.** There are now TWO
   clock-derived user-facing strings for one act: the consequence paragraph's
   `visibility.label` from the RENDER clock (`AnnouncementDraftSlot.tsx:114`) and
   the success sentence's `postedScheduledLabel` from the COMMIT clock (`:397`).
   Inside B2's window they disagree, and the disagreement is now VISIBLE
   after the fact: the paragraph promises "at <T>", the commit resolves
   `immediate`, the label is null, and the success sentence reads "Posted to CS
   101. Students can see it now." So an instructor who is caught by B2 is at least
   told afterwards, where before this commit they were told the opposite. That
   changes what option (b) buys - it now buys prevention rather than the only
   notification.

---

## 7. M8 - citations the 327f3e3 diff has invalidated

> **Orchestrator note, 2026-09-27.** This table is a DATED RECORD of one bounded
> computation - `327f3e3^` to `327f3e3` only - and it is left as written rather than
> updated. Do not use it as a live pointer. Two commits landed after it (`2fef046`,
> then `3da8210`, which SPLIT the structure test and moved 320 lines into
> `walkthrough-announcement-timing.structure.test.ts`), so some right-hand numbers
> here now name neither the right line nor the right FILE. Worse, the re-pinning pass
> that consumed this table found several of its baseline numbers were already stale
> BEFORE `327f3e3`, from earlier feature work - so arithmetic applied to them produced
> new numbers that still pointed at the wrong function. The live citations were
> corrected by CONTENT in the target docs instead. Editing this table to reflect drift
> its own method could not see would misrepresent what this round computed.

Method: for each of the six changed files I mapped parent line -> current line
with `difflib.SequenceMatcher` over `git show 327f3e3^:<file>` and
`git show 327f3e3:<file>`, then scanned every `docs/**/*.md` for
`<basename>:<n>` and `<basename>:<n>-<m>` citations and reported those whose
mapped position moved. Script:
`<scratchpad>/shift.py`. File sizes, parent -> current (that script's own
`len(split("\n"))`, which is `wc -l` + 1 for these files):
`AnnouncementDraftSlot.tsx` 361->368, `announcement-draft-slots.ts` 530->552,
`useAnnouncementDraftSlots.ts` 443->492,
`walkthrough-announcement.structure.test.ts` 879->992,
`announcement-draft-slots.test.ts` 776->798,
`useAnnouncementDraftSlots.test.ts` 93->168.

**51 citations moved.** A citation already stale before this commit is still
listed, because the mapping says where the parent's line N now lives, not what
the doc meant; treat the right-hand column as the mechanical shift and re-read
the five marked DELETED/MOVED by hand.

```
docs/a17-discovery.md:73    useAnnouncementDraftSlots.ts:320        -> 370
docs/a17-discovery.md:74    useAnnouncementDraftSlots.ts:321        -> 371
docs/a17-discovery.md:75    useAnnouncementDraftSlots.ts:298-318    -> 348-368
docs/a17-discovery.md:77    useAnnouncementDraftSlots.ts:225        -> 275
docs/a17-discovery.md:81    useAnnouncementDraftSlots.ts:210-223    -> 260-273
docs/a17-discovery.md:167   useAnnouncementDraftSlots.ts:188-193    -> 238-243
docs/a17-discovery.md:293   useAnnouncementDraftSlots.ts:166        -> 216
docs/a17-discovery.md:421   announcement-draft-slots.ts:411         -> 426
docs/a19-scope.md:152       useAnnouncementDraftSlots.ts:287        -> 337
docs/a19-scope.md:243       announcement-draft-slots.test.ts:668-684-> 690-706
docs/a19-scope.md:426       useAnnouncementDraftSlots.ts:161        -> 211
docs/a19-scope.md:643       useAnnouncementDraftSlots.ts:287        -> 337
docs/a19-scope.md:662       useAnnouncementDraftSlots.ts:224-228    -> 274-278
docs/a19-scope.md:668       announcement-draft-slots.ts:340         -> 350
docs/a19-scope.md:675       announcement-draft-slots.test.ts:668-684-> 690-706
docs/a19-scope.md:686       announcement-draft-slots.ts:216-245     -> 226-255
docs/a19-scope.md:794       announcement-draft-slots.test.ts:668-684-> 690-706
docs/a19-scope.md:809       announcement-draft-slots.ts:316-333     -> 326-343
docs/a19-scope.md:810       useAnnouncementDraftSlots.ts:224-228    -> 274-278
docs/a19-scope.md:822       useAnnouncementDraftSlots.ts:284-288    -> 334-338
docs/a19-ux-pass.md:359     announcement-draft-slots.ts:229-233     -> 239-243
docs/a21-instrument-notes.md:401 announcement-draft-slots.ts:313-334-> 323-344
docs/a21-instrument-notes.md:461 announcement-draft-slots.ts:229-233-> 239-243
docs/a21-scope.md:201       announcement-draft-slots.ts:313-334     -> 323-344
docs/a21-scope.md:375       useAnnouncementDraftSlots.ts:131-165    -> 181-215
docs/a21-scope.md:431       announcement-draft-slots.ts:236-265     -> 246-275
docs/a21-scope.md:706       useAnnouncementDraftSlots.ts:152-155    -> 202-205
docs/a24-a32-check.md:613   useAnnouncementDraftSlots.ts:178        -> 228
docs/a24-a32-waves.md:653   announcement-draft-slots.ts:364         -> 375
docs/a24-a32-waves.md:654   announcement-draft-slots.ts:408         -> 423
docs/a24-a32-waves.md:655   useAnnouncementDraftSlots.ts:238        -> 288
docs/a24-a32-waves.md:660   useAnnouncementDraftSlots.ts:401        -> 450
docs/a24-a32-waves.md:681   useAnnouncementDraftSlots.ts:332        -> 171  (postSignatureFor, promoted out of useCallback)
docs/a32-build-check.md:60  AnnouncementDraftSlot.tsx:342-346       -> 342-353 (the whole branching block; ternary at 349-351)
docs/a32-build-check.md:71  announcement-draft-slots.ts:517         -> 536    (postedTo write, inside the 535-541 return)
docs/a32-build-check.md:110 useAnnouncementDraftSlots.ts:349        -> 397    (now resolvePostCommit, not resolveScheduledVisibility)
docs/a32-build-check.md:160 useAnnouncementDraftSlots.ts:341-348    -> 386-396 (comment rewritten in place)
docs/a32-build-check.md:183 walkthrough-announcement.structure.test.ts:785 -> 798
docs/a32-build-check.md:196 useAnnouncementDraftSlots.ts:349-356    -> 397-402
docs/a32-build-check.md:263 walkthrough-announcement.structure.test.ts:803-811 -> 816-821 (assertion replaced)
docs/a32-build-check.md:379 useAnnouncementDraftSlots.ts:332-335    -> 171-180
docs/a32-build-check.md:389 announcement-draft-slots.ts:435         -> 450
docs/a32-build-rulings.md:9 useAnnouncementDraftSlots.ts:349        -> 397
docs/a32-scope.md:43        useAnnouncementDraftSlots.ts:238        -> 288
docs/a32-scope.md:43        announcement-draft-slots.ts:364         -> 375
docs/a32-scope.md:151       useAnnouncementDraftSlots.ts:148-151    -> 198-201
docs/a32-scope.md:219       announcement-draft-slots.ts:364         -> 375
docs/a32-scope.md:220       useAnnouncementDraftSlots.ts:238        -> 288
docs/BACKLOG.md:121         announcement-draft-slots.ts:216-225     -> 226-235
docs/owner-decisions-2026-09-23.md:149 useAnnouncementDraftSlots.ts:238 -> 288
docs/owner-decisions-2026-09-23.md:150 announcement-draft-slots.ts:364  -> 375
```

Two `docs/` citations that are wrong for a reason a line shift cannot fix, and
that a re-pin pass should catch:

- `AnnouncementDraftSlot.tsx:344-352`'s own comment cites
  `announcements-panel.tsx:280-283` as the thing it mirrors. The range is right
  and the claim is not - see MAJOR R2-4.
- Round 1's MAJOR 8 table (`docs/a32-build-check.md:420-430`) gives post-1878a48
  positions for seven anchors. Six are unchanged by 327f3e3 (all below `:341`);
  the seventh, "the consequence paragraph `:269-282`", is unchanged, but the
  success paragraph it did NOT list is the block that moved.

---

## 8. SHIPPABLE AS IT STANDS versus not

**Shippable, as production behaviour: all of it.** I looked for a part to
withhold and there is none. Every line of this diff is at least as good as what
it replaced: the success sentence branches where it did not, `scheduledAt` is in
the confirm signature and the wiring genuinely disarms, `resolvePostCommit` is a
correct pure function with a real discriminating case, and five instruments that
could not fail now can. Option (iii) - a named part that must not ship - does
not apply.

**Not shippable: the CLAIM that RULINGS 64, 65 and 66 are closed.** Specifically:

- **RULING 65 is not closed.** Its own measurement - no test reads
  `useAnnouncementDraftSlots.ts` as source - is still true, verified with a
  canary. The executing assertion it ordered exists on a helper, not on the
  decision. BLOCKER R2-1.
- **RULING 66 is closed for 2 of its 5 holes** (the five labels, the datetime
  control) and REPEATS for 3 (the consequence paragraph's condition definition
  and its unbound sentences, the "Timing" substring). BLOCKER R2-2, MAJOR R2-1,
  MAJOR R2-3.
- **RULING 64 is closed at the render site and open at the producer.** BLOCKER
  R2-1 second mutation, MAJOR R2-2, MAJOR R2-4.
- RULING 68/M7 **is** closed, verified end to end.
- RULING 67/M6 and RULING 68/M8 are the orchestrator's and are untouched by
  this commit, as expected. Section 7 discharges the measurement half of M8.

The whole remaining gap is roughly 40 lines of instrument in two files plus one
sentence of copy, and nothing in it needs a design decision. An implementer can
do all of BLOCKER R2-1, BLOCKER R2-2, MAJOR R2-1, R2-2, R2-3, R2-4 and the
restored assertion from R2-5 from this report alone, with the exact regexes and
the exact slice bounds given above.

---

## 9. What must go to the owner

**B2 is already with you and I did not touch it.** Section 6 is the only thing I
add to it, and it is information, not a new question.

One thing this round raises that no further round can settle, because it is a
policy call about the loop rather than about A32:

> Round 1 found five instruments that read as coverage and admitted a defect.
> Round 2 closed all five named mutations and left four of the five admitting the
> NEXT mutation in the same family - and left the two expressions that actually
> decide the behaviour with no instrument at all, because the fix was an isolated
> unit test rather than a test of the call site. Under the two-round cap this
> activity is over. **Do you want (a) the seven fixes in section 8 applied as a
> mechanical implementer pass from this report's exact regexes and slice bounds,
> with no further check round - the transcription path; or (b) A32 shipping as it
> stands, with BLOCKER R2-1 and R2-2 recorded as residuals owned by the next
> chunk that touches `src/app/components/walkthrough-announcement/`, instrument
> named (`npm run test:paths` over the three A32 test paths after the pins are
> added)?**
>
> Either answer ends the activity. (a) costs one implementer wave on files no
> sibling holds and closes RULINGS 64/65/66 for real. (b) ships today and carries
> the risk that the next edit to `commitPost` silently restores a false sentence
> or an immediate publish, with every gate green - the failure mode round 1 named
> and round 2 did not close. **I recommend (a)**, because the cost of being wrong
> about (b) is an irrevocable post to every student under copy that promised a
> schedule, and because the fix needs no judgement: the mutations, the regexes
> and the line numbers are all in this document.

## 10. Stopping point

**Rulings, and measurement - not design.** Design is settled except for B2,
which is yours and was correctly left alone. Nothing here turns on another round
of argument: every finding is demonstrated by a replica run or a canaried grep,
and every one has a named fix. What remains is (1) your answer to section 9, and
(2) the residual that the eleven mutations in section 3 be re-run against the
real tree with a `cp` backup once no sibling is live - the same residual round 1
filed, still open, and the only thing in this check that a quiet tree would
strengthen.
