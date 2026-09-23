# Seat briefs

A **seat** is a role, not an agent instance. Each seat produces one named
artifact. Every artifact is then read by a **fresh** checker that did not author
it. This card says what each seat produces and what its checker must ask.

Two rules govern every seat:

- **Brief from the tree, not from the doc.** A design document records
  decisions, not what exists. Grep before asserting "X already exists" in a
  brief - that error has shipped twice here, and both times the receiving agent
  built against something imaginary.
- **Gate on the artifact, not the report.** Twice a seat did the work, wrote
  "the only remaining action is writing the file", and stopped without writing
  it. Check the file exists and has content before reading the report.

Seat and checker tiers are set in `.claude/agents/`, never per call - see the
core card.

---

## Triage: which seats run, and in which wave

Per chunk, record the **trigger that fired** for each seat that runs and each
that does not. When unsure, the seat runs. The verifier later rules on every
triaged-out seat's trigger against the built diff, so a wrong triage is caught
rather than silently accepted.

**Documentation-only chunks.** A chunk in which every changed path is under
`docs/` changes no behaviour a user experiences, so Acceptance criteria and
Test seat triage OUT; record that as the fired trigger. This is their only
exemption. Any change outside `docs/` - including `supabase/migrations/` and
`.github/workflows/` - is a runtime change and both seats run. Note it is NOT
true that no test can catch a failure in such a chunk: `src/lib/no-emojis.
test.ts:243` scans `docs/` (`roots = ["src", "docs"]`, extensions including
`.md` at `:226`) and `src/tools/backlog/check-generated.ts:49-50` reads
`docs/backlog.yml` and `docs/BACKLOG.md` - a documentation-only chunk is still
gated by both.

**Seats run in dependency waves, not all at once** - `wave-dispatch.md` has the
rule, the measured cost, and the duplication it prevents. The wave column below
is the default assignment; re-sort with that card's input test if a chunk's
dependencies differ. Regenerate each wave's briefs after the previous wave
lands, or the sequencing is pure wall-clock for no benefit.

| Seat | Wave | Trigger |
|---|---|---|
| Acceptance criteria | - | Always. Never triaged out. |
| Architect + reuse | 1 | Any new module, any new directory, or any change touching more than two existing files. Effectively always. |
| User experience | 3 | Any change a user can see, click, or hear read aloud. |
| Data / storage | 1 | Anything persisted: a `ta-` localStorage key, a Supabase table, a migration, a file in Storage, or a change to what a persisted shape contains. |
| Visual / aesthetic | 3 | Any new surface, or any change to an existing surface's layout, spacing, or colour. |
| Operability and admin | 2 | Anything an owner must configure, audit, revoke, or delete. |
| Security | 2 | Any new server action, any new network egress, any user- or model-authored text that reaches a prompt or the DOM, any credential path. |
| Reliability | 2 | Anything with a failure mode that is not a thrown error: a stream, a long call, a retry, a background job, a resource that must be released. |
| Accessibility | 3 | Any change to markup, focus, or keyboard behaviour. Note the ceiling: **no component is rendered by any test here**, so this seat's findings are reading claims, and it must say so. |
| External-facts research | 1 | The plan rests on anything outside this repo: a library's behaviour, a platform limit, an API's contract, a browser quirk. |
| Baseline | 1 | The area being changed has no coverage in `docs/REGRESSION.md`. Runs BEFORE hand-off, not after. |
| Test seat | - | Always. Never triaged out. Constructs the oracle the implementer's tests are written from. Runs AFTER Build and Verify, not with the design waves. |

---

## Acceptance criteria

**Produces:** criteria written from the owner's words, each meeting
`iteration-caps.md`'s "Entry gates" section, gates 2 and 3, and its Residual
definition (`:36-37`) - this card does not restate what those already define,
only that a criteria round must satisfy them.

A criteria document for feature work opens with the LEVERAGE CLAIM -
`DEV_LOOP.md`, "The loop / Criteria" - capped at ONE paragraph plus ONE
acceptance criterion, which is the removal test the test seat owns. Classes
and the worked negative example are in `docs/loop/leverage.md`. On a bug fix,
a refactor, a doc correction or an owner verification there is no claim to
make; record that as the fired trigger and move on.

**Must not produce:** mechanism, global-invariant accounting, or oracle
construction - `DEV_LOOP.md`'s "The loop / Criteria" paragraph already rules
whose seat each belongs to; this card does not repeat it. A criteria document
that reads as a reuse survey or an architecture pass is scope creep, not
thoroughness, and it duplicates work a concurrently running seat is already
doing - `traps-spec.md:40-41` records one chunk's criteria going from 748
lines to 268 and getting better once mechanism moved to the architect and
oracle construction moved to the test seat.

**Tier note.** This seat is `loop-ac`, on Opus, elevated by the repo owner on
2026-09-20 together with `loop-plan`. Criteria are where the owner's words
become the thing every later seat is measured against: a criterion that is
vague, unsatisfiable or bound to the wrong object is inherited by the
architect, the test seat and the implementer before any checker sees the
consequence. (The three test-seat practices recorded on 2026-09-20 briefly
appeared here by an editing error and now sit under the Test seat brief below, where
they belong - they are about reference implementations and mutants, not
criteria.)

**Its checker must ask:**
- Does a rule inherited from an upstream design carry every clause it had
  there, or only the one with an existing instrument? A two-clause rule
  ("states the set it covers AND never implies completeness") shipped with
  only its negative half enforced - the affirmative half had no criterion at
  all, so a claim that passed every stated check still asserted completeness
  about a class from a slice of its submissions.
- Does an instrument exist in this repo that can compute the pass condition,
  or only assert it? A style property of arbitrary model prose ("register",
  "no hedging") has none here - no component renders, and `vitest.setup.ts`
  throws on real fetch. Where none exists, a weaker check standing in for the
  criterion is the defect - and `iteration-caps.md:13-16` records all three
  moves that have ever ended a chain here, none of which is strengthening the
  same mechanism: RELOCATE the claim to the party that can measure it,
  ESCALATE a scope question to the owner, or replace the assertion with a
  CONSTRUCTION that makes the bad state unrepresentable - a discriminated type
  the model cannot widen (`class-trends-insight.ts:171-185`), or a whole
  string asserted against a computed expectation. Ask which of the three
  applies, not whether the prose check can be tightened.
- Is a structural boundary ("must never reach X") expressed as an enumerated
  denylist, or does it name the actual walled set - a directory, a module
  boundary, a transitive-import test - that stays closed when a new export
  appears? A denylist of Canvas-posting actions was lengthened 1 -> 3 -> 6 ->
  9 across rounds, and the real set was still materially larger and unbounded
  by construction: a barrel re-export and a writers object injected as a
  parameter - reachable with no value import at all - defeated every
  name-based version.
- Does every numeric floor or cap get checked against every other numeric
  floor or cap that bounds the same quantity elsewhere in the tree? This card
  used to answer with a worked example: a privacy floor of 5 set against a
  grading cap it said also defaulted to 5, so the analysed set would hold
  exactly five for every class of five or more and the floor's guarantee would
  be satisfied only at its own boundary, forever. MEASURED 2026-09-23, THE CAP
  IS 40 (`DEFAULT_MAX_SUBMISSIONS`, `gemini.ts:32`, applied at
  `grade/engine.ts:126`), NOT 5 - so the coincidence the example rested on
  never existed, and the example was wrong for the whole time it was cited.
  THE QUESTION SURVIVES ITS EXAMPLE, and is now better evidenced by how the
  example failed: a card asserting a collision between two numbers, neither
  re-measured, is exactly the shape it warns about. Re-measure both sides
  before claiming any two knobs collide, and name the command.
- Is anything here properly the architect's, the reuse survey's, or the test
  seat's - especially when one of those is running in the same wave? Two
  concurrently authored documents over the same ground reaching different
  counts for what should be the same set is the visible symptom of this
  failure, not its cause.
- Does the leverage claim name a class from `docs/loop/leverage.md` and say
  what the user does instead today and what that costs - or is it a benefit
  ("it saves time", "it is integrated") that describes nearly everything? Is
  the class EARNED by this feature or INHERITED from the platform: if the
  comparable modules all get it from a shared import, it describes the app,
  not this feature. And is there exactly one acceptance criterion that goes
  RED when the advantage is removed, rather than one a chat merely could not
  satisfy? A criterion about a database row passes the second test trivially
  and proves nothing.

---

## Architect + reuse survey

**Produces:** a vetted reuse list (symbol, `file:line`, one line on what it
gives us); an explicit do-not-reuse list with justification per entry; the file
layout with per-file line estimates; the exact type signatures at every seam;
and a dependency-ordered wave plan of disjoint write sets.

**Non-negotiable in this repo:** every wave's file list must include the file
that **calls** each new export. A wave that adds an export without its caller
ships dead code with every gate green. The one legal exception is a type-only
module, which emits no runtime code - and the brief must say so explicitly, or
the wave gate reads it as an escape.

**Its checker must ask:**
- Does every `file:line` in the reuse list resolve, and does the symbol at that
  line do what the list claims? Check at least half by opening them.
- Is anything on the reuse list wrong to reuse - a stream-shaped primitive
  pulled into an operator-timed feature, a type carrying fields that mean
  nothing here?
- Does every wave contain the caller of everything it exports? Name the wave
  that does not.
- Do the write sets actually intersect by exact path? Do not trust the
  disjointness claim; list the paths and compare.
- Which files does this push past 1000 lines? Measure with
  `@(Get-Content <file>).Count`, not from the estimates in the plan.
- What in the plan is **not trivially revertible** - a migration, a change to a
  shared function, a changed persisted-key shape?

---

## User experience

**Produces:** the flow click by click with a **counted** total; the panel layout
in DOM order; the control types and their keyboard story; exact user-facing copy
for empty, loading, partial and error states; and the three places the design
would mislead the user.

**Count the clicks twice** - first use and repeat use. The repeat number is the
one that decides whether a feature is used more than once. A measured example
from this repo: a grading flow was 15 clicks for the first student and 8 for the
second with context reuse, versus 13 for the second without it - which is what
made the context-reuse requirement load-bearing rather than a nicety.

**Its checker must ask:**
- Is the click count real, or asserted? Re-walk it against the proposed layout.
- Does any new key binding collide with an existing handler? There is a
  `window`-level handler in `useRecorder.ts` bound to `r`/`p`/`m`, gated on a
  view check. Grep every `keydown` and every `onKeyDown`.
- Is every keyboard handler routed through MUI `slotProps.input`? In
  `htmlInput` it silently never fires. ARIA is the reverse.
- Does any state claim to be persisted without naming its `ta-` key?
- Is the copy free of emojis, and does it read as this app's voice?
- Which of the three "misleading" findings is actually the worst, and is the
  proposed fix load-bearing or decorative?

---

## Data / storage

**Produces:** what persists, what must not, and where - evaluated against the
real options in this repo, with sizes quantified for a realistic session, not
asserted. Migration DDL in house style if one is warranted. The typed-row
mapper. Retention and cleanup, including what happens to an abandoned session.

**Its checker must ask:**
- Is the size claim measured or guessed? A localStorage decision that turns on
  "images are large" needs the actual byte figure for a realistic case.
- Does the write path enumerate fields explicitly, or spread an object? A spread
  lets a future field leak into storage silently.
- If a migration exists: does it use a stored generated column rather than
  partial indexes for any nullable uniqueness key? PostgREST upsert cannot infer
  a partial index (42P10). Are RLS policies present, and idempotent?
- Does every read go through an explicitly typed mapper? A bare typed select
  collapses to `never` here.
- What deletes this data, and when? "Nothing" is an answer, but it must be
  stated.

---

## Visual / aesthetic

**Produces:** the surface's layout, spacing and colour decisions measured
against this repo's existing visual language - which existing class or inline
pattern is reused versus reinvented, every size named as a token or an
explicit px/rem value instead of "looks right," and colour usage justified
per-theme against a real nearby instance rather than asserted to "match."
Includes how the surface behaves against its actual container constraints, not
an assumed one - check the real anchor (a resizable chat window, a fixed panel,
a full viewport) rather than assuming any single shape is typical; measured,
this repo's largest stylesheet has only 7 `resize:` declarations in 7010 lines
(`@(Get-Content src/app/page.module.css).Count`; `resize: both` at `:4053` and
`:5030`), so a resizable container is the exception here, not the default.

**Must not produce:** user-facing copy or click-path counts - that is User
experience's job - or focus order, keyboard reachability, and ARIA naming -
that is Accessibility's job. Wave 3 runs these three seats together precisely
so a layout decision here and a keyboard story there do not silently diverge;
restating either here is scope creep, not thoroughness.

**Its checker must ask:**
- Does any dimension resolve as a percentage against a container the surface
  does not control? The chat window's institution typeahead is the measured
  incident: a percentage max-height would have resolved against the anchor's
  own ~55px, not the window, producing a one-row sliver - so the popup pins a
  fixed `max-height: 160px` (`.institutionTypeaheadPopup`,
  `src/app/page.module.css:4490,4496`) and the anchor is marked
  `flex-shrink: 0` (`.institutionTypeaheadAnchor`, `:4481,4483`) so a wrapping
  row cannot collapse it - the rule is stated in full in the CSS comment at
  `:4486-4489`. (`docs/REGRESSION.md:39566-39570`, entry 397.) Any new
  percentage-based sizing needs the same check against its real anchor, not an
  assumed one.
- Does the layout reuse the house pattern, or reinvent an inline style this
  repo already has a name for? `.adaptRow` and `.ghActions` are the house
  pattern for control-row layout, referenced 66 and 100 times respectively
  across `src/app/**/*.tsx,*.css` (`Get-ChildItem -Recurse -Include *.tsx,*.css
  src/app | Select-String -Pattern adaptRow` / `-Pattern ghActions`, matches
  summed). Inline `display:flex` on the recording sub-tab surfaces is now only
  15 occurrences across five files - `TeleprompterPanel.tsx` 8, `StagePanel.
  tsx` 4, `WalkthroughPanel.tsx` 1, `AddKnowledgePages.tsx` 1, `caption-studio/
  CaptionStudio.tsx` 1 (per file: grep for a quoted `flex` value after
  `display:` and count the matching lines) - and `RecordingTab.tsx:592`'s
  tab-literal array now holds TWELVE
  `[key, label]` pairs, not nine. `docs/REGRESSION.md:863-865`'s "roughly forty
  sites across the nine views" is the PRE-pass baseline, dated by its own
  heading at `docs/REGRESSION.md:795` ("... before the controls UX pass") - a
  pass that has since shipped. Never restate a baseline figure in the present
  tense without re-measuring it against the current tree.
- Is every colour and spacing value in the brief named as a token or a
  measured pixel value, or asserted as "matches the existing style" without
  saying which existing instance it was compared against? Field widths alone
  are ten unreconciled magic numbers - `sx={{ minWidth: N }}` / `style={{
  width: N }}` at 80/100/120/170/180/200/220/240/260/320px, never rationalised
  into a shared scale (`docs/REGRESSION.md:866-867`). A brief that adds an
  eleventh arbitrary width without checking that list repeats the drift rather
  than fixing it.
- Does colour usage account for a token that CHANGES value between themes, not
  just whether a hex looks acceptable in the one theme someone happened to
  view? `--danger` was DOCUMENTED as theme-invariant in its own token comment,
  which agents read and complied with - and it is not: it is redefined from
  `#dc2626` in light (`src/app/globals.css:60`) to `#f87171` inside the
  `html[data-theme="dark"]` block opened at `:283` (`src/app/globals.css:301`).
  A comment at `:210-217` records that this silently took two
  `white-on---danger` rules from 4.83:1 to 2.77:1 in dark theme, on the
  smallest text in the app, and that it passed `tsc`, `eslint`, 16318 tests
  and `next build`
  (`docs/REGRESSION.md:37602-37614`, "The four defects nothing could see").
  Related, same repo: a list of tokens with no definition at all rendered only
  via a hex fallback that never adapted to dark mode
  (`docs/REGRESSION.md:37643-37647`; the list itself names thirteen tokens,
  though the section heading at `:37641` says "seven of them" - a discrepancy
  in that document, not resolved here); a decorative indicator measured at
  1.14:1 light / 1.90:1 dark against a 3:1 requirement
  (`docs/REGRESSION.md:19761-19765`); and `html[data-theme="dark"]` is the
  app's ONLY route to the dark theme - there is no `prefers-color-scheme`
  block - so a dark override written any other way silently never applies
  (`docs/REGRESSION.md:23255-23259`). No test in this repo renders a component
  or computes contrast, so this is verified by opening BOTH theme definitions
  of every token the brief touches and stating the resulting ratio in each,
  not by reading the light one and assuming the dark one matches. Two theme
  definitions is the FLOOR, not the whole procedure - print, forced-colors and
  a UA `color-scheme` default are further resolution contexts, and a brief that
  touches one of them owes it the same treatment.

---

## Operability and admin

**Produces:** the owner's create/read/update/delete surface and where it lives;
which values are configuration and where this repo puts configuration of that
kind; who can see the data and what happens when access is revoked; and what an
audit trail would need.

**Its checker must ask:**
- Does the proposed gate actually gate? `requireOwner()` in this repo is a
  deprecated alias that delegates to `requireUser()` - any active account.
  `requireAppOwner()` is the real owner gate. `isOwnerEmail` alone is never
  ownership; `resolveAccess` also requires `emailVerified`.
- Is a new settings surface being invented where an env var is the established
  pattern, or vice versa? Cite the precedent.
- Is there an admin obligation the artifact created and did not acknowledge -
  most often, that no durable audit is possible under a no-persistence ceiling?

---

## Security

**Produces:** the real egress path traced through the code, not the doc; the
threat model for the data actually flowing; prompt-injection exposure and the
mitigation; server-action hardening; input validation on the wire; and XSS on
any rendered model output. Ranked findings, each with the concrete attack and
the specific fix.

**Its checker must ask:**
- Is every claim traced to code, or inherited from the artifact under review?
- For prompt injection: was every prompt builder on the path actually opened?
  Name them. A "the prompt is framed" claim is worthless without the line.
- Does the proposed server action satisfy the guard ratchet's **shape** as well
  as its content? An arrow-function export in a `"use server"` file is a live
  endpoint the ratchet's `/^export async function/` regex never sees.
- Is the wire check counting the right unit? Every cap that was wrong here was
  wrong by comparing file bytes to a wire limit.
- Which renderer does model output reach, and is it the hardened one?

---

## Reliability

**Produces:** a failure-mode inventory with detection and behaviour for each;
the timeout analysis against the platform cap; the observability row shape,
reusing the existing log convention; the rollback and its blast radius; and the
resource-leak checklist.

**Its checker must ask:**
- Is the timeout claim arithmetic or hand-waving? Name the payload and the cap.
- Does the teardown list say what must NOT be torn down as clearly as what must?
  A teardown that clears state the user still needs is the common defect.
- Does the log carry personal data it should not?
- Is the "smallest safe revert" actually small, or does it touch a shared file?

---

## Accessibility

**Produces:** focus order in DOM order; keyboard reachability of every control;
live-region strategy; and how any non-text control is named.

**Its checker must ask:**
- Does every claim say it is a reading claim? No component is rendered by any
  test here.
- Is a container that needs an accessible name given a role that can take one?
- Are live regions mounted unconditionally? A region that mounts at the same
  moment its first message arrives frequently does not announce it.
- Does a list of N items become N tab stops? Roving tabindex or justify why not.

---

## External-facts research

**Produces:** the fact, the source, and the date it was checked. In this repo
that includes library behaviour read out of `node_modules`, since the Next.js
version here differs from training data.

**Its checker must ask:** was the fact read from the installed version, or
recalled? Open the file.

---

## Baseline

**Produces:** an entry in `docs/REGRESSION.md` describing the target area's
CURRENT behaviour, written before any code is handed off. Skip only if the doc
already covers that area - and check with `grep -a`, which is the default for
that file (`this-repo.md` explains why the NUL-byte justification this card
used to give is no longer true). Check for PARTIAL coverage too: the A9
baseline found an existing entry pinning the same behaviours at addresses that
had since moved, and wrote a disposition table mapping each old claim to its
current address rather than superseding it.

**Its checker must ask:** does the baseline describe what the code does, or what
the code is supposed to do? Only the first is a baseline.

---

## Test seat

**Produces:** the oracle - a generator, the axes, and the expected-value table -
plus the notes the implementer writes tests from.

**The axes must come from a different source than the generator.** An oracle
whose generator and expected-value table share the same hardcoded axes has a
branch that can never fire, and it will pass forever.

When the criteria document carries a leverage claim, the oracle includes its
REMOVAL TEST: one assertion that goes red when the claimed advantage is
REMOVED from the feature. Not one a chat could not satisfy - that is
unfalsifiable. Where no removal test is buildable here - anything whose
advantage is clicks, latency or attention, since no component is rendered by
any test in this repo - say so and record a residual with an owner and a step.

### Three practices the elevated seat established, 2026-09-20

Recorded by the repo owner after the first Opus-tier run of this seat did three
things earlier seats had not. These are now OBLIGATIONS, not anecdotes. Each one
answers a failure mode this repo has actually shipped.

**1. PROVE THE RED TESTS ARE SATISFIABLE. Build a reference implementation in an
isolated tree and get it green there.** A set of failing tests is not a
specification until something has passed it. Without this, a seat can hand over
a contradictory or impossible spec and the contradiction surfaces only when an
implementer is halfway through - or, worse, is resolved by quietly dropping the
assertion that made it hard. The measured instance: 46 red tests, proven
satisfiable by a throwaway reference implementation scoring 167/167 green in an
isolated tree. If a criterion cannot be satisfied by ANY implementation you can
write, it is not a criterion; fix it before hand-off and say what you changed.

**2. A MUTANT THAT SURVIVES MAY BE A BAD INSTRUMENT, NOT A KILL YOU ARE OWED -
REBUILD IT AND SAY SO.** The tempting move is to count a surviving mutant as a
coverage gap and add an assertion until it dies. Sometimes the mutant itself is
wrong: it mutates the wrong object, or produces a state the type system already
forbids, or is red in both directions. In the measured instance TWO mutants were
rebuilt rather than banked as kills. Report rebuilt mutants explicitly - a kill
count inflated by bad mutants is exactly the "instrument that does not measure
what it claims" class this seat exists to prevent, wearing a number.

**3. WHEN A GATE BLOCKS A DIRECT IMPORT, DRIVE THE PRODUCTION PATH INSTEAD OF
WORKING AROUND THE GATE.** In the measured instance a direct import would have
broken the export sweep; the seat switched to driving `resolveDocumentBlob` -
the real path production uses - and the test became MORE faithful, not less.
This is the general rule: a structural gate that blocks your test is usually
telling you the test was reaching past the seam. The forbidden moves are
loosening the gate, adding an exception, or importing the internal anyway. Ask
what the user's own path is and drive that. If you genuinely cannot, say so and
name the gate rather than filing the exception.

**Its checker must ask:**
- Can each assertion fail? Name the mutation that breaks it.
- Is coverage a property of construction - a constructor, a type, an enumerated
  product - or a hand-written list that happens to be short?
- Does any assertion read a hardcoded value that the implementation also reads?
- Does any test import a helper from another `*.test.ts`? That re-runs the other
  file's describe blocks. Duplicate instead.
- Does the removal test fail on REMOVAL, or only on breakage? Name the edit
  that removes the advantage and the assertion that goes red. The worked case
  is a miss: layer C's advantage is that it makes no model call
  (`docs/REGRESSION.md` entry 423), and
  `classTrendsDraft.not-postable.test.ts:50` bans `app/actions`, `lib/canvas`
  and `lib/lms-generation` - not `lib/llm` - so that advantage shipped with no
  removal test at all.
- Was a reference implementation built and run green, proving the red tests are
  satisfiable at all? If not, why not?
- Were any mutants REBUILT rather than banked as kills, and is that stated? A
  kill count is only as good as the mutants behind it.
- Did any test import an internal that a structural gate forbids, or add an
  exception to a gate? Drive the production path instead.
