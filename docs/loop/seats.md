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

## Triage: which seats run

Per chunk, record the **trigger that fired** for each seat that runs and each
that does not. When unsure, the seat runs. The verifier later rules on every
triaged-out seat's trigger against the built diff, so a wrong triage is caught
rather than silently accepted.

| Seat | Trigger |
|---|---|
| Architect + reuse | Any new module, any new directory, or any change touching more than two existing files. Effectively always. |
| User experience | Any change a user can see, click, or hear read aloud. |
| Data / storage | Anything persisted: a `ta-` localStorage key, a Supabase table, a migration, a file in Storage, or a change to what a persisted shape contains. |
| Visual / aesthetic | Any new surface, or any change to an existing surface's layout, spacing, or colour. |
| Operability and admin | Anything an owner must configure, audit, revoke, or delete. |
| Security | Any new server action, any new network egress, any user- or model-authored text that reaches a prompt or the DOM, any credential path. |
| Reliability | Anything with a failure mode that is not a thrown error: a stream, a long call, a retry, a background job, a resource that must be released. |
| Accessibility | Any change to markup, focus, or keyboard behaviour. Note the ceiling: **no component is rendered by any test here**, so this seat's findings are reading claims, and it must say so. |
| External-facts research | The plan rests on anything outside this repo: a library's behaviour, a platform limit, an API's contract, a browser quirk. |
| Baseline | The area being changed has no coverage in `docs/REGRESSION.md`. Runs BEFORE hand-off, not after. |

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
already covers that area - and check with `grep -a`, because that file contains
a raw NUL byte and plain `grep` reports nothing while exiting cleanly.

**Its checker must ask:** does the baseline describe what the code does, or what
the code is supposed to do? Only the first is a baseline.

---

## Test seat

**Produces:** the oracle - a generator, the axes, and the expected-value table -
plus the notes the implementer writes tests from.

**The axes must come from a different source than the generator.** An oracle
whose generator and expected-value table share the same hardcoded axes has a
branch that can never fire, and it will pass forever.

**Its checker must ask:**
- Can each assertion fail? Name the mutation that breaks it.
- Is coverage a property of construction - a constructor, a type, an enumerated
  product - or a hand-written list that happens to be short?
- Does any assertion read a hardcoded value that the implementation also reads?
- Does any test import a helper from another `*.test.ts`? That re-runs the other
  file's describe blocks. Duplicate instead.
